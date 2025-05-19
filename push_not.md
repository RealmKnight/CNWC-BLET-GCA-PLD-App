# Expo Push Notification Integration Plan

## Current State Analysis

The application currently has partial push notification implementation:

- Permission request in profile screen
- Basic notification configuration in `_layout.tsx`
- Store implementation in `notificationStore.ts`
- Helper functions in `notificationService.ts` and `notificationConfig.ts`
- Database tables for tracking push notifications: `push_notification_deliveries` and push token storage in `user_preferences`

### Issues Identified

1. The system lacks proper initialization and token management
2. No centralized Zustand store for notification state management
3. Missing implementation of push token storage and association with users
4. Race conditions between auth state and notification initialization
5. Duplicate subscription creation when navigating to notification screens
6. Missing proper notification handling for both foreground and background states
7. No unified error handling or fallback mechanisms

## Existing Database Schema

### Current Tables

1. **push_notification_deliveries**

   - Tracks push notification delivery status
   - Fields: id, message_id, recipient_id, push_token, status, error_message, sent_at, delivered_at, created_at, updated_at

2. **user_preferences**
   - Stores user preferences including push tokens
   - Fields: id, user_id, pin_number, push_token, contact_preference, created_at, updated_at

### Schema Requirements

The current schema partly supports push notifications, but we need to enhance it:

- Add device information to track multiple devices per user
- Add platform-specific fields for Android and iOS
- Add notification categories for better organization
- Implement proper indexing for performance

## Authentication Integration

One of the key challenges identified is the race condition between authentication state and notification initialization. The current implementation attempts to initialize notifications in multiple places without coordination with the auth system.

### Auth System Analysis

The app uses an AuthProvider in `hooks/useAuth.tsx` with the following characteristics:

- Manages auth state with refs to prevent race conditions
- Handles app state transitions (background/foreground)
- Carefully manages loading states during initialization
- Provides a centralized auth state management system

### Proposed Auth Integration Approach

1. **Split notification initialization into two phases**:

   - Platform configuration (independent of auth)
   - User-specific setup (dependent on auth)

2. **Implement proper initialization sequence**:

   ```
   App Start → Configure Platform Settings → Auth Initialized → User Authenticated → Register Device Token → Subscribe to Notifications
   ```

3. **Hooks into Auth Lifecycle**:

   - Register token during auth completion
   - Clean up on logout/account change
   - Refresh token on app foreground

4. **Implementation Details**:

   ```typescript
   // In _layout.tsx or equivalent root component
   import { usePushTokenStore } from "@/store/pushTokenStore";
   import { AppState, Platform } from "react-native";

   // Inside component with access to auth context
   const { session, authStatus } = useAuth();
   const { registerDevice, unregisterDevice, refreshToken } = usePushTokenStore();

   // Initialize push token after auth
   useEffect(() => {
     if (authStatus === "authenticated" && session?.user?.id && Platform.OS !== "web") {
       console.log("[PushNotification] Auth initialized, registering token");
       registerDevice(session.user.id);

       return () => {
         // Clean up on auth change or unmount
         if (authStatus !== "authenticated") {
           unregisterDevice();
         }
       };
     }
   }, [authStatus, session?.user?.id]);

   // Handle app state changes (background/foreground)
   useEffect(() => {
     if (Platform.OS === "web") return;

     const subscription = AppState.addEventListener("change", (nextAppState) => {
       if (nextAppState === "active" && authStatus === "authenticated" && session?.user?.id) {
         // Refresh token when app comes to foreground
         refreshToken(session.user.id);
       }
     });

     return () => {
       subscription.remove();
     };
   }, [authStatus, session?.user?.id]);
   ```

## Implementation Plan

### Phase 1: Core Notification Infrastructure Setup

- [ ] **Create PushTokenStore (Zustand)**

  - [ ] Store Expo push token
  - [ ] Store device push token
  - [ ] Add loading and error states
  - [ ] Add methods for token registration and refresh
  - [ ] Create persistence mechanism for tokens

- [ ] **Update Notification Configuration**

  - [ ] Configure notification handler with proper behavior for all platforms
  - [ ] Set up proper Android notification channels with different priorities
  - [ ] Configure iOS notification categories for interactive notifications
  - [ ] Implement proper task registration for background notifications

- [ ] **Update Database Schema**
  - [ ] Create new `user_push_tokens` table with fields:
    - id: UUID
    - user_id: UUID (FK to auth.users)
    - push_token: TEXT
    - device_id: TEXT
    - device_name: TEXT
    - platform: TEXT
    - app_version: TEXT
    - last_used: TIMESTAMP
    - created_at: TIMESTAMP
    - updated_at: TIMESTAMP
  - [ ] Create indices for efficient queries
  - [ ] Set up proper relationships and constraints

### Phase 2: Token Registration & Management

- [ ] **Token Registration Process**

  - [ ] Implement getExpoPushTokenAsync with proper project ID handling
  - [ ] Create mechanism to store token in Supabase
  - [ ] Add token refresh logic for app updates
  - [ ] Implement device-specific token tracking
  - [ ] Handle token changes when devices change

- [ ] **Permission Management**

  - [ ] Create centralized permission request logic
  - [ ] Implement proper permission status tracking
  - [ ] Add UI for permission status explanations
  - [ ] Create re-permission request flow if initially denied

- [ ] **User Association**
  - [ ] Update user profile to associate tokens with user accounts
  - [ ] Handle multiple devices per user (with device identification)
  - [ ] Implement token cleanup for logged out users
  - [ ] Add proper error handling for registration failures

### Phase 3: Notification Handling

- [ ] **Foreground Notification Handler**

  - [ ] Implement custom notification presentation logic
  - [ ] Set up priority-based sound and alert behaviors
  - [ ] Create notification grouping for related notifications
  - [ ] Implement custom notification UI components

- [ ] **Background Notification Handler**

  - [ ] Set up TaskManager for background tasks
  - [ ] Create data processing logic for background notifications
  - [ ] Implement notification action handling in background
  - [ ] Add badge count management in background

- [ ] **Notification Response Handling**

  - [ ] Implement comprehensive routing system based on notification type:

    ```typescript
    // In notificationConfig.ts or a dedicated notificationNavigation.ts file
    import { router } from "expo-router";

    // Define notification types and their navigation paths
    export enum NotificationType {
      REGULAR_MESSAGE = "regular_message",
      ADMIN_MESSAGE = "admin_message",
      GCA_ANNOUNCEMENT = "gca_announcement",
      DIVISION_ANNOUNCEMENT = "division_announcement",
    }

    // Set up notification tap handler with advanced routing
    export function setupNotificationTapHandler() {
      // Add a listener for notification responses
      const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const messageId = data?.messageId;
        const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;

        console.log("[PushNotification] Notification tapped:", data);

        // Route based on notification type
        switch (notificationType) {
          case NotificationType.ADMIN_MESSAGE:
            // Navigate to admin messages - correct path to AdminMessages component
            router.push(`/(admin)/division_admin/DivisionAdminPanel/AdminMessages${messageId ? `/${messageId}` : ""}`);
            break;

          case NotificationType.GCA_ANNOUNCEMENT:
            // Navigate to GCA announcements - correct path to GCA announcements
            router.push(`/(gca)/gca-announcements${messageId ? `/${messageId}` : ""}`);
            break;

          case NotificationType.DIVISION_ANNOUNCEMENT:
            // Navigate to division announcements
            const divisionName = data?.divisionName;
            if (divisionName) {
              // Use division name for routing, not ID
              router.push(`/(division)/${divisionName}/announcements${messageId ? `/${messageId}` : ""}`);
            } else {
              // Fallback to main division page if no specific division
              router.push("/(division)");
            }
            break;

          case NotificationType.REGULAR_MESSAGE:
          default:
            // Default behavior for regular messages/notifications
            if (messageId) {
              router.push(`/(tabs)/notifications/${messageId}`);
            } else {
              router.push("/(tabs)/notifications");
            }
            break;
        }

        // Handle acknowledgment regardless of type
        if (data?.requiresAcknowledgment && messageId) {
          // Mark as read based on type
          if (notificationType === NotificationType.ADMIN_MESSAGE) {
            // Use admin message store
            markAdminMessageAsRead(messageId);
          } else {
            // Use regular message store
            markMessageAsRead(messageId);
          }
        }
      });

      // Return cleanup function
      return () => {
        Notifications.removeNotificationSubscription(responseListener);
      };
    }
    ```

  - [ ] Enhance cold start handling to support multiple notification types:

    ```typescript
    // In _layout.tsx or equivalent root component
    import * as Linking from "expo-linking";
    import { NotificationType } from "@/utils/notificationNavigation";

    // Handle cold starts from notifications with routing
    useEffect(() => {
      const getInitialNotification = async () => {
        const initialNotification = await Notifications.getLastNotificationResponseAsync();

        if (initialNotification) {
          // App was launched by a notification
          const data = initialNotification.notification.request.content.data;
          const messageId = data?.messageId;
          const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;

          console.log("[PushNotification] App launched from notification:", data);

          // Short delay ensures app is fully initialized
          setTimeout(() => {
            // Use the same routing logic as the tap handler
            switch (notificationType) {
              case NotificationType.ADMIN_MESSAGE:
                router.push(
                  `/(admin)/division_admin/DivisionAdminPanel/AdminMessages${messageId ? `/${messageId}` : ""}`
                );
                break;

              case NotificationType.GCA_ANNOUNCEMENT:
                router.push(`/(gca)/gca-announcements${messageId ? `/${messageId}` : ""}`);
                break;

              case NotificationType.DIVISION_ANNOUNCEMENT:
                const divisionName = data?.divisionName;
                if (divisionName) {
                  router.push(`/(division)/${divisionName}/announcements${messageId ? `/${messageId}` : ""}`);
                } else {
                  router.push("/(division)");
                }
                break;

              case NotificationType.REGULAR_MESSAGE:
              default:
                if (messageId) {
                  router.push(`/(tabs)/notifications/${messageId}`);
                } else {
                  router.push("/(tabs)/notifications");
                }
                break;
            }
          }, 1000);
        }
      };

      getInitialNotification();
    }, []);
    ```

