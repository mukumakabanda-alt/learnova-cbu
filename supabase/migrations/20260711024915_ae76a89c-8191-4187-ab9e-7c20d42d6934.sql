
ALTER TABLE public.materials
  ADD CONSTRAINT materials_uploaded_by_profile_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
