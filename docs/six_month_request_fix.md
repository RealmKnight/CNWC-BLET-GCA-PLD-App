# Six Month Request Processing Fix

## Issue Identified

We discovered that the cron job responsible for processing six-month requests was bypassing the logic to handle month-end cases. Instead of calling the `schedule_six_month_processing()` function, which contains the necessary logic for handling requests at the end of a month, the cron job was directly calling `process_six_month_requests()` with a specific date parameter.

This caused some six-month requests to remain unprocessed in the system, particularly when they were submitted during the last day of a month.

## Manual Fix Applied

We manually processed the pending six-month requests using:

```sql
-- Process Oct 20 requests
SELECT process_six_month_requests('2025-10-20'::DATE);

-- Process Oct 21 requests
SELECT process_six_month_requests('2025-10-21'::DATE);
```

All pending requests have now been processed.

## Permanent Fix Required

To permanently fix this issue, the cron job needs to be updated to call `schedule_six_month_processing()` instead of directly calling `process_six_month_requests()`.

We've created a function called `fix_six_month_cron_job()` that can be used to update the cron job. Here's how to apply the fix:

1. Login to the database with superuser privileges
2. Run the following command:

```sql
SELECT fix_six_month_cron_job();
```

3. Verify the cron job has been updated correctly:

```sql
SELECT * FROM cron.job WHERE jobname = 'process-six-month-requests';
```

The command field should now be `SELECT schedule_six_month_processing();` instead of directly calling `process_six_month_requests()`.

## Verification

After applying the fix, you can verify it's working correctly by:

1. Creating a test six-month request
2. Manually triggering the cron job:

```sql
SELECT schedule_six_month_processing();
```

3. Verifying the request has been processed and moved to the `pld_sdv_requests` table with status 'pending'

## Understanding the Fix

The `schedule_six_month_processing()` function implements special logic for end-of-month cases:

- On regular days, it processes requests for exactly 6 months ahead
- On the last day of a month, it processes all days from the 6-month date to the end of that month

This ensures that requests made on month-end days (e.g., January 31) can be properly processed for the corresponding days 6 months later (e.g., July 31), even when months have different numbers of days.

## Prevention

To prevent similar issues in the future:

1. When modifying cron jobs, always test them manually first
2. Document all cron jobs and their purpose
3. Add comments to cron job definitions explaining what they do and any special logic they implement
4. Consider implementing monitoring for unprocessed requests that are past their processing date
