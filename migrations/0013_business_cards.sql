-- 기술본부 인맥관리. 명함 원본은 회사 Google Drive에만 저장한다.
CREATE TABLE IF NOT EXISTS studio_business_card_credentials (
 id TEXT PRIMARY KEY CHECK(id='gemini'), ciphertext TEXT NOT NULL, iv TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES studio_users(id), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_business_card_analyses (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES studio_users(id),
 source_sha256 TEXT NOT NULL, model TEXT NOT NULL, fields_json TEXT NOT NULL,
 expires_at TEXT NOT NULL, consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS studio_business_card_analyses_actor ON studio_business_card_analyses(actor_id,expires_at);
CREATE TABLE IF NOT EXISTS studio_business_card_operations (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES studio_users(id), fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','FAILED','RECONCILIATION_REQUIRED')),
 card_id TEXT NOT NULL, google_file_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_business_cards (
 id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL UNIQUE REFERENCES studio_business_card_analyses(id),
 fields_json TEXT NOT NULL, name TEXT NOT NULL, company TEXT NOT NULL, search_text TEXT NOT NULL,
 source_sha256 TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
 google_file_id TEXT NOT NULL, google_folder_id TEXT NOT NULL, model TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES studio_users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS studio_business_cards_search ON studio_business_cards(deleted_at,name,company);
CREATE INDEX IF NOT EXISTS studio_business_cards_source ON studio_business_cards(source_sha256,deleted_at);
CREATE TABLE IF NOT EXISTS studio_business_card_events (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES studio_business_cards(id),
 actor_id TEXT NOT NULL REFERENCES studio_users(id), action TEXT NOT NULL,
 created_at TEXT NOT NULL
);
