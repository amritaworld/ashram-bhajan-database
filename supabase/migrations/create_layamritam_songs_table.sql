-- Create layamritam_songs reference table
-- This stores the LayamritamSongs.xlsx data for auto-enrichment

CREATE TABLE IF NOT EXISTS layamritam_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_iast TEXT NOT NULL,
  title_simple TEXT NOT NULL, -- Normalized for matching (IAST → ASCII)
  deity TEXT,
  raagam TEXT,
  taalam TEXT,
  recording_year INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups during matching
CREATE INDEX IF NOT EXISTS idx_layamritam_title_simple ON layamritam_songs (title_simple);

-- Reference data: enable RLS, allow logged-in users to READ, block writes.
-- (Writes happen via the dashboard / service role, which bypasses RLS.)
-- NOTE: do NOT disable RLS — that exposes the table publicly (Supabase advisor).
ALTER TABLE layamritam_songs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read layamritam reference" ON layamritam_songs;
CREATE POLICY "Authenticated can read layamritam reference"
  ON layamritam_songs FOR SELECT TO authenticated USING (true);

-- Add helpful comment
COMMENT ON TABLE layamritam_songs IS 'Reference data from LayamritamSongs.xlsx for auto-enriching bhajans with theme (deity), raga, tala, and year';
