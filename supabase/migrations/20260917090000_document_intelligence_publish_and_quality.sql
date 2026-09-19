-- ============================================================================
-- LEARNOVA DOCUMENT INTELLIGENCE
-- Atomic study-pack publication, versioning, evidence/quality storage,
-- document-model persistence, and safe canonical-pack selection.
--
-- This migration is intentionally idempotent:
-- it can be applied safely to databases where some of the earlier
-- Document Intelligence columns already exist.
-- ============================================================================

-- ============================================================================
-- 1. MATERIAL-LEVEL DOCUMENT INTELLIGENCE COLUMNS
-- ============================================================================

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS document_model jsonb;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric
  CHECK (
    extraction_confidence IS NULL
    OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
  );

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS study_pack_confidence numeric
  CHECK (
    study_pack_confidence IS NULL
    OR (study_pack_confidence >= 0 AND study_pack_confidence <= 1)
  );

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS current_study_pack_id uuid;

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS generation_quality jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.materials.document_model IS
  'Structured, page-aware academic document representation used by Learnova Document Intelligence.';

COMMENT ON COLUMN public.materials.extraction_confidence IS
  '0-1 confidence in the quality and completeness of document extraction/reconstruction.';

COMMENT ON COLUMN public.materials.study_pack_confidence IS
  '0-1 confidence that the currently published study pack is grounded in the extracted document.';

COMMENT ON COLUMN public.materials.extraction_metadata IS
  'Extraction methods, coverage, OCR/visual signals, timings, and related document-intelligence metadata.';

COMMENT ON COLUMN public.materials.generation_quality IS
  'Measured extraction, grounding, validity, coverage, and publication-quality metrics for generated study content.';


-- ============================================================================
-- 2. EVIDENCE / QUALITY FIELDS FOR GENERATED LEARNING ITEMS
-- ============================================================================

ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS quality_score numeric;

ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS quality_score numeric;

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.flashcards.evidence IS
  'Source excerpts and/or structured source-unit references supporting this flashcard.';

COMMENT ON COLUMN public.flashcards.quality_score IS
  'Optional 0-1 quality score produced by the document-intelligence validation pipeline.';

COMMENT ON COLUMN public.flashcards.quality_flags IS
  'Validation warnings associated with the generated flashcard.';

COMMENT ON COLUMN public.quiz_questions.evidence IS
  'Source excerpts and/or structured source-unit references supporting this quiz question and answer.';

COMMENT ON COLUMN public.quiz_questions.quality_score IS
  'Optional 0-1 quality score produced by the document-intelligence validation pipeline.';

COMMENT ON COLUMN public.quiz_questions.quality_flags IS
  'Validation warnings associated with the generated quiz question.';


-- ============================================================================
-- 3. STUDY-PACK VERSION HISTORY
--
-- Each successful generation becomes a version.
-- Exactly one version may be current for a material.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_pack_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  material_id uuid NOT NULL
    REFERENCES public.materials(id)
    ON DELETE CASCADE,

  version integer NOT NULL,

  is_current boolean NOT NULL DEFAULT false,

  document_type text NOT NULL,

  extraction_confidence numeric
    CHECK (
      extraction_confidence IS NULL
      OR (extraction_confidence >= 0 AND extraction_confidence <= 1)
    ),

  grounding_confidence numeric
    CHECK (
      grounding_confidence IS NULL
      OR (grounding_confidence >= 0 AND grounding_confidence <= 1)
    ),

  summary text,

  tags text[] NOT NULL DEFAULT '{}',

  flashcards jsonb NOT NULL DEFAULT '[]'::jsonb,

  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,

  study_kit jsonb,

  document_model jsonb,

  generation_source text NOT NULL DEFAULT 'ai',

  generated_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT study_pack_versions_material_version_unique
    UNIQUE (material_id, version)
);

COMMENT ON TABLE public.study_pack_versions IS
  'Immutable-ish version history for successfully generated Learnova study packs.';

COMMENT ON COLUMN public.study_pack_versions.version IS
  'Monotonically increasing study-pack version number within a material.';

COMMENT ON COLUMN public.study_pack_versions.is_current IS
  'Whether this version is the canonical study pack currently published for the material.';

COMMENT ON COLUMN public.study_pack_versions.document_model IS
  'Page/slide-aware document intelligence model captured alongside this generation.';

COMMENT ON COLUMN public.study_pack_versions.generation_source IS
  'Generation route, such as ai or local-fallback.';

COMMENT ON COLUMN public.study_pack_versions.generated_by IS
  'User/profile id supplied by the trusted processing service that generated the version.';


