-- Adds Carnatic/Hindustani raga & tala columns plus a free-form notes field
-- to the bhajans table, then backfills existing data.
--
-- Safe to run: only ADDs nullable columns to an existing table. RLS is enforced
-- per-table, so the existing `bhajans` policies already cover these new columns
-- (no policy changes needed). Idempotent — re-running it does no harm.

alter table public.bhajans
  add column if not exists raga_carnatic    text,
  add column if not exists raga_hindustani  text,
  add column if not exists tala_carnatic    text,
  add column if not exists tala_hindustani  text,
  add column if not exists notes            text;

-- Backfill (per user): existing ragas are Carnatic, existing talas are Hindustani.
-- Only fills rows that have a legacy value and an empty new column, so it's
-- safe to re-run and won't clobber anything you've already categorised.
update public.bhajans
  set raga_carnatic = raga
  where raga is not null
    and btrim(raga) <> ''
    and (raga_carnatic is null or btrim(raga_carnatic) = '');

update public.bhajans
  set tala_hindustani = tala
  where tala is not null
    and btrim(tala) <> ''
    and (tala_hindustani is null or btrim(tala_hindustani) = '');
