alter table public.courses drop column if exists semester;
alter table public.profiles drop column if exists semester;

alter table public.materials
  add column if not exists extra_file_paths text[] not null default '{}';

comment on column public.materials.extra_file_paths is
  'Pages 2..N of a bundled multi-photo upload, in order. file_path is always page 1 / the cover. Empty for every ordinary, single-file material.';

NOTIFY pgrst, 'reload schema';