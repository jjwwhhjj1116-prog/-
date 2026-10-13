CREATE TABLE IF NOT EXISTS studio_drive_uploads (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, resume_key TEXT NOT NULL,
 metadata TEXT NOT NULL, google_id TEXT NOT NULL, session_url TEXT,
 offset INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, UNIQUE(user_id,resume_key)
);
