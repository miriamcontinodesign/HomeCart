-- Migration 007: demo accounts expire after one hour.
--
-- "Try the demo" signs people in anonymously (auth.users.is_anonymous = true).
-- A pg_cron job runs every 15 minutes and deletes demo accounts older than
-- one hour. Their profile, scans, shopping lists and list items go with them
-- through the ON DELETE CASCADE foreign keys from migration 001.
-- daily_usage rows have no foreign key and are kept (tiny; useful as usage stats).
--
-- Runs inside the database, so it works even while the Render backend sleeps.
-- Re-running this file is safe: the job is replaced, not duplicated.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('homecart-demo-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'homecart-demo-cleanup');

SELECT cron.schedule(
    'homecart-demo-cleanup',
    '*/15 * * * *',
    $$DELETE FROM auth.users
      WHERE is_anonymous = true
        AND created_at < now() - interval '1 hour'$$
);

-- Check it's scheduled:
--   SELECT jobname, schedule, active FROM cron.job;
-- See recent runs:
--   SELECT status, return_message, start_time
--   FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
