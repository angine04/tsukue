import { Hono } from "hono";
import { SITE_NAME, newsletterResultPath } from "@tsukue/config";
import {
  NewsletterTokenQuerySchema,
  SubscribeInputSchema,
} from "@tsukue/schemas";
import {
  createMailProvider,
  subscriptionConfirmTemplate,
  type MailProvider,
} from "@tsukue/mail";
import type { ApiEnv } from "../env.js";
import {
  encryptEmail,
  hashEmail,
  normaliseEmail,
  randomToken,
} from "../crypto.js";
import { verifyTurnstile } from "../turnstile.js";
import { newsletterLink } from "./links.js";
import { sendLoggedMail } from "../mail/log.js";
import {
  confirmSubscriber,
  getSubscriberByConfirmToken,
  getSubscriberByEmailHash,
  getSubscriberByUnsubscribeToken,
  unsubscribeSubscriber,
  upsertPendingSubscriber,
  type SubscriberRow,
} from "./store.js";

/**
 * How long before a repeat request may send another confirmation email.
 *
 * Without it the form is a way to make this domain send mail to somebody else's
 * address as often as the sender likes. Short enough that a reader who lost the
 * first email can simply ask again.
 */
const CONFIRM_COOLDOWN_MINUTES = 15;

type ErrorCode = "INVALID_REQUEST" | "TURNSTILE_FAILED" | "NOT_CONFIGURED";

