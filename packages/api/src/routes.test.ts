import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv, D1Database } from "./env.js";
import { COMMENT_LIMITS } from "./limits.js";
import { HONEYPOT_FIELD, createCommentsApp } from "./routes.js";

/**
 * A D1 stand-in that records every statement, so a test can assert what a
 * request did to the database — including that it did nothing at all.
 *
 * Reads answer with a count the test picks, because a count is the only shape
 * the pre-insert checks ask for. A statement used the wrong way round throws
 * rather than guessing: an assertion that a rejected request performs no write
 * is worth nothing if the stand-in quietly accepts writes through a read, or
 * the reverse.
 */
function recordingDb(recentCount = 0, options: { comment?: unknown } = {}) {
  const reads: string[] = [];
  const writes: Array<{ sql: string; values: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      const isWrite = /^\s*(insert|update|delete)/i.test(sql);
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              if (isWrite) throw new Error(`first() on a write: ${sql}`);
              reads.push(sql);
              // The one lookup that wants a row rather than a count. Matched on
              // the id, because the rate limit counts rows from the same table.
              if (sql.includes("WHERE id = ?")) {
                return (options.comment ?? null) as T | null;
              }
              return { count: recentCount } as T;
            },
            async all<T>() {
              if (isWrite) throw new Error(`all() on a write: ${sql}`);
              reads.push(sql);
              return { results: [] as T[], success: true };
            },
            async run() {
              if (!isWrite) throw new Error(`run() on a read: ${sql}`);
              writes.push({ sql, values });
              return { results: [], success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, reads, writes };
}

const env = (db: D1Database): ApiEnv => ({
  DB: db,
  HASH_SALT: "test-salt",
  TURNSTILE_SECRET: "test-secret",
});

/** A submission that should be accepted, so a test can vary one field of it. */
const submission = () => ({
  slug: "on-slowness",
  lang: "en",
  authorName: "Ada",
  body: "A comment that a person might write.",
  turnstileToken: "a-token",
});

function post(payload: Record<string, unknown>, db: D1Database) {
  return createCommentsApp().request(
    "/comments",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
        "user-agent": "vitest",
      },
      body: JSON.stringify(payload),
    },
    env(db),
  );
}

/** Makes Turnstile answer `success`, without reaching Cloudflare. */
function stubTurnstile(success: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /comments, when the submission is accepted", () => {
  it("stores exactly one comment, and stores it as pending", async () => {
    stubTurnstile(true);
    const { db, writes } = recordingDb();

    const response = await post(submission(), db);

    expect(response.status).toBe(201);
    expect(writes).toHaveLength(1);
    // An accepted comment is not published; it waits for moderation.
    expect(writes[0].values).toContain("pending");
  });
});

describe("POST /comments, when the honeypot is filled", () => {
  it("writes nothing", async () => {
    const { db, writes, reads } = recordingDb();

    const response = await post(
      { ...submission(), [HONEYPOT_FIELD]: "http://spam.example" },
      db,
    );

    expect(response.status).toBe(201);
    expect(writes).toEqual([]);
    // Not even the rate-limit or duplicate lookups: this branch is reached
    // before Turnstile, and a flood should cost nothing but a log line.
    expect(reads).toEqual([]);
  });

  it("answers exactly as an accepted comment is answered", async () => {
    stubTurnstile(true);

    const accepted = await post(submission(), recordingDb().db);
    const trapped = await post(
      { ...submission(), [HONEYPOT_FIELD]: "http://spam.example" },
      recordingDb().db,
    );

    const acceptedBody = (await accepted.json()) as {
      data: Record<string, unknown>;
    };
    const trappedBody = (await trapped.json()) as {
      data: Record<string, unknown>;
    };

    expect(trapped.status).toBe(accepted.status);
    expect(typeof trappedBody.data.id).toBe(typeof acceptedBody.data.id);
    // A trap that answers differently only works once, so the status a caller
    // reads back must not be the give-away.
    expect(trappedBody.data.status).toBe(acceptedBody.data.status);
    expect(Object.keys(trappedBody.data).sort()).toEqual(
      Object.keys(acceptedBody.data).sort(),
    );
  });
});

describe("POST /comments, when a check rejects the submission", () => {
  it("writes nothing when Turnstile refuses the token", async () => {
    stubTurnstile(false);
    const { db, writes } = recordingDb();

    const response = await post(submission(), db);

    expect(response.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("writes nothing when the same address has posted too often", async () => {
    stubTurnstile(true);
    // At the limit, so the next one is refused.
    const { db, writes } = recordingDb(COMMENT_LIMITS.maxPerWindow);

    const response = await post(submission(), db);

    expect(response.status).toBe(429);
    expect(writes).toEqual([]);
  });

  it("writes nothing when the body carries too many links", async () => {
    stubTurnstile(true);
    const { db, writes } = recordingDb();

    const links = Array.from(
      { length: COMMENT_LIMITS.maxLinks + 1 },
      (_, index) => `https://example.test/${index}`,
    ).join(" ");
    const response = await post({ ...submission(), body: links }, db);

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("POST /comments, when the server is not configured", () => {
  it("writes nothing and does not blame the submitter", async () => {
    const { db, writes } = recordingDb();
    const response = await createCommentsApp().request(
      "/comments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(submission()),
      },
      { DB: db },
    );

    expect(response.status).toBe(500);
    expect(writes).toEqual([]);
  });
});

describe("POST /comments/:id/report", () => {
  const existing = { id: "comment-1", slug: "on-slowness", status: "approved" };

  function flag(db: D1Database, id = "comment-1") {
    return createCommentsApp().request(
      `/comments/${id}/report`,
      {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.7" },
      },
      env(db),
    );
  }

  it("records the flag and answers without saying where the comment stands", async () => {
    const { db, writes } = recordingDb(0, { comment: existing });

    const response = await flag(db);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      data: { status: "reported" },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toContain("comment-1");
  });

  it("stores a hash of the source, never the address it came from", async () => {
    const { db, writes } = recordingDb(0, { comment: existing });

    await flag(db);

    const bound = writes[0].values;
    expect(bound).not.toContain("203.0.113.7");
    expect(
      bound.some((value) => typeof value === "string" && value.length === 64),
    ).toBe(true);
  });

  it("flags nothing that is not there", async () => {
    const { db, writes } = recordingDb();

    const response = await flag(db, "no-such-comment");

    expect(response.status).toBe(404);
    expect(writes).toEqual([]);
  });

  it("stops a source that is flagging everything it can see", async () => {
    const { db, writes } = recordingDb(COMMENT_LIMITS.maxReportsPerWindow, {
      comment: existing,
    });

    const response = await flag(db);

    expect(response.status).toBe(429);
    expect(writes).toEqual([]);
  });

  it("refuses every flag the same way when it cannot hash the source", async () => {
    const { db, writes } = recordingDb(0, { comment: existing });

    const response = await createCommentsApp().request(
      "/comments/comment-1/report",
      { method: "POST", headers: { "cf-connecting-ip": "203.0.113.7" } },
      { DB: db } as ApiEnv,
    );

    expect(response.status).toBe(500);
    expect(writes).toEqual([]);
  });
});
