-- Migration: Update request_category.category_group to use department codes
-- and add IT-specific categories for the IT Helpdesk.
--
-- Run in Supabase → SQL Editor → New Query.
-- Safe to re-run: INSERT uses ON CONFLICT DO UPDATE; UPDATE is idempotent.

-- ── Step 1: Update existing general-helpdesk category groups ─────────────────
-- Maps category_group (currently department full name) → department_code.
-- Skips rows whose group is already a code or is 'General' / 'IT'.

UPDATE request_category rc
SET    category_group = d.department_code
FROM   departments d
WHERE  lower(trim(d.department_name)) = lower(trim(rc.category_group))
  AND  rc.category_group NOT IN ('General', 'IT');


-- ── Step 2: IT Helpdesk categories ───────────────────────────────────────────
-- These are shown exclusively on /helpdesk (IT-only portal).
-- category_group = 'IT' is the sentinel the backend filters on.

INSERT INTO request_category (category_name, category_desc, category_group)
VALUES
  ('Software/Application',      'Software, application, or system-level issues',           'IT'),
  ('Hardware',                  'Computer hardware, devices, and peripheral problems',      'IT'),
  ('Network',                   'Network, internet, VPN, and connectivity issues',          'IT'),
  ('Account & Access',          'User accounts, passwords, permissions, and access control','IT'),
  ('Email & Collaboration',     'Email, Teams, calendar, and communication tool issues',    'IT'),
  ('Printer & Peripherals',     'Printers, scanners, monitors, and other peripherals',      'IT'),
  ('Data & Backup',             'Data recovery, file loss, backup, and storage concerns',   'IT'),
  ('Security Incident',         'Malware, phishing, unauthorized access, or cyber threats', 'IT'),
  ('Other IT Request',          'IT requests not covered by the categories above',          'IT')
ON CONFLICT (category_name) DO UPDATE
  SET category_group = EXCLUDED.category_group;


-- ── Step 3: IT request types ─────────────────────────────────────────────────

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Account & Access', v.request_type, true
FROM (VALUES
  ('Password Reset'),
  ('New Account Request'),
  ('Account Unlock'),
  ('Permission / Role Change'),
  ('VPN Access Request'),
  ('Other Access Request')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Account & Access' AND rt.request_type = v.request_type
);

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Email & Collaboration', v.request_type, true
FROM (VALUES
  ('Email Not Working'),
  ('Email Configuration Issue'),
  ('Calendar / Meeting Issue'),
  ('Teams / Chat Issue'),
  ('Other Email or Collaboration Issue')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Email & Collaboration' AND rt.request_type = v.request_type
);

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Printer & Peripherals', v.request_type, true
FROM (VALUES
  ('Printer Not Working'),
  ('Printer Setup / Installation'),
  ('Scanner Issue'),
  ('Monitor Issue'),
  ('Keyboard / Mouse Issue'),
  ('Other Peripheral Issue')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Printer & Peripherals' AND rt.request_type = v.request_type
);

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Data & Backup', v.request_type, true
FROM (VALUES
  ('File Recovery Request'),
  ('Backup Failure'),
  ('Storage Full / Quota Issue'),
  ('Data Transfer Request'),
  ('Other Data / Backup Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Data & Backup' AND rt.request_type = v.request_type
);

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Security Incident', v.request_type, true
FROM (VALUES
  ('Malware / Virus Detected'),
  ('Phishing / Suspicious Email'),
  ('Unauthorized Access Attempt'),
  ('Data Breach Concern'),
  ('Other Security Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Security Incident' AND rt.request_type = v.request_type
);

INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Other IT Request', v.request_type, true
FROM (VALUES
  ('General IT Inquiry'),
  ('New Equipment Request'),
  ('Software Installation Request'),
  ('IT Consultation'),
  ('Other')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Other IT Request' AND rt.request_type = v.request_type
);
