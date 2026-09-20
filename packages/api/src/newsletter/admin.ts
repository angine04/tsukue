import {
  LimitQuerySchema,
  SendNewsletterInputSchema,
  SubscriberStatus,
} from "@tsukue/schemas";
import type {
  AdminSubscriber,
  NewsletterSendResult,
  SubscriberStatus as SubscriberStatusValue,
} from "@tsukue/types";
import { newsletterTemplate, unsubscribeHeaders } from "@tsukue/mail";
import type { AdminApp } from "../admin/routes.js";
import { decryptEmail } from "../crypto.js";
import { sendLoggedMail } from "../mail/log.js";
import { insertAuditEntry } from "../store.js";
import { newsletterLink } from "./links.js";
import {
  countSubscribersByStatus,
  listSubscribersByStatus,
  type SubscriberRow,
} from "./store.js";

/**
 * How many subscribers one send reaches in a single request.
 *
 * Bounded by the platform rather than by politeness: a Worker invocation may
 * open 50 subrequests on the free plan, and each message is one. A list larger
 * than this needs a Queue and a consumer — which is the point at which a
 * personal blog has stopped being one.
 */
const SEND_BATCH_LIMIT = 40;

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** `ada@example.com` -> `a***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/**
 * The address, reduced to something a moderator can recognise.
 *
 * Decrypted only in order to be masked, and the mask is all that leaves the
 * server. A list of masked addresses still tells an operator that somebody
 * subscribed and when, without putting every reader's address into a response
 * body, a browser's memory, and whatever sits between them.
 */
async function toAdminSubscriber(
  row: SubscriberRow,
  encryptionKey: string | undefined,
): Promise<AdminSubscriber> {
  let emailMasked = "(unreadable)";
  if (encryptionKey) {
    try {
      emailMasked = maskEmail(
        await decryptEmail(row.email_encrypted, encryptionKey),
      );
    } catch {
      // A rotated key leaves rows it cannot read. Saying so is better than a
      // blank, and much better than failing the whole list over one row.
      emailMasked = "(unreadable)";
    }
  }

  return {
    id: row.id,
    emailMasked,
    status: row.status as SubscriberStatusValue,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at ?? undefined,
    unsubscribedAt: row.unsubscribed_at ?? undefined,
  };
}

/**
 * The newsletter half of the admin API.
 *
 * Registered onto the admin app rather than built as one of its own, so these
 * routes sit behind exactly the authentication and origin checks the comment
 * routes do — there is no second place for that to be got wrong.
 */
export function registerNewsletterAdminRoutes(app: AdminApp): void {
  app.get("/admin/subscribers", async (c) => {
    const parsed = SubscriberStatus.safeParse(
      c.req.query("status") ?? "active",
    );
    if (!parsed.success) {
      return c.json(fail("INVALID_STATUS", "Unknown status filter."), 400);
    }

    const limit = LimitQuerySchema.safeParse(c.req.query("limit") ?? "100");
    if (!limit.success) {
      return c.json(
        fail("INVALID_LIMIT", "The limit must be a small positive number."),
        400,
      );
    }

    const rows = await listSubscribersByStatus(c.env.DB, {
      status: parsed.data,
      limit: limit.data,
    });
    const counts = await countSubscribersByStatus(c.env.DB);

    return c.json({
      ok: true as const,
      data: {
        subscribers: await Promise.all(
          rows.map((row) => toAdminSubscriber(row, c.env.EMAIL_ENCRYPTION_KEY)),
        ),
        counts,
      },
    });
  });

  /**
   * Sends one newsletter to every active subscriber.
   *
   * Deliberately synchronous and bounded: it reports what it did rather than
   * claiming a job was queued, because a template that pretends to have a queue
   * is worse than one that admits the limit. A failure to one address is
   * counted and logged, and does not stop the rest — the common cause is a
   * single bad address, and aborting the send would punish everyone else for it.
   */
  app.post("/admin/newsletter/send", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(fail("INVALID_REQUEST", "Request body must be JSON."), 400);
    }

    const parsed = SendNewsletterInputSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json(
        fail("INVALID_REQUEST", "A subject and a body are both required."),
        400,
      );
    }

    const encryptionKey = c.env.EMAIL_ENCRYPTION_KEY;
    const from = c.env.MAIL_FROM;
    const rows = await listSubscribersByStatus(c.env.DB, {
      status: "active",
      limit: SEND_BATCH_LIMIT,
    });

    if (!encryptionKey || !from) {
      // Recorded, not merely refused: a send that never left is exactly what a
      // moderator goes looking for when nobody received it.
      const reason = "Sending mail is not configured.";
      await sendLoggedMail(c.env, { category: "newsletter", reason });
      console.error(`Newsletter send rejected: ${reason}`);
      return c.json(
        fail("NOT_CONFIGURED", "Sending mail is not configured."),
        500,
      );
    }

    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      const unsubscribeUrl = newsletterLink(
        "/unsubscribe",
        row.unsubscribe_token,
      );

      let to: string;
      try {
        to = await decryptEmail(row.email_encrypted, encryptionKey);
      } catch (error) {
        failed += 1;
        const reason = "The subscriber's address could not be decrypted.";
        await sendLoggedMail(c.env, { category: "newsletter", reason });
        console.error(
          `Newsletter delivery failed for ${row.id}: ${reason}; ${String(error)}`,
        );
        continue;
      }

      const result = await sendLoggedMail(c.env, {
        category: "newsletter",
        message: {
          to,
          from,
          subject: parsed.data.subject,
          html: newsletterTemplate({
            subject: parsed.data.subject,
            body: parsed.data.body,
            unsubscribeUrl,
          }),
          // Both headers, on every newsletter: this is what lets a mailbox
          // provider offer unsubscribe without the reader hunting for a link.
          headers: unsubscribeHeaders(unsubscribeUrl),
        },
      });
      if (result.ok) {
        sent += 1;
      } else {
        failed += 1;
        console.error(
          `Newsletter delivery failed for ${row.id}: ${result.error}`,
        );
      }
    }

    const counts = await countSubscribersByStatus(c.env.DB);
    const result: NewsletterSendResult = {
      sent,
      failed,
      skipped: Math.max(0, (counts.active ?? 0) - rows.length),
    };

    // Recorded like every other moderation action: a send is the one thing an
    // operator can do here that cannot be taken back.
    await insertAuditEntry(c.env.DB, {
      id: crypto.randomUUID(),
      action: "newsletter.send",
      entityType: "newsletter",
      entityId: crypto.randomUUID(),
      actor: c.get("actor"),
      details: `"${parsed.data.subject.slice(0, 120)}": sent ${sent}, failed ${failed}, skipped ${result.skipped}`,
      createdAt: new Date().toISOString(),
    });

    return c.json({ ok: true as const, data: result });
  });
}
