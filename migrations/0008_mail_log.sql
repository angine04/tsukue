-- Every provider attempt, including a missing or invalid configuration, for the moderator's mail history.
--
-- Addresses are represented only by the same salted hash/encrypted value used by
-- the rest of the API. A failed row keeps the provider's message so a moderator
-- can tell whether an unsubscribe-bearing message was handed off.
CREATE TABLE IF NOT EXISTS mail_send_log (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  provider TEXT NOT NULL,
  email_hash TEXT,
  email_encrypted TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

-- The moderator reads newest attempts first, and the index avoids sorting the
-- whole history as the log grows.
CREATE INDEX IF NOT EXISTS idx_mail_send_log_created
ON mail_send_log (created_at);