- [ ] **Notification Payload Structure**:

  ```typescript
  // Example notification payload structure in notificationService.ts
  interface NotificationPayload {
    messageId: string;
    notificationType: NotificationType;
    title: string;
    body: string;
    requiresAcknowledgment?: boolean;
    // Type-specific fields
    divisionName?: string; // For division announcements - use name not ID
    // Other metadata
    timestamp: number;
  }

  // Update send function to include type
  async function sendTypedPushNotification(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    messageId: string,
    additionalData: Record<string, any> = {}
  ) {
    // Combine data
    const data = {
      messageId,
      notificationType: type,
      timestamp: Date.now(),
      ...additionalData,
    };

    return await sendPushNotificationToUser(userId, title, body, data);
  }
  ```

- [ ] **Deep Linking Edge Case Handling**

  - [ ] Implement content validation before navigation:

    ```typescript
    // Enhanced notification tap handler with content validation
    export function setupNotificationTapHandler() {
      return Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data;
        const messageId = data?.messageId;
        const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;
        const userId = await getUserId(); // Get current user ID from auth

        console.log("[PushNotification] Notification tapped:", data);

        // Validate content before navigation with parallel checks
        const [contentExists, hasAccess, expirationStatus, archiveStatus] = await Promise.all([
          validateContentExists(notificationType, messageId),
          validateUserHasAccess(notificationType, messageId, userId),
          checkContentExpiration(notificationType, messageId),
          checkContentArchiveStatus(notificationType, messageId),
        ]);

        // Handle invalid content
        if (!contentExists) {
          showContentUnavailableMessage(notificationType);
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(data, false, "content_not_found");
          return;
        }

        // Handle permission issues
        if (!hasAccess) {
          Toast.show({
            type: "error",
            text1: "Access Denied",
            text2: "You do not have permission to view this content.",
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(data, false, "access_denied");
          return;
        }

        // Handle expired content
        if (expirationStatus.isExpired) {
          Toast.show({
            type: "info",
            text1: "Expired Content",
            text2: expirationStatus.message,
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(data, false, "content_expired");
          return;
        }

        // Handle archived content
        if (archiveStatus.isArchived) {
          Toast.show({
            type: "info",
            text1: "Archived Content",
            text2: archiveStatus.message,
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(data, false, "content_archived");
          return;
        }

        // Content is valid - continue with standard routing
        navigateBasedOnNotificationType(data);
        trackNotificationNavigationResult(data, true);

        // Handle acknowledgment if needed
        if (data?.requiresAcknowledgment && messageId) {
          // Mark as read based on type
          if (notificationType === NotificationType.ADMIN_MESSAGE) {
            markAdminMessageAsRead(messageId);
          } else {
            markMessageAsRead(messageId);
          }
        }
      });
    }

    // Route based on notification type
    function navigateBasedOnNotificationType(data) {
      const messageId = data?.messageId;
      const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;

      switch (notificationType) {
        case NotificationType.ADMIN_MESSAGE:
          router.push(`/(admin)/division_admin/DivisionAdminPanel/AdminMessages${messageId ? `/${messageId}` : ""}`);
          break;

        case NotificationType.GCA_ANNOUNCEMENT:
          router.push(`/(gca)/gca-announcements${messageId ? `/${messageId}` : ""}`);
          break;

        case NotificationType.DIVISION_ANNOUNCEMENT:
          const divisionName = data?.divisionName;
          if (divisionName) {
            router.push(`/(division)/${divisionName}/announcements${messageId ? `/${messageId}` : ""}`);
          } else {
            router.push("/(division)");
          }
          break;

        case NotificationType.REGULAR_MESSAGE:
        default:
          if (messageId) {
            router.push(`/(tabs)/notifications/${messageId}`);
          } else {
            router.push("/(tabs)/notifications");
          }
          break;
      }
    }
    ```

  - [ ] Add content validation functions:

    ```typescript
    // Content validation helper functions
    async function validateContentExists(notificationType, messageId) {
      if (!messageId) return false;

      try {
        // Check if referenced content still exists based on type
        switch (notificationType) {
          case NotificationType.ADMIN_MESSAGE:
            const { data: adminMessage } = await supabase
              .from("admin_messages")
              .select("id")
              .eq("id", messageId)
              .single();
            return !!adminMessage;

          case NotificationType.GCA_ANNOUNCEMENT:
            const { data: announcement } = await supabase
              .from("announcements")
              .select("id")
              .eq("id", messageId)
              .eq("type", "gca")
              .single();
            return !!announcement;

          case NotificationType.DIVISION_ANNOUNCEMENT:
            const { data: divAnnouncement } = await supabase
              .from("announcements")
              .select("id")
              .eq("id", messageId)
              .eq("type", "division")
              .single();
            return !!divAnnouncement;

          default:
            const { data: message } = await supabase.from("messages").select("id").eq("id", messageId).single();
            return !!message;
        }
      } catch (error) {
        console.error("[PushNotification] Error validating content:", error);
        return false;
      }
    }

    async function validateUserHasAccess(notificationType, messageId, userId) {
      if (!messageId || !userId) return false;

      try {
        switch (notificationType) {
          case NotificationType.DIVISION_ANNOUNCEMENT:
            // Check if user belongs to the division
            const { data: announcement } = await supabase
              .from("announcements")
              .select("division_id")
              .eq("id", messageId)
              .single();

            if (!announcement) return false;

            const { data: userDivision } = await supabase
              .from("user_divisions")
              .select("division_id")
              .eq("user_id", userId)
              .eq("division_id", announcement.division_id)
              .single();

            return !!userDivision;

          case NotificationType.ADMIN_MESSAGE:
            // Check if user is recipient of admin message
            const { data: adminMessage } = await supabase
              .from("admin_messages")
              .select("recipient_ids")
              .eq("id", messageId)
              .single();

            return adminMessage && (adminMessage.recipient_ids === null || adminMessage.recipient_ids.includes(userId));

          case NotificationType.REGULAR_MESSAGE:
            // Check if user is recipient of message
            const { data: message } = await supabase
              .from("messages")
              .select("recipient_id")
              .eq("id", messageId)
              .single();

            return message && message.recipient_id === userId;

          // GCA announcements are visible to all users
          case NotificationType.GCA_ANNOUNCEMENT:
            return true;

          default:
            return true; // Default to allowing access if no specific check
        }
      } catch (error) {
        console.error("[PushNotification] Error validating access:", error);
        return false;
      }
    }

    async function checkContentExpiration(notificationType, messageId) {
      if (!messageId) return { isExpired: false };

      try {
        const now = new Date().toISOString();

        switch (notificationType) {
          case NotificationType.GCA_ANNOUNCEMENT:
          case NotificationType.DIVISION_ANNOUNCEMENT:
            const { data: announcement } = await supabase
              .from("announcements")
              .select("id, expiry_date")
              .eq("id", messageId)
              .single();

            if (announcement?.expiry_date && announcement.expiry_date < now) {
              return {
                isExpired: true,
                message: "This announcement has expired.",
              };
            }
            break;

          case NotificationType.ADMIN_MESSAGE:
            const { data: adminMessage } = await supabase
              .from("admin_messages")
              .select("id, expiry_date")
              .eq("id", messageId)
              .single();

            if (adminMessage?.expiry_date && adminMessage.expiry_date < now) {
              return {
                isExpired: true,
                message: "This admin message has expired.",
              };
            }
            break;
        }

        return { isExpired: false };
      } catch (error) {
        console.error("[PushNotification] Error checking expiration:", error);
        return { isExpired: false };
      }
    }

    async function checkContentArchiveStatus(notificationType, messageId) {
      if (!messageId) return { isArchived: false };

      try {
        switch (notificationType) {
          case NotificationType.ADMIN_MESSAGE:
            const { data: message } = await supabase
              .from("admin_messages")
              .select("id, is_archived")
              .eq("id", messageId)
              .single();

            if (message?.is_archived) {
              return {
                isArchived: true,
                message: "This message has been archived.",
              };
            }
            break;

          case NotificationType.GCA_ANNOUNCEMENT:
          case NotificationType.DIVISION_ANNOUNCEMENT:
            const { data: announcement } = await supabase
              .from("announcements")
              .select("id, is_archived")
              .eq("id", messageId)
              .single();

            if (announcement?.is_archived) {
              return {
                isArchived: true,
                message: "This announcement has been archived.",
              };
            }
            break;
        }

        return { isArchived: false };
      } catch (error) {
        console.error("[PushNotification] Error checking archive status:", error);
        return { isArchived: false };
      }
    }
    ```

  - [ ] Implement graceful fallbacks:

    ```typescript
    // Fallback navigation for invalid links
    function navigateToFallbackScreen(notificationType) {
      // Determine appropriate fallback destination based on notification type
      switch (notificationType) {
        case NotificationType.ADMIN_MESSAGE:
          router.push("/(admin)/division_admin/DivisionAdminPanel/AdminMessages");
          break;
        case NotificationType.GCA_ANNOUNCEMENT:
          router.push("/(gca)/gca-announcements");
          break;
        case NotificationType.DIVISION_ANNOUNCEMENT:
          router.push("/(division)");
          break;
        default:
          router.push("/(tabs)/notifications");
          break;
      }
    }

    // User feedback for unavailable content
    function showContentUnavailableMessage(notificationType) {
      // Show appropriate toast/message based on notification type
      let message = "The content you requested is no longer available.";

      switch (notificationType) {
        case NotificationType.ADMIN_MESSAGE:
          message = "This admin message is no longer available.";
          break;
        case NotificationType.GCA_ANNOUNCEMENT:
          message = "This announcement is no longer available.";
          break;
        case NotificationType.DIVISION_ANNOUNCEMENT:
          message = "This division announcement is no longer available.";
          break;
      }

      // Use existing toast mechanism
      Toast.show({
        type: "info",
        text1: "Content Unavailable",
        text2: message,
      });
    }
    ```

  - [ ] Add analytics tracking for deep linking results:

    ```typescript
    // Track notification navigation success/failure
    function trackNotificationNavigationResult(data, success, reason = null) {
      try {
        // Log notification navigation result to analytics
        const analyticsData = {
          notification_type: data.notificationType,
          message_id: data.messageId,
          success,
          reason,
          timestamp: new Date().toISOString(),
        };

        // Log to Supabase
        supabase
          .from("notification_analytics")
          .insert([analyticsData])
          .then(() => {
            console.log("[PushNotification] Tracked navigation result:", success);
          })
          .catch((error) => {
            console.error("[PushNotification] Error logging analytics:", error);
          });
      } catch (error) {
        console.error("[PushNotification] Error tracking navigation:", error);
      }
    }
    ```

  - [ ] Update cold start handling with validation:

    ```typescript
    // Enhanced cold start handling with validation
    async function getInitialNotification() {
      const initialNotification = await Notifications.getLastNotificationResponseAsync();

      if (initialNotification) {
        // App was launched by a notification
        const data = initialNotification.notification.request.content.data;
        const messageId = data?.messageId;
        const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;
        const userId = await getUserId(); // Get current user ID from auth

        console.log("[PushNotification] App launched from notification:", data);

        // Validate content before navigation
        const [contentExists, hasAccess, expirationStatus, archiveStatus] = await Promise.all([
          validateContentExists(notificationType, messageId),
          validateUserHasAccess(notificationType, messageId, userId),
          checkContentExpiration(notificationType, messageId),
          checkContentArchiveStatus(notificationType, messageId),
        ]);

        // Wait for app to initialize fully before navigating
        setTimeout(() => {
          if (!contentExists) {
            showContentUnavailableMessage(notificationType);
            navigateToFallbackScreen(notificationType);
            trackNotificationNavigationResult(data, false, "content_not_found");
            return;
          }

          if (!hasAccess) {
            Toast.show({
              type: "error",
              text1: "Access Denied",
              text2: "You do not have permission to view this content.",
            });
            navigateToFallbackScreen(notificationType);
            trackNotificationNavigationResult(data, false, "access_denied");
            return;
          }

          if (expirationStatus.isExpired) {
            Toast.show({
              type: "info",
              text1: "Expired Content",
              text2: expirationStatus.message,
            });
            navigateToFallbackScreen(notificationType);
            trackNotificationNavigationResult(data, false, "content_expired");
            return;
          }

          if (archiveStatus.isArchived) {
            Toast.show({
              type: "info",
              text1: "Archived Content",
              text2: archiveStatus.message,
            });
            navigateToFallbackScreen(notificationType);
            trackNotificationNavigationResult(data, false, "content_archived");
            return;
          }

          // Content valid, has access, not expired, not archived - navigate
          navigateBasedOnNotificationType(data);
          trackNotificationNavigationResult(data, true);
        }, 1000);
      }
    }
    ```

  - [ ] Add database schema for tracking notification analytics:

    ```sql
    -- Add a table to track notification navigation failures
    CREATE TABLE IF NOT EXISTS public.notification_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_type TEXT NOT NULL,
        message_id UUID,
        user_id UUID REFERENCES auth.users(id),
        success BOOLEAN NOT NULL,
        reason TEXT,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    -- Add indices for analytics queries
    CREATE INDEX IF NOT EXISTS idx_notification_analytics_success ON public.notification_analytics(success);
    CREATE INDEX IF NOT EXISTS idx_notification_analytics_type ON public.notification_analytics(notification_type);
    CREATE INDEX IF NOT EXISTS idx_notification_analytics_timestamp ON public.notification_analytics(timestamp);
    ```

  - [ ] Update message/announcement schemas to support archiving and expiration:

    ```sql
    -- Add expiration and archiving fields to admin messages if not already present
    ALTER TABLE public.admin_messages
    ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

    -- Add expiration and archiving fields to announcements if not already present
    ALTER TABLE public.announcements
    ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
    ```

