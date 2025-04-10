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

// Function to get unread message count for a user
export async function getUnreadMessageCount(
  pinNumber: number,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient_pin_number", pinNumber.toString())
      .is("read_at", null);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error("[Notification] Error getting unread count:", error);
    return 0;
  }
}

// Function to mark a message as read
export async function markMessageRead(
  messageId: string,
  pinNumber: number,
): Promise<void> {
  try {
    // First get current read_by array
    const { data: message, error: fetchError } = await supabase
      .from("messages")
      .select("read_by")
      .eq("id", messageId)
      .single();

    if (fetchError) throw fetchError;

    // Update with new array
    const readBy = message?.read_by || [];
    const pinString = pinNumber.toString();
    if (!readBy.includes(pinString)) {
      readBy.push(pinString);
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({
        read_by: readBy,
        read_at: now, // Set the read timestamp
      })
      .eq("id", messageId)
      .eq("recipient_pin_number", pinString);

    if (error) throw error;
  } catch (error) {
    console.error("[Notification] Error marking message as read:", error);
    throw error;
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
    const { data: messages, error: messageError } = await supabase.from(
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
      })),
    ).select();

    if (messageError) throw messageError;

    // Only attempt push notifications on mobile platforms
    if (Platform.OS !== "web" && messages) {
      // Attempt push notifications for each recipient
      await Promise.all(recipientPins.map(async (recipientPin) => {
        try {
          const { data: member } = await supabase
            .from("members")
            .select("notification_preferences, push_token")
            .eq("pin_number", recipientPin)
            .single();

          if (member?.push_token && messages) {
            // For each message, create a delivery record and attempt push notification
            for (const msg of messages) {
              if (msg.recipient_pin_number === recipientPin) {
                await attemptPushNotification(
                  member.push_token,
                  subject,
                  message,
                  msg.id,
                  messageType,
                  requiresAcknowledgment,
                  0, // unreadCount will be updated by the client
                  {},
                  recipientPin,
                );
              }
            }
          }
        } catch (error) {
          console.error(
            `[Notification] Failed to send push notification to ${recipientPin}:`,
            error,
          );
        }
      }));
    }
  } catch (error) {
    console.error("[Notification] Error sending message:", error);
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
