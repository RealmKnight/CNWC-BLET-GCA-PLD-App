# Google Calendar iCal Import Implementation Plan

This document outlines the plan for implementing Google Calendar iCal imports for PLD/SDV requests.

## Phase 1: Analysis & Preparation

- [x] **Database Schema Analysis**

  - [x] Analyze `pld_sdv_requests` table structure
  - [x] Analyze `members` table structure (noticed PIN is primary key, not UUID)
  - [x] Analyze `six_month_requests` table structure
  - [x] Document relationships between tables (including new linkage via `pin_number`).

- [x] **Database Schema Updates**

  - [x] Modify `pld_sdv_requests` table to handle unregistered members:

    ```sql
    ALTER TABLE pld_sdv_requests
    ADD COLUMN pin_number BIGINT,
    ADD COLUMN import_source VARCHAR DEFAULT NULL,
    ADD COLUMN imported_at TIMESTAMPTZ DEFAULT NULL,
    ALTER COLUMN member_id DROP NOT NULL;

    -- Add constraint to ensure either member_id OR pin_number is provided
    ALTER TABLE pld_sdv_requests
    ADD CONSTRAINT member_id_or_pin_required
    CHECK (member_id IS NOT NULL OR pin_number IS NOT NULL);
    ```

  - [x] Create function to automatically associate requests when members register:

    ```sql
    CREATE OR REPLACE FUNCTION associate_member_requests()
    RETURNS TRIGGER AS $$
    BEGIN
      -- When a member registers or is updated with an ID, associate their requests
      UPDATE pld_sdv_requests
      SET member_id = NEW.id
      WHERE pin_number = NEW.pin_number AND member_id IS NULL;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER associate_member_requests_trigger
    AFTER INSERT OR UPDATE OF id ON members
    FOR EACH ROW
    WHEN (NEW.id IS NOT NULL)
    EXECUTE FUNCTION associate_member_requests();
    ```

- [x] **iCal Format Analysis**
  - [x] Create test cases with various iCal formats, including:
    - Standard entries: `SUMMARY:{First Name} {Last Name} {Leave Type}`.
    - "Denied" (to be waitlisted) entries: `SUMMARY:{First Name} {Last Name} {Leave Type} denied req {MM/DD}`.
  - [x] Define parsing rules for `SUMMARY` field to extract:
    - First Name, Last Name.
    - Leave Type ("PLD" or "SDV").
    - The literal string "denied req" (if present).
    - The `MM/DD` "original request submission date" (if "denied req" is present).
  - [x] Define rules for parsing `DTSTART` (for `pld_sdv_requests.request_date`).
  - [x] Define rules for parsing iCal `CREATED` field (to determine the year for the "original request submission date" for waitlisted items). This is appropriate because the iCal entries themselves are created in the past, making the year valid for historical date construction.
  - [x] Add validation rule: Only process iCal VEVENTs where the `DTSTART` date falls within the target import year (January 1st - December 31st). The target year is determined by the admin's selected calendar/context.

## Phase 2: Core Infrastructure

- [x] **iCal Parser Module (`utils/iCalParser.ts`)**

  - [x] Implement date extraction from `DTSTART` (this becomes `pld_sdv_requests.request_date`).
  - [x] Filter incoming iCal VEVENTs: Only proceed with parsing and processing events where the `DTSTART` date's year matches the target import year. Events outside this year should be ignored or logged as skipped due to year mismatch.
  - [x] Implement robust extraction from `SUMMARY` (member name, leave type, "denied req" flag, "original request submission MM/DD").
  - [x] Implement logic to construct a full timestamp for the "original request submission date" for waitlisted items by combining `MM/DD` from `SUMMARY` with the year from the iCal event's `CREATED` field. This timestamp will be used to populate `pld_sdv_requests.requested_at`.
  - [x] Handle edge cases (malformed entries, missing fields).

