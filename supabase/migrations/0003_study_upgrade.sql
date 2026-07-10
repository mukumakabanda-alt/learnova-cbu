-- Study section upgrade
-- Run this in the Supabase SQL editor (or via CLI migration push) after
-- the existing migrations. Safe to re-run — every statement is idempotent.

-- 1. content_year: the year a document is actually FROM (e.g. a 2019 exam
--    paper), separate from courses.year (the study-year level, e.g. "Year
--    2 of the programme"). Powers the "this may be outdated" signal and
--    "similar past papers, newest first" ordering. Nullable — most
--    materials (regular notes, slides) won't have one.
alter table public.materials
  add column if not exists content_year integer
  check (content_year is null or content_year between 1990 and 2100);

-- 2. Index to make "similar past papers for this course" / "popular in
--    this course" lookups fast as the catalogue grows.
create index if not exists idx_materials_course_type_year
  on public.materials (course_code, type, content_year desc nulls last, created_at desc);

-- 3. Safe download counter. The existing "Owners and admins update
--    materials" RLS policy only lets a material's uploader (or an admin)
--    UPDATE its row — which means every OTHER student's download was
--    silently failing to increment download_count. A SECURITY DEFINER
--    RPC that does nothing but bump a counter is the standard, safe way
--    to let any visitor register a download without opening up the
--    materials table's UPDATE policy more broadly.
create or replace function public.increment_download_count(p_material_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.materials
  set download_count = download_count + 1
  where id = p_material_id
    and status in ('ready', 'catalog_only', 'processing');
end;
$$;

revoke all on function public.increment_download_count(uuid) from public;
grant execute on function public.increment_download_count(uuid) to anon, authenticated;
