# App Initialization Update Plan

## Overview

This plan addresses the require cycle issues identified in the app initialization console logs and creates a centralized initialization system with single sources of truth for app initialization and realtime subscriptions.

## Identified Require Cycles

### 1. Store Cycles

- `store\calendarStore.ts ↔ store\timeStore.ts`

### 2. Notification Utility Cycles

- `utils\notificationConfig.ts ↔ utils\notificationService.ts`

### 3. Admin Component Cycles

- `app\company-admin\index.tsx → components\admin\pld-sdv\PldSdvSection.tsx → app\company-admin\index.tsx`
- `app\company-admin\index.tsx → components\admin\vacation\VacationSection.tsx → app\company-admin\index.tsx`
- `app\company-admin\index.tsx → components\admin\message\AdminMessageSection.tsx → app\company-admin\index.tsx`

## Root Causes Analysis

### Store Cycle Issue

- **calendarStore** imports `useTimeStore` for triggering refreshes
- **timeStore** imports `useCalendarStore` for calendar-related updates
- Both stores are trying to communicate bidirectionally through direct imports

### Notification Cycle Issue

- **notificationConfig** imports functions from `notificationService`
- **notificationService** imports `NotificationType` from `notificationConfig`
- Circular dependency in notification setup and handling

### Admin Component Cycle Issue

- **company-admin/index.tsx** exports toast helper functions (`showSuccessToast`, `showErrorToast`, `showConfirmToast`)
- Admin components import these toast functions from the main admin index file
- The admin index file imports all the admin components, creating cycles

## Solution Strategy

### Phase 1: Create Centralized Infrastructure

- [ ] Create `utils/appInitializer.ts` - Single source for app initialization
- [ ] Create `utils/realtimeManager.ts` - Single source for realtime subscriptions
- [ ] Create `utils/storeManager.ts` - Centralized store coordination
- [ ] Create `utils/toastHelpers.ts` - Shared toast utilities

### Phase 2: Fix Store Cycles

- [ ] Remove direct store imports between `calendarStore` and `timeStore`
- [ ] Implement event-based communication through `storeManager`
- [ ] Create store initialization sequence in `appInitializer`
- [ ] Move realtime subscription setup to `realtimeManager`

### Phase 3: Fix Notification Cycles

- [ ] Extract `NotificationType` enum to separate `types/notifications.ts` file
- [ ] Refactor notification imports to use the new types file
- [ ] Consolidate notification initialization in `appInitializer`

### Phase 4: Fix Admin Component Cycles

- [ ] Move toast helper functions from `company-admin/index.tsx` to `utils/toastHelpers.ts`
- [ ] Update all admin components to import toast helpers from the new location
- [ ] Clean up admin index file imports

### Phase 5: Integration and Testing

- [ ] Integrate all initialization through `appInitializer`
- [ ] Update `App.tsx` to use centralized initialization
- [ ] Test all store subscriptions work correctly
- [ ] Test notification functionality
- [ ] Test admin toast functionality
- [ ] Verify no more require cycles exist

## Detailed Implementation Steps

### Phase 1: Create Centralized Infrastructure

#### Step 1.1: Create App Initializer

- [ ] Create `utils/appInitializer.ts`
  - [ ] Export `initializeApp()` function
  - [ ] Handle store initialization sequence
  - [ ] Setup realtime subscriptions
  - [ ] Initialize notification system
  - [ ] Setup error boundaries and logging

#### Step 1.2: Create Realtime Manager

- [ ] Create `utils/realtimeManager.ts`
  - [ ] Export `setupRealtimeSubscriptions()` function
  - [ ] Export `cleanupSubscriptions()` function
  - [ ] Manage all Supabase realtime channels
  - [ ] Handle subscription lifecycle

#### Step 1.3: Create Store Manager

- [ ] Create `utils/storeManager.ts`
  - [ ] Export event emitter for inter-store communication
  - [ ] Export `initializeStores()` function
  - [ ] Export `cleanupStores()` function
  - [ ] Handle store dependencies and initialization order

#### Step 1.4: Create Toast Helpers

- [ ] Create `utils/toastHelpers.ts`
  - [ ] Move `showSuccessToast` from company-admin
  - [ ] Move `showErrorToast` from company-admin
  - [ ] Move `showConfirmToast` from company-admin
  - [ ] Move `showDeleteToast` from company-admin
  - [ ] Add proper TypeScript interfaces

### Phase 2: Fix Store Cycles

#### Step 2.1: Remove Direct Store Imports

- [ ] Remove `import { useTimeStore }` from `calendarStore.ts`
- [ ] Remove `import { useCalendarStore }` from `timeStore.ts`

#### Step 2.2: Implement Event-Based Communication

- [ ] Create store events in `storeManager.ts`:
  - [ ] `CALENDAR_DATA_UPDATED` event
  - [ ] `TIME_DATA_UPDATED` event
  - [ ] `REQUEST_SUBMITTED` event
  - [ ] `REQUEST_CANCELLED` event

#### Step 2.3: Update Store Implementations

- [ ] Update `calendarStore.ts`:

  - [ ] Subscribe to time events via `storeManager`
  - [ ] Emit calendar events when data changes
  - [ ] Remove direct timeStore calls

