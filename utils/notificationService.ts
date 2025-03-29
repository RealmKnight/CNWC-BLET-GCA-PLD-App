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
  const { data: message } = await supabase.from("messages").select("read_by").eq("id", messageId).single();

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

export async function sendPushNotification(message: PushMessage): Promise<boolean> {
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
  try {
    // First, get the recipient's push token and preference
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("user_metadata")
      .eq("id", recipientId)
      .single();

    if (userError) throw userError;

    const pushToken = userData?.user_metadata?.push_token;
    const contactPreference = userData?.user_metadata?.contact_preference;

    // Get current unread count for badge
    const unreadCount = await getUnreadMessageCount(recipientId);

    // Insert the message into the messages table
    const { data: messageData, error: messageError } = await supabase
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
        requires_acknowledgment: requiresAcknowledgment || messageType === "must_read",
        read_by: [],
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // If the user prefers push notifications and has a token, send the notification
    if (contactPreference === "push" && pushToken && Platform.OS !== "web") {
      const pushMessage: PushMessage = {
        to: pushToken,
        title: subject,
        body: content,
        data: {
          messageId: messageData.id,
          messageType,
          requiresAcknowledgment,
          ...payload,
        },
        sound: messageType === "must_read" ? "default" : null,
        priority: messageType === "must_read" ? "high" : "normal",
        badge: unreadCount + 1,
      };

      // Create a delivery record
      const { error: deliveryError } = await supabase.from("push_notification_deliveries").insert({
        message_id: messageData.id,
        recipient_id: recipientId,
        push_token: pushToken,
        status: "sending",
      });

      if (deliveryError) throw deliveryError;

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
        .eq("message_id", messageData.id);
    }

    return messageData;
  } catch (error) {
    console.error("Error in sendMessageWithNotification:", error);
    throw error;
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
