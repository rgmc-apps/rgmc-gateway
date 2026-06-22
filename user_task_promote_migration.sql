-- Adds user_task_id to issues so an issue can be promoted to a user task (user_tasks table)
-- Run in Supabase SQL Editor

ALTER TABLE issues ADD COLUMN IF NOT EXISTS user_task_id UUID;
