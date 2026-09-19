import { Hono } from "hono";
import { AUTHOR_NAME } from "@tsukue/config";
import { CommentStatus } from "@tsukue/schemas";
import type { CommentStatus as CommentStatusValue } from "@tsukue/types";
import { authenticateAdmin, isSameOrigin, type AdminAuthEnv } from "./auth.js";
import {
  countByStatus,
  getComment,
  insertAuditEntry,
  insertComment,
  listAuditEntries,
  listCommentsByStatus,
  resolveReplyParent,
  setCommentStatus,
} from "../store.js";

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

const REPLY_MAX_LENGTH = 4000;

function fail(code: string, message: string) {
  return { ok: false as const, error: { code, message } };
}

/** Set by the auth middleware and read by the handlers that audit. */
interface AdminVariables {
  actor: string;
}

export function createAdminApp() {
  const app = new Hono<{ Bindings: AdminAuthEnv; Variables: AdminVariables }>();

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

    const limit = Number.parseInt(c.req.query("limit") ?? "100", 10);
    const comments = await listCommentsByStatus(c.env.DB, {
      status: parsed.data,
      limit: Number.isNaN(limit) ? 100 : limit,
    });

    return c.json({ ok: true as const, data: { comments } });
  });

  app.get("/admin/stats", async (c) => {
    const counts = await countByStatus(c.env.DB);
    const audit = await listAuditEntries(c.env.DB, 20);
    return c.json({ ok: true as const, data: { counts, audit } });
  });

  /**
   * One handler for approve/hide/delete/spam rather than four near-identical
   * ones: the only difference is the target status, and four copies is four
   * places to forget the audit entry.
   */
  for (const [action, config] of Object.entries(ACTIONS)) {
    app.post(`/admin/comments/:id/${action}`, async (c) => {
      const id = c.req.param("id");
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

    const body = (payload as { body?: unknown })?.body;
    if (typeof body !== "string" || body.trim() === "") {
      return c.json(
        fail("INVALID_COMMENT_BODY", "Reply body is required."),
        400,
      );
    }
    if (body.length > REPLY_MAX_LENGTH) {
      return c.json(
        fail(
          "COMMENT_TOO_LONG",
          `Reply must be at most ${REPLY_MAX_LENGTH} characters.`,
        ),
        400,
      );
    }

    const id = c.req.param("id");
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
      body: body.trim(),
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

    return c.json(
      { ok: true as const, data: { id: replyId, status: "approved" } },
      201,
    );
  });

  return app;
}
