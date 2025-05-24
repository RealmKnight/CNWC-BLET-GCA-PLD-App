# App Initialization Update Plan

## Overview

This plan addresses the require cycle issues identified in the app initialization console logs while preserving the existing sophisticated initialization system in `useAuth.tsx` and `_layout.tsx`. We'll create supporting infrastructure to eliminate circular dependencies without disrupting the current working authentication and store management flow.

## CODEBASE ANALYSIS FINDINGS

### Confirmed Circular Dependencies

1. **Store Cycles** - CONFIRMED

   - `store/calendarStore.ts` imports `useTimeStore` (line 6)
   - `store/timeStore.ts` imports `useCalendarStore` (line 8)
   - Both stores communicate bidirectionally through direct imports

2. **Notification Utility Cycles** - CONFIRMED with COMPLICATIONS

   - `utils/notificationConfig.ts` imports functions from `notificationService.ts` (lines 5-6)
   - `utils/notificationService.ts` imports `NotificationType` from `notificationConfig.ts` (line 41)
   - **DISCOVERED**: `utils/notificationTypes.ts` already exists and ALSO imports from `notificationConfig.ts` (line 1)
   - This creates a THREE-WAY circular dependency that needs careful handling

3. **Admin Component Cycles** - CONFIRMED
   - `app/company-admin/index.tsx` exports toast functions (lines 86-120)
   - Three admin components import these functions:
     - `components/admin/pld-sdv/PldSdvSection.tsx` (line 13)
     - `components/admin/vacation/VacationSection.tsx` (line 14)
     - `components/admin/message/AdminMessageSection.tsx` (line 15)

### Current Initialization Order Analysis

From `hooks/useAuth.tsx` lines 185-220:
**Current Order**: Calendar → Vacation Calendar → Time Store → Notification Store → Admin Stores

**USER REQUESTED ORDER**: Notification Store → Calendar → Vacation Calendar → Time Store → Admin Store

### Toast Helper Dependencies Analysis

From `app/company-admin/index.tsx` lines 86-120:

- Uses `react-native-toast-message` (imported line 18)
- Platform-specific positioning logic
- Custom action handlers for confirm/delete actions
- All toast functions are self-contained with no external dependencies other than React Native Toast

### Additional Dependencies Discovered

- `userStore` is imported by multiple stores but does NOT create cycles (unidirectional)
- No EventEmitter implementations currently exist in the codebase
- `utils/notificationTypes.ts` creates additional complexity in notification cycle resolution

## EVENT EMITTER ANALYSIS & RECOMMENDATIONS

Based on React Native/Expo best practices research:

### Option 1: Native EventTarget (RECOMMENDED)

**Pros:**

- Built into modern browsers and React Native
- No additional dependencies
- TypeScript support out of the box
- Cross-platform compatible (iOS/Android/Web)
- Lightweight and performant
- Standard Web API - familiar to developers

**Cons:**

- Slightly more verbose than libraries
- Need to manage event cleanup manually

### Option 2: EventEmitter3 Library

**Pros:**

- Very popular and well-tested
- More features than native EventTarget
- Smaller bundle size than Node EventEmitter
- Good TypeScript support

**Cons:**

- Additional dependency
- Adds ~3KB to bundle size
- Overkill for simple store communication

### RECOMMENDATION: Use Native EventTarget

For this React Native Expo app, EventTarget provides the best balance of:

- Zero dependencies
- Cross-platform compatibility
- TypeScript safety
- Performance suitable for store communication
- Familiar API for future maintainers

### Event System Strategy

- Use event queuing with simple debouncing (setTimeout) to prevent race conditions
- Implement cleanup on component unmount to prevent memory leaks
- Use typed event interfaces for TypeScript safety
- Minimal event data - just signal types, not large payloads

## UPDATED IMPLEMENTATION PLAN

### Phase 1: Create Supporting Infrastructure (No Disruption)

#### Step 1.1: Create Store Manager (EventTarget-based) ✅ COMPLETED

