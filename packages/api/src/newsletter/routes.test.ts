import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv, D1Database } from "../env.js";
import { createNewsletterApp } from "./routes.js";

/**
 * A real 32-byte AES key, base64 — built rather than pasted, because a pasted
 * key of the wrong length fails inside `atob` and reads as a broken test rather
 * than a broken key.
 */
const KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)),
);

const endpoint = "https://mail.example.test/send";

/** A stored subscriber row, in the snake_case the table uses. */
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "subscriber-1",
  email_encrypted: "ciphertext",
  email_hash: "hash",
  status: "pending",
  confirm_token: "confirm-token",
  unsubscribe_token: "unsubscribe-token",
  created_at: new Date().toISOString(),
  confirmed_at: null,
  unsubscribed_at: null,
  ...overrides,
});

/**
 * A D1 stand-in that answers the three lookups by column and records every
 * statement, so a test can assert both what a request found and what it wrote.
 *
 * Dispatch is on the column a lookup filters by, because that is the only thing
 * a caller chooses here; anything else about the SQL is the query's business.
 */
function fakeDb(
  rows: {
    byEmailHash?: unknown;
    byConfirmToken?: unknown;
    byUnsubscribeToken?: unknown;
  } = {},
) {
  const writes: Array<{ sql: string; values: unknown[] }> = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first() {
              if (sql.includes("email_hash = ?"))
                return rows.byEmailHash ?? null;
              if (sql.includes("confirm_token = ?"))
                return rows.byConfirmToken ?? null;
              if (sql.includes("unsubscribe_token = ?")) {
                return rows.byUnsubscribeToken ?? null;
              }
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

/**
 * Stubs `fetch` for both things this app calls out to: Turnstile's siteverify,
 * and the mail endpoint the HTTP adapter posts to.
 */
function stubFetch(options: { turnstile?: boolean; mailOk?: boolean } = {}) {
  const calls: Array<{ url: string; body: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: { body?: unknown }) => {
      const target = String(url);
      calls.push({ url: target, body: String(init?.body ?? "") });
      if (target.includes("challenges.cloudflare.com")) {
        return new Response(
          JSON.stringify({ success: options.turnstile ?? true }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: options.mailOk === false ? 500 : 202 });
    }),
  );
  return calls;
}

const env = (db: D1Database, overrides: Partial<ApiEnv> = {}): ApiEnv => ({
  DB: db,
  HASH_SALT: "test-salt",
  TURNSTILE_SECRET: "test-secret",
  EMAIL_ENCRYPTION_KEY: KEY,
  MAIL_PROVIDER: "http",
  MAIL_ENDPOINT: endpoint,
  MAIL_FROM: "Tsukue <news@example.test>",
  ...overrides,
});

const subscribe = (db: D1Database, overrides: Partial<ApiEnv> = {}) =>
  createNewsletterApp().request(
    "/newsletter/subscribe",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.7",
      },
      body: JSON.stringify({
        email: "Reader@Example.test",
        turnstileToken: "a-token",
      }),
    },
    env(db, overrides),
  );

