import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { markNotificationDelivered, markMessageRead, getUnreadMessageCount } from "./notificationService";
import * as TaskManager from "expo-task-manager";
import { router } from "expo-router";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

type NotificationData = {
  notification: Notifications.Notification;
};

// Register background task
TaskManager.defineTask<NotificationData>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background task error:", error);
    return;
  }

  if (!data?.notification) return;

  const messageId = data.notification.request.content.data?.messageId;

  if (messageId) {
    await markNotificationDelivered(messageId as string);
  }
});

export function configureNotifications() {
  // Configuration for how notifications should be presented when the app is in the foreground
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const messageType = notification.request.content.data?.messageType as string;
      const requiresAcknowledgment = notification.request.content.data?.requiresAcknowledgment as boolean;

      return {
        shouldShowAlert: true,
        shouldPlaySound: messageType === "must_read",
        shouldSetBadge: true,
        priority:
          messageType === "must_read"
            ? Notifications.AndroidNotificationPriority.HIGH
            : Notifications.AndroidNotificationPriority.DEFAULT,
      };
    },
  });

  // Register background task handler
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

  // Only configure additional settings on iOS
  if (Platform.OS === "ios") {
    Notifications.setNotificationCategoryAsync("default", [
      {
        identifier: "default",
        buttonTitle: "View",
        options: {
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      },
    ]);
  }
}

function handleNotificationNavigation(messageType: string, messageId: string) {
  switch (messageType) {
    case "must_read":
    case "news":
      router.push(`/messages/${messageId}`);
      break;
    case "approval":
    case "denial":
    case "waitlist_promotion":
      router.push(`/calendar/requests/${messageId}`);
      break;
    case "allotment_change":
      router.push("/calendar");
      break;
    case "direct_message":
      router.push(`/messages/direct/${messageId}`);
      break;
    default:
      router.push("/");
  }
}

export function setupNotificationListeners() {
  // Handle notifications that are received while the app is foregrounded
  const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
    const messageId = notification.request.content.data?.messageId as string;
    if (messageId) {
      markNotificationDelivered(messageId);
    }
  });

  // Handle notifications that are tapped by the user
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const messageId = response.notification.request.content.data?.messageId as string;
    const messageType = response.notification.request.content.data?.messageType as string;
    const requiresAcknowledgment = response.notification.request.content.data?.requiresAcknowledgment as boolean;

    if (messageId) {
      // Mark as delivered
      markNotificationDelivered(messageId);

      // If the message requires acknowledgment, we'll handle that in the UI
      // but still navigate to the appropriate screen
      handleNotificationNavigation(messageType, messageId);
    }
  });

  // Return cleanup function
  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
    Notifications.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  };
}

// Initialize badge count
export async function initializeBadgeCount(userId: string) {
  if (Platform.OS !== "web") {
    const unreadCount = await getUnreadMessageCount(userId);
    await Notifications.setBadgeCountAsync(unreadCount);
  }
}

// Reset badge count
export async function resetBadgeCount() {
  if (Platform.OS !== "web") {
    await Notifications.setBadgeCountAsync(0);
  }
}
