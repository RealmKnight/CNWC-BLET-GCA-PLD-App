# Division Meetings Feature Implementation Plan

## Overview

This document outlines the plan for implementing the Division Meetings feature in the PLD App. This feature will allow division administrators to manage meeting schedules, locations, and agendas for their divisions, while also providing division members with information about upcoming meetings.

## Table Schema

### New Table: `division_meetings`

- `id` (UUID, Primary Key): Unique identifier for the meeting
- `division_id` (Integer, Foreign Key): References divisions.id
- `meeting_type` (Text): Type of meeting (e.g., 'regular', 'special', 'committee')
- `location_name` (Text): Name of the meeting location
- `location_address` (Text): Full address of the meeting location
- `meeting_time` (Time): Time when meetings start
- `meeting_pattern_type` (Text): Type of meeting pattern ('day_of_month', 'nth_day_of_month', 'specific_date', 'rotating')
- `meeting_pattern` (JSONB): JSON object storing complex meeting pattern data:

  ```json
  {
    "day_of_week": 4, // 0=Sunday, 1=Monday, etc. (for nth_day_of_month)
    "week_of_month": 2, // 1=first, 2=second, etc. (for nth_day_of_month)
    "day_of_month": 15, // For day_of_month pattern
    "specific_dates": ["2023-12-15"], // For specific_date pattern
    "rotating_schedule": [
      // For rotating pattern
      { "date": "2023-12-15", "time": "13:00:00" },
      { "date": "2024-01-15", "time": "19:00:00" }
    ]
  }
  ```

- `meeting_frequency` (Text): How often meetings occur (e.g., 'weekly', 'monthly', 'bi-weekly')
- `meeting_notes` (Text): Additional information about the meeting
- `time_zone` (Text): Time zone for the meeting (e.g., 'America/Chicago')
- `next_meeting_date` (Date): Date of the next scheduled meeting (auto-calculated)
- `next_meeting_time` (Time): Time of the next scheduled meeting (auto-calculated)
- `next_meeting_agenda` (Text): Agenda for the next meeting
- `is_active` (Boolean): Whether this meeting is currently active
- `created_at` (Timestamp): When the record was created
- `updated_at` (Timestamp): When the record was last updated
- `created_by` (UUID): User who created the record
- `updated_by` (UUID): User who last updated the record

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
    ]
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
- `notify_week_before` (Boolean): Send notification 1 week before meeting
- `notify_day_before` (Boolean): Send notification 1 day before meeting
- `notify_hour_before` (Boolean): Send notification 1 hour before meeting
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

### Phase 1: Database Setup

1. Create the `division_meetings` table with JSONB type for complex meeting patterns
2. Create the `meeting_minutes` table with JSONB for structured content and full-text search indexes
3. Create the `meeting_notification_preferences` table
4. Set up Row Level Security (RLS) policies to ensure:
   - Only division admins can create/update meeting info for their division
   - All members of a division can view meeting information
   - Only division admins can create/update meeting minutes
   - Only division admins can approve meeting minutes
   - Only division admins can archive meeting minutes
   - All members can view approved meeting minutes
5. Create database triggers to:
   - Auto-update the `updated_at` field
   - Automatically calculate the next meeting date/time based on pattern
6. Add indexes for performance:
   - Full-text search index on meeting_minutes.content
   - Index on division_meetings.division_id
   - Index on division_meetings.next_meeting_date
   - Index on meeting_minutes.meeting_date

### Phase 2: UI Component Development - Admin Interface

1. Create a new `DivisionMeetings.tsx` component under `components/admin/division/`
2. Implement the component with the following features:
   - Meeting Schedule Management section:
     - Advanced form for editing complex meeting patterns
     - Support for multiple pattern types (nth day of month, specific date, rotating)
     - Time zone selection
     - **Visual calendar preview** showing next few calculated meeting dates
     - Pattern visualization to confirm correct scheduling
     - Preview of next several meeting dates based on pattern
   - Meeting Agenda Management section:
     - Editor for creating/updating the next meeting's agenda
   - Meeting Minutes Management section:
     - Interface for entering meeting minutes with structured format following Robert's Rules
     - Structured editor with sections for motions, votes, reports, etc.
     - Ability to add custom sections as needed
     - List of past meeting minutes with search/filter capabilities
     - Manual archiving functionality for old minutes
     - Approval workflow for minutes (any division admin can approve)
     - Attendance recording interface
