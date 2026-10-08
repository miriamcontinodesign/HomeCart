-- Migration 008: where the user lives and shops now.
--
-- HomeCart started US-only. profiles.residence_country stores the country the user shops in
-- (ids from app/frontend/lib/residence.ts, e.g. 'usa', 'germany'); the app sends its name to
-- the AI prompts so local versions, aisles and prices fit that country. Existing rows were all
-- US users, so they are backfilled to 'usa'.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS residence_country TEXT;

UPDATE public.profiles SET residence_country = 'usa' WHERE residence_country IS NULL;
