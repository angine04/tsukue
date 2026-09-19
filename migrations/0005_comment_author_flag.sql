-- Marks a comment as written by the site's author.
--
-- An admin reply is otherwise indistinguishable from a reader comment that
-- merely used the same display name — and a reader can choose that name, so
-- inferring authorship from `author_name` is not just unreliable, it is
-- trivially spoofable.
--
-- Integer rather than boolean because SQLite has no boolean type; 0/1 with a
-- NOT NULL default, so existing rows are readers without a backfill.
ALTER TABLE comments ADD COLUMN author_is_admin INTEGER NOT NULL DEFAULT 0;

-- The moderation queue lists one status at a time, newest first. The existing
-- (status, created_at) index already serves that, so no index is added here.
