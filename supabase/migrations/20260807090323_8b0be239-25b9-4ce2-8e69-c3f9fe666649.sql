DROP POLICY IF EXISTS "Anyone reads published material files" ON storage.objects;
CREATE POLICY "Anyone reads published material files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'materials'
  AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE (m.file_path = storage.objects.name OR storage.objects.name = ANY (m.extra_file_paths))
      AND m.status = ANY (ARRAY['ready'::public.material_status, 'catalog_only'::public.material_status, 'processing'::public.material_status])
  )
);