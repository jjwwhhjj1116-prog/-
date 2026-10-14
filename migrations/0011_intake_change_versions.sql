-- Poll the small revision table; repair missing schedules when projects are read.
INSERT OR IGNORE INTO studio_sync_versions(key,revision) VALUES ('intake',0);
CREATE TRIGGER IF NOT EXISTS sync_studio_intake_insert AFTER INSERT ON studio_intake_documents
BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='intake'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_intake_update AFTER UPDATE ON studio_intake_documents
BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='intake'; END;
CREATE TRIGGER IF NOT EXISTS sync_studio_intake_delete AFTER DELETE ON studio_intake_documents
BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='intake'; END;
CREATE INDEX IF NOT EXISTS idx_studio_projects_site_code
ON studio_projects(upper(trim(json_extract(body,'$.code')))) WHERE json_valid(body);