const mailCalls = (calls: Array<{ url: string; body: string }>) =>
  calls.filter((call) => call.url === endpoint);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /newsletter/subscribe", () => {
  it("stores a pending subscriber and sends one confirmation link", async () => {
    const calls = stubFetch();
    const { db, writes } = fakeDb();

    const response = await subscribe(db);

    expect(response.status).toBe(202);
    // The subscriber, and — now that every send is logged — the row recording
    // the confirmation email. This is about the subscriber.
    const subscriberWrites = writes.filter((write) =>
      write.sql.includes("newsletter_subscribers"),
    );
    expect(subscriberWrites).toHaveLength(1);
    expect(subscriberWrites[0].sql).toContain("status = 'pending'");

    const mail = mailCalls(calls);
    expect(mail).toHaveLength(1);
    // The address is normalised before it is stored or written to, so the same
    // person typing it differently is one subscriber.
    expect(mail[0].body).toContain("reader@example.test");
    expect(mail[0].body).toContain("/api/newsletter/confirm?token=");
    // Nothing is sent to anyone until the address owner follows that link.
    expect(mail[0].body).not.toContain("/api/newsletter/unsubscribe?token=");
  });

  it("answers a new request and an already-subscribed address identically", async () => {
    stubFetch();
    const fresh = await subscribe(fakeDb().db);

    stubFetch();
    const { db, writes } = fakeDb({ byEmailHash: row({ status: "active" }) });
    const existing = await subscribe(db);

    expect(existing.status).toBe(fresh.status);
    expect(await existing.json()).toEqual(await fresh.json());
    // Nothing written, nothing sent: the address is already on the list, and
    // saying so would turn this endpoint into a way to ask who is on it.
    expect(writes).toEqual([]);
    expect(mailCalls(stubFetch())).toEqual([]);
  });

  it("does not send a second confirmation inside the cooldown", async () => {
    const calls = stubFetch();
    const { db, writes } = fakeDb({
      // Asked moments ago, so a repeat is the abuse, not the intent.
      byEmailHash: row({
        status: "pending",
        created_at: new Date().toISOString(),
      }),
    });

    const response = await subscribe(db);

    expect(response.status).toBe(202);
    expect(writes).toEqual([]);
    expect(mailCalls(calls)).toEqual([]);
  });

  it("sends again once the cooldown has passed", async () => {
    const calls = stubFetch();
    const longAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { db, writes } = fakeDb({
      byEmailHash: row({ status: "pending", created_at: longAgo }),
    });

    await subscribe(db);

    expect(
      writes.filter((write) => write.sql.includes("newsletter_subscribers")),
    ).toHaveLength(1);
    expect(mailCalls(calls)).toHaveLength(1);
  });

  it("writes nothing when the challenge fails", async () => {
    const calls = stubFetch({ turnstile: false });
    const { db, writes } = fakeDb();

    const response = await subscribe(db);

    expect(response.status).toBe(403);
    expect(writes).toEqual([]);
    expect(mailCalls(calls)).toEqual([]);
  });

  it("refuses every address the same way when mail is not configured", async () => {
    const calls = stubFetch();
    const { db, writes } = fakeDb();

    const response = await subscribe(db, { MAIL_PROVIDER: undefined });

    expect(response.status).toBe(500);
    expect(writes).toEqual([]);
    expect(mailCalls(calls)).toEqual([]);
  });

  it("still answers the same when the confirmation email cannot be sent", async () => {
    stubFetch({ mailOk: false });
    const { db, writes } = fakeDb();

    const response = await subscribe(db);

    // The row is stored and the reader can ask again; an error here would be
    // visible only to callers who are not already subscribed, which is exactly
    // what the response must not disclose.
    expect(response.status).toBe(202);
    expect(
      writes.filter((write) => write.sql.includes("newsletter_subscribers")),
    ).toHaveLength(1);
  });

  it("rejects something that is not an address, without writing", async () => {
    stubFetch();
    const { db, writes } = fakeDb();

    const response = await createNewsletterApp().request(
      "/newsletter/subscribe",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-address", turnstileToken: "t" }),
      },
      env(db),
    );

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("GET /newsletter/confirm", () => {
  it("activates a pending subscriber and sends the reader to the receipt", async () => {
    stubFetch();
    const { db, writes } = fakeDb({ byConfirmToken: row() });

    const response = await createNewsletterApp().request(
      "/newsletter/confirm?token=confirm-token",
      undefined,
      env(db),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/newsletter/confirmed");
    expect(
      writes.filter((write) => write.sql.includes("newsletter_subscribers")),
    ).toHaveLength(1);
    expect(writes[0].sql).toContain("status = 'active'");
  });

  it("sends an unrecognised token to the invalid page", async () => {
    stubFetch();
    const { db, writes } = fakeDb();

    const response = await createNewsletterApp().request(
      "/newsletter/confirm?token=nope",
      undefined,
      env(db),
    );

    expect(response.headers.get("location")).toBe("/newsletter/invalid");
    expect(writes).toEqual([]);
  });

  it("redirects missing and over-long tokens without a lookup", async () => {
    stubFetch();
    const { db, writes } = fakeDb();

    const missing = await createNewsletterApp().request(
      "/newsletter/confirm",
      undefined,
      env(db),
    );
    const overLong = await createNewsletterApp().request(
      `/newsletter/confirm?token=${"x".repeat(129)}`,
      undefined,
      env(db),
    );

    expect(missing.headers.get("location")).toBe("/newsletter/invalid");
    expect(overLong.headers.get("location")).toBe("/newsletter/invalid");
    expect(writes).toEqual([]);
  });

  it("treats a second click as success, not as a spent link", async () => {
    stubFetch();
    const { db, writes } = fakeDb({
      byConfirmToken: row({
        status: "active",
        confirmed_at: "2026-09-01T00:00:00.000Z",
      }),
    });

    const response = await createNewsletterApp().request(
      "/newsletter/confirm?token=confirm-token",
      undefined,
      env(db),
    );

    expect(response.headers.get("location")).toBe("/newsletter/confirmed");
    // Confirming twice would rewrite the date the reader actually confirmed.
    expect(writes).toEqual([]);
  });

  it("does not put back somebody who has since unsubscribed", async () => {
    stubFetch();
    const { db, writes } = fakeDb({
      byConfirmToken: row({ status: "unsubscribed" }),
    });

    const response = await createNewsletterApp().request(
      "/newsletter/confirm?token=confirm-token",
      undefined,
      env(db),
    );

    // A confirmation link that outlives its purpose is a link that can undo a
    // reader's decision, so an old one must not be able to reactivate anybody.
    expect(response.headers.get("location")).toBe("/newsletter/invalid");
    expect(writes).toEqual([]);
  });
});

describe("unsubscribe", () => {
  it("accepts the one-click POST a mailbox provider sends", async () => {
    stubFetch();
    const { db, writes } = fakeDb({
      byUnsubscribeToken: row({ status: "active" }),
    });

    const response = await createNewsletterApp().request(
      "/newsletter/unsubscribe?token=unsubscribe-token",
      { method: "POST", body: "List-Unsubscribe=One-Click" },
      env(db),
    );

    expect(response.status).toBe(200);
    expect(
      writes.filter((write) => write.sql.includes("newsletter_subscribers")),
    ).toHaveLength(1);
    expect(writes[0].sql).toContain("status = 'unsubscribed'");
  });

  it("is idempotent, so a retried one-click is not an error", async () => {
    stubFetch();
    const { db, writes } = fakeDb({
      byUnsubscribeToken: row({ status: "unsubscribed" }),
    });

    const response = await createNewsletterApp().request(
      "/newsletter/unsubscribe?token=unsubscribe-token",
      { method: "POST", body: "List-Unsubscribe=One-Click" },
      env(db),
    );

    expect(response.status).toBe(200);
    expect(writes).toEqual([]);
  });

  it("sends a reader who follows the visible link to the receipt", async () => {
    stubFetch();
    const { db } = fakeDb({ byUnsubscribeToken: row({ status: "active" }) });

    const response = await createNewsletterApp().request(
      "/newsletter/unsubscribe?token=unsubscribe-token",
      undefined,
      env(db),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/newsletter/unsubscribed");
  });

  it("reports an unknown token to a provider rather than pretending", async () => {
    stubFetch();
    const { db, writes } = fakeDb();

    const response = await createNewsletterApp().request(
      "/newsletter/unsubscribe?token=nope",
      { method: "POST", body: "List-Unsubscribe=One-Click" },
      env(db),
    );

    expect(response.status).toBe(404);
    expect(writes).toEqual([]);
  });
});
