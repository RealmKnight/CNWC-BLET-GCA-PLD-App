# Priority Navigation System

## Overview

The Priority Navigation System is a critical feature that ensures users address mandatory messages and announcements before being able to navigate freely within the application. This system implements a blocking modal approach that prevents navigation until all critical items are read and acknowledged.

## Features

### Automatic Priority Detection

- **Must Read Messages**: Highest priority (critical)
- **Must Acknowledge Announcements**: Second priority (high)
- **Regular Priority**: Normal messages and announcements

### Navigation Blocking

- Completely blocks navigation until critical items are handled
- Shows a modal that cannot be dismissed until action is taken
- Prevents access to all app features until requirements are met

### Sequential Processing

- Handles multiple priority items one by one in sequence
- Shows progress indicator (e.g., "2 of 5")
- Automatically moves to next item after current one is handled

### Real-time Updates

- Monitors for new priority items via realtime subscriptions
- Automatically shows blocking modal when new critical items arrive
- Updates priority queue dynamically

## Priority Levels

### 1. Critical Priority - Must Read Messages

- **Trigger**: Messages with `requires_acknowledgment: true` and `message_type: 'must_read'`
- **Condition**: `!is_read OR !acknowledged_by.includes(user_id)`
- **Route**: `/(tabs)/notifications/{message_id}`
- **Icon**: Warning (⚠️)
- **Color**: Error/Red theme color

### 2. High Priority - Must Acknowledge Announcements

- **Trigger**: Announcements with `require_acknowledgment: true`
- **Condition**: `!has_been_read OR !has_been_acknowledged`
- **Route**:
  - GCA announcements: `/(gca)/announcements`
  - Division announcements: `/(division)/{division}/announcements`
- **Icon**: Alert Circle (🛈)
- **Color**: Primary theme color

### 3. Normal Priority

- Regular messages and announcements without mandatory requirements
- These do not block navigation

## Architecture

### Core Components

#### 1. `usePriorityRouter` Hook (`hooks/usePriorityRouter.ts`)

- **Purpose**: Central management of priority item detection and routing
- **Key Functions**:
  - `checkForPriorityItems()`: Scans for unhandled critical items
  - `routeToNextPriorityItem()`: Navigates to next priority item
  - `markItemAsHandled()`: Removes item from priority queue
  - `shouldBlockNavigation()`: Determines if navigation should be blocked
  - `isOnPriorityRoute()`: Checks if user is on a priority-handling route

#### 2. `PriorityBlockingModal` Component (`components/modals/PriorityBlockingModal.tsx`)

- **Purpose**: Modal interface that blocks all navigation
- **Features**:
  - Cannot be dismissed by user action
  - Shows item details and priority level
  - Displays progress indicator
  - Provides action button to navigate to item
  - Shows status indicators (read/acknowledged)

#### 3. `NavigationGuard` Component (`components/NavigationGuard.tsx`)

- **Purpose**: Wrapper component that monitors navigation state
- **Integration**: Wraps the main `<Slot />` component in `app/_layout.tsx`
- **Functionality**: Shows/hides blocking modal based on priority router state

### Data Flow

```
1. User logs in or app receives realtime update
2. usePriorityRouter.checkForPriorityItems() scans for critical items
3. If critical items found:
   a. Sets shouldBlockNavigation() to true
   b. NavigationGuard detects this and shows PriorityBlockingModal
   c. User clicks action button
   d. NavigationGuard calls routeToNextPriorityItem()
   e. User is routed to the priority item page
4. When item is read/acknowledged:
   a. Item is removed from priority queue
   b. System checks for next priority item
   c. Either routes to next item or removes blocking modal
```

## Implementation Details

### Priority Checking Triggers

The system checks for priority items in the following scenarios:

1. **App Startup**: When user authentication is complete
2. **Realtime Updates**: When messages or announcements change
3. **Navigation Events**: When user attempts to navigate to major routes
4. **Manual Refresh**: When user performs pull-to-refresh actions

### Route Detection

Priority routes are identified by URL patterns:

- `/notifications/{id}` - Message viewing
- `/announcements` - Announcement viewing
- `/admin/...AdminMessages` - Admin message interfaces

### State Management

The system maintains several key state variables:

