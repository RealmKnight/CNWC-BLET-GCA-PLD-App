# Vacation Calendar Implementation Plan

## Overview

Implementation of a vacation calendar view that will share screen space with the existing PLD/SDV calendar. The vacation calendar will display weekly allotments and requests, with a simplified view showing availability status for entire weeks.

## Database Structure

### Vacation Allotments Table

- Key fields:
  - `id`: UUID (Primary Key)
  - `calendar_id`: UUID (Links to calendars table)
  - `week_start_date`: DATE (Start of the week, always Monday)
  - `max_allotment`: INTEGER (Maximum slots for the week)
  - `current_requests`: INTEGER (Current number of requests)
  - `vac_year`: INTEGER (Year the vacation week belongs to)

### Vacation Requests Table

- Key fields:
  - `id`: UUID (Primary Key)
  - `calendar_id`: UUID (Links to calendars table)
  - `pin_number`: BIGINT (Links to members table)
  - `start_date`: DATE (Always Monday)
  - `end_date`: DATE (Always Sunday)
  - `status`: ENUM (pending, approved, denied)
  - Various metadata and tracking fields

## Implementation Phases

### Phase 1: Store Enhancement

1. Create VacationCalendarStore
   - Shared functionality with CalendarStore:
     - Calendar ID management
     - Basic date utilities
     - Error handling patterns
   - Vacation-specific state:
     - Weekly allotments by year
     - Vacation requests by week
     - Selected vacation week
   - Data fetching methods:
     - Initial year load with pagination
     - Next year pre-fetching
     - Week-based data grouping
   - Realtime subscriptions (initialize with PLD/SDV)

### Phase 2: UI Components

1. Create VacationCalendar Component

   - Weekly block display (enforced Mon-Sun)
   - Two-color legend (Available/Full)
   - Week selection handling
   - Custom styling for week blocks
   - Year-end week handling:
     - Display in starting year's view
     - Clear visual indication of year overlap
   - Date picker for navigation:
     - Similar to PLD/SDV calendar
     - Month/year selection
     - Reset button to clear selection
   - Week selection:
     - Any day click selects entire week
     - Visual feedback for selected week
     - Clear indication of week boundaries

2. Calendar Tab Navigation

   - Styled tabs at the top:
     - PLD/SDV Calendar
     - Vacation Calendar
   - Active calendar indication
   - State preservation when switching
   - Optional date synchronization:
     - Attempt to maintain visible month when switching
     - Graceful fallback if date invalid in other calendar
     - Preserve individual selections

3. Vacation Week Dialog
   - Display-only version of request dialog
   - Show for selected week:
     - Week dates (Mon-Sun)
     - Total slots for week
     - Remaining available slots
     - Current requests (approved only):
       - Member first name
       - Member last name
       - PIN number
       - Spot number (based on entry order)
     - Sort by spot number (maintain entry order)
   - Accessible by clicking any day in week

### Phase 3: Data Integration

1. Data Loading Strategy

   - Rolling window load:
     - Current month ± 2 months
     - Update window on month navigation
     - Check for next year allotments
   - Next year handling:
     - Check for allotment existence
     - Enable/disable navigation accordingly
     - Load data progressively as user navigates
   - Cache management:
     - Maintain 5-month rolling window
     - Cache next year allotment availability status
     - Clear data outside window except allotment flags

2. Realtime Updates
   - Subscribe to vacation allotment changes:
     - Week availability updates
     - Max allotment changes
   - Subscribe to vacation request changes:
     - New requests
     - Status changes
     - Request cancellations
   - Immediate UI updates on changes

## Technical Considerations

### State Management

- VacationCalendarStore:
  - Independent state for vacation calendar
  - Shared utilities with CalendarStore
  - Clean separation of concerns
- Separate selected dates:
  - PLD/SDV date selection
  - Vacation week selection
  - Persist both when switching views
- Member identification:
  - Primary key: members.pin_number
  - Foreign key: members.id -> auth.users.id
  - Consistent member reference handling

### UI/UX Design

- Monday-start calendar layout
- Full-week block coloring:
  - Green: Available slots
  - Red: Full week
- Clear visual distinction between calendar types
- Consistent styling with existing calendar
- Year transition handling:
  - Clear indication of year-end weeks
  - Smooth transition to next year's view
- Calendar Navigation:
  - Allow navigation to any week in current year
  - Next year navigation rules:
    - Enable if allotments exist
    - Disable if no allotments set up
    - Clear visual indication of available range
  - Date picker:
    - Enable/disable based on allotment availability
    - Visual feedback for unavailable periods
    - Reset button to clear selection

### Performance

- Efficient data loading:
  - Progressive loading for current year
  - Strategic pre-fetching for next year
  - Cleanup of old data
- Optimized realtime subscription handling:
  - Shared subscription initialization
  - Efficient update processing
- Memoization strategy:
  - Week availability calculations
  - Request grouping by week
  - Dialog data preparation

### Error Handling

- Network failures:
  - Retry button for failed data loads
  - Cached data display when possible
  - Clear error messages
- Data consistency:
  - Validate week boundaries (Mon-Sun)
  - Handle missing or invalid data gracefully
  - Realtime update conflict resolution

### UI/UX Improvements

- Week Selection:
  - Highlight entire week on hover
  - Click anywhere in week to view details
  - Clear visual feedback for selected week
- Navigation:
  - Date picker for quick navigation
  - Reset button to clear selection
  - Smooth transitions between months/years

## Implementation Order

1. VacationCalendarStore setup
2. Basic UI components
3. Data fetching implementation
4. Tab navigation
5. Week dialog
6. Realtime updates
7. Performance optimization
8. Testing and refinement

## Questions to Resolve

1. Tab styling specifics:
   - Color scheme
   - Active/inactive states
   - Transition animations
2. Week dialog layout:
   - Information density
   - Sorting options
3. Error handling:
   - Network failures
   - Data inconsistencies
4. Loading states:
   - Progressive loading indicators
   - Transition animations
