CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  confirm_token TEXT,
  unsubscribe_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email_hash
ON newsletter_subscribers (email_hash);

CREATE INDEX IF NOT EXISTS idx_subscribers_status
ON newsletter_subscribers (status);
