# Calendar System Refactor Plan

This document outlines the plan to refactor the calendar and allotment system to support multiple distinct calendars within a division.

## Phase 1: Database Schema Changes

**Goal:** Introduce a dedicated `calendars` table and update related tables (`members`, allotment tables, request tables) to reference this new entity, decoupling allotments from the simple division/zone structure.

**Proposed Schema:**

1. **NEW Table: `calendars`**

   - `id`: `uuid` (Primary Key, default `uuid_generate_v4()`)
   - `division_id`: `integer` (Foreign Key to `divisions.id`, NOT NULL)
   - `name`: `text` (NOT NULL, e.g., "Div 188 Zone 8 Main", "Div 188 Zone 8 Outlying") - _Constraint: Unique per division_id?_
   - `description`: `text` (NULLable)
   - `is_active`: `boolean` (Default `true`, NOT NULL) - To allow disabling calendars without deleting.
   - `created_at`: `timestamptz` (Default `now()`)
   - `updated_at`: `timestamptz` (Default `now()`)

2. **Modify Table: `members`**

   - **REPLACE** `division` (text) with `division_id` (`integer`, Foreign Key to `divisions.id`, NULLable initially for migration, then NOT NULL).
   - **REPLACE** `zone` (text) with `current_zone_id` (`integer`, Foreign Key to `zones.id`, NULLable) - Renamed for clarity.
   - **REPLACE** `home_zone` (text) with `home_zone_id` (`integer`, Foreign Key to `zones.id`, NULLable).
   - **ADD** `calendar_id` (`uuid`, Foreign Key to `calendars.id`, NULLable initially for migration, then NOT NULL).

3. **Modify Table: `pld_sdv_allotments`**

   - **REMOVE** `division` (text).
   - **REMOVE** `zone_id` (integer).
   - **ADD** `calendar_id` (`uuid`, Foreign Key to `calendars.id`, NOT NULL).
   - _Constraint:_ Add UNIQUE constraint on (`calendar_id`, `year`) or (`calendar_id`, `date`) depending on override logic confirmation. Let's assume UNIQUE(`calendar_id`, `date`) for now.

4. **Modify Table: `vacation_allotments`**

   - **REMOVE** `division` (text).
   - **REMOVE** `zone_id` (integer).
   - **ADD** `calendar_id` (`uuid`, Foreign Key to `calendars.id`, NOT NULL).
   - _Constraint:_ Add UNIQUE constraint on (`calendar_id`, `week_start_date`).

5. **Modify Table: `pld_sdv_requests`**

   - **REMOVE** `division` (text).
   - **REMOVE** `zone_id` (integer).
   - **ADD** `calendar_id` (`uuid`, Foreign Key to `calendars.id`, NOT NULL) - Store the calendar the member belonged to _at the time of the request_.

6. **Modify Table: `vacation_requests`** (Assuming similar structure)

   - **REMOVE** `division` (text).
   - **REMOVE** `zone_id` (integer).
   - **ADD** `calendar_id` (`uuid`, Foreign Key to `calendars.id`, NOT NULL) - Store the calendar the member belonged to _at the time of the request_.

7. **Modify Table: `divisions`**

   - **REMOVE** `uses_zone_calendars` (boolean).

8. **Table: `zones`**
   - Keep the table for now, assuming potential other uses. Remove direct FK relationships from allotment/request tables.

**Migration Strategy (High-Level):**

1. **Schema Setup:** Create `calendars` table, add new columns (`division_id`, `current_zone_id`, `home_zone_id`, `calendar_id`) to `members`. Make them nullable initially.
2. **Calendar Creation:**
   - For each `division`:
     - If old `uses_zone_calendars` was `false`, create one default `calendar` record linked to the `division.id`.
     - If old `uses_zone_calendars` was `true`, create a `calendar` record for each `zone` associated with that `division.id`. Name them descriptively (e.g., "Div X - Zone Y").
