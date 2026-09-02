-- 1) Restore EXECUTE on every function referenced inside RLS policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;

-- 2) Type-aware study kit column (Past Paper / Outline / Assignment).
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS study_kit jsonb;
COMMENT ON COLUMN public.materials.study_kit IS
  'Type-specific generated content for material types that do not use flashcards/quiz (Past Paper, Outline, Assignment). Shape depends on materials.type.';

-- 3) Uploader credit: allow reading the profile rows of people who uploaded
--    publicly-visible materials (the catalogue shows "uploaded by <name>").
DROP POLICY IF EXISTS "Uploader profiles are visible" ON public.profiles;
CREATE POLICY "Uploader profiles are visible"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.uploaded_by = profiles.id
      AND m.status = ANY (ARRAY['ready'::material_status, 'catalog_only'::material_status, 'processing'::material_status])
  )
);

NOTIFY pgrst, 'reload schema';