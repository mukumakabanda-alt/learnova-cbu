 -- Learnova document-intelligence publication hardening.
--
-- This migration makes study-pack publication atomic:
--
--   generation finishes
--          ↓
--   current pack is locked
--          ↓
--   previous current version is unmarked
--          ↓
--   new version is inserted
--          ↓
--   materials.current_study_pack_id is updated
--          ↓
--   transaction commits
--
-- This prevents two overlapping generation requests from leaving the
-- material pointing at an incomplete or mismatched study-pack version.
--
-- The function is intentionally service_role-only. The process-material
-- Edge Function authenticates the actual caller before invoking it.

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
  v_generation_source text;
BEGIN
  /*
   * Lock the material row first.
   *
   * This serialises publication attempts for the same material while
   * allowing unrelated materials to publish independently.
   */
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

  /*
   * Only a non-empty source is persisted. This prevents accidental
   * blank generation_source values from replacing useful audit data.
   */
  v_generation_source :=
    COALESCE(
      NULLIF(
        trim(
          COALESCE(
            p_generation_source,
            ''
          )
        ),
        ''
      ),
      'ai'
    );

  /*
   * Version numbers are calculated while the material is locked.
   * The material lock prevents two simultaneous publishers for this
   * material from calculating the same next version.
   */
  SELECT
    COALESCE(
      MAX(version),
      0
    ) + 1
  INTO v_version
  FROM public.study_pack_versions
  WHERE material_id =
    p_material_id;

  /*
   * Make this version the sole current version.
   */
  UPDATE public.study_pack_versions
  SET
    is_current = false
  WHERE material_id =
      p_material_id
    AND is_current = true;

  /*
   * Snapshot all currently successful generated material into the
   * immutable version row.
   *
   * Flashcards and quiz questions are read directly from their tables,
   * so this snapshot is guaranteed to represent what the student will
   * subsequently see.
   */
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
      NULLIF(
        trim(
          COALESCE(
            p_material_type,
            ''
          )
        ),
        ''
      ),
      'Notes'
    ),

    GREATEST(
      0,
      LEAST(
        1,
        COALESCE(
          p_extraction_confidence,
          0
        )
      )
    ),

    GREATEST(
      0,
      LEAST(
        1,
        COALESCE(
          p_grounding_confidence,
          0
        )
      )
    ),

    v_material.summary,

    COALESCE(
      v_material.tags,
      ARRAY[]::text[]
    ),

    COALESCE(
      (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'id',
              f.id,
              'question',
              f.question,
              'answer',
              f.answer,
              'position',
              f.position,
              'evidence',
              f.evidence,
              'quality_score',
              f.quality_score,
              'quality_flags',
              f.quality_flags
            )
            ORDER BY
              f.position
          )
        FROM public.flashcards f
        WHERE f.material_id =
          p_material_id
      ),
      '[]'::jsonb
    ),

    COALESCE(
      (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'id',
              q.id,
              'question',
              q.question,
              'options',
              q.options,
              'correct_index',
              q.correct_index,
              'explanation',
              q.explanation,
              'position',
              q.position,
              'evidence',
              q.evidence,
              'quality_score',
              q.quality_score,
              'quality_flags',
              q.quality_flags
            )
            ORDER BY
              q.position
          )
        FROM public.quiz_questions q
        WHERE q.material_id =
          p_material_id
      ),
      '[]'::jsonb
    ),

    v_material.study_kit,

    COALESCE(
      p_document_model,
      '{}'::jsonb
    ),

    v_generation_source,

    p_caller_id
  )
  RETURNING id
  INTO v_pack_id;

  /*
   * Point the live material at the exact immutable snapshot that was
   * inserted above.
   */
  UPDATE public.materials
  SET
    current_study_pack_id =
      v_pack_id,

    study_pack_confidence =
      GREATEST(
        0,
        LEAST(
          1,
          COALESCE(
            p_grounding_confidence,
            0
          )
        )
      ),

    updated_at =
      now()
  WHERE id =
    p_material_id;

  RETURN v_pack_id;
END;
$$;

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

COMMENT ON FUNCTION public.publish_study_pack_atomic IS
  'Atomically versions and publishes a Learnova study pack while preserving document evidence, confidence and the current-pack pointer.';
