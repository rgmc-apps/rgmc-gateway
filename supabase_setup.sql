-- RGMC Gateway — Access Control Setup
-- Run this in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste & run
--
-- NOTE: Table lives in the PUBLIC schema so no extra
-- "Exposed schemas" configuration is required.

-- Drop old table if you ran the previous rgmc_main version
DROP TABLE IF EXISTS rgmc_main.access_requests;

-- Access requests table (public schema — always exposed by PostgREST)
CREATE TABLE IF NOT EXISTS public.access_requests (
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

-- Indexes for the two lookup paths the app uses
CREATE INDEX IF NOT EXISTS idx_ar_approval_token
    ON public.access_requests (approval_token);

CREATE INDEX IF NOT EXISTS idx_ar_status
    ON public.access_requests (status);

-- Row Level Security — service role key bypasses RLS automatically;
-- this blocks direct browser/anon access to the table.
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
