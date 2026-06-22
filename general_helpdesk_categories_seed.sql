-- Seed: General Helpdesk categories and request types
-- Run in Supabase SQL Editor.
--
-- category_group matches the department name so the frontend can filter
-- categories by selected handling department (ghReqDept).
-- 'Other' uses group='General' and always shows regardless of dept filter.
--
-- Assumes request_category has a unique constraint on category_name.
-- Assumes request_type has no unique constraint (safe to re-run via WHERE NOT EXISTS guard).

-- ── Categories ───────────────────────────────────────────────────────────────

INSERT INTO request_category (category_name, category_desc, category_group)
VALUES
  ('Administrative / General Affairs', 'General administrative requests and office-related concerns',   'Administrative / General Affairs'),
  ('Human Resources',                  'HR-related requests, payroll, benefits, and people concerns',   'Human Resources'),
  ('Finance / Accounting',             'Finance, expense, invoice, and accounting concerns',            'Finance / Accounting'),
  ('Facilities & Maintenance',         'Office facilities, equipment, and maintenance concerns',        'Facilities & Maintenance'),
  ('Operations',                       'Operational processes, logistics, and coordination concerns',   'Operations'),
  ('Safety & Security',                'Workplace safety, security incidents, and hazard reports',      'Safety & Security'),
  ('Legal / Compliance',               'Legal, regulatory, policy, and compliance inquiries',           'Legal / Compliance'),
  ('Other',                            'General concerns that do not fit any other category',           'General')
ON CONFLICT (category_name) DO UPDATE
  SET category_group = EXCLUDED.category_group;


-- ── Request Types ─────────────────────────────────────────────────────────────

-- Administrative / General Affairs
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Administrative / General Affairs', v.request_type, true
FROM (VALUES
  ('Office Supplies Request'),
  ('Document Request'),
  ('Room / Venue Booking'),
  ('Company ID / Badge Request'),
  ('Travel Arrangement'),
  ('Other Administrative Request')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Administrative / General Affairs'
    AND rt.request_type = v.request_type
);

-- Human Resources
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Human Resources', v.request_type, true
FROM (VALUES
  ('Leave Request Inquiry'),
  ('Payroll / Compensation Inquiry'),
  ('Benefits Inquiry'),
  ('Employee Records Update'),
  ('Onboarding / Offboarding'),
  ('Performance Review Inquiry'),
  ('Other HR Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Human Resources'
    AND rt.request_type = v.request_type
);

-- Finance / Accounting
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Finance / Accounting', v.request_type, true
FROM (VALUES
  ('Expense Reimbursement'),
  ('Invoice Processing'),
  ('Budget Inquiry'),
  ('Purchase Order Request'),
  ('Payment Follow-up'),
  ('Other Finance Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Finance / Accounting'
    AND rt.request_type = v.request_type
);

-- Facilities & Maintenance
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Facilities & Maintenance', v.request_type, true
FROM (VALUES
  ('Equipment Repair Request'),
  ('Furniture Request'),
  ('Cleaning / Housekeeping Request'),
  ('Air Conditioning / Electrical Issue'),
  ('Other Facilities Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Facilities & Maintenance'
    AND rt.request_type = v.request_type
);

-- Operations
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Operations', v.request_type, true
FROM (VALUES
  ('Process Inquiry'),
  ('Logistics Coordination'),
  ('Inventory Request'),
  ('Vendor Coordination'),
  ('Other Operations Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Operations'
    AND rt.request_type = v.request_type
);

-- Safety & Security
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Safety & Security', v.request_type, true
FROM (VALUES
  ('Safety Hazard Report'),
  ('Security Incident Report'),
  ('Accident / Injury Report'),
  ('Access Badge / Security Pass'),
  ('Other Safety Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Safety & Security'
    AND rt.request_type = v.request_type
);

-- Legal / Compliance
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Legal / Compliance', v.request_type, true
FROM (VALUES
  ('Contract Review Request'),
  ('Regulatory Compliance Inquiry'),
  ('Legal Document Request'),
  ('Policy Clarification'),
  ('Data Privacy Concern'),
  ('Other Legal Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Legal / Compliance'
    AND rt.request_type = v.request_type
);

-- Other
INSERT INTO request_type (request_category, request_type, is_visible)
SELECT 'Other', v.request_type, true
FROM (VALUES
  ('General Inquiry'),
  ('Feedback / Suggestion'),
  ('Other Concern')
) AS v(request_type)
WHERE NOT EXISTS (
  SELECT 1 FROM request_type rt
  WHERE rt.request_category = 'Other'
    AND rt.request_type = v.request_type
);
