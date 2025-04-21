-- Script to recreate the six month request processing cron job
-- Execute this script as a superuser or a user with permissions on cron.job table

-- 1. Delete the existing cron job
DELETE FROM cron.job WHERE jobname = 'process-six-month-requests';

-- 2. Create a new job that correctly calls schedule_six_month_processing
SELECT cron.schedule(
  'process-six-month-requests',   -- job name
  '1 0 * * *',                    -- schedule (1:00 AM daily)
  'SELECT schedule_six_month_processing();'  -- the command to execute
);

-- 3. Verify the job was created correctly
SELECT * FROM cron.job WHERE jobname = 'process-six-month-requests';

-- 4. Test the processing function
-- Uncomment the following line to manually test the processing:
-- SELECT schedule_six_month_processing(); 