-- Secure admin bootstrap and tighten function exposure

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_initial_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role
  ) INTO admin_exists;

  IF admin_exists THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(uuid) TO authenticated;