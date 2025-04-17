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
  | "allotment_change"
  | "admin_message";

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

// Function to send password reset email via Edge Function with fallback
export async function sendPasswordResetEmail(email: string): Promise<boolean> {
  try {
    console.log("[Auth] Sending password reset email to:", email);

    // First try the standard Supabase method
    const { data, error: resetError } = await supabase.auth
      .resetPasswordForEmail(email, {
        redirectTo:
          `${process.env.EXPO_PUBLIC_WEBSITE_URL}/(auth)/change-password`,
      });

    // If there's no error, we're done
    if (!resetError) {
      console.log(
        "[Auth] Reset password email sent successfully via Supabase auth service",
      );
      return true;
    }

    // If we got an error other than email delivery issues, return false
    if (!resetError.message.includes("Error sending recovery email")) {
      console.error("[Auth] Error generating reset token:", resetError);
      return false;
    }

    // If we're here, we had an email delivery issue but got a valid token
    console.log(
      "[Auth] Supabase email delivery failed, trying Edge Function fallback",
    );

    // Attempt to get the current session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.log(
        "[Auth] No active session, trying anonymous request to Edge Function",
      );
      // For anonymous requests, we'll send a generic reset email
      return await sendGenericResetEmail(email);
    }

    console.log(
      "[Auth] Active session found, attempting to send custom reset email",
    );
    // For authenticated requests, try to get a reset link via admin API
    try {
      // Try to generate a reset link for the user
      const response = await fetch(
        "https://ymkihdiegkqbeegfebse.supabase.co/functions/v1/send-email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "Reset Your Password - BLET CN/WC GCA PLD App",
            content: `
            <div style="text-align: center; padding: 20px;">
              <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png" 
                   alt="BLET Logo" 
                   style="max-width: 200px; height: auto;">
              <h1 style="color: #003366;">Reset Your Password</h1>
              <p style="font-size: 16px; line-height: 1.5;">
                We received a request to reset your password for the BLET CN/WC GCA PLD App.
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                Please click the button below to reset your password:
              </p>
              <p style="text-align: center;">
                <a href="${process.env.EXPO_PUBLIC_WEBSITE_URL}/(auth)/change-password" 
                   style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                  Reset Password
                </a>
              </p>
              <p style="font-style: italic; color: #666; margin-top: 20px;">
                If you did not request a password reset, you can ignore this email.
              </p>
              <p style="font-style: italic; color: #666;">
                This is an automated message from the BLET CN/WC GCA PLD App.
              </p>
            </div>
          `,
          }),
        },
      );

      if (!response.ok) {
        console.error(
          "[Auth] Error sending custom reset email via Edge Function:",
          response.status,
        );
        return false;
      }

      const result = await response.json();
      return result?.success || false;
    } catch (error) {
      console.error("[Auth] Error in custom reset email:", error);
      return false;
    }
  } catch (error) {
    console.error("[Auth] Error in sendPasswordResetEmail:", error);
    return false;
  }
}

// Helper function to send a generic reset instruction email
async function sendGenericResetEmail(email: string): Promise<boolean> {
  try {
    // For unauthenticated requests, we'll try to get a service role token
    // or use another auth method that doesn't require user login

    // First try to get a service role token if possible (requires proper config)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: process.env.EXPO_PUBLIC_SERVICE_EMAIL || "service@example.com",
      password: process.env.EXPO_PUBLIC_SERVICE_PASSWORD || "password",
    });

    if (error || !data.session) {
      console.error("[Auth] Could not get service credentials:", error);
      // Fall back to direct Supabase method as last resort
      return false;
    }

    const token = data.session.access_token;

    // Now use the token to call the Edge Function
    const response = await fetch(
      "https://ymkihdiegkqbeegfebse.supabase.co/functions/v1/send-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: email,
          subject: "Reset Your Password - BLET CN/WC GCA PLD App",
          content: `
          <div style="text-align: center; padding: 20px;">
            <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png" 
                 alt="BLET Logo" 
                 style="max-width: 200px; height: auto;">
            <h1 style="color: #003366;">Reset Your Password</h1>
            <p style="font-size: 16px; line-height: 1.5;">
              We received a request to reset your password for the BLET CN/WC GCA PLD App.
            </p>
            <p style="font-size: 16px; line-height: 1.5;">
              Please go to the app and use the "Forgot Password" option on the sign-in screen.
              You'll need to enter this email address to receive a reset link.
            </p>
            <p style="font-style: italic; color: #666; margin-top: 20px;">
              If you did not request a password reset, you can ignore this email.
            </p>
            <p style="font-style: italic; color: #666;">
              This is an automated message from the BLET CN/WC GCA PLD App.
            </p>
          </div>
        `,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        "[Auth] Error sending generic reset email via Edge Function:",
        response.status,
      );
      return false;
    }

    const result = await response.json();
    return result?.success || false;
  } catch (error) {
    console.error("[Auth] Error in sendGenericResetEmail:", error);
    return false;
  }
}
