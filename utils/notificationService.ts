import { supabase } from "./supabase";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

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
  | "allotment_change";

interface MessagePayload {
  recipientId: string;
  subject: string;
  content: string;
  topic: string;
  event?: string;
  messageType: MessageType;
  requiresAcknowledgment?: boolean;
  payload?: Record<string, unknown>;
}

interface UserPreferences {
  push_token: string | null;
  contact_preference: string | null;
}

interface MemberWithPreferences {
  pin_number: number;
  user_preferences: UserPreferences | null;
  phone?: string;
  auth_users?: {
    email: string;
  } | null;
}

// Function to get unread message count for a user
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("messages")
    .select("*", { count: "exact" })
    .eq("recipient_id", userId)
    .eq("is_read", false);

  return count || 0;
}

// Function to mark a message as read
export async function markMessageRead(messageId: string, userId: string) {
  const { data: message } = await supabase.from("messages").select("read_by")
    .eq("id", messageId).single();

  const readBy = message?.read_by || [];
  if (!readBy.includes(userId)) {
    readBy.push(userId);
  }

  await supabase
    .from("messages")
    .update({
      read_by: readBy,
      is_read: readBy.length > 0,
    })
    .eq("id", messageId);

  // Update badge count
  if (Platform.OS !== "web") {
    const unreadCount = await getUnreadMessageCount(userId);
    await Notifications.setBadgeCountAsync(unreadCount);
  }
}

