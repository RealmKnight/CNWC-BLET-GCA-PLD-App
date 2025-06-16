// Notification Service - Implementation of the hybrid notification approach with robust retry mechanism
//
// This service handles all notification-related functionality:
// - It implements a hybrid notification approach that balances system-defined priorities with user preferences
// - Critical system messages will always be delivered with appropriate urgency
// - Non-critical notifications respect user preferences
// - Users can customize delivery methods on a per-category basis
// - The system supports multiple delivery methods: push, in-app, email, and SMS
//
// ROBUST RETRY MECHANISM:
// - Implements a reliable delivery system for push notifications with an exponential backoff retry strategy
// - Notifications are added to a persistent queue (push_notification_queue table) for processing
// - A dedicated Edge Function (process-notification-queue) processes the queue every minute via a cron job
// - Failed deliveries are automatically retried with increasing intervals:
//   * First 3 retries: 20 seconds apart
//   * Next 3 retries: ~3 minutes apart
//   * Next 6 retries: hourly
//   * Beyond that: every 2 hours until max attempts
// - This allows handling cases where users have devices off for extended periods (up to 12-24 hours)
// - Delivery metrics are tracked for analytics and monitoring
// - Stuck notifications can be automatically detected and manually reprocessed
//
// Key functions:
// - sendNotificationWithHybridPriority: Main function for sending notifications that respects user preferences
// - shouldSendPushNotification: Determines if a notification should be sent via push based on preferences
// - enqueueNotification: Adds a notification to the queue for reliable delivery with retry
// - Helper functions for specific notification types (e.g., sendAdminMessageHybrid)
//
// Integration points:
// - This service integrates with user_notification_preferences table for user settings
// - It checks notification_categories for system-defined importance levels
// - All notification sending in the app should go through this service
// - Delivery monitoring is handled through push_notification_deliveries and notification_analytics tables

import { supabase } from "./supabase";
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { AdminMessage } from "@/types/adminMessages"; // Import AdminMessage type
import Constants from "expo-constants";
import * as Device from "expo-device";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationType } from "@/types/notifications";
import { formatPhoneToE164 } from "./phoneValidation";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  badge?: number;
}

type MessageType =
  | "must_read"
  | "news"
  | "direct_message"
  | "approval"
  | "denial"
  | "waitlist_promotion"
  | "allotment_change"
  | "admin_message"
  | "member_message";

interface MessagePayload {
  recipientPinNumber: number;
  subject: string;
  content: string;
  topic: string;
  event?: string;
  messageType: MessageType;
  requiresAcknowledgment?: boolean;
  metadata?: Record<string, unknown>;
}

interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
}

// Add a new interface for the contact info
interface UserContactInfo {
  email: string | null;
  phone: string | null;
}

interface MemberData {
  id: string;
  pin_number: number;
  user_preferences:
    | Array<{
      push_token: string | null;
      contact_preference: string | null;
    }>
    | null;
  auth_users: AuthUser;
}

interface UserPreferences {
  push_token: string | null;
  contact_preference: string | null;
}

interface MemberWithPreferences {
  pin_number: number;
  user_preferences: UserPreferences | null;
  auth_users?: {
    phone: string;
    email: string;
  } | null;
}

// Set up function injection for notificationConfig to prevent circular imports
export function initializeNotificationServiceIntegration() {
  // Dynamically import to avoid circular dependencies
  import("./notificationConfig").then(
    ({ injectNotificationServiceFunctions }) => {
      injectNotificationServiceFunctions({
        getUnreadMessageCount,
        markMessageRead,
        markNotificationDelivered,
        handleNotificationDeepLink,
      });
    },
  ).catch((error) => {
    console.error(
      "[NotificationService] Failed to inject functions into config:",
      error,
    );
  });
}

// Function to get unread message count for a user
export async function getUnreadMessageCount(userId: number): Promise<number> {
  try {
    // Query unread messages count
    const { count, error } = await supabase
      .from("user_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) throw error;

    return count || 0;
  } catch (error) {
    console.error("[NotificationService] Error getting unread count:", error);
    return 0;
  }
}

// Function to mark a message as read
export async function markMessageRead(
  messageId: string,
  userId?: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", messageId);

    if (error) throw error;

    // If we have a userId, update badge count
    if (userId) {
      try {
        // Dynamically import to avoid circular dependencies
        const { useBadgeStore } = await import("@/store/badgeStore");
        const { fetchUnreadCount } = useBadgeStore.getState();
        // Update badge count after marking as read
        await fetchUnreadCount(userId);
      } catch (err) {
        console.error("[NotificationService] Error updating badge count:", err);
      }
    }
  } catch (error) {
    console.error(
      "[NotificationService] Error marking message as read:",
      error,
    );
  }
}

/**
 * Enqueue a notification for reliable delivery with retry mechanism
 *
 * This function adds a notification to the push_notification_queue table,
 * which will be processed by the process-notification-queue Edge Function.
 * The queue processor implements an exponential backoff retry strategy:
 * - First 3 retries: 20 seconds apart
 * - Next 3 retries: ~3 minutes apart
 * - Next 6 retries: hourly
 * - Beyond that: every 2 hours until max attempts (default: 10)
 *
 * This allows handling cases where users have devices off for extended periods
 * (up to 12-24 hours) while maintaining reliable delivery.
 *
 * @param userId The user ID who will receive the notification
 * @param pushToken The push token of the device to send to
 * @param title Notification title
 * @param body Notification body
 * @param data Additional data to include with the notification
 * @param notificationId Optional ID of the notification for tracking
 * @param priority Optional priority ('default' | 'normal' | 'high')
 * @param maxAttempts Maximum number of retry attempts (default: 10)
 * @returns The ID of the queued notification or null if failed
 */
export async function enqueueNotification(
  userId: string,
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, any> = {},
  notificationId?: string,
  priority: "default" | "normal" | "high" = "default",
  maxAttempts: number = 10,
): Promise<string | null> {
  try {
    // Set scheduled time for immediate processing
    const now = new Date().toISOString();

    // Prepare the queue entry with proper typing
    const queueEntry: {
      user_id: string;
      push_token: string;
      title: string;
      body: string;
      data: Record<string, any>;
      status: string;
      retry_count: number;
      next_attempt_at: string;
      max_attempts: number;
      created_at: string;
      updated_at: string;
      notification_id?: string;
    } = {
      user_id: userId,
      push_token: pushToken,
      title,
      body,
      data: {
        ...data,
        // Add priority to data for the push notification handler
        importance: priority,
      },
      status: "pending",
      retry_count: 0,
      next_attempt_at: now,
      max_attempts: maxAttempts,
      created_at: now,
      updated_at: now,
    };

    // Add notification_id if provided
    if (notificationId) {
      queueEntry.notification_id = notificationId;
    }

    // Insert into queue
    const { data: insertedData, error } = await supabase
      .from("push_notification_queue")
      .insert(queueEntry)
      .select("id")
      .single();

    if (error) {
      console.error(
        "[NotificationService] Error enqueueing notification:",
        error,
      );
      return null;
    }

    console.log(
      `[NotificationService] Notification enqueued with ID: ${insertedData.id}`,
    );
    return insertedData.id;
  } catch (error) {
    console.error(
      "[NotificationService] Exception enqueueing notification:",
      error,
    );
    return null;
  }
}

// Update the existing sendPushNotification function to use the queue for robust delivery
export async function sendPushNotification(
  message: PushMessage,
): Promise<boolean> {
  try {
    // For immediate delivery with reliability, use the queue
    const queueId = await enqueueNotification(
      message.data?.userId as string || "unknown",
      message.to,
      message.title,
      message.body,
      message.data || {},
      message.data?.messageId as string,
      message.priority || "default",
      10, // Max attempts
    );

    // Return success if we successfully enqueued the notification
    return !!queueId;
  } catch (error) {
    console.error(
      "[NotificationService] Error sending push notification:",
      error,
    );
    return false;
  }
}

// Helper function to determine the iOS category identifier based on notification type
function getIOSCategoryForNotificationType(
  notificationType?: string,
  categoryCode?: string,
): string | undefined {
  if (!notificationType && !categoryCode) return undefined;

  // First check based on notificationType
  if (notificationType) {
    switch (notificationType) {
      case "system_alert":
      case "must_read":
        return "urgent";
      case "admin_message":
        return "admin_message";
      case "gca_announcement":
      case "division_announcement":
        return "announcement";
      case "regular_message":
        return "message";
    }
  }

  // Fallback to categoryCode if available
  if (categoryCode) {
    switch (categoryCode) {
      case "system_alert":
      case "must_read":
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

  return "message"; // Default fallback
}

// Function to send SMS using Twilio through Supabase Edge Function
async function sendSMS(to: string, content: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: { to, content },
    });

    if (error) throw error;
    return data?.success || false;
  } catch (error) {
    console.error("Error sending SMS:", error);
    return false;
  }
}

// Function to send email through SMTP
async function sendEmail(
  to: string,
  subject: string,
  content: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to, subject, content },
    });

    if (error) throw error;
    return data?.success || false;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

// Function to truncate content for SMS
function truncateForSMS(content: string): string {
  if (content.length <= 30) return content;
  return content.substring(0, 27) + "...";
}

