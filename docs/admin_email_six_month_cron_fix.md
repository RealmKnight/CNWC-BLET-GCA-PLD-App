Subject: URGENT: Fix Required for Six-Month Request Processing Cron Job

Dear Administrator,

We've identified an issue with the six-month request processing system that requires immediate attention. The system's cron job is incorrectly configured, causing six-month requests to remain unprocessed in certain scenarios.

## Issue Details

The cron job is currently calling `process_six_month_requests()` directly with a date parameter, bypassing the `schedule_six_month_processing()` function that contains essential logic for handling month-end cases. This has resulted in unprocessed six-month requests.

## Immediate Action Required

As a database administrator with the necessary privileges, please execute the following steps:

1. **Run the attached SQL script** (`scripts/recreate_six_month_cron_job.sql`) to:

   - Delete the existing cron job
   - Create a properly configured replacement
   - Verify the change was successful

2. **Notify the team once completed** so we can verify proper functioning.

## Interim Solution

Until the cron job is fixed, we've created a function `run_six_month_processing()` that can be run manually to correctly process six-month requests. Users with appropriate database permissions can run:

```sql
SELECT * FROM run_six_month_processing();
```

This will process any outstanding six-month requests using the correct logic and return a table showing the results.

## Technical Details

The correct implementation should use the `schedule_six_month_processing()` function, which:

- Handles regular days by processing requests for exactly 6 months ahead
- Handles month-end days by processing all dates from the 6-month point to the end of that month

This ensures proper handling of all cases, including transitions between months with different numbers of days.

## Verification

After implementing the fix, please verify it works by checking:

```sql
SELECT * FROM cron.job WHERE jobname = 'process-six-month-requests';
```

The `command` field should contain: `SELECT schedule_six_month_processing();`

Please treat this as a high-priority issue as it affects users' ability to request time off. Let me know if you need any clarification or assistance.

Thank you,
[Your Name]
Application Support Team
