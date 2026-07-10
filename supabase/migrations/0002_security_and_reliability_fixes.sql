-- 0002: security + reliability fixes
-- Run this once in the Lovable Cloud / Supabase SQL editor, after 0001_init.sql.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. STOP SELF-SERVICE ADMIN ESCALATION
--    RLS's "users update own profile" policy only restricts which ROW a
--    student can touch, not which COLUMN — so any signed-in student could
--    run `supabase.from('profiles').update({ role: 'admin' })` on their own
--    row and pass every `admins manage X` policy afterwards. A BEFORE UPDATE
--    trigger closes this regardless of what RLS policies exist now or get
--    added later.
--
--    auth.uid() is NULL when a statement runs outside PostgREST/Edge
--    Functions (e.g. the Cloud SQL editor, or a raw service_role/postgres
--    connection) — that's exactly the trusted path the admin bootstrap flow
--    in /admin (AdminClaimGate) uses, so it keeps working unmodified.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an existing admin can change a profile role.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_role_change_by_admin on public.profiles;
create trigger enforce_role_change_by_admin
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RATE-LIMIT LOG FOR THE AI PIPELINE
--    Backs the per-user rate limit enforced in the process-material Edge
--    Function. RLS is enabled with NO policies granted to anon/authenticated
--    — default-deny — so only the service_role key (used exclusively by
--    that function) can read or write this table.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pipeline_invocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pipeline_invocations_user_created_idx
  on public.pipeline_invocations (user_id, created_at desc);

alter table public.pipeline_invocations enable row level security;
-- Intentionally no policies here — service_role bypasses RLS entirely,
-- and anon/authenticated get zero access by default.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. STOP MATERIALS GETTING STUCK IN "processing" FOREVER
--    If the uploader's tab closes or network drops between the DB insert
--    and the Edge Function finishing, nothing used to flip the row to
--    'failed' — it polled every 3s indefinitely. This scheduled job fails
--    any material that's been "processing" for more than 10 minutes, which
--    the client already renders correctly (StudyPanel's `failed` branch).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.expire_stale_processing_materials()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.materials
    set status = 'failed', updated_at = now()
    where status = 'processing'
      and updated_at < now() - interval '10 minutes';
end;
$$;

-- pg_cron needs to be enabled once per project. This attempts it inline;
-- if your role lacks privilege to create extensions, enable "pg_cron" via
-- Supabase Dashboard → Database → Extensions, then re-run just the
-- `select cron.schedule(...)` statement below on its own.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when insufficient_privilege then
    raise notice 'pg_cron not enabled — enable it via Dashboard → Database → Extensions, then run the cron.schedule(...) call in this migration by itself.';
  end;
end $$;

select cron.schedule(
  'expire-stale-processing-materials',
  '*/5 * * * *',
  $$select public.expire_stale_processing_materials();$$
)
where exists (select 1 from pg_extension where extname = 'pg_cron')
  and not exists (select 1 from cron.job where jobname = 'expire-stale-processing-materials');
