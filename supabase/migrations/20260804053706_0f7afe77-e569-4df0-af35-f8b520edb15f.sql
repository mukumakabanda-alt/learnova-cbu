drop policy if exists "Users read material files" on storage.objects;

create policy "Public reads published material files"
on storage.objects
for select
to public
using (
  bucket_id = 'materials'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or exists (
      select 1
      from public.materials m
      where m.file_path = name
        and m.status in ('ready'::public.material_status, 'catalog_only'::public.material_status, 'processing'::public.material_status)
    )
  )
);