# Division Meetings Feature Implementation Plan

## Overview

This document outlines the plan for implementing the Division Meetings feature in the PLD App. This feature will allow division administrators to manage meeting schedules, locations, and agendas for their divisions, while also providing division members with information about upcoming meetings.

## Table Schema

### Modified Table: `division_meetings` (Defines the recurring pattern)

- `id` (UUID, Primary Key): Unique identifier for the meeting pattern
- `division_id` (Foreign Key): References `divisions.id`. **Action: Use MCP Tool to verify the data type of `divisions.id` (e.g., UUID, INTEGER). For user display purposes, the division _name_ should be shown, typically retrieved via a join or separate query using this ID.**
- `meeting_type` (Text): Type of meeting (e.g., 'regular', 'special', 'committee')
- `location_name` (Text): Default name of the meeting location
- `location_address` (Text): Default full address of the meeting location
- `meeting_time` (Time): Default time when meetings start (used if not specified in a rotating rule)
- `meeting_pattern_type` (Text): Type of meeting pattern ('day_of_month', 'nth_day_of_month', 'specific_date', 'rotating')
- `adjust_for_dst` (Boolean, Default: false): Whether to adjust meeting times for Daylight Saving Time transitions
- `meeting_pattern` (JSONB): JSON object storing complex meeting pattern data:

  - For `day_of_month`:

    ```json
    {
      "day_of_month": 15, // e.g., 15th of the month
      "time": "19:00:00" // Specific time for this pattern
    }
    ```

  - For `nth_day_of_month`:

    ```json
    {
      "day_of_week": 4, // 0=Sunday, 1=Monday, etc.
      "week_of_month": 2, // 1=first, 2=second, etc.
      "time": "19:00:00" // Specific time for this pattern
    }
    ```

  - For `specific_date` (less common for recurring, more for single events set up via this system):

    ```json
    {
      "specific_dates": [
        // Array of specific dates and times
        { "date": "2023-12-15", "time": "13:00:00" },
        { "date": "2024-01-20", "time": "14:00:00" }
      ]
    }
    ```

  - For `rotating`:

    ```json
    {
      "rules": [
        // Ordered list of recurrence rules to cycle through
        {
          "rule_type": "nth_day_of_month", // Example: first rule
          "day_of_week": 1, // Monday
          "week_of_month": 1, // First
          "time": "10:00:00"
        },
        {
          "rule_type": "nth_day_of_month", // Example: second rule
          "day_of_week": 3, // Wednesday
          "week_of_month": 3, // Third
          "time": "19:00:00"
        }
        // Add more rules as needed for sequences like A -> B -> C -> A
      ],
      "current_rule_index": 0 // Tracks the next rule in the 'rules' array to apply
    }
    ```

- `meeting_frequency` (Text): How often meetings occur (e.g., 'weekly', 'monthly', 'bi-weekly') - _This might be redundant if `meeting_pattern` is rich enough, or could be a general descriptor._
- `meeting_notes` (Text): General notes about this meeting series/pattern.
- `default_agenda` (Text, Nullable): A default or template agenda for meetings generated from this pattern.
- `time_zone` (Text): Default time zone for meetings in this series (e.g., 'America/Chicago')
- `is_active` (Boolean): Whether this meeting pattern is currently active and should generate occurrences.
- `created_at` (Timestamp): When the record was created
- `updated_at` (Timestamp): When the record was last updated
- `created_by` (UUID): User who created the record
- `updated_by` (UUID): User who last updated the record

### New Table: `meeting_occurrences` (Stores individual scheduled or overridden instances)

