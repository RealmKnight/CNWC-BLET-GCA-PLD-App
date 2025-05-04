# Six Month Request End-of-Month Edge Case Implementation Plan

## Current System Analysis

1. Date Validation:

   - Currently handled in app via calendarStore date validation
   - Calendar UI uses this logic for date selection
   - Requests validated before submission

2. Processing:

   - Cron job processes requests daily via `schedule_six_month_processing`
   - Each request is processed based on calendar_id and seniority

3. Edge Case Handling:
   a. Current Month End -> Target Month End (Implementing):
   - When current day is last day of month, allow requests through end of target month
   - Example: On Feb 28, allow requests for Aug 28-31
     b. Target Month Shorter (No Action Required):
   - When current month has more days than target month, no special handling needed
   - Example: On Jan 31, six-month requests would have been submitted on Jan 30 for Jul 30
   - This maintains consistency as requests for Jul 31 aren't possible since the date doesn't exist

## Required Changes

### 1. App-Side Changes

a. Update calendarStore.ts (State Management):

```typescript
// Add helper function for end-of-month detection
const isLastDayOfMonth = (date: Date): boolean => {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
};

// Update date validation logic
isDateSelectable: (date: string) => {
  const now = new Date();
  const dateObj = parseISO(date);
  const fortyEightHoursFromNow = addDays(now, 2);
  const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  // Check if today is end of month
  const isEndOfMonth = isLastDayOfMonth(now);

  // If end of month, allow all dates in target month after six months point
  if (isEndOfMonth) {
    const targetMonth = sixMonthsFromNow.getMonth();
    const targetYear = sixMonthsFromNow.getFullYear();
    const isTargetMonth = dateObj.getMonth() === targetMonth && dateObj.getFullYear() === targetYear;
    if (isTargetMonth && dateObj >= sixMonthsFromNow) {
      return true;
    }
  }

  // Regular case - exact 6 month match
  return dateObj.getTime() === sixMonthsFromNow.getTime();
};

// Update date availability check
getDateAvailability: (date: string) => {
  const now = new Date();
  const dateObj = parseISO(date);
  const fortyEightHoursFromNow = addDays(now, 2);
  const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

  // Check if date is selectable (reuse existing logic)
  if (!isDateSelectable(date)) {
    return "unavailable";
  }

  // Rest of the existing availability logic remains unchanged
  // This ensures the calendar shows proper colors based on allotments
  // and existing requests
};
```

b. Update Calendar.tsx (Display Component):

```typescript
// No changes needed to the Calendar component
// It will automatically use the updated logic from calendarStore
// to show proper colors and handle date selection
```

### 2. Database Changes (use MCP tool)

a. Update `schedule_six_month_processing`:

```sql
CREATE OR REPLACE FUNCTION schedule_six_month_processing()
RETURNS void AS $$
DECLARE
    v_target_date DATE;
    v_process_until DATE;
BEGIN
    -- Get the date that was 6 months ago from yesterday
    v_target_date := (CURRENT_DATE - INTERVAL '1 day' + INTERVAL '6 months')::DATE;

    -- If processing end of month requests, get last day of target month
    IF (CURRENT_DATE - INTERVAL '1 day') =
       (DATE_TRUNC('MONTH', CURRENT_DATE - INTERVAL '1 day') + INTERVAL '1 MONTH - 1 day')::date
    THEN
        v_process_until := (DATE_TRUNC('MONTH', v_target_date) + INTERVAL '1 MONTH - 1 day')::date;

        -- Process each day separately to maintain seniority order per day
        WHILE v_target_date <= v_process_until LOOP
            PERFORM process_six_month_requests(v_target_date);
            v_target_date := v_target_date + INTERVAL '1 day';
        END LOOP;
    ELSE
        -- Regular case - process single day
        PERFORM process_six_month_requests(v_target_date);
    END IF;
END;
$$ LANGUAGE plpgsql;
```

### 3. Testing Plan

1. End of Month Scenarios:

   - Test date selection in calendarStore
   - Verify calendar display shows correct dates as available
   - Test submission flow for multiple dates
   - Verify processing order and seniority handling

2. Regular Day Scenarios:

   - Verify normal behavior is unchanged
   - Test submission on non-end-of-month days

3. Edge Cases:
   - Test February (28/29 days)
   - Test months with 30 vs 31 days
   - Test year boundaries
   - Test when current day is last day of month but target month has fewer days

### 4. Validation Checks

1. App-Side:

   - Verify calendarStore correctly identifies end-of-month cases
   - Confirm Calendar component shows correct availability colors
   - Validate request submission flow handles multiple dates correctly

2. Database:

   - Verify each day's requests are processed independently
   - Confirm seniority-based allocation works correctly for each day
   - Check that calendar_id is properly maintained

3. Request Flow:
   - Verify submission process remains unchanged
   - Confirm success messages are consistent
   - Validate that requests are properly tagged as six-month requests

Note: The implementation maintains clear separation of concerns:

- calendarStore.ts handles state management and business logic
- Calendar.tsx handles display and user interaction
- Database handles only request processing
  This ensures each component has a single responsibility and makes the code easier to maintain and test.
