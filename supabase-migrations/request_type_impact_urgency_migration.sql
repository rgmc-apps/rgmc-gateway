-- Migration: Default business impact + urgency per request type.
--
-- When a reporter picks a request type on the IT/General helpdesk forms,
-- these configured defaults are auto-applied (the impact/urgency dropdowns
-- are disabled on those forms so the reporter can't override them).
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run.

ALTER TABLE request_type
    ADD COLUMN IF NOT EXISTS business_impact TEXT,
    ADD COLUMN IF NOT EXISTS urgency         TEXT;
