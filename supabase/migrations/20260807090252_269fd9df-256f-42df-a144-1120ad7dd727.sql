CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, student_number, school, programme_code, year)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'student_number', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'school', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'programme_code', ''), 'GEN'),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'year', '')::integer, 1)
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
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;