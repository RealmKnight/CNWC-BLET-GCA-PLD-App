# Manage Time Off Feature Plan

## Overview

This feature will add a new action section on the calendar manager page called "Manage Time Off" that displays all members of the division with their time off information. Administrators will be able to manage both current year and next year time off allocations.

## Database Considerations

### Existing Tables/Fields

- `members` table:

  - `pin_number` (Primary key)
  - `first_name`, `last_name`
  - `company_hire_date`
  - `division_id`
  - `max_plds` (maximum PLDs based on years of service)
  - `sdv_entitlement` (current year SDVs from split weeks)
  - `sdv_election` (next year SDVs from split weeks)
  - `pld_rolled_over`

- `vacation_allotments` table:
  - Tracks available allotments per week
- `pld_sdv_allotments` table:
  - Tracks PLD/SDV allotments

### New Fields Needed

- `members` table:
  - `curr_vacation_weeks` (integer): Current year total vacation weeks
  - `next_vacation_weeks` (integer): Next year total vacation weeks
  - `curr_vacation_split` (integer): Current year number of weeks split into SDVs (0, 1, or 2)
  - `next_vacation_split` (integer): Next year number of weeks split into SDVs (0, 1, or 2)

## Calculation Rules

### Vacation Weeks Based on Company Hire Date

- 0 to < 2 years: 1 week
- 2 to < 5 years: 2 weeks
- 5 to < 14 years: 3 weeks
- 14 to < 23 years: 4 weeks
- 23+ years: 5 weeks

**Important Note**: During a calendar year in which an Engineer's vacation entitlement increases on their anniversary date, they are permitted to schedule the additional vacation time at any time during that calendar year. For vacation bidding (which occurs around July 1 for the next year), we need to account for upcoming anniversary dates that will increase entitlement.

### PLD Calculation Based on Years of Service

- < 3 years: 5 PLDs
- 3 to < 6 years: 8 PLDs
- 6 to < 10 years: 11 PLDs
- 10+ years: 13 PLDs

**Important Note**: The `max_plds` will change to the new value on the anniversary date, and the engineer will be able to schedule the additional days after their anniversary date.

### Vacation Split Rules

- Engineers can split up to 2 weeks of their annual vacation into SDVs
- Each split week provides 6 SDVs
- Possible combinations:
  - 0 split weeks = 0 SDVs
  - 1 split week = 6 SDVs
  - 2 split weeks = 12 SDVs

### Weeks to Bid Calculation

- Weeks to bid = Vacation weeks - Split weeks

### SDV Calculation

- SDVs = Vacation split weeks × 6
- SDVs are stored in:
  - `sdv_entitlement` (current year)
  - `sdv_election` (next year)

## Component Implementation

### UI Structure

1. Add a new action button in the `CalendarManager.tsx` component:

   - Modify the `CalendarView` type to include "manageTimeOff"
   - Add a new action button with "time-outline" icon
   - Add a new case in the `renderContent` function

2. Create a new `TimeOffManager.tsx` component:
   - Year selector at the top (toggle between current year and next year)
   - A scrollable table/list view of all division members
   - Search field to search by name or PIN
   - Mobile-friendly design
   - Columns for:
     - Name
     - PIN
     - Company Hire Date
     - Vacation Weeks (calculated but displayed as read-only)
     - Vacation Split (editable: 0, 1, or 2)
     - Weeks to Bid (calculated: Vacation weeks - Split weeks)
     - PLDs (calculated from years of service)
     - SDVs (from `sdv_entitlement` for current year or `sdv_election` for next year)
   - Bulk editing capability
   - Sticky Save button in the bottom right (disabled if no changes)
   - Sorting functionality for all columns

### Component Features

1. Toggle between current year and next year data
2. List all members with their time off information
3. Calculate derived fields based on selected year:
   - Vacation weeks (based on company hire date, accounting for mid-year increases)
   - PLDs (based on years of service, accounting for mid-year increases)
   - SDVs (6 per split week, stored in `sdv_entitlement` or `sdv_election`)
   - Weeks to bid (vacation weeks - split weeks)
