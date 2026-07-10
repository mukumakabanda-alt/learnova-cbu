-- Fixes: missing materials bucket, missing content_year column, hidden
-- failed uploads, plus schema for the new admin features (hero carousel
-- management, promote/demote admins). Every statement is safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. THE ACTUAL UPLOAD BUG: the 'materials' bucket was never created by
--    the migrations that actually ran against this project. Force it to
--    exist and be private (the app already uses createSignedUrl
--    everywhere, never getPublicUrl, so private + RLS is correct).
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do update set public = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. THE OTHER UPLOAD BUG: the client and the edge function both read/
--    write materials.content_year, but the live table never got this
--    column. Every insert was failing on this alone.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists content_year integer;

do $$
begin
  alter table public.materials
    add constraint materials_content_year_check
    check (content_year is null or content_year between 1990 and 2100);
exception when duplicate_object then
  null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Failed materials were invisible to EVERYONE, including their owner
--    and admins, because the only SELECT policy excluded 'failed'. You
--    can't fix what you can't see.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Owners and admins view all their materials" on public.materials;
create policy "Owners and admins view all their materials"
on public.materials for select
to authenticated
using (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Admins could promote but never demote. Guards against locking
--    yourself out or removing the last admin.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.demote_admin_role(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own admin access.';
  end if;
  select count(*) into admin_count from public.user_roles where role = 'admin'::public.app_role;
  if admin_count <= 1 then
    raise exception 'At least one admin must remain.';
  end if;
  delete from public.user_roles where user_id = p_user_id and role = 'admin'::public.app_role;
end;
$$;

revoke all on function public.demote_admin_role(uuid) from public;
grant execute on function public.demote_admin_role(uuid) to authenticated;

-- Admins need to see everyone's roles to run a student directory —
-- previously the only policy was "read your own row".
drop policy if exists "Admins can read all roles" on public.user_roles;
create policy "Admins can read all roles"
on public.user_roles for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Hero carousel — lets you manage the homepage photo strip from the
--    admin panel instead of it being hardcoded in the bundle. Public,
--    read-only bucket (these are just marketing photos, no privacy need).
--    If this table is empty, the app falls back to your existing
--    hardcoded photos — nothing breaks on a fresh install.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

grant select on public.hero_slides to anon, authenticated;
grant insert, update, delete on public.hero_slides to authenticated;
alter table public.hero_slides enable row level security;

drop policy if exists "Anyone can view hero slides" on public.hero_slides;
create policy "Anyone can view hero slides" on public.hero_slides for select using (true);

drop policy if exists "Admins manage hero slides" on public.hero_slides;
create policy "Admins manage hero slides" on public.hero_slides for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create index if not exists idx_hero_slides_position on public.hero_slides(position);

insert into storage.buckets (id, name, public)
values ('hero-images', 'hero-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read hero images" on storage.objects;
create policy "Public read hero images" on storage.objects for select
using (bucket_id = 'hero-images');

drop policy if exists "Admins upload hero images" on storage.objects;
create policy "Admins upload hero images" on storage.objects for insert
to authenticated
with check (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins update hero images" on storage.objects;
create policy "Admins update hero images" on storage.objects for update
to authenticated
using (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::public.app_role))
with check (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Admins delete hero images" on storage.objects;
create policy "Admins delete hero images" on storage.objects for delete
to authenticated
using (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::public.app_role));
