import { Hono } from "hono";

const app = new Hono();

app.get("/comments", async (c) => {
  return c.json({ ok: true, data: [] });
});

app.post("/comments/:id/approve", async (c) => {
  return c.json({ ok: true });
});

app.post("/comments/:id/hide", async (c) => {
  return c.json({ ok: true });
});

app.post("/comments/:id/delete", async (c) => {
  return c.json({ ok: true });
});

app.post("/comments/:id/spam", async (c) => {
  return c.json({ ok: true });
});

app.post("/comments/:id/reply", async (c) => {
  return c.json({ ok: true });
});

export default app;
