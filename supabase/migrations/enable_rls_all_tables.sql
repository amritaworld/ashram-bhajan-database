-- ============================================================
-- 2026-06: Close public access — enable RLS on all public tables
-- and add the policies the app needs.
--
-- Background: Supabase security advisor flagged "Table publicly
-- accessible (rls_disabled_in_public)". 10 tables had RLS OFF, so the
-- public anon key could read/edit/delete everything. Several tables
-- also had missing policies (e.g. bhajan_writers had only SELECT),
-- so RLS had to be enabled together with the missing policies or the
-- app would break.
--
-- Security model: the app is login-gated (no public signup), so all
-- reads/writes are restricted to authenticated users. Existing public
-- SELECT policies on content tables were left in place.
-- Re-runnable: write policies use DROP ... IF EXISTS before CREATE.
-- ============================================================

-- bhajans — already had all 4 policies, just enable RLS
ALTER TABLE bhajans ENABLE ROW LEVEL SECURITY;

-- bhajan_languages — had SELECT+INSERT; add UPDATE/DELETE
DROP POLICY IF EXISTS "auth update languages" ON bhajan_languages;
DROP POLICY IF EXISTS "auth delete languages" ON bhajan_languages;
CREATE POLICY "auth update languages" ON bhajan_languages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete languages" ON bhajan_languages FOR DELETE TO authenticated USING (true);
ALTER TABLE bhajan_languages ENABLE ROW LEVEL SECURITY;

-- bhajan_writers — had SELECT only; add write policies
DROP POLICY IF EXISTS "auth insert writers" ON bhajan_writers;
DROP POLICY IF EXISTS "auth update writers" ON bhajan_writers;
DROP POLICY IF EXISTS "auth delete writers" ON bhajan_writers;
CREATE POLICY "auth insert writers" ON bhajan_writers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update writers" ON bhajan_writers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete writers" ON bhajan_writers FOR DELETE TO authenticated USING (true);
ALTER TABLE bhajan_writers ENABLE ROW LEVEL SECURITY;

-- bhajan_singers — had SELECT only; add write policies
DROP POLICY IF EXISTS "auth insert singers" ON bhajan_singers;
DROP POLICY IF EXISTS "auth update singers" ON bhajan_singers;
DROP POLICY IF EXISTS "auth delete singers" ON bhajan_singers;
CREATE POLICY "auth insert singers" ON bhajan_singers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update singers" ON bhajan_singers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete singers" ON bhajan_singers FOR DELETE TO authenticated USING (true);
ALTER TABLE bhajan_singers ENABLE ROW LEVEL SECURITY;

-- audio_files — had SELECT only; add write policies
DROP POLICY IF EXISTS "auth insert audio" ON audio_files;
DROP POLICY IF EXISTS "auth update audio" ON audio_files;
DROP POLICY IF EXISTS "auth delete audio" ON audio_files;
CREATE POLICY "auth insert audio" ON audio_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update audio" ON audio_files FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete audio" ON audio_files FOR DELETE TO authenticated USING (true);
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;

-- bhajan_contributors — had NO policies; add read + write
DROP POLICY IF EXISTS "read bhajan_contributors" ON bhajan_contributors;
DROP POLICY IF EXISTS "auth write bhajan_contributors" ON bhajan_contributors;
CREATE POLICY "read bhajan_contributors" ON bhajan_contributors FOR SELECT TO public USING (true);
CREATE POLICY "auth write bhajan_contributors" ON bhajan_contributors FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE bhajan_contributors ENABLE ROW LEVEL SECURITY;

-- themes — had write policies but NO read; add SELECT
DROP POLICY IF EXISTS "read themes" ON themes;
CREATE POLICY "read themes" ON themes FOR SELECT TO authenticated USING (true);
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;

-- users — keep "own data"; add authenticated CRUD for User Management
DROP POLICY IF EXISTS "auth read users" ON users;
DROP POLICY IF EXISTS "auth write users" ON users;
CREATE POLICY "auth read users" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write users" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- activity_log — had NO policies; add read + insert
DROP POLICY IF EXISTS "auth read activity" ON activity_log;
DROP POLICY IF EXISTS "auth insert activity" ON activity_log;
CREATE POLICY "auth read activity" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert activity" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- layamritam_songs — reference data, authenticated read only
ALTER TABLE layamritam_songs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read layamritam reference" ON layamritam_songs;
CREATE POLICY "Authenticated can read layamritam reference" ON layamritam_songs FOR SELECT TO authenticated USING (true);
