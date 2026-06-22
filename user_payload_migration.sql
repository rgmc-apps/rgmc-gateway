-- Adds user_payload column to issues table
-- Run in Supabase SQL Editor before using the new field on the report issue form

ALTER TABLE issues ADD COLUMN IF NOT EXISTS user_payload TEXT;
