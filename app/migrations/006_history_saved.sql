-- Migration 006: History tab + saved products
--
-- Text product searches are now stored alongside photo scans in `scans`, so the History
-- tab can list both. `source` says how the entry was made; `saved` is the user's bookmark.
-- The existing users_own_scans RLS policy (FOR ALL) already lets users update and delete
-- their own rows, so bookmarking works from the client with no new policy.

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'scan',
  ADD COLUMN IF NOT EXISTS saved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget text;

ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_source_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_source_check CHECK (source IN ('scan', 'search', 'photo', 'voice'));

CREATE INDEX IF NOT EXISTS idx_scans_user_saved ON public.scans (user_id, saved, created_at DESC);