- [x] **Member Mapping Service (`utils/memberLookup.ts`)**

  - [x] Create fuzzy name matching function (iCal name vs. `first_name`, `last_name` in `members` table) to suggest a `pin_number`.
  - [x] Fallback to exact name match if fuzzy match fails.
  - [x] Interface for admin to manually search and select the correct member by PIN or name during the review phase if matching is ambiguous or fails.
  - [x] Log unmatched names for admin review.

- [x] **Import Preview Generation Service**

  - [x] Create function to take _year-validated_ parsed iCal events and generate a list of _proposed_ `pld_sdv_requests`.
  - [x] For each proposed request, include:
    - [x] Matched member details (`pin_number`, and `member_id` if found/resolved) or indication of unmatch.
    - [x] Proposed `request_date` (from iCal `DTSTART`).
    - [x] Proposed `leave_type` ("PLD" or "SDV").
    - [x] Proposed `status` ("approved", or "waitlisted" if "denied req" in `SUMMARY`).
    - [x] The fully constructed historical timestamp for `requested_at` (for waitlisted items, derived from iCal `SUMMARY`'s `MM/DD` and iCal `CREATED`'s year; for "approved" items, this can be the iCal `CREATED` timestamp or `now()`).
    - [x] Target `calendar_id` (determined by admin selection/default).
    - [x] Flag if it's a potential duplicate against an _existing_ request in `pld_sdv_requests` (same person (PIN/ID) + `request_date`).
  - [x] This service _does not_ insert into the database directly but prepares data for the admin review UI.

## Phase 3: Database Integration

- [x] **Database API Layer**

  - [x] Create functions to:
    - [x] Insert a _batch_ of admin-confirmed PLD/SDV requests.
      - [x] This function will populate `pin_number` if `member_id` is not yet available.
      - [x] It will set `pld_sdv_requests.status` to "approved" or "waitlisted" as determined.
      - [x] It will set `pld_sdv_requests.requested_at` to the historical submission timestamp for waitlisted items, or an appropriate timestamp for approved items.

- [x] **Store Updates**
  - [x] Update `calendarStore.ts` and `timeStore.ts` to handle:
    - [x] Modify queries to work with either `member_id` or `pin_number` for fetching/displaying requests.
    - [x] Update request display logic to show member name correctly (potentially fetching via `pin_number` if `member_id` is null).
    - [x] Ensure allotments and calculations work with requests that might only have `pin_number`.
    - [x] Ensure `requested_at` (now potentially historical for waitlisted items) is handled correctly for display or any client-side sorting if applicable.

## Phase 4: User Interface

- [x] **Restructuring the PLD/SDV Management Section**

  - [x] The existing `PldSdvManager` component (accessible via `CalendarManager.tsx` when `currentView` is set to `"managePldSdv"`) will be reorganized with an internal tabbed interface.
  - [x] **Create Tabbed Interface in `PldSdvManager`:**
    - Implement a tab navigation system with three tabs at the same level:
      1. **"View PLD/SDV"** - Contains the existing functionality that currently displays/allows auditing of requests already in the system.
      2. **"Import PLD/SDV"** - Will render the new `ImportPldSdvComponent` for iCal imports.
      3. **"Enter PLD/SDV"** - Will render the new `ManualPldSdvRequestEntry` component for manual entries.
    - Use consistent styling for the tab navigation, matching the application's design patterns.
  - [x] **Move Existing Functionality:**
    - Wrap the current content/functionality of `PldSdvManager` in a component that will be rendered under the "View PLD/SDV" tab.
    - Ensure all existing features and behaviors are preserved.
  - [x] Ensure proper context (`selectedCalendarId`, `selectedDivision`) is passed to all tabs from `CalendarManager`.
  - [x] Set "View PLD/SDV" as the default active tab when first navigating to the PLD/SDV Management section.