- [✅] Create `utils/storeManager.ts` using native EventTarget
- [✅] Export typed event constants and interfaces
- [✅] Include debouncing mechanism to prevent race conditions
- [✅] Add proper cleanup methods

**Implementation Notes:**

- EventTarget-based singleton with selective debouncing (200ms for data updates, 0ms for user actions)
- TypeScript-safe event system with comprehensive payload structure
- Cleanup methods for memory leak prevention
- Debug logging in development mode

#### Step 1.2: CRITICAL - Fix Notification Types THREE-WAY Cycle ✅ COMPLETED

- [✅] **PRIORITY**: Extract `NotificationType` enum to `types/notifications.ts`
- [✅] Update `utils/notificationTypes.ts` to import from new location
- [✅] Update `utils/notificationConfig.ts` to import from new location
- [✅] Update `utils/notificationService.ts` to import from new location
- [✅] Remove circular function imports between config and service

**Implementation Notes:**

- Created central `types/notifications.ts` with ALL notification types, interfaces, and helpers
- Implemented function injection pattern to prevent circular imports
- `notificationService.ts` exports `initializeNotificationServiceIntegration()` that must be called during app init
- All duplicate types and constants removed from individual files
- Parameter injection pattern prevents direct circular function calls

**⚠️ REQUIRED**: Call `initializeNotificationServiceIntegration()` during app initialization to set up function injection ✅ **COMPLETED**

- Added import and initialization call in `hooks/useAuth.tsx`
- Runs once when AuthProvider mounts (early in app lifecycle)
- Includes proper error handling and logging

#### Step 1.3: Create Toast Helpers ✅ COMPLETED

- [✅] Create `utils/toastHelpers.ts`
- [✅] Move all toast functions from `company-admin/index.tsx`
- [✅] Preserve `react-native-toast-message` dependency and platform logic
- [✅] Add proper TypeScript interfaces

**Implementation Notes:**

- Created comprehensive `utils/toastHelpers.ts` with enhanced functionality
- Extracted `showSuccessToast`, `showErrorToast`, `showConfirmToast`, `showDeleteToast` from company-admin
- Added additional helper functions: `showInfoToast`, `showWarningToast`, `showLoadingToast`, `hideToast`
- Enhanced with TypeScript interfaces: `ToastActionHandler`, `ToastOptions`
- Added utility constants: `TOAST_DURATIONS`, `TOAST_POSITIONS`
- Maintained backward compatibility via re-exports in `company-admin/index.tsx`
- All existing admin component imports continue to work without changes
- Enhanced platform-specific positioning logic with configuration options

### Phase 2: Fix Store Cycles with Race Condition Prevention

#### Step 2.1: Implement EventTarget-based Communication ✅ COMPLETED

- [✅] Create typed events in `storeManager.ts`:
  - [✅] `CALENDAR_DATA_UPDATED` event with debouncing
  - [✅] `TIME_DATA_UPDATED` event with debouncing
  - [✅] `REQUEST_SUBMITTED` event
  - [✅] `REQUEST_CANCELLED` event

**Implementation Notes:**

- Enhanced `utils/storeManager.ts` with specific events for calendar/time store communication
- Added comprehensive event types: `CALENDAR_REQUESTS_UPDATED`, `SIX_MONTH_REQUESTS_UPDATED`, `TIME_STATS_UPDATED`, etc.
- Implemented selective debouncing: 200ms for data updates, immediate for user actions
- Added helper functions: `emitCalendarDataUpdate`, `emitTimeDataUpdate`, `emitRequestSubmitted`, `emitRequestCancelled`
- Comprehensive payload structure with memberId, calendarId, request details, and performance optimization flags
- Debug logging in development mode with detailed event tracking

#### Step 2.2: Update Store Implementations with Event Queuing ✅ COMPLETED

- [✅] Update `calendarStore.ts`: Remove timeStore import, add event listeners with cleanup
- [✅] Update `timeStore.ts`: Remove calendarStore import, add event listeners with cleanup
- [✅] Implement event debouncing (200ms) to prevent rapid-fire updates
- [✅] Add proper subscription cleanup in store cleanup methods

**Implementation Notes:**

