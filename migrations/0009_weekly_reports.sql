CREATE TABLE IF NOT EXISTS studio_reporting_settings (id TEXT PRIMARY KEY,body TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS studio_weekly_reports (week_start TEXT PRIMARY KEY,week_end TEXT NOT NULL,sent_at TEXT NOT NULL,recipient_ids TEXT NOT NULL,body TEXT NOT NULL);
