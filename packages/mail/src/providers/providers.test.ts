import { describe, expect, it, vi } from "vitest";
import { HttpMailProvider } from "./http.js";
import { createMailProvider } from "./factory.js";

const CONFIG = {
  endpoint: "https://mail.example.test/send",
  token: "secret-token",
  from: "comments@notify.example.test",
};

function ok() {
  return Promise.resolve(new Response("", { status: 202 }));
}

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

describe("createMailProvider", () => {
  it("returns nothing when no provider is configured, which is a valid state", () => {
    expect(createMailProvider({})).toBeUndefined();
    expect(createMailProvider({ MAIL_PROVIDER: "  " })).toBeUndefined();
  });

  it("refuses a provider it has no adapter for, rather than skipping mail quietly", () => {
    expect(() => createMailProvider({ MAIL_PROVIDER: "resend" })).toThrow(
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
});