- [x] **New Component: `ImportPldSdvComponent.tsx` (e.g., `components/admin/division/ImportPldSdv.tsx`)**

  - [x] Create a component for handling the import of PLD/SDV requests from iCal files.
  - [x] This component will be responsible for:
    - [x] Displaying file upload UI for `.ics` files (drag-and-drop support).
    - [x] Allowing admin to confirm the target import year (implicitly from the selected calendar context).
    - [x] Triggering the "Import Preview Generation Service".
    - [x] Displaying the "Import Review Interface" with data from the preview service.
    - [x] Handling admin interactions for member matching and duplicate resolution.
    - [x] Triggering the final import to the database via the Database API Layer.
  - [x] Styling should be consistent with the application, using `ThemedView`, `ThemedText`, `Ionicons`, `Colors` from `@/constants/Colors`, and responsive patterns.

- [x] **Import Review Interface (`ImportPreviewComponent.tsx`)**

  - [x] Created a separate component (`ImportPreviewComponent.tsx`) displayed after iCal file is processed.
  - [x] Implemented a complete UI showing the list of proposed requests with:
    - [x] Parsed data (name from iCal, date, leave type) with clear formatting.
    - [x] Color-coded matching status indicators:
      - [x] Green checkmark for successfully matched members.
      - [x] Yellow warning for multiple potential matches with selection UI.
      - [x] Red error for unmatched names with search functionality.
    - [x] Visual indicators for potential duplicates (yellow border).
    - [x] Display of proposed status and timestamps.
  - [x] Added member search functionality for unmatched or multiple match scenarios.
  - [x] Implemented checkbox system to select/deselect requests for import.
  - [x] Added "Select All" / "Deselect All" controls for batch operations.
  - [x] Implemented summary section showing counts of matches, duplicates, etc.
  - [x] Created prominent "Import X Requests" button with proper validation.
  - [x] Added success/error toast notifications after import completes.

