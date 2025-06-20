# Waitlist Management Feature Plan

## Overview

Add a new "Manage Waitlist(s)" tab to the PldSdvManager component that allows division admins to re-order requests for a given date, particularly to correct waitlist ordering issues that occur during calendar imports.

## Requirements

- **Platform**: Web only (due to screen size constraints)
- **User Role**: Division admin
- **Primary Function**: Re-order requests for a specific date including waitlist items
- **Problem Solved**: Correct waitlist ordering when over-allocation occurs during calendar imports

## Initial Questions for Clarification

1. What determines the current ordering of requests (e.g., submission time, priority, seniority)?
2. Are there any business rules for request ordering that should be enforced?
3. Should the reordering affect all requests for the date or just waitlisted ones?
4. What visual indicators should show waitlist vs. approved requests?
5. Should there be any confirmation/audit trail when reordering?

## Technical Research Findings

- [x] **Current request schema and waitlist status handling**
  - `pld_sdv_requests` table has `waitlist_position` (integer, nullable)
  - Status values: pending, approved, denied, waitlisted, cancellation_pending, cancelled, transferred
  - Waitlist position is 1-based numeric value
- [x] **Existing date picker implementations in the app**
  - `DatePicker` component exists with cross-platform support
  - `ClientOnlyDatePicker` for SSR safety
  - Used in multiple places: calendar, modals, member forms
- [x] **Current styling/theming patterns**
  - `Colors[colorScheme]` pattern for theming
  - `ThemedView`, `ThemedText`, `ThemedTouchableOpacity` components
  - Platform-specific styling with `Platform.select`
  - Responsive design with `useWindowDimensions`
- [x] **Request ordering logic**
  - Requests sorted by: status priority → waitlist_position → requested_at
  - Waitlist positions are managed during imports and admin actions
- [x] **Drag-and-drop capabilities**
  - `@dnd-kit/sortable` already installed for web
  - `OverAllotmentReview` component has existing drag-and-drop implementation
  - Web-only restriction already established in other components

## Planned Implementation

### 1. Component Structure

- **New tab in PldSdvManager**: "Manage Waitlist(s)" (web-only)
- **New component**: `ManageWaitlistComponent.tsx`
- **Platform check**: Display web-only message on mobile (similar to `OverAllotmentReview`)
- **Props interface**: `selectedDivision`, `selectedCalendarId`, `onCalendarChange`

### 2. UI Components & Layout

#### Date Selection Section

- Use existing `DatePicker` component for consistency
- Calendar selector (reuse `CalendarSelector` from existing components)
- Clear visual hierarchy with section headers

#### Request Display & Management

- **Unified list view** showing all requests for selected date in priority order
- **Position-based display**: Position 1, 2, 3... with visual cutoff at allocation limit
- Columns: Position, Member Name, Leave Type, Current Status, Drag Handle
- **Drag-and-drop reordering** using `@dnd-kit/sortable` (web-only)
- **Dynamic status calculation**:
  - Positions 1-{allocation} = Approved (green badges)
  - Positions {allocation+1}+ = Waitlisted (orange badges)
  - Real-time recalculation during drag operations
- **Visual indicators**:
  - Clear divider line at allocation cutoff
  - Drag handles for reordering
  - Highlight changes from original positions

#### Controls & Actions

- **Allocation Override**: Input field next to current allocation display for temporary session-only increases
- **Save Changes** button with confirmation dialog
- **Cancel/Reset** button (revert to original order)
- **Undo** button (after saving, revert to previous state)
- Loading states during operations

### 3. Data Flow & State Management

#### Fetching Data

```typescript
// Fetch all requests for selected date and calendar
const fetchRequestsForDate = async (calendarId: string, date: string) => {
  // Query pld_sdv_requests with member details
  // Order by current logic: status → waitlist_position → requested_at
};
```

#### State Structure

