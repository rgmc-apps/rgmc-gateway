-- Create dev_item_types lookup table for configurable dev item type values
CREATE TABLE IF NOT EXISTS public.dev_item_types (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE CHECK (name <> ''),
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  is_freeform BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with the existing hardcoded values; "Others" keeps its freeform behaviour
INSERT INTO public.dev_item_types (name, sort_order, is_active, is_freeform)
VALUES
  ('New Feature', 1, true, false),
  ('Improvement', 2, true, false),
  ('Bug Fix',     3, true, false),
  ('Admin Task',  4, true, false),
  ('Discussion',  5, true, false),
  ('Maintenance', 6, true, false),
  ('Others',      7, true, true )
ON CONFLICT (name) DO NOTHING;