function fail(code: ErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

/**
 * The one answer a subscribe request ever gets.
 *
 * Identical for an address that is already subscribed, one that asked a minute
 * ago, and one that is brand new — because the difference between those is
 * precisely what somebody probing this endpoint wants to know.
 */
const ACCEPTED = { ok: true as const, data: { status: "pending" as const } };

/**
 * Stops sending to an address, once.
 *
 * Both unsubscribe routes call this, so a second click — or a mail provider
 * retrying its one-click POST — is a no-op rather than an error.
 */
async function stopSending(
  db: ApiEnv["DB"],
  subscriber: SubscriberRow,
): Promise<void> {
  if (subscriber.status === "unsubscribed") return;
  await unsubscribeSubscriber(db, {
    id: subscriber.id,
    unsubscribedAt: new Date().toISOString(),
  });
}

/**
 * The public newsletter endpoints: subscribe, confirm, leave.
 *
 * Double opt-in throughout (AGENTS 15.6): nothing is ever sent to an address
 * until its owner follows the confirmation link, which is what keeps one person
 * from subscribing another, and what makes the list worth anything.
 */
export function createNewsletterApp() {
  const app = new Hono<{ Bindings: ApiEnv }>();

  app.post("/newsletter/subscribe", async (c) => {
    // Configuration is checked before the address is looked up, so a
    // misconfigured deployment fails identically for every caller rather than
    // only for the ones that would have received mail.
    const salt = c.env.HASH_SALT;
    const encryptionKey = c.env.EMAIL_ENCRYPTION_KEY;
    const from = c.env.MAIL_FROM;
    let provider: MailProvider | undefined;
    try {
      provider = createMailProvider(c.env);
    } catch (error) {
      console.error(`Newsletter subscribe rejected: ${String(error)}`);
    }

    if (
      !salt ||
      !encryptionKey ||
      !from ||
      !provider ||
      !c.env.TURNSTILE_SECRET
    ) {
      console.error(
        "Newsletter subscribe rejected: subscribing is not fully configured.",
      );
      return c.json(
        fail(
          "NOT_CONFIGURED",
          "Subscribing is not available right now. Please try again later.",
        ),
        500,
      );
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(fail("INVALID_REQUEST", "Request body must be JSON."), 400);
    }

    const parsed = SubscribeInputSchema.safeParse(payload);
    if (!parsed.success) {
      return c.json(
        fail("INVALID_REQUEST", "That does not look like an email address."),
        400,
      );
    }

    const turnstile = await verifyTurnstile({
      secret: c.env.TURNSTILE_SECRET,
      token: parsed.data.turnstileToken,
      remoteIp: c.req.header("cf-connecting-ip"),
    });
    if (!turnstile.ok) {
      console.warn(`Turnstile rejected a subscription: ${turnstile.reason}`);
      return c.json(
        fail(
          "TURNSTILE_FAILED",
          "Could not verify that you are human. Please try again.",
        ),
        403,
      );
    }

    const email = normaliseEmail(parsed.data.email);
    const emailHash = await hashEmail(email, salt);
    const existing = await getSubscriberByEmailHash(c.env.DB, emailHash);
    const now = new Date();

    if (existing?.status === "active") {
      return c.json(ACCEPTED, 202);
    }

    const askedRecently =
      existing?.status === "pending" &&
      now.getTime() - Date.parse(existing.created_at) <
        CONFIRM_COOLDOWN_MINUTES * 60_000;
    if (askedRecently) {
      // Sending again this soon is the abuse this endpoint would otherwise
      // offer, so the answer is the same and no mail goes out.
      return c.json(ACCEPTED, 202);
    }

    const confirmToken = randomToken();
    await upsertPendingSubscriber(c.env.DB, {
      id: crypto.randomUUID(),
      emailHash,
      emailEncrypted: await encryptEmail(email, encryptionKey),
      confirmToken,
      unsubscribeToken: randomToken(),
      createdAt: now.toISOString(),
    });

    try {
      await sendLoggedMail(c.env, {
        category: "subscription_confirmation",
        message: {
          to: email,
          from,
          subject: `Confirm your subscription to ${SITE_NAME}`,
          html: subscriptionConfirmTemplate({
            siteName: SITE_NAME,
            confirmUrl: newsletterLink("/confirm", confirmToken),
          }),
        },
      });
    } catch (error) {
      // Logged, not surfaced. The row is stored, the reader can ask again after
      // the cooldown, and an error here would be visible only to callers who
      // are *not* already subscribed — which is the one thing the response is
      // not allowed to reveal.
      console.error(`Confirmation email failed: ${String(error)}`);
    }

    return c.json(ACCEPTED, 202);
  });

  /**
   * The link in the confirmation email.
   *
   * A GET that changes state, which is what every double opt-in link is, and it
   * carries that form's usual caveat: a mail provider that prefetches links to
   * scan them (Outlook, and most corporate filters) confirms on the reader's
   * behalf. Two properties keep that from mattering — the token survives being
   * used, so the reader's own click still reads as success, and only a *pending*
   * subscriber is ever moved, so no link can undo a later unsubscribe.
   */
  app.get("/newsletter/confirm", async (c) => {
    const parsed = NewsletterTokenQuerySchema.safeParse({
      token: c.req.query("token"),
    });
    const token = parsed.success ? parsed.data.token : undefined;
    const subscriber = token
      ? await getSubscriberByConfirmToken(c.env.DB, token)
      : null;
    if (!subscriber) {
      return c.redirect(newsletterResultPath("invalid"), 302);
    }

    // Already confirmed, so this is a second click or a link a mail client
    // fetched before the reader got to it. Either way it reads as success: the
    // token is not consumed precisely so that this is indistinguishable from
    // the first click.
    if (subscriber.status === "active") {
      return c.redirect(newsletterResultPath("confirmed"), 302);
    }

    // Anything else — unsubscribed, bounced, complained — is not pending, and a
    // link from an old email must not put somebody back on a list they left.
    if (subscriber.status !== "pending") {
      return c.redirect(newsletterResultPath("invalid"), 302);
    }

    await confirmSubscriber(c.env.DB, {
      id: subscriber.id,
      confirmedAt: new Date().toISOString(),
    });
    return c.redirect(newsletterResultPath("confirmed"), 302);
  });
  app.get("/newsletter/unsubscribe", async (c) => {
    const parsed = NewsletterTokenQuerySchema.safeParse({
      token: c.req.query("token"),
    });
    const token = parsed.success ? parsed.data.token : undefined;
    const subscriber = token
      ? await getSubscriberByUnsubscribeToken(c.env.DB, token)
      : null;
    if (!subscriber) {
      return c.redirect(newsletterResultPath("invalid"), 302);
    }

    await stopSending(c.env.DB, subscriber);
    return c.redirect(newsletterResultPath("unsubscribed"), 302);
  });

  /**
   * One-click unsubscribe (RFC 8058), which is what `List-Unsubscribe-Post`
   * promises a mailbox provider. It arrives cross-origin with no user present,
   * so it cannot require a challenge, an origin check, or a body it has to
   * parse — the token in the URL is the entire authority.
   */
  app.post("/newsletter/unsubscribe", async (c) => {
    const parsed = NewsletterTokenQuerySchema.safeParse({
      token: c.req.query("token"),
    });
    const token = parsed.success ? parsed.data.token : undefined;
    const subscriber = token
      ? await getSubscriberByUnsubscribeToken(c.env.DB, token)
      : null;
    if (!subscriber) {
      return c.json(
        fail("INVALID_REQUEST", "That unsubscribe link is no longer valid."),
        404,
      );
    }

    await stopSending(c.env.DB, subscriber);
    return c.json({ ok: true as const, data: { status: "unsubscribed" } });
  });

  return app;
}
