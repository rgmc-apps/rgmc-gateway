-- RGMC Gateway — Access Control Setup
-- Run this in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste & run
--
-- ALSO REQUIRED (dashboard step):
--   Settings → API → "Exposed schemas" → add "rgmc_main"
--   Without this, the REST API cannot reach the schema.

-- 1. Schema
CREATE SCHEMA IF NOT EXISTS rgmc_main;

-- 2. Access requests table
CREATE TABLE IF NOT EXISTS rgmc_main.access_requests (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       TEXT        NOT NULL,
    last_name        TEXT        NOT NULL,
    middle_initial   TEXT        NOT NULL DEFAULT '',
    company          TEXT        NOT NULL,
    department       TEXT        NOT NULL,
    position         TEXT        NOT NULL,
    email            TEXT        NOT NULL,
    systems          TEXT[]      NOT NULL DEFAULT '{}',
    status           TEXT        NOT NULL DEFAULT 'pending',
    username         TEXT,
    approval_token   UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at     TIMESTAMPTZ,
    CONSTRAINT chk_ar_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- 3. Indexes for lookup paths used by the app
CREATE INDEX IF NOT EXISTS idx_ar_approval_token
    ON rgmc_main.access_requests (approval_token);

CREATE INDEX IF NOT EXISTS idx_ar_status
    ON rgmc_main.access_requests (status);

-- 4. Row Level Security — service role key bypasses RLS automatically;
--    this prevents direct browser/anon access to the table.
ALTER TABLE rgmc_main.access_requests ENABLE ROW LEVEL SECURITY;
