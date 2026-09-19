import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpMailProvider } from "./http.js";
import { ResendMailProvider } from "./resend.js";
import { createMailProvider } from "./factory.js";
import { unsubscribeHeaders } from "../headers.js";

const CONFIG = {
  endpoint: "https://mail.example.test/send",
  token: "secret-token",
  from: "comments@notify.example.test",
};

function ok() {
  return Promise.resolve(new Response("", { status: 202 }));
}

/**
 * A `fetch` that refuses a foreign receiver, the way the Workers runtime does.
 *
 * Both adapters called the global as a method of their own instance, which Node
 * and an injected double both accept and the runtime rejects with "Illegal
 * invocation". No test noticed, because every test injected a double — the bug
 * surfaced when a local end-to-end run tried to send a real confirmation email.
 * This double would have noticed.
 */
function fetchLikeRuntime() {
  return vi.fn(function (this: unknown) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation");
    }
    return Promise.resolve(new Response("", { status: 202 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpMailProvider", () => {
  it("posts the message as JSON to the configured endpoint", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new HttpMailProvider(
      CONFIG,
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "admin@example.test",
      from: CONFIG.from,
      subject: "New comment",
      html: "<p>hi</p>",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(CONFIG.endpoint);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer secret-token");
    expect(JSON.parse(init.body)).toMatchObject({
      to: "admin@example.test",
      subject: "New comment",
      html: "<p>hi</p>",
    });
  });

  it("reports a rejected send instead of swallowing it", async () => {
    // A send that failed silently is the failure mode worth preventing: the
    // comment is stored either way, so silence would mean nobody ever learns
    // that moderation mail stopped arriving.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    const provider = new HttpMailProvider(
      CONFIG,
      fetchImpl as unknown as typeof fetch,
    );

    await expect(
      provider.send({
        to: "a@b.test",
        from: CONFIG.from,
        subject: "s",
        html: "h",
      }),
    ).rejects.toThrow(/429.*quota exceeded/s);
  });

  it("omits the authorization header when no token is configured", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new HttpMailProvider(
      { endpoint: CONFIG.endpoint, from: CONFIG.from },
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "a@b.test",
      from: CONFIG.from,
      subject: "s",
      html: "h",
    });

    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBeUndefined();
  });
});

describe("ResendMailProvider", () => {
  const RESEND = {
    apiKey: "re_test_key",
    from: "Tsukue <comments@notify.example.test>",
  };

  it("posts to Resend's endpoint with the key as a bearer token", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new ResendMailProvider(
      RESEND,
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "reader@example.test",
      from: RESEND.from,
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer re_test_key");
  });

  it("names the reply-to field the way Resend does, not the way the interface does", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new ResendMailProvider(
      RESEND,
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "reader@example.test",
      from: RESEND.from,
      replyTo: "author@example.test",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reply_to).toBe("author@example.test");
    expect(body).not.toHaveProperty("replyTo");
  });

  it("carries the unsubscribe pair through as headers", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new ResendMailProvider(
      RESEND,
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "reader@example.test",
      from: RESEND.from,
      subject: "Hello",
      html: "<p>Hi</p>",
      headers: unsubscribeHeaders("https://example.test/u?token=abc"),
    });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.headers["List-Unsubscribe"]).toBe(
      "<https://example.test/u?token=abc>",
    );
    expect(body.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("omits the headers field when there are none, rather than sending an empty one", async () => {
    const fetchImpl = vi.fn().mockImplementation(ok);
    const provider = new ResendMailProvider(
      RESEND,
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "reader@example.test",
      from: RESEND.from,
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty(
      "headers",
    );
  });

  it("reports a rejected send, naming the provider and the status", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response('{"message":"Invalid from address"}', { status: 422 }),
        ),
      );
    const provider = new ResendMailProvider(
      RESEND,
      fetchImpl as unknown as typeof fetch,
    );

    await expect(
      provider.send({
        to: "reader@example.test",
        from: RESEND.from,
        subject: "Hello",
        html: "<p>Hi</p>",
      }),
    ).rejects.toThrow(/Resend returned 422.*Invalid from address/s);
  });
});

describe("the global fetch both adapters fall back to", () => {
  it("is called detached by the http adapter, as the runtime requires", async () => {
    const globalFetch = fetchLikeRuntime();
    vi.stubGlobal("fetch", globalFetch);

    // No double injected: this is the path a deployment actually takes.
    const provider = new HttpMailProvider(CONFIG);
    await provider.send({
      to: "a@b.test",
      from: CONFIG.from,
      subject: "s",
      html: "h",
    });

    expect(globalFetch).toHaveBeenCalled();
  });

  it("is called detached by the Resend adapter too", async () => {
    const globalFetch = fetchLikeRuntime();
    vi.stubGlobal("fetch", globalFetch);

    const provider = new ResendMailProvider({
      apiKey: "re_test_key",
      from: "Tsukue <comments@notify.example.test>",
    });
    await provider.send({
      to: "a@b.test",
      from: "Tsukue <comments@notify.example.test>",
      subject: "s",
      html: "h",
    });

    expect(globalFetch).toHaveBeenCalled();
  });
});

describe("createMailProvider", () => {
  it("returns nothing when no provider is configured, which is a valid state", () => {
    expect(createMailProvider({})).toBeUndefined();
    expect(createMailProvider({ MAIL_PROVIDER: "  " })).toBeUndefined();
  });

  it("refuses a provider it has no adapter for, rather than skipping mail quietly", () => {
    // `postmark` is named in AGENTS 15.1 but has no adapter yet, which is
    // exactly the case this guards: a provider somebody expects to work.
    expect(() => createMailProvider({ MAIL_PROVIDER: "postmark" })).toThrow(
      /Unknown MAIL_PROVIDER/,
    );
  });

  it("refuses an incomplete http configuration", () => {
    expect(() => createMailProvider({ MAIL_PROVIDER: "http" })).toThrow(
      /MAIL_ENDPOINT/,
    );
    expect(() =>
      createMailProvider({
        MAIL_PROVIDER: "http",
        MAIL_ENDPOINT: "https://mail.example.test/send",
      }),
    ).toThrow(/MAIL_FROM/);
  });

  it("builds a provider from a complete configuration", () => {
    const provider = createMailProvider({
      MAIL_PROVIDER: "http",
      MAIL_ENDPOINT: CONFIG.endpoint,
      MAIL_FROM: CONFIG.from,
    });
    expect(provider).toBeInstanceOf(HttpMailProvider);
  });

  it("builds the resend adapter from the same variables, so the provider is a config choice", () => {
    const provider = createMailProvider({
      MAIL_PROVIDER: "resend",
      MAIL_TOKEN: "re_test_key",
      MAIL_FROM: CONFIG.from,
    });
    expect(provider).toBeInstanceOf(ResendMailProvider);
  });

  it("names the missing variable when a resend configuration has no key", () => {
    expect(() =>
      createMailProvider({ MAIL_PROVIDER: "resend", MAIL_FROM: CONFIG.from }),
    ).toThrow(/MAIL_TOKEN/);
  });
});
