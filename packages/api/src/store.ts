import type { D1Database } from "./env.js";
import type { CommentStatus, PublicComment } from "@tsukue/types";

/** A row as stored. Columns are snake_case; the API never returns this shape. */
interface CommentRow {
  id: string;
  slug: string;
  lang: string | null;
  parent_id: string | null;
  author_name: string;
  body: string;
  status: string;
  created_at: string;
  /** 1 when the site's author wrote it. See migration 0005. */
  author_is_admin: number;
  author_email_encrypted: string | null;
  ip_hash: string | null;
}

export interface NewComment {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  authorEmailHash?: string;
  authorEmailEncrypted?: string;
  ipHash?: string;
  userAgentHash?: string;
  /** True only for a reply written from the admin dashboard. */
  authorIsAdmin?: boolean;
}

const INSERT_COLUMNS = [
  "id",
  "slug",
  "lang",
  "parent_id",
  "author_name",
  "author_email_hash",
  "author_email_encrypted",
  "body",
  "status",
  "created_at",
  "ip_hash",
  "user_agent_hash",
  "author_is_admin",
] as const;

/** Read shape shared by every query that feeds a mapper. */
const READ_COLUMNS = `id, slug, lang, parent_id, author_name, body, status,
  created_at, author_is_admin, author_email_encrypted, ip_hash`;

export async function insertComment(
  db: D1Database,
  comment: NewComment,
): Promise<void> {
  const placeholders = INSERT_COLUMNS.map(() => "?").join(", ");
  await db
    .prepare(
      `INSERT INTO comments (${INSERT_COLUMNS.join(", ")}) VALUES (${placeholders})`,
    )
    .bind(
      comment.id,
      comment.slug,
      comment.lang ?? null,
      comment.parentId ?? null,
      comment.authorName,
      comment.authorEmailHash ?? null,
      comment.authorEmailEncrypted ?? null,
      comment.body,
      comment.status,
      comment.createdAt,
      comment.ipHash ?? null,
      comment.userAgentHash ?? null,
      comment.authorIsAdmin ? 1 : 0,
    )
    .run();
}

/**
 * Approved comments for one post, oldest first so a thread reads top to bottom.
 *
 * `status = 'approved'` is in the query, not applied by a caller afterwards:
 * the only thing that keeps a pending comment out of a public response is this
 * clause being here, so it is the one line that must not move.
 */
export async function listApprovedComments(
  db: D1Database,
  input: { slug: string; lang?: string },
): Promise<CommentRow[]> {
  const statement = db.prepare(
    `SELECT ${READ_COLUMNS}
     FROM comments
     WHERE slug = ? AND status = 'approved' AND (? IS NULL OR lang = ?)
     ORDER BY created_at ASC`,
  );
  const result = await statement
    .bind(input.slug, input.lang ?? null, input.lang ?? null)
    .all<CommentRow>();
  return result.results;
}

/** Fetch one comment regardless of status; the admin API needs that. */
export async function getComment(
  db: D1Database,
  id: string,
): Promise<CommentRow | null> {
  return db
    .prepare(`SELECT ${READ_COLUMNS} FROM comments WHERE id = ?`)
    .bind(id)
    .first<CommentRow>();
}

/**
 * The id a reply should actually be stored against: its thread's root.
 *
 * Returns null when the parent does not exist **or belongs to another post**.
 * That second check is the point of doing this in one place — taking a
 * `parentId` from a request and trusting it would let a reply be filed under a
 * thread on a page it has nothing to do with.
 *
 * Replies are kept one level deep (AGENTS 27: threaded replies allowed but
 * shallow): a reply to a reply lands against the same top-level comment rather
 * than against the reply, which keeps rendering and moderation simple at the
 * cost of finer nesting — a fair trade against an unbounded tree in a flat
 * table.
 */
