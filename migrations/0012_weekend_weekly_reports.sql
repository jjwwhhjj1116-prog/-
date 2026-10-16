-- Keep the original Friday snapshot and its pending decision while accepting a separate Monday weekend report.
CREATE UNIQUE INDEX IF NOT EXISTS studio_weekly_submission_pending_kind ON studio_weekly_submissions(week_start,department,COALESCE(json_extract(body,'$.reportKind'),'WEEKLY')) WHERE status='PENDING';
DROP INDEX IF EXISTS studio_weekly_submission_pending;
