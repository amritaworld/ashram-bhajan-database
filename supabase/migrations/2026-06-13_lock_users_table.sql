-- ============================================================
-- 2026-06-13  CRITICAL FIX
-- Stop ANY logged-in user from making themselves an admin.
--
-- Problem: the live rule on the `users` table let any authenticated
-- user write to it (USING true) — so a Viewer/Contributor could set
-- their own role to 'admin' and take over.
--
-- Fix: only ADMINS may create / change / delete user rows (including
-- roles). Everyone logged in can still READ the users list, which the
-- app needs (User Management, contributor pickers, etc.).
--
-- Safe to run and re-run. Takes effect on the live site immediately.
-- ============================================================

-- 1) Helper: is the current logged-in user an admin?
--    SECURITY DEFINER lets it read the role WITHOUT going through this
--    same table's RLS (which would otherwise cause an infinite loop).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 2) Remove EVERY existing policy on the users table, so no old
--    "anyone can write" rule can linger and quietly re-open the hole.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'users'
  loop
    execute format('drop policy if exists %I on public.users', pol.policyname);
  end loop;
end $$;

-- 3) Make sure row-level security is switched on.
alter table public.users enable row level security;

-- 4) The correct rules ------------------------------------------------

-- Any logged-in user may READ the users list (the app needs this).
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

-- Only admins may CREATE a user row.
create policy "users_insert_admin_only"
  on public.users for insert
  to authenticated
  with check (public.is_admin());

-- Only admins may CHANGE a user row.  <-- this blocks self-promotion.
create policy "users_update_admin_only"
  on public.users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Only admins may DELETE a user row.
create policy "users_delete_admin_only"
  on public.users for delete
  to authenticated
  using (public.is_admin());
