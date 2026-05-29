import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({ ok: true, status: "healthy" });
});

export default app;
