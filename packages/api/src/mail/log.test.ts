import { afterEach, describe, expect, it, vi } from "vitest";
import type { D1Database } from "../env.js";
import {
  sendLoggedMail,
  countMailSendLogsByStatus,
  listMailSendLogs,
} from "./log.js";

const KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)),
);
const endpoint = "https://mail.example.test/send";

function fakeDb() {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      // The reader binds a limit and the counter does not, so the statement has
      // to work both ways.
      const statement = {
        async run() {
          return { results: [], success: true };
        },
        async all<T>() {
          if (sql.includes("GROUP BY")) {
            return {
              results: [{ status: "failure", count: 2 }],
              success: true,
            } as { results: T[]; success: boolean };
          }
          return {
            results: [
              {
                id: "log-1",
                category: "comment_reply",
                provider: "http",
                email_hash: "hash",
                status: "failure",
                error: "provider rejected",
                created_at: "2026-09-20T00:00:00.000Z",
              },
            ],
            success: true,
          } as { results: T[]; success: boolean };
        },
      };
      return {
        ...statement,
        bind(...values: unknown[]) {
          queries.push({ sql, values });
          return statement;
        },
      };
    },
  } as unknown as D1Database;
  return { db, queries };
}

const message = {
  to: "ada@example.test",
  from: "Tsukue <comments@example.test>",
  subject: "A reply",
  html: "<p>hello</p>",
};

const env = (db: D1Database) => ({
  DB: db,
  HASH_SALT: "test-salt",
  EMAIL_ENCRYPTION_KEY: KEY,
  MAIL_PROVIDER: "http",
  MAIL_ENDPOINT: endpoint,
  MAIL_FROM: "Tsukue <comments@example.test>",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendLoggedMail", () => {
  it("records a provider failure without storing the recipient address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("provider rejected", { status: 502 })),
    );
    const { db, queries } = fakeDb();

    const result = await sendLoggedMail(env(db), {
      category: "comment_reply",
      message,
    });

    expect(result.ok).toBe(false);
    const insert = queries.find((query) => query.sql.includes("INSERT"));
    expect(insert?.values[5]).toBe("failure");
    expect(String(insert?.values[6])).toContain("502");
    expect(JSON.stringify(insert?.values)).not.toContain(message.to);
  });

  it("records an unconfigured provider as a failed send", async () => {
    const { db, queries } = fakeDb();

    const result = await sendLoggedMail(
      { ...env(db), MAIL_PROVIDER: undefined },
      { category: "newsletter", message },
    );

    expect(result).toEqual({
      ok: false,
      error: "Mail provider is not configured.",
    });
    const insert = queries.find((query) => query.sql.includes("INSERT"));
    expect(insert?.values[2]).toBe("unconfigured");
    expect(insert?.values[5]).toBe("failure");
  });
});

describe("mail log readers", () => {
  it("maps rows and returns outcome counts", async () => {
    const { db, queries } = fakeDb();

    await expect(listMailSendLogs(db, 500)).resolves.toEqual([
      {
        id: "log-1",
        category: "comment_reply",
        provider: "http",
        recipientEmailHash: "hash",
        status: "failure",
        error: "provider rejected",
        createdAt: "2026-09-20T00:00:00.000Z",
      },
    ]);
    await expect(countMailSendLogsByStatus(db)).resolves.toEqual({
      failure: 2,
    });
    expect(queries[0].values).toEqual([100]);
  });
});
