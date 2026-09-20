import { describe, expect, it } from "vitest";
import { COMMENT_REPLY_MAX_LENGTH } from "@tsukue/schemas";
import { createAdminApp } from "./routes.js";
import type { AdminAuthEnv } from "./auth.js";

const env = { ADMIN_TOKEN: "admin-token" } as AdminAuthEnv;
const headers = { Authorization: "Bearer admin-token" };

function request(path: string, init?: RequestInit) {
  return createAdminApp().request(path, { headers, ...init }, env);
}

describe("admin request validation", () => {
  it("rejects a list limit beyond the store bound", async () => {
    const response = await request("/admin/comments?limit=201");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_LIMIT",
        message: "Limit must be between 1 and 200.",
      },
    });
  });

  it("rejects an empty reply body", async () => {
    const response = await request("/admin/comments/comment-1/reply", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_COMMENT_BODY",
        message: "Reply body is required.",
      },
    });
  });

  it("rejects a reply body beyond its bound", async () => {
    const response = await request("/admin/comments/comment-1/reply", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ body: "x".repeat(COMMENT_REPLY_MAX_LENGTH + 1) }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "COMMENT_TOO_LONG",
        message: `Reply must be at most ${COMMENT_REPLY_MAX_LENGTH} characters.`,
      },
    });
  });
});
