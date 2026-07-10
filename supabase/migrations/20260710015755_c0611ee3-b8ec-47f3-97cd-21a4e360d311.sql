REVOKE EXECUTE ON FUNCTION public.bump_streak(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_initial_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_user_to_admin(uuid) FROM anon;