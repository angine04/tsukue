import { describe, expect, it, vi } from "vitest";
import { COMMENT_LIMITS, countLinks, isOverLinkLimit } from "./limits.js";
import type { D1Database } from "./env.js";
import { countRecentDuplicates, countRecentSubmissions } from "./limits.js";

describe("countLinks", () => {
  it("counts each URL", () => {
    expect(countLinks("one https://a.test two https://b.test")).toBe(2);
  });

  it("does not count a bare domain, because that is a mention and not a link", () => {
    expect(countLinks("see example.com")).toBe(0);
  });

  it("allows exactly the documented number and refuses the next one", () => {
    const atLimit = Array.from(
      { length: COMMENT_LIMITS.maxLinks },
      (_, index) => `https://example.test/${index}`,
    ).join(" ");
    const overLimit = `${atLimit} https://example.test/extra`;

    expect(isOverLinkLimit(atLimit)).toBe(false);
    expect(isOverLinkLimit(overLimit)).toBe(true);
  });
});

/** A D1 stand-in that records the bound values and returns a fixed count. */
function stubDb(count: number) {
  const bind = vi.fn();
  const first = vi.fn().mockImplementation(() => {
    bind("captured");
    return Promise.resolve({ count });
  });
  const bound = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind: bound });
  return {
    db: { prepare } as unknown as D1Database,
    prepare,
    bound,
    first,
  };
}

describe("countRecentSubmissions", () => {
  it("binds the hash and a cutoff that trails the clock by the window", async () => {
    const { db, bound } = stubDb(3);
    const now = new Date("2026-09-19T12:00:00.000Z");

    const count = await countRecentSubmissions(db, "hash", now);

    expect(count).toBe(3);
    const [hash, cutoff] = bound.mock.calls[0];
    expect(hash).toBe("hash");
    expect(cutoff).toBe(
      new Date(
        now.getTime() - COMMENT_LIMITS.windowMinutes * 60_000,
      ).toISOString(),
    );
  });

  it("counts nothing when the table is empty", async () => {
    const { db } = stubDb(0);
    expect(await countRecentSubmissions(db, "hash")).toBe(0);
  });
});

describe("countRecentDuplicates", () => {
  it("compares slug, author and body, and not the body of another post", async () => {
    const { db, bound } = stubDb(1);
    const now = new Date("2026-09-19T12:00:00.000Z");

    const count = await countRecentDuplicates(
      db,
      { slug: "on-slowness", authorName: "Ada", body: "hello" },
      now,
    );

    expect(count).toBe(1);
    const [slug, author, body, cutoff] = bound.mock.calls[0];
    expect([slug, author, body]).toEqual(["on-slowness", "Ada", "hello"]);
    expect(cutoff).toBe(
      new Date(
        now.getTime() - COMMENT_LIMITS.duplicateWindowMinutes * 60_000,
      ).toISOString(),
    );
  });
});