- [ ] **Update admin message screens to handle deep linking**:

  ```typescript
  // In app/admin/messages/[messageId].tsx or equivalent
  import { useLocalSearchParams } from "expo-router";

  export default function AdminMessageDetailScreen() {
    const { messageId } = useLocalSearchParams();
    const { markAdminMessageAsRead } = useAdminMessagesStore();

    useEffect(() => {
      if (messageId) {
        // Mark admin message as read
        markAdminMessageAsRead(messageId as string);

        // Update delivery status if from notification
        markNotificationDelivered(messageId as string, "read");
      }
    }, [messageId]);

    // Rest of component...
  }
  ```

- [ ] **Update announcement screens to handle deep linking**:

  ```typescript
  // In app/(tabs)/gca-announcements/[announcementId].tsx or equivalent
  import { useLocalSearchParams } from "expo-router";

  export default function GCAAnnouncementDetailScreen() {
    const { announcementId } = useLocalSearchParams();
    const { markAnnouncementAsRead } = useAnnouncementsStore();

    useEffect(() => {
      if (announcementId) {
        // Mark announcement as read
        markAnnouncementAsRead(announcementId as string);

        // Update delivery status if from notification
        markNotificationDelivered(announcementId as string, "read");
      }
    }, [announcementId]);

    // Rest of component...
  }
  ```

### Phase 4: Server-Side Implementation

- [ ] **Sending Infrastructure**

  - [ ] Set up Expo push notification sending service
  - [ ] Create batching mechanism for multiple recipients
  - [ ] Implement priority-based sending strategy
  - [ ] Add retry logic for failed deliveries

- [ ] **Message Formatting**

  - [ ] Create standardized message format for different notification types:

    ```typescript
    // Example sending functions for different notification types

    // Regular messages
    export async function sendMessageNotification(userId: string, message: Message) {
      return sendTypedPushNotification(
        userId,
        "New Message",
        message.subject || "You have a new message",
        NotificationType.REGULAR_MESSAGE,
        message.id,
        { requiresAcknowledgment: message.requiresAcknowledgment }
      );
    }

    // Admin messages
    export async function sendAdminMessageNotification(userId: string, message: AdminMessage) {
      return sendTypedPushNotification(
        userId,
        "Admin Message",
        message.subject || "You have a new admin message",
        NotificationType.ADMIN_MESSAGE,
        message.id,
        { requiresAcknowledgment: true }
      );
    }

    // GCA announcements
    export async function sendGCAAnnouncementNotification(userId: string, announcement: Announcement) {
      return sendTypedPushNotification(
        userId,
        "GCA Announcement",
        announcement.title || "New GCA Announcement",
        NotificationType.GCA_ANNOUNCEMENT,
        announcement.id
      );
    }

    // Division announcements
    export async function sendDivisionAnnouncementNotification(
      userId: string,
      announcement: Announcement,
      divisionName: string
    ) {
      return sendTypedPushNotification(
        userId,
        "Division Announcement",
        announcement.title || "New Division Announcement",
        NotificationType.DIVISION_ANNOUNCEMENT,
        announcement.id,
        { divisionName }
      );
    }
    ```

- [ ] **Delivery Tracking**
  - [ ] Implement webhook for delivery receipts
  - [ ] Create database structure for tracking delivery status
  - [ ] Add analytics for notification performance
  - [ ] Implement error reporting for failed deliveries

### Phase 5: Testing & Integration

- [ ] **Device Testing**

  - [ ] Test on multiple Android versions
  - [ ] Test on multiple iOS versions
  - [ ] Verify background behavior
  - [ ] Test with app in various states (foreground, background, killed)

- [ ] **Integration Testing**

  - [ ] Verify integration with existing message system
  - [ ] Test user preference enforcement
  - [ ] Verify token refresh scenarios
  - [ ] Test multi-device scenarios

- [ ] **Error Handling**
  - [ ] Implement comprehensive error recovery
  - [ ] Create UI for error states
  - [ ] Add logging for troubleshooting
  - [ ] Implement automatic retry mechanisms

## Detailed Technical Implementation

### SQL for Database Schema Update

```sql
-- Create a new table for device-specific push tokens
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT,
    platform TEXT NOT NULL,
    app_version TEXT,
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, device_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_push_token ON public.user_push_tokens(push_token);

-- Create notification categories table
CREATE TABLE IF NOT EXISTS public.notification_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    actions JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for user_push_tokens table
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Single comprehensive policy for user_push_tokens
CREATE POLICY manage_own_tokens ON public.user_push_tokens
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Enable RLS for user_notification_preferences table
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Single comprehensive policy for user_notification_preferences
CREATE POLICY manage_own_preferences ON public.user_notification_preferences
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
```

### Notification Configuration (notificationConfig.ts)

```typescript
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });

  // Set up Android channels
  if (Platform.OS === "android") {
    setupAndroidChannels();
  }

  // Configure iOS categories
  if (Platform.OS === "ios") {
    setupIOSCategories();
  }
}

// Register for push notifications and return token
export async function registerForPushNotificationsAsync() {
  let token;

  if (!Device.isDevice) {
    console.log("Push notifications require physical device");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Permission denied for notifications");
    return null;
  }

  // Get project ID from app config
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    console.error("Project ID not found in app config");
    return null;
  }

  // Get Expo push token
  try {
    const expoPushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = expoPushToken.data;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }

  return token;
}
```

### Notification Store (pushNotificationStore.ts)

