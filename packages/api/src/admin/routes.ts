import { Hono } from "hono";
import {
  AdminReplyInputSchema,
  CommentIdSchema,
  CommentStatus,
  COMMENT_REPLY_MAX_LENGTH,
  LimitQuerySchema,
} from "@tsukue/schemas";
import type { CommentStatus as CommentStatusValue } from "@tsukue/types";
import { AUTHOR_NAME } from "@tsukue/config";
import { authenticateAdmin, isSameOrigin, type AdminAuthEnv } from "./auth.js";
import { notifyReplyAuthor } from "../notifications/send.js";
import { registerNewsletterAdminRoutes } from "../newsletter/admin.js";
import {
  attachReportCounts,
  countByStatus,
  countReportedComments,
  getComment,
  insertAuditEntry,
  listReportedComments,
  insertComment,
  listAuditEntries,
  listCommentsByStatus,
  resolveReplyParent,
  setCommentStatus,
} from "../store.js";
import { countMailSendLogsByStatus, listMailSendLogs } from "../mail/log.js";

/**
 * What a moderator may do. Each maps to a status the public listing filters
 * out, except `approve` — and `delete` is soft, so a reply keeps its parent
 * and a mis-click is recoverable (AGENTS 13.1).
 */
const ACTIONS: Record<
  string,
  { status: CommentStatusValue; audit: string; describe: string }
> = {
  approve: {
    status: "approved",
    audit: "comment.approve",
    describe: "approved",
  },
  hide: { status: "hidden", audit: "comment.hide", describe: "hidden" },
  delete: { status: "deleted", audit: "comment.delete", describe: "deleted" },
  spam: { status: "spam", audit: "comment.spam", describe: "marked as spam" },
};

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Set by the auth middleware and read by the handlers that audit. */
export interface AdminVariables {
  actor: string;
}

/**
 * The admin app's context, named so the newsletter routes can be registered
 * onto it from their own module and inherit the authentication and origin
 * checks declared here.
 */
export type AdminApp = Hono<{
  Bindings: AdminAuthEnv;
  Variables: AdminVariables;
}>;

