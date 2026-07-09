-- Learnova core schema
-- Run this once via Lovable Cloud (Supabase) SQL editor, or as a migration file
-- after you've enabled Cloud on this project. Safe to run on a fresh project.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────
create type public.app_role as enum ('student', 'admin');
create type public.material_type as enum ('Notes', 'Past Paper', 'Slides', 'Summary', 'Assignment', 'Outline');
create type public.material_status as enum ('catalog_only', 'processing', 'ready', 'failed');
create type public.material_source as enum ('admin', 'student');
create type public.request_status as enum ('open', 'fulfilled');

-- ─────────────────────────────────────────────────────────────────────────
-- 2. CORE TABLES
-- ─────────────────────────────────────────────────────────────────────────

create table public.programmes (
  code text primary key,
  name text not null,
  school text not null,
  years int not null,
  accent text not null default 'teal' check (accent in ('gold', 'copper', 'teal')),
  created_at timestamptz not null default now()
);

create table public.courses (
  code text primary key,
  title text not null,
  programme_code text not null references public.programmes(code) on delete cascade,
  year int not null,
  semester int not null check (semester in (1, 2)),
  lecturer text,
  description text not null default '',
  topics text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index courses_programme_idx on public.courses(programme_code);

-- One row per user, 1:1 with auth.users. Created automatically on signup (trigger below).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  student_number text unique,
  school text,
  programme_code text references public.programmes(code) on delete set null,
  year int,
  role public.app_role not null default 'student',
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_study_date date,
  created_at timestamptz not null default now()
);

-- Every piece of studyable content: admin-catalogued AND student-uploaded,
-- treated identically once uploaded. `status` tracks the AI pipeline.
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  course_code text references public.courses(code) on delete cascade,
  title text not null,
  type public.material_type not null default 'Notes',
  year int,
  pages int,
  file_path text,               -- storage path once a real file exists
  status public.material_status not null default 'catalog_only',
  source public.material_source not null default 'admin',
  summary text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index materials_course_idx on public.materials(course_code);
