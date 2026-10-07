-- Migration: Create app_settings table (generic key/value store for admin-configurable
-- settings) and seed the default for issue auto-confirmation.
-- Run in Supabase → SQL Editor → New Query.

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
);

INSERT INTO app_settings (key, value)
VALUES ('auto_confirm_days', '30')
ON CONFLICT (key) DO NOTHING;
