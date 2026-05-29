import { Hono } from "hono";

const app = new Hono();

app.get("/", async (c) => {
  return c.json({ ok: true, data: [] });
});

app.post("/", async (c) => {
  return c.json({ ok: true, data: { id: "" } });
});

export default app;
