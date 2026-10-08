-- Lets an assignee resolve or comment on their issue straight from the
-- assignment email, with no gateway login required. A random token is
-- (re)issued on the issues row every time the ticket is assigned/reassigned;
-- the token only ever matches the current assignment, so an old email link
-- stops working once the ticket moves to someone else.
--
-- Run in Supabase Dashboard -> SQL Editor -> New Query -> paste & run.

ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS email_action_token TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS resolved_via_email BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_email_action_token
  ON public.issues(email_action_token)
  WHERE email_action_token IS NOT NULL;
