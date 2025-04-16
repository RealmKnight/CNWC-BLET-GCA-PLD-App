# Plan for "Enter Requests" Feature

## Goal

Add a new section to the Admin Calendar area (`CalendarManager.tsx`) allowing administrators to submit `vacation_requests` on behalf of members for a selected calendar.

## 1. Refactor `CalendarManager.tsx` for Tab Navigation

- **Task:** Implement primary tab navigation below the main header section, mimicking the visual style and interaction pattern of the main action buttons in `MemberManagement.tsx`.
- **Implementation:**
  - Use a `useState` hook within `CalendarManager` to manage the active tab state (e.g., `useState<'calendarManagement' | 'enterRequests'>('calendarManagement')`).
- Use a `useState` hook within `CalendarManager` to manage the active view state (e.g., `const [currentView, setCurrentView] = useState<'calendarManagement' | 'enterRequests'>('calendarManagement')`).
  - Render `TouchableOpacity` components for the "Calendar Management" and "Enter Requests" tabs.
  - Apply conditional styling to the `TouchableOpacity` components (similar to `styles.tab` and `styles.activeTab` in `MemberManagement.tsx`) based on the active tab state.
  - Create styled `TouchableOpacity` (or `Pressable` for web) components for "Calendar Management" and "Enter Requests".
  - These buttons should resemble the main action buttons in `MemberManagement`: horizontally arranged in a `ThemedView`, potentially using similar icons and styling (adapting `styles.actionButton`, `styles.activeButton`, etc.). Consider adapting for mobile width if necessary (like icon-only buttons).
  - Update the `currentView` state when a button is pressed.
  - Conditionally render the main content area based on the active tab state:
- Conditionally render the main content area below these buttons based on the `currentView` state:
  - If 'calendarManagement', render the existing management components (`CalendarCrudAdmin`, `CalendarSelector`, `CalendarAllotments`, etc.).
- If `'calendarManagement'`, render the existing management components (`CalendarCrudAdmin`, `CalendarSelector`, `CalendarAllotments`).
  - If 'enterRequests', render the new `<RequestEntry />` component.
- If `'enterRequests'`, render the new `<RequestEntry />` component.
- **Header & Context:** The existing header (Title, `DivisionSelector`) remains above the tabs. Pass `selectedDivision` and `selectedCalendarId` as props down to the conditionally rendered content area (specifically needed by `<RequestEntry />`).
- **Header & Context:** The existing header (Title, `DivisionSelector`) remains above these action/tab buttons. Pass necessary props like `selectedDivision` and `selectedCalendarId` down to the conditionally rendered content component (`<RequestEntry />` will need them).

## 2. Create New Component: `RequestEntry.tsx`

- **Task:** Create a new functional component responsible for the "Enter Requests" tab UI and logic.
- **Props:**
  - `selectedDivision: string`
  - `selectedCalendarId: string | null`
- **Responsibilities:** Display the request entry form, manage local form state, trigger data fetching from existing stores, handle submission logic.

## 3. Integrate State Management with Existing Stores

- **Goal:** Avoid creating a new store. Leverage existing stores and local component state.
- **`useAdminMemberManagementStore` Modifications:**
  - **New State:**
    - `membersByCalendar: Record<string, MemberSummary[]>` (Map: `calendarId` -> Array of `{ id, pin_number, first_name, last_name }`)
    - `isLoadingMembersByCalendar: boolean`
  - **New Action:**
    - `fetchMembersByCalendarId(calendarId: string)`: Fetches members assigned to the `calendarId`, updates state.
- **`useAdminCalendarManagementStore` Modifications:**
  - **New State:**
    - `vacationAllotmentWeeks: Record<string, Record<number, { week_start_date: string }[]>>` (Map: `calendarId` -> Map: `year` -> Array of unique week start dates).
    - `isLoadingVacationAllotmentWeeks: boolean`
  - **New Action:**
    - `fetchVacationAllotmentWeeks(calendarId: string, year: number)`: Fetches unique `week_start_date` from `vacation_allotments` for the calendar/year, updates state. (Start with current year).
- **Local State in `RequestEntry.tsx` (using `useState`):**
  - `selectedMemberPin: string | null`
  - `selectedWeekStartDate: string | null`
  - `selectedYear: number` (Initialize to current year)
  - `submissionState: 'idle' | 'submitting' | 'success' | 'error'`
  - `formError: string | null`

