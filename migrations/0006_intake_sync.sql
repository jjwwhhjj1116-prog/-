CREATE TABLE IF NOT EXISTS studio_intake_documents (
  id TEXT PRIMARY KEY, document_no INTEGER NOT NULL UNIQUE,
  data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_intake_sync (
  id TEXT PRIMARY KEY, last_success TEXT, item_count INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
