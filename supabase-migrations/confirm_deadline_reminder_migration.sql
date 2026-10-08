-- Tracks when the "48 hours before auto-confirmation" reminder email was sent
-- to an issue's reporter, so it's sent only once per resolution cycle (reusing
-- the same approach as resolution_reminder_sent_at for the weekly reminders).
--
-- Run in Supabase Dashboard -> SQL Editor -> New Query -> paste & run.

ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS confirm_deadline_reminder_sent_at TIMESTAMPTZ;
