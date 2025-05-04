# MyTime Refactor Plan (useMyTime Hook to Zustand Store)

This document outlines the plan to refactor the time-off data management from the `useMyTime.ts` hook to a centralized Zustand store (`useTimeStore`).

## Rationale

The current `useMyTime.ts` hook manages state locally and uses a module-level cache. While it includes real-time subscription logic, reliably updating the UI based on these events or user actions within the hook/component has proven difficult, requiring complex refresh logic and workarounds. Components like `mytime.tsx` and `calendar.tsx` (specifically `RequestDialog`) rely on this data and its timely updates.

Migrating to Zustand aims to:

- Centralize time-off related state (`timeStats`, `vacationStats`, requests, etc.).
- Provide a reactive state accessible globally.
- Simplify real-time update handling by allowing direct store updates from subscription callbacks.
- Optimize re-renders in consuming components (`mytime.tsx`, `calendar.tsx`).
- Decouple state management from component lifecycles.
- Consolidate time-off related database actions (request, cancel, paid-in-lieu) into the store.

## Detailed Refactoring Plan

### Phase 1: Store Foundation (`store/timeStore.ts`) - COMPLETE (Refinement Needed)

1. **[X] Create File:** Create `store/timeStore.ts`.
2. **[X] Define Interfaces:**
   - `TimeState`: Define the structure holding `timeStats: TimeStats | null`, `vacationStats: VacationStats | null`, `timeOffRequests: TimeOffRequest[]` (Ensure the `TimeOffRequest` type includes the `paid_in_lieu: boolean` field), `vacationRequests: UserVacationRequest[]`, `isLoading: boolean`, `isSubmittingAction: Record<string, boolean>`, `isSubscribing: boolean`, `error: string | null`, `lastRefreshed: Date | null`.
   - `TimeActions`: Define the action signatures: `initialize(memberId: string)`, `cleanup()`, `fetchTimeStats(memberId: string)`, `fetchVacationStats(memberId: string)`, `fetchTimeOffRequests(memberId: string)` (Ensure fetched data includes the `paid_in_lieu` field), `fetchVacationRequests(memberId: string)`, `handleRealtimeUpdate(payload: RealtimePostgresChangesPayload<any>)`, `requestPaidInLieu(type: 'PLD' | 'SDV', date: Date)` (This action will submit a regular request with `paid_in_lieu = true`), `cancelRequest(requestId: string)`, `cancelSixMonthRequest(requestId: string)`, `refreshAll(memberId: string)`, `submitRequest(leaveType: 'PLD' | 'SDV', date: string, isPaidInLieu?: boolean)` (Add optional boolean flag), `submitSixMonthRequest(leaveType: 'PLD' | 'SDV', date: string, isPaidInLieu?: boolean)` (Add optional boolean flag), `clearError()`.
3. **[X] Implement Store:**
   - Use `create<TimeState & TimeActions>((set, get) => ({ ... }))` from Zustand.
   - Implement initial state values (e.g., `null` for stats/requests, `isLoading: false`, `isSubmittingAction: {}`).
   - **[X] Implement fetching functions:** `fetchTimeStats`, `fetchVacationStats`, `fetchTimeOffRequests`, `fetchVacationRequests` implemented.
   - **[X] Implement actions:** `requestPaidInLieu`, `cancelRequest` (using RPC), `cancelSixMonthRequest`, `submitRequest`, `submitSixMonthRequest` implemented.
   - **[X] Implement `clearError`**: Done.
4. **[X] Implement Realtime Handling (Setup):**
   - Added `channel: RealtimeChannel | null`.
   - Modified `initialize` to set up channel and basic listeners (watching `pld_sdv_requests`, `six_month_requests`, `vacation_requests`, `pld_sdv_allocations`, `members`).
   - Implemented basic `handleRealtimeUpdate` (**Needs Refinement:** Currently triggers full refresh; needs granular updates).
   - **[X] Implement `cleanup` action**: Done.
5. **[X] Implement `refreshAll` Action:** Implemented.

### Phase 2: Auth Integration (`hooks/useAuth.tsx`) - COMPLETE

1. **[X] Modify `initializeUserStores`:**
   - Imported `useTimeStore`.
   - Removed `useMyTime` import and related logic.
   - Added `useTimeStore.getState().initialize(userId)` call.
2. **[X] Modify `runCleanupActions`:**
   - Imported `useTimeStore`.
   - Added `useTimeStore.getState().cleanup()` call.
   - Removed `myTimeCleanupRef` references.

### Phase 3: Hook Simplification (`hooks/useMyTime.ts`) - COMPLETE

1. **[X] Remove Internal State:** Removed `useState` calls.
2. **[X] Remove Effects:** Removed `useEffect`, `useFocusEffect`, etc.
3. **[X] Remove Internal Functions:** Removed internal fetching, realtime, caching functions.
4. **[X] Connect to Store:**
   - Imported `useTimeStore`.
   - Used Zustand selectors to get state slices.
   - Extracted actions from the store.