export function createAdminApp() {
  const app: AdminApp = new Hono<{
    Bindings: AdminAuthEnv;
    Variables: AdminVariables;
  }>();

  /**
   * Every route below is behind this. Applied as middleware rather than
   * repeated in each handler, because the failure mode of forgetting it in one
   * handler is an unauthenticated delete.
   */
  app.use("/admin/*", async (c, next) => {
    const auth = await authenticateAdmin(c.req, c.env);
    if (!auth.ok) {
      // The reason is for the operator, not the caller: it names which
      // environment variable is missing, which is not information to hand out.
      console.warn(`Admin request refused: ${auth.reason}`);
      return c.json(fail("UNAUTHORIZED", "Not authorised."), auth.status);
    }
    c.set("actor", auth.actor);
    await next();
  });

  /**
   * Mutations additionally require that the request came from this site.
   * Access authenticates with a cookie and browsers attach cookies to requests
   * they make on other sites' behalf, so without this a page on another origin
   * could drive the moderation API.
   */
  app.use("/admin/*", async (c, next) => {
    if (c.req.method === "GET") return next();
    const sameOrigin = isSameOrigin(c.req, c.req.url);
    if (!sameOrigin.ok) {
      console.warn(`Admin mutation refused: ${sameOrigin.reason}`);
      return c.json(
        fail("FORBIDDEN_ORIGIN", "Request came from elsewhere."),
        403,
      );
    }
    return next();
  });

  app.get("/admin/comments", async (c) => {
    const parsed = CommentStatus.safeParse(c.req.query("status") ?? "pending");
    if (!parsed.success) {
      return c.json(fail("INVALID_STATUS", "Unknown status filter."), 400);
    }

    const parsedLimit = LimitQuerySchema.safeParse(c.req.query("limit"));
    if (!parsedLimit.success) {
      return c.json(
        fail("INVALID_LIMIT", "Limit must be between 1 and 200."),
        400,
      );
    }

    const comments = await attachReportCounts(
      c.env.DB,
      await listCommentsByStatus(c.env.DB, {
        status: parsed.data,
        limit: parsedLimit.data,
      }),
    );

    return c.json({ ok: true as const, data: { comments } });
  });

  /**
   * Comments readers have flagged, most recently flagged first.
   *
   * Its own listing rather than a tab on the queue: a report is a signal about
   * a comment, not a stage in its life, so a reported comment may be sitting in
   * any tab — and looking for it there is how a report gets missed.
   */
  app.get("/admin/reports", async (c) => {
    const parsedLimit = LimitQuerySchema.safeParse(c.req.query("limit"));
    if (!parsedLimit.success) {
      return c.json(
        fail("INVALID_LIMIT", "Limit must be between 1 and 200."),
        400,
      );
    }

    const comments = await listReportedComments(c.env.DB, parsedLimit.data);
    return c.json({ ok: true as const, data: { comments } });
  });

  /**
   * What the mail layer has tried to send, newest first, with the counts the
   * panel beside it shows.
   *
   * A failure is kept rather than retried away, because the question a moderator
   * arrives with is "did that go out?" — a reader who never received a
   * confirmation link cannot confirm, and this is where that shows.
   */
  app.get("/admin/mail-logs", async (c) => {
    const limit = LimitQuerySchema.safeParse(c.req.query("limit") ?? "50");
    if (!limit.success) {
      return c.json(
        fail("INVALID_LIMIT", "The limit must be a small positive number."),
        400,
      );
    }

    const [logs, counts] = await Promise.all([
      listMailSendLogs(c.env.DB, limit.data),
      countMailSendLogsByStatus(c.env.DB),
    ]);

    return c.json({ ok: true as const, data: { logs, counts } });
  });

  app.get("/admin/stats", async (c) => {
    const counts = await countByStatus(c.env.DB);
    const reported = await countReportedComments(c.env.DB);
    const audit = await listAuditEntries(c.env.DB, 20);
    return c.json({ ok: true as const, data: { counts, reported, audit } });
  });

  /**
   * One handler for approve/hide/delete/spam rather than four near-identical
   * ones: the only difference is the target status, and four copies is four
   * places to forget the audit entry.
   */
  for (const [action, config] of Object.entries(ACTIONS)) {
    app.post(`/admin/comments/:id/${action}`, async (c) => {
      const parsedId = CommentIdSchema.safeParse(c.req.param("id"));
      if (!parsedId.success) {
        return c.json(
          fail("INVALID_REQUEST", "That comment id is invalid."),
          400,
        );
      }

      const id = parsedId.data;
      const actor = c.get("actor");

      const existing = await getComment(c.env.DB, id);
      if (!existing) {
        return c.json(fail("COMMENT_NOT_FOUND", "No such comment."), 404);
      }

      const now = new Date().toISOString();
      await setCommentStatus(c.env.DB, {
        id,
        status: config.status,
        updatedAt: now,
      });

      // Approving a reader's reply is the other moment a reply becomes public.
      // Only on the transition: a second click, or an approve of something
      // already approved, must not post the same notification twice.
      if (
        config.status === "approved" &&
        existing.parent_id &&
        existing.status !== "approved"
      ) {
        await notifyReplyAuthor(c.env, {
          id,
          slug: existing.slug,
          lang: existing.lang ?? undefined,
          parentId: existing.parent_id,
          authorName: existing.author_name,
          body: existing.body,
        });
      }
      await insertAuditEntry(c.env.DB, {
        id: crypto.randomUUID(),
        action: config.audit,
        entityType: "comment",
        entityId: id,
        actor,
        details: `from ${existing.status} to ${config.status}`,
        createdAt: now,
      });

      return c.json({
        ok: true as const,
        data: {
          id,
          status: config.status,
          message: `Comment ${config.describe}.`,
        },
      });
    });
  }

  /**
   * Publishes a reply as the site's author.
   *
   * Approved on creation, unlike a reader's comment: moderation exists to vet
   * strangers, and routing the author's own words through it would mean they
   * appear only after the author approves themselves.
   */
  app.post("/admin/comments/:id/reply", async (c) => {
    let payload: unknown;
    try {
      payload = await c.req.json();
    } catch {
      return c.json(fail("INVALID_REQUEST", "Request body must be JSON."), 400);
    }

    const parsed = AdminReplyInputSchema.safeParse(payload);
    if (!parsed.success) {
      const tooLong = parsed.error.issues[0]?.code === "too_big";
      return c.json(
        fail(
          tooLong ? "COMMENT_TOO_LONG" : "INVALID_COMMENT_BODY",
          tooLong
            ? `Reply must be at most ${COMMENT_REPLY_MAX_LENGTH} characters.`
            : "Reply body is required.",
        ),
        400,
      );
    }

    const parsedId = CommentIdSchema.safeParse(c.req.param("id"));
    if (!parsedId.success) {
      return c.json(
        fail("INVALID_REQUEST", "That comment id is invalid."),
        400,
      );
    }

    const body = parsed.data.body;
    const id = parsedId.data;
    const actor = c.get("actor");
    const parent = await getComment(c.env.DB, id);
    if (!parent) {
      return c.json(fail("COMMENT_NOT_FOUND", "No such comment."), 404);
    }

    // Reuse the same resolution as a reader reply, so the depth stays one level
    // however the reply was written.
    const rootId = await resolveReplyParent(c.env.DB, {
      parentId: id,
      slug: parent.slug,
    });

    const now = new Date().toISOString();
    const replyId = crypto.randomUUID();

    await insertComment(c.env.DB, {
      id: replyId,
      slug: parent.slug,
      lang: parent.lang ?? undefined,
      parentId: rootId ?? id,
      authorName: AUTHOR_NAME,
      body,
      status: "approved",
      createdAt: now,
      authorIsAdmin: true,
    });

    await insertAuditEntry(c.env.DB, {
      id: crypto.randomUUID(),
      action: "comment.reply",
      entityType: "comment",
      entityId: id,
      actor,
      details: `reply ${replyId}`,
      createdAt: now,
    });

    // Published on creation, so this is the moment its author can be told.
    // Awaited rather than fired off, matching how a submitted comment notifies
    // the moderator: one way to do it, and the reply is already stored either
    // way — the notification never throws.
    await notifyReplyAuthor(c.env, {
      id: replyId,
      slug: parent.slug,
      lang: parent.lang ?? undefined,
      parentId: rootId ?? id,
      authorName: AUTHOR_NAME,
      body,
    });

    return c.json(
      { ok: true as const, data: { id: replyId, status: "approved" } },
      201,
    );
  });

  // Subscriber management and sending live with the rest of the newsletter code
  // and are registered onto this app, so they cannot drift out from behind the
  // middleware above.
  registerNewsletterAdminRoutes(app);

  return app;
}