- `id` (UUID, Primary Key): Unique identifier for this specific meeting occurrence.
- `meeting_pattern_id` (UUID, Foreign Key): References `division_meetings.id`.
- `original_scheduled_datetime_utc` (TimestampTZ): The date and time this occurrence was _originally_ scheduled for based on the pattern, stored in UTC.
- `actual_scheduled_datetime_utc` (TimestampTZ): The actual date and time this occurrence is happening, stored in UTC. This can be the same as `original_scheduled_datetime_utc` or an overridden value.
- `time_zone` (Text): The IANA time zone for this specific occurrence (e.g., 'America/Chicago'), inherited from `division_meetings` but can be overridden here if needed.
- `location_name` (Text, Nullable): Specific location name for this occurrence (if different from pattern's default).
- `location_address` (Text, Nullable): Specific location address for this occurrence (if different from pattern's default).
- `agenda` (Text, Nullable): Specific agenda for this occurrence. Copied from `division_meetings.default_agenda` on creation, then customizable.
- `notes` (Text, Nullable): Specific notes for this occurrence.
- `is_cancelled` (Boolean, Default: false): If this specific occurrence is cancelled.
- `override_reason` (Text, Nullable): Reason for an override (e.g., date/time change) or cancellation.
- `created_at` (TimestampTZ): When the record was created.
- `updated_at` (TimestampTZ): When the record was last updated.
- `created_by` (UUID): User who created the record (or the system if auto-generated).
- `updated_by` (UUID): User who last updated the record.

### New Table: `meeting_minutes`

- `id` (UUID, Primary Key): Unique identifier for the minutes
- `meeting_id` (UUID, Foreign Key): References division_meetings.id
- `meeting_date` (Date): Date when the meeting was held
- `content` (Text): The general meeting minutes content
- `structured_content` (JSONB): Structured content following Robert's Rules of Order:

  ```json
  {
    "call_to_order": {
      "time": "19:00:00",
      "presiding_officer": "John Doe"
    },
    "roll_call": {
      "present": ["Member 1", "Member 2"],
      "absent": ["Member 3"],
      "excused": ["Member 4"]
    },
    "approval_of_previous_minutes": {
      "approved": true,
      "amendments": "Corrected spelling of Member 2's name"
    },
    "reports": [
      {
        "title": "Treasurer Report",
        "presenter": "Member 1",
        "summary": "Current balance is $10,000"
      }
    ],
    "motions": [
      {
        "title": "Purchase new equipment",
        "moved_by": "Member 1",
        "seconded_by": "Member 2",
        "description": "Motion to allocate $500 for new office equipment",
        "vote_result": {
          "in_favor": 10,
          "opposed": 2,
          "abstained": 1
        },
        "passed": true
      }
    ],
    "adjournment": {
      "moved_by": "Member 2",
      "seconded_by": "Member 1",
      "vote_result": {
        "in_favor": 10,
        "opposed": 2,
        "abstained": 1
      },
      "passed": true,
      "time": "21:00:00"
    },
    "additional_sections": [
      {
        "title": "Custom Section",
        "content": "Additional content as needed"
      }
    ],
    "attendance_summary": {
      // Simplified attendance for Phase 2, logged within minutes
      "present_count": 2,
      "absent_count": 1,
      "excused_count": 1,
      "notes": "Details on attendees..."
    }
  }
  ```

- `is_approved` (Boolean): Whether these minutes are approved
- `is_archived` (Boolean): Whether these minutes have been archived
- `approval_date` (Timestamp): When the minutes were approved
- `approved_by` (UUID): Division admin who approved the minutes
- `created_at` (Timestamp): When the record was created
- `updated_at` (Timestamp): When the record was last updated
- `created_by` (UUID): User who created the record
- `updated_by` (UUID): User who last updated the record

### New Table: `meeting_notification_preferences`

- `id` (UUID, Primary Key): Unique identifier for the preference
- `user_id` (UUID, Foreign Key): References auth.users.id
- `notify_week_before` (Boolean, Default: false): Send notification 1 week before meeting
- `notify_day_before` (Boolean, Default: false): Send notification 1 day before meeting
- `notify_hour_before` (Boolean, Default: false): Send notification 1 hour before meeting
- `created_at` (Timestamp): When the record was created
- `updated_at` (Timestamp): When the record was last updated

### Future Table (planned but not implemented initially): `meeting_attendance`

- `id` (UUID, Primary Key): Unique identifier for the attendance record
- `meeting_id` (UUID, Foreign Key): References division_meetings.id
- `meeting_date` (Date): Date of the specific meeting instance
- `member_id` (UUID, Foreign Key): References members.id
- `status` (Text): Attendance status ('present', 'absent', 'excused')
- `notes` (Text): Any notes about the attendance
- `created_at` (Timestamp): When the record was created
- `updated_at` (Timestamp): When the record was last updated
- `created_by` (UUID): User who recorded the attendance
- `updated_by` (UUID): User who last updated the record

## Implementation Phases

### Phase 1: Database Setup ✅

1. ✅ Create the `division_meetings` table with JSONB type for complex meeting patterns
   - Migration Name: `create_division_meetings_table` ✅
2. ✅ Create the `meeting_occurrences` table to store individual meeting instances
   - Migration Name: `create_meeting_occurrences_table` ✅
3. ✅ Create the `meeting_minutes` table with JSONB for structured content and full-text search indexes (on `content` and potentially specific fields within `structured_content`).
   - Migration Name: `create_meeting_minutes_table` ✅
4. ✅ Create the `meeting_notification_preferences` table with default values of false for all notification options
   - Migration Name: `create_meeting_notification_preferences_table` ✅
5. ✅ Set up Row Level Security (RLS) policies to ensure:
   - ✅ Only division admins can create/update `division_meetings` patterns for their division.
   - ✅ All members of a division can view `division_meetings` patterns.
   - ✅ Only division admins (or a system process) can create `meeting_occurrences`.
   - ✅ Only division admins can update/override/cancel `meeting_occurrences` for their division.
   - ✅ All members of a division can view non-cancelled `meeting_occurrences`.
   - ✅ Only division admins can create/update meeting minutes.
   - ✅ Only division admins can approve meeting minutes.
   - ✅ Only division admins can archive meeting minutes.
   - ✅ All members can view approved meeting minutes.
   - ✅ RLS permissions correctly configured to use `members.role` for admin checks
   - Migration Name: `add_division_meetings_rls_policies` ✅ (with additional correction in `correct_division_meetings_rls_policies`)
6. ✅ Create Supabase Scheduled Function(s) to:
   - ✅ Periodically (e.g., daily/weekly) populate the `meeting_occurrences` table for active patterns for the next 12 months only.
   - ✅ Auto-update the `updated_at` field on relevant tables (can also be done with database triggers).
   - Migration Name: `create_meeting_scheduler_function` ✅
7. ✅ Add indexes for performance:
   - ✅ Full-text search index on `meeting_minutes.content` and key JSONB fields in `structured_content`.
   - ✅ Index on `division_meetings.division_id` and `division_meetings.is_active`.
   - ✅ Index on `meeting_occurrences.meeting_pattern_id`, `meeting_occurrences.actual_scheduled_datetime_utc`, `meeting_occurrences.is_cancelled`.
   - ✅ Index on `meeting_minutes.meeting_date`.
   - Migration Name: `add_division_meetings_indexes` ✅

### Phase 2: UI Component Development - Admin Interface ✅

1. ✅ Create a new `DivisionMeetings.tsx` component under `components/admin/division/`
2. ✅ Implement the component with the following features:
   - ✅ Meeting Schedule Management section:
     - ✅ Advanced form for editing complex meeting patterns in `division_meetings`.
     - ✅ Support for multiple pattern types (nth day of month, specific date, rotating with multiple rules).
     - ✅ "Adjust for Daylight Saving Time" checkbox with highlight/warning when DST changes are approaching.
     - ✅ Time zone selection for the pattern.
     - ✅ **Visual calendar preview** showing scheduled `meeting_occurrences` for the selected pattern.
     - ✅ Pattern visualization to confirm correct scheduling.
     - ✅ Preview of upcoming `meeting_occurrences`.
     - ✅ **Confirmation dialog** when saving pattern changes that will delete and replace future, non-overridden `meeting_occurrences`.
   - ✅ Meeting Agenda Management section:
     - ✅ Editor for creating/updating the `division_meetings.default_agenda`.
     - ✅ Interface to view/edit the specific `agenda` for individual `meeting_occurrences`.
   - ✅ Meeting Minutes Management section:
     - ✅ Interface for entering meeting minutes with structured format following Robert's Rules
     - ✅ Structured editor with sections for motions, votes, reports, etc.
     - ✅ Ability to add custom sections as needed
     - ✅ Fixed TypeScript type errors in StructuredMinutesEditor and implemented robust type safety for array handling
     - ✅ List of past meeting minutes with search/filter capabilities and pagination
     - ✅ PDF export functionality for meeting minutes (using makepdf for web and expo-print for mobile)
     - ✅ Manual archiving functionality for old minutes
     - ✅ Approval workflow for minutes (any division admin for that division can approve).
     - ✅ Attendance recording interface (logging to `meeting_minutes.structured_content.attendance_summary` for initial phase).
3. ✅ Create utility functions for:
   - ✅ Calculating meeting dates based on patterns (for the scheduled function and UI previews).
   - ✅ Handling DST transitions based on the `adjust_for_dst` setting.
   - ✅ Validating meeting patterns
   - ✅ Handling time zone conversions
   - ✅ Generating calendar export files (iCal format)
4. ✅ Ensure responsive design for both mobile and web interfaces
5. ✅ Implement loading states and error handling

**Current Progress:**

- ✅ Created UI components with tab structure
- ✅ Created fully functional implementations of `MeetingPatternEditor` and `StructuredMinutesEditor`
- ✅ Integrated with `DivisionManagement.tsx`
- ✅ Created TypeScript interfaces for data structures
- ✅ Implemented meeting date calculation utilities
- ✅ Added time zone handling support
- ✅ Fixed TypeScript errors and improved type safety in components
- ✅ Connected the UI to store for full functionality

### Phase 3: State Management ✅

1. ✅ Create a new store or extend existing store for managing meeting data
   - ✅ Created `divisionMeetingStore.ts` with all necessary type definitions and function signatures
2. ✅ Implement Zustand store functions for:
   - ✅ Fetching `division_meetings` patterns.
   - ✅ Fetching `meeting_occurrences` for a given pattern and date range.
   - ✅ Creating new `division_meetings` patterns.
   - ✅ Updating existing `division_meetings` patterns (with confirmation for impact on occurrences).
   - ✅ Overriding/cancelling individual `meeting_occurrences`.
   - ✅ Managing meeting minutes with structured content.
   - ✅ Searching and filtering meeting minutes with pagination
   - ✅ Archiving meeting minutes
   - ✅ Recording meeting attendance
   - ✅ Exporting meeting calendar
   - ✅ Exporting meeting minutes as PDF
   - ✅ Exporting meeting schedule as PDF
   - ✅ Error handling and loading states
3. ✅ Set up Supabase realtime subscriptions for live updates
   - ✅ Implemented realtime subscriptions for division_meetings, meeting_occurrences, and meeting_minutes
   - ✅ Added proper type checking for payload data
   - ✅ Connected subscription events to store update functions
4. ✅ Implement caching strategy for performance

**Current Progress:**

- ✅ Store structure created with full implementation of Supabase API calls
- ✅ All CRUD operations for meetings, occurrences, and minutes implemented
- ✅ Realtime subscriptions implemented for all data types
- ✅ PDF export functionality for meeting minutes implemented
- ✅ PDF export functionality for meeting schedules implemented
- ✅ All store functionality tested and working properly

### Phase 4: Integration with Notification System ✅

1. ✅ Extend the user profile settings to include meeting notification preferences
   - ✅ Created `MeetingNotificationPreferences` component
   - ✅ Added to user profile under notification settings section
   - ✅ Integrated with existing notification system
2. ✅ Create a user interface for managing notification preferences:
   - ✅ Checkboxes for notification timing options (week before, day before, hour before)
   - ✅ Default all options to disabled (false)
3. ✅ Implement server-side notification scheduling logic:
   - ✅ Created `meetingNotificationScheduler.ts` utility for handling meeting notifications
   - ✅ Implemented Supabase Edge Function with scheduler
   - ✅ Set up hourly cron job to check for upcoming meetings
   - ✅ Added logging system to track notification delivery
4. ✅ Implement notification delivery for various platforms:
   - ✅ Mobile push notifications using Expo notifications
   - ✅ Email notifications (optional, for web users)
   - ✅ In-app notifications for both web and mobile

### Phase 5: User-Facing View Implementation

1. ✅ Create a user-facing view for division members to access meeting information:
   - ✅ Create a new route at `app/(division)/[divisionName]/meetings.tsx` for division meeting details
   - ✅ Update `app/(division)/_layout.tsx` to include the new meetings route in the Stack configuration
   - ✅ Update the navigation card in the division main index page to route to the meetings page
   - ✅ Ensure proper permissions checking for division member access
2. ✅ Implement component to display upcoming meeting information prominently:
   - ✅ Next meeting date, time, and location
   - ✅ Countdown timer for the next meeting
   - ✅ Meeting agenda preview
   - ✅ Add to Calendar button with multiple calendar options
   - ✅ Location map view with address details
   - ✅ RSVP functionality (planned for future implementation)
3. ✅ Create calendar view of upcoming meetings with filter options:
   - ✅ List view optimized for mobile-friendly browsing
   - ✅ Calendar/grid view optimized for web users with responsive layout
   - ✅ Filter controls for date range and meeting type
   - ✅ Clear visual indicators for meeting status (scheduled, cancelled, etc.)
   - ✅ Simple toggle between view modes
4. ✅ Implement meeting minutes browser for members:
   - ✅ Search functionality by content and date
   - ✅ Filter options for approved/unapproved minutes
   - ✅ Sort options by date, meeting type, etc.
   - ✅ Pagination for large result sets
   - ✅ Uniform card-based layout for consistent UX
5. ✅ Create structured minutes reader component:
   - ✅ Well-formatted display of Robert's Rules sections
   - ✅ Highlight motions and votes
   - ✅ Collapsible sections for long minutes
   - ✅ Easy navigation between sections
   - ✅ PDF export option with download/share functionality
6. ✅ Implement responsive design considerations:
   - ✅ Optimize layout for both mobile and web interfaces
   - ✅ Ensure readability of meeting details on small screens
   - ✅ Touch-friendly controls for mobile users
   - ✅ Consistent styling with the rest of the application
   - ✅ Accessibility features for all interactive elements
7. ✅ Add proper integration with other app sections:
   - ✅ Notification badge for upcoming meetings in the main navigation
   - ✅ Deep linking support for sharing specific meeting details
   - ✅ Seamless transition between admin and member views for users with admin permissions

### Phase 6: Calendar Integration

_Note: This phase comes after the User-Facing View Implementation because we need the meeting routes and UI components in place to properly implement deep links and calendar integration._

1. 🔄 Implement "Add to Calendar" functionality for individual meetings:
   - Generate iCalendar (.ics) format files for web downloads
   - Implement platform-specific calendar integration for mobile (iOS/Android)
2. ❌ Create export functionality for meeting series:
   - Option to export all upcoming meetings from a pattern
   - Option to export meetings within a specific date range
3. ❌ Implement deep linking for calendar events to open the corresponding meeting details
4. ❌ Create utility functions for generating properly formatted calendar events with:
   - Meeting location details
   - Agenda information
   - Reminders (based on notification preferences)
   - Organizer information
   - Links back to the app

### Phase 7: PDF Export Functionality (Partially Complete)

1. ✅ Implement PDF generation for meeting minutes:
   - ✅ Implemented PDF generation for minutes using pdfMake (web) and expo-print/expo-sharing (mobile)
   - ✅ Created platform-specific implementations with dynamic imports
   - ✅ Added proper formatting for meeting minutes following Robert's Rules format
   - ✅ Connected PDF export functionality to store actions
2. ✅ Implement PDF generation for meeting schedules:
   - ✅ Option to export schedule for a specific date range
   - ✅ Include meeting details (time, location, agenda)
   - ✅ Consistent styling with minutes export
3. ✅ Create PDF template designs:
   - ✅ Header with division name and logo
   - ✅ Structured sections following Robert's Rules
   - ✅ Proper formatting for tables, lists, and text
   - ✅ Footer with page numbers and export date
4. ✅ Implement sharing functionality:
   - ✅ File saving options for web
   - ✅ Native sharing for mobile platforms

### Phase 8: Integration with DivisionManagement

1. ✅ Update the "meetings" case in the `renderContent` function of DivisionManagement.tsx
2. ✅ Replace the placeholder with the new DivisionMeetings component
3. ✅ Pass required props (division, permissions, etc.)

### Phase 9: Testing

1. ❌ Write unit tests for critical functions:
   - Meeting date calculation utilities
   - Pattern validation logic
   - PDF generation functions
   - Data transformation functions
2. ❌ Implement integration tests for:
   - Database operations and RLS policy validation
   - API endpoints
   - Store functions
3. ❌ Conduct manual testing for:
   - UI component functionality
   - Responsive design across devices
   - Calendar integration
   - Notification delivery
4. ❌ Perform cross-platform testing:
   - Web browser compatibility
   - iOS functionality
   - Android functionality
5. ❌ Verify accessibility compliance:
   - Screen reader compatibility
   - Keyboard navigation
   - Color contrast requirements
6. ❌ Load testing for performance with large datasets:
   - Many meeting patterns
   - Many occurrences
   - Large meeting minutes documents

### Phase 10: Documentation and Deployment

1. ❌ Create user documentation:
   - Admin guide for managing meetings
   - Member guide for viewing meetings and minutes
   - FAQ section for common questions
2. ❌ Update technical documentation:
   - Database schema diagrams
   - Component relationship diagrams
   - API documentation
3. ❌ Create deployment plan:
   - Database migration strategy
   - Feature flag implementation for gradual rollout
   - Rollback plan if issues arise
4. ❌ Prepare training materials:
   - Video tutorials for division admins
   - Quick reference guides
5. ❌ Implement analytics for feature usage:
   - Track meeting creation/editing
   - Monitor minutes creation and approval
   - Measure member engagement with meetings
6. ❌ Conduct final security review:
   - Verify RLS policies are correctly implemented
   - Ensure proper data validation
   - Check for any potential data exposure issues

## Component Structures

### DivisionMeetings Component (Admin)

```typescript
interface DivisionMeetingsProps {
  division: string;
  isAdmin?: boolean;
}

export function DivisionMeetings({ division, isAdmin = false }: DivisionMeetingsProps) {
  // Component implementation with tabs/sections for:
  // - Meeting Schedule Management (editing division_meetings patterns, viewing/managing meeting_occurrences)
  // - Meeting Agenda Management (default_agenda in pattern, specific agenda in occurrences)
  // - Meeting Minutes Management (with structured editor following Robert's Rules)
  // - Attendance Recording
}
```

### Meeting Pattern Editor Component

```typescript
interface MeetingPatternEditorProps {
  initialPattern: MeetingPattern;
  onSave: (pattern: MeetingPattern) => void;
}

export function MeetingPatternEditor({ initialPattern, onSave }: MeetingPatternEditorProps) {
  // Specialized editor for complex meeting patterns with:
  // - Pattern type selection
  // - Pattern configuration based on selected type (including list of rules for 'rotating')
  // - DST adjustment checkbox with warning/highlighting when DST changes are approaching
  // - Pattern validation
  // - Visual calendar preview showing generated/upcoming meeting_occurrences
}
```

### Structured Minutes Editor Component

```typescript
interface StructuredMinutesEditorProps {
  initialContent?: StructuredMinutesContent;
  onSave: (content: StructuredMinutesContent) => void;
}

export function StructuredMinutesEditor({ initialContent, onSave }: StructuredMinutesEditorProps) {
  // Specialized editor for structured meeting minutes following Robert's Rules:
  // - Call to order section
  // - Roll call section
  // - Previous minutes approval
  // - Motions section with add/edit/remove functionality
  // - Reports section
  // - Adjournment section
  // - Dynamic additional sections
}
```

### DivisionMeetingsView Component (User-facing)

```typescript
// File: app/(division)/[divisionName]/meetings.tsx
export default function MeetingsPage() {
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;
  const { session, member } = useAuth();

  // Use the division meetings store
  const { meetings, occurrences, meetingMinutes, fetchDivisionMeetings, fetchMeetingOccurrences, fetchMeetingMinutes } =
    useDivisionMeetingStore();

  // Component implementation to display:
  // - Upcoming meeting details with countdown timer
  // - Meeting agenda with expandable sections
  // - Calendar view with list/grid toggle options
  // - "Add to Calendar" functionality for multiple platforms
  // - Past meeting minutes browser with search/filter and pagination
  // - Structured minutes reader with PDF export
  // - Location map with directions

  // Link back to main division page
  // Navigation to other division sections
}

// Upcoming meeting display component
function UpcomingMeeting({ meeting, occurrence }) {
  // Display next meeting time with countdown
  // Show location with map
  // Display agenda preview
  // Provide calendar export options
}

// Meeting calendar view component
function MeetingsCalendar({ occurrences, viewMode, onSelectMeeting }) {
  // Toggle between list and grid views
  // Apply filters for date range and meeting type
  // Show meeting status indicators
  // Properly handle time zones for display
}

// Meeting minutes browser component
function MinutesBrowser({ minutes, onSelectMinutes }) {
  // Search and filter controls
  // Pagination interface
  // Sort options
  // Card-based layout for minutes
}

// Structured minutes reader component
function MinutesReader({ minutes }) {
  // Well-formatted display with sections
  // Collapsible sections for long content
  // PDF export button
  // Navigation between sections
}
```

### PDF Generator Component

```typescript
interface GeneratePdfProps {
  content: MeetingMinute | MeetingOccurrence[];
  type: "minutes" | "schedule";
  title: string;
}

export function generatePdf({ content, type, title }: GeneratePdfProps) {
  // Platform-specific implementation (web vs mobile)
  if (Platform.OS === "web") {
    // Use makepdf for web
    return generateWebPdf(content, type, title);
  } else {
    // Use expo-print for native platforms
    return generateNativePdf(content, type, title);
  }
}
```

### State Management

```typescript
interface DivisionMeetingStore {
  // Data
  meetings: Record<string, DivisionMeeting[]>; // Stores division_meetings patterns
  occurrences: Record<string, MeetingOccurrence[]>; // Stores meeting_occurrences keyed by pattern_id
  meetingMinutes: Record<string, MeetingMinute[]>;
  selectedMeetingPatternId: string | null;
  selectedOccurrenceId: string | null;
  filteredMinutes: MeetingMinute[];
  searchTerm: string;
  dateRangeFilter: { start: Date | null; end: Date | null };
  currentPage: number;
  itemsPerPage: number;
  totalItems: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDivisionMeetings: (divisionId: string) => Promise<void>; // Fetches patterns
  fetchMeetingOccurrences: (patternId: string, dateRange?: { start: Date; end: Date }) => Promise<void>; // Fetches occurrences
  createMeetingPattern: (pattern: Partial<DivisionMeeting>) => Promise<void>;
  updateMeetingPattern: (id: string, pattern: Partial<DivisionMeeting>) => Promise<void>; // Handles confirmation for future occurrence changes
  overrideMeetingOccurrence: (id: string, occurrenceDetails: Partial<MeetingOccurrence>) => Promise<void>;
  cancelMeetingOccurrence: (id: string, reason: string) => Promise<void>;
  fetchMeetingMinutes: (occurrenceId: string, page?: number) => Promise<void>; // Minutes linked to an occurrence with pagination
  searchMeetingMinutes: (searchTerm: string, dateRange?: { start: Date; end: Date }, page?: number) => void;
  createMeetingMinutes: (minutes: Partial<MeetingMinute>) => Promise<void>;
  updateMeetingMinutes: (id: string, minutes: Partial<MeetingMinute>) => Promise<void>;
  approveMeetingMinutes: (id: string) => Promise<void>;
  archiveMeetingMinutes: (id: string) => Promise<void>;
  recordAttendance: (occurrenceId: string, memberId: string, status: string) => Promise<void>; // Attendance linked to an occurrence
  exportCalendar: (patternId: string) => Promise<string>; // Export based on occurrences of a pattern
  exportMinutesPdf: (minuteId: string) => Promise<void>; // Export meeting minutes as PDF
  exportSchedulePdf: (patternId: string, dateRange: { start: Date; end: Date }) => Promise<void>; // Export meeting schedule as PDF
  setPage: (page: number) => void; // For pagination
}
```

## Meeting Date Calculation Utilities

```typescript
// Calculate meeting occurrences based on a complex pattern within a date range
// Limited to a 12-month maximum range
function calculateMeetingOccurrences(pattern: DivisionMeeting, startDate: Date, endDate: Date): MeetingOccurrence[] {
  // Logic to generate a list of MeetingOccurrence objects:
  // - For day_of_month, nth_day_of_month: Calculate all instances within the date range.
  // - For specific_dates: Filter dates within the range.
  // - For rotating: Cycle through rules, applying current_rule_index, and generate instances.
  // Each occurrence should have original_scheduled_datetime_utc, actual_scheduled_datetime_utc (initially same),
  // agenda (copied from default_agenda), time_zone, etc.
  // Enforce a maximum of 12 months of occurrences

  // Apply DST adjustments if pattern.adjust_for_dst is true
  if (pattern.adjust_for_dst) {
    // Handle DST transitions appropriately (maintain consistent local time)
  }
}

// Generate a series of upcoming meeting dates (used by calculateMeetingOccurrences)
function generateUpcomingMeetingDatesFromRule(
  rule: MeetingPatternRule,
  fromDate: Date,
  timeZone: string,
  adjustForDst: boolean,
  count: number = 1
): Date[] {
  // Generates next 'count' dates for a single rule (e.g., nth_day_of_month)
  // Apply DST handling if adjustForDst is true
}

// Validate if a meeting pattern is properly configured
function validateMeetingPattern(pattern: DivisionMeeting): boolean {
  // Validate pattern configuration based on type, including all rules in a rotating pattern
}

// Generate iCalendar data for a set of meeting occurrences
function generateICalendarData(occurrences: MeetingOccurrence[], meetingPattern: DivisionMeeting): string {
  // Generate iCalendar format (.ics) content for the provided occurrences,
  // attempting to create a recurring event series if possible based on the pattern.
}

// Check if DST transitions will occur in the next month
function checkUpcomingDstTransitions(timeZone: string): { isDstTransitionSoon: boolean; transitionDate?: Date } {
  // Check if a DST transition will occur in the next 30 days
  // Return information to highlight the DST adjustment checkbox if a transition is approaching
}
```

## User Flow Diagram

1. **Admin Flow:**

   - Navigate to Division Management
   - Select "Meetings" tab
   - View/Edit `division_meetings` schedule pattern
   - Configure "Adjust for Daylight Saving Time" setting (with visual highlight when DST changes are approaching)
   - If pattern changes, confirm deletion/regeneration of future `meeting_occurrences`
   - View list of upcoming `meeting_occurrences`; manually override specific occurrence details (date, time, location, agenda) or cancel an occurrence if needed.
   - Review visual calendar preview to confirm dates of `meeting_occurrences`.
   - Update `division_meetings.default_agenda` or specific `meeting_occurrences.agenda`.
   - Generate PDF exports of meeting minutes or schedules

2. **Member Flow:**
   - Navigate to Division page
   - Select "Meetings" section
   - View details of the next upcoming `meeting_occurrence` (auto-calculated/retrieved).
   - Add specific `meeting_occurrences` to personal calendar.
   - Read next meeting agenda
   - View and search past meeting minutes with pagination
   - Generate PDF exports of meeting minutes
   - Set notification preferences in profile (all default to disabled)

## Next Steps and Future Enhancements

1. Implement attendance tracking functionality:
   - Create meeting_attendance table
   - Develop attendance reporting and analytics
2. Enhance calendar integration:
   - Recurring event support
   - Calendar subscription links (live updating)
3. Enhance notification features:
   - Additional notification timing options
   - Custom notification messages
4. Add RSVP functionality:
   - Allow members to indicate attendance intention
   - Generate reports of expected attendance
5. Automatic archiving:
   - Rules-based archiving of old meeting minutes

## Questions Addressed

1. **Time Zone Handling**: The system will include a checkbox for "Adjust for Daylight Saving Time" with visual highlighting when DST changes are approaching. This will allow admins to decide whether meeting times should stay consistent in local time across DST transitions.

2. **Mobile-Specific UI**: The UI will adapt to mobile and web platforms, with manual testing to be performed by the client.

3. **Offline Support**: Not required for the initial implementation.

4. **Test Data Generation**: The client will handle manual testing.

5. **Maximum Meeting Occurrences**: Limited to the next 12 months.

6. **Migration History**: Each database change will include specific migration names following the naming convention in the implementation phases.

7. **Calendar Subscription Links**: Focusing on one-time calendar exports rather than subscription links.

8. **Performance for Large Divisions**: Pagination will be implemented for meeting minutes lists to handle large divisions efficiently.

9. **Default Notification Settings**: All meeting notifications will default to disabled.

10. **PDF Export**: PDF export will be implemented for both web (using makepdf) and mobile (using expo-print/expo-sharing) platforms, following the pattern used in TimeOffManager.tsx.

### Division Layout Updates for Meetings Route

```typescript
// Updates needed for app/(division)/_layout.tsx

export default function DivisionLayout() {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  return (
    <LayoutWithAppHeader>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: Colors[colorScheme].background,
          },
          headerTintColor: Colors[colorScheme].text,
          headerTitleStyle: {
            fontFamily: "Inter",
          },
          headerShadowVisible: false,
        }}
      >
        {/* Existing routes */}
        <Stack.Screen
          name="index"
          options={{
            title: "My Division",
          }}
        />
        <Stack.Screen
          name="[divisionName]/index"
          options={{
            title: "Division Details",
            headerTitle: ({ children }) => {
              const title = String(children).replace("Division ", "");
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Division {title}</ThemedText>;
            },
          }}
        />

        {/* New meetings route */}
        <Stack.Screen
          name="[divisionName]/meetings"
          options={{
            title: "Division Meetings",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Meetings</ThemedText>;
            },
          }}
        />

        {/* Other existing routes */}
        <Stack.Screen
          name="[divisionName]/members"
          options={{
            title: "Division Members",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Members</ThemedText>;
            },
          }}
        />
        <Stack.Screen
          name="[divisionName]/officers"
          options={{
            title: "Division Officers",
            headerTitle: ({ children }) => {
              return <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>Officers</ThemedText>;
            },
          }}
        />
      </Stack>
    </LayoutWithAppHeader>
  );
}
```

This update will add the meetings route to the division Stack navigator, making it accessible from the division details page. The route will use the division name parameter from the URL to load the appropriate meeting data for that division.

### Division Index Page Updates for Meetings Navigation

```typescript
// Updates needed for app/(division)/[divisionName]/index.tsx

export default function DivisionDetailsPage() {
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;
  const router = useRouter();
  const { session, member } = useAuth();

  // Navigation to different division sections
  const navigateToMeetings = () => {
    router.push(`/division/${divisionName}/meetings`);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Division header and general information */}
      <ThemedView style={styles.section}>
        <ThemedText type="title">{divisionName} Division</ThemedText>
        {/* Division general information */}
      </ThemedView>

      {/* Navigation cards for different division sections */}
      <ThemedView style={styles.navSection}>
        <ThemedText style={styles.sectionTitle}>Division Resources</ThemedText>

        <View style={styles.cardsContainer}>
          {/* Existing navigation cards */}

          {/* New Meetings card */}
          <TouchableOpacity style={styles.card} onPress={navigateToMeetings}>
            <View style={styles.cardIconContainer}>
              <Ionicons name="calendar" size={24} color={Colors[colorScheme].tint} />
            </View>
            <ThemedText style={styles.cardTitle}>Meetings</ThemedText>
            <ThemedText style={styles.cardDescription}>
              View upcoming meetings, agendas, and past meeting minutes
            </ThemedText>
            <View style={styles.cardAction}>
              <ThemedText style={styles.cardActionText}>View</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={Colors[colorScheme].tint} />
            </View>
          </TouchableOpacity>

          {/* Other navigation cards */}
        </View>
      </ThemedView>

      {/* Rest of division page content */}
    </ScrollView>
  );
}
```

This update will add a new card to the division details page that links to the meetings page. The card will include an icon, title, and description to clearly communicate the purpose of the page. When tapped, it will navigate to the meetings page for the current division.

## Phase 5 Implementation Summary

The Phase 5 updates to the Division Meetings feature focus on creating a comprehensive user-facing view that will allow regular division members to access meeting information, view upcoming meetings, and browse past meeting minutes. Key components of this phase include:

1. Creating a new route at `app/(division)/[divisionName]/meetings.tsx` that will serve as the main entry point for users to view meetings.

2. Updating the `app/(division)/_layout.tsx` file to include this new route in the Stack navigation structure.

3. Adding a navigation card to the division index page that will direct users to the meetings page.

4. Implementing several specialized components for the meetings page:

   - An upcoming meeting display with countdown timer
   - A meetings calendar with toggle between list and grid views
   - A minutes browser with search and filter capabilities
   - A structured minutes reader with collapsible sections

5. Ensuring the UI is fully responsive for both mobile and web platforms, with special considerations for mobile usability.

6. Providing initial calendar integration features to allow users to add meetings to their personal calendars.

7. Adding PDF export capabilities for meeting minutes and schedules.

This phase builds on the foundation established in earlier phases, utilizing the same data structures and store functionality, but presenting the information in a more user-friendly format appropriate for regular members rather than administrators.
