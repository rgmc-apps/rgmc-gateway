-- Add Windows App support to systems table
ALTER TABLE systems ADD COLUMN IF NOT EXISTS is_windows_based BOOLEAN DEFAULT false;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS windows_launcher_url TEXT;
ALTER TABLE systems ADD COLUMN IF NOT EXISTS windows_manifest_url TEXT;

-- MANUAL STEP: Create a new Supabase Storage bucket named "system-files"
-- Settings: Public bucket = true (so launcher/manifest URLs are publicly accessible)
-- Go to: Supabase Dashboard > Storage > New bucket > name: system-files > Public: ON
