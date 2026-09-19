-- Readers who have asked to stop being told about replies.
--
-- Two scopes share one table: 'thread' names the conversation a reader is done
-- with, 'all' stops every comment notification for that address. The empty
-- thread_id is what lets one primary key cover both — SQLite treats NULLs as
-- distinct, so a nullable column would allow duplicate 'all' rows.
--
-- Kept rather than deleted when a reader asks again: this is a record of a
-- decision, and the same address may hold several of them.
CREATE TABLE IF NOT EXISTS comment_notification_optouts (
  email_hash TEXT NOT NULL,
  scope TEXT NOT NULL,
  thread_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (email_hash, scope, thread_id)
);

-- No second index. Every read asks the same question — "is this address out of
-- this thread, or out of everything?" — which is a lookup on the primary key.
