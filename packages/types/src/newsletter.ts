/**
 * Where a subscriber stands. Canonical here rather than only in the schemas
 * package, which mirrors it into Zod: the database column stores this union as
 * text, and a status added in one place has to exist in both.
 *
 * - `pending`       asked to subscribe; the address has not confirmed yet
 * - `active`        confirmed, and receives newsletters
 * - `unsubscribed`  asked to stop; the row is kept so a stale form cannot
 *                   silently re-add the address
 * - `bounced`       the provider reported the address undeliverable
 * - `complained`    the reader marked a newsletter as spam
 */
export type SubscriberStatus =
  | "pending"
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained";

/**
 * A subscriber as the moderator sees it.
 *
 * The address is the one field deliberately held back. It is stored encrypted
 * so a send can use it, and this shape carries a masked rendering instead — so
 * an address is never in a response body, a browser's memory, or a log.
 */
export interface AdminSubscriber {
  id: string;
  /** `a***@example.com`: enough to recognise a subscriber, not to harvest one. */
  emailMasked: string;
  status: SubscriberStatus;
  createdAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
}

/** How many subscribers sit in each status. */
export type SubscriberCounts = Record<string, number>;

/** What one newsletter send did. */
export interface NewsletterSendResult {
  sent: number;
  failed: number;
  /** Active subscribers past the per-send cap, left for the next send. */
  skipped: number;
}
