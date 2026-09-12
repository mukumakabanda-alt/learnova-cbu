-- AI quality, evidence, and learner telemetry.
-- Apply after the existing Learnova migrations.

ALTER TABLE public.flashcards
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_flags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS generation_quality jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('flashcard_attempt', 'quiz_attempt', 'study_session', 'video_feedback')),
  item_id uuid,
  concept text,
  correct boolean,
  confidence numeric,
  duration_seconds integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_events_user_created_idx
  ON public.learning_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_material_idx
  ON public.learning_events(material_id, created_at DESC);

ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students insert own learning events" ON public.learning_events;
CREATE POLICY "Students insert own learning events"
  ON public.learning_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Students read own learning events" ON public.learning_events;
CREATE POLICY "Students read own learning events"
  ON public.learning_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON COLUMN public.flashcards.evidence IS 'Source excerpts or block references supporting this card.';
COMMENT ON COLUMN public.quiz_questions.evidence IS 'Source excerpts or block references supporting this item and answer.';
COMMENT ON COLUMN public.materials.generation_quality IS 'Measured extraction, grounding, validity, and coverage metrics for the current study pack.';
COMMENT ON TABLE public.learning_events IS 'Privacy-scoped event log used for explainable learner modeling and spaced review.';