5. **[X] Return Values:** Hook returns selected state and actions from the store.

### Phase 4: `MyTimeScreen` Update (`app/(tabs)/mytime.tsx`) - COMPLETE

1. **[X] Consume Simplified Hook:** Screen now uses the simplified `useMyTime`.
2. **[X] Remove Local State/Effects:** Removed local state/effects related to data fetching/refreshing (`isRefreshing`, `isCancellingRequest`, `isMounted`, etc.).
3. **[X] Update UI Connections:**
   - `ThemedScrollView` uses `isRefreshing` from hook.
   - `CancelRequestModal` uses `isSubmittingAction` from hook.
   - Button handlers correctly call actions from hook.
   - PIL display logic in `RequestRow` remains correct.
4. **[X] Simplify Rendering:** Removed `renderCounter` and related logic.

### Phase 5: `CalendarScreen` & `Calendar.tsx` Updates

1. **`CalendarScreen` Component (`app/(tabs)/calendar.tsx`):**
   - If `CalendarScreen` uses `useMyTime` directly, update it.
2. **`RequestDialog` in `CalendarScreen` Component (`app/(tabs)/calendar.tsx`)**

   - **Remove Direct Hook Usage:** Delete `useMyTime()` call.
   - **Receive Props:** Modify `RequestDialogProps` to accept:
     - Necessary time stats (`availablePld`, `availableSdv`).
     - Consolidated store actions (`onSubmitRequest`, `onCancelRequest`, `onCancelSixMonthRequest`). Note: `onRequestPaidInLieu` prop might be removed if the dialog uses `onSubmitRequest` with a flag.
     - A flag indicating if an existing request for the date is PIL: `isExistingRequestPaidInLieu: boolean`.
     - The `isSubmittingAction` state slice.
     - The `error` state and `clearError` action.
   - **Pass Props:** In `CalendarScreen`, when rendering `<RequestDialog>`:

     - Call the simplified `useMyTime` hook.
     - Extract stats, actions (`submitRequest`, `submitSixMonthRequest`, `cancelRequest`, `cancelSixMonthRequest`, `clearError`), requests (`timeOffRequests`), loading state (`isSubmittingAction`), and error state (`error`).

     - **Determine PIL Status:** Before rendering, find any existing request for the `selectedDate` in `timeOffRequests`. If found, check its `paid_in_lieu` field.

     - Pass down stats, actions (`submitRequest`, etc.), the calculated `isExistingRequestPaidInLieu` boolean, `isSubmittingAction`, `error`, and `clearError`.

     ```tsx
     // Inside CalendarScreen component render function:
     const {
       timeStats,
       timeOffRequests, // Includes paid_in_lieu boolean
       submitRequest, // Takes optional isPaidInLieu flag
       submitSixMonthRequest, // Takes optional isPaidInLieu flag
       cancelRequest,
       cancelSixMonthRequest,
       isSubmittingAction, // Loading state map
       error, // Error state
       clearError, // Action to clear error
     } = useMyTime(); // Gets data/actions from Zustand store

     const selectedDate = useCalendarStore((s) => s.selectedDate);

     const existingRequestForDate = useMemo(() => {
       if (!selectedDate) return null;
       return timeOffRequests.find((req) => req.date === selectedDate);
     }, [timeOffRequests, selectedDate]);

     const isExistingRequestPaidInLieu = existingRequestForDate?.paid_in_lieu ?? false;

     // ... later when rendering RequestDialog
     <RequestDialog
       // ... other props
       availablePld={timeStats?.available.pld ?? 0}
       availableSdv={timeStats?.available.sdv ?? 0}
       isExistingRequestPaidInLieu={isExistingRequestPaidInLieu} // Pass PIL status of existing request
       isSubmittingAction={isSubmittingAction} // Pass loading states
       error={error} // Pass error state
       // Pass submitRequest directly, the dialog will add the isPaidInLieu flag
       onSubmitRequest={async (type, date, isPil = false) => {
             const isSixMonth = /* ... logic ... */;
             if (isSixMonth) {
                 await submitSixMonthRequest(type, date, isPil);
             } else {
                 await submitRequest(type, date, isPil);
             }
        }}
        onCancelRequest={cancelRequest}
        onCancelSixMonthRequest={cancelSixMonthRequest}
        // No need for specific onRequestPaidInLieu prop if using onSubmitRequest with a flag
        onClearError={clearError} // Pass clear error action
     />;
     ```

   - **Update Internal Logic:**
     - Modify `RequestDialog`'s internal handlers.
     - Add a dedicated "Request Paid in Lieu" button (or modify the main submit button logic).
     - When submitting, call `props.onSubmitRequest(type, date, true)` if it's a PIL request, and `props.onSubmitRequest(type, date, false)` otherwise.
     - Display a message if `props.isExistingRequestPaidInLieu` is true (e.g., "This request is marked as Paid in Lieu."). Adjust button states based on whether _any_ request exists for the day and its PIL status.
     - Use `props.isSubmittingAction` for loading indicators.
     - Handle errors via `props.error` and `props.onClearError`.
   - **Remove Redundant Logic:** Remove internal `refreshMyTimeStats`, etc.

