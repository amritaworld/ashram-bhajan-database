-- ============================================================================
-- 2026-06-14: Raga/Tala remarks + draft visibility for contributors & admins
-- ============================================================================
-- Safe to run and re-run. Two independent changes:
--   1) Adds free-form `raga_remarks` / `tala_remarks` text columns to bhajans.
--   2) Ensures contributors AND admins can SELECT every bhajan (incl. drafts of
--      other users). Viewers still only ever see published bhajans.
-- RLS is enforced per-table, so the new columns are already covered by the
-- existing bhajans policies (no extra policy needed for them).
-- ============================================================================

-- 1. Remarks columns (nullable, so existing rows are untouched) -------------
alter table public.bhajans
  add column if not exists raga_remarks text,
  add column if not exists tala_remarks text;

-- 2. Draft visibility --------------------------------------------------------
-- Drop the policy first so re-running this file always lands the latest rule.
drop policy if exists "Contributors can view all bhajans" on public.bhajans;

create policy "Contributors can view all bhajans" on public.bhajans
  for select using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('contributor', 'admin')
    )
  );
