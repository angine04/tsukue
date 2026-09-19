import { Hono } from "hono";
import { commentResultPath } from "@tsukue/config";
import type { ApiEnv } from "../env.js";
import { recordOptOut } from "./store.js";
import { readOptOutToken } from "./tokens.js";

/** Both scopes are recorded the same way; only the token differs. */
async function record(
  env: ApiEnv,
  token: string,
): Promise<{ ok: true } | { ok: false }> {
  const salt = env.HASH_SALT;
  if (!salt || !token) return { ok: false };

  const optOut = await readOptOutToken(token, salt);
  if (!optOut) return { ok: false };

  await recordOptOut(env.DB, {
    ...optOut,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/**
 * The two ways out of reply notifications (AGENTS 15.5).
 *
 * Registered onto the comment app so the paths sit with the rest of the comment
 * API — `/api/comments/unsubscribe` — and both scopes travel as a signed token
 * rather than as parameters, so neither the link nor the reply can be edited
 * into unsubscribing somebody else.
 */
export function registerNotificationRoutes(
  app: Hono<{ Bindings: ApiEnv }>,
): void {
  /** The link a reader clicks, in either scope. */
  app.get("/comments/unsubscribe", async (c) => {
    const result = await record(c.env, c.req.query("token") ?? "");
    return c.redirect(
      commentResultPath(result.ok ? "unsubscribed" : "invalid"),
      302,
    );
  });

  /**
   * One-click unsubscribe (RFC 8058), which is what `List-Unsubscribe-Post`
   * promises a mailbox provider. It arrives cross-origin with no user present,
   * so it cannot ask for a challenge or check an origin — the signature is the
   * whole of the authority.
   */
  app.post("/comments/unsubscribe", async (c) => {
    const result = await record(c.env, c.req.query("token") ?? "");
    if (!result.ok) {
      return c.json(
        {
          ok: false as const,
          error: {
            code: "INVALID_REQUEST",
            message: "That unsubscribe link is no longer valid.",
          },
        },
        404,
      );
    }

    // A repeat is a no-op rather than an error: providers retry.
    return c.json({ ok: true as const, data: { status: "unsubscribed" } });
  });
}
