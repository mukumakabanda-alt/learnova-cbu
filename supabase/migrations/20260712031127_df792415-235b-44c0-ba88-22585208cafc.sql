
-- Add missing columns and engagement infrastructure
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_error text;

-- material_likes table
CREATE TABLE IF NOT EXISTS public.material_likes (
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, profile_id)
);
GRANT SELECT, INSERT, DELETE ON public.material_likes TO authenticated;
GRANT ALL ON public.material_likes TO service_role;
ALTER TABLE public.material_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see all likes" ON public.material_likes;
CREATE POLICY "Users see all likes" ON public.material_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users like on own behalf" ON public.material_likes;
CREATE POLICY "Users like on own behalf" ON public.material_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);
DROP POLICY IF EXISTS "Users unlike own likes" ON public.material_likes;
CREATE POLICY "Users unlike own likes" ON public.material_likes FOR DELETE TO authenticated USING (auth.uid() = profile_id);

CREATE OR REPLACE FUNCTION public.toggle_material_like(p_material_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existed boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.material_likes WHERE material_id = p_material_id AND profile_id = uid) INTO existed;
  IF existed THEN
    DELETE FROM public.material_likes WHERE material_id = p_material_id AND profile_id = uid;
    UPDATE public.materials SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_material_id;
    RETURN false;
  ELSE
    INSERT INTO public.material_likes (material_id, profile_id) VALUES (p_material_id, uid) ON CONFLICT DO NOTHING;
    UPDATE public.materials SET likes_count = likes_count + 1 WHERE id = p_material_id;
    RETURN true;
  END IF;
END;
$$;

-- Loosen handle_new_user so quick sign-up doesn't need school
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
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'programme_code', ''), 'GEN'),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'year', '')::integer, 1),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'semester', '')::integer, 1)
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    student_number = COALESCE(EXCLUDED.student_number, public.profiles.student_number),
    programme_code = EXCLUDED.programme_code,
    year = EXCLUDED.year,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger (may or may not exist)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill likes_count from any existing rows (idempotent)
UPDATE public.materials m
SET likes_count = COALESCE((SELECT count(*) FROM public.material_likes ml WHERE ml.material_id = m.id), 0);
