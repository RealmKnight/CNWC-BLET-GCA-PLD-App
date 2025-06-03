# Priority Navigation System

## Overview

The Priority Navigation System ensures users handle critical "Must Read" messages and "Must Acknowledge" announcements before accessing other parts of the app. Instead of automatic routing, the system shows a **blocking modal** that requires user interaction to proceed.

## Features

### Modal-First Approach

- **Strict Priority Order**: Critical messages > High priority announcements > Normal items
- **Sequential Handling**: Users must handle items one by one, cannot skip
- **Realtime Updates**: Automatically detects new priority items
- **Complete Navigation Blocking**: No dismissible options until handled
- **Seamless Integration**: Works with existing message/announcement systems

### Priority Levels

#### Critical Priority (Must Read Messages)

- **Type**: Messages with `message_type = "must_read"` AND `requires_acknowledgment = true`
- **Condition**: `!is_read OR !acknowledged_by.includes(user_id)`
- **Behavior**: Highest priority, blocks ALL navigation
- **Modal Color**: Red theme
- **Action Button**: "Read Critical Message"

#### High Priority (Must Acknowledge Announcements)

- **Type**: Announcements with `require_acknowledgment = true`
- **Condition**: `!read_by.includes(user_pin) OR !acknowledged_by.includes(user_pin)`
- **Behavior**: Second priority, blocks navigation when no critical items exist
- **Modal Color**: Blue theme
- **Action Button**: "Review Announcement"

#### Normal Priority

- **Type**: Regular messages and announcements
- **Behavior**: No navigation blocking

## Architecture

### Core Components

#### 1. `usePriorityRouter` Hook (`hooks/usePriorityRouter.ts`)

- **Purpose**: Central management of priority item detection and routing
- **Key Functions**:
  - `checkForPriorityItems()`: Scans for unhandled critical items
  - `routeToNextPriorityItem()`: Navigates to next priority item (ONLY when called by modal)
  - `markItemAsHandled()`: Removes item from priority queue
  - `shouldBlockNavigation()`: Determines if navigation should be blocked
  - `isOnPriorityRoute()`: Checks if user is already on valid priority route

#### 2. `PriorityBlockingModal` Component (`components/modals/PriorityBlockingModal.tsx`)

- **Purpose**: Modal interface that blocks all navigation
- **Features**:
  - Non-dismissible modal (no backdrop dismissal)
  - Priority indicators (warning/alert icons, colors)
  - Progress tracking ("2 of 5 priority items")
  - Status indicators (read/acknowledged checkmarks)
  - Action button to navigate to item

#### 3. `NavigationGuard` Component (`components/NavigationGuard.tsx`)

- **Purpose**: Wrapper component that monitors navigation state
- **Integration**: Wraps the main `<Slot />` component in `app/_layout.tsx`
- **Functionality**: Shows/hides blocking modal based on priority router state

### Data Flow

**New Modal-First Flow:**

1. User opens app OR new priority items are detected
2. usePriorityRouter.checkForPriorityItems() scans for critical items
3. NavigationGuard detects priority items and shows PriorityBlockingModal
4. User sees blocking modal with item details and action button
5. User clicks action button → NavigationGuard calls routeToNextPriorityItem()
6. User is routed to notifications/announcements page
7. User reads/acknowledges item → automatically removed from priority queue
8. If more items exist → modal reappears for next item
9. When no priority items remain → normal navigation resumes

### Integration Points

#### Message Store Integration (`store/notificationStore.ts`)

- `acknowledgeMessage()` updates `acknowledged_by` array
- `markAsRead()` updates `is_read` status
- Changes trigger priority router realtime monitoring

#### Announcement Store Integration (`store/announcementStore.ts`)

- Acknowledgment updates `acknowledged_by` array
- Read status updates `read_by` array
- Changes trigger priority router realtime monitoring

#### Badge Store Integration (`store/badgeStore.ts`)

- Priority items included in badge count calculations
- Badge updates reflect priority status changes

### Route Handling

**Valid Priority Routes** (where modal is hidden):

- `/(tabs)/notifications` - For critical messages
- `/(gca)/announcements` - For GCA announcements
- `/(division)/[division]/announcements` - For division announcements
- `/(admin)/*/AdminMessages` - For admin message handling
- `/(tabs)` - Main tabs index page

**Blocked Routes**: All other routes when priority items exist

### Realtime Monitoring

The system monitors changes to:

- `messages` table (for new must-read messages)
- `announcements` table (for new must-acknowledge announcements)
- User read/acknowledgment status updates

**Debouncing**: 300ms debounce on realtime updates to prevent rapid-fire checks

### Error Handling

- **Missing member data**: System waits for auth to be ready
- **Invalid routes**: Fallback to main notifications tab
- **Store sync issues**: System re-checks priority items periodically
- **Network issues**: Graceful degradation, continues with cached data

### Security Considerations

- **No bypass options**: Modal cannot be dismissed until items are handled
- **User validation**: All acknowledgments tied to authenticated user
- **Data integrity**: Acknowledgment status stored in database arrays
- **Route protection**: Navigation completely blocked for non-priority routes

### Performance Optimizations

- **Debounced updates**: Prevents excessive realtime checks
- **Dependency optimization**: Minimal useEffect dependencies
- **Selective monitoring**: Only watches array lengths, not full objects
- **Efficient filtering**: Priority items filtered client-side after fetching

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

#### Basic Priority Flow

1. **Create must-read message** → Verify modal appears with critical styling
2. **User clicks action** → Verify routes to notifications
3. **User acknowledges** → Verify modal disappears and navigation unblocked

#### Multiple Items

1. **Create multiple priority items** → Verify modal shows first item with correct count
2. **Handle first item** → Verify modal reappears with next item
3. **Handle all items** → Verify modal disappears permanently

#### Realtime Updates

1. **User on app** → Send new must-read message → Verify modal appears immediately
2. **User handles item** → Verify priority queue updates in realtime

### Manual Testing Steps

1. Create test message with `requires_acknowledgment: true`
2. Login as target user
3. Verify blocking modal appears
4. Attempt navigation (should be blocked)
5. Click action button to navigate to message
6. Read and acknowledge message
7. Verify modal disappears and navigation is restored

### Troubleshooting

#### Modal Not Appearing

- Check `shouldBlockNavigation()` function
- Verify priority router hook is properly integrated
- Check member authentication status
- Verify message/announcement has correct priority fields

#### Navigation Still Blocked

- Check priority items are being properly removed from queue
- Verify acknowledgment/read status being saved correctly
- Check markItemAsHandled() function
- Look for realtime sync issues

#### Performance Issues

- Monitor console for excessive priority checks
- Check useEffect dependency arrays
- Verify debouncing is working correctly

### Development Guidelines

#### Console Logging

All system events are logged with prefixes:

- `[PriorityRouter]`: Priority detection and routing logic
- `[NavigationGuard]`: Modal display and navigation logic
- `[PriorityBlockingModal]`: Modal interaction events

#### Adding New Priority Types

1. Update `PriorityItem` interface in `usePriorityRouter.ts`
2. Add detection logic in `checkForPriorityItems()`
3. Update routing logic in `routeToNextPriorityItem()`
4. Add appropriate styling in `PriorityBlockingModal.tsx`

#### Testing New Changes

- Test with must-read messages
- Test with must-acknowledge announcements
- Test mixed priority scenarios
- Test realtime updates
- Test navigation blocking/unblocking

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
