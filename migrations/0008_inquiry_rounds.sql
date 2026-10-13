-- Additive only: legacy inquiry bodies, images and revisions remain unchanged.
CREATE TABLE IF NOT EXISTS studio_inquiry_rounds (
 project_id TEXT NOT NULL, department TEXT NOT NULL,
 round_number INTEGER NOT NULL CHECK(round_number BETWEEN 1 AND 999),
 status TEXT NOT NULL CHECK(status IN ('DRAFT','SENT')),
 body TEXT NOT NULL CHECK(length(CAST(body AS BLOB)) <= 10000),
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 PRIMARY KEY(project_id, department, round_number)
);
CREATE TRIGGER IF NOT EXISTS sync_studio_inquiry_rounds_insert AFTER INSERT ON studio_inquiry_rounds BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inquiries'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_inquiry_rounds_update AFTER UPDATE ON studio_inquiry_rounds BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='inquiries'; END;
