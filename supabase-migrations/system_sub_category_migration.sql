-- Add system_sub_category to the systems table: a user-facing generic group
-- name (e.g. several systems users know by one common name), used to drive
-- the IT helpdesk form's Software/Application sub-category dropdown, which
-- only lists distinct, non-blank values set up here.
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run.

ALTER TABLE systems ADD COLUMN IF NOT EXISTS system_sub_category TEXT;
