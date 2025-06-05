# Calendar Allocations Adjustment Feature Plan

## Overview

This feature will add functionality to adjust calendar allocations directly from the calendar request dialog for admin users. When an admin views the request dialog for a specific day, they will be able to modify the number of available spots for that day. This will require updating the UI, adding allocation adjustment logic, and implementing waitlist processing logic.

## User Requirements

- Admin users (division_admin, union_admin, or application_admin) should see an adjustment button in the request dialog
- The button should only appear in the calendar request dialog, not elsewhere in the application
- The feature should work for both PLD/SDV and Vacation calendars
- After changing allocations, the system should automatically process any waitlist requests if spots were added
- The UI should provide feedback about the changes made
- Allocation reductions below the number of already approved requests will not be permitted

## Database Triggers and Functions

After examining the database system, we found several key triggers and functions that will be utilized in this feature:

### 1. `handle_request_count` Trigger Function

This function manages the count of requests in the `pld_sdv_allotments` table and is triggered on INSERT, UPDATE, and DELETE operations on the `pld_sdv_requests` table. Key behaviors:

- Creates allotment records if they don't exist
- Increments `current_requests` for new pending/approved requests
- Decrements `current_requests` when requests are cancelled/denied
- Prevents the count from going below zero

### 2. `handle_spot_opened` Trigger Function

This function handles the waitlist promotion logic when a spot becomes available. It is triggered when a request status changes or a request is deleted. Key behaviors:

- Detects when an occupied spot becomes available
- Promotes the next waitlisted request based on waitlist position
- Updates `status` and clears `waitlist_position` for the promoted request
- Recalculates waitlist positions for remaining waitlisted requests
- Sends notifications when requests are promoted

### 3. `validate_allotment_change` Trigger Function

This function validates allocation reductions, ensuring they don't go below the current number of approved requests. Key behaviors:

- Prevents reducing max_allotment below current approved/pending requests count
- Throws an exception with descriptive error message when validation fails
- This validation will be strictly enforced; no overrides will be allowed in this implementation

### 4. `bulk_update_vacation_range` Function

This function is specifically for vacation allocations and manages updating multiple weeks at once. Key behaviors:

- Takes a date range and applies the same allocation to all weeks within that range
- Automatically calculates the Monday start date for each week
- Handles year boundaries correctly
- Returns the count of affected weeks

## Vacation Calendar System

Vacation allocations differ significantly from PLD/SDV allocations in the following ways:

### 1. Week-Based Structure

- Vacation requests operate on a full-week basis (Monday through Sunday)
- The `week_start_date` field in `vacation_allotments` is crucial and must ALWAYS be a Monday
- All dates within the same week share the same allocation value
- When changing an allocation for any day, the entire week's allocation is affected

### 2. Database Schema Differences

- `vacation_allotments` table uses `week_start_date` instead of `date`
- Has `vac_year` field to identify which vacation year the allocation belongs to
- Includes the same metadata fields as `pld_sdv_allotments`
- Primary key constraint on `(calendar_id, week_start_date)` to ensure uniqueness

### 3. Date Handling

- When a user selects a date for adjustment, we must calculate the corresponding Monday
- All UI messaging should make it clear that changes affect the entire week
- Date pickers should emphasize the week rather than individual days

## UI Integration

### 1. Use Existing Components & Styles

- Leverage existing UI components like `TouchableOpacity`, `ThemedView`, `ThemedText` for consistent styling
- Use the existing button styles from the application, particularly from the request dialog
- The allocation adjustment button should follow the same styling as the existing action buttons (Request PLD/SDV)
- Use existing modal components and styling for the adjustment dialog
- Utilize the existing Toast notification system for feedback

### 2. Admin Permission Check

- Leverage the existing permission system in `userStore.ts`
- Use the `userRole` state from `useUserStore()` to check for admin permissions

### 3. UI Implementation

- Place the allocation adjustment button at the bottom of the request dialog (below Close/Request buttons)
- Only render the button if `isAdmin` is true
- The button should use the same component structure as existing buttons:

