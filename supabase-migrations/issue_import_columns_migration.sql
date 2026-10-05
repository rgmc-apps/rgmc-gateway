-- Migration: Add columns needed to import legacy tickets (Cognito Forms
-- "RGMC IT Online Helpdesk" export) into the issues table.
-- Run in Supabase → SQL Editor → New Query.

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS legacy_ticket_id     TEXT,
    ADD COLUMN IF NOT EXISTS legacy_assignee_name TEXT,
    ADD COLUMN IF NOT EXISTS imported_from        TEXT,
    ADD COLUMN IF NOT EXISTS imported_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS legacy_raw_data      JSONB;

COMMENT ON COLUMN issues.legacy_ticket_id     IS 'Original ticket number/# from the source system (e.g. Cognito Forms) — used to prevent duplicate re-imports.';
COMMENT ON COLUMN issues.legacy_assignee_name IS 'Free-text assignee name from the legacy system when it could not be confidently matched to a users.username.';
COMMENT ON COLUMN issues.imported_from        IS 'Source tag for bulk-imported tickets, e.g. "cognito_forms". NULL for tickets created natively in this app.';
COMMENT ON COLUMN issues.imported_at          IS 'When the bulk import ran (distinct from created_at, which preserves the original submission date).';
COMMENT ON COLUMN issues.legacy_raw_data      IS 'Full original row from the import file, keyed by column header — full-fidelity backup of fields that have no dedicated column (e.g. Date Assigned, satisfaction ratings, signature captures, attachment filenames).';

CREATE INDEX IF NOT EXISTS idx_issues_legacy_ticket_id ON issues (legacy_ticket_id) WHERE legacy_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_imported_from    ON issues (imported_from)    WHERE imported_from IS NOT NULL;
