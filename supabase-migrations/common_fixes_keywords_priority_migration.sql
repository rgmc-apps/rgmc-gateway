-- Migration: Keyword detection + impact/urgency/priority on common fixes.
--
-- `keywords` holds the phrases a reporter would typically type in a ticket's
-- title/description for this known issue — matched against new IT/general
-- helpdesk tickets to auto-link them to this fix and auto-apply the impact,
-- urgency, and priority configured here.
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run.

ALTER TABLE common_fixes
    ADD COLUMN IF NOT EXISTS keywords        TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS business_impact TEXT,
    ADD COLUMN IF NOT EXISTS urgency         TEXT,
    ADD COLUMN IF NOT EXISTS priority        TEXT;
