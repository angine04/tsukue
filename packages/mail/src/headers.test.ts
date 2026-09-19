import { describe, expect, it, vi } from "vitest";
import { sanitiseHeaderValue } from "./headers.js";
import { HttpMailProvider } from "./providers/http.js";

describe("sanitiseHeaderValue", () => {
  it("defuses the header-injection shape", () => {
    expect(
      sanitiseHeaderValue("New comment on x\r\nBcc: attacker@example.com"),
    ).toBe("New comment on x Bcc: attacker@example.com");
  });

  it("handles a bare newline and a bare carriage return", () => {
    expect(sanitiseHeaderValue("a\nb")).toBe("a b");
    expect(sanitiseHeaderValue("a\rb")).toBe("a b");
    expect(sanitiseHeaderValue("a\r\n\r\nb")).toBe("a b");
  });

  it("drops other control characters", () => {
    expect(sanitiseHeaderValue("a\u0000b\u001Fc\u007Fd")).toBe("abcd");
  });

  it("leaves an ordinary value alone", () => {
    expect(sanitiseHeaderValue("New comment on on-slowness")).toBe(
      "New comment on on-slowness",
    );
  });
});

describe("HttpMailProvider header handling", () => {
  it("cannot be made to emit a second header through the subject", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 202 }));
    const provider = new HttpMailProvider(
      { endpoint: "https://mail.example.test/send", from: "a@b.test" },
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "admin@example.test",
      from: "a@b.test",
      subject: "New comment on x\r\nBcc: victim@example.test",
      html: "<p>hi</p>",
    });

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.subject).toBe("New comment on x Bcc: victim@example.test");
  });

  it("sanitises addresses and custom headers too", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 202 }));
    const provider = new HttpMailProvider(
      { endpoint: "https://mail.example.test/send", from: "a@b.test" },
      fetchImpl as unknown as typeof fetch,
    );

    await provider.send({
      to: "admin@example.test\r\nBcc: victim@example.test",
      from: "a@b.test",
      subject: "s",
      html: "h",
      headers: { "List-Unsubscribe": "<https://x.test/u>\r\nX-Evil: 1" },
    });

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.to).not.toMatch(/[\r\n]/);
    expect(sent.headers["List-Unsubscribe"]).not.toMatch(/[\r\n]/);
  });
});
