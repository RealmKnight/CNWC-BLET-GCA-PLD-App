Okay, the table structures confirm the plan. vacation_allotments is indeed weekly (week_start_date), and pld_sdv_allotments is daily (date) with the potential for a yearly default (using the year column or a convention like YYYY-01-01).
Here's the refined plan incorporating your decisions:
Revised Refactoring Plan:
State Management (useAdminCalendarManagementStore):
State:
Add membersByDivision: Record<string, Member[]> to store members fetched for the assignment UI. Initialize as {}.
Replace existing allotment state with more granular structures:
pldSdvYearlyDefaults: Record<string, Record<number, YearlyAllotment>> = {} (Keyed: calendarId -> year)
pldSdvDailyOverrides: Record<string, Record<string, PldSdvAllotment>> = {} (Keyed: calendarId -> date)
vacationYearlyDefaults: Record<string, Record<number, VacationAllotment>> = {} (Keyed: calendarId -> year)
vacationWeeklyOverrides: Record<string, Record<string, VacationAllotment>> = {} (Keyed: calendarId -> week_start_date)
Keep selectedType: 'pld_sdv' | 'vacation' = 'pld_sdv'.
Add state for date range editing: isEditingRange: boolean = false, rangeStartDate: string | null = null, rangeEndDate: string | null = null, rangeAllotmentValue: string = "".
Actions:
fetchMembersForDivision(divisionId: string): Fetch members for the selected division (needs implementation, likely RPC call get_members_by_division). Store result in membersByDivision.
fetchAllotments(calendarId: string, year: number): Modify to fetch all relevant PLD/SDV (yearly default + daily overrides) and Vacation (yearly default + weekly overrides) allotments for the given calendar and year range (e.g., fetch for year and year + 1). Populate the new state structures.
updatePldSdvYearlyDefault(calendarId: string, year: number, value: number, userId: string): Upsert the yearly default record.
updatePldSdvDailyOverride(calendarId: string, date: string, value: number, userId: string): Upsert a specific daily record.
updatePldSdvRangeOverride(calendarId: string, startDate: string, endDate: string, value: number, userId: string): Call an RPC function (bulk_update_pld_sdv_range) to handle this efficiently.
updateVacationYearlyDefault(calendarId: string, year: number, value: number, userId: string): Upsert the yearly default record.
updateVacationWeeklyOverride(calendarId: string, weekStartDate: string, value: number, userId: string): Upsert a specific weekly record.
Calendar CRUD actions (createCalendar, updateCalendar, toggleCalendarActive): Ensure they use the selected divisionId and refresh state appropriately.
assignMembersToCalendar(calendarId: string, memberIds: string[]): Update members table (UPDATE members SET calendar_id = $1 WHERE id = ANY($2)). Refresh relevant state.
Actions to manage date range editing state (setRangeStartDate, setRangeEndDate, etc.).
Component: CalendarManager.tsx:
On division selection, call fetchMembersForDivision.
Render CalendarCrudAdmin below the division/calendar selection header.
Render a new CalendarMemberAssignment component below CalendarCrudAdmin.
Pass selectedDivision, selectedCalendarId, and membersByDivision[selectedDivision] down to child components as needed.
Implement the prompt to create a calendar if calendars[selectedDivision] is empty after load.
Component: CalendarAllotments.tsx:
Receive calendarId. If null, display a "Select a calendar" message.
Add a top-level selector (e.g., SegmentedControl/Buttons) for "Single Day (PLD/SDV)" vs. "Vacation".
Conditionally render the UI based on selectedType:
PLD/SDV View:
Input for yearly default (current/next year).
Section for "Daily Overrides" with a date picker + input -> updatePldSdvDailyOverride.
Section for "Range Overrides" with start/end date pickers + input -> updatePldSdvRangeOverride.
Vacation View:
Input for yearly default (current/next year).
List/Breakdown of weeks for the year.
UI to select a week (e.g., clicking a row) + input to override -> updateVacationWeeklyOverride.
Fetch data using the refactored fetchAllotments based on the received calendarId.
Component: CalendarCrudAdmin.tsx:
Receive selectedDivisionId prop. Use it when calling createCalendar.
Adapt styling/layout to be embedded within CalendarManager.
NEW Component: CalendarMemberAssignment.tsx:
Receive calendarId, divisionId, membersInDivision: Member[], calendarsInDivision: Calendar[].
Filter membersInDivision into two lists: "Assigned to this Calendar" (m.calendar_id === calendarId) and "Unassigned / Other Calendars" (m.calendar_id !== calendarId).
Use multi-select lists or similar UI to allow selecting members from the "Unassigned" list and clicking "Assign".
Allow selecting members from the "Assigned" list and clicking "Remove" (or potentially "Move to..." with another calendar selector).
Call the corresponding store actions (assignMembersToCalendar, etc.).
Backend (RPC/RLS):
Need get_members_by_division(division_id UUID) RPC.
Need bulk_update_pld_sdv_range(p_calendar_id UUID, p_start_date DATE, p_end_date DATE, p_max_allotment INT, p_user_id UUID) RPC.
Review/create RLS policies on members, calendars, pld_sdv_allotments, vacation_allotments to enforce permissions based on division_id, calendar_id, and user role (application_admin, union_admin, division_admin). Admins should only be able to modify calendars/allotments/members within divisions they manage.
This looks like a solid plan. We'll start by refactoring the useAdminCalendarManagementStore to establish the new state structure and actions.
Let's begin modifying store/adminCalendarManagementStore.ts. I'll tackle the state definition first.
