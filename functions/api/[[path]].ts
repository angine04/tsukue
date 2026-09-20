import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import {
  createAdminApp,
  createCommentsApp,
  createNewsletterApp,
} from "@tsukue/api";

/**
 * The Pages Functions entry point, and the only file under `functions/` that is
 * allowed to be one: every file here becomes a route, so anything that is not a
 * route lives in a package. The API is `@tsukue/api`, mounted below rather than
 * implemented inline.
 */
const app = new Hono().basePath("/api");

// Answers in the envelope every other endpoint uses (AGENTS 12.3), so a caller
// reads `data` here the same way it does anywhere else.
app.get("/health", (c) =>
  c.json({ ok: true as const, data: { status: "healthy" } }),
);

// Public: reads approved comments, accepts pending submissions.
app.route("/", createCommentsApp());

// Public: double opt-in subscribe, confirm and unsubscribe.
app.route("/", createNewsletterApp());

// Admin: authenticated in the sub-app, so mounting it here cannot expose it.
// Carries both the comment moderation routes and the newsletter ones.
app.route("/", createAdminApp());

export const onRequest = handle(app);
