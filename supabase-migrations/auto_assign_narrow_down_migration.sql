-- Migration: Narrow down auto-assign below the category level, plus a
-- dedicated "visible on the IT helpdesk form" flag for systems.
--
-- Adds assigned_to_username (nullable FK -> users.username) to request_type,
-- non_software_items, and systems, so a ticket's sub-category or request
-- type can override the category-level auto-assign mapping for just that
-- item. Match priority at ticket-creation time (see services/auto_assign.py):
--   1. Sub-category (systems row for "Software/Application", else
--      non_software_items row)
--   2. Request type
--   3. Category (existing, broadest fallback)
--
-- is_helpdesk_visible controls whether a system shows up in the IT helpdesk
-- form's sub-category picker when "Software/Application" is selected —
-- separate from the existing is_visible flag, which governs the access
-- request form.
--
-- Run in Supabase → SQL Editor → New Query. Safe to re-run.

ALTER TABLE request_type
    ADD COLUMN IF NOT EXISTS assigned_to_username TEXT
        REFERENCES users(username) ON DELETE SET NULL;

ALTER TABLE non_software_items
    ADD COLUMN IF NOT EXISTS assigned_to_username TEXT
        REFERENCES users(username) ON DELETE SET NULL;

ALTER TABLE systems
    ADD COLUMN IF NOT EXISTS assigned_to_username TEXT
        REFERENCES users(username) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_helpdesk_visible BOOLEAN NOT NULL DEFAULT TRUE;