create index materials_status_idx on public.materials(status);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  position int not null default 0,
  question text not null,
  answer text not null
);
create index flashcards_material_idx on public.flashcards(material_id);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  position int not null default 0,
  question text not null,
  options text[] not null,
  correct_index int not null,
  explanation text
);
create index quiz_questions_material_idx on public.quiz_questions(material_id);

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  course_code text references public.courses(code) on delete set null,
  title text not null,
  notes text,
  status public.request_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.saved_materials (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, material_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. AUTO-CREATE PROFILE ON SIGNUP
--    Reads the fields passed as `options.data` in supabase.auth.signUp(...)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, student_number, school, programme_code, year)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'student_number',
    new.raw_user_meta_data->>'school',
    new.raw_user_meta_data->>'programme_code',
    nullif(new.raw_user_meta_data->>'year', '')::int
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. STUDY STREAK (called from the client whenever someone opens a material)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.bump_streak(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_last date;
  v_current int;
  v_longest int;
begin
  select last_study_date, current_streak, longest_streak
    into v_last, v_current, v_longest
    from public.profiles where id = p_profile_id;

  if v_last is null or v_last < current_date - 1 then
    v_current := 1;
  elsif v_last = current_date - 1 then
    v_current := v_current + 1;
  end if; -- v_last = current_date already → no change, already studied today

  v_longest := greatest(v_longest, v_current);

  update public.profiles
    set current_streak = v_current, longest_streak = v_longest, last_study_date = current_date
    where id = p_profile_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. is_admin() HELPER — used by RLS policies below
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
--    Content (programmes/courses/materials/flashcards/quiz) is public read —
--    this app is "free to browse" by design. Writes are locked down.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.programmes enable row level security;
alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.flashcards enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.material_requests enable row level security;
alter table public.saved_materials enable row level security;

create policy "programmes are public" on public.programmes for select using (true);
create policy "admins manage programmes" on public.programmes for all using (public.is_admin()) with check (public.is_admin());

create policy "courses are public" on public.courses for select using (true);
create policy "admins manage courses" on public.courses for all using (public.is_admin()) with check (public.is_admin());

create policy "users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Materials: anyone can read materials the pipeline has finished with, or
-- catalog-only rows. "processing" rows are visible only to their uploader
-- and admins (so a half-processed upload doesn't show broken content to others).
create policy "ready materials are public" on public.materials for select
  using (status in ('ready', 'catalog_only') or uploaded_by = auth.uid() or public.is_admin());
create policy "signed-in users upload materials" on public.materials for insert
  to authenticated with check (uploaded_by = auth.uid());
create policy "owners and admins update materials" on public.materials for update
  using (uploaded_by = auth.uid() or public.is_admin());
create policy "admins delete materials" on public.materials for delete using (public.is_admin());

create policy "flashcards follow material visibility" on public.flashcards for select
  using (exists (select 1 from public.materials m where m.id = material_id
    and (m.status in ('ready', 'catalog_only') or m.uploaded_by = auth.uid() or public.is_admin())));
create policy "service role writes flashcards" on public.flashcards for insert with check (public.is_admin());
create policy "admins manage flashcards" on public.flashcards for all using (public.is_admin());

create policy "quiz follows material visibility" on public.quiz_questions for select
  using (exists (select 1 from public.materials m where m.id = material_id
    and (m.status in ('ready', 'catalog_only') or m.uploaded_by = auth.uid() or public.is_admin())));
create policy "admins manage quiz" on public.quiz_questions for all using (public.is_admin());

create policy "users read own requests, admins read all" on public.material_requests for select
  using (requested_by = auth.uid() or public.is_admin());
create policy "signed-in users create requests" on public.material_requests for insert
  to authenticated with check (requested_by = auth.uid());
create policy "admins update requests" on public.material_requests for update using (public.is_admin());

create policy "users manage own saved materials" on public.saved_materials for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Note: flashcards/quiz_questions inserts are actually performed by the
-- process-material Edge Function using the service_role key, which bypasses
-- RLS entirely — the "admins manage" policies above are the fallback path
-- for manual edits from the dashboard, not what the pipeline relies on.

-- ─────────────────────────────────────────────────────────────────────────
-- 7. STORAGE — bucket for uploaded PDFs, public-read (this app has no
--    paywall yet; flip to a private bucket + signed URLs when it does)
-- ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('materials', 'materials', true)
on conflict (id) do nothing;

create policy "materials bucket is publicly readable" on storage.objects
  for select using (bucket_id = 'materials');
create policy "signed-in users upload to materials bucket" on storage.objects
  for insert to authenticated with check (bucket_id = 'materials');

-- ─────────────────────────────────────────────────────────────────────────
-- 8. SEED — real programme/course structure, no fake materials.
--    (Learnova's whole pitch is "real material, not placeholders" — so
--    materials start empty and fill up from real admin/student uploads.)
-- ─────────────────────────────────────────────────────────────────────────
insert into public.programmes (code, name, school, years, accent) values
  ('BSC-CS', 'BSc Computer Science', 'School of Mathematics & Natural Sciences', 5, 'teal'),
  ('BENG-EE', 'BEng Electrical Engineering', 'School of Engineering', 5, 'copper'),
  ('BBA', 'Bachelor of Business Administration', 'School of Business', 4, 'gold'),
  ('BSC-MIN', 'BSc Mining Engineering', 'School of Mines & Mineral Sciences', 5, 'copper'),
  ('BA-ED', 'BA Education', 'School of Mathematics & Natural Sciences', 4, 'gold'),
  ('BSC-AR', 'BSc Architecture', 'School of Built Environment', 5, 'teal'),
  ('BSC-ACC', 'BSc Accountancy', 'School of Business', 4, 'gold'),
  ('BSC-NR', 'BSc Natural Resources', 'School of Natural Resources', 4, 'teal');

insert into public.courses (code, title, programme_code, year, semester, lecturer, description, topics) values
  ('CS 210', 'Data Structures & Algorithms', 'BSC-CS', 2, 1, 'Dr. M. Chanda',
   'Foundational data structures, algorithm analysis, and problem-solving techniques used across systems and software engineering.',
   array['Arrays & Linked Lists','Trees & Graphs','Sorting','Hashing','Dynamic Programming','Complexity Analysis']),
  ('EE 340', 'Power Systems Analysis', 'BENG-EE', 3, 2, 'Prof. J. Mwansa',
   'Analysis and design of modern electrical power systems, including load flow, fault studies, and stability.',
   array['Load Flow','Fault Analysis','Stability','Transmission Lines','Per-Unit System']),
  ('BBA 220', 'Financial Accounting II', 'BBA', 2, 1, 'Mrs. C. Phiri',
   'Advanced financial reporting standards, consolidated statements, and interpretation of accounts.',
   array['IFRS','Consolidation','Cash Flow Statements','Ratio Analysis']),
  ('MIN 410', 'Rock Mechanics', 'BSC-MIN', 4, 1, 'Dr. K. Banda',
   'Behaviour of rock masses under stress, applied to underground and open-pit mining.',
   array['Stress & Strain','Rock Failure Criteria','Slope Stability','Support Design']),
  ('CS 110', 'Introduction to Programming', 'BSC-CS', 1, 1, 'Mr. T. Zulu',
   'First programming course covering Python fundamentals, control flow, functions, and problem decomposition.',
   array['Python Basics','Control Flow','Functions','Lists & Dicts','Files']),
  ('AR 320', 'Structural Design Studio', 'BSC-AR', 3, 2, 'Ar. L. Musonda',
   'Integrated studio combining structural principles with architectural design decisions.',
   array['Load Paths','Materials','Detailing','Sustainability']);

-- After you sign up with your own account once, run this to make yourself admin:
-- update public.profiles set role = 'admin' where student_number = 'YOUR_STUDENT_NUMBER';
