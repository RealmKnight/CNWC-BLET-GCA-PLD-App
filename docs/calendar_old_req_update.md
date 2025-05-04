# Calendar Past Request Viewing Update Plan

This document outlines the plan to allow users to view past requests and adjust calendar date ranges.

## Goal

Enable users to select dates in the past (and near-future, < 48 hours) on the calendar to view the approved requests for those dates. Dates further than 6 months in the future should be unselectable.

## Plan Steps

1. **Date Range & Fetching (`calendarStore.ts`):**

   - Modify `loadInitialData` and potentially `refreshData` to fetch `allotments` and `requests` for the entire current calendar year (Jan 1st to Dec 31st).

2. **Selectability Logic (`calendarStore.ts`):**

   - Update `isDateSelectable` function:
     - Return `true` for all dates from Jan 1st (current year) up to the 6-month mark from today.
     - Return `false` for dates beyond the 6-month mark.

3. **Visual Styling (`Calendar` component & `calendarStore.ts`):**

   - Confirm `getDateAvailability` returns `"unavailable"` for dates < 48 hours and > 6 months.
   - Ensure the `Calendar` component uses this to apply appropriate styling (e.g., grey background) for unavailable/past dates.

4. **Button Text (`CalendarScreen` - `calendar.tsx`):**

   - Modify the main button below the calendar based on `selectedDate`:
     - If date < 48 hours from now: Display "View Past Requests".
     - If date >= 48 hours from now: Display "Request Day / View Requests".

5. **Dialog Mode (`CalendarScreen` & `RequestDialog` - `calendar.tsx`):**

   - Add a `viewMode: 'past' | 'request' | 'nearPast'` prop to `RequestDialog`.
   - In `CalendarScreen`, set `viewMode` based on `selectedDate`:
     - `'past'`: date < (Now - 48 hours)
     - `'nearPast'`: date >= (Now - 48 hours) AND < Now
     - `'request'`: date >= Now
   - Pass `viewMode` to `RequestDialog`.

6. **Dialog Content (`RequestDialog` - `calendar.tsx`):**
   - Adjust content based on `viewMode`:
     - **If `viewMode === 'past'` or `viewMode === 'nearPast'`:**
       - Filter `requests` list to show only `status === 'approved'`.
       - Hide "Available PLD/SDV Days" section.
       - Hide "Request PLD", "Request SDV", "Cancel My Request" buttons.
       - If `viewMode === 'past'`, hide "Adjust Allocation" button.
       - If `viewMode === 'nearPast'`, show "Adjust Allocation" button for admins.
     - **If `viewMode === 'request'`:** Maintain current behavior.
