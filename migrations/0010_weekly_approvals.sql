-- 상신한 주간 원문을 보존하고 결재자별 결정만 별도 기록한다.
CREATE TABLE IF NOT EXISTS studio_weekly_submissions (
 id TEXT PRIMARY KEY, week_start TEXT NOT NULL, week_end TEXT NOT NULL,
 department TEXT NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 sent_at TEXT NOT NULL, body TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('MANUAL','SCHEDULED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_weekly_submission_pending ON studio_weekly_submissions(week_start,department) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS studio_weekly_submission_week ON studio_weekly_submissions(week_start,sent_at);
CREATE TABLE IF NOT EXISTS studio_weekly_submission_recipients (
 submission_id TEXT NOT NULL, recipient_id TEXT NOT NULL, recipient_name TEXT NOT NULL,
 decision TEXT CHECK(decision IN ('APPROVED','REJECTED')), decided_at TEXT, memo TEXT,
 PRIMARY KEY(submission_id,recipient_id),
 FOREIGN KEY(submission_id) REFERENCES studio_weekly_submissions(id)
);
CREATE INDEX IF NOT EXISTS studio_weekly_submission_recipient ON studio_weekly_submission_recipients(recipient_id,decision);
CREATE TRIGGER IF NOT EXISTS sync_weekly_submission_insert AFTER INSERT ON studio_weekly_submissions BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='personal'; END;
CREATE TRIGGER IF NOT EXISTS sync_weekly_submission_update AFTER UPDATE ON studio_weekly_submissions BEGIN UPDATE studio_sync_versions SET revision=revision+1 WHERE key='personal'; END;
