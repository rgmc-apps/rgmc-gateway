-- Migration: add assigned_to column to user_tasks
-- Run in Supabase SQL Editor

ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT;