```typescript
interface WaitlistManagementState {
  selectedDate: Date | null;
  allocationLimit: number;
  allocationOverride: number | null;
  originalRequests: PldSdvRequestWithPosition[];
  currentRequests: PldSdvRequestWithPosition[];
  savedRequests: PldSdvRequestWithPosition[] | null; // For undo functionality
  hasChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  showConfirmDialog: boolean;
  changesSummary: ChangesSummary | null;
}

interface PldSdvRequestWithPosition {
  ...PldSdvRequest;
  position: number;
  calculatedStatus: 'approved' | 'waitlisted';
  hasChanged: boolean;
}

interface ChangesSummary {
  statusChanges: Array<{
    memberName: string;
    oldStatus: string;
    newStatus: string;
    oldPosition: number;
    newPosition: number;
  }>;
  positionChanges: Array<{
    memberName: string;
    oldPosition: number;
    newPosition: number;
  }>;
}
```

#### Reordering Logic

- **Unified position system**: All requests in single array with positions 1, 2, 3...
- **Dynamic status calculation**:

  ```typescript
  const effectiveLimit = allocationOverride || allocationLimit;
  const calculatedStatus = position <= effectiveLimit ? "approved" : "waitlisted";
  ```

- **Real-time recalculation** during drag operations
- **Change tracking**: Compare current vs original positions and statuses
- **Visual feedback**: Highlight items that have moved or changed status

### 4. Database Operations

#### Update Positions and Status

```sql
-- Batch update positions, status, and waitlist positions
UPDATE pld_sdv_requests
SET
  status = $2,
  waitlist_position = CASE
    WHEN $2 = 'waitlisted' THEN $3
    ELSE NULL
  END,
  updated_at = NOW(),
  metadata = metadata || $4::jsonb
WHERE id = $1;
```

#### Confirmation Dialog Data

```typescript
// Before saving, generate changes summary
const generateChangesSummary = (original: PldSdvRequestWithPosition[], current: PldSdvRequestWithPosition[]) => {
  const statusChanges = [];
  const positionChanges = [];

  current.forEach((currentReq, index) => {
    const originalReq = original.find((r) => r.id === currentReq.id);
    if (originalReq) {
      if (originalReq.status !== currentReq.calculatedStatus) {
        statusChanges.push({
          memberName: `${currentReq.member.first_name} ${currentReq.member.last_name}`,
          oldStatus: originalReq.status,
          newStatus: currentReq.calculatedStatus,
          oldPosition: originalReq.position,
          newPosition: currentReq.position,
        });
      } else if (originalReq.position !== currentReq.position) {
        positionChanges.push({
          memberName: `${currentReq.member.first_name} ${currentReq.member.last_name}`,
          oldPosition: originalReq.position,
          newPosition: currentReq.position,
        });
      }
    }
  });

  return { statusChanges, positionChanges };
};
```

#### Audit Trail

- Track changes in `metadata` jsonb field:

  ```json
  {
    "waitlist_reorder": {
      "timestamp": "2024-12-XX",
      "admin_user_id": "uuid",
      "changes": {
        "old_position": 3,
        "new_position": 1,
        "old_status": "waitlisted",
        "new_status": "approved"
      }
    }
  }
  ```

### 5. Integration Points

#### Tab Implementation

- Add new tab to PldSdvManager's tab system
- Use existing tab styling and responsive behavior
- Show "Manage Waitlists" icon and label

#### Consistent Styling

- Reuse existing `getStyles()` pattern
- Follow established color scheme usage
- Maintain responsive design principles

## Requirements Clarification ✅

**1. Reordering Scope**: Full unified drag-and-drop reordering

- All requests shown in single list with positions 1, 2, 3, etc.
- Position determines approval status based on allocation limit
- Example: 5 allocations = positions 1-5 approved, 6+ waitlisted
- Dragging recalculates all positions and statuses dynamically

**2. Business Rules**:

- Allocations determine max approved requests per date
- Admin can override allocation limits when needed
- No other constraints on reordering

**3. Audit Requirements**: Simple log of changes in metadata

**4. Integration**: Standalone system for selected date only

**5. User Experience**:

- Confirmation dialog showing summary of changes before saving
- Undo functionality available
- Real-time visual feedback during drag operations

## Implementation Tasks

### Phase 1: Core Component Setup ✅

- [x] Create `ManageWaitlistComponent.tsx`
- [x] Add new tab to `PldSdvManager`
- [x] Implement basic date/calendar selection
- [x] Add web-only platform check

