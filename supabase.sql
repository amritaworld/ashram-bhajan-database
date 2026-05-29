-- ============================================================================
-- ASHRAM BHAJAN DATABASE - COMPLETE SUPABASE SQL SCHEMA
-- ============================================================================
-- Tables: users, bhajans, bhajan_languages, bhajan_writers, bhajan_singers, bhajan_audio_files
-- Auth: Signup trigger to create user profile
-- RLS: Row-level security for viewer/contributor/admin roles
-- Storage: Audio files and theme images buckets
-- ============================================================================

-- ============================================================================
-- 1. CUSTOM TYPES
-- ============================================================================
CREATE TYPE user_role AS ENUM ('viewer', 'contributor', 'admin');
CREATE TYPE bhajan_status AS ENUM ('published', 'draft', 'archived');

-- ============================================================================
-- 2. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role user_role DEFAULT 'viewer',
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- 3. BHAJANS TABLE (Main content)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bhajans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  theme TEXT,
  raga TEXT,
  tala TEXT,
  duration_minutes NUMERIC,
  year INTEGER,
  lyrics TEXT,
  meaning TEXT,
  status bhajan_status DEFAULT 'draft',
  copyright_holder TEXT,
  copyright_status TEXT,
  copyright_license TEXT,
  publication_status TEXT,
  internal_notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bhajans_status ON bhajans(status);
CREATE INDEX IF NOT EXISTS idx_bhajans_theme ON bhajans(theme);
CREATE INDEX IF NOT EXISTS idx_bhajans_created_by ON bhajans(created_by);
CREATE INDEX IF NOT EXISTS idx_bhajans_name ON bhajans(name);
CREATE INDEX IF NOT EXISTS idx_bhajans_created_at ON bhajans(created_at);

-- ============================================================================
-- 4. BHAJAN_LANGUAGES TABLE (Multi-language support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bhajan_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bhajan_id UUID NOT NULL REFERENCES bhajans(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL, -- 'en', 'ml', etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(bhajan_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_bhajan_languages_bhajan_id ON bhajan_languages(bhajan_id);

-- ============================================================================
-- 5. BHAJAN_WRITERS TABLE (Lyricists & Composers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bhajan_writers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bhajan_id UUID NOT NULL REFERENCES bhajans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- 'Lyricist', 'Composer', etc.
  email TEXT,
  phone TEXT,
  specialization TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhajan_writers_bhajan_id ON bhajan_writers(bhajan_id);
CREATE INDEX IF NOT EXISTS idx_bhajan_writers_name ON bhajan_writers(name);

-- ============================================================================
-- 6. BHAJAN_SINGERS TABLE (Performers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bhajan_singers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bhajan_id UUID NOT NULL REFERENCES bhajans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- 'Lead Singer', 'Vocalist', etc.
  email TEXT,
  phone TEXT,
  specialization TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhajan_singers_bhajan_id ON bhajan_singers(bhajan_id);
CREATE INDEX IF NOT EXISTS idx_bhajan_singers_name ON bhajan_singers(name);

-- ============================================================================
-- 7. BHAJAN_AUDIO_FILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS bhajan_audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bhajan_id UUID NOT NULL REFERENCES bhajans(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Path in Supabase Storage
  quality TEXT, -- 'high', 'medium', 'low', '192kbps', '320kbps', etc.
  recording_date DATE,
  file_size_bytes BIGINT,
  duration_seconds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bhajan_audio_files_bhajan_id ON bhajan_audio_files(bhajan_id);

-- ============================================================================
-- 8. FUNCTION: Auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to users
CREATE TRIGGER users_updated_at_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Apply to bhajans
CREATE TRIGGER bhajans_updated_at_trigger
BEFORE UPDATE ON bhajans
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. FUNCTION: Handle new user signup (Create profile after auth.users insert)
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'viewer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users table
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 10. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bhajans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bhajan_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bhajan_writers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bhajan_singers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bhajan_audio_files ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE RLS
-- ============================================================================

-- Anyone can view all users (for contributor selection, etc.)
CREATE POLICY "Users are viewable by everyone" ON users
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can update any user
CREATE POLICY "Admins can update any user" ON users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete users
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- BHAJANS TABLE RLS
-- ============================================================================

-- Anyone can view published bhajans
CREATE POLICY "Published bhajans are viewable by everyone" ON bhajans
  FOR SELECT USING (status = 'published');

-- Contributors can view all bhajans (their own + others)
CREATE POLICY "Contributors can view all bhajans" ON bhajans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Admins can view all bhajans
CREATE POLICY "Admins can view all bhajans" ON bhajans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Contributors can create bhajans
CREATE POLICY "Contributors can create bhajans" ON bhajans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Contributors can update their own bhajans
CREATE POLICY "Contributors can update own bhajans" ON bhajans
  FOR UPDATE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update any bhajan
CREATE POLICY "Admins can update any bhajan" ON bhajans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Contributors can delete their own bhajans
CREATE POLICY "Contributors can delete own bhajans" ON bhajans
  FOR DELETE USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- BHAJAN_LANGUAGES TABLE RLS
-- ============================================================================

-- Anyone can view languages of published bhajans
CREATE POLICY "Languages of published bhajans are viewable" ON bhajan_languages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bhajans WHERE bhajans.id = bhajan_languages.bhajan_id AND status = 'published'
    ) OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Contributors can insert/update/delete languages for their bhajans
CREATE POLICY "Contributors can manage bhajan languages" ON bhajan_languages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bhajans
      WHERE bhajans.id = bhajan_languages.bhajan_id
      AND (bhajans.created_by = auth.uid() OR
           EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND role = 'admin'))
    )
  );

-- ============================================================================
-- BHAJAN_WRITERS TABLE RLS
-- ============================================================================

-- Anyone can view writers of published bhajans
CREATE POLICY "Writers of published bhajans are viewable" ON bhajan_writers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bhajans WHERE bhajans.id = bhajan_writers.bhajan_id AND status = 'published'
    ) OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Contributors can manage writers for their bhajans
CREATE POLICY "Contributors can manage bhajan writers" ON bhajan_writers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bhajans
      WHERE bhajans.id = bhajan_writers.bhajan_id
      AND (bhajans.created_by = auth.uid() OR
           EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND role = 'admin'))
    )
  );

