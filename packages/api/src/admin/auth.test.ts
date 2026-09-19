import { describe, expect, it, vi } from "vitest";
import { authenticateAdmin, isSameOrigin, type HeaderSource } from "./auth.js";

function request(headers: Record<string, string>): HeaderSource {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return { header: (name) => lower.get(name.toLowerCase()) };
}

/* --------------------------------------------------------------- token mode */

describe("authenticateAdmin with a shared token", () => {
  it("accepts the configured token", async () => {
    const result = await authenticateAdmin(
      request({ authorization: "Bearer s3cret" }),
      { ADMIN_TOKEN: "s3cret" } as never,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe("token");
  });

  it("refuses a wrong token", async () => {
    const result = await authenticateAdmin(
      request({ authorization: "Bearer nope" }),
      { ADMIN_TOKEN: "s3cret" } as never,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a token that is a prefix of the real one", async () => {
    // The comparison must not be a prefix match, which `startsWith` would make it.
    const result = await authenticateAdmin(
      request({ authorization: "Bearer s3c" }),
      {
        ADMIN_TOKEN: "s3cret",
      } as never,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a token that is the real one plus more", async () => {
    const result = await authenticateAdmin(
      request({ authorization: "Bearer s3cretEXTRA" }),
      { ADMIN_TOKEN: "s3cret" } as never,
    );
    expect(result.ok).toBe(false);
  });

  it("requires the Bearer scheme", async () => {
    const result = await authenticateAdmin(
      request({ authorization: "s3cret" }),
      {
        ADMIN_TOKEN: "s3cret",
      } as never,
    );
    expect(result.ok).toBe(false);
  });
});

/* -------------------------------------------------------- fail-closed setup */

describe("authenticateAdmin with nothing configured", () => {
  it("refuses every request, and says it is a server problem", async () => {
    const result = await authenticateAdmin(request({}), {} as never);
    expect(result.ok).toBe(false);
    // 500, not 401: the caller did nothing wrong, the deployment is incomplete.
    // The important part is that it is not open.
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.reason).toMatch(/not configured/i);
    }
  });

  it("refuses even a well-formed request when no auth exists", async () => {
    const result = await authenticateAdmin(
      request({ authorization: "Bearer anything", origin: "http://localhost" }),
      {} as never,
    );
    expect(result.ok).toBe(false);
  });
});

/* --------------------------------------------------------------- Access mode */

/** A throwaway RSA key pair, standing in for Cloudflare's Access keys. */
async function signAccessToken(
  payload: Record<string, unknown>,
  options: { kid?: string; corruptSignature?: boolean } = {},
) {
  const kid = options.kid ?? "test-key-1";
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  const b64 = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const header = b64(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })),
  );
  const body = b64(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(`${header}.${body}`),
    ),
  );
  if (options.corruptSignature) signature[0] ^= 0xff;

  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { token: `${header}.${body}.${b64(signature)}`, jwk: { ...jwk, kid } };
}