// Function to check if a push notification should be sent based on user preferences
export async function shouldSendPushNotification(
  userId: string,
  categoryCode: string,
  importance: string,
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

// After the truncateForSMS function, add a new function to format HTML emails

// Function to create HTML email content
function formatEmailContent(subject: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #ffffff;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      background-color: #003366;
      margin-bottom: 20px;
    }
    .header img {
      max-width: 200px;
      height: auto;
    }
    .content {
      padding: 20px;
      background-color: #f9f9f9;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .button {
      background-color: #003366;
      color: white !important;
      padding: 10px 20px;
      text-decoration: none;
      border-radius: 4px;
      display: inline-block;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      padding: 20px;
      font-size: 12px;
      color: #666;
      border-top: 1px solid #eee;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        padding: 10px !important;
      }
      .content {
        padding: 15px !important;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png" 
           alt="BLET Logo" 
           style="max-width: 200px; height: auto;">
    </div>
    <div class="content">
      <h2 style="color: #003366; margin-bottom: 20px;">${subject}</h2>
      <div>${message}</div>
    </div>
    <div class="footer">
      <p>This is an automated message from the BLET WC GCA PLD App.</p>
      <p>Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// Fix the NotificationAttempt interface to include "in_app"
interface NotificationAttempt {
  method: "push" | "email" | "text" | "in_app";
  success: boolean;
  error?: string;
}

// Update the sendMessageWithNotification function to use our hybrid notification approach for determining delivery methods. Keep the basic flow the same, but incorporate hybrid preference checks.

export async function sendMessageWithNotification(
  senderPinNumber: number,
  recipientPinNumbers: number[],
  subject: string,
  message: string,
  requiresAcknowledgment: boolean = false,
  messageType: MessageType = "direct_message",
): Promise<void> {
  try {
    const messagePayload: MessagePayload = {
      recipientPinNumber: senderPinNumber,
      subject,
      content: message,
      topic: "General",
      messageType,
      requiresAcknowledgment,
    };

    const senderPin = senderPinNumber.toString();
    const recipientPins = recipientPinNumbers.map((pin) => pin.toString());

    // Create message records for each recipient
    const { data: messages, error: messageError } = await supabase.schema(
      "public",
    ).from(
      "messages",
    ).insert(
      recipientPins.map((recipientPin) => ({
        sender_pin_number: senderPin,
        recipient_pin_number: recipientPin,
        subject,
        content: message,
        read_by: [],
        message_type: messageType,
        requires_acknowledgment: requiresAcknowledgment,
        read_at: null, // Initialize as unread
        metadata: {
          delivery_attempts: [],
        },
      })),
    ).select();

    if (messageError) throw messageError;

    if (!messages) {
      console.error("[Notification] No message records were created");
      return;
    }

    // Process notifications for each recipient based on their preferences
    await Promise.all(recipientPins.map(async (recipientPin) => {
      try {
        // Get member data first
        const { data: memberData, error: memberError } = await supabase
          .schema("public")
          .from("members")
          .select(`
            id, 
            pin_number
          `)
          .eq("pin_number", recipientPin)
          .single();

        if (memberError) {
          console.error(
            `[Notification] Error fetching member data for ${recipientPin}:`,
            memberError,
          );
          return;
        }

        if (!memberData) {
          console.error(
            `[Notification] No member found with pin ${recipientPin}`,
          );
          return;
        }

        // Then get user preferences
        const { data: userPreferences, error: preferencesError } =
          await supabase
            .schema("public")
            .from("user_preferences")
            .select(`
            contact_preference,
            push_token
          `)
            .eq("user_id", memberData.id)
            .maybeSingle();

        if (preferencesError) {
          console.error(
            `[Notification] Error fetching preferences for user ${memberData.id}:`,
            preferencesError,
          );
        }

        // Get user auth data using our custom function instead of admin API
        const response = await supabase
          .schema("public")
          .rpc("get_user_contact_info", { user_id: memberData.id })
          .single();

        const userContactInfo = response.data as {
          email: string | null;
          phone: string | null;
        } | null;
        const userContactError = response.error;

        // Default to empty values if there's an error or no data
        const email = userContactInfo?.email || null;
        const phone = userContactInfo?.phone || null;

        if (userContactError) {
          console.error(
            `[Notification] Error fetching auth user data for ${memberData.id}:`,
            userContactError,
          );
        }

        // Find messages for this recipient
        const recipientMessages = messages.filter(
          (msg) => msg.recipient_pin_number === recipientPin,
        );

        if (recipientMessages.length === 0) {
          console.warn(
            `[Notification] No messages found for recipient ${recipientPin}`,
          );
          return;
        }

        // Get the user preference
        const contactPreference = userPreferences?.contact_preference ||
          "in_app";
        const pushToken = userPreferences?.push_token;
        const userId = memberData.id;

        // Initialize delivery attempts array to track notification attempts
        const deliveryAttempts: NotificationAttempt[] = [];

        // Determine notification category and importance based on message type
        let categoryCode = "general_message";
        let importance = "medium";

        switch (messageType) {
          case "must_read":
            categoryCode = "must_read";
            importance = "high";
            break;
          case "admin_message":
            categoryCode = "admin_message";
            importance = "high";
            break;
          case "news":
            categoryCode = "gca_announcement";
            importance = "medium";
            break;
          default:
            categoryCode = "general_message";
            importance = requiresAcknowledgment ? "high" : "medium";
            break;
        }

        // Process each message for this recipient
        for (const msg of recipientMessages) {
          console.log(
            `[Notification] Processing message ${msg.id} for recipient ${recipientPin} with preference ${contactPreference}`,
          );

          // First always create an in-app notification regardless of preference
          deliveryAttempts.push({
            method: "in_app",
            success: true,
          });

          // Check if push notification should be sent based on hybrid preferences
          if (
            pushToken && Platform.OS !== "web" &&
            (contactPreference === "push" ||
              await shouldSendPushNotification(
                userId,
                categoryCode,
                importance,
              ))
          ) {
            // Send push notification
            const pushSuccess = await attemptPushNotification(
              pushToken,
              subject,
              message,
              msg.id,
              messageType,
              requiresAcknowledgment,
              0, // unreadCount will be updated by the client
              {},
              userId, // Send userId instead of recipientPin
            );

            deliveryAttempts.push({
              method: "push",
              success: pushSuccess,
              error: pushSuccess
                ? undefined
                : "Failed to send push notification",
            });
          } else if (contactPreference === "email" && email) {
            // Send email notification
            const htmlContent = formatEmailContent(subject, message);
            const emailSuccess = await sendEmail(email, subject, htmlContent);

            deliveryAttempts.push({
              method: "email",
              success: emailSuccess,
              error: emailSuccess
                ? undefined
                : "Failed to send email notification",
            });
          } else if (contactPreference === "text" && phone) {
            // Format and send SMS notification
            // Truncate content if needed
            const smsContent = `${subject}\n${truncateForSMS(message)}`;
            const smsSuccess = await sendSMS(phone, smsContent);

            deliveryAttempts.push({
              method: "text",
              success: smsSuccess,
              error: smsSuccess ? undefined : "Failed to send SMS notification",
            });
          }

          // Update message metadata with delivery attempts
          await supabase
            .schema("public")
            .from("messages")
            .update({
              metadata: {
                ...msg.metadata,
                delivery_attempts: deliveryAttempts,
                final_status: deliveryAttempts.some((d) => d.success)
                  ? "delivered"
                  : "failed",
                delivered_at: deliveryAttempts.some((d) => d.success)
                  ? new Date().toISOString()
                  : undefined,
                error_message: deliveryAttempts.every((d) => !d.success)
                  ? "All notification delivery attempts failed"
                  : undefined,
              },
            })
            .eq("id", msg.id);
        }
      } catch (error) {
        console.error(
          `[Notification] Error processing notifications for recipient ${recipientPin}:`,
          error,
        );
      }
    }));
  } catch (error) {
    console.error(
      "[Notification] Error sending message with notification:",
      error,
    );
    throw error;
  }
}

// Helper function for push notification attempts
async function attemptPushNotification(
  pushToken: string,
  subject: string,
  content: string,
  messageId: string,
  messageType: MessageType,
  requiresAcknowledgment: boolean,
  unreadCount: number,
  payload: Record<string, unknown>,
  recipientId: string,
): Promise<boolean> {
  try {
    // Determine the category code based on message type
    let categoryCode = "general_message";
    let importance = "medium";

    // Map message types to notification categories
    switch (messageType) {
      case "must_read":
        categoryCode = "must_read";
        importance = "high";
        break;
      case "admin_message":
        categoryCode = "admin_message";
        importance = "high";
        break;
      case "news":
        categoryCode = "gca_announcement";
        importance = "medium";
        break;
      default:
        categoryCode = "general_message";
        importance = "medium";
        break;
    }

    // If requires acknowledgment, increase importance
    if (requiresAcknowledgment) {
      importance = "high";
    }

    // Check if we should send the push notification based on user preferences
    const shouldSend = await shouldSendPushNotification(
      recipientId,
      categoryCode,
      importance,
    );

    // If we shouldn't send based on user preferences, exit early
    if (!shouldSend) {
      console.log(
        `[Push Notification] Skipping push based on user preferences for recipient ${recipientId}, category ${categoryCode}`,
      );
      return true; // Return true so we don't count this as a failure since it's by design
    }

    // Create notification data payload
    const notificationData = {
      messageId,
      messageType,
      requiresAcknowledgment,
      categoryCode,
      importance,
      userId: recipientId,
      unreadCount,
      ...payload,
    };

    // Build priority from importance
    const priority = importance === "high"
      ? "high"
      : importance === "medium"
      ? "normal"
      : "default";

    // Create a delivery record
    const { error: deliveryError } = await supabase
      .schema("public")
      .from("push_notification_deliveries")
      .insert({
        message_id: messageId,
        recipient_id: recipientId,
        push_token: pushToken,
        status: "sending",
      });

    if (deliveryError) {
      console.error(
        `[Push Notification] Error creating delivery record: ${deliveryError.message}`,
      );
    }

    // Add to the push notification queue for reliable delivery with retry
    const queueId = await enqueueNotification(
      recipientId,
      pushToken,
      subject,
      content,
      notificationData,
      messageId,
      priority as "default" | "normal" | "high",
      12, // Max attempts (about 24 hours with our backoff strategy)
    );

    // Update the delivery record with queued status
    await supabase
      .schema("public")
      .from("push_notification_deliveries")
      .update({
        status: queueId ? "queued" : "failed",
        error_message: queueId ? null : "Failed to enqueue notification",
      })
      .eq("message_id", messageId);

    return !!queueId;
  } catch (error) {
    console.error(
      "[Push Notification] Error sending push notification:",
      error,
    );
    return false;
  }
}

export async function markNotificationDelivered(messageId: string) {
  try {
    await supabase
      .from("user_notifications")
      .update({
        is_delivered: true,
        delivered_at: new Date().toISOString(),
      })
      .eq("id", messageId);
  } catch (error) {
    console.error(
      "[NotificationService] Error marking notification as delivered:",
      error,
    );
  }
}

// Test function for email Edge Function
export async function testEmailFunction(to: string): Promise<boolean> {
  try {
    console.log("Testing email function with recipient:", to);

    // Use the Edge Function with the SMTP configuration
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        to,
        subject: "Test Email with Logo",
        content: `
          <div style="text-align: center; padding: 20px;">
            <h1 style="color: #003366;">Email System Test</h1>
            <p style="font-size: 16px; line-height: 1.5;">
              This is a test email to verify that our email system is working correctly.
            </p>
            <p style="font-style: italic; color: #666; margin-top: 20px;">
              This is an automated test message. No action is required.
            </p>
          </div>
        `,
      },
    });

    if (error) {
      console.error("Error sending test email:", error);
      return false;
    }

    return data?.success || false;
  } catch (error) {
    console.error("Unexpected error in testEmailFunction:", error);
    return false;
  }
}

