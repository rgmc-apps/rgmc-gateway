-- RGMC Gateway — Access Control Setup
-- Run this in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste & run
--
-- NOTE: Table lives in the PUBLIC schema so no extra
-- "Exposed schemas" configuration is required.

-- Drop old table if you ran the previous rgmc_main version
DROP TABLE IF EXISTS rgmc_main.access_requests;

-- Access requests table (public schema — always exposed by PostgREST)
CREATE TABLE IF NOT EXISTS public.access_requests (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       TEXT        NOT NULL,
    last_name        TEXT        NOT NULL,
    middle_initial   TEXT        NOT NULL DEFAULT '',
    company          TEXT        NOT NULL,
    department       TEXT        NOT NULL,
    position         TEXT        NOT NULL,
    email            TEXT        NOT NULL,
    systems          TEXT[]      NOT NULL DEFAULT '{}',
    status           TEXT        NOT NULL DEFAULT 'pending',
    username         TEXT,
    approval_token   UUID        NOT NULL DEFAULT gen_random_uuid(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at     TIMESTAMPTZ,
    CONSTRAINT chk_ar_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Indexes for the two lookup paths the app uses
CREATE INDEX IF NOT EXISTS idx_ar_approval_token
    ON public.access_requests (approval_token);

CREATE INDEX IF NOT EXISTS idx_ar_status
    ON public.access_requests (status);

-- Row Level Security — service role key bypasses RLS automatically;
-- this blocks direct browser/anon access to the table.
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;


-- ──────────────────────────────────────────────────────────────────────────────
-- Users table
-- Populated on approval; holds the is_admin flag for the admin panel.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
    username       TEXT        PRIMARY KEY,
    first_name     TEXT        NOT NULL DEFAULT '',
    last_name      TEXT        NOT NULL DEFAULT '',
    middle_initial TEXT        NOT NULL DEFAULT '',
    company        TEXT        NOT NULL DEFAULT '',
    department     TEXT        NOT NULL DEFAULT '',
    position       TEXT        NOT NULL DEFAULT '',
    email          TEXT        NOT NULL DEFAULT '',
    systems        TEXT[]      NOT NULL DEFAULT '{}',
    is_admin       BOOLEAN     NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_is_admin
    ON public.users (is_admin) WHERE is_admin = true;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;


-- ──────────────────────────────────────────────────────────────────────────────
-- Systems table
-- Replaces the hardcoded SITES[] in app.py; managed via the admin panel.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.systems (
    id            TEXT        PRIMARY KEY,
    name          TEXT        NOT NULL,
    category      TEXT        NOT NULL,
    primary_url   TEXT        NOT NULL,
    primary_label TEXT        NOT NULL DEFAULT 'Open',
    backup_url    TEXT,
    backup_label  TEXT,
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;

-- Seed systems (mirrors the SITES_FALLBACK list in app.py)
INSERT INTO public.systems (id, name, category, primary_url, primary_label, backup_url, backup_label, sort_order) VALUES
  ('travel-expense',       'RGMC Travel And Expense Web',        'RGMC',      'https://rgmc-portal-935246372408.asia-southeast1.run.app/login?returnUrl=%2F', 'Primary', 'http://portal.rgmcgroup.com:7171/', 'Backup', 10),
  ('creatives',            'RGMC Creatives',                     'RGMC',      'https://rgmccreatives-935246372408.asia-southeast1.run.app/', 'Primary', 'http://portal.rgmcgroup.com:6060/', 'Backup', 20),
  ('production',           'RGMC Production',                    'RGMC',      'https://rgmc-production-935246372408.asia-southeast1.run.app', 'Open', 'http://portal.rgmcgroup.com:8080/login?returnUrl=%2F', 'Backup', 30),
  ('garment-attributes',   'RGMC Garment Attributes Checker AI', 'RGMC',      'https://rgmc-attribute-checker-ai-935246372408.us-central1.run.app/', 'Open', NULL, NULL, 40),
  ('inventory-app',        'RGMC Inventory Mobile App',          'RGMC',      'https://drive.google.com/drive/folders/1uJxDnvHUz_s9qd6l0vs1tmmkoTMp8sFy?usp=drive_link', 'Download APK', NULL, NULL, 50),
  ('rgmc-consignment-app', 'RGMC Consignment Web App',           'RGMC',      'https://rgmc-consignment-webapp-935246372408.asia-southeast1.run.app/', 'Open', NULL, NULL, 60),
  ('sbic-po-uploader',     'SBIC PO Uploader',                   'SBIC',      'https://po-uploader-935246372408.us-central1.run.app/', 'Open', NULL, NULL, 70),
  ('sbic-invoice-separator','SBIC Invoice Separator',            'SBIC',      'https://sbic-invoice-splitter-935246372408.europe-west1.run.app/', 'Open', NULL, NULL, 80),
  ('sbic-ra-upload',       'SBIC RA Upload',                     'SBIC',      'https://ra-uploader-935246372408.us-central1.run.app/', 'Open', NULL, NULL, 90),
  ('nav-keywest',          'Keywest',                            'NAV Sites', 'http://portal.rgmcgroup.com:8088/KEYWEST', 'Open', NULL, NULL, 100),
  ('nav-alvita-prod',      'Alvita Prod',                        'NAV Sites', 'http://portal.rgmcgroup.com:8088/ALVITA_PROD', 'Open', NULL, NULL, 110),
  ('nav-covent-runway-prod','Covent Runway Prod',                'NAV Sites', 'http://portal.rgmcgroup.com:8088/COVENT_RUNWAY_PROD', 'Open', NULL, NULL, 120),
  ('nav-lgap-prod',        'LGAP Prod',                          'NAV Sites', 'http://portal.rgmcgroup.com:8088/LGAP_PROD', 'Open', NULL, NULL, 130),
  ('nav-manila-taste',     'Manila Taste',                       'NAV Sites', 'http://portal.rgmcgroup.com:8088/MANILA_TASTE', 'Open', NULL, NULL, 140),
  ('nav-richfield-live',   'Richfield Live',                     'NAV Sites', 'http://portal.rgmcgroup.com:8088/RICHFIELD_LIVE', 'Open', NULL, NULL, 150),
  ('nav-other-comp-prod',  'Other Comp Prod',                    'NAV Sites', 'http://portal.rgmcgroup.com:8088/OTHER_COMP_PROD/WebClient/', 'Open', NULL, NULL, 160),
  ('nav-suncoast-prod',    'Suncoast Prod',                      'NAV Sites', 'http://portal.rgmcgroup.com:8088/SUNCOAST_PROD', 'Open', NULL, NULL, 170),
  ('nav-usgi-prod-live',   'USGI Prod Live',                     'NAV Sites', 'http://portal.rgmcgroup.com:8088/USGI_PROD_LIVE', 'Open', NULL, NULL, 180),
  ('nav-usgi-lgap-uat',    'USGI LGAP UAT',                      'NAV Sites', 'http://portal.rgmcgroup.com:8088/USGI_LGAP_UAT', 'Open', NULL, NULL, 190)
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────────────────────
-- Migrate existing approved users → users table (run once after creating table)
-- ──────────────────────────────────────────────────────────────────────────────

WITH first_approved AS (
    -- One row per username: the earliest approved record (has merged systems)
    SELECT DISTINCT ON (username)
        username, first_name, last_name,
        COALESCE(middle_initial, '') AS middle_initial,
        company, department, position, email,
        COALESCE(processed_at, created_at) AS joined_at
    FROM public.access_requests
    WHERE status = 'approved' AND username IS NOT NULL
    ORDER BY username, created_at ASC
),
all_systems AS (
    -- Aggregate all approved systems per username (covers additional access rows)
    SELECT
        username,
        ARRAY(
            SELECT DISTINCT s
            FROM public.access_requests ar2,
            LATERAL UNNEST(ar2.systems) AS s
            WHERE ar2.username = fa.username AND ar2.status = 'approved'
        ) AS systems
    FROM first_approved fa
)
INSERT INTO public.users
    (username, first_name, last_name, middle_initial, company, department, position, email, systems, created_at)
SELECT
    fa.username, fa.first_name, fa.last_name, fa.middle_initial,
    fa.company, fa.department, fa.position, fa.email,
    COALESCE(als.systems, '{}'),
    fa.joined_at
FROM first_approved fa
LEFT JOIN all_systems als ON fa.username = als.username
ON CONFLICT (username) DO NOTHING;
