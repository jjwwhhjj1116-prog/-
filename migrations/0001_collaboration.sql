-- 기존 프로젝트·회의록 테이블/자료를 변경하지 않는 추가 스키마.
CREATE TABLE IF NOT EXISTS studio_users (
 id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, email TEXT NOT NULL,
 name TEXT NOT NULL, department TEXT NOT NULL, position TEXT NOT NULL,
 profile TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS studio_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS studio_login_attempts (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, until_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS studio_projects (id TEXT PRIMARY KEY, body TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_meetings (
 id TEXT PRIMARY KEY, author_id TEXT NOT NULL, department TEXT NOT NULL,
 body TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL,
 archive_revision INTEGER NOT NULL DEFAULT 0, archive_url TEXT, archive_error TEXT,
 removed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS studio_reviews (
 id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, revision INTEGER NOT NULL,
 recipient_id TEXT NOT NULL, stage TEXT NOT NULL, read_at TEXT, decision TEXT, decided_at TEXT,
 UNIQUE(meeting_id, revision, recipient_id)
);
CREATE TABLE IF NOT EXISTS studio_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, meeting_id TEXT NOT NULL, message TEXT NOT NULL,
 created_at TEXT NOT NULL, read_at TEXT
);
CREATE INDEX IF NOT EXISTS studio_notifications_user ON studio_notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS studio_reviews_recipient ON studio_reviews(recipient_id, decision);
CREATE TABLE IF NOT EXISTS studio_archive_files (id TEXT PRIMARY KEY, file_id TEXT UNIQUE NOT NULL);

CREATE TABLE IF NOT EXISTS studio_oauth_states (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS studio_sync_versions (key TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO studio_sync_versions (key,revision) VALUES ('projects',0);
INSERT OR IGNORE INTO studio_sync_versions (key,revision) VALUES ('meetings',0);
INSERT OR IGNORE INTO studio_sync_versions (key,revision) VALUES ('inbox',0);
INSERT OR IGNORE INTO studio_sync_versions (key,revision) VALUES ('directory',0);
CREATE TRIGGER IF NOT EXISTS sync_studio_projects_insert AFTER INSERT ON studio_projects BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='projects'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_projects_update AFTER UPDATE ON studio_projects BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='projects'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_projects_delete AFTER DELETE ON studio_projects BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='projects'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_meetings_insert AFTER INSERT ON studio_meetings BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_meetings_update AFTER UPDATE ON studio_meetings BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_meetings_delete AFTER DELETE ON studio_meetings BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_reviews_insert AFTER INSERT ON studio_reviews BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_reviews_update AFTER UPDATE ON studio_reviews BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_reviews_delete AFTER DELETE ON studio_reviews BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='meetings'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_notifications_insert AFTER INSERT ON studio_notifications BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inbox'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_notifications_update AFTER UPDATE ON studio_notifications BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inbox'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_notifications_delete AFTER DELETE ON studio_notifications BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inbox'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_users_insert AFTER INSERT ON studio_users BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='directory'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_users_update AFTER UPDATE ON studio_users BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='directory'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_users_delete AFTER DELETE ON studio_users BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='directory'; END;
