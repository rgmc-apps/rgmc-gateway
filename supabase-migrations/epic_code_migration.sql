-- Add auto-generated epic_code to epics (EP-XXXX format, mirrors dev_item_code pattern)
CREATE SEQUENCE IF NOT EXISTS public.epic_code_seq START 1;

ALTER TABLE public.epics
  ADD COLUMN IF NOT EXISTS epic_code TEXT
    DEFAULT ('EP-' || lpad(nextval('public.epic_code_seq')::text, 4, '0'));

-- Backfill existing rows that have no code yet
UPDATE public.epics
SET epic_code = 'EP-' || lpad(nextval('public.epic_code_seq')::text, 4, '0')
WHERE epic_code IS NULL;