### Phase 2: Data Layer ✅

- [x] Create unified request fetching with position calculation
- [x] Implement dynamic status calculation logic
- [x] Build changes detection and summary generation
- [x] Add batch database update functions
- [x] Create audit trail system in metadata

### Phase 3: Core Functionality ✅

- [x] Build unified request display list with position indicators
- [x] Implement `@dnd-kit` drag-and-drop with real-time recalculation
- [x] Add allocation limit display and override input
- [x] Create visual divider at allocation cutoff
- [x] Add change highlighting (moved/status changed items)

### Phase 4: User Experience ✅

- [x] Build confirmation dialog with changes summary
- [x] Implement undo functionality (revert to previous state)
- [x] Add save/cancel/reset controls with proper state management
- [x] Implement sequential database updates with retry mechanism
- [x] Add admin error messaging for failed operations
- [x] Add real-time highlighting of affected items during drag operations

### Phase 5: Testing & Polish

- [ ] Test complex reordering scenarios
- [ ] Verify database updates and audit trail
- [x] **Enhanced: Real-time allocation override with visual feedback**
- [ ] Test undo/redo functionality

### Phase 4.5: Real-Time Allocation Updates ✅

**Enhancement Added**: Allocation override changes now provide **instant visual feedback**

- [x] **Real-time status recalculation** when allocation limit changes
- [x] **Visual status badges update immediately** (approved ↔ waitlisted)
- [x] **Change tracking** updates to reflect allocation-driven status changes
- [x] **Clear feedback** showing which requests would be affected by allocation changes

---

## Implementation Complete! 🎉

**Phases 1-4 have been successfully implemented:**

### Key Features Delivered

1. **New "Manage Waitlist(s)" Tab**: Added to PldSdvManager with web-only access
2. **Unified Drag-and-Drop System**: Single list with positions 1, 2, 3... where position determines approval status
3. **Real-Time Status Calculation**: Dynamic recalculation during drag operations
4. **Allocation Override**: Session-based input field for temporary limit increases
5. **Comprehensive Change Tracking**: Detailed detection of position and status changes
6. **Confirmation Dialog**: Shows summary of all changes before saving with undo option
7. **Sequential Database Updates**: With retry mechanism and error handling
8. **Audit Trail**: Full change history stored in metadata
9. **Consistent Styling**: Matches app theme and responsive design patterns

### Files Modified

- ✅ `components/admin/division/ManageWaitlistComponent.tsx` (NEW)
- ✅ `components/admin/division/PldSdvManager.tsx` (UPDATED)
- ✅ `package.json` (UPDATED - added @dnd-kit dependencies)

### Ready for Phase 5: Testing & Manual Review

- [ ] Verify responsive design and web-only restrictions

## Final Implementation Details ✅

**1. Allocation Override UI**:

- Input field next to current allocation display
- Temporary session-only override (resets when changing dates)

**2. Undo Functionality**:

- Session-only scope (lost on page refresh)
- Single undo level to previous saved state

**3. Visual Feedback**:

- Highlight affected items in real-time during drag operations
- Show immediate status preview while dragging

**4. Error Handling Strategy**:

- Sequential database updates to avoid conflicts
- Retry mechanism on database errors
- Display error messages to admin for failed operations
- Minimal network issue handling (hardwired web connections assumed)

## Implementation Ready ✅

The plan is now complete with all requirements and technical details finalized!

## Next Steps

1. ✅ Research current codebase patterns
2. ✅ Detail implementation plan
3. ✅ **Clarify business requirements**
4. ✅ **Final implementation details confirmation**
5. 🚀 **Ready for implementation - awaiting "please proceed"**

## Key Features Summary

- **Unified drag-and-drop reordering** with real-time status calculation
- **Dynamic allocation management** with session-based override capability
- **Comprehensive change tracking** with confirmation dialog and undo
- **Visual feedback** highlighting affected items during operations
- **Robust error handling** with sequential updates and retry mechanisms
- **Web-only design** optimized for desktop admin use

---

_Created: December 2024_
_Updated: December 2024_
_Status: Ready for Implementation 🚀_
