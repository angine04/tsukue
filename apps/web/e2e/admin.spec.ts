import { expect, test } from "@playwright/test";

/**
 * Admin protection (AGENTS 20.2).
 *
 * The page itself is static and public — what has to hold is that the API
 * behind it refuses everything unauthenticated, because that is where the
 * moderation actions live.
 */
test.describe("the admin API", () => {
  test("refuses an unauthenticated read", async ({ request }) => {
    const response = await request.get("/api/admin/comments?status=pending");
    expect(response.status()).toBe(401);
  });

  test("refuses an unauthenticated mutation", async ({ request }) => {
    // The dangerous shape: a state change, not a read.
    const response = await request.post("/api/admin/comments/anything/delete", {
      headers: { origin: "http://127.0.0.1:8788" },
    });
    expect(response.status()).toBe(401);
  });

  test("refuses a wrong token", async ({ request }) => {
    const response = await request.get("/api/admin/comments?status=pending", {
      headers: { authorization: "Bearer not-the-token" },
    });
    expect(response.status()).toBe(401);
  });

  test("tells the moderator rather than showing an empty queue", async ({
    page,
  }) => {
    await page.goto("/admin");

    // Two elements match: the comment queue and the newsletter panel both
    // report the refusal, which is the point — neither pretends to be empty.
    await expect(page.locator(".admin-error").first()).toContainText(
      /not authorised/i,
      { timeout: 30_000 },
    );
  });
});

test.describe("the admin API, with the configured token", () => {
  test("answers the queue", async ({ request }) => {
    const token = test.info().config.metadata.adminToken as string | undefined;
    test.skip(
      !token,
      "No ADMIN_TOKEN in .dev.vars, so the authenticated path cannot be exercised here.",
    );

    const response = await request.get("/api/admin/comments?status=pending", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      ok: boolean;
      data: { comments: unknown[] };
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.comments)).toBe(true);
  });
});