```tsx
{
  isAdmin && (
    <TouchableOpacity
      style={[dialogStyles.modalButton, dialogStyles.adjustButton]}
      onPress={handleAdjustAllocation}
      activeOpacity={0.7}
    >
      <ThemedText style={dialogStyles.modalButtonText}>Adjust Allocation</ThemedText>
    </TouchableOpacity>
  );
}
```

### 4. Adjustment Modal

- Create a minimal modal component using the existing Modal and ThemedView components
- Follow the same styling as other modals in the app
- Use TextInput with the same styling as other inputs in the application
- Include familiar action buttons consistent with existing UI
- For vacation calendar, clearly indicate the week start and end dates in the UI
- Include an info message explaining that allocations cannot be reduced below the current number of approved requests

## Data Flow

### 1. Allocation Adjustment Functions in adminCalendarManagementStore

For PLD/SDV calendars:

```typescript
// Define in adminCalendarManagementStore
updateDailyAllotment: async (calendarId: string, date: string, maxAllotment: number, userId: string) => Promise<void>;
```

For Vacation calendars:

```typescript
// Define in adminCalendarManagementStore
updateWeeklyAllotment: async (
  calendarId: string,
  date: string, // Any date within the target week
  maxAllotment: number,
  userId: string
) => Promise<void>;
```

### 2. Request Processing Logic

With the discovery of the `handle_spot_opened` trigger, we can rely on the database to handle waitlist promotion automatically. We will add error handling for the validation failures:

```typescript
handleAllocationUpdate: async (calendarId: string, date: string, newAllotment: number) =>
  Promise<{
    success: boolean;
    error?: string;
  }>;
```

## Database Updates

### 1. Update PLD/SDV Daily Allocation

- Update the `pld_sdv_allotments` table with the new allocation value:

```sql
-- Stored as date-specific override
INSERT INTO pld_sdv_allotments
  (calendar_id, date, max_allotment, is_override, override_by, override_at)
VALUES
  ($calendarId, $date, $maxAllotment, true, $userId, now())
ON CONFLICT (calendar_id, date)
DO UPDATE SET
  max_allotment = $maxAllotment,
  is_override = true,
  override_by = $userId,
  override_at = now();
```

### 2. Update Vacation Weekly Allocation

- Update the `vacation_allotments` table, ensuring we use the correct Monday `week_start_date`:

```sql
-- Calculate the Monday start date for the given date
-- If the date is already a Monday, use it directly
-- Otherwise, go back to the previous Monday
DO $$
DECLARE
  v_week_start DATE;
BEGIN
  -- Calculate the start of the week (Monday)
  v_week_start := $date - EXTRACT(DOW FROM $date)::INT + 1;
  IF EXTRACT(DOW FROM $date) = 0 THEN -- Sunday
    v_week_start := $date - 6; -- Go back to previous Monday
  END IF;

  -- Insert/update the allocation record with the correct week start
  INSERT INTO vacation_allotments
    (calendar_id, week_start_date, vac_year, max_allotment, is_override, override_by, override_at)
  VALUES
    ($calendarId, v_week_start, EXTRACT(YEAR FROM v_week_start)::INT, $maxAllotment, true, $userId, now())
  ON CONFLICT (calendar_id, week_start_date)
  DO UPDATE SET
    max_allotment = $maxAllotment,
    is_override = true,
    override_by = $userId,
    override_at = now();
END $$;
```

### 3. Handling Validation Errors

For handling validation errors from the `validate_allotment_change` trigger:

```typescript
try {
  // Attempt to update the allocation
  await supabase.from("pld_sdv_allotments").upsert({
    calendar_id: calendarId,
    date: formattedDate,
    max_allotment: newAllotment,
    is_override: true,
    override_by: userId,
    override_at: new Date().toISOString(),
  });

  return { success: true };
} catch (error) {
  // Check if it's a validation error
  if (error.message && error.message.includes("Cannot reduce max_allotment")) {
    return {
      success: false,
      error: "Cannot reduce allocation below the number of current approved requests.",
    };
  }

  // Other errors
  return {
    success: false,
    error: "An error occurred updating the allocation.",
  };
}
```

