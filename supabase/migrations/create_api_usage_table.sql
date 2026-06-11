-- Tracks in-app AI (Gemini) API calls: tokens + cost, for the "API Calls" page.
-- Rows are inserted server-side by api/generate-meaning.js using the caller's
-- auth token (so RLS authenticated INSERT applies).

CREATE TABLE IF NOT EXISTS api_usage (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now(),
  user_email    text,
  feature       text,                  -- e.g. 'generate_meaning'
  model         text,
  prompt_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  cost_inr      numeric DEFAULT 0,
  status        text DEFAULT 'ok'      -- 'ok' or 'error'
);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage (created_at DESC);

-- RLS: logged-in users can read + insert (the app is login-gated).
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read api_usage" ON api_usage;
DROP POLICY IF EXISTS "auth insert api_usage" ON api_usage;
CREATE POLICY "auth read api_usage"   ON api_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert api_usage" ON api_usage FOR INSERT TO authenticated WITH CHECK (true);
