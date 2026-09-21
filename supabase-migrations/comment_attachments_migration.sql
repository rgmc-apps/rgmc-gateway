ALTER TABLE epic_comments ADD COLUMN IF NOT EXISTS attachment_urls text[];
ALTER TABLE dev_activity_logs ADD COLUMN IF NOT EXISTS attachment_urls text[];
ALTER TABLE issue_comments ADD COLUMN IF NOT EXISTS attachment_urls text[];
