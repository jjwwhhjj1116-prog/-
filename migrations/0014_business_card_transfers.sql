-- 명함 휴대폰 촬영 → PC 확인을 위한 10분 임시 전송. 최종 원본은 기존 회사 Drive에만 등록한다.
CREATE TABLE IF NOT EXISTS studio_business_card_transfers (
 token_hash TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES studio_users(id),
 status TEXT NOT NULL CHECK(status IN ('PENDING','UPLOADED')),
 ciphertext TEXT,
 iv TEXT,
 original_name TEXT,
 mime_type TEXT,
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 uploaded_at TEXT
);
CREATE INDEX IF NOT EXISTS studio_business_card_transfers_actor ON studio_business_card_transfers(actor_id,expires_at);