export async function resolveReplyParent(
  db: D1Database,
  input: { parentId: string; slug: string },
): Promise<string | null> {
  const parent = await getComment(db, input.parentId);
  if (!parent || parent.slug !== input.slug) return null;
  if (parent.status === "deleted" || parent.status === "spam") return null;
  return parent.parent_id ?? parent.id;
}

/**
 * Only what the public may see. Built by naming each field rather than by
 * deleting from the row, so a column added later is private until someone
 * deliberately adds it here.
 */
export function toPublicComment(row: CommentRow): PublicComment {
  return {
    id: row.id,
    parentId: row.parent_id ?? undefined,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    isAuthor: row.author_is_admin === 1,
  };
}

/* ------------------------------------------------------------------ admin */

/** A row as the moderator sees it: everything but the address. */
export interface AdminComment {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  isAuthor: boolean;
  /** True when the commenter left an address we could notify. */
  hasEmail: boolean;
  /** How many readers have flagged this. Zero for most. */
  reportCount: number;
  ipHash?: string;
}

function toAdminComment(row: CommentRow): AdminComment {
  return {
    id: row.id,
    slug: row.slug,
    lang: row.lang ?? undefined,
    parentId: row.parent_id ?? undefined,
    authorName: row.author_name,
    body: row.body,
    status: row.status as CommentStatus,
    createdAt: row.created_at,
    isAuthor: row.author_is_admin === 1,
    hasEmail: row.author_email_encrypted !== null,
    // Filled in by the callers that can batch the lookup; a comment with no
    // reports is the common case and should not cost a query of its own.
    reportCount: 0,
    ipHash: row.ip_hash ?? undefined,
  };
}

/**
 * How many readers have flagged each of these comments, in one query.
 *
 * Batched rather than a subquery per row because the queue is read on every
 * page load by whoever is moderating, and D1 bills rows: one grouped query over
 * an indexed column costs less than a hundred correlated ones.
 */
export async function countReports(
  db: D1Database,
  commentIds: string[],
): Promise<Record<string, number>> {
  if (commentIds.length === 0) return {};
  const placeholders = commentIds.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT comment_id, COUNT(*) AS count FROM comment_reports
       WHERE comment_id IN (${placeholders})
       GROUP BY comment_id`,
    )
    .bind(...commentIds)
    .all<{ comment_id: string; count: number }>();

  const counts: Record<string, number> = {};
  for (const row of result.results) counts[row.comment_id] = row.count;
  return counts;
}

/**
 * Comments that have been flagged, most recently flagged first.
 *
 * Its own listing rather than a filter on the queue, because a report is a
 * signal about a comment rather than a status in its life: a reported comment
 * may be sitting in any tab, and looking for it there is how a report gets
 * missed.
 */
export async function listReportedComments(
  db: D1Database,
  limit = 100,
): Promise<AdminComment[]> {
  const bounded = Math.min(Math.max(limit, 1), 200);
  const flagged = await db
    .prepare(
      `SELECT comment_id, COUNT(*) AS count FROM comment_reports
       GROUP BY comment_id
       ORDER BY MAX(created_at) DESC
       LIMIT ?`,
    )
    .bind(bounded)
    .all<{ comment_id: string; count: number }>();

  if (flagged.results.length === 0) return [];

  const ids = flagged.results.map((row) => row.comment_id);
  const placeholders = ids.map(() => "?").join(", ");
  const comments = await db
    .prepare(
      `SELECT ${READ_COLUMNS} FROM comments WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<CommentRow>();

  const counts = new Map(
    flagged.results.map((row) => [row.comment_id, row.count]),
  );
  // In the order the reports came in, not the order the comments were written.
  const byId = new Map(comments.results.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is CommentRow => row !== undefined)
    .map((row) => ({
      ...toAdminComment(row),
      reportCount: counts.get(row.id) ?? 0,
    }));
}

