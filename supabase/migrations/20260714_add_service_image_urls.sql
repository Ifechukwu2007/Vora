-- Store up to three portfolio image URLs for each service while retaining
-- image_url as the primary/legacy cover image.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.services
SET image_urls = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND btrim(image_url) <> ''
  AND image_urls = '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'services_image_urls_max_three'
      AND conrelid = 'public.services'::regclass
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_image_urls_max_three
      CHECK (
        jsonb_typeof(image_urls) = 'array'
        AND jsonb_array_length(image_urls) <= 3
      );
  END IF;
END $$;
