-- ═══════════════════════════════════════════════════════════════════
-- Fixes "permission denied for function has_role" — the single bug
-- behind materials/profiles/user_roles reads failing app-wide.
-- ═══════════════════════════════════════════════════════════════════
--
-- 20260806045839_8e420160-48f2-4bf7-9f65-07972668bc87.sql revoked ALL
-- privileges (including EXECUTE) on has_role() and is_admin() from
-- `authenticated`, as part of an otherwise-reasonable pass to stop
-- these SECURITY DEFINER functions being directly callable by API
-- clients. The problem: they aren't just "callable directly" — they're
-- also referenced INSIDE RLS policy USING/WITH CHECK expressions on
-- profiles, materials, flashcards, quiz_questions, user_roles,
-- material_requests, programmes, courses, hero_slides, and the
-- `materials`/`hero-images` storage buckets. Postgres evaluates an RLS
-- policy expression as the querying role — so once `authenticated`
-- lost EXECUTE on has_role/is_admin, EVERY one of those policies started
-- throwing "permission denied for function has_role" for every signed-in
-- user, on every read or write those policies gate. That is the direct
-- cause of materials/profiles/user_roles queries failing across the
-- app (empty catalogue, documents that won't open, uploads refusing to
-- start, admin checks failing).
--
-- Being callable by RLS and being safely non-abusable aren't in tension
-- here anyway: both functions only ever return a boolean about role
-- membership — there's no sensitive data to leak by letting an
-- authenticated user check "is this uuid an admin?" directly.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- Type-aware study tools: a past paper doesn't need a multiple-choice
-- quiz built from itself, and a course outline doesn't need flashcards
-- — see process-material for what actually populates this per type.
-- One flexible column instead of a growing set of narrow ones (questions,
-- answer_guidance, topics_tested, revision_plan, requirements...), since
-- the shape genuinely differs by material type and more types are likely
-- to be added later. NULL for Notes/Slides/Summary, which keep using the
-- existing summary/flashcards/quiz tables exactly as before.
-- ═══════════════════════════════════════════════════════════════════
alter table public.materials
  add column if not exists study_kit jsonb;

comment on column public.materials.study_kit is
  'Type-specific generated content for material types that do not use flashcards/quiz (Past Paper, Outline, Assignment). Shape depends on materials.type — see process-material edge function. NULL for Notes/Slides/Summary and any material still on the old summary+flashcards+quiz path.';

NOTIFY pgrst, 'reload schema';
