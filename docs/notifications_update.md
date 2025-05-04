# Notifications System Initialization Plan

## Current Issue

The notifications system is currently attempting to initialize in the RootLayoutContent component in `app/_layout.tsx`, but there are issues with this implementation:

1. We're seeing in practice that notifications aren't initializing until the notifications tab is visited
2. The current implementation in `_layout.tsx` has some initialization, but it's not getting user-specific notifications properly synchronized
3. There may be race conditions between the auth state and notification initialization
4. The Notifications tab component is also creating its own subscription when visited, potentially causing duplicates

## Current Implementation Analysis

After examining the codebase, I found that notification initialization is attempted in `app/_layout.tsx`:

```javascript
// From app/_layout.tsx
useEffect(() => {
  // Configure notifications when the app starts
  configureNotifications();

  // Set up notification listeners and store cleanup function
  const cleanupNotifications = setupNotificationListeners();

  return () => {
    // Clean up notification listeners when component unmounts
    cleanupNotifications();
  };
}, []);

// Initialize notifications when user is authenticated
useEffect(() => {
  if (session && member?.pin_number) {
    console.log("[Notifications] Initializing notifications for user:", member.pin_number);
    // Fetch initial messages
    fetchMessages(member.pin_number);
    // Subscribe to real-time updates
    const unsubscribe = subscribeToMessages(member.pin_number);

    return () => {
      console.log("[Notifications] Cleaning up notifications subscription");
      unsubscribe();
    };
  }
}, [session, member?.pin_number, fetchMessages, subscribeToMessages]);
```

But there are problems with this implementation:

1. The `fetchMessages` call is missing the required `member.id` parameter, causing it to fail silently
2. There's no validation to ensure both `member.pin_number` and `member.id` are present before initialization
3. There's no proper coordination with the auth system's lifecycle

Additionally, the `notifications.tsx` file has its own subscriptions that duplicate the root layout's functionality:

```javascript
// From app/(tabs)/notifications.tsx
// Set up realtime subscription
useEffect(() => {
  if (!member?.pin_number) return;
  const unsubscribe = subscribeToMessages(member.pin_number);
  return () => {
    unsubscribe();
  };
}, [member]);

// Initial fetch
useEffect(() => {
  if (member?.pin_number && member?.id) {
    fetchMessages(member.pin_number, member.id);
  }
}, [member]);
```

This leads to duplicate subscriptions and race conditions, causing the notification system to not initialize properly until the notifications tab is visited.

## Auth System Analysis

After examining the auth system in `hooks/useAuth.tsx`, I've identified important considerations:

1. The auth system already has robust state management:

   - Tracks auth state with refs to prevent race conditions
   - Handles background/foreground app state transitions
   - Carefully manages loading states during initialization

2. Key auth system components that impact our notification system:

   - `initialAuthCompleteRef` tracks when authentication is fully initialized
   - `AppState` listener already refreshes auth on foreground/background transitions
   - `updateAuthState` is the central function managing auth state changes

3. The auth system follows these initialization steps:
   - Initial auth check on mount
   - Member data fetching after successful authentication
   - State updates that might trigger re-renders
   - App state monitoring for session refreshing

We should leverage this existing infrastructure rather than creating parallel systems.

## Proposed Solution

We need to integrate notification initialization with the auth system by:

1. Initializing basic notification configuration early (not dependent on auth)
2. Initializing user-specific notifications only after auth is complete
3. Leveraging the existing AppState monitoring rather than creating a new one
4. Modifying the Notifications screen to avoid duplicate subscriptions
5. Addressing the type safety issue in the notifications component

### Implementation Plan

1. **Split Notification Initialization**

   - Configure basic notifications during app startup (independent of auth)
   - Initialize user-specific notifications only after auth is complete and member data is available

2. **Coordinate with Auth System**

   - Use an effect that depends on `member` being fully loaded
   - Ensure notifications are properly reset on logout
   - Add proper validation for required parameters