- [ ] Update `timeStore.ts`:
  - [ ] Subscribe to calendar events via `storeManager`
  - [ ] Emit time events when data changes
  - [ ] Remove direct calendarStore calls

#### Step 2.4: Move Realtime Subscriptions

- [ ] Extract realtime subscription logic from stores to `realtimeManager.ts`
- [ ] Create subscription handlers that emit events to `storeManager`
- [ ] Update stores to listen for events instead of managing subscriptions directly

### Phase 3: Fix Notification Cycles

#### Step 3.1: Extract Notification Types

- [ ] Create `types/notifications.ts`
  - [ ] Move `NotificationType` enum from `notificationConfig.ts`
  - [ ] Move related interfaces and types
  - [ ] Export all notification-related types

#### Step 3.2: Update Notification Files

- [ ] Update `notificationConfig.ts`:

  - [ ] Import `NotificationType` from `types/notifications.ts`
  - [ ] Remove function imports from `notificationService.ts`
  - [ ] Create interface for notification config

- [ ] Update `notificationService.ts`:
  - [ ] Import `NotificationType` from `types/notifications.ts`
  - [ ] Remove config imports that cause cycles
  - [ ] Pass configuration as parameters instead

#### Step 3.3: Integrate Notification Initialization

- [ ] Add notification setup to `appInitializer.ts`
- [ ] Pass configuration to notification service during init
- [ ] Ensure proper initialization order

### Phase 4: Fix Admin Component Cycles

#### Step 4.1: Update Toast Helper Imports

- [ ] Update `components/admin/pld-sdv/PldSdvSection.tsx`:

  - [ ] Replace `import { showSuccessToast, showErrorToast, showConfirmToast } from "@/app/company-admin"`
  - [ ] With `import { showSuccessToast, showErrorToast, showConfirmToast } from "@/utils/toastHelpers"`

- [ ] Update `components/admin/vacation/VacationSection.tsx`:

  - [ ] Replace `import { showSuccessToast, showErrorToast } from "@/app/company-admin"`
  - [ ] With `import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers"`

- [ ] Update `components/admin/message/AdminMessageSection.tsx`:
  - [ ] Replace `import { showSuccessToast, showErrorToast } from "@/app/company-admin"`
  - [ ] With `import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers"`

#### Step 4.2: Clean Up Admin Index

- [ ] Remove toast helper functions from `app/company-admin/index.tsx`
- [ ] Import toast helpers from `utils/toastHelpers.ts`
- [ ] Update local usage to use imported functions

### Phase 5: Integration and Testing

#### Step 5.1: Update App.tsx

- [ ] Import `initializeApp` from `utils/appInitializer.ts`
- [ ] Call `initializeApp()` in app startup sequence
- [ ] Remove individual store initializations
- [ ] Remove individual realtime setups

#### Step 5.2: Update Store Usage

- [ ] Verify all stores work with event-based communication
- [ ] Test calendar and time store interactions
- [ ] Ensure realtime updates propagate correctly

#### Step 5.3: Testing Phase

- [ ] Run app and verify no require cycle warnings
- [ ] Test calendar functionality
- [ ] Test time off requests
- [ ] Test vacation requests
- [ ] Test notifications
- [ ] Test admin panel toast messages
- [ ] Test all admin panel functionality

#### Step 5.4: Performance Verification

- [ ] Verify app startup time is not degraded
- [ ] Check memory usage for subscription management
- [ ] Test realtime performance
- [ ] Monitor for any new circular dependencies

## File Structure Changes

### New Files to Create

```
utils/
├── appInitializer.ts       # Central app initialization
├── realtimeManager.ts      # Realtime subscription management
├── storeManager.ts         # Store coordination and events
└── toastHelpers.ts         # Shared toast utilities

types/
└── notifications.ts        # Notification types and interfaces
```

### Files to Modify

```
store/
├── calendarStore.ts        # Remove timeStore import, add event system
└── timeStore.ts           # Remove calendarStore import, add event system

utils/
├── notificationConfig.ts   # Fix circular import
└── notificationService.ts  # Fix circular import

app/company-admin/
└── index.tsx              # Remove toast helpers, import from utils

components/admin/
├── pld-sdv/PldSdvSection.tsx     # Update toast helper imports
├── vacation/VacationSection.tsx   # Update toast helper imports
└── message/AdminMessageSection.tsx # Update toast helper imports

App.tsx                     # Use centralized initialization
```

## Success Criteria

- [ ] No more require cycle warnings in console
- [ ] All functionality continues to work as expected
- [ ] Single source of truth for app initialization
- [ ] Single source of truth for realtime subscriptions
- [ ] Improved maintainability and testability
- [ ] Clear separation of concerns between stores and utilities

## Risk Mitigation

- [ ] Create feature branch for this refactoring
- [ ] Test each phase incrementally
- [ ] Keep backup of working state
- [ ] Document any breaking changes
- [ ] Have rollback plan ready

## Post-Implementation Benefits

- [ ] Cleaner architecture with better separation of concerns
- [ ] Easier testing due to decoupled components
- [ ] Better performance through optimized initialization
- [ ] Reduced complexity in store interdependencies
- [ ] More maintainable codebase
- [ ] Foundation for future scalability improvements