3. **`Calendar.tsx` Component Updates:**

   - **Hook Usage:** If `Calendar.tsx` uses `useMyTime` (it shouldn't directly, usually data comes from `useCalendarStore`), update it. More likely, ensure `useCalendarStore` is providing the necessary data which might now indirectly rely on `useTimeStore`'s underlying data if they share real-time events.
   - **Marking PIL Days:**

     - Update `hasUserRequestForDate` (or equivalent check in `markedDates`) to simply find if _any_ request exists for the member on that date with a relevant status (approved, pending, waitlisted, etc.), ignoring the `paid_in_lieu` flag for the _existence_ check.
     - Modify the `markedDates` generation logic: After finding a user request exists (`userHasRequest`), check the `paid_in_lieu` boolean field of _that specific request_. If `true`, apply the `userRequested` style (or a different style). If `false`, also apply the `userRequested` style (as it's still the user's request). The boolean primarily informs the `RequestDialog`, while the calendar just shows the day is requested by the user.

     ```typescript
     // Inside Calendar.tsx -> hasUserRequestForDate (or inline logic)
     const hasUserRequestForDate = useCallback(
       (dateStr: string): TimeOffRequest | null => {
         // Return the request object or null
         if (!member?.id || !requests[dateStr]) return null;
         return (
           requests[dateStr].find(
             (req) =>
               req.member_id === member.id &&
               ["approved", "pending", "waitlisted", "cancellation_pending"].includes(req.status)
             // NOTE: We don't filter based on paid_in_lieu here for existence
           ) || null
         );
       },
       [member?.id, requests]
     );

     // Inside Calendar.tsx -> markedDates useMemo
     // ...
     const userRequest = hasUserRequestForDate(dateStr);
     const userHasRequest = !!userRequest;
     // const isPil = userRequest?.paid_in_lieu ?? false; // Get PIL status if needed for styling

     if (userHasRequest) {
       // Apply userRequested style regardless of PIL status for the calendar mark
       availability = "userRequested";
     } else if (isSixMonthRequest) {
       availability = "available";
     } else {
       availability = getDateAvailability(dateStr);
     }

     const colors = AVAILABILITY_COLORS[availability];
     // ... rest of marking logic, potentially using isPil for a different color if desired later
     ```

   - **Calendar Store Sync:** `useCalendarStore` should continue listening to real-time events (including changes to the `paid_in_lieu` field) to keep its view synchronized. It no longer triggers actions but reflects the state managed by `useTimeStore`.

4. **Action Consolidation (if applicable):** Ensure any request-related actions previously in `useCalendarStore` are removed or refactored to call `useTimeStore` actions.

### Phase 6: Testing & Cleanup

1. **Unit Tests:** Write unit tests for the `useTimeStore` actions and state transitions using Jest/Vitest.
2. **Integration Tests:** Test the `MyTimeScreen` and `CalendarScreen` interactions (requesting, cancelling, real-time updates) using React Native Testing Library or Detox.
3. **Manual Testing:** Thoroughly test all user flows related to time off requests, cancellations, paid-in-lieu, six-month requests, and real-time updates triggered by admin actions. Test edge cases (no available days, simultaneous actions, offline behavior if applicable).
4. **Code Cleanup:** Remove the old `useMyTime.ts` file (or archive it). Remove any redundant code, logs, or workarounds (like `renderCounter`) from the refactored components. Ensure consistent error handling.

## Open Questions / Considerations

- **Action Granularity:** Should store actions like `cancelRequest` be async and handle their own loading state, or should components manage loading UI while calling sync store actions? (Async actions within the store are generally cleaner).
- **Error Handling:** Define a consistent strategy for surfacing errors from store actions to the UI (e.g., via an `error` state property in the store and Toast messages in the UI).
- **Store Interaction (`useTimeStore` & `useCalendarStore`):** Confirm the best way to keep `useCalendarStore`'s view state in sync. Having both listen to real-time events seems most decoupled. Avoid direct calls between stores if possible.
- **Cleanup:** Ensure the `cleanup` action in `useTimeStore` effectively unsubscribes from the Supabase channel when called by `useAuth`.
- **PIL Impact on Stats:** Double-check if submitting a request with `paid_in_lieu: true` should affect the displayed `availablePld`/`availableSdv` counts in `timeStats`. If so, `handleRealtimeUpdate` and the `submitRequest`/`submitSixMonthRequest` actions in `useTimeStore` _must_ trigger `fetchTimeStats` when `isPaidInLieu` is true.
- **PIL Styling:** Decide if PIL days need a distinct visual marker on the calendar beyond the standard "userRequested" style. For now, using "userRequested" is sufficient.