```typescript
import { create } from "zustand";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "@/utils/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { registerForPushNotificationsAsync } from "@/utils/notificationService";

interface PushTokenState {
  expoPushToken: string | null;
  devicePushToken: string | null;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
  lastRegistrationDate: string | null;

  // Methods
  registerDevice: (userId: string) => Promise<string | null>;
  unregisterDevice: () => Promise<void>;
  refreshToken: (userId: string) => Promise<string | null>;
  clearTokens: () => Promise<void>;
  checkPermissionStatus: () => Promise<string>;
}

export const usePushTokenStore = create<PushTokenState>((set, get) => ({
  expoPushToken: null,
  devicePushToken: null,
  isRegistered: false,
  isLoading: false,
  error: null,
  lastRegistrationDate: null,

  // Initialize state from storage if available
  init: async () => {
    try {
      const storedToken = await AsyncStorage.getItem("@pushToken");
      if (storedToken) {
        const tokenData = JSON.parse(storedToken);
        set({
          expoPushToken: tokenData.expoPushToken,
          isRegistered: true,
          lastRegistrationDate: tokenData.lastRegistrationDate,
        });
      }
    } catch (error) {
      console.error("Error loading push token from storage:", error);
    }
  },

  registerDevice: async (userId: string) => {
    if (!userId) {
      set({ error: "User ID required for token registration" });
      return null;
    }

    try {
      set({ isLoading: true, error: null });

      // Get token from Expo
      const token = await registerForPushNotificationsAsync();

      if (!token) {
        throw new Error("Failed to get push token");
      }

      // Get device information
      const deviceId = await getUniqueDeviceId();
      const deviceName = Device.deviceName || "Unknown Device";
      const appVersion = Constants.expoConfig?.version || "unknown";

      // Store token in database
      const { error: dbError } = await supabase.from("user_push_tokens").upsert({
        user_id: userId,
        push_token: token,
        device_id: deviceId,
        device_name: deviceName,
        platform: Platform.OS,
        app_version: appVersion,
        is_active: true,
        last_used: new Date().toISOString(),
      });

      if (dbError) throw dbError;

      // Store in localStorage for persistence
      const registrationDate = new Date().toISOString();
      await AsyncStorage.setItem(
        "@pushToken",
        JSON.stringify({
          expoPushToken: token,
          lastRegistrationDate: registrationDate,
        })
      );

      set({
        expoPushToken: token,
        isRegistered: true,
        isLoading: false,
        lastRegistrationDate: registrationDate,
      });

      return token;
    } catch (error: any) {
      set({
        error: `Token registration failed: ${error.message}`,
        isLoading: false,
      });
      return null;
    }
  },

  // Additional method implementations
  unregisterDevice: async () => {
    try {
      set({ isLoading: true });

      const token = get().expoPushToken;
      if (!token) return;

      // Mark token as inactive in database
      await supabase.from("user_push_tokens").update({ is_active: false }).eq("push_token", token);

      // Clear from local storage
      await AsyncStorage.removeItem("@pushToken");

      set({
        expoPushToken: null,
        devicePushToken: null,
        isRegistered: false,
        isLoading: false,
        lastRegistrationDate: null,
      });
    } catch (error) {
      console.error("Error unregistering device:", error);
      set({ isLoading: false });
    }
  },

  refreshToken: async (userId: string) => {
    if (!userId) return null;

    // Only refresh if we already have a token
    if (get().expoPushToken) {
      return await get().registerDevice(userId);
    }
    return null;
  },

  checkPermissionStatus: async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch (error) {
      console.error("Error checking permission status:", error);
      return "error";
    }
  },
}));

// Helper to get a unique device identifier
async function getUniqueDeviceId(): Promise<string> {
  try {
    // Try to get a stored device ID
    const storedId = await AsyncStorage.getItem("@deviceId");

    if (storedId) {
      return storedId;
    }

    // Generate a new one if not found
    const newId = Device.deviceName
      ? `${Device.deviceName}-${Date.now()}`
      : `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await AsyncStorage.setItem("@deviceId", newId);
    return newId;
  } catch (error) {
    // Fallback in case of errors
    return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
```

## Next Steps and Integration

After implementing the phases above, we'll need to:

1. Update the profile screen to use the new centralized token registration
2. Ensure proper initialization at app startup with auth coordination
3. Update notification tab to use the store without duplicate subscriptions
4. Create test harness for sending notifications during development
5. Document the system for the team and create troubleshooting guide

## Risk Assessment

- **Token Expiration**: If tokens become invalid, we need proper refresh mechanisms
- **Permission Denial**: Need graceful fallback for users who deny permissions
- **Platform Differences**: Android and iOS have different behaviors requiring platform-specific code
- **Performance Impact**: Background notification handling can impact battery life
- **Database Load**: High-volume notifications could stress the database
- **Test Environment**: Testing push notifications requires physical devices

## Success Criteria

- Users receive push notifications reliably on all supported platforms
- Notifications appear correctly in both foreground and background states
- Token registration process works reliably across app updates
- User can control notification preferences
- System properly tracks notification delivery and engagement
- Notifications navigate to the correct content when tapped
- Clicking on notifications navigates users directly to the relevant message or notification screen
- Messages opened via notifications are properly marked as read/acknowledged
- Cold starts from notifications work correctly, preserving the notification context
- Notifications for different content types (messages, admin messages, GCA announcements, division announcements) route users to the appropriate screens
- Context data (like division ID) is properly preserved when navigating from notifications
- Notifications are received and handled appropriately in all three app states (foreground, background, closed)
- Cold start from notification preserves context and navigates to the correct screen
- Background notifications update badge counts and mark messages as delivered
- Foreground notifications present a consistent and non-disruptive UI

## App State Handling for Notifications

One of the key advantages of using Expo's notification system is that it works across all three possible app states:

1. **Foreground (App Open)**

   - Notifications can be displayed as in-app alerts
   - We control the presentation using `setNotificationHandler`
   - Custom UI can be shown instead of system notifications
   - User can interact with notifications without leaving the app

2. **Background (App Running But Not Active)**

   - Notifications appear in the system notification tray
   - Background tasks can be triggered to process data
   - Tapping the notification brings the app to the foreground
   - Our response handler directs users to the appropriate screen

3. **Closed/Not Running**
   - Notifications are still delivered to the device
   - Tapping launches the app (cold start)
   - Initial notification context is preserved with `getLastNotificationResponseAsync()`
   - User is directed to the appropriate screen after launch

Our implementation must properly handle all three states, which is achieved through the following components:

### For Foreground (App Open)

```typescript
// In notificationConfig.ts
// This controls how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowAlert: true, // Show as system alert even in foreground
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});
```

### For Background (App Not Active)

```typescript
// In notificationConfig.ts
// Define a task for handling notifications in the background
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background notification task error:", error);
    return;
  }

  if (!data?.notification) return;

  // Process the notification in the background
  const messageId = data.notification.request.content.data?.messageId;
  if (messageId) {
    // Mark as delivered even when app is in background
    await markNotificationDelivered(messageId);

    // Update badge count
    try {
      const userId = data.notification.request.content.data?.userId;
      if (userId) {
        const unreadCount = await getUnreadMessageCount(userId);
        await Notifications.setBadgeCountAsync(unreadCount);
      }
    } catch (error) {
      console.error("Error updating badge in background:", error);
    }
  }
});

// Register the background task
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
```

### For Closed/Not Running State (Cold Start)

```typescript
// In _layout.tsx or equivalent app entry point
// This checks if the app was launched by a notification
useEffect(() => {
  const getInitialNotification = async () => {
    const initialNotification = await Notifications.getLastNotificationResponseAsync();

    if (initialNotification) {
      // App was launched by a notification (cold start)
      const data = initialNotification.notification.request.content.data;
      const notificationType = data?.notificationType || NotificationType.REGULAR_MESSAGE;

      console.log("[PushNotification] App launched from notification:", data);

      // Wait for app to initialize fully before navigating
      setTimeout(() => {
        // Route based on notification type as defined earlier
        navigateBasedOnNotificationType(data);
      }, 1000);
    }
  };

  getInitialNotification();
}, []);
```

## System-Triggered Notifications

Our app has several automated notifications triggered by database changes (e.g., request status updates, new approvals, etc.). These system-generated notifications should seamlessly integrate with our push notification system when users have selected push as their preferred notification method.

### Integration with Database Triggers

- [ ] **Update Database Triggers**
  - [ ] Modify existing database functions to check user preferences before sending notifications
  - [ ] Ensure triggers pass appropriate metadata for notification routing
  - [ ] Add notification type categorization to all system messages

```sql
-- Example trigger function that generates notifications on status changes
CREATE OR REPLACE FUNCTION notify_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
  preference TEXT;
  push_token TEXT;