// Function to send password reset email via Edge Function with fallback
export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  try {
    console.log("[Auth] Sending password reset email to:", email);

    // Format the redirect URL - ensure it's properly formatted without any special characters
    const baseUrl = process.env.EXPO_PUBLIC_WEBSITE_URL?.replace(/\/$/, ""); // Remove trailing slash if present
    const redirectUrl = `${baseUrl}/change-password`;

    console.log("[Auth] Using redirect URL:", redirectUrl);

    // Primary method: Use Supabase Auth
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        redirectTo: redirectUrl,
      },
    );

    // If there's no error, we're done
    if (!resetError) {
      console.log(
        "[Auth] Reset password email sent successfully via Supabase auth service",
      );
      return true;
    }

    console.log(
      "[Auth] Supabase auth email failed with error:",
      resetError.message,
    );
    console.log(
      "[Auth] Supabase auth email failed, using Edge Function fallback",
    );

    // Fallback: Use Edge Function directly as a backup
    return await sendPasswordResetEmailViaEdgeFunction(email);
  } catch (error) {
    console.error("[Auth] Error in sendPasswordResetEmail:", error);
    return false;
  }
}

// Helper function to send password reset email via Edge Function
async function sendPasswordResetEmailViaEdgeFunction(
  email: string,
): Promise<boolean> {
  try {
    // Use the same URL construction as the primary method
    const baseUrl = process.env.EXPO_PUBLIC_WEBSITE_URL?.replace(/\/$/, "");
    const resetUrl = `${baseUrl}/change-password`;

    const { data, error } = await supabase.functions.invoke("send-email", {
      body: {
        to: email,
        subject: "Reset Your Password - BLET WC GCA PLD App",
        content: `
          <div style="text-align: center; padding: 20px;">
            <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png" 
                 alt="BLET Logo" 
                 style="max-width: 200px; height: auto;">
            <h1 style="color: #003366;">Reset Your Password</h1>
            <p style="font-size: 16px; line-height: 1.5;">
              We received a request to reset your password for the BLET WC GCA PLD App.
            </p>
            <p style="font-size: 16px; line-height: 1.5;">
              Please click the button below to reset your password:
            </p>
            <p style="text-align: center;">
              <a href="${resetUrl}"
                 style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </p>
            <p style="font-style: italic; color: #666; margin-top: 20px;">
              If you did not request a password reset, you can ignore this email.
            </p>
            <p style="font-style: italic; color: #666;">
              This is an automated message from the BLET WC GCA PLD App.
            </p>
          </div>
        `,
      },
    });

    if (error) {
      console.error(
        "[Auth] Error sending password reset email via Edge Function:",
        error,
      );
      return false;
    }

    return data?.success || false;
  } catch (error) {
    console.error(
      "[Auth] Error in sendPasswordResetEmailViaEdgeFunction:",
      error,
    );
    return false;
  }
}

// Register for push notifications
export async function registerForPushNotificationsAsync() {
  let token;

  if (!Device.isDevice) {
    console.warn(
      "[NotificationService] Push notifications require a physical device",
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
    console.log("[NotificationService] Permission denied for notifications");
    return null;
  }

  // Get project ID from app config
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    console.error("[NotificationService] Project ID not found in app config");
    return null;
  }

  // Get Expo push token
  try {
    const expoPushToken = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = expoPushToken.data;
  } catch (error) {
    console.error("[NotificationService] Error getting push token:", error);
    return null;
  }

  return token;
}

// Register a device token for a user
export async function registerDeviceToken(
  userId: string,
  token: string,
  deviceInfo: {
    deviceId: string;
    deviceName: string;
    platform: string;
    appVersion: string;
  },
) {
  if (!userId || !token) {
    console.error("[NotificationService] Missing userId or token");
    return null;
  }

  try {
    // Store token in database
    const { error } = await supabase.from("user_push_tokens").upsert({
      user_id: userId,
      push_token: token,
      device_id: deviceInfo.deviceId,
      device_name: deviceInfo.deviceName,
      platform: deviceInfo.platform,
      app_version: deviceInfo.appVersion,
      is_active: true,
      last_used: new Date().toISOString(),
    }, {
      onConflict: "user_id, device_id",
    });

    if (error) throw error;

    // Store in localStorage for persistence
    await AsyncStorage.setItem(
      "@pushToken",
      JSON.stringify({
        expoPushToken: token,
        lastRegistrationDate: new Date().toISOString(),
      }),
    );

    return token;
  } catch (error) {
    console.error(
      "[NotificationService] Error registering device token:",
      error,
    );
    return null;
  }
}

// Unregister a device token
export async function unregisterDeviceToken(token: string | null) {
  if (!token) {
    console.log("[NotificationService] No token to unregister");
    return;
  }

  try {
    // Mark token as inactive in database
    const { error } = await supabase
      .from("user_push_tokens")
      .update({ is_active: false, last_used: new Date().toISOString() })
      .eq("push_token", token);

    if (error) {
      console.error("[NotificationService] Error unregistering token:", error);
    }

    // Clear from local storage
    await AsyncStorage.removeItem("@pushToken");

    // Reset badge count for proper cleanup
    if (Platform.OS !== "web") {
      await Notifications.setBadgeCountAsync(0);
    }

    console.log("[NotificationService] Device token unregistered successfully");
  } catch (error) {
    console.error("[NotificationService] Error unregistering device:", error);
  }
}

// Clean up old tokens for a user
export async function cleanupOldTokensForUser(userId: string) {
  if (!userId) return;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Mark old tokens as inactive
    const { error } = await supabase
      .from("user_push_tokens")
      .update({ is_active: false })
      .eq("user_id", userId)
      .lt("last_used", thirtyDaysAgo.toISOString());

    if (error) {
      console.error(
        "[NotificationService] Error cleaning up old tokens:",
        error,
      );
    } else {
      console.log(
        "[NotificationService] Old tokens cleaned up for user:",
        userId,
      );
    }
  } catch (error) {
    console.error(
      "[NotificationService] Error in cleanupOldTokensForUser:",
      error,
    );
  }
}

// Get a unique device identifier
export async function getUniqueDeviceId(): Promise<string> {
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
    return `${Platform.OS}-${Date.now()}-${
      Math.random().toString(36).slice(2)
    }`;
  }
}

/**
 * Standardized notification type formatting functions
 */

// Base function for sending typed push notifications
export async function sendTypedPushNotification(
  userId: string,
  title: string,
  body: string,
  notificationType: NotificationType,
  messageId?: string,
  extraData: Record<string, any> = {},
): Promise<boolean> {
  try {
    // Map NotificationType to categoryCode for hybrid notifications
    let categoryCode: string;
    let importance: string = "medium";

    switch (notificationType) {
      case NotificationType.ADMIN_MESSAGE:
        categoryCode = "admin_message";
        importance = "high";
        break;
      case NotificationType.GCA_ANNOUNCEMENT:
        categoryCode = "gca_announcement";
        importance = "medium";
        break;
      case NotificationType.DIVISION_ANNOUNCEMENT:
        categoryCode = "division_announcement";
        importance = "medium";
        break;
      case NotificationType.SYSTEM_ALERT:
        categoryCode = "system_alert";
        importance = "high";
        break;
      case NotificationType.MUST_READ:
        categoryCode = "must_read";
        importance = "high";
        break;
      default:
        categoryCode = "general_message";
        importance = "medium";
        break;
    }

    // Use our hybrid notification system
    return await sendNotificationWithHybridPriority(userId, {
      title,
      body,
      categoryCode,
      messageId,
      requiresAcknowledgment: extraData?.requiresAcknowledgment,
      divisionName: extraData?.divisionName,
      extraData,
    });
  } catch (error) {
    console.error(
      "[NotificationService] sendTypedPushNotification error:",
      error,
    );
    return false;
  }
}

// Regular messages
export async function sendMessageNotification(
  userId: string,
  subject: string,
  body: string,
  messageId: string,
  requiresAcknowledgment: boolean = false,
): Promise<boolean> {
  // Use hybrid approach directly
  return sendNotificationWithHybridPriority(userId, {
    title: subject,
    body,
    categoryCode: requiresAcknowledgment ? "must_read" : "general_message",
    messageId,
    requiresAcknowledgment,
  });
}

// Admin messages
export async function sendAdminMessageNotification(
  userId: string,
  subject: string,
  body: string,
  messageId: string,
): Promise<boolean> {
  // Use admin message hybrid function
  return sendAdminMessageHybrid(userId, subject, body, messageId, true);
}

