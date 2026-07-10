-- Learnova complete backend foundation

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Secure role enum + role table (roles are intentionally separate from profiles)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'lecturer', 'student');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  student_number text,
  phone text,
  school text NOT NULL DEFAULT '',
  programme_code text NOT NULL DEFAULT '',
  year integer NOT NULL DEFAULT 1 CHECK (year BETWEEN 1 AND 6),
  semester integer NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 2),
  avatar_url text,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_studied_on date,
  weekly_progress integer NOT NULL DEFAULT 0 CHECK (weekly_progress BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Programme catalogue
CREATE TABLE IF NOT EXISTS public.programmes (
  code text PRIMARY KEY,
  name text NOT NULL,
  school text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_years integer NOT NULL DEFAULT 4 CHECK (duration_years BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.programmes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programmes TO authenticated;
GRANT ALL ON public.programmes TO service_role;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view programmes" ON public.programmes;
CREATE POLICY "Anyone can view programmes"
ON public.programmes
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins manage programmes" ON public.programmes;
CREATE POLICY "Admins manage programmes"
ON public.programmes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_programmes_updated_at ON public.programmes;
CREATE TRIGGER update_programmes_updated_at
BEFORE UPDATE ON public.programmes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Courses
CREATE TABLE IF NOT EXISTS public.courses (
  code text PRIMARY KEY,
  title text NOT NULL,
  programme_code text REFERENCES public.programmes(code) ON UPDATE CASCADE ON DELETE SET NULL,
  year integer NOT NULL DEFAULT 1 CHECK (year BETWEEN 1 AND 6),
  semester integer NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 2),
  lecturer text,
  description text NOT NULL DEFAULT '',
  topics text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
CREATE POLICY "Anyone can view courses"
ON public.courses
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins and lecturers manage courses" ON public.courses;
CREATE POLICY "Admins and lecturers manage courses"
ON public.courses
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'lecturer'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'lecturer'::public.app_role));

DROP TRIGGER IF EXISTS update_courses_updated_at ON public.courses;
CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Materials and generated study tools
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'material_status') THEN
    CREATE TYPE public.material_status AS ENUM ('processing', 'ready', 'failed', 'catalog_only');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  course_code text REFERENCES public.courses(code) ON UPDATE CASCADE ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'Notes',
  pages integer CHECK (pages IS NULL OR pages > 0),
  file_path text,
  status public.material_status NOT NULL DEFAULT 'catalog_only',
  source text NOT NULL DEFAULT 'student',
  summary text,
  uploaded_by uuid,
  tags text[] NOT NULL DEFAULT '{}',
  download_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.materials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view public materials" ON public.materials;
CREATE POLICY "Anyone can view public materials"
ON public.materials
FOR SELECT
USING (status IN ('ready', 'catalog_only', 'processing'));

DROP POLICY IF EXISTS "Users can create their uploads" ON public.materials;
CREATE POLICY "Users can create their uploads"
ON public.materials
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Owners and admins update materials" ON public.materials;
CREATE POLICY "Owners and admins update materials"
ON public.materials
FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete materials" ON public.materials;
CREATE POLICY "Admins delete materials"
ON public.materials
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_materials_updated_at ON public.materials;
CREATE TRIGGER update_materials_updated_at
BEFORE UPDATE ON public.materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.flashcards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view flashcards" ON public.flashcards;
CREATE POLICY "Anyone can view flashcards"
ON public.flashcards
FOR SELECT
USING (EXISTS (SELECT 1 FROM public.materials m WHERE m.id = material_id AND m.status IN ('ready', 'processing')));

DROP POLICY IF EXISTS "Admins manage flashcards" ON public.flashcards;
CREATE POLICY "Admins manage flashcards"
ON public.flashcards
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  options text[] NOT NULL DEFAULT '{}',
  correct_index integer NOT NULL DEFAULT 0 CHECK (correct_index BETWEEN 0 AND 3),
  explanation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view quiz questions" ON public.quiz_questions;
CREATE POLICY "Anyone can view quiz questions"
ON public.quiz_questions
FOR SELECT
USING (EXISTS (SELECT 1 FROM public.materials m WHERE m.id = material_id AND m.status IN ('ready', 'processing')));