-- ============================================================================
-- 4. FOREIGN KEY FROM MATERIAL -> CURRENT STUDY PACK
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'materials_current_study_pack_id_fkey'
      AND conrelid = 'public.materials'::regclass
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT materials_current_study_pack_id_fkey
      FOREIGN KEY (current_study_pack_id)
      REFERENCES public.study_pack_versions(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;


-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS study_pack_versions_one_current_per_material
  ON public.study_pack_versions(material_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS study_pack_versions_material_created_idx
  ON public.study_pack_versions(material_id, created_at DESC);

CREATE INDEX IF NOT EXISTS materials_current_study_pack_idx
  ON public.materials(current_study_pack_id);


-- ============================================================================
-- 6. SAFELY REPAIR ANY PRE-EXISTING MULTIPLE-CURRENT VERSIONS
--
-- If this migration is being applied to a database that already contains
-- duplicate current versions, keep the newest one and demote the rest.
-- This allows the unique partial index above to be created successfully.
-- ============================================================================

WITH ranked_current AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY material_id
      ORDER BY created_at DESC, version DESC, id DESC
    ) AS rn
  FROM public.study_pack_versions
  WHERE is_current = true
)
UPDATE public.study_pack_versions spv
SET is_current = false
FROM ranked_current rc
WHERE spv.id = rc.id
  AND rc.rn > 1;


-- ============================================================================
-- 7. RLS + GRANTS FOR STUDY-PACK HISTORY
-- ============================================================================

ALTER TABLE public.study_pack_versions ENABLE ROW LEVEL SECURITY;

GRANT SELECT
  ON public.study_pack_versions
  TO anon, authenticated;

GRANT ALL
  ON public.study_pack_versions
  TO service_role;

DROP POLICY IF EXISTS "Anyone views current public study packs"
  ON public.study_pack_versions;

CREATE POLICY "Anyone views current public study packs"
ON public.study_pack_versions
FOR SELECT
TO public
USING (
  is_current
  AND EXISTS (
    SELECT 1
    FROM public.materials m
    WHERE m.id = study_pack_versions.material_id
      AND m.status IN (
        'ready'::public.material_status,
        'processing'::public.material_status
      )
  )
);

DROP POLICY IF EXISTS "Admins view study pack history"
  ON public.study_pack_versions;

CREATE POLICY "Admins view study pack history"
ON public.study_pack_versions
FOR SELECT
TO authenticated
USING (
  public.has_role(
    auth.uid(),
    'admin'::public.app_role
  )
);


-- ============================================================================
-- 8. PREVENT NON-ADMIN CANONICAL REGENERATION
--
-- A normal student can upload a new material, but once a material already
-- represents a published/ready canonical study pack, switching it back to
-- processing is restricted to an admin.
--
-- The trusted Edge Function runs with service_role, so its processing flow
-- remains able to update the canonical pipeline.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_non_admin_canonical_regeneration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'ready'::public.material_status
     AND NEW.status = 'processing'::public.material_status
     AND NOT public.has_role(
       auth.uid(),
       'admin'::public.app_role
     )
  THEN
    RAISE EXCEPTION
      'Only an admin can regenerate a canonical study pack';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
  ON FUNCTION public.prevent_non_admin_canonical_regeneration()
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION public.prevent_non_admin_canonical_regeneration()
  FROM anon;

REVOKE ALL
  ON FUNCTION public.prevent_non_admin_canonical_regeneration()
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.prevent_non_admin_canonical_regeneration()
  TO service_role;

DROP TRIGGER IF EXISTS prevent_non_admin_canonical_regeneration_trigger
  ON public.materials;

CREATE TRIGGER prevent_non_admin_canonical_regeneration_trigger
BEFORE UPDATE OF status
ON public.materials
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION public.prevent_non_admin_canonical_regeneration();


