# Rosters Feature Implementation Plan

This document outlines the plan for developing the Rosters feature, integrating it into the Union admin dashboard (`MemberManager.tsx`) and the user-facing `app/(rosters)/index.tsx`.

## Table of Contents

1. [Phases and Steps](#phases-and-steps)
   - [Phase 1: Understanding and Adapting Existing Logic](#phase-1-understanding-and-adapting-existing-logic)
   - [Phase 2: Database Design and Setup](#phase-2-database-design-and-setup)
   - [Phase 3: Admin Interface (MemberManager - Rosters Tab)](#phase-3-admin-interface-membermanager---rosters-tab)
   - [Phase 4: User-Facing Interface (app/(rosters)/index.tsx)](<#phase-4-user-facing-interface-app/(rosters)/index.tsx>)
   - [Phase 5: PDF Generation](#phase-5-pdf-generation)
   - [Phase 6: Testing and Refinement](#phase-6-testing-and-refinement)
2. [File Locations and Paths](#file-locations-and-paths)
3. [Database Migrations](#database-migrations)
4. [Clarifying Questions](#clarifying-questions)
5. [Reference Material](#reference-material)

---

## 1. Phases and Steps

### Phase 1: Understanding and Adapting Existing Logic

- **Step 1.1:** ✅ Analyze utility files from the reference Next.js application:

  - `roster-calculations.ts`:
    - ✅ Contains functions (`combineWCArrays`, `combineDMIRArrays`, `combineDWPArrays`, `combineEJEArrays`) to merge pre-categorized arrays of `Member` objects.
    - ✅ Member categories used: `wcmembers`, `dmirmembers`, `dwpmembers`, `ejemembers`, `sys1members`, `sys2members`.
    - ✅ Logic involves specific interleaving patterns (e.g., "6 WC then 1 DWP") and appends auxiliary groups (SYS1, SYS2).
    - ✅ **Note:** These functions mutate the input arrays by using `shift()`.
    - ✅ Depends on a `Member` type (likely from a `types/member.ts` in the old project).
  - `roster-utils.ts` (Content to be provided/analyzed)
    - ✅ Contains utility functions to prepare member lists for roster generation.
    - ✅ Key function: `getRosterMembers(members: Member[], type: string)`:
      - ✅ Orchestrates roster creation.
      - ✅ Handles "osl-" prefixed types by first filtering members via `filterMembersForOSL`.
      - ✅ `filterMembersForOSL`: Removes members with non-null `misc_notes`.
      - ✅ Categorizes members into `wcmembers`, `dmirmembers`, `dwpmembers`, `sys1members`, `ejemembers`, `sys2members` based on `member.system_sen_type`.
      - ✅ Sorts each category using `sortByPriorVacSys`.
      - ✅ `sortByPriorVacSys`: Sorts by `member.prior_vac_sys` (handles nulls, numbers, strings).
      - ✅ Delegates to `combineXArrays` from `roster-calculations.ts` based on `type`.
    - ✅ Depends on `Member` type and `roster-calculations.ts`.
  - `pdf-utils.tsx` (GitHub: [union_roster_app/src/lib](https://github.com/RealmKnight/union_roster_app/tree/master/src/lib)) (Content to be provided/analyzed)
    - ✅ Uses `pdfmake` library for client-side PDF generation.
    - ✅ `generatePDF({ members, selectedFields, rosterType })` function:
      - ✅ Throws error if not in a browser environment.
      - ✅ Dynamically builds columns based on `selectedFields`. Default: Rank, Name, PIN, Prior Rights.
      - ✅ Optional fields include `engineer_date`, `date_of_birth`, `zone_name`, `home_zone_name`, `division_name`, `prior_vac_sys`.
      - ✅ Formats member data for display (e.g., combines names, formats dates with `toLocaleDateString` from a YYYY-MM-DD source).
      - ✅ Defines document structure, styles (A4, portrait, specific fonts/colors for headers).
      - ✅ Returns a `Promise<Blob>`.
    - ✅ Depends on `Member` type (fields: `first_name`, `last_name`, `pin_number`, `system_sen_type`, `engineer_date`, `date_of_birth`, `zone_name`, `home_zone_name`, `division_name`, `prior_vac_sys`).

- **Step 1.1.1:** ✅ Illustrative Core Calculation Logic (from reference `roster-calculations.ts`)

  ```pseudocode
  // Common Member Categories: wc, dmir, dwp, sys1, eje, sys2

  function combineWCArrays_pseudocode(wc, dmir, dwp, sys1, eje, sys2):
    combined = []
    combined.push_all(wc) // Add all WC members first

    pattern_temp = []
    while dmir has items OR dwp has items:
      // Loop 1 (repeats 6 times if data available)
      for i from 0 to 5:
        take up to 2 from dmir, add to pattern_temp
        take 1 from dwp (if available), add to pattern_temp
      // Loop 2 (repeats 4 times if data available)
      for i from 0 to 3:
        take 1 from dmir (if available), add to pattern_temp
        take 1 from dwp (if available), add to pattern_temp

    combined.push_all(pattern_temp)
    combined.push_all(sys1)
    combined.push_all(eje)
    combined.push_all(sys2)
    return combined

  function combineDMIRArrays_pseudocode(wc, dmir, dwp, sys1, eje, sys2):
    combined = []
    combined.push_all(dmir) // Add all DMIR members first

    pattern_temp = []
    while wc has items OR dwp has items:
      // Loop 1 (repeats 9 times if data available): 6 WC, 1 DWP
      for i from 0 to 8:
        take up to 6 from wc, add to pattern_temp
        take 1 from dwp (if available), add to pattern_temp

      // Single block (if data available): 5 WC, 1 DWP
      if wc has items OR dwp has items:
        take up to 5 from wc, add to pattern_temp
        take 1 from dwp (if available), add to pattern_temp

    combined.push_all(pattern_temp)
    combined.push_all(sys1)
    combined.push_all(eje)
    combined.push_all(sys2)
    return combined

  function combineDWPArrays_pseudocode(wc, dmir, dwp, sys1, eje, sys2):
    combined = []
    combined.push_all(dwp) // Add all DWP members first

    pattern_temp = []
    while wc has items OR dmir has items:
      // Loop 1 (repeats 7 times if data available): 4 WC, 1 DMIR
      for i from 0 to 6:
        take up to 4 from wc, add to pattern_temp
        take 1 from dmir (if available), add to pattern_temp

      // Loop 2 (repeats 3 times if data available): 3 WC, 1 DMIR
      for i from 0 to 2:
        take up to 3 from wc, add to pattern_temp
        take 1 from dmir (if available), add to pattern_temp

    combined.push_all(pattern_temp)
    combined.push_all(sys1)
    combined.push_all(eje)
    combined.push_all(sys2)
    return combined

  function combineEJEArrays_pseudocode(wc, dmir, dwp, sys1, eje, sys2):
    roster = []
    roster.push_all(eje) // Add all EJE members first

    while wc has items OR dmir has items OR dwp has items:
      take up to 7 from wc, add to roster (or all remaining wc)
      take up to 2 from dmir, add to roster (or all remaining dmir)
      take 1 from dwp (if available), add to roster

    roster.push_all(sys1)
    roster.push_all(sys2)
    return roster
  ```

- **Step 1.2:** ✅ Identify necessary modifications for the Expo React Native environment.

  - ✅ Adapted PDF generation approach:
    - Used `pdfmake` for web builds
    - Used `expo-print` and `expo-sharing` for iOS/Android
  - ✅ Created platform-specific implementation files:
    - `utils/roster-pdf-generator.web.ts`
    - `utils/roster-pdf-generator.native.ts`
    - `utils/roster-pdf-generator.ts` (barrel file for dynamic imports)

- **Step 1.3:** ✅ Define data structures and TypeScript interfaces for rosters, members, assignments, etc.

  - ✅ Created `types/rosters.ts` with definitions for:
    - `RosterType`
    - `RosterDisplayField`
    - `Roster`
    - `RosterEntry`
    - `RosterTypeRecord`
    - `RosterMember`
    - `CategorizedMembers`
    - `PDFGenerationOptions`
  - ✅ Updated `types/member.ts` with additional fields needed for roster functionality:
    - ✅ `system_sen_type`
    - ✅ `prior_vac_sys`
    - ✅ `misc_notes`
    - ✅ `date_of_birth`
    - ✅ `current_zone_id`
    - ✅ `home_zone_id`

- **Step 1.4:** ✅ Create new utility files in the current project:
  - ✅ `utils/roster-calculations.ts`: Adapted logic for combining member arrays into rosters
  - ✅ `utils/roster-utils.ts`: Updated utilities for filtering, categorizing, and fetching roster members
  - ✅ Created platform-specific PDF generation utilities:
    - `utils/roster-pdf-generator.web.ts`
    - `utils/roster-pdf-generator.native.ts`
    - `utils/roster-pdf-generator.ts`

**Phase 1 is now COMPLETE ✅**

### Phase 2: Database Design and Setup

- **Step 2.1:** ✅ Define Supabase database schema:

  - ✅ `members` table: An existing table `public.members` has been identified.
    - ✅ Primary Key: `pin_number` (bigint). This will be used as the definitive key for relations.
    - ✅ Relevant columns for rosters include: `pin_number`, `id` (uuid), `first_name`, `last_name`, `company_hire_date` (text, YYYY-MM-DD), `engineer_date` (text, YYYY-MM-DD), `system_sen_type` (text; values: "WC", "DMIR", "DWP", "EJ&E", "SYS1", "SYS2", and "CN" for test/ignore), `status` (text, case-sensitive for ACTIVE/IN-ACTIVE), `wc_sen_roster` (bigint), `dwp_sen_roster` (bigint), `dmir_sen_roster` (bigint), `eje_sen_roster` (bigint), `prior_vac_sys` (bigint), `misc_notes` (text), `current_zone_id` (FK to `zones.id`), `home_zone_id` (FK to `zones.id`), `division_id` (FK to `divisions.id`).
    - ✅ **Action:** The `roster-utils.ts` indicates members are primarily categorized using the `system_sen_type` field. Within these categories, they are sorted using `prior_vac_sys`. This roster feature will be responsible for correctly calculating and maintaining `prior_vac_sys` if it's intended to reflect the generated roster order.
    - ✅ **Note on `*_sen_roster` columns (wc_sen_roster, etc.):** These columns are used by other parts of the application for seniority lists and are considered historical/separate from this new roster generation logic for now. (See Future Considerations).
    - ✅ **Note:** Date fields (`company_hire_date`, `engineer_date`) are stored as `text` and will require careful parsing for seniority sorting _within_ the initial categories, or if used for any overall pre-categorization sorting.
    - ✅ **Note:** The "osl-" prefix for roster types (handled in `roster-utils.ts`) filters members based on `misc_notes`. The origin of "osl-" prefixed types (if not direct DB entries) needs to be clear.
  - ✅ `rosters` table created with fields: `id` (uuid, PK), `roster_type_id` (uuid, FK to `roster_types`), `name` (text), `year` (integer), `effective_date` (timestamptz), `creation_date` (timestamptz).
    - ✅ **Note:** This table will store the _calculated_ rosters. Rosters should be retained for at least 7 years.
  - ✅ `roster_entries` table created with fields: `id` (uuid, PK), `roster_id` (uuid, FK to `rosters`), `member_pin_number` (bigint, FK to `public.members.pin_number`), `order_in_roster` (integer), `details` (jsonb).
    - ✅ **Note:** This table will store the individual member entries for each calculated roster. Entries should be retained for at least 7 years (linked to `rosters` retention).
    - ✅ **Constraint:** A unique constraint added to ensure a member can only appear once in a given roster (UNIQUE(roster_id, member_pin_number)).
  - ✅ `zones` table: Existing table. Contains at least `id` and `name`.
  - ✅ `divisions` table: Existing table. Contains at least `id` and `name`.
  - ✅ `roster_types` table created with fields: `id` (uuid, PK), `name` (text), `description` (text).
    - ✅ Populated with standard types: WC, DMIR, DWP, EJE

- **Step 2.2:** ✅ Plan Supabase schema migrations (if any needed for new tables like `roster_types`, `rosters`, `roster_entries`).

  - ✅ Created migrations for:
    - ✅ `roster_types` table
    - ✅ `rosters` table
    - ✅ `roster_entries` table
  - ✅ Added appropriate indexes for performance

- **Step 2.3:** Plan for yearly roster calculations (target: Dec 31st for Jan 1st availability).
  - **Process:** Admin-triggered for now. Design with future automation in mind (e.g., via Supabase Edge Functions or pg_cron).
  - **Requirement:** Recalculation should be triggerable by an admin around Dec 31st, primarily driven by changes in `member.status` (ACTIVE/IN-ACTIVE, case-sensitive) to prepare rosters for Jan 1st.
  - The calculation process will involve fetching members (excluding "CN" `system_sen_type`, joining with `zones` and `divisions` to get names), categorizing by `system_sen_type`, sorting within categories by `prior_vac_sys` (this system will ensure `prior_vac_sys` reflects correct order), applying OSL filtering if needed, running combination logic, and then saving the results to the `rosters` and `roster_entries` tables.

**Phase 2 is now COMPLETE ✅**

### Phase 3: Admin Interface (MemberManager - Rosters Tab)

- **Path:** `components/admin/union/MemberManager.tsx` (Rosters Tab)
- **Step 3.1:** ✅ Design the UI/UX for the Rosters tab.
  - ✅ Display a list of available _saved yearly rosters_ (e.g., by year, type).
  - ✅ Allow selection of a saved yearly roster to view its details.
  - ✅ **New Feature:** Provide an option for admins to view _dynamic, on-the-fly member lists_ sorted by different roster/seniority logics (WC, DMIR, DWP, EJ&E). This would involve:
    - ✅ A selector (e.g., dropdown) for roster type (WC, DMIR, DWP, EJ&E).
    - ✅ An option to apply OSL filtering (based on `misc_notes`).
    - ✅ Fetching all relevant members.
    - ✅ Applying the selected roster calculation logic (via `getRosterMembers`) to sort and display the list without saving it as an official yearly roster.
    - ✅ **Default Display Fields (Desktop Web):** Rank, Name, PIN, Prior Rights (`system_sen_type`), Engineer Date, Zone (`zone_name`), Prior Rights Rank (`prior_vac_sys`), Division (`division_name`).
    - ✅ **Note:** Consider responsive display for mobile, potentially hiding some default fields to avoid horizontal scrolling.
    - ✅ **Note:** Display logic may be refined later to show different information based on `misc_notes` when OSL is active.
  - ✅ **Enhancement:** Add a mechanism (e.g., dropdown) to select and view _saved historical yearly rosters_ (up to 7 years prior).
  - ✅ **Enhancement:** Implement pagination for larger member sets to improve performance and user experience.
  - ✅ **Enhancement:** Add search and filtering capabilities for any field/column in the roster view.
- **Step 3.2:** ✅ Plan React Native components:
  - ✅ `RosterList` component.
  - ✅ `RosterDetailsView` component.
  - ✅ Components for any management actions (e.g., forms, modals).
- **Step 3.3:** ✅ Define Supabase interactions:
  - ✅ Queries to fetch roster lists and details.
  - ✅ Functions/API calls for any admin CUD (Create, Update, Delete) operations.

**Phase 3 is now COMPLETE ✅**

### Phase 4: User-Facing Interface (app/(rosters)/index.tsx)

- **Path:** `app/(rosters)/index.tsx`
- **Step 4.1:** ✅ Design the UI/UX for read-only roster display.
  - ✅ Initial view presents different roster types (WC, DMIR, DWP, EJ&E) as selectable tabs.
  - ✅ Users select a roster tab to view its contents for the current/relevant year.
  - ✅ **Enhancement:** Added a mechanism (year dropdown) to select and view historical rosters (up to 7 years prior).
  - ✅ **Enhancement:** Implemented pagination for larger member sets to improve performance and user experience.
  - ✅ **Enhancement:** Added search capabilities for filtering the roster view.
- **Step 4.2:** ✅ Navigation structure:
  - ✅ Different _saved yearly roster types_ (WC, DMIR, DWP, EJ&E) are presented as tabs within the main `app/(rosters)/index.tsx` screen.
  - ✅ A year selector is provided to view saved historical yearly rosters (last 7 years).
  - ✅ OSL versions can be toggled with a simple switch control.
- **Step 4.3:** ✅ Implemented React Native components:
  - ✅ Member items that display all relevant member information.
  - ✅ Responsive design for both mobile and web.
- **Step 4.4:** ✅ Implemented Supabase queries for fetching and displaying roster data, optimized for read-only access.

**Phase 4 is now COMPLETE ✅**

### Phase 5: PDF Generation

- **Step 5.1:** Utilize the existing cross-platform PDF generation pattern in the codebase:

  - The application already uses a platform-specific approach with:
    - `pdfmake` (v0.2.19) for web builds
    - `expo-print` (v14.0.3) and `expo-sharing` for iOS/Android
  - **Action:** Create platform-specific implementation files:
    - `utils/roster-pdf-generator.web.ts` (using pdfmake)
    - `utils/roster-pdf-generator.native.ts` (using expo-print/expo-sharing)
    - Optional barrel file `utils/roster-pdf-generator.ts` to handle imports dynamically

- **Step 5.2:** Adapt logic from the reference `pdf-utils.tsx` and existing implementations:

  - For web implementation:
    - Initialize pdfmake fonts with: `pdfMake.vfs = (pdfFonts as any).default || pdfFonts;`
    - Create document definition with proper styling, tables, and header
    - Use `pdfMake.createPdf(documentDefinition).download(filename);` to trigger download
  - For native implementation:
    - Generate HTML content with proper styling
    - Use `Print.printToFileAsync({ html: htmlContent })` to generate PDF
    - Share file with `Sharing.shareAsync(uri, {...options})` for download/viewing
  - **PDF Layout Requirements for Both Platforms:**
    - Include the BLET logo at the top of each document
    - Display the roster name prominently (e.g., "WC Seniority Roster")
    - Format table with appropriate columns based on selected fields
    - Include pagination and headers on each page
    - Match existing PDF outputs for consistency

- **Step 5.3:** Implement Field Selection Component:

  - Create a modal/popup for users to select which fields to display in the PDF
  - Default fields: Rank, Name, PIN, Prior Rights (`system_sen_type`)
  - Optional fields: Engineer Date, Date of Birth, Zone, Home Zone, Division, Prior Vac Sys
  - Store user preferences (if appropriate) for future PDF generation

- **Step 5.4:** Integration points:

  - Add PDF export buttons to both admin and user interfaces
  - Implement platform-specific logic for triggering PDF creation:

    ```typescript
    const handleExportPdf = async () => {
      // Obtain current roster data and selected fields
      // Dynamic import based on platform
      const { generateRosterPdf } = await import("@/utils/roster-pdf-generator");
      await generateRosterPdf({
        members: rosterMembers,
        selectedFields: selectedFields,
        rosterType: selectedRosterType,
        title: `${selectedRosterType} Seniority Roster`,
      });
    };
    ```

- **Step 5.5:** Testing:
  - Test PDF generation on all target platforms (iOS, Android, Web)
  - Verify the PDF layout is consistent and professional across platforms
  - Ensure large rosters are handled properly (pagination, file size)

### Phase 6: Testing and Refinement

- **Step 6.1:** Plan unit tests (Jest & React Native Testing Library):
  - Roster calculation logic.
  - Utility functions.
  - UI components (props, rendering).
- **Step 6.2:** Plan integration tests (Detox or manual):
  - Admin roster management flow.
  - User roster viewing flow.
  - PDF generation.
- **Step 6.3:** Cross-platform testing (iOS, Android, Web) for UI consistency and functionality.

---

## 2. File Locations and Paths

- **Planning Document:** `rosters_plan.md` (this file)
- **Admin Components:**
  - `components/admin/union/MemberManager.tsx` (modification for Rosters tab content)
  - New components: `components/admin/rosters/RosterList.tsx`, `components/admin/rosters/RosterDetails.tsx`, etc.
- **User-Facing Screens/Components:**
  - `app/(rosters)/index.tsx` (main screen)
  - Potentially: `app/(rosters)/[rosterType].tsx` or `app/(rosters)/[rosterId].tsx`
  - New components: `components/rosters/UserRosterView.tsx`, `components/rosters/RosterCard.tsx`
- **Utility Files:**
  - `utils/roster-calculations.ts`
  - `utils/roster-utils.ts`
  - `utils/roster-pdf-generator.web.ts` (web-specific PDF generation)
  - `utils/roster-pdf-generator.native.ts` (native-specific PDF generation)
  - `utils/roster-pdf-generator.ts` (barrel file for dynamic imports)
- **Type Definitions:**
  - `types/rosters.ts` (or integrated into existing type files)

---

## 3. Database Migrations (Supabase)

- **Initial Schema Setup:**
  - `CREATE TABLE public.roster_types ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL UNIQUE, description TEXT );`
  - `CREATE TABLE public.rosters ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), roster_type_id uuid REFERENCES public.roster_types(id), name TEXT NOT NULL, year INTEGER NOT NULL, effective_date TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now() );`
  - `CREATE TABLE public.roster_entries ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), roster_id uuid REFERENCES public.rosters(id) ON DELETE CASCADE, member_pin_number BIGINT REFERENCES public.members(pin_number), -- Referencing existing members table order_in_roster INTEGER, details JSONB, -- For specific data like assignment, notes, etc. created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), CONSTRAINT unique_member_per_roster UNIQUE(roster_id, member_pin_number) );`
  - Indexes on foreign keys and frequently queried columns (e.g., `rosters.year`, `rosters.roster_type_id`, `roster_entries.member_pin_number`).
- **Automated Calculation Logic:**
  - SQL function (e.g., `calculate_yearly_roster(p_year INTEGER, p_roster_type_id UUID)`) to populate `roster_entries`.
  - Scheduling using `pg_cron` if available/chosen, or a Supabase Edge Function triggered by a cron job service.
    - Example `pg_cron` (conceptual): `SELECT cron.schedule('yearly-roster-calc', '0 0 1 1 *', 'SELECT calculate_yearly_roster(EXTRACT(YEAR FROM CURRENT_DATE) + 1, <target_roster_type_id>)');` (Adjust for Dec 31st)

---

## 4. Clarifying Questions

_(All initial clarifying questions have been answered and their content integrated into the main body of the plan.)_

## 5. Reference Material

- **Previous Application Utilities:** [RealmKnight/union_roster_app/src/lib](https://github.com/RealmKnight/union_roster_app/tree/master/src/lib)
- **Current App Code:**
  - `components/admin/union/MemberManager.tsx`
  - `app/(rosters)/index.tsx`

---

## 6. Future Considerations / Post-MVP

- **Refactor existing seniority list displays:** Once the new roster system is stable and proven, examine other parts of the application that use the `*_sen_roster` columns (e.g., `wc_sen_roster`) for displaying seniority lists. Plan to refactor these areas to utilize the new roster generation utilities or the saved roster data for consistency and to centralize the logic.
- **Automate Yearly Roster Calculation:** Transition the admin-triggered yearly roster calculation to a fully automated process (e.g., using Supabase scheduled functions) for Dec 31st execution.

## 7. Pending Clarifications

- **OSL Filtering:** Need to determine the specific criteria for OSL filtering based on `misc_notes`. What does "OSL" stand for, and what specific condition in `misc_notes` triggers filtering? Is this terminology that should appear in the UI?

_(This plan will be updated as more information is gathered and decisions are made.)_
