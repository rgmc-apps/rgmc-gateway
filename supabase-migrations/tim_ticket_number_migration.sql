-- Changes the issue ticket_number format from the old "TKT-####" scheme to
-- "TIM-yymmdd##", where the 2-digit series resets to 00 at the start of each
-- day (Asia/Manila time). Existing ticket_number values are NOT touched —
-- this only changes what gets generated for issues created from here on.
--
-- Run in Supabase Dashboard -> SQL Editor -> New Query -> paste & run.

-- 1. Remove whatever previously generated ticket_number (trigger and/or
--    column default), without touching any existing row's value.
DO $$
DECLARE
  trig RECORD;
BEGIN
  FOR trig IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.issues'::regclass
      AND NOT t.tgisinternal
      AND pg_get_functiondef(p.oid) ILIKE '%ticket_number%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.issues', trig.tgname);
  END LOOP;
END $$;

ALTER TABLE public.issues ALTER COLUMN ticket_number DROP DEFAULT;

-- 2. Per-day counter — one row per Asia/Manila calendar date, incremented
--    atomically (the UPDATE takes a row lock, so concurrent inserts on the
--    same day are serialized and never collide).
CREATE TABLE IF NOT EXISTS public.tim_ticket_counters (
    ticket_date DATE PRIMARY KEY,
    last_seq    INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_tim_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  today DATE := (timezone('Asia/Manila', now()))::date;
  seq   INTEGER;
BEGIN
  INSERT INTO public.tim_ticket_counters (ticket_date, last_seq)
  VALUES (today, 0)
  ON CONFLICT (ticket_date) DO NOTHING;

  UPDATE public.tim_ticket_counters
  SET last_seq = last_seq + 1
  WHERE ticket_date = today
  RETURNING last_seq INTO seq;

  RETURN 'TIM-' || to_char(today, 'YYMMDD') || lpad((seq - 1)::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tim_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := public.generate_tim_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_tim_ticket_number ON public.issues;
CREATE TRIGGER trg_set_tim_ticket_number
  BEFORE INSERT ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_tim_ticket_number();