// GCA announcements
export async function sendGCAAnnouncementNotification(
  userId: string,
  title: string,
  body: string,
  announcementId: string,
): Promise<boolean> {
  // Use GCA announcement hybrid function
  return sendGCAAnnouncementHybrid(userId, title, body, announcementId);
}

// Division announcements
export async function sendDivisionAnnouncementNotification(
  userId: string,
  title: string,
  body: string,
  announcementId: string,
  divisionName: string,
): Promise<boolean> {
  // Use division announcement hybrid function
  return sendDivisionAnnouncementHybrid(
    userId,
    title,
    body,
    announcementId,
    divisionName,
  );
}

// Must read notifications
export async function sendMustReadNotification(
  userId: string,
  title: string,
  body: string,
  messageId: string,
): Promise<boolean> {
  // Use must-read hybrid function
  return sendMustReadHybrid(userId, title, body, messageId);
}

// System alerts
export async function sendSystemAlertNotification(
  userId: string,
  title: string,
  body: string,
  alertId?: string,
): Promise<boolean> {
  // Use system alert hybrid function
  return sendSystemAlertHybrid(userId, title, body, alertId);
}

/**
 * Send a notification using the hybrid priority approach
 *
 * This checks user preferences at both category and global levels
 * while respecting system-defined priorities for critical notifications
 */
export async function sendNotificationWithHybridPriority(
  userId: string,
  notification: {
    title: string;
    body: string;
    categoryCode: string;
    messageId?: string;
    requiresAcknowledgment?: boolean;
    divisionName?: string;
    extraData?: Record<string, any>;
  },
): Promise<boolean> {
  try {
    // Default values
    let importance: string = "medium";
    let isMandatory: boolean = false;

    // Get the category's default importance and mandatory status
    const { data: category, error: categoryError } = await supabase
      .from("notification_categories")
      .select("default_importance, is_mandatory")
      .eq("code", notification.categoryCode)
      .single();

    if (categoryError) {
      console.error(
        "[NotificationService] Error getting category info:",
        categoryError,
      );
      // Use defaults set above
    } else {
      // Update based on category information
      importance = notification.requiresAcknowledgment
        ? "high"
        : (category?.default_importance || "medium");
      isMandatory = category?.is_mandatory || false;
    }

    // Map category code to notification type
    let notificationType: NotificationType;
    switch (notification.categoryCode) {
      case "admin_message":
        notificationType = NotificationType.ADMIN_MESSAGE;
        break;
      case "gca_announcement":
        notificationType = NotificationType.GCA_ANNOUNCEMENT;
        break;
      case "division_announcement":
        notificationType = NotificationType.DIVISION_ANNOUNCEMENT;
        break;
      case "must_read":
        notificationType = NotificationType.MUST_READ;
        break;
      case "system_alert":
        notificationType = NotificationType.SYSTEM_ALERT;
        break;
      default:
        notificationType = NotificationType.REGULAR_MESSAGE;
        break;
    }

    // Get user's preference for this category
    const deliveryMethod = await getUserDeliveryMethodForCategory(
      userId,
      notification.categoryCode,
    );

    // Build extra data with all the necessary fields
    const extraData = {
      requiresAcknowledgment: notification.requiresAcknowledgment || false,
      categoryCode: notification.categoryCode,
      importance,
      isMandatory,
      ...(notification.divisionName
        ? { divisionName: notification.divisionName }
        : {}),
      ...(notification.extraData || {}),
    };

    // Determine if SMS should be sent
    const shouldSendSMS = await shouldSendSMSNotification(
      userId,
      notification.categoryCode,
      deliveryMethod,
      importance,
    );

    if (shouldSendSMS) {
      // Get user's phone number
      const phoneNumber = await getUserPhoneNumber(userId);

      if (phoneNumber) {
        // Format content for SMS (combine title and body)
        const fullContent = `${notification.title}\n\n${notification.body}`;

        // Send SMS with tracking
        const smsResult = await sendSMSWithTracking(
          userId,
          phoneNumber,
          fullContent,
          notification.messageId,
          notification.categoryCode,
          importance === "high" ? "high" : "normal",
        );

        if (smsResult.success) {
          console.log(`[SMS] Successfully sent to ${userId}`);

          // Always create in-app notification as fallback regardless of SMS success
          if (notification.messageId) {
            await createInAppNotificationFallback(
              userId,
              notification,
              "SMS sent successfully",
            );
          }

          return true;
        } else {
          console.error(`[SMS] Failed to send to ${userId}:`, smsResult.error);
          // Fallback to other delivery methods
          return await fallbackDeliveryMethod(
            userId,
            notification,
            deliveryMethod,
            extraData,
            notificationType,
          );
        }
      } else {
        console.warn(`[SMS] No phone number for user ${userId}`);
        return await fallbackDeliveryMethod(
          userId,
          notification,
          deliveryMethod,
          extraData,
          notificationType,
        );
      }
    }

    // Check if we should send via push based on user preferences
    const shouldSendPush = await shouldSendPushNotification(
      userId,
      notification.categoryCode,
      importance,
    );

    if (shouldSendPush) {
      // Send push notification since user preferences allow it
      return await sendTypedPushNotification(
        userId,
        notification.title,
        notification.body,
        notificationType,
        notification.messageId,
        extraData,
      );
    } else {
      console.log(
        `[NotificationService] Not sending push notification to ${userId} based on preferences`,
      );

      // If notification should be delivered but not as push, store in the database
      // for in-app retrieval if it has a message ID
      if (notification.messageId) {
        await supabase.from("notifications").upsert({
          id: notification.messageId,
          user_id: userId,
          title: notification.title,
          message: notification.body,
          notification_type: notificationType,
          category_code: notification.categoryCode,
          is_read: false,
          requires_acknowledgment: notification.requiresAcknowledgment || false,
          importance: importance,
          metadata: extraData,
          created_at: new Date().toISOString(),
        }, { onConflict: "id" });

        return true; // Successfully stored for in-app delivery
      }

      return false; // No push sent and no message ID to store
    }
  } catch (error) {
    console.error(
      "[NotificationService] Error in sendNotificationWithHybridPriority:",
      error,
    );
    return false;
  }
}

/**
 * Send admin message notification using the hybrid approach
 */
export async function sendAdminMessageHybrid(
  userId: string,
  title: string,
  body: string,
  messageId: string,
  requiresAcknowledgment: boolean = true,
): Promise<boolean> {
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "admin_message",
    messageId,
    requiresAcknowledgment,
  });
}

/**
 * Send GCA announcement notification using the hybrid approach
 */
export async function sendGCAAnnouncementHybrid(
  userId: string,
  title: string,
  body: string,
  announcementId: string,
): Promise<boolean> {
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "gca_announcement",
    messageId: announcementId,
  });
}

/**
 * Send division announcement notification using the hybrid approach
 */
export async function sendDivisionAnnouncementHybrid(
  userId: string,
  title: string,
  body: string,
  announcementId: string,
  divisionName: string,
): Promise<boolean> {
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "division_announcement",
    messageId: announcementId,
    divisionName,
  });
}

/**
 * Send must-read notification using the hybrid approach
 */
export async function sendMustReadHybrid(
  userId: string,
  title: string,
  body: string,
  messageId: string,
): Promise<boolean> {
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "must_read",
    messageId,
    requiresAcknowledgment: true,
  });
}

/**
 * Send system alert notification using the hybrid approach
 */
export async function sendSystemAlertHybrid(
  userId: string,
  title: string,
  body: string,
  alertId?: string,
): Promise<boolean> {
  // Use system alert hybrid function
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "system_alert",
    messageId: alertId,
    requiresAcknowledgment: true,
  });
}

/**
 * Send a grouped notification that will be visually grouped in the notification center
 *
 * @param userId User to send the notification to
 * @param title Notification title
 * @param body Notification body
 * @param categoryCode Category code for priority and user preferences
 * @param messageId Message ID for tracking and deep linking
 * @param groupKey Key used to group similar notifications together
 * @param groupSummary Text to display for the group summary (e.g. "3 new messages")
 * @param extraData Additional data to include with the notification
 */
export async function sendGroupedNotification(
  userId: string,
  title: string,
  body: string,
  categoryCode: string,
  messageId: string,
  groupKey: string,
  groupSummary: string = `${groupKey} Updates`,
  extraData: Record<string, any> = {},
): Promise<boolean> {
  // Use the hybrid notification system with grouping parameters
  return sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode,
    messageId,
    extraData: {
      ...extraData,
      groupKey,
      groupSummary,
    },
  });
}

// Helper function to map notification types to category codes
export function getNotificationCategoryFromType(
  notificationType: NotificationType,
): string {
  switch (notificationType) {
    case NotificationType.ADMIN_MESSAGE:
      return "admin_message";
    case NotificationType.GCA_ANNOUNCEMENT:
      return "gca_announcement";
    case NotificationType.DIVISION_ANNOUNCEMENT:
      return "division_announcement";
    case NotificationType.SYSTEM_ALERT:
      return "system_alert";
    case NotificationType.MUST_READ:
      return "must_read";
    default:
      return "general_message";
  }
}

/**
 * Handle platform-specific deep linking when a user taps on a notification
 * This function should be called from notification response handlers
 */
