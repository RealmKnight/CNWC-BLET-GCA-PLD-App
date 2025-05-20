import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  getUnreadMessageCount,
  handleNotificationDeepLink,
  markMessageRead,
  markNotificationDelivered,
} from "./notificationService";
import * as TaskManager from "expo-task-manager";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";

const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND-NOTIFICATION-TASK";

type NotificationData = {
  notification: Notifications.Notification;
};

// Define notification types enum
export enum NotificationType {
  REGULAR_MESSAGE = "regular_message",
  ADMIN_MESSAGE = "admin_message",
  GCA_ANNOUNCEMENT = "gca_announcement",
  DIVISION_ANNOUNCEMENT = "division_announcement",
  SYSTEM_ALERT = "system_alert",
  MUST_READ = "must_read",
  MEETING_REMINDER = "meeting_reminder",
}

// Define notification category priorities
export const NOTIFICATION_PRIORITIES = {
  system_alert: 100, // Highest priority
  must_read: 90,
  admin_message: 80,
  gca_announcement: 70,
  division_announcement: 60,
  status_update: 50,
  meeting_reminder: 45, // Add meeting reminders with medium-high priority
  roster_change: 40,
  general_message: 30, // Lowest priority
};

// Register background task
TaskManager.defineTask<NotificationData>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.error("[PushNotification] Background task error:", error);
      return;
    }

    if (!data?.notification) {
      console.warn(
        "[PushNotification] No notification data in background task",
      );
      return;
    }

    const { notification } = data;
    const content = notification.request.content;
    const messageId = content.data?.messageId as string;
    const userId = content.data?.userId as string;
    const notificationType = content.data?.notificationType as NotificationType;
    const requiresAcknowledgment = content.data
      ?.requiresAcknowledgment as boolean;

    console.log("[PushNotification] Background notification received:", {
      messageId,
      userId,
      notificationType,
      requiresAcknowledgment,
    });

    try {
      // Process notification delivery
      if (messageId) {
        await markNotificationDelivered(messageId);

        // Process notification actions based on type
        const trigger = notification.request.trigger;
        if (trigger && "type" in trigger && trigger.type === "push") {
          switch (notificationType) {
            case NotificationType.ADMIN_MESSAGE:
              // Process admin messages
              console.log(
                "[PushNotification] Processing admin message in background",
              );
              break;
            case NotificationType.GCA_ANNOUNCEMENT:
              // Process GCA announcements
              console.log(
                "[PushNotification] Processing GCA announcement in background",
              );
              break;
            case NotificationType.DIVISION_ANNOUNCEMENT:
              // Process division announcements
              console.log(
                "[PushNotification] Processing division announcement in background",
              );
              break;
            default:
              // Process regular notifications
              console.log(
                "[PushNotification] Processing regular message in background",
              );
              break;
          }
        }

        // Check if the notification was actioned
        const actionId = notification.request.content.data?.actionId as string;
        if (actionId) {
          // Handle different action types
          switch (actionId) {
            case "READ_ACTION":
              console.log(
                "[PushNotification] Processing READ action in background",
              );
              await markMessageRead(messageId);
              break;
            case "ACKNOWLEDGE_ACTION":
              console.log(
                "[PushNotification] Processing ACKNOWLEDGE action in background",
              );
              await markMessageRead(messageId);
              // Additional acknowledgment handling here
              break;
            default:
              console.log(`[PushNotification] Unknown action: ${actionId}`);
              break;
          }
        }

        // Update badge count
        if (userId) {
          try {
            const unreadCount = await getUnreadMessageCount(Number(userId));
            await Notifications.setBadgeCountAsync(unreadCount);
            console.log(
              `[PushNotification] Updated badge count to ${unreadCount} in background`,
            );
          } catch (error) {
            console.error(
              "[PushNotification] Error updating badge in background:",
              error,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "[PushNotification] Background task processing error:",
        error,
      );
    }
  },
);

export function configureNotifications() {
  // Enhanced foreground notification handler with priority-based behavior
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data || {};
      const messageType = data.messageType as string;
      const notificationType = data.notificationType as NotificationType;
      const requiresAcknowledgment = data.requiresAcknowledgment as boolean;
      const importance = data.importance as string || "medium";
      const categoryCode = data.categoryCode as string || "general_message";
      const groupKey = data.groupKey as string;

      console.log("[PushNotification] Handling foreground notification:", {
        messageType,
        notificationType,
        importance,
        categoryCode,
        groupKey,
      });

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

        // Determine priority and channel based on message type and importance
        if (
          messageType === "must_read" ||
          requiresAcknowledgment ||
          importance === "high" ||
          notificationType === NotificationType.ADMIN_MESSAGE ||
          notificationType === NotificationType.SYSTEM_ALERT ||
          notificationType === NotificationType.MUST_READ ||
          categoryCode === "system_alert" ||
          categoryCode === "must_read"
        ) {
          priority = Notifications.AndroidNotificationPriority.MAX;
          channelId = "urgent";
        } else if (
          notificationType === NotificationType.GCA_ANNOUNCEMENT ||
          notificationType === NotificationType.DIVISION_ANNOUNCEMENT ||
          importance === "medium"
        ) {
          priority = Notifications.AndroidNotificationPriority.DEFAULT;
          channelId = "default";
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
          // Enable grouping if a group key is provided
          groupSummary: groupKey ? true : undefined,
          groupId: groupKey,
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

  // Register background task handler
  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);

  // Configure platform-specific settings
  if (Platform.OS === "android") {
    setupAndroidChannels();
  } else if (Platform.OS === "ios") {
    setupIOSCategories();
  }
}

// Android-specific notification setup with enhanced channel configuration
async function setupAndroidChannels() {
  try {
    // Create channel group
    await Notifications.setNotificationChannelGroupAsync("pld_app", {
      name: "PLD App Notifications",
      description: "All notifications from the PLD App",
    });

    // Critical priority channel for urgent/important notifications
    await Notifications.setNotificationChannelAsync("urgent", {
      name: "Urgent Notifications",
      description: "Critical notifications that require immediate attention",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250, 250, 250],
      lightColor: "#FF231F7C",
      // Using default system sound
      enableLights: true,
      enableVibrate: true,
      groupId: "pld_app",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Default channel for most notifications
    await Notifications.setNotificationChannelAsync("default", {
      name: "Regular Notifications",
      description: "Standard notifications about messages and updates",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 0, 250],
      lightColor: "#0066cc",
      enableLights: true,
      enableVibrate: true,
      groupId: "pld_app",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    // Low priority channel for less important updates
    await Notifications.setNotificationChannelAsync("updates", {
      name: "App Updates",
      description: "Non-urgent app updates and information",
      importance: Notifications.AndroidImportance.LOW,
      enableLights: false,
      enableVibrate: false,
      groupId: "pld_app",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    // Division specific channel for division-related content
    await Notifications.setNotificationChannelAsync("division", {
      name: "Division Notifications",
      description: "Notifications specific to your division",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150, 0, 150],
      lightColor: "#32CD32",
      enableLights: true,
      enableVibrate: true,
      groupId: "pld_app",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    // GCA channel for organization-wide announcements
    await Notifications.setNotificationChannelAsync("gca", {
      name: "GCA Announcements",
      description: "Organization-wide announcements and updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150, 0, 150],
      lightColor: "#1E90FF",
      enableLights: true,
      enableVibrate: true,
      groupId: "pld_app",
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    console.log("[PushNotification] Android notification channels configured");
  } catch (error) {
    console.error(
      "[PushNotification] Error setting up Android channels:",
      error,
    );
  }
}

// iOS-specific notification setup with enhanced categories for interactive notifications
async function setupIOSCategories() {
  try {
    // Define actions for notifications
    const readAction = {
      identifier: "READ_ACTION",
      buttonTitle: "Mark as Read",
      options: {
        isAuthenticationRequired: false,
        isDestructive: false,
        foreground: true,
      },
    };

    const replyAction = {
      identifier: "REPLY_ACTION",
      buttonTitle: "Reply",
      options: {
        isAuthenticationRequired: false,
        isDestructive: false,
        foreground: true,
      },
      textInput: {
        buttonTitle: "Send",
        placeholder: "Type your reply...",
      },
    };

    const acknowledgeAction = {
      identifier: "ACKNOWLEDGE_ACTION",
      buttonTitle: "Acknowledge",
      options: {
        isAuthenticationRequired: false,
        isDestructive: false,
        foreground: true,
      },
    };

    const viewDetailsAction = {
      identifier: "VIEW_ACTION",
      buttonTitle: "View Details",
      options: {
        isAuthenticationRequired: false,
        isDestructive: false,
        foreground: true,
      },
    };

    const dismissAction = {
      identifier: "DISMISS_ACTION",
      buttonTitle: "Dismiss",
      options: {
        isAuthenticationRequired: false,
        isDestructive: true,
        foreground: false,
      },
    };

    // General message category (regular messages)
    await Notifications.setNotificationCategoryAsync("message", [
      readAction,
      replyAction,
      dismissAction,
    ]);

    // Announcement category (GCA or division)
    await Notifications.setNotificationCategoryAsync("announcement", [
      readAction,
      viewDetailsAction,
      dismissAction,
    ]);

    // Admin message category (requires acknowledgment)
    await Notifications.setNotificationCategoryAsync("admin_message", [
      acknowledgeAction,
      viewDetailsAction,
      dismissAction,
    ]);

    // Add urgent category for high priority messages
    await Notifications.setNotificationCategoryAsync("urgent", [
      acknowledgeAction,
      viewDetailsAction,
    ], {
      allowAnnouncement: true,
      showTitle: true,
      showSubtitle: true,
    });

    console.log("[PushNotification] iOS notification categories configured");
  } catch (error) {
    console.error("[PushNotification] Error setting up iOS categories:", error);
  }
}

// Helper to map category to iOS category identifier
function getIOSCategoryIdentifier(categoryCode: string): string {
  switch (categoryCode) {
    case "must_read":
    case "system_alert":
      return "urgent";
    case "admin_message":
      return "admin_message";
    case "gca_announcement":
    case "division_announcement":
      return "announcement";
    default:
      return "message";
  }
}

export function setupNotificationListeners() {
  // Handle notifications that are received while the app is foregrounded
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const messageId = notification.request.content.data?.messageId as string;
      if (messageId) {
        markNotificationDelivered(messageId);
      }
    },
  );

  // Handle notifications that are tapped by the user
  const responseSubscription = Notifications
    .addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const actionIdentifier = response.actionIdentifier;

      console.log("[PushNotification] Notification tapped:", {
        data,
        actionIdentifier,
      });

      // Use the platform-specific deep linking handler
      handleNotificationDeepLink(data, actionIdentifier)
        .catch((error) => {
          console.error(
            "[PushNotification] Error in deep linking handler:",
            error,
          );
        });
    });

  // Return cleanup function
  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
    Notifications.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  };
}

// Handle notifications for app cold starts
export async function getInitialNotification() {
  try {
    const initialNotification = await Notifications
      .getLastNotificationResponseAsync();

    if (initialNotification) {
      // App was launched by a notification
      const data = initialNotification.notification.request.content.data;
      const actionIdentifier = initialNotification.actionIdentifier;

      console.log("[PushNotification] App launched from notification:", {
        data,
        actionIdentifier,
      });

      // Short delay ensures app is fully initialized
      setTimeout(() => {
        // Use the platform-specific deep linking handler for initial notifications as well
        handleNotificationDeepLink(data, actionIdentifier)
          .catch((error) => {
            console.error(
              "[PushNotification] Error handling initial notification:",
              error,
            );
          });
      }, 1000);
    }
  } catch (error) {
    console.error(
      "[PushNotification] Error getting initial notification:",
      error,
    );
  }
}

// Initialize badge count for the app
export async function initializeBadgeCount(userId: string | number) {
  try {
    if (!userId) return;

    const unreadCount = await getUnreadMessageCount(Number(userId));
    await Notifications.setBadgeCountAsync(unreadCount);
    console.log(`[PushNotification] Badge count set to ${unreadCount}`);
  } catch (error) {
    console.error("[PushNotification] Error initializing badge count:", error);
  }
}

// Register for push notifications and return token
export async function registerForPushNotificationsAsync() {
  let token;

  if (!Device.isDevice) {
    console.log(
      "[PushNotification] Push notifications require physical device",
    );
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
    console.log("[PushNotification] Permission denied for notifications");
    return null;
  }

  // Get project ID from app config
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    console.error("[PushNotification] Project ID not found in app config");
    return null;
  }

  // Get Expo push token
  try {
    const expoPushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = expoPushToken.data;
  } catch (error) {
    console.error("[PushNotification] Error getting push token:", error);
    return null;
  }

  return token;
}
