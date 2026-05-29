import { Hono } from "hono";

import comments from "./routes/comments.js";
import admin from "./routes/admin.js";
import newsletter from "./routes/newsletter.js";
import health from "./routes/health.js";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "Angine Blog API" });
});

app.route("/api/comments", comments);
app.route("/api/admin", admin);
app.route("/api/newsletter", newsletter);
app.route("/api/health", health);

export default app;