export async function handleNotificationDeepLink(
  notificationData: any,
  actionIdentifier?: string,
): Promise<void> {
  try {
    if (!notificationData) {
      console.warn(
        "[NotificationService] No notification data provided for deep linking",
      );
      return;
    }

    // Extract common data regardless of platform
    const messageId = notificationData.messageId as string;
    const notificationType = notificationData.notificationType as string;
    const divisionName = notificationData.divisionName as string;
    const requiresAcknowledgment = notificationData
      .requiresAcknowledgment as boolean;
    const meetingId = notificationData.meetingId as string;

    console.log("[NotificationService] Processing notification deep link:", {
      messageId,
      notificationType,
      divisionName,
      requiresAcknowledgment,
      meetingId,
      actionIdentifier,
    });

    // Mark as delivered first
    if (messageId) {
      markNotificationDelivered(messageId);
    }

    // Get current user ID from auth
    const userId = await getUserId();

    // Validate content before navigation with parallel checks for performance
    if (messageId) {
      try {
        const [contentExists, hasAccess, expirationStatus, archiveStatus] =
          await Promise.all([
            validateContentExists(notificationType, messageId),
            validateUserHasAccess(notificationType, messageId, userId),
            checkContentExpiration(notificationType, messageId),
            checkContentArchiveStatus(notificationType, messageId),
          ]);

        // Handle invalid content
        if (!contentExists) {
          showContentUnavailableMessage(notificationType);
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(
            notificationData,
            false,
            "content_not_found",
          );
          return;
        }

        // Handle permission issues
        if (!hasAccess) {
          showToast({
            type: "error",
            text1: "Access Denied",
            text2: "You do not have permission to view this content.",
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(
            notificationData,
            false,
            "access_denied",
          );
          return;
        }

        // Handle expired content
        if (expirationStatus.isExpired) {
          showToast({
            type: "info",
            text1: "Expired Content",
            text2: expirationStatus.message || "This content has expired.",
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(
            notificationData,
            false,
            "content_expired",
          );
          return;
        }

        // Handle archived content
        if (archiveStatus.isArchived) {
          showToast({
            type: "info",
            text1: "Archived Content",
            text2: archiveStatus.message || "This content has been archived.",
          });
          navigateToFallbackScreen(notificationType);
          trackNotificationNavigationResult(
            notificationData,
            false,
            "content_archived",
          );
          return;
        }
      } catch (validationError) {
        console.error(
          "[NotificationService] Validation error:",
          validationError,
        );
        // Continue with navigation in case of validation errors
        // This ensures users can still try to access content even if our validation fails
      }
    }

    // Handle specific platform behaviors
    if (Platform.OS === "ios") {
      // iOS-specific handling for interactive notification actions
      if (actionIdentifier) {
        switch (actionIdentifier) {
          case "READ_ACTION":
            // Mark as read without necessarily navigating
            if (messageId) {
              await markMessageRead(messageId);
              console.log(
                "[NotificationService] iOS: Message marked as read via action",
              );
            }
            return; // Don't navigate for this action

          case "ACKNOWLEDGE_ACTION":
            // Mark as acknowledged and navigate
            if (messageId) {
              await markMessageRead(messageId);
              console.log(
                "[NotificationService] iOS: Message acknowledged via action",
              );
            }
            break; // Continue with navigation

          case "DISMISS_ACTION":
            // Just dismiss without navigation
            console.log(
              "[NotificationService] iOS: Notification dismissed via action",
            );
            return; // Don't navigate

          case "REPLY_ACTION":
            // Handle inline reply
            console.log("[NotificationService] iOS: Reply action handled");
            // Note: The actual reply text would be handled in the notification response handler
            break;

          default:
            // For default action (or VIEW_ACTION), continue with navigation
            break;
        }
      }
    } else if (Platform.OS === "android") {
      // Android-specific handling
      if (actionIdentifier) {
        // Similar to iOS but with potential Android-specific differences
        switch (actionIdentifier) {
          case "READ_ACTION":
            if (messageId) {
              await markMessageRead(messageId);
              console.log(
                "[NotificationService] Android: Message marked as read via action",
              );
            }
            return;

          case "ACKNOWLEDGE_ACTION":
            if (messageId) {
              await markMessageRead(messageId);
              console.log(
                "[NotificationService] Android: Message acknowledged via action",
              );
            }
            break;

          default:
            break;
        }
      }
    }

    // We've passed all validation checks, navigate to the proper destination
    navigateBasedOnNotificationType(notificationData);
    trackNotificationNavigationResult(notificationData, true);

    // If the message requires acknowledgment, mark it as read after navigation
    if (requiresAcknowledgment && messageId) {
      await markMessageRead(messageId);
    }
  } catch (error) {
    console.error(
      "[NotificationService] Error handling notification deep link:",
      error,
    );
    // Fallback navigation to notifications tab
    try {
      const { router } = require("expo-router");
      router.push("/(tabs)/notifications");
    } catch (navError) {
      console.error(
        "[NotificationService] Failed to navigate to fallback screen:",
        navError,
      );
    }
  }
}

// Route based on notification type
function navigateBasedOnNotificationType(data: any) {
  try {
    const messageId = data?.messageId as string || "";
    const notificationType = data?.notificationType as string || "";
    const divisionName = data?.divisionName as string || "";
    const meetingId = data?.meetingId as string || "";
    const { router } = require("expo-router");

    switch (notificationType) {
      case "admin_message":
        if (messageId) {
          router.push(
            `/(admin)/division_admin/DivisionAdminPanel/AdminMessages/${messageId}`,
          );
        } else {
          router.push(
            `/(admin)/division_admin/DivisionAdminPanel/AdminMessages`,
          );
        }
        break;

      case "gca_announcement":
        if (messageId) {
          router.push(`/(gca)/gca-announcements/${messageId}`);
        } else {
          router.push(`/(gca)/gca-announcements`);
        }
        break;

      case "division_announcement":
        if (divisionName && messageId) {
          router.push(`/(division)/${divisionName}/announcements/${messageId}`);
        } else if (divisionName) {
          router.push(`/(division)/${divisionName}/announcements`);
        } else {
          router.push("/(division)");
        }
        break;

      case "meeting_reminder":
        if (meetingId && divisionName) {
          router.push(`/(division)/${divisionName}/meetings/${meetingId}`);
        } else if (divisionName) {
          router.push(`/(division)/${divisionName}/meetings`);
        } else {
          router.push("/(tabs)/divisions");
        }
        break;

      case "request_approved":
      case "request_denied":
      case "request_cancelled":
      case "request_waitlisted":
        // For PLD/SDV request status notifications, navigate to notifications tab
        // The message should exist in the messages table for these notifications
        if (messageId) {
          router.push(`/(tabs)/notifications/${messageId}`);
        } else {
          router.push("/(tabs)/notifications");
        }
        break;

      case "regular_message":
      default:
        if (messageId) {
          router.push(`/(tabs)/notifications/${messageId}`);
        } else {
          router.push("/(tabs)/notifications");
        }
        break;
    }
  } catch (error) {
    console.error("[NotificationService] Navigation error:", error);
    fallbackNavigation();
  }
}

// Fallback navigation for invalid links
function navigateToFallbackScreen(notificationType: string) {
  try {
    const { router } = require("expo-router");

    // Determine appropriate fallback destination based on notification type
    switch (notificationType) {
      case "admin_message":
        router.push("/(admin)/division_admin/DivisionAdminPanel/AdminMessages");
        break;
      case "gca_announcement":
        router.push("/(gca)/gca-announcements");
        break;
      case "division_announcement":
        router.push("/(division)");
        break;
      case "meeting_reminder":
        router.push("/(tabs)/divisions");
        break;
      case "request_approved":
      case "request_denied":
      case "request_cancelled":
      case "request_waitlisted":
        router.push("/(tabs)/notifications");
        break;
      default:
        router.push("/(tabs)/notifications");
        break;
    }
  } catch (error) {
    console.error("[NotificationService] Error navigating to fallback:", error);
    fallbackNavigation();
  }
}

// Generic fallback navigation
function fallbackNavigation() {
  try {
    const { router } = require("expo-router");
    router.push("/(tabs)/notifications");
  } catch (error) {
    console.error("[NotificationService] Critical navigation error:", error);
  }
}

// User feedback for unavailable content
function showContentUnavailableMessage(notificationType: string) {
  // Show appropriate toast/message based on notification type
  let message = "The content you requested is no longer available.";

  switch (notificationType) {
    case "admin_message":
      message = "This admin message is no longer available.";
      break;
    case "gca_announcement":
      message = "This announcement is no longer available.";
      break;
    case "division_announcement":
      message = "This division announcement is no longer available.";
      break;
    case "meeting_reminder":
      message = "The meeting information is no longer available.";
      break;
  }

  // Use toast mechanism
  showToast({
    type: "info",
    text1: "Content Unavailable",
    text2: message,
  });
}

// Toast helper function
function showToast(
  { type, text1, text2 }: { type: string; text1: string; text2: string },
) {
  try {
    // Try to import Toast from react-native-toast-message
    // This is just a placeholder - in actual implementation,
    // you should be using your app's toast mechanism
    console.log(`[Toast] ${type}: ${text1} - ${text2}`);

    // If we have Alert from react-native as a fallback
    Alert.alert(text1, text2);
  } catch (error) {
    console.log(`[Toast] ${text1}: ${text2}`);
  }
}

// Track notification navigation success/failure
async function trackNotificationNavigationResult(
  data: any,
  success: boolean,
  reason: string | null = null,
) {
  try {
    const userId = await getUserId();

    // Analytics data
    const analyticsData = {
      notification_type: data.notificationType,
      message_id: data.messageId,
      user_id: userId,
      success,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Log to analytics
    console.log("[NotificationService] Navigation result:", analyticsData);

    // Log to Supabase
    try {
      const { error: insertError } = await supabase
        .from("notification_analytics")
        .insert([analyticsData]);

      if (insertError) {
        console.error(
          "[NotificationService] Error logging analytics:",
          insertError,
        );
      } else {
        console.log(
          "[NotificationService] Tracked navigation result:",
          success,
        );
      }
    } catch (error: unknown) {
      console.error("[NotificationService] Error logging analytics:", error);
    }
  } catch (error) {
    console.error("[NotificationService] Error tracking navigation:", error);
  }
}

// Helper to get current user ID
async function getUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (error) {
    console.error("[NotificationService] Error getting user ID:", error);
    return null;
  }
}

// Content validation functions
async function validateContentExists(
  notificationType: string,
  messageId: string,
): Promise<boolean> {
  if (!messageId) return false;

  try {
    // Check if referenced content still exists based on type
    switch (notificationType) {
      case "admin_message":
        const { data: adminMessage } = await supabase
          .from("admin_messages")
          .select("id")
          .eq("id", messageId)
          .single();
        return !!adminMessage;

      case "gca_announcement":
        const { data: announcement } = await supabase
          .from("announcements")
          .select("id")
          .eq("id", messageId)
          .eq("type", "gca")
          .single();
        return !!announcement;

      case "division_announcement":
        const { data: divAnnouncement } = await supabase
          .from("announcements")
          .select("id")
          .eq("id", messageId)
          .eq("type", "division")
          .single();
        return !!divAnnouncement;

      case "meeting_reminder":
        const { data: meeting } = await supabase
          .from("meetings")
          .select("id")
          .eq("id", messageId)
          .single();
        return !!meeting;

      case "request_approved":
      case "request_denied":
      case "request_cancelled":
      case "request_waitlisted":
        // For PLD/SDV request status notifications, check messages table
        const { data: requestMessage } = await supabase
          .from("messages")
          .select("id")
          .eq("id", messageId)
          .single();
        return !!requestMessage;

      case "regular_message":
      default:
        const { data: message } = await supabase
          .from("messages")
          .select("id")
          .eq("id", messageId)
          .single();
        return !!message;
    }
  } catch (error) {
    console.error("[NotificationService] Error validating content:", error);
    return false;
  }
}

async function validateUserHasAccess(
  notificationType: string,
  messageId: string,
  userId: string | null,
): Promise<boolean> {
  if (!messageId || !userId) return false;

  try {
    switch (notificationType) {
      case "division_announcement":
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

      case "admin_message":
        // Check if user is recipient of admin message
        const { data: adminMessage } = await supabase
          .from("admin_messages")
          .select("recipient_ids")
          .eq("id", messageId)
          .single();

        if (!adminMessage) return false;

        if (adminMessage.recipient_ids === null) return true;

        return Array.isArray(adminMessage.recipient_ids) &&
          adminMessage.recipient_ids.includes(userId);

      case "meeting_reminder":
        // Check if user belongs to the division that owns the meeting
        const { data: meeting } = await supabase
          .from("meetings")
          .select("division_id")
          .eq("id", messageId)
          .single();

        if (!meeting) return false;

        const { data: meetingUserDivision } = await supabase
          .from("user_divisions")
          .select("division_id")
          .eq("user_id", userId)
          .eq("division_id", meeting.division_id)
          .single();

        return !!meetingUserDivision;

      case "request_approved":
      case "request_denied":
      case "request_cancelled":
      case "request_waitlisted":
        // For PLD/SDV request status notifications, check if user is recipient of message
        const { data: requestStatusMessage } = await supabase
          .from("messages")
          .select("recipient_id, recipient_pin_number")
          .eq("id", messageId)
          .single();

        if (!requestStatusMessage) return false;

        // Check if recipient_id matches userId directly
        if (requestStatusMessage.recipient_id === userId) return true;

        // If not, fetch member data to check pin number
        const { data: requestMember } = await supabase
          .from("members")
          .select("pin_number")
          .eq("id", userId)
          .single();

        if (!requestMember) return false;

        // Check if pin number matches recipient_pin_number
        return requestMember.pin_number ===
          requestStatusMessage.recipient_pin_number;

      case "regular_message":
        // Check if user is recipient of message
        const { data: message } = await supabase
          .from("messages")
          .select("recipient_id, recipient_pin_number")
          .eq("id", messageId)
          .single();

        if (!message) return false;

        // Check if recipient_id matches userId directly
        if (message.recipient_id === userId) return true;

        // If not, fetch member data to check pin number
        const { data: member } = await supabase
          .from("members")
          .select("pin_number")
          .eq("id", userId)
          .single();

        if (!member) return false;

        // Check if pin number matches recipient_pin_number
        return member.pin_number === message.recipient_pin_number;

      // GCA announcements are visible to all users
      case "gca_announcement":
        return true;

      default:
        return true; // Default to allowing access if no specific check
    }
  } catch (error) {
    console.error("[NotificationService] Error validating access:", error);
    return false;
  }
}

async function checkContentExpiration(
  notificationType: string,
  messageId: string,
): Promise<{ isExpired: boolean; message?: string }> {
  if (!messageId) return { isExpired: false };

  try {
    const now = new Date().toISOString();

    switch (notificationType) {
      case "gca_announcement":
      case "division_announcement":
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

      case "admin_message":
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

      case "meeting_reminder":
        const { data: meeting } = await supabase
          .from("meetings")
          .select("id, meeting_date")
          .eq("id", messageId)
          .single();

        if (meeting?.meeting_date) {
          const meetingDate = new Date(meeting.meeting_date);
          const currentDate = new Date();

          // If meeting was more than 1 day ago, consider it expired
          if (
            meetingDate <
              new Date(currentDate.setDate(currentDate.getDate() - 1))
          ) {
            return {
              isExpired: true,
              message: "This meeting has already taken place.",
            };
          }
        }
        break;
    }

    return { isExpired: false };
  } catch (error) {
    console.error("[NotificationService] Error checking expiration:", error);
    return { isExpired: false };
  }
}

async function checkContentArchiveStatus(
  notificationType: string,
  messageId: string,
): Promise<{ isArchived: boolean; message?: string }> {
  if (!messageId) return { isArchived: false };

  try {
    switch (notificationType) {
      case "admin_message":
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

      case "gca_announcement":
      case "division_announcement":
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

      case "regular_message":
        const { data: regularMessage } = await supabase
          .from("messages")
          .select("id, is_archived")
          .eq("id", messageId)
          .single();

        if (regularMessage?.is_archived) {
          return {
            isArchived: true,
            message: "This message has been archived.",
          };
        }
        break;
    }

    return { isArchived: false };
  } catch (error) {
    console.error(
      "[NotificationService] Error checking archive status:",
      error,
    );
    return { isArchived: false };
  }
}

/**
 * Get the status of a queued notification
 *
 * @param queueId The ID of the queued notification to check
 * @returns The notification queue entry or null if not found
 */
export async function getQueuedNotificationStatus(
  queueId: string,
): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from("push_notification_queue")
      .select("*")
      .eq("id", queueId)
      .single();

    if (error) {
      console.error(
        "[NotificationService] Error getting notification status:",
        error,
      );
      return null;
    }

    return data;
  } catch (error) {
    console.error(
      "[NotificationService] Exception getting notification status:",
      error,
    );
    return null;
  }
}

/**
 * Get delivery metrics for a notification
 *
 * @param messageId The message ID to check
 * @returns Delivery metrics or null if not found
 */
export async function getNotificationDeliveryMetrics(
  messageId: string,
): Promise<any | null> {
  try {
    // Get delivery status
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("push_notification_deliveries")
      .select("*")
      .eq("message_id", messageId);

    if (deliveryError) {
      console.error(
        "[NotificationService] Error getting delivery metrics:",
        deliveryError,
      );
      return null;
    }

    // Get analytics data
    const { data: analyticsData, error: analyticsError } = await supabase
      .from("notification_analytics")
      .select("*")
      .eq("notification_id", messageId);

    if (analyticsError) {
      console.error(
        "[NotificationService] Error getting analytics metrics:",
        analyticsError,
      );
    }

    return {
      deliveries: deliveryData || [],
      analytics: analyticsData || [],
    };
  } catch (error) {
    console.error(
      "[NotificationService] Exception getting delivery metrics:",
      error,
    );
    return null;
  }
}

/**
 * Check if any notifications are stuck and need manual retry
 *
 * @param olderThanHours Only check notifications older than this many hours
 * @param limit Maximum number of notifications to return
 * @returns List of stuck notifications that need intervention
 */
export async function checkForStuckNotifications(
  olderThanHours: number = 24,
  limit: number = 50,
): Promise<any[]> {
  try {
    // Calculate cutoff time
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - olderThanHours);

    // Find notifications that have reached max attempts or haven't been updated in a long time
    const { data, error } = await supabase
      .from("push_notification_queue")
      .select("*")
      .or(`status.eq.failed,retry_count.gte.max_attempts`)
      .lt("updated_at", cutoffTime.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error(
        "[NotificationService] Error checking for stuck notifications:",
        error,
      );
      return [];
    }

    return data || [];
  } catch (error) {
    console.error(
      "[NotificationService] Exception checking for stuck notifications:",
      error,
    );
    return [];
  }
}

/**
 * Manually retry a failed notification
 *
 * @param queueId The ID of the queued notification to retry
 * @returns True if successfully reset for retry, false otherwise
 */
export async function retryFailedNotification(
  queueId: string,
): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // Reset notification for retry
    const { error } = await supabase
      .from("push_notification_queue")
      .update({
        status: "pending",
        next_attempt_at: now,
        updated_at: now,
        error: null,
      })
      .eq("id", queueId);

    if (error) {
      console.error(
        "[NotificationService] Error retrying notification:",
        error,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      "[NotificationService] Exception retrying notification:",
      error,
    );
    return false;
  }
}