-- ============================================================================
-- 9. ATOMIC STUDY-PACK PUBLICATION
--
-- The material row is locked first.
-- That means concurrent generations for the same material cannot both
-- calculate the same next version and publish conflicting "current" packs.
--
-- The function:
--   1. locks the material
--   2. calculates the next version
--   3. demotes the previous current version
--   4. snapshots summary/tags/study-kit
--   5. snapshots flashcards + quiz + evidence/quality
--   6. stores the document model
--   7. marks the new version current
--   8. points materials.current_study_pack_id to it
--
-- All of this happens in one database transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.publish_study_pack_atomic(
  p_material_id uuid,
  p_caller_id uuid,
  p_material_type text,
  p_document_model jsonb,
  p_extraction_confidence numeric,
  p_grounding_confidence numeric,
  p_generation_source text DEFAULT 'ai'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material RECORD;
  v_version integer;
  v_pack_id uuid;
BEGIN
  -- ----------------------------------------------------------
  -- Validate required identifiers.
  -- ----------------------------------------------------------

  IF p_material_id IS NULL THEN
    RAISE EXCEPTION 'Material id is required';
  END IF;

  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'Caller id is required';
  END IF;

  -- ----------------------------------------------------------
  -- Lock the material.
  --
  -- This is the important concurrency barrier. Two simultaneous
  -- generations for the same material must serialize here.
  -- ----------------------------------------------------------

  SELECT
    summary,
    tags,
    study_kit
  INTO v_material
  FROM public.materials
  WHERE id = p_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Material % not found',
      p_material_id;
  END IF;

  -- ----------------------------------------------------------
  -- Compute the next version while the material is locked.
  -- ----------------------------------------------------------

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM public.study_pack_versions
  WHERE material_id = p_material_id;

  -- ----------------------------------------------------------
  -- Demote any existing canonical version.
  -- The unique partial index ensures that a new current version
  -- can only exist once this update has happened.
  -- ----------------------------------------------------------

  UPDATE public.study_pack_versions
  SET is_current = false
  WHERE material_id = p_material_id
    AND is_current = true;

  -- ----------------------------------------------------------
  -- Snapshot the generated study content.
  -- ----------------------------------------------------------

  INSERT INTO public.study_pack_versions (
    material_id,
    version,
    is_current,
    document_type,
    extraction_confidence,
    grounding_confidence,
    summary,
    tags,
    flashcards,
    quiz,
    study_kit,
    document_model,
    generation_source,
    generated_by
  )
  VALUES (
    p_material_id,
    v_version,
    true,

    COALESCE(
      NULLIF(BTRIM(p_material_type), ''),
      'Notes'
    ),

    GREATEST(
      0,
      LEAST(
        1,
        COALESCE(p_extraction_confidence, 0)
      )
    ),

    GREATEST(
      0,
      LEAST(
        1,
        COALESCE(p_grounding_confidence, 0)
      )
    ),

    v_material.summary,

    COALESCE(
      v_material.tags,
      ARRAY[]::text[]
    ),

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'question', f.question,
            'answer', f.answer,
            'position', f.position,
            'evidence', COALESCE(
              f.evidence,
              '[]'::jsonb
            ),
            'quality_score', f.quality_score,
            'quality_flags', COALESCE(
              f.quality_flags,
              ARRAY[]::text[]
            )
          )
          ORDER BY f.position, f.id
        )
        FROM public.flashcards f
        WHERE f.material_id = p_material_id
      ),
      '[]'::jsonb
    ),

    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'question', q.question,
            'options', q.options,
            'correct_index', q.correct_index,
            'explanation', q.explanation,
            'position', q.position,
            'evidence', COALESCE(
              q.evidence,
              '[]'::jsonb
            ),
            'quality_score', q.quality_score,
            'quality_flags', COALESCE(
              q.quality_flags,
              ARRAY[]::text[]
            )
          )
          ORDER BY q.position, q.id
        )
        FROM public.quiz_questions q
        WHERE q.material_id = p_material_id
      ),
      '[]'::jsonb
    ),

    v_material.study_kit,

    p_document_model,

    COALESCE(
      NULLIF(BTRIM(p_generation_source), ''),
      'ai'
    ),

    p_caller_id
  )
  RETURNING id INTO v_pack_id;

  -- ----------------------------------------------------------
  -- Point the material at the new canonical pack.
  -- ----------------------------------------------------------

  UPDATE public.materials
  SET
    current_study_pack_id = v_pack_id,

    study_pack_confidence = GREATEST(
      0,
      LEAST(
        1,
        COALESCE(p_grounding_confidence, 0)
      )
    ),

    extraction_confidence = GREATEST(
      0,
      LEAST(
        1,
        COALESCE(p_extraction_confidence, 0)
      )
    ),

    document_model = p_document_model,

    updated_at = now()

  WHERE id = p_material_id;

  RETURN v_pack_id;
END;
$$;


-- ============================================================================
-- 10. LOCK DOWN THE ATOMIC PUBLICATION FUNCTION
--
-- Only the trusted service role should be able to call this function.
-- Students must never be able to directly publish arbitrary canonical
-- study packs.
-- ============================================================================

REVOKE ALL
  ON FUNCTION public.publish_study_pack_atomic(
    uuid,
    uuid,
    text,
    jsonb,
    numeric,
    numeric,
    text
  )
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION public.publish_study_pack_atomic(
    uuid,
    uuid,
    text,
    jsonb,
    numeric,
    numeric,
    text
  )
  FROM anon;

REVOKE ALL
  ON FUNCTION public.publish_study_pack_atomic(
    uuid,
    uuid,
    text,
    jsonb,
    numeric,
    numeric,
    text
  )
  FROM authenticated;

GRANT EXECUTE
  ON FUNCTION public.publish_study_pack_atomic(
    uuid,
    uuid,
    text,
    jsonb,
    numeric,
    numeric,
    text
  )
  TO service_role;


-- ============================================================================
-- 11. DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION public.publish_study_pack_atomic IS
  'Atomically versions and publishes a generated Learnova study pack, snapshots generated learning items and evidence, stores the document model, and updates the material current-pack pointer.';


-- ============================================================================
-- 12. POSTGREST SCHEMA REFRESH
-- ============================================================================

NOTIFY pgrst, 'reload schema';
