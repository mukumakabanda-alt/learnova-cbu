-- Backend-independent document type detection.
--
-- Until now `materials.type` was set entirely client-side (the upload
-- flow's regex classifier, or a student's manual pick) and process-material
-- trusted it blindly to decide which study-pack generator to run. A wrong
-- guess on upload silently became a wrong generator forever, with no
-- second check anywhere in the pipeline.
--
-- process-material now runs its own independent classification pass over
-- the full extracted text before generating, and records what it found
-- here rather than silently overwriting the student/uploader's `type`.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS detected_type text,
  ADD COLUMN IF NOT EXISTS detected_type_confidence numeric,
  ADD COLUMN IF NOT EXISTS type_disagreement boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.materials.detected_type IS
  'process-material''s own independent read of the document type, from the full extracted text — separate from materials.type, which may be a student pick or an earlier client-side guess.';
COMMENT ON COLUMN public.materials.detected_type_confidence IS
  '0-1 confidence for detected_type.';
COMMENT ON COLUMN public.materials.type_disagreement IS
  'true when detected_type meaningfully disagreed with materials.type at generation time (e.g. materials.type says Notes but this reads as a Past Paper). Surfaced in the study workspace as a "looks like X — change?" prompt rather than silently changed.';