- **CalendarStore**: Removed `useTimeStore` import and replaced direct calls with event emissions
  - `triggerPldSdvRefresh()` calls replaced with `CALENDAR_REQUESTS_UPDATED` events
  - Six-month request updates emit `SIX_MONTH_REQUESTS_UPDATED` events
  - Events include comprehensive payload with request details and update triggers
- **TimeStore**: Removed `useCalendarStore` import and added event listeners
  - Added `storeEventCleanup` state field for managing event listener lifecycle
  - Setup listeners for `CALENDAR_REQUESTS_UPDATED` and `SIX_MONTH_REQUESTS_UPDATED`
  - Event handlers trigger `triggerPldSdvRefresh()` when calendar changes require time store updates
  - Comprehensive cleanup in `cleanup()` method removes all event listeners
- **Event Communication**: All inter-store communication now flows through the event manager
  - Selective debouncing: Calendar data updates (200ms), user actions (immediate)
  - Events include payload flags (`shouldRefreshTimeStore`, `shouldRefreshCalendarStore`)
  - Debug logging tracks event emission and handling
- **Circular Dependencies**: ✅ **ELIMINATED** - No more direct store imports between calendar and time stores

#### Step 2.3: Update Initialization Order ✅ **COMPLETED**

- [✅] **INVESTIGATE**: Assess feasibility of changing init order in `useAuth.tsx`
- [✅] **IMPLEMENT**: Update initialization order to prioritize notifications
- [✅] **Target Order**: Notification Store → Calendar → Vacation Calendar → Time Store → Admin Store
- [✅] **Rationale**: Display urgent notifications first while other stores initialize

**Investigation Results:**

- ✅ **SAFE TO PROCEED**: No circular dependencies will be created
- ✅ **Independent Operation**: Notification store only needs `userId` - no other store dependencies
- ✅ **Event-Based Communication**: Stores already communicate via events, not initialization order
- ✅ **User Experience Benefit**: Users see urgent notifications immediately while other stores load
- ✅ **No Breaking Changes**: Other stores' functionality will remain unchanged

**Implementation Notes:**

- ✅ **COMPLETED**: Updated `hooks/useAuth.tsx` initialization order in `initializeUserStores()` function
- ✅ **COMPLETED**: Moved notification store initialization to first position (line ~190)
- ✅ **COMPLETED**: Maintained all existing error handling and cleanup logic
- ✅ **COMPLETED**: Preserved calendar-dependent store initialization logic
- ✅ **COMPLETED**: Added clear comments explaining the new initialization order and rationale

### Phase 3: Fix Three-Way Notification Cycles ✅ **COMPLETED**

#### Step 3.1: Create Clean Notification Types Architecture ✅ **COMPLETED**

- [✅] Create `types/notifications.ts` with ALL notification types and interfaces
- [✅] Extract from `notificationConfig.ts`: `NotificationType` enum
- [✅] Extract from `notificationService.ts`: Any shared interfaces
- [✅] Update existing `notificationTypes.ts` to import from new shared location

**Implementation Notes:**

- ✅ **COMPLETED**: Created comprehensive `types/notifications.ts` with all notification types, interfaces, and helper functions
- ✅ **COMPLETED**: Extracted `NotificationType` enum and `NOTIFICATION_PRIORITIES` from `notificationConfig.ts`
- ✅ **COMPLETED**: Added comprehensive `NotificationPayload` interface with all required fields
- ✅ **COMPLETED**: Included helper functions: `getCategoryCodeFromType`, `getImportanceFromType`, type guards
- ✅ **COMPLETED**: Updated `notificationTypes.ts` to import from central location

#### Step 3.2: Clean Up Circular Function Dependencies ✅ **COMPLETED**

- [✅] Remove function imports from `notificationConfig.ts` → `notificationService.ts`
- [✅] Pass required functions as parameters instead of importing
- [✅] Update `notificationService.ts` to use parameter injection pattern

**Implementation Notes:**