3. Create utility functions for:
   - Calculating next meeting dates based on pattern
   - Validating meeting patterns
   - Handling time zone conversions
   - Generating calendar export files (iCal format)
4. Ensure responsive design for both mobile and web interfaces
5. Implement loading states and error handling

### Phase 3: State Management

1. Create a new store or extend existing store for managing meeting data
2. Implement Zustand store functions for:
   - Fetching division meetings
   - Creating new meeting records with complex patterns
   - Updating existing meeting records
   - Managing meeting minutes with structured content
   - Searching and filtering meeting minutes
   - Archiving meeting minutes
   - Recording meeting attendance
   - Exporting meeting calendar
   - Error handling and loading states
3. Set up Supabase realtime subscriptions for live updates
4. Implement caching strategy for performance

### Phase 4: Integration with Notification System

1. Update user preferences in profile page to add meeting-specific notification options:
   - Add section for "Meeting Notifications" with checkboxes:
     - Notify 1 week before meeting
     - Notify 1 day before meeting
     - Notify 1 hour before meeting
2. Integrate with existing notification service:
   - Create notification triggers for upcoming meetings
   - Configure notification content and timing based on user preferences
   - Respect user's selected notification method (in-app, push, email, SMS)
3. Implement background job to:
   - Calculate upcoming meetings
   - Identify members who need notifications based on their preferences
   - Queue notifications for delivery at appropriate times

### Phase 5: Calendar Integration

1. Implement calendar export functionality:
   - Generate iCalendar (.ics) files for meeting schedules
   - Create "Add to Calendar" button for individual meetings
   - Support for Google Calendar, Outlook, and Apple Calendar
2. Create QR code generator for mobile users to easily add meetings to their calendar

### Phase 6: User-Facing View Implementation

1. Create a new `app/(division)/[divisionName]/meetings.tsx` file for the user-facing meetings view
2. Implement the component with the following features:
   - Display upcoming meeting information (date, time, location)
   - Show meeting agenda for upcoming meetings
   - "Add to Calendar" button for each meeting
   - Access to past meeting minutes with search/filter capabilities
   - View for reading structured meeting minutes in a user-friendly format
   - Future: View of past attendance
3. Implement a search interface for meeting minutes:
   - Full-text search by content
   - Filter by date range
   - Sort by recency or relevance
4. Ensure proper responsive design and accessibility

### Phase 7: Integration with DivisionManagement

1. Update the "meetings" case in the `renderContent` function of DivisionManagement.tsx
2. Replace the placeholder with the new DivisionMeetings component
3. Pass required props (division, permissions, etc.)

### Phase 8: Testing

1. Develop unit tests for new components
2. Test complex meeting pattern calculations:
   - Test various pattern types
   - Test edge cases (leap years, month transitions, etc.)
   - Test time zone handling
3. Verify permissions work correctly
4. Test search and filtering functionality for meeting minutes
5. Test notification scheduling and delivery
6. Test calendar export functionality
7. Test responsive design on various screen sizes
8. Test on both web and mobile platforms
9. Verify realtime updates work when multiple users are viewing/editing

### Phase 9: Documentation and Deployment

1. Document the new feature for other developers
2. Create documentation on:
   - How to set up complex meeting patterns
   - Meeting minutes workflow following Robert's Rules
   - How to use the structured minutes editor
   - Calendar export features
   - Notification system integration
3. Update user documentation if necessary
4. Prepare for deployment

## Component Structures

### DivisionMeetings Component (Admin)