/**
 * Send a meeting reminder notification with the hybrid priority system
 *
 * @param userId The user ID who will receive the notification
 * @param title Notification title
 * @param body Notification body
 * @param meetingId The ID of the meeting
 * @param divisionName The name of the division
 * @param timeFrame Optional timeframe of the reminder ("hour", "day", "week")
 * @returns Promise<boolean> whether the notification was sent
 */
export async function sendMeetingReminderHybrid(
  userId: string,
  title: string,
  body: string,
  meetingId: string,
  divisionName: string,
  timeFrame: "hour" | "day" | "week" = "hour",
): Promise<boolean> {
  return await sendNotificationWithHybridPriority(userId, {
    title,
    body,
    categoryCode: "meeting_reminder",
    messageId: `meeting_${meetingId}_${timeFrame}`,
    divisionName,
    extraData: {
      meetingId,
      notificationType: NotificationType.MEETING_REMINDER,
      timeFrame,
    },
  });
}

/**
 * Legacy function for backward compatibility
 */
export async function sendMeetingReminderNotification(
  userId: string,
  title: string,
  body: string,
  meetingId: string,
  divisionName: string,
  timeFrame: "hour" | "day" | "week" = "hour",
): Promise<boolean> {
  return sendMeetingReminderHybrid(
    userId,
    title,
    body,
    meetingId,
    divisionName,
    timeFrame,
  );
}