3. **Member Migration:**
   - Update `members.division_id` based on mapping the old `members.division` (text) to `divisions.id`.
   - Update `members.current_zone_id` based on mapping the old `members.zone` (text) to the corresponding `zones.id`.
   - Update `members.home_zone_id` based on mapping the old `members.home_zone` (text) to the corresponding `zones.id`.
   - Update `members.calendar_id` based on the member's old `division` (text) and `zone` (text), mapping to the newly created `calendar` records. Assign to the division's default calendar if `uses_zone_calendars` was false, or the specific zone's calendar if true. _Further refinement needed here - should calendar assignment be based on `current_zone_id` or something else? For now, assume initial migration maps based on old zone logic._
4. **Schema Cleanup:**
   - Make new columns (`division_id`, `calendar_id`, `current_zone_id`, `home_zone_id`) NOT NULL in `members` where appropriate (consider if `current_zone_id` or `home_zone_id` can _truly_ be null based on your rules).
   - Remove old columns (`division` text, `zone` text, `home_zone` text from `members`).
   - Remove `division` text and `zone_id` from `pld_sdv_allotments`, `vacation_allotments`, `pld_sdv_requests`, `vacation_requests` (since these tables will be repopulated or handled differently).
   - Remove `uses_zone_calendars` from `divisions`.
   - Add/Update constraints (UNIQUE, Foreign Keys) and indexes.

## Phase 2: Frontend & State Management Changes

**Goal:** Update the UI and state management (Zustand stores, relevant hooks) to work with the new `calendars` table and the `members.calendar_id` linkage. Remove reliance on `usesZoneCalendars` flag and direct zone handling for allotments/requests.

**Detailed Steps:**

1. **State Management (`useUserStore`)**

   - Modify state to include `calendar_id: uuid | null`.
   - Update the logic that fetches/sets the member's data (likely within `useAuth` or a related effect) to include fetching and storing their assigned `calendar_id`.

2. **State Management (`useCalendarStore` - User Focus)**

   - **Data Fetching (`loadInitialData`):**
     - Modify to retrieve the user's `calendar_id` from `useUserStore`.
     - Fetch allotments (`fetchAllotments`) and requests (`fetchRequests`) specifically for the user's `calendar_id`.
     - Remove dependencies on `zoneId` and `usesZoneCalendars` logic.
   - **Actions (`userSubmitRequest`, `cancelRequest`):**
     - Modify to use the user's `calendar_id` when interacting with the backend (RPC calls, updates).
   - **State/Logic:**
     - Remove `validateMemberZone` and any logic relying on zone names or IDs for validation/fetching within this store.
     - Update `isDateSelectable` and `getDateAvailability` to use the user's `calendar_id` to look up the correct allotment/request data.
     - Keying for `allotments` and `requests` should probably become `date_calendarId` or just `date` if the store instance only ever holds data for the _current user's_ calendar.
   - **Interaction:** Review where `useMyTime.cancelRequest` interacts with this store's state and update the logic to correctly identify/update requests based on `calendar_id` if necessary.

3. **State Management (`useAdminCalendarManagementStore` - Admin Focus)**

   - **State Structure:**
     - Remove `usesZoneCalendars`.
     - Remove `selectedZoneId`.
     - Add `calendars: Calendar[]` to store the list of calendars for the selected division.
     - Add `selectedCalendarId: uuid | null`.
     - Modify `allotmentCache` keying to be based on `calendar_id` instead of `division` or `zoneId`.
     - Rename `zones` state to `divisionZones` for clarity (it stores zones per division, which is still relevant for member assignment).
   - **Data Fetching:**
     - Update `ensureDivisionSettingsLoaded` / `fetchDivisionSettings`: Remove logic related to `uses_zone_calendars`. Add fetching the list of `calendars` associated with the `division_id`.
     - Update `fetchAllotments`, `fetchPldSdvAllotments`, `fetchVacationAllotments`: Modify to accept `calendarId` instead of `zoneId`. Remove internal logic checking `usesZoneCalendars`.
   - **Actions:**
     - Remove `toggleZoneCalendars`.
     - Update `setSelectedZoneId` to `setSelectedCalendarId`, updating the logic to reset/fetch allotments based on the selected calendar.
     - Update `updateAllotment`, `updateVacationAllotment`: Modify to operate on the `selectedCalendarId`.
     - **ADD:** Need actions for Calendar CRUD (Create, Read, Update - name, description, active status, Delete - perhaps just deactivation via `is_active`). These might live here or in a dedicated `useCalendarAdminActionsStore` or hook (e.g., `useCalendarAdminActions`).
   - **Logic:** Remove all internal checks and branching based on `usesZoneCalendars`.

