import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptEmail } from "../crypto.js";
import type { ApiEnv, D1Database } from "../env.js";
import { notifyReplyAuthor } from "./send.js";

/** A real 32-byte AES key, base64, built rather than pasted. */
const KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)),
);

const endpoint = "https://mail.example.test/send";

/**
 * A real ciphertext, because this path has to decrypt it to find out who to
 * write to — a placeholder string throws, and the test would then be asserting
 * that no mail went out for a reason it was not testing.
 */
let encryptedAddress = "";

beforeAll(async () => {
  encryptedAddress = await encryptEmail("ada@example.test", KEY);
});

/** A parent comment as stored: snake_case, with an encrypted address. */
const parent = (overrides: Record<string, unknown> = {}) => ({
  id: "comment-1",
  slug: "on-slowness",
  lang: "en",
  parent_id: null,
  author_name: "Ada",
  body: "A comment",
  status: "approved",
  created_at: "2026-09-01T00:00:00.000Z",
  author_is_admin: 0,
  author_email_encrypted: encryptedAddress,
  ip_hash: "hash",
  ...overrides,
});

/**
 * A D1 stand-in that answers the two questions this path asks: what is the
 * parent comment, and has this reader opted out. Dispatch is on the table being
 * read, which is the only thing the caller chooses.
 */
function fakeDb(options: { parent?: unknown; optedOut?: boolean } = {}) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          queries.push({ sql, values });
          return {
            async first() {
              if (sql.includes("comment_notification_optouts")) {
                return options.optedOut ? { opted_out: 1 } : null;
              }
              return options.parent ?? null;
            },
            async all() {
              return { results: [], success: true };
            },
            async run() {
              return { results: [], success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, queries };
}

function stubMail(status = 202) {
  const calls: Array<{ url: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("", { status });
    }),
  );
  return calls;
}

const env = (db: D1Database, overrides: Partial<ApiEnv> = {}): ApiEnv => ({
  DB: db,
  HASH_SALT: "test-salt",
  EMAIL_ENCRYPTION_KEY: KEY,
  MAIL_PROVIDER: "http",
  MAIL_ENDPOINT: endpoint,
  MAIL_FROM: "Tsukue <comments@notify.example.test>",
  ...overrides,
});

const reply = {
  id: "reply-1",
  slug: "on-slowness",
  lang: "en",
  parentId: "comment-1",
  authorName: "Angine",
  body: "Thanks for reading.",
};

const mailCalls = (calls: Array<{ url: string; body: string }>) =>
  calls.filter((call) => call.url === endpoint);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notifyReplyAuthor", () => {
  it("tells the parent's author, with both ways out", async () => {
    const calls = stubMail();
    const { db } = fakeDb({ parent: parent() });

    await notifyReplyAuthor(env(db), reply);

    const mail = mailCalls(calls);
    expect(mail).toHaveLength(1);
    const body = JSON.parse(mail[0].body);
    expect(body.to).toBe("ada@example.test");
    expect(body.subject).toContain("on-slowness");
    expect(body.html).toContain("/api/comments/unsubscribe?token=");
    // Thread and blanket are different links, so a reader can leave one
    // conversation without leaving all of them (AGENTS 15.5).
    const tokens = [...body.html.matchAll(/unsubscribe\?token=([^"&]+)/g)].map(
      (match) => match[1],
    );
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(2);
    expect(Object.keys(body.headers).sort()).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ]);
  });

  it("identifies the thread by its root, so a branch does not have its own", async () => {
    stubMail();
    // A reply to a reply: the parent is itself a reply, and the thread it
    // belongs to is the one at the top.
    const { db, queries } = fakeDb({
      parent: parent({ id: "comment-2", parent_id: "comment-1" }),
    });

    await notifyReplyAuthor(env(db), reply);

    const optOutQuery = queries.find((query) =>
      query.sql.includes("comment_notification_optouts"),
    );
    expect(optOutQuery?.values).toEqual([expect.any(String), "comment-1"]);
  });

  it("sends nothing when the reader asked not to be told", async () => {
    const calls = stubMail();
    const { db } = fakeDb({ parent: parent(), optedOut: true });

    await notifyReplyAuthor(env(db), reply);

    expect(mailCalls(calls)).toEqual([]);
  });

  it("sends nothing when the parent left no address", async () => {
    const calls = stubMail();
    const { db } = fakeDb({ parent: parent({ author_email_encrypted: null }) });

    await notifyReplyAuthor(env(db), reply);

    expect(mailCalls(calls)).toEqual([]);
  });

  it("sends nothing for a comment that replies to nobody", async () => {
    const calls = stubMail();
    const { db, queries } = fakeDb({ parent: parent() });

    await notifyReplyAuthor(env(db), { ...reply, parentId: undefined });

    expect(mailCalls(calls)).toEqual([]);
    // Not even a lookup: there is nothing to look up.
    expect(queries).toEqual([]);
  });

  it("sends nothing when mail is not configured, which is a valid state", async () => {
    const calls = stubMail();
    const { db } = fakeDb({ parent: parent() });

    await notifyReplyAuthor(env(db, { MAIL_PROVIDER: undefined }), reply);

    expect(mailCalls(calls)).toEqual([]);
  });

  it("stays quiet when the provider refuses the message", async () => {
    stubMail(500);
    const { db } = fakeDb({ parent: parent() });

    // The reply is already published; failing the request that published it
    // would hide it from the moderator while keeping it in the database.
    await expect(notifyReplyAuthor(env(db), reply)).resolves.toBeUndefined();
  });
});