4. Allow admin to edit certain fields:
   - Vacation split (0, 1, or 2 weeks)
   - SDV election (when in next year mode)
5. Auto-update calculated fields when editable fields change
6. Bulk editing with a disabled Save button until changes are made
7. Search functionality to find members by name or PIN

### Data Management

1. Fetch members belonging to the selected division
2. Calculate vacation weeks based on company hire date for each member for both current and next year
3. Calculate PLDs based on years of service for both current and next year
4. Track changes in a local state before submitting to the database
5. Implement real-time updates using Supabase

## Implementation Steps

1. Database Schema Updates:

   - Add the new year-specific fields to the `members` table:
     - `curr_vacation_weeks`, `next_vacation_weeks`
     - `curr_vacation_split`, `next_vacation_split`

2. Component Development:

   - Create the `TimeOffManager` component with year selector
   - Implement scrollable table/list view
   - Implement search functionality for name and PIN
   - Implement calculation functions for derived fields for both current and next year:
     - Vacation weeks based on company hire date
     - PLDs based on years of service
     - SDVs from split weeks (using existing `sdv_entitlement` and `sdv_election`)
     - Weeks to bid
   - Implement editing for relevant fields
   - Add sorting functionality for all columns
   - Implement sticky Save button with proper state handling
   - Ensure mobile-friendly design

3. Store Updates:

   - Add new state and actions to the `adminCalendarManagementStore`:
     - Track member time off data for both current and next year
     - Add selected year state (current/next)
     - Track changes before saving
     - Update member time off data in bulk

4. UI Integration:
   - Update `CalendarManager.tsx` to include the new action button
   - Add the case in `renderContent` to display the TimeOffManager
   - Style the component consistently with the rest of the application

## Timeline/Milestones

1. Database schema updates
2. Component scaffolding and data fetching
3. UI implementation with read-only data
4. Editing functionality implementation
5. Testing and refinement

## Open Questions

1. Are there any specific business rules for calculating vacation weeks?
2. Should certain fields be admin-only editable or member-editable?
3. Are there any validation rules for the editable fields?
4. Do we need to track history of time off changes?
5. How should we handle conflicts or disputes?

## Implementation Details

### Year Selector Component

```typescript
function YearSelector({
  currentYear = new Date().getFullYear(),
  selectedYear,
  onChange,
}: {
  currentYear?: number;
  selectedYear: "current" | "next";
  onChange: (year: "current" | "next") => void;
}) {
  return (
    <View style={styles.yearSelectorContainer}>
      <ThemedText style={styles.yearSelectorLabel}>View/Edit Time Off for:</ThemedText>
      <View style={styles.yearButtonsContainer}>
        <TouchableOpacity
          style={[styles.yearButton, selectedYear === "current" && styles.selectedYearButton]}
          onPress={() => onChange("current")}
        >
          <ThemedText style={[styles.yearButtonText, selectedYear === "current" && styles.selectedYearButtonText]}>
            {currentYear} (Current)
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.yearButton, selectedYear === "next" && styles.selectedYearButton]}
          onPress={() => onChange("next")}
        >
          <ThemedText style={[styles.yearButtonText, selectedYear === "next" && styles.selectedYearButtonText]}>
            {currentYear + 1} (Next)
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

### Vacation Weeks Calculation Function

```typescript
function calculateVacationWeeks(companyHireDate: string, referenceDate: Date = new Date()): number {
  const hireDate = new Date(companyHireDate);

  // Calculate years of service as of the reference date
  const yearsOfService = referenceDate.getFullYear() - hireDate.getFullYear();

  // Adjust for anniversary not yet reached this year
  if (
    referenceDate.getMonth() < hireDate.getMonth() ||
    (referenceDate.getMonth() === hireDate.getMonth() && referenceDate.getDate() < hireDate.getDate())
  ) {
    yearsOfService--;
  }

  // Apply vacation week rules
  if (yearsOfService < 2) return 1;
  if (yearsOfService < 5) return 2;
  if (yearsOfService < 14) return 3;
  if (yearsOfService < 23) return 4;
  return 5;
}

