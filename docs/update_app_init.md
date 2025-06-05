# Application Initialization and State Management Refinement Plan

This document outlines the plan to improve the initialization, data fetching, caching, and real-time update logic for the application's state stores and related hooks. The goal is to enhance performance, reduce redundant operations, and improve the overall user experience.

## 1. Problem Areas & Goals

- **Problem:** Inconsistent initialization triggers (e.g., `useAuth`, `useFocusEffect`, `AppState`, component mounts) leading to redundant fetches or missed initializations.
- **Problem:** Over-fetching data or fetching stale data due to inefficient caching strategies or lack of invalidation.
- **Problem:** Complex and potentially duplicated logic for fetching/checking specific data points (e.g., six-month requests) in both components and stores.
- **Problem:** Real-time subscriptions might be set up multiple times or not cleaned up properly, leading to memory leaks or stale data.
- **Problem:** Performance degradation due to unnecessary re-renders caused by frequent store updates or complex memoization dependencies.
- **Problem:** Lack of clear, granular loading/error states during initialization and refresh cycles.
- **Goal:** Establish a single, reliable trigger for initial data loading post-authentication.
- **Goal:** Streamline the initialization sequence for all relevant stores (`useUserStore`, `useCalendarStore`, `useVacationCalendarStore`, `useNotificationStore`, `useAdminNotificationStore`) and hooks (`useMyTime`).
- **Goal:** Implement a robust caching strategy with clear invalidation rules.
- **Goal:** Centralize and optimize data fetching logic, reducing duplication.
- **Goal:** Ensure efficient and reliable real-time subscription management and state updates.
- **Goal:** Optimize component rendering by refining dependencies and state consumption.
- **Goal:** Provide clearer loading and error feedback to the user.

## 2. Proposed Strategy & Phased Implementation

### Phase 1: Foundational Changes (`useAuth`, `useMyTime`, `calendarStore`) - ✅ COMPLETED

- **Step 1.1: Refactor `hooks/useAuth.tsx` (Centralized Trigger - Section 2.1)** - ✅ COMPLETED

  - Refine `updateAuthState` to reliably determine `authStatus` (`signedInMember`, `signedInAdmin`) and fully resolve `member` data.
  - Implement the centralized initialization logic to call `initialize` / `loadInitialData` functions of other stores/hooks _after_ `authStatus` and `member` data are confirmed.
  - Ensure necessary IDs (user ID, calendar ID, etc.) are passed correctly.
  - Verify `runCleanupActions` correctly unsubscribes from _all_ associated stores/hooks.
  - Remove old initialization triggers from `useFocusEffect` / `AppState` listeners within `useAuth`.

- **Step 1.2: Refactor `hooks/useMyTime.ts` (Init/Refresh Flow - Section 2.2, Caching - Section 2.3)** - ✅ COMPLETED

  - Refine `initialize(force = false)` to handle initial load vs. refresh (cooldown, cache check).
  - Remove time-based caching (`CACHE_DURATION`).
  - Implement and export `invalidateCache()`. Call it after mutations (`requestPaidInLieu`, etc.) and potentially relevant realtime events.
  - Adapt focus/AppState triggers to respect cooldown and primarily check realtime status.
  - Update loading states (`isLoading`, `isRefreshing`, `syncStatus`) per Section 2.7.

- **Step 1.3: Refactor `store/calendarStore.ts` (Init/Refresh - Section 2.2, Data Fetching - Section 2.5, Subscriptions - Section 2.4)** - ✅ COMPLETED
  - Ensure `loadInitialData` is only called by `useAuth`.
  - Define clear refresh logic (primarily rely on realtime via `setupCalendarSubscriptions`).
  - **Centralize Six-Month Logic:** Move all fetching (`checkSixMonthRequest`, direct Supabase calls) and state management (`sixMonthRequestDays`) for user's six-month requests entirely into this store. Initialize this data during `loadInitialData`.
  - Ensure `setupCalendarSubscriptions` is called only once by `useAuth` and handles realtime updates efficiently.
  - Refine `isLoading` state.
  - Fix table name references to use existing tables (`pld_sdv_allotments` instead of `day_allotments`) and correct join syntax.

### Phase 2: Store Alignment (Remaining Stores) - ✅ COMPLETED

- **Goal:** Align the remaining user-specific stores with the centralized initialization pattern.

- **Step 2.1: Refactor `store/vacationCalendarStore.ts` (Init/Refresh - Section 2.2, Subscriptions - Section 2.4)** - ✅ COMPLETED

  - Ensure `loadInitialData` is only called by `useAuth`.
  - Define clear refresh logic (primarily rely on realtime via `setupVacationCalendarSubscriptions`).
  - Ensure `setupVacationCalendarSubscriptions` is called only once by `useAuth`.
  - Refine `isLoading` state.

- **Step 2.2: Refactor `store/notificationStore.ts` (Init/Refresh - Section 2.2, Subscriptions - Section 2.4)** - ✅ COMPLETED

  - Ensure `fetchMessages` (for initial load) is only called by `useAuth`.
  - Define clear refresh logic (primarily rely on realtime via `subscribeToMessages`).
  - Ensure `subscribeToMessages` is called only once by `useAuth`.
  - Refine `isLoading` state.

