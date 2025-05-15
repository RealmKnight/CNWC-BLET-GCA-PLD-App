import { supabase } from "./supabase";
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { AdminMessage } from "@/types/adminMessages"; // Import AdminMessage type
import Constants from "expo-constants";
import * as Device from "expo-device";
import { createClient } from "@supabase/supabase-js";

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
    // Ensure the message follows Expo's push notification format
    const expoPushMessage = {
      to: message.to,
      sound: message.sound || "default",
      title: message.title,
      body: message.body,
      data: message.data || {},
      badge: message.badge,
      channelId: Platform.OS === "android" ? "default" : undefined,
      priority: message.priority || "high", // Can be 'default' | 'normal' | 'high'
      // Additional Expo-specific properties as needed
      _displayInForeground: true, // This ensures the notification is shown even if the app is in the foreground
    };

    console.log("Sending push notification to:", message.to);

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(expoPushMessage),
    });

    const result = await response.json();

    console.log("Push notification response:", result);

    if (result.data?.status === "ok") {
      console.log("Push notification sent successfully");
      return true;
    } else {
      console.error(
        "Push notification sending failed:",
        result.errors || result.data?.details,
      );
      return false;
    }
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
      <p>This is an automated message from the BLET CN/WC GCA PLD App.</p>
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

// Update the sendMessageWithNotification function to handle different notification types

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

        // Process each message for this recipient
        for (const msg of recipientMessages) {
          console.log(
            `[Notification] Processing message ${msg.id} for recipient ${recipientPin} with preference ${contactPreference}`,
          );

          // Based on contact preference, send the appropriate notification
          if (
            contactPreference === "push" && pushToken && Platform.OS !== "web"
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
              recipientPin,
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
          } else {
            // For "in_app" preference or if preferred method fails, default to in-app notification
            deliveryAttempts.push({
              method: "in_app",
              success: true,
              error: undefined,
            });
          }

          // Update message metadata with delivery attempts
          await supabase
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

    // Send the push notification using the enhanced function
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
              <a href="${resetUrl}"
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

// TODO: Implement helper functions (potentially Edge Functions) for push notifications.
// See push_notifications.md for detailed requirements.

async function registerForPushNotificationsAsync() {
  let token;
  let errorMessage = "";

  try {
    if (Platform.OS === "web") {
      console.log("Push notifications are not supported on web platform");
      return null;
    }

    if (!Device.isDevice) {
      console.log("Push notifications require a physical device");
      return null;
    }

    // Check if we have permission
    const { status: existingStatus } = await Notifications
      .getPermissionsAsync();
    console.log("Existing notification permission status:", existingStatus);

    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      console.log("Requesting notification permission...");
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log("New notification permission status:", finalStatus);
    }

    if (finalStatus !== "granted") {
      errorMessage = "Permission not granted for push notifications";
      throw new Error(errorMessage);
    }

    // Create a notification channel for Android
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    console.log("Getting Expo push token...");
    // Get the project ID from Constants (this is important for EAS builds)
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.error(
        "Project ID not found. Make sure you're using an EAS build or have configured the projectId.",
      );
      throw new Error("Project ID not found for push notifications");
    }

    const response = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    token = response.data;
    console.log("Successfully obtained push token:", token);

    return token;
  } catch (error) {
    console.error("Error setting up push notifications:", error);
    Alert.alert(
      "Push Notification Setup Error",
      errorMessage ||
        "Failed to set up push notifications. Please check your device settings and try again.",
    );
    return null;
  }
}

// Export the registerForPushNotificationsAsync function for use in the app
export { registerForPushNotificationsAsync };