4. **Hook Updates (`useMyTime`)**

   - **Database Queries:** Review `fetchStats` and `fetchRequests`. While they primarily filter by `member_id`, ensure any joins or logic implicitly relying on the old structure are updated (though likely minimal impact here).
   - **`cancelRequest` Logic:** As mentioned in Step 2, update the part of `cancelRequest` that potentially interacts with `useCalendarStore`'s state to ensure it correctly identifies the request data to update/remove, considering the new `calendar_id` context.
   - **`requestPaidInLieu`:** Ensure it continues to use the correct `member.division_id` (fetched via `useUserStore`) if needed for the request insertion.
   - **Realtime Subscriptions:** Verify the filters (`member_id`) remain sufficient. They likely are.

5. **Admin UI Components (`/components/admin/division/*`)**

   - **`CalendarManager.tsx`:**
     - Remove the "Use Zone Calendars" switch and related state/logic.
     - Replace `ZoneCalendarAdmin` component usage with a new `CalendarSelector` component.
     - Fetch and pass the list of `calendars` for the current division to `CalendarSelector`.
     - Pass `selectedCalendarId` (from the store) to `CalendarAllotments`.
   - **`CalendarAllotments.tsx`:**
     - Accept `calendarId: uuid | null` prop instead of `zoneId`.
     - Remove `isZoneSpecific` prop.
     - Fetch/display data based on the passed `calendarId`.
     - Display the selected calendar's name.
     - Update `handleUpdateAllotment` / `handleUpdateConfirmed` to pass `calendarId`.
   - **`ZoneCalendarAdmin.tsx`:**
     - Remove this component.
   - **NEW `CalendarSelector.tsx`:**
     - Accept `calendars: Calendar[]`, `selectedCalendarId: uuid | null`, `onSelectCalendar: (id: uuid) => void` props.
     - Display a list/dropdown/buttons for the available calendars.
     - Call `onSelectCalendar` when a calendar is chosen.
   - **NEW `CalendarCrudAdmin.tsx` (or similar section):**
     - UI for admins (permission checks needed) to view, create, edit (name, description), and activate/deactivate calendars within the selected division.
   - **`MemberManagement.tsx`:**
     - Add a dropdown/selector to view/edit the `member.calendar_id`.
     - Populate the dropdown with the `calendars` available for the member's `division_id`.

6. **User UI Components (`/app/(tabs)/calendar.tsx`, `/app/(tabs)/mytime.tsx`, `/components/Calendar.tsx`)**
   - **`calendar.tsx` (Screen):**
     - Remove all effects and state related to `zoneId` calculation (`calculatedZoneId`, `adminZones`, `isZoneIdCalculationDone`, etc.).
     - Get the user's `calendar_id` directly from `useUserStore`.
     - Pass the user's `calendar_id` to the `Calendar` component and `RequestDialog`.
     - Simplify `loadDataSafely` to depend only on `user.id` and `member.calendar_id` being available.
   - **`Calendar.tsx` (Component):**
     - Accept `calendarId: uuid` prop (should always be present for a logged-in user).
     - Remove `zoneId` and `isZoneSpecific` props.
     - Fetch/display `markedDates` and `availability` based _only_ on the provided `calendarId` using updated store functions.
   - **`RequestDialog` (in `calendar.tsx`):**
     - Remove `zoneId` and `isZoneSpecific` props.
     - Logic operates based on the implicit `calendarId` of the user viewing the screen.
   - **`mytime.tsx` (Screen - Assumption):**
     - Review how requests are displayed. Since `useMyTime`'s `requests` state combines regular and six-month requests, ensure the UI handles the slightly different structures (or continues to display only common fields).
     - The core stats display from `useMyTime` should remain largely unchanged.