/**
 * Enhanced SMS sending with rate limiting, verification and tracking
 * Integrates with the hybrid notification system and follows existing patterns
 */
export async function sendSMSWithTracking(
  userId: string,
  phoneNumber: string,
  fullContent: string,
  messageId?: string,
  categoryCode: string = "general_message",
  priority: "normal" | "high" | "emergency" = "normal",
  bypassRateLimit: boolean = false,
): Promise<
  {
    success: boolean;
    deliveryId?: string;
    error?: string;
    wasTruncated?: boolean;
  }
> {
  try {
    console.log(`[SMS] Starting SMS delivery for user ${userId}`);

    // 1. Validate phone verification status
    const isVerified = await validatePhoneVerification(userId, phoneNumber);
    if (!isVerified) {
      return { success: false, error: "Phone number not verified" };
    }

    // 2. Check opt-out status and lockout (unless emergency override)
    if (priority !== "emergency") {
      const canReceiveSMS = await canUserReceiveSMS(userId);
      if (!canReceiveSMS.allowed) {
        return { success: false, error: canReceiveSMS.reason };
      }
    }

    // 3. Check rate limiting (unless bypassed)
    if (!bypassRateLimit && priority !== "emergency") {
      const rateLimitCheck = await checkSMSRateLimit(
        userId,
        categoryCode,
        priority,
      );
      if (!rateLimitCheck.allowed) {
        return { success: false, error: rateLimitCheck.reason };
      }
    }

    // 4. Check organization-wide budget limits
    const budgetCheck = await checkOrganizationSMSBudget();
    if (!budgetCheck.allowed) {
      return { success: false, error: budgetCheck.reason };
    }

    // 5. Check individual daily/monthly limits
    const withinLimits = await checkSMSLimits(userId);
    if (!withinLimits.allowed) {
      return { success: false, error: withinLimits.reason };
    }

    // 6. Format content for SMS (truncate if necessary)
    const { smsContent, wasTruncated } = formatContentForSMS(fullContent);

    // 7. Create delivery tracking record
    const { data: delivery, error: deliveryError } = await supabase
      .from("sms_deliveries")
      .insert({
        message_id: messageId,
        recipient_id: userId,
        phone_number: phoneNumber,
        sms_content: smsContent,
        full_content: fullContent,
        priority: priority,
        was_truncated: wasTruncated,
        status: "pending",
      })
      .select("id")
      .single();

    if (deliveryError) {
      console.error("[SMS] Error creating delivery record:", deliveryError);
      return { success: false, error: "Failed to create delivery record" };
    }

    // 8. Send SMS via Edge Function
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: {
        to: phoneNumber,
        content: smsContent,
        messageId: messageId,
        deliveryId: delivery.id,
        priority,
      },
    });

    if (error || !data?.success) {
      // Update delivery record with failure
      await supabase
        .from("sms_deliveries")
        .update({
          status: "failed",
          error_message: error?.message || "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      return { success: false, error: error?.message || "SMS delivery failed" };
    }

    // 9. Update delivery record with success
    await supabase
      .from("sms_deliveries")
      .update({
        status: "sent",
        twilio_sid: data.sid,
        cost_amount: data.cost,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    // 10. Update rate limiting tracking
    if (priority !== "emergency") {
      await updateSMSRateLimit(userId, categoryCode);
    }

    console.log(`[SMS] Successfully sent SMS to user ${userId}`);
    return { success: true, deliveryId: delivery.id, wasTruncated };
  } catch (error) {
    console.error("[SMS] Error sending SMS:", error);
    return { success: false, error: "Unexpected error sending SMS" };
  }
}

/**
 * Validate phone verification status for a user
 */
async function validatePhoneVerification(
  userId: string,
  phoneNumber: string,
): Promise<boolean> {
  try {
    const { data: verification, error } = await supabase
      .from("phone_verifications")
      .select("verified")
      .eq("user_id", userId)
      .eq("phone", formatPhoneToE164(phoneNumber))
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[SMS] Error checking phone verification:", error);
      return false;
    }

    return !!verification?.verified;
  } catch (error) {
    console.error("[SMS] Exception checking phone verification:", error);
    return false;
  }
}

/**
 * Check if user can receive SMS based on verification, opt-out, and lockout status
 */
async function canUserReceiveSMS(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data: prefs, error } = await supabase
      .from("user_preferences")
      .select("sms_opt_out, sms_lockout_until, phone_verified")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      return { allowed: false, reason: "Unable to check user preferences" };
    }

    if (prefs?.sms_opt_out) {
      return {
        allowed: false,
        reason: "User has opted out of SMS notifications",
      };
    }

    if (
      prefs?.sms_lockout_until && new Date(prefs.sms_lockout_until) > new Date()
    ) {
      return {
        allowed: false,
        reason: "User is temporarily locked out from SMS",
      };
    }

    if (!prefs?.phone_verified) {
      return { allowed: false, reason: "Phone number not verified" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking SMS permissions:", error);
    return { allowed: false, reason: "Error checking permissions" };
  }
}

/**
 * Check SMS rate limiting based on category and priority
 */
