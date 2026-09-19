import type { CommentEnv } from "../env.js";

/** Everything the admin surface needs to identify a caller. */
export interface AdminAuthEnv extends CommentEnv {
  /** e.g. `yourteam.cloudflareaccess.com` — the Access team domain. */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's Audience (AUD) tag. */
  ACCESS_AUD?: string;
  /**
   * Shared secret accepted as `Authorization: Bearer <token>`. The fallback for
   * a deployment without Access, and for local development.
   */
  ADMIN_TOKEN?: string;
}

/**
 * The header access these helpers need. Hono's request exposes headers through
 * `header(name)` rather than a `headers` object, and taking the narrow shape
 * keeps the helpers testable with a two-line stub instead of a real Request.
 */
export interface HeaderSource {
  header(name: string): string | undefined;
}

export type AdminAuth =
  | { ok: true; actor: string; method: "access" | "token" }
  | { ok: false; status: 401 | 500; reason: string };

interface AccessJwtPayload {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  sub?: string;
}

const JWKS_CACHE_MS = 5 * 60_000;

/**
 * Cached per isolate rather than per request. The keys rotate rarely and a
 * fetch on every moderation click would add a round trip to Cloudflare for
 * nothing. Cleared on a miss so a rotation is picked up without a redeploy.
 *
 * Keyed by team domain, not just by time: production and a preview deployment
 * can point at different teams, and a single slot would hand one of them the
 * other's keys — which fails closed, but for a reason that looks like a broken
 * deployment rather than a misconfiguration.
 */
const jwksCache = new Map<string, { fetchedAt: number; keys: unknown[] }>();

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalised.length % 4 === 0 ? "" : "=".repeat(4 - (normalised.length % 4));
  const binary = atob(normalised + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlToJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
  } catch {
    return null;
  }
}

async function loadKeys(
  teamDomain: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<unknown[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && now() - cached.fetchedAt < JWKS_CACHE_MS) {
    return cached.keys;
  }

  const response = await fetchImpl(
    `https://${teamDomain}/cdn-cgi/access/certs`,
  );
  if (!response.ok) {
    throw new Error(`Access certs returned ${response.status}`);
  }

  const body = (await response.json()) as { keys?: unknown[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(teamDomain, { fetchedAt: now(), keys });
  return keys;
}

/**
 * Verifies a Cloudflare Access JWT.
 *
 * Signature first, then claims. A token whose signature does not check out is
 * rejected before any claim is read, because the claims are attacker-supplied
 * text until the signature says otherwise — an unverified `email` would let
 * anyone name themselves the admin.
 */
async function verifyAccessToken(
  token: string,
  env: AdminAuthEnv,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<{ ok: true; actor: string } | { ok: false; reason: string }> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (!teamDomain || !audience) {
    return { ok: false, reason: "Access is not configured" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "Malformed token" };
  }
  const [headerPart, payloadPart, signaturePart] = parts as [
    string,
    string,
    string,
  ];

  const header = base64UrlToJson<{ alg?: string; kid?: string }>(headerPart);
  if (!header || header.alg !== "RS256" || !header.kid) {
    return { ok: false, reason: "Unsupported token algorithm" };
  }

  const payload = base64UrlToJson<AccessJwtPayload>(payloadPart);
  if (!payload) {
    return { ok: false, reason: "Malformed token payload" };
  }

  let keys: unknown[];
  try {
    keys = await loadKeys(teamDomain, fetchImpl, now);
  } catch (error) {
    return {
      ok: false,
      reason: `Could not load Access keys: ${String(error)}`,
    };
  }

  const jwk = keys.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { kid?: string }).kid === header.kid,
  );
  if (!jwk) {
    // A rotated key the cache has not seen: drop this team's entry so the next
    // request refetches rather than rejecting for another five minutes.
    jwksCache.delete(teamDomain);
    return { ok: false, reason: "Signing key not found" };
  }

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch (error) {
    return { ok: false, reason: `Signature check failed: ${String(error)}` };
  }

  if (!valid) {
    return { ok: false, reason: "Signature does not match" };
  }

  const seconds = Math.floor(now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= seconds) {
    return { ok: false, reason: "Token expired" };
  }
  if (payload.iss !== `https://${teamDomain}`) {
    return { ok: false, reason: "Issuer does not match the configured team" };
  }

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(audience)) {
    return {
      ok: false,
      reason: "Token was issued for a different Access application",
    };
  }

  const actor = payload.email ?? payload.sub;
  if (!actor) {
    return { ok: false, reason: "Token carries no identity" };
  }

  return { ok: true, actor };
}

/**
 * Identifies the caller for the admin surface.
 *
 * Fails closed: with neither Access nor a token configured, every admin request
 * is refused. An admin API that is reachable because nobody finished setting up
 * authentication is the worst possible default, and this is the one place where
 * a missing environment variable would silently remove every protection on
 * approve, hide and delete.
 *
 * Access is preferred over the token when both are configured, so a shared
 * secret left over from setup cannot become the weakest link.
 */
export async function authenticateAdmin(
  request: HeaderSource,
  env: AdminAuthEnv,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<AdminAuth> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const assertion = request.header("cf-access-jwt-assertion");
    if (!assertion) {
      // Reached the Function without passing through Access: either the Access
      // application does not cover this route, or something bypassed it.
      return {
        ok: false,
        status: 401,
        reason:
          "No Access assertion. Cover /api/admin/* in the Access application, not only /admin.",
      };
    }

    const result = await verifyAccessToken(assertion, env, fetchImpl, now);
    if (!result.ok) return { ok: false, status: 401, reason: result.reason };
    return { ok: true, actor: result.actor, method: "access" };
  }

  if (env.ADMIN_TOKEN) {
    const header = request.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!presented) {
      return { ok: false, status: 401, reason: "No bearer token" };
    }
    // Length-independent comparison: `===` on strings returns early and leaks
    // how much of the token was right to anyone who can time the response.
    if (!constantTimeEquals(presented, env.ADMIN_TOKEN)) {
      return { ok: false, status: 401, reason: "Bearer token does not match" };
    }
    return { ok: true, actor: "token", method: "token" };
  }

  return {
    ok: false,
    status: 500,
    reason:
      "Admin API is not configured. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD, or ADMIN_TOKEN.",
  };
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Rejects a mutation that a browser says came from another site.
 *
 * This matters specifically because Access authenticates with a **cookie**, and
 * a cookie is attached to a request the browser makes on another site's behalf.
 * A bearer token is not, so the check is redundant on the token path — but it
 * costs nothing and covers the configuration that will actually be deployed.
 *
 * Absent headers are allowed through: a non-browser client (curl, a test) has
 * no origin to declare, and the auth check already ran. Present headers must
 * agree with the host.
 */
export function isSameOrigin(
  request: HeaderSource,
  requestUrl: string,
): { ok: true } | { ok: false; reason: string } {
  const origin = request.header("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(requestUrl).host) {
        return { ok: false, reason: `Origin ${origin} is not this host` };
      }
    } catch {
      return { ok: false, reason: `Unparseable Origin header` };
    }
  }

  const site = request.header("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return { ok: false, reason: `Sec-Fetch-Site: ${site}` };
  }

  return { ok: true };
}