-- ============================================================================
-- BHAJAN_SINGERS TABLE RLS
-- ============================================================================

-- Anyone can view singers of published bhajans
CREATE POLICY "Singers of published bhajans are viewable" ON bhajan_singers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bhajans WHERE bhajans.id = bhajan_singers.bhajan_id AND status = 'published'
    ) OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Contributors can manage singers for their bhajans
CREATE POLICY "Contributors can manage bhajan singers" ON bhajan_singers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bhajans
      WHERE bhajans.id = bhajan_singers.bhajan_id
      AND (bhajans.created_by = auth.uid() OR
           EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND role = 'admin'))
    )
  );

-- ============================================================================
-- BHAJAN_AUDIO_FILES TABLE RLS
-- ============================================================================

-- Anyone can view audio files of published bhajans
CREATE POLICY "Audio files of published bhajans are viewable" ON bhajan_audio_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bhajans WHERE bhajans.id = bhajan_audio_files.bhajan_id AND status = 'published'
    ) OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('contributor', 'admin')
    )
  );

-- Contributors can manage audio files for their bhajans
CREATE POLICY "Contributors can manage bhajan audio files" ON bhajan_audio_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bhajans
      WHERE bhajans.id = bhajan_audio_files.bhajan_id
      AND (bhajans.created_by = auth.uid() OR
           EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND role = 'admin'))
    )
  );

-- ============================================================================
-- 11. STORAGE BUCKETS CONFIGURATION
-- ============================================================================
-- Note: Create these in Supabase Storage dashboard or via API
-- Bucket 1: "bhajan-audio" - Store audio files
--   - Enable versioning: No
--   - Max upload size: 100MB per file
--   - Allowed MIME types: audio/* (mp3, wav, m4a, etc.)
--
-- Bucket 2: "theme-images" - Store theme/cover images
--   - Enable versioning: No
--   - Max upload size: 10MB per file
--   - Allowed MIME types: image/* (jpg, png, webp, etc.)
--
-- Bucket 3: "profile-avatars" - Store user avatars
--   - Enable versioning: No
--   - Max upload size: 5MB per file
--   - Allowed MIME types: image/* (jpg, png, webp, etc.)

-- ============================================================================
-- 12. STORAGE BUCKET RLS POLICIES
-- ============================================================================

-- bhajan-audio bucket: Public read, authenticated write
-- Authenticated users can upload audio files
-- Public can view published audio (linked from published bhajans)

-- theme-images bucket: Admins only can upload
-- Everyone can view images used in published content

-- profile-avatars bucket: Users can upload/update their own, admins can manage all

-- ============================================================================
-- 13. SAMPLE DATA (Optional - Remove for production)
-- ============================================================================
-- Uncomment below to add test data after schema is created

/*
-- Sample user (contributor)
INSERT INTO users (id, email, full_name, role)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'contributor@ashram.com', 'Test Contributor', 'contributor')
ON CONFLICT (id) DO NOTHING;

-- Sample bhajan
INSERT INTO bhajans (name, theme, raga, tala, duration_minutes, year, status, created_by)
VALUES ('Om Namah Shivaya', 'Lord Shiva', 'Bhairav', 'Adi Tala', 5.5, 2024, 'published', '550e8400-e29b-41d4-a716-446655440000')
RETURNING id;

-- Replace 'BHAJAN_ID_HERE' with the returned ID from above
-- INSERT INTO bhajan_writers (bhajan_id, name, role) VALUES ('BHAJAN_ID_HERE', 'Sage Valmiki', 'Composer');
-- INSERT INTO bhajan_singers (bhajan_id, name, role) VALUES ('BHAJAN_ID_HERE', 'Sri Amma', 'Lead Singer');
*/

-- ============================================================================
-- SCHEMA COMPLETE
-- ============================================================================
-- Total tables: 6
-- Total indexes: 13
-- RLS policies: 20+ (comprehensive role-based access control)
-- Auth trigger: Automatic user profile creation
-- Timestamps: Auto-update on modifications
--
-- NEXT STEPS:
-- 1. Create Storage buckets in Supabase dashboard
-- 2. Configure Storage bucket RLS policies
-- 3. Update your React app's Supabase configuration
-- 4. Test sign up, login, and data operations
-- ============================================================================
