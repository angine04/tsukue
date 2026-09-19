import { Hono } from "hono";
import { CommentQuerySchema, CreateCommentSchema } from "@tsukue/schemas";
import { adminNotificationTemplate, createMailProvider } from "@tsukue/mail";
import type { PublicCommentThread } from "@tsukue/types";
import { encryptEmail, hashEmail, hashIdentifier } from "./crypto.js";
import type { CommentEnv } from "./env.js";
import {
  COMMENT_LIMITS,
  countRecentDuplicates,
  countRecentSubmissions,
  isOverLinkLimit,
} from "./limits.js";
import {
  insertComment,
  listApprovedComments,
  resolveReplyParent,
  toPublicComment,
} from "./store.js";
import { verifyTurnstile } from "./turnstile.js";

/**
 * The honeypot field. A real form leaves it empty; a bot filling every input it
 * finds does not. Deliberately not in the Zod schema — a schema failure naming
 * the field would tell the bot which one to leave alone.
 */
const HONEYPOT_FIELD = "website";

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_COMMENT_BODY"
  | "COMMENT_TOO_LONG"
  | "TOO_MANY_LINKS"
  | "TURNSTILE_FAILED"
  | "RATE_LIMITED"
  | "DUPLICATE_COMMENT"
  | "NOT_CONFIGURED";