3. **Update the Notifications Screen**

   - Modify the component to check if notifications are already initialized
   - Just refresh data when the screen becomes active instead of creating new subscriptions

4. **Add Type Safety**
   - Fix the type safety issue in the notifications component

## Technical Implementation Details

1. **Update NotificationStore Implementation**

```typescript
// store/notificationStore.ts
interface NotificationStore {
  // Existing properties
  messages: Message[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  // New properties
  isInitialized: boolean;

  // Existing methods
  setMessages: (messages: Message[]) => void;
  fetchMessages: (pinNumber: number, userId: string) => Promise<void>;
  markAsRead: (messageId: string, pinNumber: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  subscribeToMessages: (pinNumber: number) => () => void;
  acknowledgeMessage: (messageId: string, pinNumber: number) => Promise<void>;
  archiveMessage: (messageId: string) => Promise<void>;
  // New methods
  setIsInitialized: (initialized: boolean) => void;
}

// Store implementation update
const useNotificationStore = create<NotificationStore>((set, get) => ({
  // Existing properties
  messages: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isInitialized: false,

  // Add initialization state setter
  setIsInitialized: (initialized: boolean) => {
    set({ isInitialized: initialized });
  },

  // Update subscribeToMessages to track initialization
  subscribeToMessages: (pinNumber: number) => {
    console.log(`[NotificationStore] Starting subscription for ${pinNumber}`);

    // Track initialization state
    set({ isInitialized: true });

    // Create channel ID as before
    const channelId = `messages-${pinNumber}-${Date.now()}`;

    // Rest of implementation
    // ...

    // But modify the returned cleanup function
    return () => {
      console.log("[NotificationStore] Cleaning up subscriptions");
      messagesSubscription.unsubscribe();

      // Reset initialization state on cleanup
      set({ isInitialized: false });
    };
  },
}));
```

2. **Updated RootLayoutContent Implementation**

```typescript
// In app/_layout.tsx

// Configure basic notifications at app startup (independent of auth)
useEffect(() => {
  // Configure notifications when the app starts
  configureNotifications();

  // Set up notification listeners (NOT subscriptions yet)
  const cleanupNotifications = setupNotificationListeners();

  return () => {
    // Clean up notification listeners when component unmounts
    cleanupNotifications();
  };
}, []);

// Initialize user-specific notifications only after auth is complete and member data is available
useEffect(() => {
  // Only proceed if we have a complete member object with all required fields
  if (!session || !member?.pin_number || !member?.id) {
    console.log("[Notifications] Skipping initialization, incomplete member data:", {
      hasSession: !!session,
      pinNumber: member?.pin_number,
      memberId: member?.id,
    });
    return;
  }

  // Check if notifications are already initialized to avoid duplicate subscriptions
  if (useNotificationStore.getState().isInitialized) {
    console.log("[Notifications] Notifications already initialized, skipping");
    return;
  }

  console.log("[Notifications] Initializing notifications for user:", {
    pinNumber: member.pin_number,
    memberId: member.id,
  });

  try {
    // Fetch initial messages with both required parameters
    useNotificationStore.getState().fetchMessages(member.pin_number, member.id);

    // Subscribe to real-time updates
    const unsubscribe = useNotificationStore.getState().subscribeToMessages(member.pin_number);

    return () => {
      console.log("[Notifications] Cleaning up notifications subscription");
      unsubscribe();
    };
  } catch (error) {
    console.error("[Notifications] Error initializing notifications:", error);
  }
}, [session, member]); // Depend on the entire member object to ensure we have complete data
```

3. **Leverage Auth's AppState Handling Instead of Creating Another**

Instead of creating a second AppState listener, we should leverage the auth system's existing AppState handling. We can extend it to also refresh notifications:

```typescript
// In hooks/useAuth.tsx - In the handleAppStateChange function

const handleAppStateChange = (nextAppState: string) => {
  if (appState.match(/inactive|background/) && nextAppState === "active" && mounted) {
    console.log("[Auth] App came to foreground, checking session");
    try {
      const {
        data: { session: currentSession },
        error,
      } = await supabase.auth.getSession();
      if (error) {
        console.error("[Auth] Error getting session on foreground:", error);
      } else if (currentSession && mounted) {
        await updateAuthState(currentSession, "APP_STATE");

        // Add notification refresh when returning to foreground
        if (currentSession?.user?.id && useUserStore.getState().member) {
          const member = useUserStore.getState().member;
          if (member?.pin_number && member?.id) {
            console.log("[Notifications] Refreshing notifications on app foreground");
            useNotificationStore.getState().fetchMessages(member.pin_number, member.id);
          }
        }
      }
    } catch (error) {
      console.error("[Auth] Exception getting session on foreground:", error);
    }
  }
  if (mounted) {
    setAppState(nextAppState);
  }
};
```

4. **Updated NotificationsScreen Implementation**

```typescript
// app/(tabs)/notifications.tsx

// Replace the existing subscription effect with a check
useEffect(() => {
  // Skip creating subscription if already initialized at the app level
  const isGloballyInitialized = useNotificationStore((state) => state.isInitialized);

  if (isGloballyInitialized) {
    console.log("[NotificationsScreen] Notifications already initialized at app level, skipping subscription");
    return;
  }

  // Fall back to creating a subscription only if not already done at app level
  if (!member?.pin_number) return;

  console.log("[NotificationsScreen] Creating fallback subscription");
  const unsubscribe = subscribeToMessages(member.pin_number);
  return () => {
    unsubscribe();
  };
}, [member]);

// Keep the data fetch effect, but fix the type safety issue
useEffect(() => {
  // Just refresh messages when this screen becomes active
  if (member?.pin_number && member?.id) {
    console.log("[NotificationsScreen] Refreshing messages on screen visit");
    setRefreshing(true);
    fetchMessages(member.pin_number, member.id).finally(() => setRefreshing(false));
  }
}, [member]);

// Fix for the type safety issue (line 302)
const handleDelete = async (messageId: string) => {
  // ... existing code ...

  const handleDeleteAction = async () => {
    // ... existing code ...

    // Refresh messages list - Fix the type safety issue
    if (member?.pin_number && member?.id) {
      console.log("[Notifications] Refreshing messages list");
      await fetchMessages(member.pin_number, member.id);
    }

    // ... rest of the code ...
  };
};
```

## Implementation Approach Considering Auth System

Given the complexity of the auth system, we should take the following approach:

1. **Minimally invasive changes**:

   - Only modify the notification store and notification-specific code
   - Don't modify the core auth system unless absolutely necessary
   - Use the store's direct API (`getState()`) to avoid circular dependencies

2. **Clear separation of concerns**:

   - Basic notification setup independent of auth
   - User-specific notification initialization dependent on auth
   - Screen-level behavior only refreshes data, doesn't manage subscriptions

3. **Debugging aids**:
   - Add comprehensive logging to track initialization
   - Include initialization state flags that can be checked

## Migration Steps

1. Update the NotificationStore first:

   - Add the `isInitialized` flag to the store
   - Add tracking of initialization state in subscribeToMessages
   - Add clear logging for subscription events

2. Update the RootLayoutContent component in `app/_layout.tsx`:

   - Split into two effects: basic setup and user-specific initialization
   - Add proper validation for member data
   - Fix the `fetchMessages` call to include both required parameters

3. Update the Notifications screen in `app/(tabs)/notifications.tsx`:

   - Check the `isInitialized` flag from the store
   - Don't create duplicate subscriptions
   - Fix the type safety issue

4. Test the changes:
   - Verify notifications initialize properly at app startup
   - Check that subscriptions aren't duplicated
   - Ensure data refreshes when app returns to foreground
   - Test logout/login scenarios

## Testing Approach

To properly test these changes:

