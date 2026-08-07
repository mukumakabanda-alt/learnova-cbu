-- Finishes work that was written but never actually run against this
-- database: courses.semester and profiles.semester are still showing up
-- in generated types because the DROP COLUMN statements in
-- 20260720120000_remove_semester_and_site_settings.sql never executed
-- here — only that migration's site_settings half landed (see the
-- Lovable-authored 20260801050324 migration, which re-created
-- site_settings but never touched semester).

alter table public.courses drop column if exists semester;
alter table public.profiles drop column if exists semester;

-- Bundled multi-photo uploads: a test photographed as three separate
-- images should be one material with three ordered pages, not three
-- unrelated materials. file_path stays exactly what it always was
-- (the one file for every ordinary, non-bundle material, and page 1 /
-- the cover for a bundle); this column holds pages 2..N in order and
-- is an empty array for every ordinary material.
alter table public.materials
  add column if not exists extra_file_paths text[] not null default '{}';

comment on column public.materials.extra_file_paths is
  'Pages 2..N of a bundled multi-photo upload, in order. file_path is always page 1 / the cover. Empty for every ordinary, single-file material.';

NOTIFY pgrst, 'reload schema';