async function checkSMSRateLimit(
  userId: string,
  categoryCode: string,
  priority: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get category-specific rate limit
    const { data: category, error: categoryError } = await supabase
      .from("notification_categories")
      .select("sms_rate_limit_minutes, allow_emergency_override")
      .eq("code", categoryCode)
      .single();

    if (categoryError && categoryError.code !== "PGRST116") {
      console.error("[SMS] Error checking category rate limit:", categoryError);
      return { allowed: true }; // Fail open
    }

    // Check if this category allows emergency override
    if (category?.allow_emergency_override && priority === "emergency") {
      return { allowed: true };
    }

    // Get rate limit in minutes based on priority and category
    let rateLimitMinutes = category?.sms_rate_limit_minutes || 20;

    // High priority messages have shorter rate limits
    if (priority === "high") {
      rateLimitMinutes = Math.min(rateLimitMinutes, 10);
    }

    // Emergency messages bypass rate limits
    if (priority === "emergency") {
      return { allowed: true };
    }

    // Check last SMS time for this category
    const { data: rateLimit, error: rateLimitError } = await supabase
      .from("sms_rate_limits")
      .select("last_sms_sent")
      .eq("user_id", userId)
      .eq("category_code", categoryCode)
      .single();

    if (rateLimitError && rateLimitError.code !== "PGRST116") {
      console.error("[SMS] Error checking rate limit:", rateLimitError);
      return { allowed: true }; // Allow if we can't check (fail open)
    }

    if (rateLimit?.last_sms_sent) {
      const lastSentTime = new Date(rateLimit.last_sms_sent);
      const now = new Date();
      const minutesSinceLastSMS = (now.getTime() - lastSentTime.getTime()) /
        (1000 * 60);

      if (minutesSinceLastSMS < rateLimitMinutes) {
        const waitTime = Math.ceil(rateLimitMinutes - minutesSinceLastSMS);
        return {
          allowed: false,
          reason:
            `Please wait ${waitTime} more minute(s) before sending another ${categoryCode} SMS`,
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking rate limit:", error);
    return { allowed: true }; // Fail open for rate limiting
  }
}

/**
 * Update SMS rate limiting tracking
 */
async function updateSMSRateLimit(
  userId: string,
  categoryCode: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Upsert rate limit record per category
    await supabase.from("sms_rate_limits").upsert(
      {
        user_id: userId,
        category_code: categoryCode,
        last_sms_sent: now,
        sms_count_last_hour: 1,
        updated_at: now,
      },
      {
        onConflict: "user_id,category_code",
      },
    );
  } catch (error) {
    console.error("[SMS] Error updating rate limit:", error);
    // Don't throw - this is tracking only
  }
}

/**
 * Check organization-wide SMS budget limits
 */
async function checkOrganizationSMSBudget(): Promise<
  { allowed: boolean; reason?: string }
> {
  try {
    const { data: budget, error } = await supabase.from(
      "organization_sms_budget",
    ).select("*").single();

    if (error && error.code !== "PGRST116") {
      console.error("[SMS] Error checking organization budget:", error);
      return { allowed: true }; // Fail open if can't check budget
    }

    if (!budget) {
      return { allowed: true }; // No budget set, allow
    }

    // Reset counters if needed
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toISOString().substr(0, 7);

    let needsUpdate = false;
    let updates: any = {};

    if (budget.last_daily_reset !== today) {
      updates.current_daily_spend = 0;
      updates.last_daily_reset = today;
      needsUpdate = true;
    }

    if (!budget.last_monthly_reset.startsWith(currentMonth)) {
      updates.current_monthly_spend = 0;
      updates.last_monthly_reset = new Date().toISOString().split("T")[0];
      needsUpdate = true;
    }

    if (needsUpdate) {
      await supabase.from("organization_sms_budget").update(updates).eq(
        "id",
        budget.id,
      );

      // Update local values
      budget.current_daily_spend = updates.current_daily_spend ||
        budget.current_daily_spend;
      budget.current_monthly_spend = updates.current_monthly_spend ||
        budget.current_monthly_spend;
    }

    // Check daily budget (assuming average cost of $0.01 per SMS)
    const estimatedCost = 0.01;
    if (budget.current_daily_spend + estimatedCost > budget.daily_budget) {
      return { allowed: false, reason: "Daily SMS budget exceeded" };
    }

    if (budget.current_monthly_spend + estimatedCost > budget.monthly_budget) {
      return { allowed: false, reason: "Monthly SMS budget exceeded" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking organization budget:", error);
    return { allowed: true }; // Fail open for budget checks
  }
}

/**
 * Check SMS daily/monthly limits for individual users
 */
async function checkSMSLimits(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user limits
    const { data: prefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("sms_daily_limit, sms_monthly_limit")
      .eq("user_id", userId)
      .single();

    if (prefsError && prefsError.code !== "PGRST116") {
      return { allowed: false, reason: "Unable to check SMS limits" };
    }

    const dailyLimit = prefs?.sms_daily_limit || 10;
    const monthlyLimit = prefs?.sms_monthly_limit || 100;

    // Check daily limit
    const today = new Date().toISOString().split("T")[0];
    const { count: dailyCount, error: dailyError } = await supabase
      .from("sms_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lt("created_at", `${today}T23:59:59.999Z`)
      .eq("status", "sent");

    if (dailyError) {
      console.error("[SMS] Error checking daily limit:", dailyError);
    } else if ((dailyCount || 0) >= dailyLimit) {
      return { allowed: false, reason: "Daily SMS limit exceeded" };
    }

    // Check monthly limit
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: monthlyCount, error: monthlyError } = await supabase
      .from("sms_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .gte("created_at", monthStart.toISOString())
      .eq("status", "sent");

    if (monthlyError) {
      console.error("[SMS] Error checking monthly limit:", monthlyError);
    } else if ((monthlyCount || 0) >= monthlyLimit) {
      return { allowed: false, reason: "Monthly SMS limit exceeded" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking SMS limits:", error);
    return { allowed: false, reason: "Error checking limits" };
  }
}

/**
 * Format content for SMS with length limits
 */
function formatContentForSMS(
  fullContent: string,
): { smsContent: string; wasTruncated: boolean } {
  const maxLength = 160; // Standard SMS length

  if (fullContent.length <= maxLength) {
    return { smsContent: fullContent, wasTruncated: false };
  }

  // Truncate with "..." and add note about full message in app
  const truncatedContent = fullContent.substring(0, maxLength - 25) +
    "... (See full in app)";

  return { smsContent: truncatedContent, wasTruncated: true };
}

/**
 * Get user's phone number from members table (synced from auth.users)
 * Falls back to Edge Function if members.phone_number is not available
 */
async function getUserPhoneNumber(userId: string): Promise<string | null> {
  try {
    // Primary method: get from members table (synced from auth.users via trigger)
    const { data: member, error } = await supabase
      .from("members")
      .select("phone_number")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[SMS] Error getting user phone from members:", error);
    }

    // If we have a phone number from members table, return it
    if (member?.phone_number) {
      return member.phone_number;
    }

    // Fallback: try to get from auth.users via Edge Function
    console.log(
      "[SMS] No phone in members table, trying Edge Function fallback",
    );
    const { data, error: edgeFunctionError } = await supabase.functions.invoke(
      "get-user-contact-info",
      {
        body: { userId, contactType: "phone" },
      },
    );

    if (edgeFunctionError) {
      console.error(
        "[SMS] Error getting user phone from Edge Function:",
        edgeFunctionError,
      );
      return null;
    }

    // Convert E.164 format to clean format if we got it from auth.users
    if (data?.phone) {
      return data.phone.replace(/^\+1/, "").replace(/[^0-9]/g, "");
    }

    return null;
  } catch (error) {
    console.error("[SMS] Exception getting user phone:", error);
    return null;
  }
}

/**
 * Get user's email from auth.users table via Edge Function
 * Note: Client-side code cannot directly access auth.users for other users
 */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    // Use Edge Function to get user email since client doesn't have admin access
    const { data, error } = await supabase.functions.invoke(
      "get-user-contact-info",
      {
        body: { userId, contactType: "email" },
      },
    );

    if (error) {
      console.error("[Email] Error getting user email:", error);
      return null;
    }

    return data?.email || null;
  } catch (error) {
    console.error("[Email] Exception getting user email:", error);
    return null;
  }
}

/**
 * Get user's delivery method preference for a specific category
 */
async function getUserDeliveryMethodForCategory(
  userId: string,
  categoryCode: string,
): Promise<string> {
  try {
    // Check for category-specific preference
    const { data: categoryPref, error: categoryError } = await supabase
      .from("user_notification_preferences")
      .select("delivery_method")
      .eq("user_id", userId)
      .eq("category_code", categoryCode)
      .single();

    if (categoryError && categoryError.code !== "PGRST116") {
      console.error("[SMS] Error getting category preference:", categoryError);
      return "default";
    }

    if (categoryPref?.delivery_method) {
      return categoryPref.delivery_method;
    }

    // Fallback to global preference
    const { data: globalPref, error: globalError } = await supabase
      .from("user_preferences")
      .select("contact_preference")
      .eq("user_id", userId)
      .single();

    if (globalError && globalError.code !== "PGRST116") {
      console.error("[SMS] Error getting global preference:", globalError);
      return "default";
    }

    return globalPref?.contact_preference || "default";
  } catch (error) {
    console.error("[SMS] Exception getting delivery method:", error);
    return "default";
  }
}

/**
 * Determine if SMS should be sent based on preferences
 */
async function shouldSendSMSNotification(
  userId: string,
  categoryCode: string,
  userDeliveryMethod: string,
  importance: string,
): Promise<boolean> {
  try {
    // Check if user has SMS as their delivery method for this category
    if (userDeliveryMethod === "sms") {
      return true;
    }

    // Check if user's global preference is SMS and category uses default
    if (userDeliveryMethod === "default") {
      const { data: globalPrefs } = await supabase
        .from("user_preferences")
        .select("contact_preference")
        .eq("user_id", userId)
        .single();

      return globalPrefs?.contact_preference === "text";
    }

    // For mandatory high-importance notifications, check if we should override
    const { data: category } = await supabase
      .from("notification_categories")
      .select("is_mandatory, default_importance")
      .eq("code", categoryCode)
      .single();

    if (category?.is_mandatory && importance === "high") {
      // Check if user has SMS capability (verified phone)
      const canReceive = await canUserReceiveSMS(userId);
      return canReceive.allowed;
    }

    return false;
  } catch (error) {
    console.error("[SMS] Error determining SMS delivery:", error);
    return false;
  }
}

/**
 * Create in-app notification fallback when SMS fails
 */
async function createInAppNotificationFallback(
  userId: string,
  notification: {
    title: string;
    body: string;
    categoryCode: string;
    messageId?: string;
    requiresAcknowledgment?: boolean;
    extraData?: Record<string, any>;
  },
  fallbackReason: string = "SMS delivery failed",
): Promise<boolean> {
  try {
    await supabase.from("notifications").upsert(
      {
        id: notification.messageId || crypto.randomUUID(),
        user_id: userId,
        title: notification.title,
        message: notification.body,
        notification_type: getNotificationCategoryFromType(
          notification.categoryCode as any,
        ),
        category_code: notification.categoryCode,
        is_read: false,
        requires_acknowledgment: notification.requiresAcknowledgment || false,
        importance: "medium",
        metadata: {
          fallbackFrom: "sms",
          fallbackReason,
          ...notification.extraData,
        },
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    return true;
  } catch (error) {
    console.error("[SMS] Error creating in-app fallback:", error);
    return false;
  }
}

/**
 * Handle fallback delivery when SMS fails
 */
async function fallbackDeliveryMethod(
  userId: string,
  notification: {
    title: string;
    body: string;
    categoryCode: string;
    messageId?: string;
    requiresAcknowledgment?: boolean;
    divisionName?: string;
    extraData?: Record<string, any>;
  },
  originalMethod: string,
  extraData: Record<string, any>,
  notificationType: NotificationType,
): Promise<boolean> {
  try {
    console.log(`[SMS] Attempting fallback delivery for user ${userId}`);

    // Try push notification as fallback
    const shouldSendPush = await shouldSendPushNotification(
      userId,
      notification.categoryCode,
      extraData.importance || "medium",
    );

    if (shouldSendPush) {
      const pushResult = await sendTypedPushNotification(
        userId,
        notification.title,
        notification.body,
        notificationType,
        notification.messageId,
        {
          ...extraData,
          fallbackFrom: "sms",
          originalMethod,
        },
      );

      if (pushResult) {
        console.log(
          `[SMS] Fallback to push notification successful for user ${userId}`,
        );
        return true;
      }
    }

    // Try email as second fallback if user prefers email
    if (originalMethod === "email" || originalMethod === "default") {
      const userEmail = await getUserEmail(userId);
      if (userEmail) {
        const emailContent = `${notification.title}\n\n${notification.body}`;
        const emailResult = await sendEmail(
          userEmail,
          notification.title,
          emailContent,
        );

        if (emailResult) {
          console.log(`[SMS] Fallback to email successful for user ${userId}`);
          return true;
        }
      }
    }

    // Final fallback - ensure in-app notification exists
    if (notification.messageId) {
      const inAppResult = await createInAppNotificationFallback(
        userId,
        notification,
        "All delivery methods failed - in-app only",
      );

      if (inAppResult) {
        console.log(
          `[SMS] Final fallback to in-app notification for user ${userId}`,
        );
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("[SMS] Error in fallback delivery:", error);

    // Emergency fallback - try to create in-app notification
    if (notification.messageId) {
      try {
        await createInAppNotificationFallback(
          userId,
          notification,
          "Fallback delivery error",
        );
        return true;
      } catch (emergencyError) {
        console.error("[SMS] Emergency fallback failed:", emergencyError);
      }
    }

    return false;
  }
}