1. **Sequential testing**:

   - Test the app startup flow, watching logs for proper initialization
   - Verify notification subscriptions are created only once
   - Confirm messages load without visiting the notifications tab

2. **Auth-specific testing**:

   - Test initialization after fresh login
   - Test cleanup after logout
   - Test reinitialization after login -> logout -> login

3. **Edge case testing**:
   - Test with spotty network connections
   - Test with incomplete member data scenarios

## Timeline Estimate

- Store Updates: 0.5 day
- Layout Updates: 0.5 day
- Notifications Screen Updates: 0.5 day
- Testing: 1 day (increased testing time due to auth integration)
- Total: 2.5 days

## Detailed Implementation Roadmap

### Phase 1: Notification Store Updates (Day 1, Morning)

#### Task 1.1: Add State Management

- [ ] Update the `NotificationStore` interface to add `isInitialized` property
- [ ] Add the `setIsInitialized` method to the interface
- [ ] Implement the property and method in the store

#### Task 1.2: Modify Subscription Logic

- [ ] Update `subscribeToMessages` to set `isInitialized = true` when starting
- [ ] Add code to reset `isInitialized = false` in the cleanup function
- [ ] Add logging for subscription start and cleanup

#### Task 1.3: Add Debug Utilities

- [ ] Implement additional logging for subscription events
- [ ] Add tracking for possible duplicate subscriptions
- [ ] Add warning logs for problematic situations

### Phase 2: Root Layout Updates

#### Task 2.1: Split Notification Initialization

- [ ] Keep basic notification setup in first useEffect (configureNotifications)
- [ ] Create separate useEffect for user-specific initialization

#### Task 2.2: Add Validation

- [ ] Add proper validation for session, member.pin_number and member.id
- [ ] Add check for existing initialization to prevent duplicates
- [ ] Add try/catch block for error handling

#### Task 2.3: Fix Parameter Usage

- [ ] Update the fetchMessages call to include member.id parameter
- [ ] Use getState() to access store methods to avoid circular dependencies
- [ ] Add proper dependency array for the effect

### Phase 3: Notifications Screen Updates

#### Task 3.1: Update Subscription Logic

- [ ] Add check to skip subscription if already initialized at app level
- [ ] Create fallback subscription only if needed
- [ ] Clean up existing subscription code

#### Task 3.2: Fix Type Safety Issues

- [ ] Update the delete handler to properly check both required parameters
- [ ] Fix any other type safety issues in the component
- [ ] Ensure error handling is in place

#### Task 3.3: Fix Data Refresh

- [ ] Keep the data refresh on screen visit
- [ ] Ensure proper loading indicator usage
- [ ] Add error handling for fetch failures

### Phase 4: Auth Integration

#### Task 4.1: Identify AppState Location

- [ ] Locate AppState handling in the auth system
- [ ] Identify the best place to add notification refresh

#### Task 4.2: Add Notification Refresh

- [ ] Add notification refresh code to the existing AppState handler
- [ ] Ensure it only runs when member data is available
- [ ] Add proper error handling

#### Task 4.3: Test Auth Integration

- [ ] Verify notifications are properly cleaned up on logout
- [ ] Ensure notifications are initialized on login
- [ ] Test with various auth scenarios

### Phase 5: Testing and Refinement (Day 3)

#### Task 5.1: Initial Testing

- [ ] Test app startup flow and initialization sequence
- [ ] Verify subscriptions are created correctly
- [ ] Check console logs for proper initialization

#### Task 5.2: Auth Flow Testing

- [ ] Test login -> logout -> login cycle
- [ ] Verify background/foreground transitions
- [ ] Test with incomplete member data scenarios

#### Task 5.3: Edge Case Testing

- [ ] Test with network interruptions
- [ ] Test with various device states
- [ ] Verify error recovery

#### Task 5.4: Final Refinements

- [ ] Address any issues found during testing
- [ ] Optimize initialization sequence if needed
- [ ] Add any missing error handling