// For next year's bidding (typically around July 1)
function calculateNextYearVacationWeeks(companyHireDate: string): number {
  // Create a date for next year (current year + 1)
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return calculateVacationWeeks(companyHireDate, nextYear);
}
```

### PLD Calculation Function

```typescript
function calculatePLDs(companyHireDate: string, referenceDate: Date = new Date()): number {
  const hireDate = new Date(companyHireDate);

  // Calculate years of service as of the reference date
  const yearsOfService = referenceDate.getFullYear() - hireDate.getFullYear();

  // Adjust for anniversary not yet reached this year
  if (
    referenceDate.getMonth() < hireDate.getMonth() ||
    (referenceDate.getMonth() === hireDate.getMonth() && referenceDate.getDate() < hireDate.getDate())
  ) {
    yearsOfService--;
  }

  // Apply PLD rules
  if (yearsOfService < 3) return 5;
  if (yearsOfService < 6) return 8;
  if (yearsOfService < 10) return 11;
  return 13;
}

// For next year's bidding
function calculateNextYearPLDs(companyHireDate: string): number {
  // Create a date for next year (current year + 1)
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return calculatePLDs(companyHireDate, nextYear);
}
```

### SDV Calculation Function

```typescript
function calculateSDVsFromVacationSplit(vacationSplit: number): number {
  // Each week split provides 6 SDVs
  return vacationSplit * 6;
}
```

### Bulk Update Changes Function

```typescript
const saveTimeOffChanges = async (
  changes: Array<{
    pin_number: number;
    curr_vacation_split?: number;
    next_vacation_split?: number;
    curr_vacation_weeks?: number;
    next_vacation_weeks?: number;
    sdv_election?: number;
  }>,
  year: "current" | "next"
) => {
  // Implementation to save changes to the database based on selected year
  // Will update sdv_entitlement or sdv_election based on vacation split
  // Will return success/failure and update the UI accordingly
};
```

### Store Enhancements for Year Selection

```typescript
// Add to AdminCalendarManagementState interface
interface AdminCalendarManagementState {
  // ... existing state

  // New state for time off management
  selectedTimeOffYear: "current" | "next"; // Current or next year view
  memberTimeOffData: Record<
    number,
    {
      // Member info
      pin_number: number;
      first_name: string;
      last_name: string;
      company_hire_date: string;

      // Current year info
      curr_vacation_weeks: number;
      curr_vacation_split: number;
      sdv_entitlement: number; // Using existing field for current year SDVs
      max_plds: number; // Using existing field for PLDs

      // Next year info
      next_vacation_weeks: number;
      next_vacation_split: number;
      sdv_election: number; // Using existing field for next year SDVs
    }
  >;

  // Tracking changes before saving
  timeOffChanges: Record<
    number,
    Partial<{
      curr_vacation_split: number;
      next_vacation_split: number;
      curr_vacation_weeks: number;
      next_vacation_weeks: number;
      sdv_election: number; // Only need to explicitly update this for next year
    }>
  >;

  // New actions
  setSelectedTimeOffYear: (year: "current" | "next") => void;
  fetchMemberTimeOffData: (divisionId: number) => Promise<void>;
  updateMemberTimeOff: (
    changes: Array<{
      pin_number: number;
      [key: string]: any;
    }>,
    year: "current" | "next"
  ) => Promise<boolean>;
  setTimeOffChange: (pinNumber: number, field: string, value: any) => void;
  resetTimeOffChanges: () => void;

  // Helper function to update SDVs when vacation split changes
  calculateAndUpdateSDVs: (pinNumber: number, vacationSplit: number, year: "current" | "next") => void;
}
```
