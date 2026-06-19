-- Add tags column to systems table
-- Tags are stored as a comma-separated list of aliases/common names for the system
ALTER TABLE systems ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';