- **Step 2.3: Refactor `store/adminNotificationStore.ts` (Init/Refresh - Section 2.2, Subscriptions - Section 2.4)** - ✅ COMPLETED
  - Ensure `initializeAdminNotifications` is only called by `useAuth`.
  - **Important:** Only initialize this store for:
    - Users with `company_admin` role (from user metadata)
    - Members whose `members.role` is NOT "user" but is an admin role (`application_admin`, `union_admin`, `division_admin`)
  - Define clear refresh logic (primarily rely on realtime via the channel setup within `initializeAdminNotifications`).
  - Refine `isLoading` state.

### Phase 3: UI Refactoring & Adaptation

- **Goal:** Update UI components to consume the refined state management, remove redundant logic, and implement clearer feedback.

- **Step 3.1: Refactor `components/Calendar.tsx` (Component Rendering - Section 2.6, Data Fetching - Section 2.5)**

  - Remove `useEffect` hooks related to fetching/checking six-month requests; rely solely on `calendarStore` state (`sixMonthRequestDays`).
  - **Critical:** Ensure the existing, correct six-month request eligibility logic (including handling end-of-month discrepancies where the target month has more/fewer days) is preserved when this logic is centralized within `calendarStore` (as part of Step 1.3).
  - Review `useMemo` dependencies for `markedDates` calculation. Optimize state selection (use selectors if possible) to minimize re-renders.
  - Adapt to use `calendarStore`'s `isLoading` state.

- **Step 3.2: Refactor `app/(tabs)/calendar.tsx` (Loading/Error States - Section 2.7)**

  - Remove any component-level initialization/refresh logic.
  - Adapt UI to reflect `calendarStore`'s `isLoading` and `error` states accurately.

- **Step 3.3: Refactor `app/(tabs)/mytime.tsx` (Loading/Error States - Section 2.7)**

  - Remove any component-level initialization/refresh logic (e.g., in `useFocusEffect`).
  - Adapt UI to use the distinct loading states from `useMyTime` (`isLoading`, `isRefreshing`, `syncStatus.isSyncing`) and its `error` / `syncStatus.error` states.
  - Use `ThemedToast.tsx` for appropriate background errors.

- **Step 3.4: Review Other Components**
  - Identify and refactor any other components directly consuming affected stores/hooks to align with the new patterns (removing fetches, adapting to loading states) ie `app/(tabs)/notifications.tsx`, etc. Need to check the Request Dialog in `app(tabs)/calendar.tsx` page to ensure it gets the correct stats from useMyTime hook

### Phase 4: Testing & Validation

- **Step 4.1: Comprehensive Testing**
  - **Login/Logout:** Verify correct initialization on login and complete state cleanup/subscription removal on logout.
  - **App Lifecycle:** Test transitions between foreground/background, ensuring realtime connections are maintained/re-established and refreshes trigger appropriately (or are suppressed by cooldowns).
  - **Manual Refresh:** Confirm manual refresh actions force data updates.
  - **Data Consistency:** Check data accuracy across related views after mutations and realtime updates.
  - **Error Handling:** Test scenarios leading to fetch errors, subscription errors, and verify user feedback (toasts, UI indicators).
  - **Performance:** Monitor for performance regressions, especially initial load time and component responsiveness.

## 3. Affected Files & Components

- `hooks/useAuth.tsx` (Primary orchestrator) - ✅ UPDATED
- `hooks/useMyTime.ts` (Initialization, caching, refresh logic) - ✅ UPDATED
- `store/calendarStore.ts` (Initialization, data fetching, subscriptions) - ✅ UPDATED
- `store/vacationCalendarStore.ts` (Initialization, data fetching, subscriptions)
- `store/notificationStore.ts` (Initialization, subscriptions)
- `store/adminNotificationStore.ts` (Initialization, subscriptions)
- `store/userStore.ts` (Ensure state is managed correctly by `useAuth`)
- `app/(tabs)/mytime.tsx` (Adapt UI to new loading/error states, remove redundant refresh triggers)
- `app/(tabs)/calendar.tsx` (Adapt UI, remove direct data fetching effects)
- `app/(tabs)/notifications.tsx` (remove direct data fetching if present)
- `components/Calendar.tsx` (Refactor effects, optimize rendering)
- Potentially other components consuming these stores/hooks.

## 4. Open Questions & Next Steps

- **Confirm the exact desired behavior for refresh triggers (focus, app state, manual). Should they _always_ force a fetch, or respect cooldowns/cache?**
  - **Resolution:** Focus/AppState primarily check/reconnect realtime. Only `useMyTime` _may_ fetch, respecting a short anti-spam cooldown. Manual refresh forces fetch. Realtime is the main driver for freshness post-init.
- **Finalize the caching strategy for `useMyTime` - duration vs. event-based invalidation.**
  - **Resolution:** Use event-based invalidation (`invalidateCache`). Remove time-based cache duration. Keep short cooldown for focus/appstate anti-spam.
- **Review the initialization dependencies between stores - are there any chains where Store B needs Store A to be initialized first?**
  - **Resolution:** Confirmed: `useAuth` must resolve `member` before initializing other stores/hooks. Centralized trigger handles this.
- **How should background errors during refresh/sync be surfaced to the user without being overly intrusive?**
  - **Resolution:** Use `ThemedToast.tsx` for transient errors. Use subtle UI indicators (e.g., leveraging `useMyTime.syncStatus.error`) for persistent background errors after retries. Initial load errors remain more prominent.
- **Need to review `useVacationCalendarStore`, `useNotificationStore`, `useAdminNotificationStore` initialization flows similarly.**
  - **Resolution:** Reviewed and incorporated into the phased plan (Phase 2).

---

_This plan will be updated as we refine the details._
