import type { D1Database } from "../env.js";
import type { SubscriberStatus } from "@tsukue/types";

/** A row as stored. Columns are snake_case; the API never returns this shape. */
export interface SubscriberRow {
  id: string;
  email_encrypted: string;
  email_hash: string;
  status: string;
  confirm_token: string | null;
  unsubscribe_token: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export interface NewSubscriber {
  id: string;
  emailHash: string;
  emailEncrypted: string;
  confirmToken: string;
  unsubscribeToken: string;
  createdAt: string;
}

const READ_COLUMNS = `id, email_encrypted, email_hash, status, confirm_token,
  unsubscribe_token, created_at, confirmed_at, unsubscribed_at`;

/**
 * Records a request to subscribe, or re-records one for an address already here.
 *
 * An upsert rather than an insert: one row per address is what the UNIQUE index
 * on `email_hash` is for, and it is also what lets somebody who left and then
 * changed their mind come back — a second row would leave the first one eligible
 * for the next send.
 *
 * `created_at` is rewritten on conflict so it always means "when this address
 * last asked", which is what the resend cooldown measures, and the confirmation
 * and unsubscribe dates are cleared because the request starts over. The confirm
 * token is replaced with the new one; the unsubscribe token is deliberately left
 * as it was, so a link in an email sent months ago keeps working.
 */
export async function upsertPendingSubscriber(
  db: D1Database,
  subscriber: NewSubscriber,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO newsletter_subscribers
         (id, email_encrypted, email_hash, status, confirm_token, unsubscribe_token, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT(email_hash) DO UPDATE SET
         email_encrypted = excluded.email_encrypted,
         status = 'pending',
         confirm_token = excluded.confirm_token,
         created_at = excluded.created_at,
         confirmed_at = NULL,
         unsubscribed_at = NULL`,
    )
    .bind(
      subscriber.id,
      subscriber.emailEncrypted,
      subscriber.emailHash,
      subscriber.confirmToken,
      subscriber.unsubscribeToken,
      subscriber.createdAt,
    )
    .run();
}

async function firstBy(
  db: D1Database,
  column: string,
  value: string,
): Promise<SubscriberRow | null> {
  const row = await db
    .prepare(
      `SELECT ${READ_COLUMNS} FROM newsletter_subscribers WHERE ${column} = ?`,
    )
    .bind(value)
    .first<SubscriberRow>();
  return row ?? null;
}

export function getSubscriberByEmailHash(
  db: D1Database,
  emailHash: string,
): Promise<SubscriberRow | null> {
  return firstBy(db, "email_hash", emailHash);
}

export function getSubscriberByConfirmToken(
  db: D1Database,
  token: string,
): Promise<SubscriberRow | null> {
  return firstBy(db, "confirm_token", token);
}

export function getSubscriberByUnsubscribeToken(
  db: D1Database,
  token: string,
): Promise<SubscriberRow | null> {
  return firstBy(db, "unsubscribe_token", token);
}

/**
 * Moves a pending subscriber to active.
 *
 * The confirm token is deliberately left in place rather than consumed. Nulling
 * it looked tidier and broke the common case: Outlook and most corporate mail
 * filters fetch links to scan them, so the prefetch would spend the token and
 * the reader's own click would arrive at "that link is not valid". Reuse is safe
 * because confirming is idempotent — and this is only ever called for a
 * subscriber still pending, so a link in an old email cannot resurrect somebody
 * who has since unsubscribed.
 */
export async function confirmSubscriber(
  db: D1Database,
  input: { id: string; confirmedAt: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_subscribers
       SET status = 'active', confirmed_at = ?
       WHERE id = ?`,
    )
    .bind(input.confirmedAt, input.id)
    .run();
}

/**
 * Stops sending to an address.
 *
 * The row stays, and the unsubscribe token stays with it: a form the reader
 * filled in months ago must not be able to put them back on the list, and a
 * link in an old email must keep working.
 */
export async function unsubscribeSubscriber(
  db: D1Database,
  input: { id: string; unsubscribedAt: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = ?
       WHERE id = ?`,
    )
    .bind(input.unsubscribedAt, input.id)
    .run();
}

/** The list an operator works from, newest first. */
export async function listSubscribersByStatus(
  db: D1Database,
  input: { status: SubscriberStatus; limit?: number },
): Promise<SubscriberRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${READ_COLUMNS} FROM newsletter_subscribers
       WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(input.status, input.limit ?? 100)
    .all<SubscriberRow>();
  return results;
}

export async function countSubscribersByStatus(
  db: D1Database,
): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(
      "SELECT status, COUNT(*) AS count FROM newsletter_subscribers GROUP BY status",
    )
    .all<{ status: string; count: number }>();

  const counts: Record<string, number> = {};
  for (const row of results) counts[row.status] = row.count;
  return counts;
}
