import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { createAdminApp, createCommentsApp } from "@tsukue/api";

/**
 * The Pages Functions entry point, and the only file under `functions/` that is
 * allowed to be one: every file here becomes a route, so anything that is not a
 * route lives in a package. The comment API is `@tsukue/api`, mounted
 * below rather than implemented inline.
 */
const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, status: "healthy" }));

// Public: reads approved comments, accepts pending submissions.
app.route("/", createCommentsApp());

// Admin: authenticated in the sub-app, so mounting it here cannot expose it.
app.route("/", createAdminApp());

export const onRequest = handle(app);
