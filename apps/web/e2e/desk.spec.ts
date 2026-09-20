import { expect, test } from "@playwright/test";

/**
 * The desk, as a reader meets it (AGENTS 20.2).
 *
 * These are the interactions the homepage is: a rail of cards, one of them
 * focused, and a focused card that opens into the article rather than
 * navigating away from it.
 */
test.describe("the desk", () => {
  test("shows the rail with exactly one focused card", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".desk-rail")).toBeVisible();
    expect(await page.locator(".desk-card").count()).toBeGreaterThan(1);
    // One, not zero and not two: the rail's whole behaviour depends on there
    // being a single card the keyboard acts on.
    await expect(page.locator('.desk-card[aria-current="true"]')).toHaveCount(
      1,
    );
  });

  test("moves the focus with the arrow keys", async ({ page }) => {
    await page.goto("/");

    const focused = page.locator('.desk-card[aria-current="true"]');
    const before = await focused.getAttribute("href");

    await page.locator(".desk-card").first().focus();
    await page.keyboard.press("ArrowRight");

    await expect.poll(() => focused.getAttribute("href")).not.toBe(before);
  });

  test("opens the focused card into a sheet, and Escape closes it", async ({
    page,
  }) => {
    await page.goto("/");

    await page.locator(".desk-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".article-sheet-overlay")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".article-sheet-overlay")).toHaveCount(0);
  });

  test("Back collapses the article and Forward brings it back", async ({
    page,
  }) => {
    await page.goto("/");

    await page.locator(".desk-card").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".article-sheet-overlay")).toBeVisible();
    // Opening a card is a navigation, so the browser's own history is the
    // thing that has to stay honest (AGENTS 9.3).
    const openedUrl = page.url();
    expect(openedUrl).not.toBe(new URL("/", openedUrl).toString());

    await page.goBack();
    await expect(page.locator(".article-sheet-overlay")).toHaveCount(0);

    await page.goForward();
    await expect(page.locator(".article-sheet-overlay")).toBeVisible();
  });
});

test.describe("a direct article route", () => {
  test("renders without the homepage having been visited", async ({ page }) => {
    // Straight to the article: nothing about this visit comes from the desk.
    await page.goto("/on-slowness");

    await expect(page.locator("article h1")).toContainText(/slowness/i);
    await expect(page.locator(".desk-rail")).toBeVisible();
  });

  test("is readable with no JavaScript at all", async ({ request }) => {
    // The requirement is AGENTS 3.1, and the only way to test it is to look at
    // what the server sends rather than at what a browser makes of it.
    const response = await request.get("/on-slowness");
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain("<article");
    expect(html).toMatch(/<h1[^>]*>\s*On Slowness/);
    // The sheet the island adopts is real markup, not a placeholder it fills in.
    expect(html).toContain("data-sheet-fallback");
  });
});
