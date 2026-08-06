-- Remove blanket EXECUTE from PUBLIC/anon on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.increment_download_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_material_like(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.demote_admin_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promote_user_to_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_initial_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

-- Internal-only helpers: not callable directly by API clients
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- Keep the functions the signed-in app actually calls (each enforces its own checks)
GRANT EXECUTE ON FUNCTION public.increment_download_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_material_like(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_user_to_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_admin_role(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.increment_download_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_material_like(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;