BEGIN
  -- Get user who should receive this notification
  recipient_id := NEW.user_id;

  -- Check user's notification preference
  SELECT contact_preference INTO preference
  FROM user_preferences
  WHERE user_id = recipient_id;

  -- Insert into notifications table regardless of delivery method
  INSERT INTO notifications (
    user_id,
    message,
    notification_type,
    related_id,
    importance_level
  ) VALUES (
    recipient_id,
    'Your request status has changed to: ' || NEW.status,
    'status_update',
    NEW.id,
    CASE WHEN NEW.status = 'approved' THEN 'high' ELSE 'medium' END
  ) RETURNING id INTO notification_id;

  -- If user prefers push notifications, queue it for delivery
  IF preference = 'push' THEN
    -- Get active push tokens for this user
    FOR push_token IN
      SELECT pt.push_token
      FROM user_push_tokens pt
      WHERE pt.user_id = recipient_id AND pt.is_active = true
    LOOP
      INSERT INTO push_notification_queue (
        notification_id,
        user_id,
        push_token,
        title,
        body,
        data,
        scheduled_for
      ) VALUES (
        notification_id,
        recipient_id,
        push_token,
        'Request Update',
        'Your request status has changed to: ' || NEW.status,
        jsonb_build_object(
          'notificationType', 'status_update',
          'messageId', notification_id,
          'importance', CASE WHEN NEW.status = 'approved' THEN 'high' ELSE 'medium' END
        ),
        NOW()
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Create Push Notification Queue Table**

  ```sql
  CREATE TABLE IF NOT EXISTS public.push_notification_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID REFERENCES public.notifications(id),
      user_id UUID REFERENCES auth.users(id),
      push_token TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data JSONB DEFAULT '{}'::jsonb,
      status TEXT DEFAULT 'pending',
      error TEXT,
      scheduled_for TIMESTAMP WITH TIME ZONE,
      sent_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  CREATE INDEX idx_push_notification_queue_status ON public.push_notification_queue(status);
  CREATE INDEX idx_push_notification_queue_scheduled_for ON public.push_notification_queue(scheduled_for);
  ```

- [ ] **Create Processing Service**
  - [ ] Implement a queue processing function (via Edge Function or scheduled task)
  - [ ] Handle batching of notifications for efficiency
  - [ ] Process retries for failed deliveries

## Granular Notification Preferences

Users should have finer control over which notifications they receive as push notifications versus in-app only. This requires an enhanced preference system.

### Notification Categories and Preferences

- [ ] **Define Notification Categories**

  - [ ] Create schema for notification categories with importance levels

  ```sql
  CREATE TABLE IF NOT EXISTS public.notification_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      default_importance TEXT NOT NULL DEFAULT 'medium',
      is_mandatory BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  INSERT INTO notification_categories (name, code, description, default_importance, is_mandatory) VALUES
  ('System Alerts', 'system_alert', 'Critical system-wide alerts and announcements', 'high', true),
  ('Must-Read Messages', 'must_read', 'Important messages requiring acknowledgment', 'high', true),
  ('Admin Messages', 'admin_message', 'Messages from administrators', 'high', false),
  ('GCA Announcements', 'gca_announcement', 'General Chairman Association announcements', 'medium', false),
  ('Division Announcements', 'division_announcement', 'Division-specific announcements', 'medium', false),
  ('Status Updates', 'status_update', 'Updates on request statuses', 'medium', false),
  ('Roster Changes', 'roster_change', 'Changes to rosters or assignments', 'medium', false),
  ('General Messages', 'general_message', 'Regular messages from other users', 'low', false);
  ```

- [ ] **Create User Notification Preferences System**

  - [ ] Allow users to set preferences per category

  ```sql
  CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      category_code TEXT NOT NULL REFERENCES notification_categories(code) ON DELETE CASCADE,
      delivery_method TEXT NOT NULL DEFAULT 'default',
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      UNIQUE(user_id, category_code)
  );
  ```

- [ ] **Update Profile UI for Notification Preferences with Hybrid Priority Approach**

  - [ ] Add expanded notification settings screen with category controls that respects system priorities for critical notifications

  ```typescript
  // app/(profile)/notification-preferences.tsx
  import React, { useEffect, useState } from "react";
  import { ScrollView, StyleSheet, Switch, View, Platform } from "react-native";
  import { ThemedView } from "@/components/ThemedView";
  import { ThemedText } from "@/components/ThemedText";
  import { supabase } from "@/utils/supabase";
  import { useAuth } from "@/hooks/useAuth";
  import { TouchableOpacity } from "react-native";
  import { Ionicons } from "@expo/vector-icons";
  import { Colors } from "@/constants/Colors";
  import { useColorScheme } from "@/hooks/useColorScheme";

  type ColorScheme = keyof typeof Colors;

  // Delivery method options for notifications
  const deliveryMethods = [
    { id: "default", label: "Default (Based on Contact Preference)" },
    { id: "push", label: "Push Notification" },
    { id: "in_app", label: "In-App Only" },
    { id: "none", label: "None" },
  ];

  export default function NotificationPreferencesScreen() {
    const { session } = useAuth();
    const [categories, setCategories] = useState([]);
    const [preferences, setPreferences] = useState({});
    const [loading, setLoading] = useState(true);
    const theme = (useColorScheme() ?? "light") as ColorScheme;

    useEffect(() => {
      if (session?.user?.id) {
        fetchNotificationSettings();
      }
    }, [session?.user?.id]);

    async function fetchNotificationSettings() {
      setLoading(true);

      // Fetch all categories first
      const { data: categoriesData, error: catError } = await supabase
        .from("notification_categories")
        .select("*")
        .order("name");

      if (catError) {
        console.error("Error fetching categories:", catError);
        setLoading(false);
        return;
      }

      // Fetch user's current preferences
      const { data: prefsData, error: prefsError } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", session.user.id);

      if (prefsError) {
        console.error("Error fetching preferences:", prefsError);
      }

      // Transform preferences into a map for easier access
      const prefsMap = {};
      (prefsData || []).forEach((pref) => {
        prefsMap[pref.category_code] = {
          deliveryMethod: pref.delivery_method,
          enabled: pref.enabled,
        };
      });

      setCategories(categoriesData || []);
      setPreferences(prefsMap);
      setLoading(false);
    }

    async function updatePreference(categoryCode, field, value, isMandatory) {
      // If this is a mandatory notification and the user is trying to disable it,
      // we won't allow that change
      if (isMandatory && field === "enabled" && value === false) {
        alert("This notification type cannot be disabled as it contains critical information.");
        return;
      }

      // If this is a mandatory notification and the user is trying to set to "none",
      // we won't allow that change
      if (isMandatory && field === "deliveryMethod" && value === "none") {
        alert("Critical notifications cannot be set to 'None'. Please choose a different delivery method.");
        return;
      }

      // Update local state immediately for responsive UI
      setPreferences((prev) => ({
        ...prev,
        [categoryCode]: {
          ...(prev[categoryCode] || { deliveryMethod: "default", enabled: true }),
          [field]: value,
        },
      }));

      // Then update in database
      const { error } = await supabase.from("user_notification_preferences").upsert(
        {
          user_id: session.user.id,
          category_code: categoryCode,
          [field === "deliveryMethod" ? "delivery_method" : "enabled"]: value,
        },
        { onConflict: "user_id, category_code" }
      );

      if (error) {
        console.error("Error updating preference:", error);
        // Revert on error
        fetchNotificationSettings();
      }
    }

    return (
      <ScrollView style={styles.container}>
        <ThemedView style={styles.section}>
          <ThemedText type="title">Notification Preferences</ThemedText>
          <ThemedText style={styles.preferencesDescription}>
            Customize which notifications you receive and how they're delivered
          </ThemedText>

          {categories.map((category) => {
            const pref = preferences[category.code] || {
              deliveryMethod: "default",
              enabled: true,
            };

            const isMandatory = category.is_mandatory;

            return (
              <ThemedView key={category.code} style={styles.categoryItem}>
                <ThemedView style={styles.categoryHeader}>
                  <ThemedText type="subtitle">{category.name}</ThemedText>
                  <Switch
                    value={pref.enabled}
                    onValueChange={(value) => updatePreference(category.code, "enabled", value, isMandatory)}
                    trackColor={{ false: "#767577", true: Colors[theme].tint }}
                    thumbColor="#f4f3f4"
                    disabled={isMandatory} // Disable toggle for mandatory notifications
                  />
                </ThemedView>

                <ThemedText style={styles.categoryDescription}>{category.description}</ThemedText>

                {isMandatory && (
                  <ThemedView style={styles.mandatoryTag}>
                    <ThemedText style={styles.mandatoryText}>Required</ThemedText>
                  </ThemedView>
                )}

                <ThemedView style={styles.deliveryMethodContainer}>
                  <ThemedText style={styles.deliveryLabel}>Delivery Method:</ThemedText>

                  {deliveryMethods.map((method) => (
                    <ThemedView key={method.id} style={styles.radioOption}>
                      <TouchableOpacity
                        onPress={() => updatePreference(category.code, "deliveryMethod", method.id, isMandatory)}
                        style={styles.radioButton}
                        disabled={isMandatory && method.id === "none"} // Disable "None" option for mandatory notifications
                      >
                        <Ionicons
                          name={pref.deliveryMethod === method.id ? "radio-button-on" : "radio-button-off"}
                          size={24}
                          color={
                            isMandatory && method.id === "none"
                              ? Colors[theme].textDimmer // Dimmed color for disabled option
                              : pref.deliveryMethod === method.id
                              ? Colors[theme].tint
                              : Colors[theme].textDim
                          }
                        />
                        <ThemedText
                          style={[
                            styles.radioLabel,
                            isMandatory && method.id === "none" ? { color: Colors[theme].textDimmer } : null,
                          ]}
                        >
                          {method.label}
                          {isMandatory && method.id === "none" && " (Not Available)"}
                        </ThemedText>
                      </TouchableOpacity>
                    </ThemedView>
                  ))}
                </ThemedView>

                <ThemedView
                  style={[
                    styles.importanceIndicator,
                    {
                      backgroundColor:
                        category.default_importance === "high"
                          ? "rgba(255, 59, 48, 0.2)"
                          : category.default_importance === "medium"
                          ? "rgba(255, 149, 0, 0.2)"
                          : "rgba(52, 199, 89, 0.2)",
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.importanceLabel,
                      {
                        color:
                          category.default_importance === "high"
                            ? "#ff3b30"
                            : category.default_importance === "medium"
                            ? "#ff9500"
                            : "#34c759",
                      },
                    ]}
                  >
                    Priority: {category.default_importance.toUpperCase()}
                    {isMandatory ? " (Fixed)" : ""}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            );
          })}
        </ThemedView>
      </ScrollView>
    );
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    section: {
      marginBottom: 24,
      padding: 16,
      gap: 16,
      backgroundColor: Colors.dark.card,
      borderRadius: 12,
    },
    preferencesDescription: {
      marginBottom: 12,
      fontSize: 14,
    },
    categoryItem: {
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: Colors.dark.buttonBorder,
      backgroundColor: Colors.dark.card,
    },
    categoryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
      backgroundColor: Colors.dark.card,
    },
    categoryDescription: {
      marginBottom: 16,
      opacity: 0.7,
    },
    deliveryMethodContainer: {
      marginBottom: 16,
      backgroundColor: Colors.dark.card,
    },
    deliveryLabel: {
      fontWeight: "600",
      marginBottom: 8,
    },
    radioOption: {
      marginVertical: 4,
      backgroundColor: Colors.dark.card,
    },
    radioButton: {
      flexDirection: "row",
      alignItems: "center",
    },
    radioLabel: {
      marginLeft: 8,
    },
    importanceIndicator: {
      padding: 8,
      borderRadius: 4,
      alignSelf: "flex-start",
    },
    importanceLabel: {
      fontSize: 12,
      fontWeight: "600",
    },
    mandatoryTag: {
      backgroundColor: "rgba(255, 59, 48, 0.1)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      alignSelf: "flex-start",
      marginBottom: 12,
    },
    mandatoryText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#ff3b30",
    },
  });
  ```

### Notification Delivery Logic

- [ ] **Update Notification Sending Functions with Hybrid Priority Approach**

  - [ ] Check user preference for specific notification category
  - [ ] Enforce system priorities for mandatory notifications
  - [ ] Default to global preference if no category-specific preference exists

  ```typescript
  // In notificationService.ts

  async function shouldSendPushNotification(
    userId: string,
    categoryCode: string,
    importance: string
  ): Promise<boolean> {
    try {
      // First check if the category is mandatory (system-critical)
      const { data: category, error: categoryError } = await supabase
        .from("notification_categories")
        .select("is_mandatory, default_importance")
        .eq("code", categoryCode)
        .single();

      if (categoryError) {
        console.error("Error checking category:", categoryError);
        // Default to sending for safety if we can't determine
        return true;
      }

      // If this is a mandatory high-importance notification, always send it
      if (category?.is_mandatory && category.default_importance === "high") {
        return true;
      }

      // Check if the user has a specific preference for this category
      const { data: categoryPref, error: catError } = await supabase
        .from("user_notification_preferences")
        .select("delivery_method, enabled")
        .eq("user_id", userId)
        .eq("category_code", categoryCode)
        .single();

      if (catError && catError.code !== "PGRST116") {
        // PGRST116 is "no rows returned"
        console.error("Error checking category preference:", catError);
      }

      // If user has a specific preference for this category and it's enabled
      if (categoryPref) {
        // If the category is explicitly disabled and not mandatory, don't send
        if (!categoryPref.enabled && !category?.is_mandatory) return false;

        // Return true if delivery method is 'push'
        if (categoryPref.delivery_method === "push") return true;

        // Return false if delivery method is 'in_app' or 'none' (unless mandatory)
        if (
          categoryPref.delivery_method === "in_app" ||
          (categoryPref.delivery_method === "none" && !category?.is_mandatory)
        ) {
          return false;
        }
      }

      // If we're here, either no specific preference exists or it's set to "default"
      // So we check the global preference
      const { data: userPref, error: userError } = await supabase
        .from("user_preferences")
        .select("contact_preference")
        .eq("user_id", userId)
        .single();

      if (userError) {
        console.error("Error checking user preference:", userError);
        return category?.is_mandatory || false; // If mandatory, still send even if error
      }

      // If global preference is push, check importance level
      if (userPref?.contact_preference === "push") {
        // Always send high importance notifications
        if (importance === "high") return true;

        // For medium and low importance, check additional preferences
        // This could be expanded to check more complex rules
        return importance !== "low"; // Send medium and high only
      }

      // Final fallback - send mandatory notifications, don't send others
      return category?.is_mandatory || false;
    } catch (error) {
      console.error("Error in shouldSendPushNotification:", error);
      return false;
    }
  }
  ```

## Color Scheme and Styling Guide

To maintain consistency with the app's existing design language, the notification components should follow these styling guidelines:

### Color Conventions

- **Text on Dark Backgrounds**:
  - Light text: `Colors.dark.text`
  - Dark backgrounds: `Colors.dark.background` or `Colors.dark.card`
- **Buttons**:
  - Dark text on light background: `Colors.dark.buttonText` on `Colors.dark.buttonBackground`
  - Secondary buttons: `Colors.dark.buttonTextSecondary` on `Colors.dark.buttonBackgroundSecondary`
- **Borders**:
  - Primary borders: `Colors.dark.buttonBorder`
  - Secondary borders: `Colors.dark.buttonBorderSecondary`
- **Interactive Elements**:
  - Accent/tint color for interactions: `Colors.dark.tint`
  - Dimmed text for secondary information: `Colors.dark.textDim`

### Component Styling Example

```typescript
// Example button styling
const buttonStyles = StyleSheet.create({
  primaryButton: {
    backgroundColor: Colors.dark.buttonBackground,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: Colors.dark.buttonBorderSecondary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: Colors.dark.buttonTextSecondary,
  },
});

// Example card styling
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  cardContent: {
    color: Colors.dark.text,
  },
  dimText: {
    color: Colors.dark.textDim,
    fontSize: 14,
  },
});
```

### Notification Preferences Screen

Update the notification preferences screen styles to match the app's color scheme:

```typescript
// app/(profile)/notification-preferences.tsx
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

type ColorScheme = keyof typeof Colors;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    gap: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
  },
  preferencesDescription: {
    marginBottom: 12,
    fontSize: 14,
    color: Colors.dark.text,
  },
  categoryItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
    backgroundColor: Colors.dark.card,
  },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  categoryDescription: {
    marginBottom: 16,
    opacity: 0.7,
    color: Colors.dark.text,
  },
  deliveryMethodContainer: {
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  deliveryLabel: {
    fontWeight: "600",
    marginBottom: 8,
    color: Colors.dark.text,
  },
  radioOption: {
    marginVertical: 4,
    backgroundColor: Colors.dark.card,
  },
  radioButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioLabel: {
    marginLeft: 8,
    color: Colors.dark.text,
  },
  actionButton: {
    backgroundColor: Colors.dark.buttonBackground,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 16,
  },
  actionButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderColor: Colors.dark.buttonBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: Colors.dark.buttonTextSecondary,
  },
});
```

## Notification Prioritization

Notifications should be prioritized based on their category and importance level, with highest priority taking precedence:

- [ ] **Implement Priority-Based Display Logic**

  - [ ] Create priority levels based on notification categories:

    ```typescript
    // Priority mapping for notification categories
    const NOTIFICATION_PRIORITIES = {
      system_alert: 100, // Highest priority
      must_read: 90,
      admin_message: 80,
      gca_announcement: 70,
      division_announcement: 60,
      status_update: 50,
      roster_change: 40,
      general_message: 30, // Lowest priority
    };
    ```

  - [ ] Enhance notification handler to process based on priority:

    ```typescript
    // In notificationConfig.ts
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data || {};
        const categoryCode = data.categoryCode || "general_message";
        const importance = data.importance || "medium";

        // Platform-specific presentation options
        if (Platform.OS === "ios") {
          // iOS-specific behavior
          return {
            shouldShowAlert: true,
            shouldPlaySound: importance !== "low",
            shouldSetBadge: true,
            // iOS-specific category
            categoryIdentifier: getIOSCategoryIdentifier(categoryCode),
          };
        } else if (Platform.OS === "android") {
          // Android-specific behavior
          let priority = Notifications.AndroidNotificationPriority.DEFAULT;
          let channelId = "default";

          // Determine priority and channel
          if (importance === "high" || ["system_alert", "must_read", "admin_message"].includes(categoryCode)) {
            priority = Notifications.AndroidNotificationPriority.MAX;
            channelId = "urgent";
          } else if (importance === "low") {
            priority = Notifications.AndroidNotificationPriority.LOW;
            channelId = "updates";
          }

          return {
            shouldShowAlert: true,
            shouldPlaySound: importance !== "low",
            shouldSetBadge: true,
            priority,
            channelId,
            // Android-specific customization
            color: "#0066cc",
            vibrate: importance !== "low",
          };
        }

        // Default for other platforms
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      },
    });

    // Helper to map category to iOS category identifier
    function getIOSCategoryIdentifier(categoryCode: string): string {
      switch (categoryCode) {
        case "must_read":
        case "admin_message":
          return "urgent";
        case "gca_announcement":
        case "division_announcement":
          return "announcement";
        default:
          return "message";
      }
    }
    ```

- [ ] **Implement Grouping for Related Notifications**

  - [ ] Group notifications by category when displaying in notification center
  - [ ] Add summary text for grouped notifications

  ```typescript
  // Example sending function with grouping
  async function sendGroupedNotification(userId, title, body, categoryCode, messageId, groupKey) {
    return await sendTypedPushNotification(
      userId,
      title,
      body,
      getNotificationTypeFromCategory(categoryCode),
      messageId,
      {
        categoryCode,
        groupKey, // For grouping related notifications
        groupSummary: `${groupKey} Updates`, // Summary text for the group
      }
    );
  }
  ```

## Simplified Badge Management

Badge counts should be synchronized across devices naturally by using the global read status of messages:

- [ ] **Badge Count Management**

  - [ ] Create a simple badge store to manage badge counts:

    ```typescript
    // store/badgeStore.ts
    import { create } from "zustand";
    import * as Notifications from "expo-notifications";
    import { supabase } from "@/utils/supabase";
    import { Platform } from "react-native";

    interface BadgeState {
      unreadCount: number;
      loading: boolean;
      fetchUnreadCount: (userId: string) => Promise<number>;
    }

    export const useBadgeStore = create<BadgeState>((set, get) => ({
      unreadCount: 0,
      loading: false,

      fetchUnreadCount: async (userId: string) => {
        try {
          set({ loading: true });

          // Get global unread count from messages table
          const { count, error } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("recipient_id", userId)
            .is("is_read", false);

          if (error) throw error;

          const unreadCount = count || 0;
          set({ unreadCount });

          // Update device badge
          if (Platform.OS !== "web") {
            await Notifications.setBadgeCountAsync(unreadCount);
          }

          return unreadCount;
        } catch (error) {
          console.error("Error fetching unread count:", error);
          return get().unreadCount;
        } finally {
          set({ loading: false });
        }
      },
    }));
    ```

- [ ] **Realtime Badge Syncing**

  - [ ] Subscribe to message changes to keep badge count updated:

    ```typescript
    // In _layout.tsx or equivalent app root
    import { useBadgeStore } from "@/store/badgeStore";
    import { useAuth } from "@/hooks/useAuth";
    import { AppState } from "react-native";

    // Inside the component
    const { session } = useAuth();
    const { fetchUnreadCount } = useBadgeStore();

    // Set up Realtime subscription to update badge counts
    useEffect(() => {
      let subscription;

      const setupRealtimeSubscription = async () => {
        if (!session?.user?.id) return;

        // Initial badge count fetch
        await fetchUnreadCount(session.user.id);

        // Subscribe to message changes
        subscription = supabase
          .channel("message_updates")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `recipient_id=eq.${session.user.id}`,
            },
            async () => {
              // Update badge count when messages change
              await fetchUnreadCount(session.user.id);
            }
          )
          .subscribe();
      };

      setupRealtimeSubscription();

      return () => {
        // Clean up subscription
        if (subscription) {
          supabase.removeChannel(subscription);
        }
      };
    }, [session?.user?.id]);

    // Reset badge count when app comes to foreground
    useEffect(() => {
      const subscription = AppState.addEventListener("change", (nextAppState) => {
        if (nextAppState === "active" && session?.user?.id) {
          fetchUnreadCount(session.user.id);
        }
      });

      return () => {
        subscription.remove();
      };
    }, [session?.user?.id]);
    ```

- [ ] **Mark Messages as Read**

  - [ ] Use the existing message read status system:

    ```typescript
    // Using existing functions like markMessageRead from notificationService
    export async function markMessageRead(messageId: string, userId: string) {
      try {
        // Update message read status
        const { error } = await supabase
          .from("messages")
          .update({ is_read: true })
          .eq("id", messageId)
          .eq("recipient_id", userId);

        if (error) throw error;

        // Update badge count after marking as read
        const { fetchUnreadCount } = useBadgeStore.getState();
        await fetchUnreadCount(userId);
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    }
    ```

    The badge count system will use the global read status of messages rather than device-specific tracking:

- Badge counts will be synchronized across devices naturally through the existing message read status
- When a message is marked as read on one device, it will be considered read on all devices
- No device-specific tracking tables or functions are required

This simplified approach eliminates unnecessary complexity while maintaining consistent badge counts for users across all their devices.

## Platform-Specific Notification Handling

iOS and Android have different notification behaviors and requirements, so we need platform-specific handling:

- [ ] **iOS-Specific Configuration**

  - [ ] Set up notification categories for rich interactions:

    ```typescript
    // iOS-specific notification setup
    async function setupIOSCategories() {
      if (Platform.OS !== "ios") return;

      // Define actions for notifications
      const readAction = {
        identifier: "READ_ACTION",
        buttonTitle: "Mark as Read",
        options: {
          isAuthenticationRequired: false,
        },
      };

      const replyAction = {
        identifier: "REPLY_ACTION",
        buttonTitle: "Reply",
        options: {
          isAuthenticationRequired: false,
        },
        textInput: {
          buttonTitle: "Send",
          placeholder: "Type your reply...",
        },
      };

      // Set up different categories
      await Notifications.setNotificationCategoryAsync("message", [readAction, replyAction]);

      await Notifications.setNotificationCategoryAsync("announcement", [readAction]);

      // Add critical alert category (requires special entitlement)
      await Notifications.setNotificationCategoryAsync("urgent", [readAction], {
        importance: Notifications.AndroidImportance.HIGH,
        sound: true,
        vibrate: true,
        // For critical alerts (requires entitlement)
        // criticalSound: true,
      });
    }
    ```

- [ ] **Android-Specific Configuration**

  - [ ] Enhance channel setup with better descriptions and groups:

    ```typescript
    // Android-specific notification setup
    async function setupAndroidChannels() {
      if (Platform.OS !== "android") return;

      // Create channel group
      await Notifications.setNotificationChannelGroupAsync("pld_app", {
        name: "PLD App Notifications",
      });

      // High priority channel for urgent notifications
      await Notifications.setNotificationChannelAsync("urgent", {
        name: "Urgent Notifications",
        description: "Critical notifications that require immediate attention",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
        sound: "notification.wav",
        enableLights: true,
        enableVibrate: true,
        groupId: "pld_app",
      });

      // Default channel for most notifications
      await Notifications.setNotificationChannelAsync("default", {
        name: "Regular Notifications",
        description: "Standard notifications about messages and updates",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 0, 250],
        enableLights: true,
        enableVibrate: true,
        groupId: "pld_app",
      });

      // Low priority channel for less important updates
      await Notifications.setNotificationChannelAsync("updates", {
        name: "App Updates",
        description: "Non-urgent app updates and information",
        importance: Notifications.AndroidImportance.LOW,
        enableLights: false,
        enableVibrate: false,
        groupId: "pld_app",
      });
    }
    ```

- [ ] **Platform-Aware Notification Handlers**

  - [ ] Create specialized handling for each platform:

    ```typescript
    // Enhanced notification handler with platform-specific logic
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data || {};
        const categoryCode = data.categoryCode || "general_message";
        const importance = data.importance || "medium";

        // Platform-specific presentation options
        if (Platform.OS === "ios") {
          // iOS-specific behavior
          return {
            shouldShowAlert: true,
            shouldPlaySound: importance !== "low",
            shouldSetBadge: true,
            // iOS-specific category
            categoryIdentifier: getIOSCategoryIdentifier(categoryCode),
          };
        } else if (Platform.OS === "android") {
          // Android-specific behavior
          let priority = Notifications.AndroidNotificationPriority.DEFAULT;
          let channelId = "default";

          // Determine priority and channel
          if (importance === "high" || ["system_alert", "must_read", "admin_message"].includes(categoryCode)) {
            priority = Notifications.AndroidNotificationPriority.HIGH;
            channelId = "urgent";
          } else if (importance === "low") {
            priority = Notifications.AndroidNotificationPriority.LOW;
            channelId = "updates";
          }

          return {
            shouldShowAlert: true,
            shouldPlaySound: importance !== "low",
            shouldSetBadge: true,
            priority,
            channelId,
            // Android-specific customization
            color: "#0066cc",
            vibrate: importance !== "low",
          };
        }

        // Default for other platforms
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      },
    });

    // Helper to map category to iOS category identifier
    function getIOSCategoryIdentifier(categoryCode: string): string {
      switch (categoryCode) {
        case "must_read":
        case "admin_message":
          return "urgent";
        case "gca_announcement":
        case "division_announcement":
          return "announcement";
        default:
          return "message";
      }
    }
    ```

## Robust Retry Mechanism

Since users in your industry may have devices off for extended periods (up to 12 hours), we need a robust retry mechanism:

- [ ] **Implement Exponential Backoff Retry System**

  - [ ] Create a specialized queue table for retries:

    ```sql
    -- Enhanced notification queue with retry tracking
    CREATE TABLE IF NOT EXISTS public.push_notification_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id UUID REFERENCES public.notifications(id),
        user_id UUID REFERENCES auth.users(id),
        push_token TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        data JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'pending',
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        max_attempts INTEGER DEFAULT 10,
        first_attempted_at TIMESTAMP WITH TIME ZONE,
        last_attempted_at TIMESTAMP WITH TIME ZONE,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    -- Add indices for the queue processor
    CREATE INDEX IF NOT EXISTS idx_push_notification_queue_status ON public.push_notification_queue(status);
    CREATE INDEX IF NOT EXISTS idx_push_notification_queue_next_attempt ON public.push_notification_queue(next_attempt_at)
      WHERE status = 'pending' OR status = 'failed';
    ```

- [ ] **Queue Processing with Adaptive Backoff**

  - [ ] Create an edge function to process the queue with smart retries:

    ```typescript
    // supabase/functions/process-notification-queue/index.ts
    import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
    import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    serve(async (req) => {
      // Handle CORS preflight request
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: corsHeaders,
          status: 204,
        });
      }

      try {
        // Create Supabase client
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Process pending notifications
        await processNotificationQueue(supabaseClient);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
    });

    async function processNotificationQueue(supabase) {
      // Get pending notifications that are due for processing
      const { data: pendingNotifications, error } = await supabase
        .from("push_notification_queue")
        .select("*")
        .or(`status.eq.pending,status.eq.failed`)
        .lte("next_attempt_at", new Date().toISOString())
        .lt("retry_count", 10) // Max attempts
        .order("next_attempt_at", { ascending: true })
        .limit(50);

      if (error) throw error;

      if (!pendingNotifications || pendingNotifications.length === 0) {
        console.log("No pending notifications to process");
        return;
      }

      console.log(`Processing ${pendingNotifications.length} notifications`);

      // Process each notification
      const processingPromises = pendingNotifications.map((notification) =>
        processNotification(supabase, notification)
      );

      await Promise.allSettled(processingPromises);
    }

    async function processNotification(supabase, notification) {
      try {
        const now = new Date();
        const isFirstAttempt = notification.retry_count === 0;

        // Update retry count and timestamps
        const updatedFields = {
          retry_count: notification.retry_count + 1,
          last_attempted_at: now.toISOString(),
          first_attempted_at: isFirstAttempt ? now.toISOString() : notification.first_attempted_at,
        };

        // Send push notification
        const result = await sendPushNotification({
          to: notification.push_token,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        });

        if (result.success) {
          // Success - mark as sent
          await supabase
            .from("push_notification_queue")
            .update({
              ...updatedFields,
              status: "sent",
              sent_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", notification.id);
        } else {
          // Failed - schedule retry with backoff
          const nextAttemptAt = calculateNextAttemptTime(notification.retry_count);

          await supabase
            .from("push_notification_queue")
            .update({
              ...updatedFields,
              status: "failed",
              error: result.error || "Unknown error",
              next_attempt_at: nextAttemptAt.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq("id", notification.id);
        }
      } catch (error) {
        console.error(`Error processing notification ${notification.id}:`, error);
      }
    }

    // Calculate next attempt time with increasing backoff
    function calculateNextAttemptTime(retryCount) {
      const now = new Date();

      // Implement the requested retry strategy:
      // 1-3 retries in 60 secs
      // 1-3 retries in 10 mins
      // Then hourly retries
      // Continue for up to 24 hours

      if (retryCount <= 3) {
        // First 3 retries: 20 seconds apart
        return new Date(now.getTime() + 20 * 1000);
      } else if (retryCount <= 6) {
        // Next 3 retries: ~3 minutes apart
        return new Date(now.getTime() + 3 * 60 * 1000);
      } else if (retryCount <= 12) {
        // Next 6 retries: hourly
        return new Date(now.getTime() + 60 * 60 * 1000);
      } else {
        // Beyond 12 retries: every 2 hours until max attempts
        return new Date(now.getTime() + 2 * 60 * 60 * 1000);
      }
    }

    // Mock function for sending the push notification
    // Replace with actual implementation
    async function sendPushNotification({ to, title, body, data }) {
      try {
        // In a real implementation, call the Expo push notification service
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to,
            title,
            body,
            data,
          }),
        });

        const result = await response.json();

        if (result.data && result.data.status === "ok") {
          return { success: true };
        } else {
          return {
            success: false,
            error: result.errors ? result.errors[0].message : "Push service returned an error",
          };
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    ```

- [ ] **Scheduled Queue Processing**

  - [ ] Set up a cron job to process the queue regularly:

    ```sql
    -- Set up a cron job to process the queue every minute
    SELECT cron.schedule(
      'process-notification-queue',
      '* * * * *',
      $$
      SELECT http_post(
        url:='https://your-project-url.supabase.co/functions/v1/process-notification-queue',
        headers:='{
          "Content-Type": "application/json",
          "Authorization": "Bearer your-service-role-key"
        }'::jsonb
      );
      $$
    );
    ```

- [ ] **Notification Status Tracking**

  - [ ] Add status tracking for end-to-end delivery confirmation:

    ```typescript
    // In pushTokenStore.ts - Add method to track delivery status
    trackNotificationStatus: async (messageId: string, status: "sent" | "delivered" | "failed" | "read") => {
      try {
        const { error } = await supabase.from("push_notification_deliveries").upsert(
          {
            message_id: messageId,
            status,
            [status === "delivered" ? "delivered_at" : status === "read" ? "read_at" : "updated_at"]:
              new Date().toISOString(),
          },
          { onConflict: "message_id" }
        );

        if (error) throw error;
      } catch (error) {
        console.error(`Error tracking notification status:`, error);
      }
    };
    ```

## Hybrid Notification Priority System

The notification system will implement a hybrid approach that balances system-defined priorities with user preferences:

- [ ] **System-Defined Critical Priorities**

  - [ ] Maintain fixed high priority for critical notifications:
    - System alerts will always use maximum priority
    - Must-read messages will always use high priority
    - Messages marked as requiring acknowledgment maintain high priority
    - Safety-critical communications cannot be downgraded by user preferences

- [ ] **User-Controlled Subscription Model**

  - [ ] Allow users to subscribe/unsubscribe from non-critical notification types:

    - Division announcements
    - GCA announcements
    - Regular messages
    - Status updates
    - Roster changes

  - [ ] Allow delivery method customization while preserving priority:

    ```typescript
    // Example API for sending with hybrid priority approach
    async function sendNotificationWithHybridPriority(
      userId: string,
      notification: {
        title: string;
        body: string;
        categoryCode: string;
        messageId: string;
        requiresAcknowledgment?: boolean;
      }
    ) {
      // Get the category's default importance and mandatory status
      const { data: category } = await supabase
        .from("notification_categories")
        .select("default_importance, is_mandatory")
        .eq("code", notification.categoryCode)
        .single();

      // If requires acknowledgment, force high importance
      const importance = notification.requiresAcknowledgment ? "high" : category?.default_importance || "medium";

      // Check if we should send via push based on user preferences
      // but honor the system-defined priority if it's sent
      const shouldSendPush = await shouldSendPushNotification(userId, notification.categoryCode, importance);

      if (shouldSendPush) {
        // System-defined priority is preserved even if user subscribed to this category
        // This ensures critical notifications are always delivered with appropriate urgency
        const notificationType = getNotificationTypeFromCategory(notification.categoryCode);
        const priority = getPriorityForNotification(notification.categoryCode, importance);

        await sendPushWithSystemPriority(
          userId,
          notification.title,
          notification.body,
          notificationType,
          notification.messageId,
          priority
        );
      }
    }
    ```

- [ ] **Priority Enforcement**

  - [ ] Create logic in notification service to enforce system-defined priorities:

    ```typescript
    // Example of priority enforcement logic
    function getPriorityForNotification(
      categoryCode: string,
      userSelectedImportance: string
    ): AndroidNotificationPriority {
      // System-defined overrides
      if (categoryCode === "system_alert") return Notifications.AndroidNotificationPriority.MAX;
      if (categoryCode === "must_read") return Notifications.AndroidNotificationPriority.HIGH;

      // Map importance to Android priority levels
      switch (userSelectedImportance) {
        case "high":
          return Notifications.AndroidNotificationPriority.HIGH;
        case "medium":
          return Notifications.AndroidNotificationPriority.DEFAULT;
        case "low":
          return Notifications.AndroidNotificationPriority.LOW;
        default:
          return Notifications.AndroidNotificationPriority.DEFAULT;
      }
    }
    ```

The hybrid approach ensures that:

1. Critical safety communications are always delivered with appropriate urgency
2. Users have control over which non-critical notifications they receive
3. System-defined priorities for critical notifications cannot be downgraded
4. The user experience remains consistent with the importance of the notification content

## Notification System Architecture Overview

The push notification system architecture follows a modern, scalable approach using Zustand stores for state management rather than React Context providers. This section provides a comprehensive overview of how the entire system fits together.

### System Bootstrapping and Initialization

- [ ] **Root-Level Initialization in `_layout.tsx`**

  ```typescript
  // app/_layout.tsx
  import * as Notifications from "expo-notifications";
  import { useEffect } from "react";
  import { usePushTokenStore } from "@/store/pushTokenStore";
  import { useAuth } from "@/hooks/useAuth";
  import { configureNotifications } from "@/utils/notificationConfig";
  import { AppState, Platform } from "react-native";

  export default function RootLayout() {
    const { session, authStatus } = useAuth();
    const { registerDevice, unregisterDevice, refreshToken } = usePushTokenStore();

    // One-time notification configuration
    useEffect(() => {
      // Platform-specific configuration (independent of auth state)
      if (Platform.OS !== "web") {
        configureNotifications();
      }

      // Set up notification response handler
      const responseListener = setupNotificationTapHandler();

      // Check for initial notification (app opened from notification)
      getInitialNotification();

      return () => {
        // Clean up listener on unmount
        if (responseListener) {
          Notifications.removeNotificationSubscription(responseListener);
        }
      };
    }, []);

    // Auth-dependent token registration
    useEffect(() => {
      if (authStatus === "authenticated" && session?.user?.id && Platform.OS !== "web") {
        console.log("[PushNotification] Auth initialized, registering token");
        registerDevice(session.user.id);

        return () => {
          if (authStatus !== "authenticated") {
            unregisterDevice();
          }
        };
      }
    }, [authStatus, session?.user?.id]);

    // AppState handler for token refresh
    useEffect(() => {
      if (Platform.OS === "web") return;

      const subscription = AppState.addEventListener("change", (nextAppState) => {
        if (nextAppState === "active" && authStatus === "authenticated" && session?.user?.id) {
          // Refresh token when app comes to foreground
          refreshToken(session.user.id);
        }
      });

      return () => {
        subscription.remove();
      };
    }, [authStatus, session?.user?.id]);

    // Rest of layout component...
  }
  ```

### State Management Architecture

Instead of using React Context for notification state, we use a collection of focused Zustand stores:

- [ ] **Dedicated Stores for Different Concerns**

  1. **`pushTokenStore`**: Manages device registration and push tokens

     - Handles token generation, registration, and refresh
     - Tracks device information and app version
     - Provides token status to the rest of the app

  2. **`badgeStore`**: Manages notification badge counts

     - Tracks unread message counts
     - Updates app badge numbers
     - Synchronizes across devices via Supabase

  3. **`notificationPreferencesStore`**: Manages user notification preferences
     - Loads user preferences for different notification categories
     - Provides an API for updating preferences
     - Caches preferences for better performance

  ```typescript
  // Example of how stores interact without a context provider
  import { usePushTokenStore } from "@/store/pushTokenStore";
  import { useBadgeStore } from "@/store/badgeStore";

  function NotificationScreen() {
    // Get notification state from stores directly - no context needed
    const pushToken = usePushTokenStore((state) => state.expoPushToken);
    const unreadCount = useBadgeStore((state) => state.unreadCount);
    const fetchUnreadCount = useBadgeStore((state) => state.fetchUnreadCount);
    const { session } = useAuth();

    useEffect(() => {
      if (session?.user?.id) {
        fetchUnreadCount(session.user.id);
      }
    }, [session?.user?.id]);

    // Rest of component...
  }
  ```

### Information Flow Architecture

The notification system's information flow follows this pattern:

1. **Initialization Flow**:

   ```
   App Start → Platform Config → Auth State → Token Registration → Realtime Subscriptions
   ```

2. **Notification Reception Flow**:

   ```
   Server Sends Notification → Expo Push Service → Device Receives → Handler Processes → UI Updates
   ```

3. **Notification Response Flow**:

   ```
   User Taps Notification → Response Handler → Route Determination → Navigation → Read Status Update
   ```

4. **Background Processing Flow**:

   ```
   Background Notification → Task Handler → Database Update → Badge Update → System Notification
   ```

### Component Integration Without Context

Since we're using Zustand, components can directly access notification state without props or context:

```typescript
// Any component can access notification state directly
function MessageItem({ message }) {
  // Pull just the pieces of state needed by this component
  const markAsRead = usePushTokenStore((state) => state.markAsRead);

  const handlePress = () => {
    markAsRead(message.id);
    // Navigate to message detail
  };

  return <TouchableOpacity onPress={handlePress}>{/* Message UI */}</TouchableOpacity>;
}
```

### Advantages of This Architecture

1. **Reduced Component Tree Complexity**: No need for nested context providers
2. **Better Performance**: Zustand is optimized for frequent state updates
3. **Selective Re-rendering**: Components only re-render when their specific slice of state changes
4. **Simpler Testing**: Easier to test components in isolation
5. **More Modular**: Each store handles a specific concern
6. **Persistence Built-in**: Zustand's persistence middleware simplifies storing state

### Integration with Existing Systems

The notification system integrates with other app systems:

- **Authentication**: Coordinated with auth state to register tokens
- **Navigation**: Uses Expo Router for deep linking and navigation
- **Database**: Uses Supabase for persistance and realtime updates
- **App State**: Responds to foreground/background transitions
- **Permissions**: Manages notification permissions gracefully
- **User Preferences**: Respects user delivery preferences

This architecture provides a scalable, maintainable notification system that avoids the common pitfalls of Context-based approaches while providing clean separation of concerns and efficient state management.
