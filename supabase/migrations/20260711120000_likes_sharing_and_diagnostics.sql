-- Likes, shareable public access, and pipeline error diagnostics.
--
-- Fixes three real problems reported against the live app:
--   1. There is no way to "like" a document, so the homepage's "popular"
--      section had nothing real to sort by and just showed the first N
--      rows of whatever existed (i.e. fake "popular").
--   2. Shared /study/:id links didn't actually work for anyone who wasn't
--      signed in — the storage RLS policy only granted SELECT to the
--      `authenticated` role, so a logged-out recipient of a shared link
--      could see the material's summary/flashcards but the "Download"
--      button would silently fail for them.
--   3. When the AI pipeline (process-material) fails — most commonly
--      because LOVABLE_API_KEY isn't set yet — the material just flips to
--      'failed' with no reason recorded anywhere, so nobody (not even an
--      admin) can tell *why* without digging through Edge Function logs.
--
-- Every statement here is safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. LIKES
-- ─────────────────────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists likes_count integer not null default 0;

create table if not exists public.material_likes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, material_id)
);
create index if not exists idx_material_likes_material on public.material_likes(material_id);

grant select, insert, delete on public.material_likes to authenticated;
grant all on public.material_likes to service_role;
alter table public.material_likes enable row level security;

drop policy if exists "users read own likes" on public.material_likes;
create policy "users read own likes" on public.material_likes for select
  to authenticated using (profile_id = auth.uid());

drop policy if exists "users like materials as themselves" on public.material_likes;
create policy "users like materials as themselves" on public.material_likes for insert
  to authenticated with check (profile_id = auth.uid());

drop policy if exists "users unlike their own likes" on public.material_likes;
create policy "users unlike their own likes" on public.material_likes for delete
  to authenticated using (profile_id = auth.uid());

-- Toggling is done through this RPC (rather than raw insert/delete from the
-- client) so likes_count on `materials` — a denormalised counter that
-- powers real "popular" sorting without an expensive COUNT(*) join on every
-- catalogue/homepage load — can never drift out of sync with the actual
-- number of rows in material_likes. Returns the new liked state.
create or replace function public.toggle_material_like(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  already_liked boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to like materials.';
  end if;

  select exists(
    select 1 from public.material_likes
    where profile_id = auth.uid() and material_id = p_material_id
  ) into already_liked;

  if already_liked then
    delete from public.material_likes where profile_id = auth.uid() and material_id = p_material_id;
    update public.materials set likes_count = greatest(0, likes_count - 1) where id = p_material_id;
    return false;
  else
    insert into public.material_likes (profile_id, material_id) values (auth.uid(), p_material_id)
      on conflict (profile_id, material_id) do nothing;
    update public.materials set likes_count = likes_count + 1 where id = p_material_id;
    return true;
  end if;
end;
$$;

revoke all on function public.toggle_material_like(uuid) from public;
grant execute on function public.toggle_material_like(uuid) to authenticated;

create index if not exists idx_materials_likes_count on public.materials(likes_count desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. SHAREABLE LINKS ACTUALLY WORK WHEN LOGGED OUT
--    The materials TABLE row was already public (granted to anon), but the
--    underlying STORAGE OBJECT was only readable `to authenticated` — so a
--    shared link opened a page that rendered fine but whose Download
--    button 403'd for anyone not signed in. Mirrors the same
--    ready/catalog_only condition the table-level policy already uses.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "Anyone reads ready material files" on storage.objects;
create policy "Anyone reads ready material files"
on storage.objects
for select
to anon
using (
  bucket_id = 'materials'
  and exists (
    select 1 from public.materials m
    where m.file_path = name and m.status in ('ready', 'catalog_only')
  )
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. PIPELINE FAILURE DIAGNOSTICS
--    So "failed" has a visible, human-readable reason instead of being a
--    silent dead end — surfaced on the Study page (StudyPanel) and in the
--    admin Materials manager.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.materials
  add column if not exists processing_error text;

NOTIFY pgrst, 'reload schema';
