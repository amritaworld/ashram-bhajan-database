-- Migration: Add original_bhajan_id column to bhajans table
-- Purpose: Enable linking translations to their original bhajan (tune groups)
-- Date: 2026-06-01

ALTER TABLE bhajans
ADD COLUMN original_bhajan_id UUID REFERENCES bhajans(id) ON DELETE SET NULL;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_bhajans_original_bhajan_id ON bhajans(original_bhajan_id);

-- Add comment for documentation
COMMENT ON COLUMN bhajans.original_bhajan_id IS 'Links a translation to its original bhajan. NULL means this IS the original.';
