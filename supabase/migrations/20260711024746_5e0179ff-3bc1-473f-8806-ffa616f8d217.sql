ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS content_year INTEGER;
NOTIFY pgrst, 'reload schema';