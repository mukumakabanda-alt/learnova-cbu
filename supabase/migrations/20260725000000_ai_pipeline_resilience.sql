-- AI pipeline resilience upgrade.
--
-- Context: supabase/functions/process-material used to run summary,
-- flashcards, tags and quiz generation as ONE Gemini call, all-or-
-- nothing — if the model returned one malformed field, the whole
-- material failed, even when most of the response was fine. It also
-- truncated input at a flat 60,000 characters with no signal to the
-- student that anything was cut. This migration adds the columns the
-- rewritten pipeline needs to track summary/flashcards/quiz
-- independently, and to be honest about extraction confidence instead of
-- presenting a shaky OCR read with the same quiet confidence as a clean
-- text layer.
--
-- Safe to run more than once: every column uses "add column if not
-- exists", one alter table per column, matching the style already used
-- in this project's other migrations (see 0003_study_upgrade.sql and
-- 20260711120000_likes_sharing_and_diagnostics.sql).

alter table public.materials
  add column if not exists summary_status text not null default 'pending'
  check (summary_status in ('pending', 'ready', 'failed'));

alter table public.materials
  add column if not exists flashcards_status text not null default 'pending'
  check (flashcards_status in ('pending', 'ready', 'failed'));

alter table public.materials
  add column if not exists quiz_status text not null default 'pending'
  check (quiz_status in ('pending', 'ready', 'failed'));

alter table public.materials
  add column if not exists summary_error text;

alter table public.materials
  add column if not exists flashcards_error text;

alter table public.materials
  add column if not exists quiz_error text;

alter table public.materials
  add column if not exists content_confidence numeric
  check (content_confidence is null or (content_confidence >= 0 and content_confidence <= 1));

alter table public.materials
  add column if not exists content_confidence_note text;

alter table public.materials
  add column if not exists generation_source text
  check (generation_source is null or generation_source in ('ai', 'local-fallback'));

-- Backfill existing rows so materials processed before this migration
-- don't sit there looking like they're "still generating" forever (the
-- new columns above default new rows to 'pending', which is wrong for a
-- material that's already settled). A 'ready' material with content in
-- a given slot gets that slot marked 'ready'; a 'ready' or 'failed'
-- material with nothing in a slot gets that slot marked 'failed' (with
-- an explanatory error) rather than 'pending', so the "Regenerate"
-- action shows up for it immediately instead of never, since nothing
-- will ever move it out of 'pending' on its own.
update public.materials m
set
  summary_status = case
    when m.summary is not null and m.summary <> '' then 'ready'
    when m.status = 'failed' then 'failed'
    else summary_status
  end,
  flashcards_status = case
    when exists (select 1 from public.flashcards f where f.material_id = m.id) then 'ready'
    when m.status in ('ready', 'failed') then 'failed'
    else flashcards_status
  end,
  quiz_status = case
    when exists (select 1 from public.quiz_questions q where q.material_id = m.id) then 'ready'
    when m.status in ('ready', 'failed') then 'failed'
    else quiz_status
  end,
  flashcards_error = case
    when not exists (select 1 from public.flashcards f where f.material_id = m.id) and m.status in ('ready', 'failed')
      then 'No flashcards were generated before this upgrade — tap Regenerate to create them now.'
    else flashcards_error
  end,
  quiz_error = case
    when not exists (select 1 from public.quiz_questions q where q.material_id = m.id) and m.status in ('ready', 'failed')
      then 'No quiz was generated before this upgrade — tap Regenerate to create one now.'
    else quiz_error
  end,
  generation_source = coalesce(m.generation_source, 'ai')
where m.status in ('ready', 'catalog_only', 'failed');

NOTIFY pgrst, 'reload schema';