function fail(code: ErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Shared so the two error responses below cannot drift in wording. */
const NOT_CONFIGURED_MESSAGE =
  "Comments are not available right now. Please try again later.";

export function createCommentsApp() {
  const app = new Hono<{ Bindings: CommentEnv }>();

  /**
   * Approved comments for one post, threaded one level deep.
   *
   * This handler only shapes the response. What is public is decided by
   * `listApprovedComments`, whose SQL filters on status — nothing downstream
   * gets a chance to publish a pending comment by forgetting a check.
   */
  app.get("/comments", async (c) => {
    const parsed = CommentQuerySchema.safeParse({
      slug: c.req.query("slug"),
      lang: c.req.query("lang") || undefined,
    });

    if (!parsed.success) {
      return c.json(fail("INVALID_REQUEST", "A post slug is required."), 400);
    }

    const rows = await listApprovedComments(c.env.DB, parsed.data);

    const threads: PublicCommentThread[] = [];
    const byParent = new Map<string, PublicCommentThread>();

    for (const row of rows) {
      const comment = toPublicComment(row);
      const parent = comment.parentId
        ? byParent.get(comment.parentId)
        : undefined;

      if (parent) {
        parent.replies.push(comment);
        continue;
      }

      // Either a top-level comment, or a reply whose parent is not approved.
      // A detached reply is shown as a thread of its own rather than dropped:
      // the author wrote something, and hiding it would look like it was
      // rejected when it was only its parent that was.
      const thread: PublicCommentThread = { comment, replies: [] };
      threads.push(thread);
      byParent.set(comment.id, thread);
    }

    const total = threads.reduce(
      (count, thread) => count + 1 + thread.replies.length,
      0,
    );

    return c.json({ ok: true as const, data: { threads, total } });
  });

  /**
   * Accepts a comment, from a person or otherwise. Everything is stored
   * `pending` (AGENTS 14: no auto-publish in v1), so the most a passing spam
   * can do is appear in a moderation queue.
   */
  app.post("/comments", async (c) => {
    // Configuration that the request cannot supply. Both are checked before
    // anything else, because a missing secret is our fault and should read as
    // a server problem rather than as the submitter failing a challenge.
    const salt = c.env.HASH_SALT;
    if (!salt || !c.env.TURNSTILE_SECRET) {
      console.error(
        "Comment submission rejected: HASH_SALT or TURNSTILE_SECRET is not configured.",
      );
      return c.json(fail("NOT_CONFIGURED", NOT_CONFIGURED_MESSAGE), 500);
    }

    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(fail("INVALID_REQUEST", "Request body must be JSON."), 400);
    }

    const parsed = CreateCommentSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === "body") {
        const tooLong = issue.code === "too_big";
        return c.json(
          fail(
            tooLong ? "COMMENT_TOO_LONG" : "INVALID_COMMENT_BODY",
            tooLong
              ? `Comment body must be at most ${COMMENT_LIMITS.body.max} characters.`
              : "Comment body is required.",
          ),
          400,
        );
      }
      return c.json(
        fail("INVALID_REQUEST", "Check the submitted fields and try again."),
        400,
      );
    }

    const input = parsed.data;
    const now = new Date();
    const ip = c.req.header("cf-connecting-ip");
    const userAgent = c.req.header("user-agent");

    const storage = {
      id: crypto.randomUUID(),
      slug: input.slug,
      lang: input.lang,
      authorName: input.authorName,
      body: input.body,
      createdAt: now.toISOString(),
      ipHash: ip ? await hashIdentifier(ip, salt) : undefined,
      userAgentHash: userAgent
        ? await hashIdentifier(userAgent, salt)
        : undefined,
      authorEmailHash: input.authorEmail
        ? await hashEmail(input.authorEmail, salt)
        : undefined,
      authorEmailEncrypted:
        input.authorEmail && c.env.EMAIL_ENCRYPTION_KEY
          ? await encryptEmail(input.authorEmail, c.env.EMAIL_ENCRYPTION_KEY)
          : undefined,
    };

    // The honeypot is checked first and short-circuits everything else: a bot
    // that filled it never loaded the widget, so asking Turnstile about it
    // would only add a delay that distinguishes this path from a success.
    // Stored as spam so the queue shows what arrived, and answered exactly like
    // a comment that was accepted.
    const honeypot = (payload as Record<string, unknown>)[HONEYPOT_FIELD];
    if (typeof honeypot === "string" && honeypot.trim() !== "") {
      await insertComment(c.env.DB, { ...storage, status: "spam" });
      return c.json(
        { ok: true as const, data: { id: storage.id, status: "spam" } },
        201,
      );
    }

    const turnstile = await verifyTurnstile({
      secret: c.env.TURNSTILE_SECRET,
      token: input.turnstileToken,
      remoteIp: ip,
    });
    if (!turnstile.ok) {
      console.warn(`Turnstile rejected a comment: ${turnstile.reason}`);
      return c.json(
        fail(
          "TURNSTILE_FAILED",
          "Could not verify that you are human. Please try again.",
        ),
        403,
      );
    }

    if (isOverLinkLimit(input.body)) {
      return c.json(
        fail(
          "TOO_MANY_LINKS",
          `Comments may contain at most ${COMMENT_LIMITS.maxLinks} links.`,
        ),
        400,
      );
    }

    if (storage.ipHash) {
      const recent = await countRecentSubmissions(
        c.env.DB,
        storage.ipHash,
        now,
      );
      if (recent >= COMMENT_LIMITS.maxPerWindow) {
        return c.json(
          fail(
            "RATE_LIMITED",
            "Too many comments from here in a short time. Please try again later.",
          ),
          429,
        );
      }
    }

    const duplicates = await countRecentDuplicates(
      c.env.DB,
      { slug: input.slug, authorName: input.authorName, body: input.body },
      now,
    );
    if (duplicates > 0) {
      return c.json(
        fail("DUPLICATE_COMMENT", "That comment has already been submitted."),
        409,
      );
    }

    let parentId: string | undefined;
    if (input.parentId) {
      const resolved = await resolveReplyParent(c.env.DB, {
        parentId: input.parentId,
        slug: input.slug,
      });
      if (!resolved) {
        return c.json(
          fail("INVALID_REQUEST", "That comment is no longer available."),
          400,
        );
      }
      parentId = resolved;
    }

    await insertComment(c.env.DB, { ...storage, parentId, status: "pending" });
    await notifyAdmin(c.env, {
      commentAuthor: input.authorName,
      commentBody: input.body,
      postSlug: input.slug,
    });

    return c.json(
      { ok: true as const, data: { id: storage.id, status: "pending" } },
      201,
    );
  });

  return app;
}

/**
 * Tells the moderator that something is waiting.
 *
 * Never throws. The comment is stored before this runs, and a mail failure that
 * turned a stored comment into a 500 would hide it from the author while
 * keeping it in the database — the worst of both.
 */
async function notifyAdmin(
  env: CommentEnv,
  comment: { commentAuthor: string; commentBody: string; postSlug: string },
): Promise<void> {
  if (!env.ADMIN_EMAIL) return;

  let provider;
  try {
    provider = createMailProvider(env);
  } catch (error) {
    console.error(`Admin notification skipped: ${String(error)}`);
    return;
  }
  if (!provider) return;

  try {
    await provider.send({
      to: env.ADMIN_EMAIL,
      from: env.MAIL_FROM ?? env.ADMIN_EMAIL,
      subject: `New comment on ${comment.postSlug}`,
      html: adminNotificationTemplate({ ...comment, adminUrl: "/admin" }),
    });
  } catch (error) {
    console.error(`Admin notification failed: ${String(error)}`);
  }
}