DROP POLICY IF EXISTS "Admins manage quiz questions" ON public.quiz_questions;
CREATE POLICY "Admins manage quiz questions"
ON public.quiz_questions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Requests and bookmarks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'request_status') THEN
    CREATE TYPE public.request_status AS ENUM ('open', 'fulfilled', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.material_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  course_code text REFERENCES public.courses(code) ON UPDATE CASCADE ON DELETE SET NULL,
  notes text,
  status public.request_status NOT NULL DEFAULT 'open',
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.material_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requests TO authenticated;
GRANT ALL ON public.material_requests TO service_role;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view open requests" ON public.material_requests;
CREATE POLICY "Anyone can view open requests"
ON public.material_requests
FOR SELECT
USING (status = 'open' OR requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users create their own requests" ON public.material_requests;
CREATE POLICY "Users create their own requests"
ON public.material_requests
FOR INSERT
TO authenticated
WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "Users update their own open requests" ON public.material_requests;
CREATE POLICY "Users update their own open requests"
ON public.material_requests
FOR UPDATE
TO authenticated
USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete requests" ON public.material_requests;
CREATE POLICY "Admins delete requests"
ON public.material_requests
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS update_material_requests_updated_at ON public.material_requests;
CREATE TRIGGER update_material_requests_updated_at
BEFORE UPDATE ON public.material_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.saved_materials (
  profile_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_materials TO authenticated;
GRANT ALL ON public.saved_materials TO service_role;
ALTER TABLE public.saved_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their saved materials" ON public.saved_materials;
CREATE POLICY "Users manage their saved materials"
ON public.saved_materials
FOR ALL
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view saved materials" ON public.saved_materials;
CREATE POLICY "Admins can view saved materials"
ON public.saved_materials
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.pipeline_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pipeline_invocations TO authenticated;
GRANT ALL ON public.pipeline_invocations TO service_role;
ALTER TABLE public.pipeline_invocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can record their pipeline runs" ON public.pipeline_invocations;
CREATE POLICY "Users can record their pipeline runs"
ON public.pipeline_invocations
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read their pipeline runs" ON public.pipeline_invocations;
CREATE POLICY "Users can read their pipeline runs"
ON public.pipeline_invocations
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Auth profile bootstrap: creates a profile and default student role after sign-up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, student_number, school, programme_code, year, semester)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'student_number', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'school', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'programme_code', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'year', '')::integer, 1),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'semester', '')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    student_number = EXCLUDED.student_number,
    school = EXCLUDED.school,
    programme_code = EXCLUDED.programme_code,
    year = EXCLUDED.year,
    semester = EXCLUDED.semester,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.bump_streak(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_last date;
  new_streak integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_profile_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT last_studied_on INTO current_last
  FROM public.profiles
  WHERE id = p_profile_id;

  IF current_last = CURRENT_DATE THEN
    RETURN;
  ELSIF current_last = CURRENT_DATE - INTERVAL '1 day' THEN
    SELECT current_streak + 1 INTO new_streak FROM public.profiles WHERE id = p_profile_id;
  ELSE
    new_streak := 1;
  END IF;

  UPDATE public.profiles
  SET current_streak = new_streak,
      longest_streak = GREATEST(longest_streak, new_streak),
      weekly_progress = LEAST(100, GREATEST(weekly_progress, 0) + 14),
      last_studied_on = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_streak(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Private storage bucket policies for PDF uploads.
DROP POLICY IF EXISTS "Users upload material files" ON storage.objects;
CREATE POLICY "Users upload material files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'materials' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users read material files" ON storage.objects;
CREATE POLICY "Users read material files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'materials'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.materials m WHERE m.file_path = name AND m.status IN ('ready', 'catalog_only'))
  )
);

