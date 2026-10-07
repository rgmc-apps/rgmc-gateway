-- Enforce "one email = one user": case-insensitive unique index on users.email.
-- NULL/empty emails are excluded so existing rows with no email on file don't
-- conflict with each other.
--
-- Run in Supabase Dashboard -> SQL Editor -> New Query -> paste & run.

-- Step 1 (optional but recommended): check for existing duplicates first —
-- if this returns any rows, the CREATE UNIQUE INDEX below will fail until
-- you resolve them (merge the accounts or clear/correct one of the emails).
--
-- SELECT lower(email) AS email, array_agg(username) AS usernames
-- FROM public.users
-- WHERE email IS NOT NULL AND email <> ''
-- GROUP BY lower(email)
-- HAVING COUNT(*) > 1;

-- Step 2: create the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON public.users (lower(email))
    WHERE email IS NOT NULL AND email <> '';
