-- Comments for Angle of Pursuit. Applied to the D1 database with:
--   npx wrangler d1 execute angle-of-pursuit-comments --remote --file=migrations/0001_init.sql
-- (drop --remote to apply to the local dev copy).

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug  TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  approved   INTEGER NOT NULL DEFAULT 0,
  -- salted hash of the poster's IP, for rate-limiting only; never the raw IP
  ip_hash    TEXT,
  user_agent TEXT
);

-- Fast lookup of a post's approved comments, and of the rate-limit window.
CREATE INDEX IF NOT EXISTS idx_comments_post     ON comments (post_slug, approved, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_iphash   ON comments (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_approved ON comments (approved, created_at);
