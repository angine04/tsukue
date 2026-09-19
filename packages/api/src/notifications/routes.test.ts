import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv, D1Database } from "../env.js";
import { createCommentsApp } from "../routes.js";
import { optOutToken } from "./tokens.js";

const SALT = "test-salt";

/** A D1 stand-in that records every statement, so a test can see what was written. */
function fakeDb() {
  const writes: Array<{ sql: string; values: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              return null;
            },
            async all() {
              return { results: [], success: true };
            },
            async run() {
              writes.push({ sql, values });
              return { results: [], success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, writes };
}

const env = (db: D1Database): ApiEnv => ({ DB: db, HASH_SALT: SALT });

const threadToken = () =>
  optOutToken(
    { emailHash: "abc123", scope: "thread", threadId: "comment-1" },
    SALT,
  );

const allToken = () =>
  optOutToken({ emailHash: "abc123", scope: "all", threadId: "" }, SALT);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /comments/unsubscribe", () => {
  it("records a thread opt-out and sends the reader to the receipt", async () => {
    const { db, writes } = fakeDb();

    const response = await createCommentsApp().request(
      `/comments/unsubscribe?token=${await threadToken()}`,
      undefined,
      env(db),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/comments/unsubscribed");
    expect(writes).toHaveLength(1);
    // scope and thread are bound, so the row can only mean one conversation.
    expect(writes[0].values).toContain("thread");
    expect(writes[0].values).toContain("comment-1");
  });

  it("records a blanket opt-out", async () => {
    const { db, writes } = fakeDb();

    await createCommentsApp().request(
      `/comments/unsubscribe?token=${await allToken()}`,
      undefined,
      env(db),
    );

    expect(writes).toHaveLength(1);
    expect(writes[0].values).toContain("all");
    expect(writes[0].values).toContain("");
  });

  it("writes nothing and says so when the token is not ours", async () => {
    const { db, writes } = fakeDb();

    const response = await createCommentsApp().request(
      "/comments/unsubscribe?token=not-a-token",
      undefined,
      env(db),
    );

    expect(response.headers.get("location")).toBe("/comments/invalid");
    expect(writes).toEqual([]);
  });

  it("writes nothing when the deployment has no salt to check with", async () => {
    const { db, writes } = fakeDb();

    const response = await createCommentsApp().request(
      `/comments/unsubscribe?token=${await allToken()}`,
      undefined,
      { DB: db } as ApiEnv,
    );

    expect(response.headers.get("location")).toBe("/comments/invalid");
    expect(writes).toEqual([]);
  });
});

describe("POST /comments/unsubscribe", () => {
  it("accepts the one-click a mailbox provider sends", async () => {
    const { db, writes } = fakeDb();

    const response = await createCommentsApp().request(
      `/comments/unsubscribe?token=${await allToken()}`,
      { method: "POST", body: "List-Unsubscribe=One-Click" },
      env(db),
    );

    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
  });

  it("answers 200 for a token that was already used, because providers retry", async () => {
    const { db } = fakeDb();
    const token = await allToken();

    const first = await createCommentsApp().request(
      `/comments/unsubscribe?token=${token}`,
      { method: "POST" },
      env(db),
    );
    const second = await createCommentsApp().request(
      `/comments/unsubscribe?token=${token}`,
      { method: "POST" },
      env(db),
    );

    // The insert ignores duplicates, so a repeat is a no-op rather than an
    // error — a provider that gets a 4xx will try again.
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("refuses a token that is not ours", async () => {
    const { db, writes } = fakeDb();

    const response = await createCommentsApp().request(
      "/comments/unsubscribe?token=not-a-token",
      { method: "POST" },
      env(db),
    );

    expect(response.status).toBe(404);
    expect(writes).toEqual([]);
  });
});