DROP POLICY IF EXISTS "Users update own material files" ON storage.objects;
CREATE POLICY "Users update own material files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'materials' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role)))
WITH CHECK (bucket_id = 'materials' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Users delete own material files" ON storage.objects;
CREATE POLICY "Users delete own material files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'materials' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role)));

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_courses_programme_year ON public.courses(programme_code, year, semester);
CREATE INDEX IF NOT EXISTS idx_materials_course_status ON public.materials(course_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_uploaded_by ON public.materials(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_flashcards_material ON public.flashcards(material_id, position);
CREATE INDEX IF NOT EXISTS idx_quiz_material ON public.quiz_questions(material_id, position);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.material_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_user_time ON public.pipeline_invocations(user_id, created_at DESC);

-- Starter catalogue so browse/search never opens into a dead empty shell.
INSERT INTO public.programmes (code, name, school, description, duration_years) VALUES
  ('CS', 'Computer Science', 'School of Information and Communication Technology', 'Software, systems, data and intelligent computing.', 4),
  ('EE', 'Electrical Engineering', 'School of Engineering', 'Power systems, electronics, machines and control.', 5),
  ('ME', 'Mechanical Engineering', 'School of Engineering', 'Mechanics, thermodynamics, design and production.', 5),
  ('BA', 'Business Administration', 'School of Business', 'Management, operations, finance and entrepreneurship.', 4),
  ('ACC', 'Accountancy', 'School of Business', 'Financial reporting, audit, taxation and governance.', 4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  school = EXCLUDED.school,
  description = EXCLUDED.description,
  duration_years = EXCLUDED.duration_years,
  updated_at = now();

INSERT INTO public.courses (code, title, programme_code, year, semester, lecturer, description, topics) VALUES
  ('CS 110', 'Introduction to Programming', 'CS', 1, 1, 'Department team', 'A practical first course in programming logic, algorithms and clean code habits.', ARRAY['Variables and data types','Control flow','Functions','Arrays','Debugging','Problem solving']),
  ('CS 220', 'Data Structures and Algorithms', 'CS', 2, 1, 'Department team', 'Core structures and algorithmic thinking for building efficient software.', ARRAY['Stacks and queues','Linked lists','Trees','Graphs','Sorting','Complexity analysis']),
  ('CS 310', 'Database Systems', 'CS', 3, 1, 'Department team', 'Designing, querying and managing relational data systems.', ARRAY['ER modelling','SQL','Normalization','Transactions','Indexes','Security']),
  ('EE 210', 'Circuit Theory', 'EE', 2, 1, 'Department team', 'Analysis of electrical circuits using laws, theorems and steady-state techniques.', ARRAY['Kirchhoff laws','Nodal analysis','Mesh analysis','Thevenin theorem','AC circuits','Power']),
  ('EE 340', 'Power Systems', 'EE', 3, 2, 'Department team', 'Generation, transmission and protection fundamentals for electric power networks.', ARRAY['Transmission lines','Load flow','Fault analysis','Protection','Stability','Distribution']),
  ('ME 230', 'Thermodynamics', 'ME', 2, 2, 'Department team', 'Energy, heat, work and thermodynamic cycles for engineering systems.', ARRAY['First law','Second law','Entropy','Gas power cycles','Vapour cycles','Refrigeration']),
  ('BA 120', 'Principles of Management', 'BA', 1, 2, 'Department team', 'Foundations of planning, organising, leading and controlling modern organisations.', ARRAY['Planning','Leadership','Motivation','Decision making','Control','Organisational culture']),
  ('ACC 210', 'Financial Accounting', 'ACC', 2, 1, 'Department team', 'Financial statements, recognition principles and reporting fundamentals.', ARRAY['Accounting equation','Journals','Ledgers','Trial balance','Financial statements','Adjustments'])
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  programme_code = EXCLUDED.programme_code,
  year = EXCLUDED.year,
  semester = EXCLUDED.semester,
  lecturer = EXCLUDED.lecturer,
  description = EXCLUDED.description,
  topics = EXCLUDED.topics,
  updated_at = now();

INSERT INTO public.materials (title, course_code, type, pages, status, source, summary, tags) VALUES
  ('Programming Fundamentals Quick Revision', 'CS 110', 'Revision summary', 12, 'catalog_only', 'learnova', 'A concise revision pack covering variables, control flow, functions, arrays and debugging habits. Use it before attempting programming past papers or practical lab exercises.', ARRAY['programming','revision','first year']),
  ('Data Structures Exam Prep Map', 'CS 220', 'Key topics', 9, 'catalog_only', 'learnova', 'A structured topic map for stacks, queues, lists, trees, graphs and complexity. Focus on tracing algorithms by hand and explaining trade-offs clearly.', ARRAY['algorithms','exam prep','data structures']),
  ('Circuit Analysis Formula Sheet', 'EE 210', 'Reference document', 6, 'catalog_only', 'learnova', 'A compact reference for circuit laws, nodal and mesh analysis, source transformations and common AC relationships.', ARRAY['circuits','formulas','engineering']),
  ('Financial Accounting Statement Checklist', 'ACC 210', 'Study tips', 7, 'catalog_only', 'learnova', 'A checklist for preparing statements from ledgers and trial balances, with emphasis on adjustments, classification and presentation.', ARRAY['accounting','statements','checklist'])
ON CONFLICT DO NOTHING;