import type { D1Database } from "./env.js";

/**
 * The published limits (AGENTS 14). They live here rather than in the schema so
 * the schema, the route and the tests all read the same numbers.
 */
export const COMMENT_LIMITS = {
  authorName: { min: 1, max: 80 },
  body: { min: 1, max: 4000 },
  /** More than this many links reads as a link drop, not a comment. */
  maxLinks: 2,
  /** Rate limit window and allowance, counted per salted IP hash. */
  windowMinutes: 10,
  maxPerWindow: 5,
  /** Identical author + body on the same post inside this window is a double post. */
  duplicateWindowMinutes: 60,
} as const;

/** RFC 9110-ish URL match; deliberately not clever enough to miss an obvious link. */
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

export function countLinks(body: string): number {
  return body.match(URL_PATTERN)?.length ?? 0;
}

export function isOverLinkLimit(body: string): boolean {
  return countLinks(body) > COMMENT_LIMITS.maxLinks;
}

function isoBefore(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/**
 * Rate limiting by counting, in D1, the submissions from one IP hash inside a
 * window.
 *
 * Counting rows rather than keeping a separate counter table means the limiter
 * cannot drift from the data it limits: a comment that was stored is a comment
 * that counted, whatever moderation later did to its status. The cost is a
 * scan per submission, which is the right trade for a personal blog and the
 * wrong one for a high-traffic site — that is when this moves to a KV counter
 * or Cloudflare's rate limiting binding.
 */
export async function countRecentSubmissions(
  db: D1Database,
  ipHash: string,
  now: Date = new Date(),
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM comments WHERE ip_hash = ? AND created_at > ?",
    )
    .bind(ipHash, isoBefore(now, COMMENT_LIMITS.windowMinutes))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Duplicate detection. Compared on the text rather than a stored digest: the
 * body column is already here, and a hash column would need a migration and a
 * second thing to keep in step with it.
 */
export async function countRecentDuplicates(
  db: D1Database,
  input: { slug: string; authorName: string; body: string },
  now: Date = new Date(),
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM comments
       WHERE slug = ? AND author_name = ? AND body = ? AND created_at > ?`,
    )
    .bind(
      input.slug,
      input.authorName,
      input.body,
      isoBefore(now, COMMENT_LIMITS.duplicateWindowMinutes),
    )
    .first<{ count: number }>();
  return row?.count ?? 0;
}