/** How many comments have been flagged at all, for the moderator's header. */
export async function countReportedComments(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(DISTINCT comment_id) AS count FROM comment_reports")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/** Records one reader's flag. A repeat from the same source is ignored. */
export async function insertReport(
  db: D1Database,
  report: { id: string; commentId: string; ipHash?: string; createdAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO comment_reports (id, comment_id, ip_hash, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(report.id, report.commentId, report.ipHash ?? null, report.createdAt)
    .run();
}

/**
 * The queue, with each comment's report count attached.
 *
 * Wrapped around the query rather than inside it so the count lookup stays one
 * grouped query for the whole page.
 */
export async function attachReportCounts(
  db: D1Database,
  comments: AdminComment[],
): Promise<AdminComment[]> {
  const counts = await countReports(
    db,
    comments.map((comment) => comment.id),
  );
  return comments.map((comment) => ({
    ...comment,
    reportCount: counts[comment.id] ?? 0,
  }));
}

/**
 * The moderation queue: one status, oldest first so a backlog is worked
 * through in the order it arrived.
 *
 * Every other status is an archive rather than a queue, where the question is
 * "what came in recently", so those read newest first.
 *
 * The address is fetched only to learn *whether* one exists — the moderator
 * needs to know a reply could be delivered, never what the address is.
 */
export async function listCommentsByStatus(
  db: D1Database,
  input: { status: CommentStatus; limit?: number },
): Promise<AdminComment[]> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  // A literal chosen here, not a bound parameter: SQLite cannot parameterise
  // the direction, and this is not input from anyone.
  const direction = input.status === "pending" ? "ASC" : "DESC";
  const result = await db
    .prepare(
      `SELECT ${READ_COLUMNS} FROM comments
       WHERE status = ?
       ORDER BY created_at ${direction}
       LIMIT ?`,
    )
    .bind(input.status, limit)
    .all<CommentRow>();
  return result.results.map(toAdminComment);
}

export async function countByStatus(
  db: D1Database,
): Promise<Record<string, number>> {
  const result = await db
    .prepare("SELECT status, COUNT(*) AS count FROM comments GROUP BY status")
    .all<{ status: string; count: number }>();

  const counts: Record<string, number> = {};
  for (const row of result.results) counts[row.status] = row.count;
  return counts;
}

/**
 * Moves a comment to a new status, and reports whether anything moved.
 *
 * `deleted` is soft (AGENTS 13.1): the row stays so a reply keeps its parent,
 * and so a moderator who deletes the wrong thing can get it back. The public
 * listing filters on status, so a soft delete is invisible either way.
 */
export async function setCommentStatus(
  db: D1Database,
  input: { id: string; status: CommentStatus; updatedAt: string },
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE comments SET status = ?, updated_at = ? WHERE id = ?")
    .bind(input.status, input.updatedAt, input.id)
    .run();
  const changed = (result as { meta?: { changes?: number } }).meta?.changes;
  // `changes` is absent on some drivers, so fall back to the rows we do know:
  // an update that matched nothing is reported by the caller as a 404.
  return changed === undefined ? true : changed > 0;
}

export async function insertAuditEntry(
  db: D1Database,
  entry: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actor?: string;
    details?: string;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO admin_audit_log
       (id, action, entity_type, entity_id, actor, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      entry.id,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.actor ?? null,
      entry.details ?? null,
      entry.createdAt,
    )
    .run();
}

/** Recent moderation activity, newest first. */
export async function listAuditEntries(
  db: D1Database,
  limit = 50,
): Promise<
  Array<{
    id: string;
    action: string;
    entityId: string;
    actor: string | null;
    createdAt: string;
  }>
> {
  const result = await db
    .prepare(
      `SELECT id, action, entity_id, actor, created_at FROM admin_audit_log
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit, 1), 200))
    .all<{
      id: string;
      action: string;
      entity_id: string;
      actor: string | null;
      created_at: string;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    action: row.action,
    entityId: row.entity_id,
    actor: row.actor,
    createdAt: row.created_at,
  }));
}
