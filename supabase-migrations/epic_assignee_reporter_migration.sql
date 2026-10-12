-- Adds assignee/reporter name+email columns to epics. These are denormalized
-- copies (not a username FK) so a reporter who never had a gateway account
-- can still be recorded, and existing rows aren't disturbed when the
-- underlying user's name/email changes later.
ALTER TABLE public.epics
  ADD COLUMN IF NOT EXISTS assignee_name  TEXT,
  ADD COLUMN IF NOT EXISTS assignee_email TEXT,
  ADD COLUMN IF NOT EXISTS reporter_name  TEXT,
  ADD COLUMN IF NOT EXISTS reporter_email TEXT;
