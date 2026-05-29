import { Hono } from "hono";

const app = new Hono();

app.post("/subscribe", async (c) => {
  return c.json({ ok: true });
});

app.post("/unsubscribe", async (c) => {
  return c.json({ ok: true });
});

export default app;
