-- Adds a `username` to the users table for username-based login, and backfills
-- existing users from the part of their email before the "@" so nobody is
-- locked out. Usernames are stored lowercase; uniqueness is enforced in the app
-- (User Management) so this migration can't fail on a duplicate during backfill.
--
-- Safe to run and re-run: only ADDs a nullable column and fills empty usernames.

alter table public.users
  add column if not exists username text;

update public.users
  set username = lower(split_part(email, '@', 1))
  where (username is null or btrim(username) = '')
    and email is not null
    and btrim(email) <> '';
