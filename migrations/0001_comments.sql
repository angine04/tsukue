CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  lang TEXT,
  parent_id TEXT,
  author_name TEXT NOT NULL,
  author_email_hash TEXT,
  author_email_encrypted TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_status_created
ON comments (slug, status, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_status_created
ON comments (status, created_at);
