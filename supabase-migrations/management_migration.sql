-- Add is_management flag to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_management BOOLEAN NOT NULL DEFAULT FALSE;
