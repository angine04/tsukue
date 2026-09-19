-- Indexes for the two lookups a submission performs before it is stored.
--
-- Both compare `created_at` against a cutoff. Timestamps are stored as ISO-8601
-- UTC text, which is lexically ordered, so a range comparison on the text is
-- the same as a range comparison on the instant.

-- Rate limiting: "how many have arrived from this IP hash recently?"
CREATE INDEX IF NOT EXISTS idx_comments_ip_hash_created
ON comments (ip_hash, created_at);

-- Duplicate detection: "has this author already posted this text on this post?"
-- The body is deliberately not in the index — it is long text, and comparing it
-- after the index has narrowed the rows costs less than storing it twice.
CREATE INDEX IF NOT EXISTS idx_comments_slug_author_created
ON comments (slug, author_name, created_at);