- `priorityItems`: Array of current critical items
- `currentlyHandlingItem`: ID of item currently being processed
- `isCheckingPriority`: Loading state during priority checks
- `hasCompletedInitialCheck`: Prevents duplicate initial checks

### Error Handling

- Graceful fallbacks if data sources are unavailable
- Logging for debugging priority detection issues
- Safe defaults that don't break navigation if system fails

## Configuration

### Message Requirements

For a message to trigger critical priority:

```typescript
{
  requires_acknowledgment: true,
  message_type: 'must_read', // or just requires_acknowledgment: true
  is_read: false, // or not acknowledged
  acknowledged_by: [...] // array not containing current user ID
}
```

### Announcement Requirements

For an announcement to trigger high priority:

```typescript
{
  require_acknowledgment: true,
  has_been_read: false, // or not acknowledged
  has_been_acknowledged: false
}
```

## Security Considerations

- **No Bypass Mechanism**: Users cannot dismiss or bypass the blocking modal
- **Route Protection**: All navigation is blocked, including direct URL access
- **Session Validation**: Priority checks respect user authentication state
- **Data Validation**: Verifies user has permission to view/acknowledge items

## Performance Considerations

- **Efficient Queries**: Priority checks use optimized database queries
- **Realtime Subscriptions**: Only subscribe to relevant data changes
- **Debounced Updates**: Prevents excessive checking during rapid data changes
- **Memory Management**: Properly cleanup subscriptions and timers

## Testing

### Test Scenarios

1. **Single Critical Message**: User has one must-read message
2. **Multiple Priority Items**: User has both messages and announcements
3. **Mixed Priorities**: User has critical, high, and normal priority items
4. **Realtime Updates**: New critical items arrive while app is running
5. **Navigation Attempts**: User tries to navigate while items are pending
6. **Item Completion**: User reads/acknowledges items in sequence

### Manual Testing Steps

1. Create test message with `requires_acknowledgment: true`
2. Login as target user
3. Verify blocking modal appears
4. Attempt navigation (should be blocked)
5. Click action button to navigate to message
6. Read and acknowledge message
7. Verify modal disappears and navigation is restored

## Troubleshooting

### Common Issues

#### Modal Not Appearing

- Check if user has unread/unacknowledged critical items
- Verify priority router hook is properly integrated
- Check console logs for priority detection

#### Navigation Not Blocked

- Ensure NavigationGuard is wrapping the main Slot component
- Verify shouldBlockNavigation() logic
- Check if user is already on a priority route

#### Items Not Clearing

- Verify read/acknowledgment status is being updated in database
- Check markItemAsHandled() function
- Ensure realtime subscriptions are working

### Debug Logging

The system includes comprehensive logging with prefixes:

- `[PriorityRouter]`: Priority detection and routing logic
- `[NavigationGuard]`: Modal display and navigation blocking
- `[PriorityBlockingModal]`: Modal interaction events

## Future Enhancements

### Potential Improvements

1. **Snooze Functionality**: Allow temporary dismissal with reminder
2. **Batch Acknowledgment**: Handle multiple similar items at once
3. **Offline Support**: Queue priority items for when connectivity returns
4. **Admin Override**: Emergency bypass for administrative users
5. **Notification Integration**: Push notifications for new critical items
6. **Analytics**: Track user engagement with priority items

### Customization Options

1. **Priority Themes**: Different colors/icons for organization branding
2. **Message Templates**: Customizable text for different priority types
3. **Route Mapping**: Configurable routing for different item types
4. **Timing Controls**: Adjustable delays and timeouts

## Integration Notes

### Database Requirements

Ensure proper database schema supports:

- Message acknowledgment tracking
- Announcement read/acknowledgment status
- User-specific filtering capabilities
- Realtime subscription permissions

### Store Integration

The system integrates with existing stores:

- **useNotificationStore**: For message data
- **useAnnouncementStore**: For announcement data
- **useBadgeStore**: For unread count tracking
- **useUserStore**: For division information

### Navigation Integration

Works seamlessly with:

- **Expo Router**: All routing handled through expo-router
- **Tab Navigation**: Respects existing tab-based navigation
- **Deep Linking**: Properly handles incoming deep links
- **Authentication**: Integrates with existing auth flows
