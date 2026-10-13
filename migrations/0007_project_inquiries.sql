-- Additive only: existing schedules, accounts, reports and archives are unchanged.
CREATE TABLE IF NOT EXISTS studio_project_inquiries (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, department TEXT NOT NULL,
 author_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('DRAFT','REGISTERED')),
 body TEXT NOT NULL CHECK(length(CAST(body AS BLOB)) <= 1800000),
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_inquiries_project ON studio_project_inquiries(project_id, updated_at);
INSERT OR IGNORE INTO studio_sync_versions(key,revision) VALUES ('inquiries',0);
CREATE TRIGGER IF NOT EXISTS sync_studio_inquiries_insert AFTER INSERT ON studio_project_inquiries BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inquiries'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_inquiries_update AFTER UPDATE ON studio_project_inquiries BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inquiries'; END;