```typescript
interface DivisionMeetingsProps {
  division: string;
  isAdmin?: boolean;
}

export function DivisionMeetings({ division, isAdmin = false }: DivisionMeetingsProps) {
  // Component implementation with tabs/sections for:
  // - Meeting Schedule Management (with complex pattern support and calendar visualization)
  // - Meeting Agenda Management
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
  // - Pattern configuration based on selected type
  // - Pattern validation
  // - Visual calendar preview showing next few calculated meeting dates
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
export default function MeetingsPage() {
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;

  // Component implementation to display:
  // - Upcoming meeting details
  // - Meeting agenda
  // - "Add to Calendar" functionality
  // - Past meeting minutes with search/filter
  // - Structured minutes reader
}
```

### State Management

```typescript
interface DivisionMeetingStore {
  // Data
  meetings: Record<string, DivisionMeeting[]>;
  meetingMinutes: Record<string, MeetingMinute[]>;
  selectedMeetingId: string | null;
  filteredMinutes: MeetingMinute[];
  searchTerm: string;
  dateRangeFilter: { start: Date | null; end: Date | null };
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDivisionMeetings: (divisionId: string) => Promise<void>;
  createMeeting: (meeting: Partial<DivisionMeeting>) => Promise<void>;
  updateMeeting: (id: string, meeting: Partial<DivisionMeeting>) => Promise<void>;
  fetchMeetingMinutes: (meetingId: string) => Promise<void>;
  searchMeetingMinutes: (searchTerm: string, dateRange?: { start: Date; end: Date }) => void;
  createMeetingMinutes: (minutes: Partial<MeetingMinute>) => Promise<void>;
  updateMeetingMinutes: (id: string, minutes: Partial<MeetingMinute>) => Promise<void>;
  approveMeetingMinutes: (id: string) => Promise<void>;
  archiveMeetingMinutes: (id: string) => Promise<void>;
  recordAttendance: (meetingId: string, memberId: string, status: string) => Promise<void>;
  exportCalendar: (meetingId?: string) => Promise<string>; // Returns URL to iCal file
}
```

## Meeting Date Calculation Utilities

```typescript
// Calculate the next meeting date based on a complex pattern
function calculateNextMeetingDate(pattern: MeetingPattern, fromDate: Date = new Date()): Date {
  // Logic to calculate next meeting date based on pattern type:
  // - For day_of_month: Find next occurrence of that day
  // - For nth_day_of_month: Find next occurrence of specified day (e.g., 2nd Thursday)
  // - For specific_dates: Find next date in array that's after fromDate
  // - For rotating: Find next entry in rotating schedule
}

// Generate a series of upcoming meeting dates
function generateUpcomingMeetingDates(pattern: MeetingPattern, count: number = 5): Date[] {
  // Generate the next 'count' meeting dates using calculateNextMeetingDate
}

// Validate if a meeting pattern is properly configured
function validateMeetingPattern(pattern: MeetingPattern): boolean {
  // Validate pattern configuration based on type
}

// Generate iCalendar data for meetings
function generateICalendarData(meetings: DivisionMeeting[]): string {
  // Generate iCalendar format (.ics) content for the provided meetings
}
```

## User Flow Diagram

1. **Admin Flow:**

   - Navigate to Division Management
   - Select "Meetings" tab
   - View/Edit meeting schedule with complex pattern configuration
   - Review visual calendar preview to confirm dates
   - Update next meeting agenda
   - Enter and approve meeting minutes using structured editor
   - Record attendance for meetings
   - Search/filter past meeting minutes
   - Manually archive old meeting minutes when needed

2. **Member Flow:**
   - Navigate to Division page
   - Select "Meetings" section
   - View upcoming meeting details (auto-calculated)
   - Add meetings to personal calendar
   - Read next meeting agenda
   - View and search past meeting minutes
   - Set notification preferences in profile

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

## Questions for Further Clarification

1. How far in advance should meeting notifications be sent to members?
2. Should the system automatically calculate the next meeting date based on frequency?
3. Who has permission to approve meeting minutes? Just the meeting creator or any division admin?
4. Is there any specific information about members that must be tracked in attendance records?
5. Are there any statutory requirements for meetings that need to be enforced in the system?
