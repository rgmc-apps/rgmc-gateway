-- Add story_points column to dev_items (1 story point = 1 day of effort)
ALTER TABLE public.dev_items
  ADD COLUMN IF NOT EXISTS story_points INTEGER CHECK (story_points IS NULL OR story_points >= 0);