- [x] **New Component: `ManualPldSdvRequestEntry.tsx` (e.g., `components/admin/division/ManualPldSdvRequestEntry.tsx`)**

  - [x] Create a versatile component for manually entering both regular and Paid In Lieu PLD/SDV requests, especially for historical records.
  - [x] This component will be responsible for:
    - Displaying a searchable list of members in the division (both registered users and PIN-only members who haven't registered yet).
    - For selected members, showing their historical PLD/SDV allocation and usage.
    - Providing an interface to directly create new PLD/SDV requests for past dates with a toggle/checkbox option for "Paid In Lieu".
    - Supporting entering requests for members who don't yet have an account, using their `pin_number` rather than `member_id` (consistent with the import functionality).
    - Showing a summary of how these new records affect the member's current available day counts.
    - Including validation to prevent creating records for future dates or dates with existing requests.
  - [x] User flow:
    - Admin selects a member from the list or search results (including unregistered members who only have a PIN).
    - Admin views that member's historical day usage and current balances.
    - Admin can enter specific past dates as either regular PLD/SDV requests or Paid In Lieu requests (using a toggle/checkbox).
    - These entries create standard records in the `pld_sdv_requests` table with appropriate `paid_in_lieu` value, `status='approved'`, and either `member_id` or `pin_number` for identification.
    - The system updates calculations to reflect these changes in the member's available days (or will do so when they register).
  - [x] Styling consistent with the application's design patterns and responsive considerations.

- [x] **Integration of `ImportPldSdvComponent.tsx`**

  - [x] This component will be rendered when the "Import PLD/SDV" tab is selected in the `PldSdvManager` component.
  - [x] Ensure proper integration with the tab navigation system, including state management for active tab.
  - [x] Pass necessary context from `CalendarManager` through `PldSdvManager` to `ImportPldSdvComponent`.

- [x] **Integration of `ManualPldSdvRequestEntry.tsx`**

  - [x] This component will be rendered when the "Enter PLD/SDV" tab is selected in the `PldSdvManager` component.
  - [x] Ensure proper integration with the tab navigation system.
  - [x] Pass necessary context from `CalendarManager` through `PldSdvManager` to `ManualPldSdvRequestEntry`.

## Phase 5: Testing & Deployment

- [ ] **Unit Tests**

  - [ ] Test iCal parsing (standard, "denied req" formats, date derivations).
  - [ ] Test member name matching and manual admin selection.
  - [ ] Test duplicate detection against existing DB entries.
  - [ ] Test `associate_member_requests` trigger.

- [ ] **Integration Tests**

  - [ ] End-to-end import workflow: Upload -> Preview -> Admin Review (with corrections/selections for unmatched names, decisions on duplicates) -> Confirm -> Verify DB inserts with correct statuses and `requested_at` times.
  - [ ] Test with registered members (UUID known) and PIN-only members.
  - [ ] Test the Manual PLD/SDV Request Entry functionality:
    - Creating both regular and Paid In Lieu records for past dates.
    - Verifying these records properly impact available day calculations.
    - Testing the UI for member selection, record creation, and filtering.
  - [ ] All testing will be conducted manually to ensure proper functionality.

- [ ] **Production Migration**
  - [ ] Create migration script for `pld_sdv_requests` table modifications and `associate_member_requests` trigger.
  - [ ] Add rollback procedure.
  - [ ] Document deployment process.

## Phase 6: Post-Implementation Tasks

- [ ] **Documentation**

  - [ ] Create user guide for calendar imports (admin focus).
  - [ ] Document technical implementation details (parser logic, date handling).
  - [ ] Add troubleshooting section.

- [ ] **Monitoring**
  - [ ] Add logging for import operations (successes, failures, admin choices).
  - [ ] Create admin dashboard/view for import history.
  - [ ] Add reporting for unassociated requests (still only `pin_number` after a period).

## Notes on Implementation Challenges

1. **Member Registration Status**:

   - System designed to handle requests for members initially identified by `pin_number`, with `associate_member_requests` trigger linking them to `member_id` upon registration.

2. **Member Lookup Complexity**:

   - Fuzzy matching for names, with admin override for accuracy.

3. **Calendar Format Variations**:

   - Parser designed for specific `SUMMARY` patterns ("PLD"/"SDV" and "denied req MM/DD"). Robustness for minor variations may need monitoring.
   - This import functionality is specifically for bringing in data from the old system; the app will handle all future requests directly.

4. **Database Structure Considerations**:

   - `pld_sdv_requests` modified to decouple from immediate `member_id` (UUID) requirement.
   - `requested_at` field re-purposed for waitlisted items to store historical submission time.

5. **Duplicate Detection**:

   - Duplicates (Person + Date) against _existing_ DB entries are flagged; admin defers to existing DB data.

6. **Request Status Handling**:

   - Imported iCal entries mapped to "approved" or "waitlisted" status.
   - `requested_at` for waitlisted items uses historical iCal `CREATED` year and `SUMMARY`'s MM/DD.

## Clarification Questions (Answered/Integrated)

1. When members register and get an ID, do they keep the same PIN number? (Yes, PIN is PK)
2. How are denied requests marked in the calendar export? (Identified: `SUMMARY: ... denied req MM/DD`)
3. Should imported requests with only PIN numbers be treated differently in the UI? (Handled by store updates for display)
4. Are there any special cases in the calendar export format? (Primary formats identified)
5. Do we need to handle different calendars? (Yes, admin selects target calendar)
6. Leave Types & Statuses (Database vs. iCal)? (DB types "PLD"/"SDV"; import status "approved" or "waitlisted")
7. Duplicate Request Handling? (Person + Date; flag in review; defer to existing DB data)
8. Unmatched Member Names? (Admin can manually select member or skip import of entry)
9. Storing "Original Request Submission Date"? (Overwrite `pld_sdv_requests.requested_at`)
10. Determining Year for "Original Request Submission Date"? (From iCal `CREATED` field)
