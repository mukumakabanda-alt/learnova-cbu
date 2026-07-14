-- Allow material owners to save their own flashcards & quiz questions.
--
-- Root cause of "the AI system isn't working" / "flashcards and quiz
-- questions are never created" for every regular (non-admin) student:
--
--   DocumentUpload.tsx generates flashcards/quiz client-side via the
--   Learnova AI engine and inserts them straight into `flashcards` and
--   `quiz_questions` as the signed-in student. But the ONLY insert
--   policy either table has ever had, across every migration, is
--   "Admins manage flashcards" / "Admins manage quiz questions"
--   (FOR ALL, requires has_role admin). A regular student is never an
--   admin, so Postgres's default-deny under RLS silently rejects every
--   one of their inserts — the error is caught in DocumentUpload.tsx
--   and only console.error'd, never shown to the user. The material
--   row itself (and its summary, which lives directly on that row)
--   still saves fine, because `materials` already has an owner-based
--   insert policy — which is exactly why uploads "worked" and a
--   summary sometimes appeared, while flashcards and quiz questions
--   never did, for anyone except an admin account.
--
-- This ADDS an owner-based policy alongside the existing admin one.
-- Postgres OR's multiple permissive policies together for the same
-- command, so both admins AND the student who uploaded the material
-- can insert its flashcards/quiz. No existing policy is touched.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Owners insert their material's flashcards" ON public.flashcards;
CREATE POLICY "Owners insert their material's flashcards"
ON public.flashcards
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = flashcards.material_id
      AND m.uploaded_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owners insert their material's quiz questions" ON public.quiz_questions;
CREATE POLICY "Owners insert their material's quiz questions"
ON public.quiz_questions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.materials m
    WHERE m.id = quiz_questions.material_id
      AND m.uploaded_by = auth.uid()
  )
);

-- Owners can also fix/remove their own material's flashcards & quiz
-- (useful for a future "regenerate" button) without needing an admin —
-- mirrors the same owner-or-admin pattern "Owners and admins update
-- materials" already uses on the materials table itself. The GRANT for
-- UPDATE/DELETE to `authenticated` already exists from an earlier
-- migration; only the row-level policies were missing.
DROP POLICY IF EXISTS "Owners manage their material's flashcards" ON public.flashcards;
CREATE POLICY "Owners manage their material's flashcards"
ON public.flashcards
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = flashcards.material_id AND m.uploaded_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = flashcards.material_id AND m.uploaded_by = auth.uid())
);

DROP POLICY IF EXISTS "Owners delete their material's flashcards" ON public.flashcards;
CREATE POLICY "Owners delete their material's flashcards"
ON public.flashcards
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = flashcards.material_id AND m.uploaded_by = auth.uid())
);

DROP POLICY IF EXISTS "Owners manage their material's quiz questions" ON public.quiz_questions;
CREATE POLICY "Owners manage their material's quiz questions"
ON public.quiz_questions
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = quiz_questions.material_id AND m.uploaded_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = quiz_questions.material_id AND m.uploaded_by = auth.uid())
);

DROP POLICY IF EXISTS "Owners delete their material's quiz questions" ON public.quiz_questions;
CREATE POLICY "Owners delete their material's quiz questions"
ON public.quiz_questions
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.materials m WHERE m.id = quiz_questions.material_id AND m.uploaded_by = auth.uid())
);
