-- Add story_points column to dev_items (1 story point = 1 day of effort)
ALTER TABLE public.dev_items
  ADD COLUMN IF NOT EXISTS story_points NUMERIC(5,2) CHECK (story_points IS NULL OR story_points >= 0);

-- Allow decimal values (e.g. 0.5 = half day, 0.25 = quarter day)
ALTER TABLE public.dev_items
  ALTER COLUMN story_points TYPE NUMERIC(5,2) USING story_points::NUMERIC(5,2);
