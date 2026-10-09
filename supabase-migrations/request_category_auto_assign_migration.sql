-- Migration: Auto-assign request categories to a specific person.
--
-- Adds a nullable FK from request_category to users(username). When set,
-- new tickets filed under that category are automatically assigned to that
-- user (and get the usual assignment email). A category can only point to
-- one user at a time; a single user may hold multiple categories.
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run.

ALTER TABLE request_category
    ADD COLUMN IF NOT EXISTS assigned_to_username TEXT
        REFERENCES users(username) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_request_category_assigned_to
    ON request_category (assigned_to_username) WHERE assigned_to_username IS NOT NULL;
