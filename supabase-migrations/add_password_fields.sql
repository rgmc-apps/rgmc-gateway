-- Add password authentication fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash          TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_token   TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
