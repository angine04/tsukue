const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteVerifyResponse {
  success?: boolean;
  "error-codes"?: string[];
}

export interface TurnstileVerification {
  ok: boolean;
  /** Present so the route can log why, without telling the submitter. */
  reason?: string;
}

/**
 * Verifies a Turnstile token against Cloudflare.
 *
 * Fails closed in every direction: no secret means no comments, a network
 * error means no comment, an unparseable body means no comment. A spam check
 * that fails open is not a spam check, and the failure mode here is a
 * moderator seeing fewer comments than were written, which is the recoverable
 * one.
 *
 * `fetchImpl` exists so the tests can exercise both the pass and the fail path
 * without reaching Cloudflare.
 */
export async function verifyTurnstile(input: {
  secret: string | undefined;
  token: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileVerification> {
  if (!input.secret) {
    return { ok: false, reason: "TURNSTILE_SECRET is not configured" };
  }

  const body = new FormData();
  body.append("secret", input.secret);
  body.append("response", input.token);
  if (input.remoteIp) body.append("remoteip", input.remoteIp);

  const call = input.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await call(VERIFY_URL, { method: "POST", body });
  } catch (error) {
    return {
      ok: false,
      reason: `siteverify request failed: ${String(error)}`,
    };
  }

  if (!response.ok) {
    return { ok: false, reason: `siteverify returned ${response.status}` };
  }

  const parsed: unknown = await response.json().catch(() => undefined);

  // A body that parsed but is not an object (`null`, a bare string) has no
  // `success` to read. Reading it anyway threw out of here and turned a
  // well-formed-but-odd reply into a 500, which is a worse answer than a
  // rejection: the caller cannot tell a broken site from a broken deployment.
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      reason: "siteverify returned a body that is not an object",
    };
  }

  const result = parsed as SiteVerifyResponse;

  if (result.success !== true) {
    return {
      ok: false,
      reason: `siteverify rejected: ${result["error-codes"]?.join(", ") ?? "unknown"}`,
    };
  }

  return { ok: true };
}
