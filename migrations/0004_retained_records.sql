CREATE TABLE IF NOT EXISTS studio_project_archive (project_id TEXT PRIMARY KEY,archived_at TEXT NOT NULL,archived_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_legacy_worklogs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,department TEXT NOT NULL,body TEXT NOT NULL,imported_at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS sync_legacy_worklogs AFTER INSERT ON studio_legacy_worklogs BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='personal'; END;
