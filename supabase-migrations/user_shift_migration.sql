ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_days text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_start time;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_end time;