### 4. Bulk Date Range Updates for Vacation

For vacation allocations across a date range, we can use the existing `bulk_update_vacation_range` function:

```sql
SELECT * FROM bulk_update_vacation_range(
  $calendarId,
  $startDate,
  $endDate,
  $maxAllotment,
  $userId
);
```

## Implementation Steps

1. **Update RequestDialog Component**

   - Add admin permission check using `userRole` from `useUserStore`
   - Add admin control section with "Adjust Allocation" button using existing button styles
   - Create state for tracking allocation changes
   - Style the button to match existing app UI
   - For vacation calendar, add week indication showing Monday to Sunday

2. **Implement Allocation Adjustment Modal**

   - Build modal using existing Modal component and styling
   - Use ThemedView, ThemedText, and TextInput components with app's existing styles
   - Style the modal to be consistent with existing modals in the app
   - Use existing button components for the action buttons
   - Include informational text about allocation limits (cannot reduce below approved requests)
   - For vacation calendar, clearly indicate that changes affect the entire week

3. **Update adminCalendarManagementStore**

   - Implement `updateDailyAllotment` function for PLD/SDV calendars
   - Implement `updateWeeklyAllotment` function for vacation calendars
   - Leverage existing database triggers (`handle_spot_opened`, `handle_request_count`)
   - Add proper error handling for the `validate_allotment_change` validation failures
   - For vacation calendars, implement proper Monday calculation logic
   - Ensure compatibility with existing store data and functions

4. **Update calendarStore**

   - Ensure the store refreshes data after allocation changes
   - Utilize existing real-time subscription to allocation changes from setupCalendarSubscriptions
   - Update existing data structures when allocations change
   - For vacation calendar, ensure week-based structures are properly updated

5. **Add Visual Feedback**
   - Use existing Toast notification system for successful/failed allocation changes
   - Update the request list in the dialog after allocation changes
   - Show a loading state during allocation processing
   - Display appropriate error messages from the `validate_allotment_change` trigger
   - For vacation calendar, include the week date range in notifications

## Vacation Calendar Integration

1. **Vacation Calendar Specifics**

   - Implement the week-based allocation system (Monday-Sunday)
   - Always calculate the correct Monday start date for any selected date
   - Update UI to clearly show the full week being modified
   - Use the `vacation_allotments` table instead of `pld_sdv_allotments`
   - Leverage the `bulk_update_vacation_range` function for range updates

2. **Week Calculation Logic**

   ```typescript
   // Helper function to calculate Monday start date
   const getMondayStartDate = (date: Date): Date => {
     const day = date.getDay();
     // If Sunday (0), go back 6 days to previous Monday
     // Otherwise, go back (day - 1) days to reach Monday
     const daysToSubtract = day === 0 ? 6 : day - 1;
     const monday = new Date(date);
     monday.setDate(date.getDate() - daysToSubtract);
     return monday;
   };
   ```

3. **Unified User Experience**
   - Maintain consistent UI and behavior between both calendar types
   - Same permission checks apply to both calendars
   - Use consistent terminology and feedback mechanisms
   - Clearly differentiate date-based vs. week-based operations where appropriate

## Testing Plan

1. **Unit Tests**

   - Test allocation update functions
   - Test interaction with database triggers
   - Test permission checks
   - Test Monday calculation for vacation calendar
   - Test error handling for validation failures

2. **Integration Tests**

   - Test end-to-end flow from UI to database and back
   - Verify `handle_spot_opened` trigger promotes waitlisted requests correctly
   - Test real-time updates with multiple clients
   - Verify `validate_allotment_change` prevents invalid reductions
   - For vacation calendar, verify week start calculations and correct week display

3. **Edge Cases**
   - Test with maximum allocation (0)
   - Test with very large allocation increases
   - Test attempts to reduce allocations below approved requests
   - Test with concurrent updates
   - Test with various request statuses in the system (approved, pending, waitlisted)
   - Test error handling when validation fails
   - For vacation calendar, test dates that fall on week boundaries
