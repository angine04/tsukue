-- Readers flagging a comment for a moderator (AGENTS 13.3).
--
-- One row per report rather than a counter on the comment: a count cannot say
-- when the reports arrived, and it cannot recognise the same reporter twice —
-- which is what stops one address from inflating it.
CREATE TABLE IF NOT EXISTS comment_reports (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  -- A salted hash, never an address. Reporting is meant to be anonymous, but
  -- one source should not be able to raise the same flag repeatedly.
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

-- One report per source per comment, enforced by the database rather than by a
-- read-then-write, which is a race. NULL hashes do not collide, so a request
-- arriving without the header cannot be deduplicated — Cloudflare always sets
-- it, and the alternative is storing something worse than a hash.
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_reports_unique
ON comment_reports (comment_id, ip_hash);

-- The admin view asks which comments were reported and when, most recent first.
CREATE INDEX IF NOT EXISTS idx_comment_reports_created
ON comment_reports (created_at);

-- The rate-limit window counts one source's recent flags, which the unique
-- index above cannot serve: it leads with comment_id.
CREATE INDEX IF NOT EXISTS idx_comment_reports_ip
ON comment_reports (ip_hash, created_at);