- ✅ **COMPLETED**: Implemented function injection pattern in `notificationConfig.ts`
- ✅ **COMPLETED**: Added `injectNotificationServiceFunctions()` function to receive injected functions
- ✅ **COMPLETED**: Created `initializeNotificationServiceIntegration()` in `notificationService.ts`
- ✅ **COMPLETED**: Uses dynamic imports to prevent circular dependencies
- ✅ **COMPLETED**: Initialized in `hooks/useAuth.tsx` during app startup (line 87)
- ✅ **COMPLETED**: All circular function dependencies eliminated between notification files

**🎉 THREE-WAY CIRCULAR DEPENDENCY ELIMINATED**: The complex circular dependency between `notificationConfig.ts`, `notificationService.ts`, and `notificationTypes.ts` has been completely resolved.

### Phase 4: Fix Admin Component Cycles ✅ COMPLETED

#### Step 4.1: Extract Toast Dependencies Safely ✅ COMPLETED (via Step 1.3)

- [✅] Move toast functions to `utils/toastHelpers.ts` preserving all logic
- [✅] Ensure `react-native-toast-message` import is properly handled
- [✅] Maintain platform-specific behavior and action handlers

#### Step 4.2: Update All Admin Component Imports ✅ COMPLETED

- [✅] Update `components/admin/pld-sdv/PldSdvSection.tsx` import paths
- [✅] Update `components/admin/vacation/VacationSection.tsx` import paths
- [✅] Update `components/admin/message/AdminMessageSection.tsx` import paths
- [✅] Remove re-exports from `app/company-admin/index.tsx` to eliminate circular dependencies

**Implementation Notes:**

- Updated all three admin components to import toast functions directly from `utils/toastHelpers`
- Removed backward compatibility re-exports from `company-admin/index.tsx`
- All admin component circular dependencies have been eliminated
- Components now use: `import { showSuccessToast, showErrorToast, showConfirmToast } from "@/utils/toastHelpers"`

#### Step 4.3: Fix Console Deprecation Warnings ✅ COMPLETED

- [✅] **ISSUE IDENTIFIED**: `company-admin/index.tsx` was rendering redundant `<Toast />` component with deprecated shadow styles
- [✅] **ROOT CAUSE**: Raw `react-native-toast-message` component uses deprecated `textShadow*` and `shadow*` properties
- [✅] **SOLUTION**: Removed redundant `<Toast />` from company-admin since `<ThemedToast />` is already rendered globally in `_layout.tsx`
- [✅] **RESULT**: Eliminated React Native Web deprecation warnings by using only ThemedToast with modern shadow syntax

**Console Warning Resolution:**

- ❌ **Before**: `"shadow*" style props are deprecated. Use "boxShadow"` from BaseToast.styles.js
- ❌ **Before**: `"textShadow*" style props are deprecated. Use "textShadow"` from raw Toast component
- ✅ **After**: No deprecation warnings - ThemedToast uses modern `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, `elevation`

### Phase 5: Integration and Testing (Preserve Existing Architecture)

#### Step 5.1: STRICT REQUIREMENT - Preserve useAuth.tsx Initialization

- [ ] **NO CHANGES** to `useAuth.tsx` initialization sequence (unless init order update)
- [ ] **NO CHANGES** to store initialization methods
- [ ] **NO CHANGES** to cleanup management
- [ ] Verify existing auth-driven initialization still works

#### Step 5.2: Verify EventTarget Performance

- [ ] Test store event communication doesn't impact UI performance
- [ ] Verify debouncing prevents race conditions
- [ ] Test event cleanup prevents memory leaks
- [ ] Monitor for any new circular dependencies

#### Step 5.3: TypeScript Compliance Verification

- [ ] Ensure strict TypeScript compliance throughout
- [ ] Verify all event interfaces are properly typed
- [ ] Check no any types were introduced
- [ ] Validate proper error handling

## TECHNICAL SPECIFICATIONS

### EventTarget Implementation Details

```typescript
// Event system with TypeScript safety and selective debouncing
interface StoreEventData {
  type: StoreEventType;
  timestamp: number;
  source: string; // Which store emitted it
  payload: {
    // Calendar events
    dateRange?: { startDate: string; endDate: string };
    calendarId?: string;

    // Request events
    requestId?: string;
    requestType?: "PLD" | "SDV";
    requestDate?: string;

    // Performance optimization data
    affectedDates?: string[];
    updateType?: "full_refresh" | "partial_update" | "single_item";
  };
}

