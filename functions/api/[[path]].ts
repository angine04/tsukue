import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";

const app = new Hono().basePath("/api");

app.get("/", (c) => {
  return c.json({ message: "Tsukue API" });
});

app.get("/health", (c) => {
  return c.json({ ok: true, status: "healthy" });
});

app.get("/comments", async (c) => {
  return c.json({ ok: true, data: [] });
});

app.post("/comments", async (c) => {
  return c.json({ ok: true, data: { id: "" } });
});

app.get("/admin/comments", async (c) => {
  return c.json({ ok: true, data: [] });
});

app.post("/admin/comments/:id/approve", async (c) => {
  return c.json({ ok: true });
});

app.post("/admin/comments/:id/hide", async (c) => {
  return c.json({ ok: true });
});

app.post("/admin/comments/:id/delete", async (c) => {
  return c.json({ ok: true });
});

app.post("/admin/comments/:id/spam", async (c) => {
  return c.json({ ok: true });
});

app.post("/admin/comments/:id/reply", async (c) => {
  return c.json({ ok: true });
});

app.post("/newsletter/subscribe", async (c) => {
  return c.json({ ok: true });
});

app.post("/newsletter/unsubscribe", async (c) => {
  return c.json({ ok: true });
});

export const onRequest = handle(app);
