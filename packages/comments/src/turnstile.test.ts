import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("verifyTurnstile", () => {
  it("passes only when Cloudflare says success", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    const result = await verifyTurnstile({
      secret: "s",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
  });

  it("sends the secret, the token and the address being verified", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    await verifyTurnstile({
      secret: "the-secret",
      token: "the-token",
      remoteIp: "203.0.113.7",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const body = fetchImpl.mock.calls[0][1].body as FormData;
    expect(body.get("secret")).toBe("the-secret");
    expect(body.get("response")).toBe("the-token");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("fails closed when no secret is configured", async () => {
    const fetchImpl = vi.fn();
    const result = await verifyTurnstile({
      secret: undefined,
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    // Not merely failing — it must not even ask, so an unconfigured deployment
    // cannot be talked into accepting a token by a well-formed request.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Cloudflare rejects the token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
      );
    const result = await verifyTurnstile({
      secret: "s",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("invalid-input-response");
  });

  it("treats a success field that is not true as failure", async () => {
    // A missing or non-boolean `success` must not be read as permission.
    for (const body of [{}, { success: "true" }, { success: 1 }, null]) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body));
      const result = await verifyTurnstile({
        secret: "s",
        token: "t",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("fails closed when the request throws, rather than propagating", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await verifyTurnstile({
      secret: "s",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("network down");
  });

  it("fails closed on an HTTP error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const result = await verifyTurnstile({
      secret: "s",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed on a body that is not JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>nope</html>", { status: 200 }));
    const result = await verifyTurnstile({
      secret: "s",
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
  });
});