export async function sendPushNotification(
  message: PushMessage,
): Promise<boolean> {
  try {
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    return result.data?.status === "ok";
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
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

// Add new interface for notification attempt
interface NotificationAttempt {
  method: "push" | "email" | "text";
  success: boolean;
  error?: string;
}

export async function sendMessageWithNotification({
  recipientId,
  subject,
  content,
  topic,
  event,
  messageType,
  requiresAcknowledgment = false,
  payload = {},
}: MessagePayload) {
  const attempts: NotificationAttempt[] = [];
  let messageData;

  try {
    console.log(
      `[Notification] Starting notification process for recipient ${recipientId}`,
    );

    // First get the member's info
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select(
        `
        pin_number,
        user_preferences:user_preferences(
          push_token,
          contact_preference
        ),
        phone
      `,
      )
      .eq("id", recipientId)
      .single<MemberWithPreferences>();

    if (memberError) {
      console.error(
        `[Notification] Error fetching member data: ${memberError.message}`,
      );
      throw memberError;
    }

    // Get the email using MCP auth admin method
    const { data: userData, error: userError } = await supabase.functions
      .invoke("mcp-auth-admin", {
        body: {
          method: "get_user_by_id",
          params: { uid: recipientId },
        },
      });

    if (userError) {
      console.error(
        `[Notification] Error fetching user email: ${userError.message}`,
      );
      throw userError;
    }

    const pushToken = memberData?.user_preferences?.push_token;
    const contactPreference =
      memberData?.user_preferences?.contact_preference || "email";
    const email = userData?.user?.email;
    const phone = memberData?.phone;

    console.log(
      `[Notification] Recipient preferences - Method: ${contactPreference}, Push: ${!!pushToken}, Email: ${!!email}, Phone: ${!!phone}`,
    );

    // Get current unread count for badge
    const unreadCount = await getUnreadMessageCount(recipientId);

    // Insert the message into the messages table
    const { data: msgData, error: messageError } = await supabase
      .from("messages")
      .insert({
        recipient_id: recipientId,
        subject,
        content,
        topic,
        event,
        payload,
        is_read: false,
        private: true,
        message_type: messageType,
        requires_acknowledgment: requiresAcknowledgment ||
          messageType === "must_read",
        read_by: [],
      })
      .select()
      .single();

    if (messageError) {
      console.error(
        `[Notification] Error creating message record: ${messageError.message}`,
      );
      throw messageError;
    }

    messageData = msgData;
    console.log(`[Notification] Message created with ID: ${messageData.id}`);

    // Try preferred method first
    let notificationSent = false;

    // Attempt preferred method
    switch (contactPreference) {
      case "push":
        if (pushToken && Platform.OS !== "web") {
          console.log(`[Notification] Attempting push notification`);
          notificationSent = await attemptPushNotification(
            pushToken,
            subject,
            content,
            messageData.id,
            messageType,
            requiresAcknowledgment,
            unreadCount,
            payload,
            recipientId,
          );
          attempts.push({ method: "push", success: notificationSent });
        }
        break;

      case "text":
        if (phone) {
          console.log(`[Notification] Attempting SMS notification`);
          notificationSent = await sendSMS(phone, truncateForSMS(content));
          attempts.push({ method: "text", success: notificationSent });
        }
        break;

      case "email":
        if (email) {
          console.log(`[Notification] Attempting email notification`);
          notificationSent = await sendEmail(email, subject, content);
          attempts.push({ method: "email", success: notificationSent });
        }
        break;
    }

    // If preferred method failed, try fallbacks in order: email -> push -> SMS
    if (!notificationSent) {
      console.log(`[Notification] Primary method failed, attempting fallbacks`);

      // Try email fallback
      if (!attempts.some((a) => a.method === "email") && email) {
        console.log(`[Notification] Attempting email fallback`);
        notificationSent = await sendEmail(email, subject, content);
        attempts.push({ method: "email", success: notificationSent });
      }

      // Try push fallback
      if (
        !notificationSent && !attempts.some((a) => a.method === "push") &&
        pushToken && Platform.OS !== "web"
      ) {
        console.log(`[Notification] Attempting push notification fallback`);
        notificationSent = await attemptPushNotification(
          pushToken,
          subject,
          content,
          messageData.id,
          messageType,
          requiresAcknowledgment,
          unreadCount,
          payload,
          recipientId,
        );
        attempts.push({ method: "push", success: notificationSent });
      }

      // Try SMS fallback
      if (
        !notificationSent && !attempts.some((a) => a.method === "text") && phone
      ) {
        console.log(`[Notification] Attempting SMS fallback`);
        notificationSent = await sendSMS(phone, truncateForSMS(content));
        attempts.push({ method: "text", success: notificationSent });
      }
    }

    // Log final delivery status
    const deliveryStatus = notificationSent ? "delivered" : "failed";
    console.log(
      `[Notification] Final delivery status: ${deliveryStatus}. Attempts:`,
      attempts,
    );

    // Store delivery attempts in metadata
    await supabase
      .from("messages")
      .update({
        metadata: {
          delivery_attempts: attempts,
          final_status: deliveryStatus,
          delivered_at: notificationSent ? new Date().toISOString() : null,
        },
      })
      .eq("id", messageData.id);

    return messageData;
  } catch (error) {
    console.error(
      "[Notification] Error in sendMessageWithNotification:",
      error,
    );

    // If we have a message ID, log the error in metadata
    if (messageData?.id) {
      await supabase
        .from("messages")
        .update({
          metadata: {
            delivery_attempts: attempts,
            final_status: "error",
            error_message: error instanceof Error
              ? error.message
              : "Unknown error",
            error_timestamp: new Date().toISOString(),
          },
        })
        .eq("id", messageData.id);
    }

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
    const pushMessage: PushMessage = {
      to: pushToken,
      title: subject,
      body: content,
      data: {
        messageId,
        messageType,
        requiresAcknowledgment,
        ...payload,
      },
      sound: messageType === "must_read" ? "default" : null,
      priority: messageType === "must_read" ? "high" : "normal",
      badge: unreadCount + 1,
    };

    // Create a delivery record
    const { error: deliveryError } = await supabase
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
      return false;
    }

    // Send the push notification
    const success = await sendPushNotification(pushMessage);

    // Update the delivery status
    await supabase
      .from("push_notification_deliveries")
      .update({
        status: success ? "sent" : "failed",
        sent_at: success ? new Date().toISOString() : null,
        error_message: success ? null : "Failed to send push notification",
      })
      .eq("message_id", messageId);

    return success;
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
      .from("push_notification_deliveries")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("message_id", messageId);
  } catch (error) {
    console.error("Error marking notification as delivered:", error);
  }
}

// Test function for email Edge Function
export async function testEmailFunction(to: string): Promise<boolean> {
  try {
    console.log("Testing email function with recipient:", to);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error("No access token available");
      return false;
    }

    const functionUrl =
      "https://ymkihdiegkqbeegfebse.supabase.co/functions/v1/send-email";

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        to,
        subject: "Test Email with Logo",
        content: `
          <div style="text-align: center; padding: 20px;">
            <h1 style="color: #003366;">Email System Test</h1>
            <p style="font-size: 16px; line-height: 1.5;">
              This is a test email to verify that our email system is working correctly with the new logo integration.
            </p>
            <p style="font-size: 16px; line-height: 1.5;">
              If you're seeing this message and the BLET logo above, everything is working perfectly!
            </p>
            <p style="font-style: italic; color: #666; margin-top: 20px;">
              This is an automated test message. No action is required.
            </p>
          </div>
        `,
      }),
    });

    console.log("Response status:", response.status);
    const data = await response.json();
    console.log("Response data:", data);

    if (!response.ok) {
      console.error("Email function error response:", data);
      return false;
    }

    return data?.success || false;
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Unexpected error in testEmailFunction:", {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    return false;
  }
}