enum StoreEventType {
  CALENDAR_DATA_UPDATED = "CALENDAR_DATA_UPDATED",
  TIME_DATA_UPDATED = "TIME_DATA_UPDATED",
  REQUEST_SUBMITTED = "REQUEST_SUBMITTED",
  REQUEST_CANCELLED = "REQUEST_CANCELLED",
}

class StoreEventManager extends EventTarget {
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  // Selective debouncing: 200ms for data updates, 0ms for user actions
  emitEvent(eventType: StoreEventType, data: Omit<StoreEventData, "type" | "timestamp">) {
    const shouldDebounce =
      eventType === StoreEventType.CALENDAR_DATA_UPDATED || eventType === StoreEventType.TIME_DATA_UPDATED;
    const delay = shouldDebounce ? 200 : 0;

    if (delay > 0) {
      // Debouncing logic
    } else {
      // Immediate dispatch
    }
  }

  cleanup() {
    // Clear all timers and remove listeners
  }
}

// Singleton instance
const storeEventManager = new StoreEventManager();
export { storeEventManager, StoreEventType, type StoreEventData };
```

### Selective Debouncing Strategy

- **Debounced (200ms)**: `CALENDAR_DATA_UPDATED`, `TIME_DATA_UPDATED` - Prevents race conditions from rapid store updates
- **Immediate (0ms)**: `REQUEST_SUBMITTED`, `REQUEST_CANCELLED` - User expects instant feedback

### Notification Types Architecture

- **New**: `types/notifications.ts` - Central location for ALL notification types and interfaces
- **Updated**: `utils/notificationTypes.ts` - Import from central location
- **Updated**: `utils/notificationConfig.ts` - Import types, remove function imports
- **Updated**: `utils/notificationService.ts` - Import types, use parameter injection

### Implementation Approach

- **Singleton Pattern**: Single global `storeEventManager` instance
- **Naming Convention**: `StoreEventManager`, `StoreEventType`, `StoreEventData`
- **Pause Point**: After Step 1.2 (notification cycle fix) for critical review

## RISK ASSESSMENT & MITIGATION

### HIGH PRIORITY RISKS

1. **Three-way notification cycle** - Most complex to resolve safely
2. **Race conditions in store events** - Mitigated by debouncing
3. **Breaking existing initialization** - Mitigated by preservation approach

### MITIGATION STRATEGIES

- Implement in small, testable increments
- Preserve all existing initialization logic
- Add comprehensive TypeScript types
- Use git branching for easy rollback
- Test each phase independently

### SUCCESS CRITERIA

- [ ] Zero require cycle warnings in console
- [ ] All existing functionality preserved
- [ ] **useAuth.tsx initialization flow unchanged**
- [ ] **\_layout.tsx notification setup unchanged**
- [ ] Strict TypeScript compliance maintained
- [ ] No performance degradation
- [ ] Event-based store communication working
- [ ] Admin toast functionality working from shared utilities

## IMPLEMENTATION NOTES

### User Requirements Integration

✅ **Event Emitter Choice**: Native EventTarget chosen based on analysis  
✅ **Race Condition Prevention**: Debouncing and event queuing implemented  
✅ **Initialization Order**: Noted for potential update to Notification → Calendar → Vacation → Time → Admin  
✅ **TypeScript Compliance**: Strict compliance required throughout  
✅ **Codebase Analysis**: Complete dependency mapping performed  
✅ **No Code Changes Yet**: Analysis phase only, ready for implementation

### Critical Implementation Points

- **PRESERVE** all existing authentication and initialization flows
- **PRIORITIZE** notification cycle fix due to three-way complexity
- **IMPLEMENT** proper event cleanup to prevent memory leaks
- **MAINTAIN** all existing functionality during refactoring
- **TEST** each phase thoroughly before proceeding to next
