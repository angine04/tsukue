import { expect, test } from "@playwright/test";

/**
 * The comment form (AGENTS 20.2).
 *
 * It needs the local API and a Turnstile site key; with the documented test key
 * the widget solves itself, which is what lets a submission be exercised
 * without a person in the loop.
 */
test.describe("the comment form", () => {
  test("will not submit an empty one", async ({ page }) => {
    await page.goto("/on-slowness");

    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();

    // The browser's own validation is the first line, and it should have
    // stopped this before anything reached the API.
    const nameIsMissing = await page
      .locator("#comment-name")
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing);
    expect(nameIsMissing).toBe(true);
    await expect(page.locator("form [data-status]")).toHaveCount(0);
  });

  test("stores a submission as awaiting review", async ({ page }) => {
    await page.goto("/on-slowness");

    // A unique body every run: the API refuses an identical comment from the
    // same author on the same post within the hour, which is correct behaviour
    // and would otherwise make the second run of this suite fail. Note also
    // that submissions are rate-limited per source — five in ten minutes — so
    // running this suite back to back will eventually trip that instead.
    await page.fill("#comment-name", "Ada");
    await page.fill(
      "#comment-body",
      `A comment from the end-to-end suite at ${new Date().toISOString()}.`,
    );
    const submit = page.locator('form button[type="submit"]');
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();

    // Not "posted": nothing is published until a moderator approves it, and the
    // reader is told exactly that.
    const status = page.locator("form [data-status]");
    await expect(status).toHaveAttribute("data-status", "posted", {
      timeout: 30_000,
    });
    await expect(status).toContainText(/waiting/i);
  });
});
