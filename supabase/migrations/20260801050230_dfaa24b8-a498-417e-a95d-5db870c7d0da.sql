alter table public.materials
  add column if not exists summary_status text not null default 'pending'
  check (summary_status in ('pending', 'ready', 'failed'));

alter table public.materials
  add column if not exists flashcards_status text not null default 'pending'
  check (flashcards_status in ('pending', 'ready', 'failed'));

alter table public.materials
  add column if not exists quiz_status text not null default 'pending'
  check (quiz_status in ('pending', 'ready', 'failed'));

alter table public.materials add column if not exists summary_error text;
alter table public.materials add column if not exists flashcards_error text;
alter table public.materials add column if not exists quiz_error text;

alter table public.materials
  add column if not exists content_confidence numeric
  check (content_confidence is null or (content_confidence >= 0 and content_confidence <= 1));

alter table public.materials add column if not exists content_confidence_note text;

alter table public.materials
  add column if not exists generation_source text
  check (generation_source is null or generation_source in ('ai', 'local-fallback'));

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