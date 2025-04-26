# Plan to Fix Authentication Flow, Refresh, Tab Focus, and Core Data Initialization Issues

_Reviewed previous notification plan (`notifications_update.md`) and incorporated relevant concepts like the `isInitialized` flag and specific screen refactoring needs. Expanded plan to include initialization of `calendarStore` and `useMyTime`._

## Overarching Guidelines

- **Maintain Existing Style:** All code changes, new components, and UI elements must strictly adhere to the existing application's visual style, color scheme, typography, button styles, layout patterns, and overall UI/UX conventions. Consistency is paramount.
- **Search Before Creating:** Before implementing any new component, hook, store, utility function, or file, **thoroughly search the existing codebase** (`components/`, `hooks/`, `store/`, `utils/`, etc.) to identify if similar functionality already exists. Prioritize reusing and extending existing code over creating duplicates.

## Problems Identified

1. **State Loss on Tab/App Focus:** App state seems inconsistent or lost when switching browser tabs (web) or backgrounding/foregrounding the app (native) and returning. Affects screen data, permission states (`(admin)` route), and potentially core data freshness.
2. **Error on Refresh & Redirect:** Hard browser refreshes lead to errors (like "Division not found: index") and incorrect initial redirects, indicating race conditions between auth/router initialization and component rendering/fetching.
3. **Core Data Synchronization & Initialization:** Core data modules (`notificationStore`, `calendarStore`, `useMyTime`) need robust initialization triggered _after_ authentication is confirmed and the `member` object is available. Current screen-level initializations can lead to race conditions, duplicate subscriptions/fetches, and data not being ready before navigation.

## The Plan

### 1. Screen Self-Reliance (for Param-Dependent Screens)

- **Goal:** Make screen components that depend _directly_ on URL parameters (e.g., profile ID, division name) primarily responsible for fetching their specific data using validated parameters. This addresses the "Division not found: index" type errors.
- **Affected Screens:** `app/(profile)/[ProfileID].tsx`, `app/(division)/[divisionName].tsx`, etc.
- **Steps:**
  - Inside relevant screen `useEffect` triggered by `useLocalSearchParams`:
    - **Validate Parameter:** Check parameter value (not null, undefined, empty, "index", etc.) before proceeding.
    - **Conditional Fetch:** Only fetch if the parameter is valid.
    - Use local loading/error states.
    - Render based on local state.

### 2. Centralize Core Store/Hook Initialization (`hooks/useAuth.tsx`, `store/*`, `hooks/useMyTime.ts`)

- **Goal:** Initialize core, auth-dependent data modules (`notificationStore`, `calendarStore`, `useMyTime`) globally from `useAuth` _after_ successful authentication and member validation, ensuring data is ready early and preventing duplicate setups.
- **Add `isInitialized` Flags:**
  - Ensure `notificationStore`, `calendarStore`, and `useMyTime` (or its internal state) have an `isInitialized: boolean` flag (default `false`) and a way to set/reset it.
- **Steps within `useAuth.tsx` (Initialization Logic):**
  - Locate the point where `authStatus` is confirmed as `AUTHENTICATED` (or similar) and the `member` object is fully available and validated.
  - **Notification Store Init:**
    - Check `notificationStore.isInitialized`. If true, skip.
    - Validate `member.pin_number` and `member.id`.
    - Call `fetchMessages` and `subscribeToMessages`. Store `unsubscribe` handle.
  - **Calendar Store Init:**
    - Check `calendarStore.isInitialized`. If true, skip.
    - Validate `member.calendar_id`.
    - Call `loadInitialData` (with appropriate date range, maybe derived or default).
    - Consider calling `setupCalendarSubscriptions` (if it returns a cleanup function, store it).
  - **MyTime Hook Init:**
    - Check `useMyTime` internal `isInitialized` state (or add one). If true, skip.
    - Validate `member.id` and `member.pin_number`.
    - Call `initialize` (or `refreshData`) from `useMyTime`. Store cleanup handle if applicable.
- **Steps within `useAuth.tsx` (Cleanup Logic):**
  - In the `useEffect` cleanup or logout handler:
    - Call stored `unsubscribe`/cleanup functions for notifications, calendar, and myTime.
    - Explicitly reset `isInitialized` flags in stores/hooks.
- **Future Critical Message Handling Preparation (within Notification Init):**
  - After initial `fetchMessages`, check for critical unacknowledged messages.
  - Set `authStatus` to `MUST_ACKNOWLEDGE_CRITICAL` if found, otherwise proceed to `AUTHENTICATED`.

### 3. Refine App State Focus Handling (`hooks/useAuth.tsx`)

- **Goal:** Ensure the `AppState` listener correctly handles app focus changes without causing disruptive state resets, while optionally refreshing core data if needed.
- **How:**
  - Modify the `AppState` listener callback:
    - On 'active' event:
      - Check session validity (`getSession`).
      - **If tokens differ:** Call `updateAuthState(...)`. This re-runs the full auth flow, including re-triggering the initialization logic in Step 2 (which respects `isInitialized` flags).
      - **If tokens are the same:**
        - Ensure permission state consistency.
        - Verify Realtime connections (Notifications, Calendar) are active/reconnected.
        - **Optional Data Refresh:** If Realtime seems insufficient _on focus_, consider _throttled_ calls to refresh data (`fetchMessages`, `loadInitialData`, `refreshData` for myTime) using user data from stores. Avoid re-subscribing.

### 4. Solidify Navigation (`app/_layout.tsx`)

- **Goal:** Ensure navigation is driven solely by the final, stable `authStatus` from `useAuth`, handling all states robustly.
- **How:**
  - Use the `NavigationHandler` reacting to `authStatus` changes.
  - Verify `switch (authStatus)` handles all states correctly (including `MUST_ACKNOWLEDGE_CRITICAL`).
  - Ensure robustness against focus changes (no premature redirects from protected routes).
  - Ensure `useAuth` sets final `authStatus` only after _all_ checks (auth, member, critical notifications) complete.

## Proposed Execution Order

1. **Add `isInitialized` Flags:** Implement/verify `isInitialized` state and setters/resetters in `notificationStore`, `calendarStore`, and `useMyTime`.
2. Implement **Step 1** (Screen Self-Reliance for Param-Dependent Screens).
3. Implement **Initialization and Cleanup Logic** from Step 2 within `useAuth.tsx` for Notifications, Calendar, and MyTime.
4. **Refactor Screens (`notifications.tsx`, Calendar Screen, MyTime Screen):**

- Remove redundant initialization/subscription logic.
- Ensure they rely on the globally initialized stores/hooks.
- Add data refresh on focus (`useFocusEffect`) if needed for immediate UI updates when navigating _to_ the screen.

5. Implement **Step 3** (Refine App State Focus Handling) in `useAuth`.
6. Review and potentially refine **Step 4** (Solidify Navigation) in `_layout.tsx`.
7. Test thoroughly: All previous tests plus calendar/my time data loading on startup, focus changes affecting these screens, logout/login clearing state correctly.

## Future Considerations

- **"Must Read" Implementation:** As previously defined.
- **Error Handling:** Enhance global error handling, especially for initialization failures in `useAuth`.
