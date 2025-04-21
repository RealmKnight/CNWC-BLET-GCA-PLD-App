# Six Month Request Processing

## Overview

The six-month request processing system enables members to submit leave requests exactly six months in advance. These requests are held in a separate table (`six_month_requests`) until the appropriate processing time, when they are processed based on seniority order (`wc_sen_roster`) and moved to the regular request table (`pld_sdv_requests`).

## How It Works

### Submission Phase

1. When a member submits a request for exactly 6 months from the current date, it is stored in the `six_month_requests` table
2. The request is marked with `processed = false` and stored with the member's information
3. Six-month requests are not visible on the regular calendar and don't count toward daily allotment limits
4. Members can view their six-month requests in the "My Time" screen

### Processing Phase

1. A daily cron job runs the `schedule_six_month_processing` function at 1:00 AM
2. This function calculates the date exactly 6 months ahead of yesterday
3. Special logic handles month-end cases:
   - On regular days: Process only the exact 6-month future date
   - On month-end days: Process all dates from the 6-month point to the end of the target month
4. For each target date, the function calls `process_six_month_requests`

### Seniority-Based Processing

1. The `process_six_month_requests` function retrieves all unprocessed requests for the target date
2. Requests are sorted by seniority using `wc_sen_roster` (lower numbers = higher seniority)
3. For each request, in seniority order:
   - If there are available spots in the daily allotment: Add as "pending"
   - If allotment is full: Add to waitlist with appropriate position
4. Processed requests are moved from `six_month_requests` to `pld_sdv_requests`

## Regular vs. Six-Month Requests

| Regular Requests               | Six-Month Requests                                 |
| ------------------------------ | -------------------------------------------------- |
| Visible on calendar            | Not visible on calendar until processed            |
| Limited by available allotment | Not limited by available allotment when submitting |
| First-come, first-served       | Processed by seniority order (wc_sen_roster)       |
| Show availability immediately  | Only visible after processing                      |

## Special Month-End Handling

The system handles month-end cases specially to account for months with different lengths:

1. When submitting on the last day of a month (e.g., January 31)
2. The system allows requests for all days through the end of the target month (e.g., July 31)
3. This ensures fairness when current month has more days than target month

## Manual Processing Tools

If needed, administrators can manually process six-month requests:

1. **Run Processing for Specific Dates**: Use the `run_six_month_processor` procedure

   ```sql
   CALL run_six_month_processor('2025-04-20', '2025-04-20');
   ```

2. **Check Unprocessed Requests**: View requests waiting to be processed

   ```sql
   SELECT * FROM six_month_requests WHERE processed = false ORDER BY request_date;
   ```

3. **Process Specific Member Requests**: Force process a specific member's requests  
   (See script in `scripts/process_six_month_requests_manually.sql`)

## Troubleshooting

If issues arise with six-month request processing:

1. **Check Cron Job Configuration**:

   ```sql
   SELECT * FROM cron.job WHERE jobname = 'process-six-month-requests';
   ```

   The command should be: `SELECT schedule_six_month_processing();`

2. **Verify Unprocessed Requests**:

   ```sql
   SELECT * FROM six_month_requests WHERE processed = false;
   ```

3. **Manually Process Missed Dates**:

   ```sql
   CALL run_six_month_processor('YYYY-MM-DD', 'YYYY-MM-DD');
   ```

4. **View Processing Logs**:
   The `schedule_six_month_processing` and `process_six_month_requests` functions include
   RAISE NOTICE statements that provide detailed logs of their operations.

## Recent Improvements

1. **Improved Cron Job Configuration**: Now properly calls `schedule_six_month_processing()`
2. **Enhanced Waitlist Handling**: Requests are waitlisted rather than rejected when allotment is full
3. **Added Manual Processing Tools**: New procedure for administrators to manually process requests
4. **Better Month-End Handling**: More robust logic for handling the transition between months with different days
5. **Correct Seniority Ordering**: Using `wc_sen_roster` field with lower numbers representing higher seniority