## 4. Implement `RequestEntry.tsx` UI

- **Task:** Build the form interface using themed components (`ThemedView`, `ThemedText`, `Picker`/`<select>`, `Button`).
- **Data Fetching:**
  - Use `useEffect` dependent on `selectedCalendarId` prop.
  - When `selectedCalendarId` is valid, call `fetchMembersByCalendarId` and `fetchVacationAllotmentWeeks`.
  - Use `useEffect` dependent on `selectedCalendarId` and `selectedYear` props/state.
  - When `selectedCalendarId` is valid, call `fetchMembersByCalendarId(selectedCalendarId)` and `fetchVacationAllotmentWeeks(selectedCalendarId, selectedYear)`.
  - Clear local form state when `selectedCalendarId` becomes null.
- **Elements:**
  - **Year Selector:** Dropdown/Picker to select the year. Controls the `selectedYear` state. Triggers refetching of allotment weeks.
  - **Member Selector:** Dropdown populated from `store.membersByCalendar[selectedCalendarId]`. Controlled by local `selectedMemberPin` state. Displays "LastName, FirstName (PIN)". Disabled when loading or no calendar selected.
  - **Start Date (Week) Selector:** Dropdown populated from `store.vacationAllotmentWeeks[selectedCalendarId][selectedYear]`. Controlled by local `selectedWeekStartDate` state. Disabled when loading or no calendar/year selected.
  - **Submit Button:** Triggers submission handler. Disabled based on local form validity and `submissionState`.
  - **Loading Indicators:** Use `ActivityIndicator` based on `isLoadingMembersByCalendar` and `isLoadingVacationAllotmentWeeks`.
  - **Feedback:** Display errors/success messages based on local `formError` and `submissionState`. Use `Toast` for success.

## 5. Submission Logic (within `RequestEntry.tsx`)

- **Task:** Implement the core request submission logic in an `async` handler function within `RequestEntry`.
- **Steps:**
  - Read `selectedCalendarId` (prop), `selectedMemberPin`, `selectedWeekStartDate`, `selectedYear` (local state).
  - Get admin user ID (`useUserStore`).
  - Set local `submissionState` to `'submitting'`.
  - Calculate `end_date` based on `selectedWeekStartDate` (**Clarification Needed: Week End Logic**).
  - Set `status` to `'approved'` (**Clarification Needed: Default Status**).
  - Construct payload for `vacation_requests` table (pin_number, start_date, end_date, status, calendar_id, requested_at, responded_at, responded_by, actioned_at, actioned_by).
  - Validate payload using Zod.
  - Call `supabase.from("vacation_requests").insert(...)`.
  - Update local `submissionState` and `formError` based on outcome.
  - On success, show Toast and potentially reset local form state.

## 6. Connect Components

- **Task:** Integrate the new pieces.
- **Steps:**
  - In `CalendarManager.tsx`: Render the tab navigation. Render `<RequestEntry selectedDivision={...} selectedCalendarId={...} />` in the "Enter Requests" tab view when active.
  - In `RequestEntry.tsx`: Use hooks for `useAdminMemberManagementStore`, `useAdminCalendarManagementStore`, `useUserStore`, and local `useState`.

## Clarifications Needed

- **End Date Logic:** How exactly is `end_date` determined from the `week_start_date` selection (e.g., fixed duration: +6 days? specific day of the week)?
- **Default Status:** Confirm if admin-submitted requests should default to `'approved'`.
- **Year Selection:** Should the year for allotments/requests be fixed (e.g., current year) or selectable by the admin? (Assuming current year for now).
- _Resolved:_ End Date = `week_start_date` + 6 days.
- _Resolved:_ Default Status = `'approved'`.
- _Resolved:_ Year must be selectable by the admin.

## Database Schema Notes

- `members` table has `calendar_id`.
- `vacation_requests` table uses `pin_number` (FK to `members`) and requires `start_date`, `end_date`, `status`. Has `calendar_id`.
- `vacation_allotments` table has `calendar_id`, `week_start_date`, `vac_year`.

## Codebase Notes

- Reuse `DivisionSelector`, `CalendarSelector`.
- **Modify** `useAdminMemberManagementStore` to add fetching members by calendar ID.
- **Modify** `useAdminCalendarManagementStore` to add fetching unique vacation allotment weeks.
- Use local `useState` in `RequestEntry.tsx` for form state.
