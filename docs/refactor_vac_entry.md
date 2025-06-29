# Vacation Week Transfer Feature Implementation Plan

## Overview

Add vacation week transfer functionality to the RequestEntry component, allowing admins to move a member's approved vacation from one week to another available week.

## Database Analysis Summary

### Key Constraints & Triggers

- **`unique_pin_start_date`**: Prevents duplicate requests for same member/week
- **Date validation**: Ensures proper week structure (Monday-Sunday, 7 days)
- **Notification triggers**: Will automatically notify on status changes
- **Status options**: pending, approved, denied, cancelled, waitlisted

### Critical Database Considerations

- **Transaction Safety**: Use PostgreSQL RPC functions for atomicity
- **Constraint Handling**: Delete old + insert new (can't just update dates due to unique constraint)
- **Triggers**: Notification triggers will fire automatically
- **Allotment Tracking**: Update `vacation_allotments.current_requests` counts

---

## Phase 1: Database Operations (PostgreSQL RPC Functions) ✅ COMPLETE

### 1.1: Create Transfer RPC Function ✅

- [x] Create `transfer_vacation_week` PostgreSQL function
  - [x] Add function parameters validation
  - [x] Implement old request verification (exists + approved)
  - [x] Add new week availability check
  - [x] Implement atomic delete old + insert new pattern
  - [x] Add proper error handling and return JSON response
  - [x] Include metadata tracking for audit trail

### 1.2: Create Helper RPC Functions ✅

- [x] Create `get_member_approved_weeks` function
  - [x] Filter by pin_number, calendar_id, year
  - [x] Only return approved status requests
  - [x] Order by start_date
- [x] Create `get_available_weeks_for_transfer` function
  - [x] Filter by calendar_id and year
  - [x] Calculate available slots (max_allotment - current_requests)
  - [x] Exclude specified date if provided
  - [x] Only return weeks with available capacity

### 1.3: Test Database Functions ✅

- [x] Test `transfer_vacation_week` with valid parameters
- [x] Test error cases (non-existent request, no capacity, etc.)
- [x] Test helper functions return correct data
- [x] Verify triggers fire correctly after transfer
- [x] Confirm allotment counts update properly

**Phase 1 Completion Notes:**

- All three PostgreSQL RPC functions created successfully
- Comprehensive validation and error handling implemented
- Atomic transfer operations ensure data integrity
- Audit trail and metadata tracking included
- Functions tested with real database data
- Function signatures verified: `transfer_vacation_week()`, `get_member_approved_weeks()`, `get_available_weeks_for_transfer()`

---

## Phase 2: Store Extensions (adminMemberManagementStore.ts) ✅ COMPLETE

### 2.1: New Interfaces ✅

- [x] Add `ApprovedVacationWeek` interface
- [x] Add `AvailableTransferWeek` interface
- [x] Add `TransferVacationParams` interface

### 2.2: New State Properties ✅

- [x] Add `memberApprovedWeeks: Record<string, ApprovedVacationWeek[]>`
- [x] Add `availableTransferWeeks: Record<string, AvailableTransferWeek[]>`
- [x] Add `isLoadingApprovedWeeks: boolean`
- [x] Add `isLoadingAvailableWeeks: boolean`
- [x] Add `transferError: string | null`

### 2.3: New Methods - Interface Updates ✅

- [x] Add `fetchMemberApprovedWeeks` method signature
- [x] Add `fetchAvailableTransferWeeks` method signature
- [x] Add `transferVacationWeek` method signature
- [x] Add `clearTransferData` method signature

### 2.4: New Methods - Implementation ✅

- [x] Implement `fetchMemberApprovedWeeks`
  - [x] Call `get_member_approved_weeks` RPC
  - [x] Handle loading states
  - [x] Update store with results
  - [x] Handle errors properly
- [x] Implement `fetchAvailableTransferWeeks`
  - [x] Call `get_available_weeks_for_transfer` RPC
  - [x] Handle loading states
  - [x] Update store with results
  - [x] Handle errors properly
- [x] Implement `transferVacationWeek`
  - [x] Call `transfer_vacation_week` RPC
  - [x] Handle success/failure responses
  - [x] Refresh data after successful transfer
  - [x] Proper error handling and state updates
- [x] Implement `clearTransferData`
  - [x] Reset transfer-related state
  - [x] Clear error states

### 2.5: Store Testing ✅

- [x] Test store methods with mock data
- [x] Verify state updates correctly
- [x] Test error handling paths
- [x] Confirm data refreshes after transfer

**Phase 2 Completion Notes:**

- All new interfaces successfully added: `ApprovedVacationWeek`, `AvailableTransferWeek`, `TransferVacationParams`
- Store state extended with vacation week transfer properties and loading states
- All method signatures properly defined in the store interface
- Complete implementations following existing store patterns:
  - `fetchMemberApprovedWeeks()` - Calls Phase 1 RPC function with caching using calendar-pin-year keys
  - `fetchAvailableTransferWeeks()` - Calls Phase 1 RPC function with calendar-year caching
  - `transferVacationWeek()` - Calls Phase 1 RPC function with automatic data refresh after success
  - `clearTransferData()` - Resets all transfer-related state
- Comprehensive error handling and loading state management
- Automatic data refresh after successful transfers
- Console logging for debugging and monitoring

---

## Phase 3: UI Implementation (RequestEntry.tsx) ✅ COMPLETE

### 3.1: New State Variables ✅

- [x] Add `transferSelectedMemberPin` state
- [x] Add `transferCurrentWeek` state
- [x] Add `transferNewWeek` state
- [x] Add `transferSubmissionState` state
- [x] Add `transferError` state

### 3.2: Store Integration ✅

- [x] Import new store methods and state
- [x] Add store destructuring for transfer-related data
- [x] Integrate transfer error handling

### 3.3: Data Loading Effects ✅

- [x] Add effect for loading approved weeks when member selected
- [x] Add effect for loading available weeks when current week selected
- [x] Add cleanup effects for transfer data

### 3.4: Transfer Handler ✅

- [x] Implement `handleTransferSubmit` function
  - [x] Add form validation
  - [x] Call store transfer method
  - [x] Handle success/error states
  - [x] Show appropriate toast messages
  - [x] Reset form after successful transfer

### 3.5: UI Components - Transfer Section ✅

- [x] Add section divider with title
- [x] Add transfer member selector
  - [x] Web select element
  - [x] Native Picker component
  - [x] Same member list as new request section
- [x] Add current approved weeks selector
  - [x] Show only when member selected
  - [x] Display approved weeks for selected member
  - [x] Format dates user-friendly
- [x] Add available weeks selector
  - [x] Show only when current week selected
  - [x] Display available weeks (excluding current)
  - [x] Show available slots count
- [x] Add transfer submit button
  - [x] Proper disabled states
  - [x] Loading state handling
  - [x] Confirmation styling

### 3.6: Error Handling UI ✅

- [x] Add transfer error display
- [x] Style error messages consistently
- [x] Handle both local and store errors

### 3.7: Loading States ✅

- [x] Add loading indicators for approved weeks
- [x] Add loading indicators for available weeks
- [x] Disable form during loading
- [x] Proper loading state management

**Phase 3 Completion Notes:**

- All state variables successfully added for vacation week transfer functionality
- Complete store integration with proper destructuring of transfer-related methods and state
- Comprehensive data loading effects with automatic data fetching and form state management
- Robust transfer handler with complete form validation, error handling, and success flows
- Full UI implementation with consistent styling following existing app patterns:
  - Section divider with clear visual separation
  - Cross-platform member selector (web select + native Picker)
  - Progressive form revelation (current week selector shows after member selection)
  - Available weeks selector with capacity information display
  - Transfer submit button with proper disabled states and loading handling
- Complete error handling UI with both local and store error display
- Comprehensive loading states with ActivityIndicator components and proper form disabling
- Consistent theming and styling using existing app Colors and components
- Automatic data refresh after successful transfers
- Form reset and cleanup functionality

---

## Phase 4: Styling Updates

### 4.1: New Styles

- [ ] Add `sectionDivider` style
- [ ] Add `dividerLine` style
- [ ] Add `sectionTitle` style
- [ ] Add `transferButton` style
- [ ] Ensure consistent spacing and colors

### 4.2: Responsive Design

- [ ] Test on mobile devices
- [ ] Test on web browsers
- [ ] Ensure proper form layout
- [ ] Verify picker styling consistency

---

## Phase 5: Safety & Validation

### 5.1: Form Validation

- [ ] Validate all required fields selected
- [ ] Prevent transfer to same week
- [ ] Verify member has approved week
- [ ] Confirm target week has capacity

### 5.2: User Experience

- [ ] Add confirmation messaging
- [ ] Clear success/error feedback
- [ ] Intuitive form flow
- [ ] Proper form reset after operations

### 5.3: Error Boundaries

- [ ] Handle database errors gracefully
- [ ] Handle network connectivity issues
- [ ] Handle permission errors
- [ ] Handle concurrent modification conflicts

---

## Phase 6: Testing Strategy

### 6.1: Database Testing

- [ ] Test RPC functions with various scenarios
- [ ] Test constraint violations
- [ ] Test transaction rollbacks
- [ ] Test concurrent access scenarios

### 6.2: Store Testing

- [ ] Test store methods individually
- [ ] Test state management
- [ ] Test error propagation
- [ ] Test data refresh after operations

### 6.3: UI Testing

- [ ] Test form validation
- [ ] Test loading states
- [ ] Test error displays
- [ ] Test success flows

### 6.4: Integration Testing

- [ ] Test complete transfer flow
- [ ] Test with multiple members
- [ ] Test with different calendar configurations
- [ ] Test error recovery

### 6.5: Edge Case Testing

- [ ] Multiple admins transferring simultaneously
- [ ] Member with multiple approved weeks
- [ ] Week becomes unavailable during transfer
- [ ] Network interruptions during transfer

---

## Phase 7: Documentation & Cleanup

### 7.1: Code Documentation

- [ ] Add JSDoc comments to new functions
- [ ] Document RPC function parameters
- [ ] Add inline comments for complex logic
- [ ] Update component prop documentation

### 7.2: Testing Documentation

- [ ] Document test scenarios
- [ ] Create user testing guide
- [ ] Document known limitations
- [ ] Create troubleshooting guide

### 7.3: Final Review

- [ ] Code review for consistency
- [ ] Performance review
- [ ] Security review
- [ ] Accessibility review

---

## Implementation Notes

### Database Function Signatures

```sql
-- Main transfer function
transfer_vacation_week(
  p_pin_number BIGINT,
  p_old_start_date DATE,
  p_new_start_date DATE,
  p_calendar_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT DEFAULT 'Admin transfer'
) RETURNS JSON

-- Helper functions
get_member_approved_weeks(p_pin_number BIGINT, p_calendar_id UUID, p_year INTEGER)
get_available_weeks_for_transfer(p_calendar_id UUID, p_year INTEGER, p_exclude_start_date DATE DEFAULT NULL)
```

### Store Method Signatures

```typescript
fetchMemberApprovedWeeks(calendarId: string, pinNumber: number, year: number): Promise<void>
fetchAvailableTransferWeeks(calendarId: string, year: number, excludeDate?: string): Promise<void>
transferVacationWeek(params: TransferVacationParams): Promise<boolean>
clearTransferData(): void
```

### Key State Keys

- `memberApprovedWeeks`: `${calendarId}-${pinNumber}-${year}`
- `availableTransferWeeks`: `${calendarId}-${year}`

---

## Success Criteria

- [ ] Transfer functionality works without breaking existing features
- [ ] Database integrity maintained through all operations
- [ ] User-friendly interface with clear feedback
- [ ] Proper error handling and recovery
- [ ] Performance impact minimal
- [ ] All existing tests still pass
- [ ] New functionality thoroughly tested

---

## Rollback Plan

If issues arise during implementation:

1. Database changes can be rolled back by dropping the new RPC functions
2. Store changes are additive and can be disabled
3. UI changes are in separate section and can be hidden
4. No changes to existing vacation request flow

---

_Created: [Current Date]_
_Last Updated: [Current Date]_
