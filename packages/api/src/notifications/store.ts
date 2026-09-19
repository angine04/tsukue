import type { D1Database } from "../env.js";
import type { OptOut } from "./tokens.js";

/**
 * Whether this address has asked to stop hearing about this thread, or about
 * all of them.
 *
 * One query rather than two, because the caller only ever wants the answer to
 * "should this person be written to?" — and the two scopes are one question
 * with two answers, not two decisions.
 */
export async function isOptedOut(
  db: D1Database,
  optOut: Pick<OptOut, "emailHash" | "threadId">,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS opted_out FROM comment_notification_optouts
       WHERE email_hash = ?
         AND (scope = 'all' OR (scope = 'thread' AND thread_id = ?))
       LIMIT 1`,
    )
    .bind(optOut.emailHash, optOut.threadId)
    .first<{ opted_out: number }>();
  return row !== null;
}

/**
 * Records one decision.
 *
 * `INSERT OR IGNORE` rather than a plain insert: the same link can be followed
 * twice, and a second click — or a mail provider retrying its one-click POST —
 * is not an error.
 */
export async function recordOptOut(
  db: D1Database,
  optOut: OptOut & { createdAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO comment_notification_optouts
         (email_hash, scope, thread_id, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(optOut.emailHash, optOut.scope, optOut.threadId, optOut.createdAt)
    .run();
}
