
CREATE TABLE IF NOT EXISTS public.hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hero_slides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_slides TO authenticated;
GRANT ALL ON public.hero_slides TO service_role;
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view hero slides" ON public.hero_slides;
CREATE POLICY "Anyone can view hero slides" ON public.hero_slides FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage hero slides" ON public.hero_slides;
CREATE POLICY "Admins manage hero slides" ON public.hero_slides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_hero_slides_updated_at ON public.hero_slides;
CREATE TRIGGER update_hero_slides_updated_at BEFORE UPDATE ON public.hero_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Anyone reads hero images" ON storage.objects;
CREATE POLICY "Anyone reads hero images" ON storage.objects FOR SELECT USING (bucket_id = 'hero-images');
DROP POLICY IF EXISTS "Admins write hero images" ON storage.objects;
CREATE POLICY "Admins write hero images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins update hero images" ON storage.objects;
CREATE POLICY "Admins update hero images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins delete hero images" ON storage.objects;
CREATE POLICY "Admins delete hero images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hero-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.increment_download_count(p_material_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.materials SET download_count = download_count + 1 WHERE id = p_material_id;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_download_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_download_count(UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.demote_admin_role(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can demote other admins';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin'::app_role;
END;
$$;
REVOKE ALL ON FUNCTION public.demote_admin_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_admin_role(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