/** A JWKS response in the shape Cloudflare's certs endpoint returns. */
function jwksResponse(jwk: unknown) {
  return new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A fixed clock, so expiry is deterministic rather than wall-clock dependent. */
const NOW = Date.parse("2026-09-19T12:00:00Z");

/**
 * Each test gets its own team domain. The key cache is keyed by domain and
 * lives for the isolate's lifetime, so a shared domain would let one test's
 * key pair answer another test's request — a property of the cache working as
 * designed, not something to work around.
 */
let teamCounter = 0;

async function accessCase(
  payloadOverrides: Record<string, unknown> = {},
  signOptions: { corruptSignature?: boolean } = {},
) {
  teamCounter += 1;
  const teamDomain = `team-${teamCounter}.cloudflareaccess.com`;
  const aud = "aud-tag";

  const { token, jwk } = await signAccessToken(
    {
      aud,
      email: "me@example.com",
      iss: `https://${teamDomain}`,
      exp: Math.floor(NOW / 1000) + 600,
      ...payloadOverrides,
    },
    signOptions,
  );

  const fetchImpl = vi.fn().mockResolvedValue(jwksResponse(jwk));
  return {
    token,
    fetchImpl,
    jwk,
    env: { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: aud } as never,
  };
}

function accessEnv() {
  return {
    ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
    ACCESS_AUD: "aud-tag",
  } as never;
}

describe("authenticateAdmin with Cloudflare Access", () => {
  it("accepts a properly signed, unexpired token for this application", async () => {
    const { token, fetchImpl, env } = await accessCase();
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      env,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor).toBe("me@example.com");
      expect(result.method).toBe("access");
    }
  });

  it("refuses a token whose signature does not verify", async () => {
    const { token, fetchImpl, env } = await accessCase(
      {},
      { corruptSignature: true },
    );
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      env,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a token for a different Access application", async () => {
    // Same team, same signing key, wrong audience: someone else's application
    // must not grant access to this one.
    const { token, fetchImpl, env } = await accessCase({
      aud: "someone-elses-app",
    });
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      env,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an expired token", async () => {
    const { token, fetchImpl, env } = await accessCase({
      exp: Math.floor(NOW / 1000) - 1,
    });
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      env,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a token from another team's issuer", async () => {
    const { token, fetchImpl, env } = await accessCase({
      iss: "https://attacker.cloudflareaccess.com",
    });
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      env,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an unsigned (alg: none) token without even fetching keys", async () => {
    // The classic JWT bypass: `alg: none` with an empty signature. A verifier
    // that trusts the algorithm named in the header accepts it.
    const b64 = (value: string) =>
      btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `${b64(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64(
      JSON.stringify({
        aud: "aud-tag",
        email: "attacker@example.com",
        iss: "https://team-999.cloudflareaccess.com",
        exp: Math.floor(NOW / 1000) + 600,
      }),
    )}.`;

    const fetchImpl = vi.fn();
    const result = await authenticateAdmin(
      request({ "cf-access-jwt-assertion": token }),
      {
        ACCESS_TEAM_DOMAIN: "team-999.cloudflareaccess.com",
        ACCESS_AUD: "aud-tag",
      } as never,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a request with no assertion at all", async () => {
    // The configuration mistake worth catching: Access applied to /admin but
    // not to /api/admin/*, leaving the API reachable without it.
    const result = await authenticateAdmin(request({}), accessEnv(), {
      fetchImpl: vi.fn() as unknown as typeof fetch,
      now: () => NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cover \/api\/admin/);
  });

  it("prefers Access over a configured token, so a leftover secret is not the weak link", async () => {
    const { token, fetchImpl, env } = await accessCase();
    const result = await authenticateAdmin(
      request({
        authorization: "Bearer leftover",
        "cf-access-jwt-assertion": token,
      }),
      { ...(env as object), ADMIN_TOKEN: "leftover" } as never,
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe("access");
  });

  it("fetches the team's keys once, not on every request", async () => {
    const { token, fetchImpl, env } = await accessCase();
    const options = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await authenticateAdmin(
        request({ "cf-access-jwt-assertion": token }),
        env,
        options,
      );
      expect(result.ok).toBe(true);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------- origin checks */

describe("isSameOrigin", () => {
  it("allows no declared origin, which is every non-browser client", () => {
    expect(isSameOrigin(request({}), "https://tsukue.test/api/x").ok).toBe(
      true,
    );
  });

  it("allows a matching origin", () => {
    expect(
      isSameOrigin(
        request({ origin: "https://tsukue.test" }),
        "https://tsukue.test/api/x",
      ).ok,
    ).toBe(true);
  });

  it("refuses another site's origin", () => {
    const result = isSameOrigin(
      request({ origin: "https://evil.test" }),
      "https://tsukue.test/api/x",
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a lookalike host", () => {
    for (const origin of [
      "https://tsukue.test.evil.test",
      "https://evil.test?x=tsukue.test",
      "http://tsukue.test.evil.test",
    ]) {
      expect(
        isSameOrigin(request({ origin }), "https://tsukue.test/api/x").ok,
      ).toBe(false);
    }
  });

  it("refuses a cross-site Sec-Fetch-Site even with no Origin", () => {
    // Some browsers omit Origin on same-site-but-cross-origin form posts.
    const result = isSameOrigin(
      request({ "sec-fetch-site": "cross-site" }),
      "https://tsukue.test/api/x",
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an unparseable origin rather than ignoring it", () => {
    expect(
      isSameOrigin(
        request({ origin: "not-a-url" }),
        "https://tsukue.test/api/x",
      ).ok,
    ).toBe(false);
  });
});
