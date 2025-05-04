# Push Notification Implementation Plan

This file tracks the required implementation steps for push notifications across various features.

## Admin Messaging (`utils/notificationService.ts`)

- **`sendAdminMessage`:**
  - Implement logic to find users matching `recipientRoles`. This requires querying `members` (for roles like `division_admin`, `union_admin`) and `auth.users` (for `company_admin`).
  - Fetch Expo push tokens for identified users from a dedicated table (e.g., `user_preferences` or `push_tokens`). Handle cases where a user might have multiple tokens.
  - Construct the push payload using `sendPushNotification`, including relevant data like the `admin_message.id`, `subject`, etc.
  - Consider potential fan-out limits and error handling. Using an Edge Function for this process is recommended for performance and security.
- **`replyToAdminMessage`:**
  - Implement logic similar to `sendAdminMessage` but identify all unique participants in the thread (original sender + all recipients across all messages in the thread, excluding the current replier).
  - Fetch push tokens for all participants.
  - Send the notification.
- **`replyToUserInAdminMessage`:**
  - This function sends a message via the standard `messages` table.
  - Integrate with the existing `sendMessageWithNotification` flow (or adapt its logic) to handle user contact preferences (push/email/sms) for the direct message sent to the original user (`recipientPinNumber`). Ensure the correct push payload is sent for this context.

## General Considerations

- **Token Management:** Ensure robust logic for storing, updating, and removing user push tokens upon login, logout, or preference changes.
- **Unread Count / Badges:** Coordinate push notifications with client-side unread counts (`adminNotificationStore.unreadCount`) and potentially native app badges (`Notifications.setBadgeCountAsync`). Decide if the push payload should include the _new_ badge count or if the client recalculates upon receiving the push.
- **Edge Function Implementation:** Strongly consider implementing the token lookup and push sending logic within a Supabase Edge Function to handle potentially large numbers of recipients efficiently and securely, without exposing service keys to the client.
- **Error Handling & Retries:** Implement error handling for push notification failures (e.g., invalid tokens, Expo service issues).

## Future UI/UX Enhancements (Related Tasks)

- **Build Union/Application Admin Screens:** Create dedicated screens and navigation structures for Union and Application Admin roles.
- **Integrate Badging in Union/App Admin UI:** Once the screens are built, ensure the `AdminMessageBadge` is correctly displayed on relevant navigation elements (tabs, links, etc.) within their specific UIs, similar to how it's implemented for Company/Division Admins.
