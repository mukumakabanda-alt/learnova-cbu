ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS document_model jsonb,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric,
  ADD COLUMN IF NOT EXISTS study_pack_confidence numeric,
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb;

COMMENT ON COLUMN public.materials.document_model IS 'Structured, page-aware academic document representation used by Learnova Document Intelligence.';
COMMENT ON COLUMN public.materials.extraction_confidence IS 'Confidence in extraction and document reconstruction, from 0 to 1.';
COMMENT ON COLUMN public.materials.study_pack_confidence IS 'Confidence that the current generated study pack is grounded in the extracted document, from 0 to 1.';
COMMENT ON COLUMN public.materials.extraction_metadata IS 'Extraction method, coverage, quality signals, and timing metadata.';

CREATE TABLE public.study_pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  version integer NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  document_type text NOT NULL,
  extraction_confidence numeric,
  grounding_confidence numeric,
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  flashcards jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  study_kit jsonb,
  document_model jsonb,
  generation_source text NOT NULL DEFAULT 'ai',
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material_id, version)
);

GRANT SELECT ON public.study_pack_versions TO anon;
GRANT SELECT ON public.study_pack_versions TO authenticated;
GRANT ALL ON public.study_pack_versions TO service_role;

ALTER TABLE public.study_pack_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views current public study packs"
ON public.study_pack_versions
FOR SELECT
TO public
USING (
  is_current
  AND EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = material_id
      AND m.status IN ('ready'::public.material_status, 'processing'::public.material_status)
  )
);

CREATE POLICY "Admins view study pack history"
ON public.study_pack_versions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE UNIQUE INDEX study_pack_versions_one_current_per_material
ON public.study_pack_versions(material_id)
WHERE is_current;

CREATE INDEX study_pack_versions_material_created_idx
ON public.study_pack_versions(material_id, created_at DESC);

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS current_study_pack_id uuid REFERENCES public.study_pack_versions(id) ON DELETE SET NULL;

CREATE INDEX materials_current_study_pack_idx
ON public.materials(current_study_pack_id);

CREATE OR REPLACE FUNCTION public.prevent_non_admin_canonical_regeneration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'ready'::public.material_status
     AND NEW.status = 'processing'::public.material_status
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only an admin can regenerate a canonical study pack';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_non_admin_canonical_regeneration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_non_admin_canonical_regeneration() TO service_role;

DROP TRIGGER IF EXISTS prevent_non_admin_canonical_regeneration_trigger ON public.materials;
CREATE TRIGGER prevent_non_admin_canonical_regeneration_trigger
BEFORE UPDATE OF status ON public.materials
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.prevent_non_admin_canonical_regeneration();