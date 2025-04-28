import { supabase } from "./supabase";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { AdminMessage } from "@/types/adminMessages"; // Import AdminMessage type

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

    // Format the redirect URL - use the correct format for password reset
    // For Supabase auth, the URL should directly point to the change-password page
    const redirectUrl =
      `${process.env.EXPO_PUBLIC_WEBSITE_URL}/change-password`;

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
              <a href="${process.env.EXPO_PUBLIC_WEBSITE_URL}/change-password"
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

// Helper function to get effective role (run securely, e.g., Edge Function)
async function getEffectiveSenderRole(userId: string): Promise<string> {
  let memberRole: string | null = null;
  let authRole: string | null = null;

  // 1. Check members table
  try {
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", userId)
      .single();
    if (memberError && memberError.code !== "PGRST116") { // Ignore "Row not found" error
      console.error(
        `[getEffectiveSenderRole] Error fetching member role for ${userId}:`,
        memberError,
      );
    } else if (memberData) {
      memberRole = memberData.role;
    }
  } catch (err) {
    console.error(
      `[getEffectiveSenderRole] Exception fetching member role for ${userId}:`,
      err,
    );
  }

  // 2. Check auth.users metadata (requires service_role)
  try {
    const { data: authData, error: authError } = await supabase.auth.admin
      .getUserById(userId);
    if (authError) {
      console.error(
        `[getEffectiveSenderRole] Error fetching auth user for ${userId}:`,
        authError,
      );
    } else if (authData?.user?.user_metadata?.role === "company_admin") {
      authRole = "company_admin";
      // Fix: Check user_metadata as fallback too, if structure differs between environments
    } else if (authData?.user?.user_metadata?.role === "company_admin") {
      console.warn(
        `[getEffectiveSenderRole] Found company_admin role potentially in unexpected metadata location.`,
      );
      authRole = "company_admin";
    }
  } catch (err) {
    console.error(
      `[getEffectiveSenderRole] Exception fetching auth user for ${userId}:`,
      err,
    );
  }

  // 3. Determine priority
  if (authRole === "company_admin") {
    return "company_admin";
  }
  return memberRole || "member";
}

/**
 * Sends a message to specific admin roles.
 * Determines sender role internally.
 */
export async function sendAdminMessage(
  senderUserId: string,
  recipientRoles: string[],
  subject: string,
  message: string,
  requiresAcknowledgment: boolean = false,
): Promise<AdminMessage | null> {
  console.log(
    "[sendAdminMessage] Called with sender:",
    senderUserId,
    "recipients:",
    recipientRoles,
  );

  if (
    !senderUserId || !recipientRoles || recipientRoles.length === 0 || !message
  ) {
    console.error("[sendAdminMessage] Invalid parameters.");
    return null;
  }

  try {
    const effectiveSenderRole = await getEffectiveSenderRole(senderUserId);
    console.log(
      `[sendAdminMessage] Determined sender role for ${senderUserId}: ${effectiveSenderRole}`,
    );

    const newMessage: Omit<AdminMessage, "id" | "created_at" | "updated_at"> = {
      sender_user_id: senderUserId,
      sender_role: effectiveSenderRole,
      recipient_roles: recipientRoles,
      parent_message_id: null, // Explicitly null for new thread
      subject: subject,
      message: message,
      is_read: false,
      read_by: [],
      is_archived: false,
      requires_acknowledgment: requiresAcknowledgment,
      acknowledged_at: null,
      acknowledged_by: [],
    };

    const { data, error } = await supabase
      .from("admin_messages")
      .insert([newMessage])
      .select()
      .single();

    if (error) {
      console.error("[sendAdminMessage] Error inserting message:", error);
      throw error;
    }
    console.log("[sendAdminMessage] Message inserted successfully:", data.id);
    // Push notification logic deferred - See push_notifications.md
    return data;
  } catch (error) {
    console.error("[sendAdminMessage] Failed:", error);
    return null;
  }
}

/**
 * Sends a reply to an existing admin message thread.
 * Determines sender role internally.
 */
export async function replyToAdminMessage(
  parentMessageId: string,
  senderUserId: string,
  message: string,
): Promise<AdminMessage | null> {
  console.log(
    "[replyToAdminMessage] Called for parent:",
    parentMessageId,
    "sender:",
    senderUserId,
  );

  if (!parentMessageId || !senderUserId || !message) {
    console.error("[replyToAdminMessage] Invalid parameters.");
    return null;
  }

  try {
    // 1. Fetch the parent message to get subject and recipient roles
    const { data: parentMessage, error: fetchParentError } = await supabase
      .from("admin_messages")
      .select("subject, recipient_roles, sender_user_id") // Include original sender
      .eq("id", parentMessageId)
      // Ensure it *is* a parent message (or allow replying to any message?)
      // .is('parent_message_id', null)
      .single();

    if (fetchParentError || !parentMessage) {
      console.error(
        "[replyToAdminMessage] Error fetching parent message:",
        fetchParentError,
      );
      throw new Error("Parent message not found or inaccessible.");
    }

    // Determine the effective sender role
    const effectiveSenderRole = await getEffectiveSenderRole(senderUserId);
    console.log(
      `[replyToAdminMessage] Determined sender role for ${senderUserId}: ${effectiveSenderRole}`,
    );

    // Determine recipients for the reply
    // Strategy: Reply goes to all original recipients + the original sender (if not the current sender)
    let replyRecipientRoles = parentMessage.recipient_roles || [];
    // TODO: Need a way to map original sender_user_id back to their role if not in recipient_roles
    // For now, just reply to original recipients. Adding original sender needs role lookup.

    const newReply: Omit<AdminMessage, "id" | "created_at" | "updated_at"> = {
      sender_user_id: senderUserId,
      sender_role: effectiveSenderRole,
      recipient_roles: replyRecipientRoles,
      parent_message_id: parentMessageId,
      subject: parentMessage.subject,
      message: message,
      is_read: false,
      read_by: [],
      is_archived: false,
      requires_acknowledgment: false, // Default for replies
      acknowledged_at: null,
      acknowledged_by: [],
    };

    const { data, error } = await supabase
      .from("admin_messages")
      .insert([newReply])
      .select()
      .single();

    if (error) {
      console.error("[replyToAdminMessage] Error inserting reply:", error);
      throw error;
    }
    console.log("[replyToAdminMessage] Reply inserted successfully:", data.id);
    // Push notification logic deferred - See push_notifications.md
    return data;
  } catch (error) {
    console.error("[replyToAdminMessage] Failed:", error);
    return null;
  }
}

/**
 * Sends a direct message (via messages table) back to the original sender
 * of an admin message thread. Used by admins to reply privately.
 */
export async function replyToUserInAdminMessage(
  originalAdminMessage: AdminMessage,
  adminUserId: string,
  replyMessage: string,
): Promise<void> {
  console.log(
    "[replyToUserInAdminMessage] Called for original msg:",
    originalAdminMessage.id,
    "admin:",
    adminUserId,
  );

  if (!originalAdminMessage?.sender_user_id || !adminUserId || !replyMessage) {
    console.error("[replyToUserInAdminMessage] Invalid parameters.");
    throw new Error("Missing required information for reply.");
  }

  try {
    // 1. Determine the admin's effective role
    const effectiveAdminRole = await getEffectiveSenderRole(adminUserId);
    console.log(
      `[replyToUserInAdminMessage] Determined admin role for ${adminUserId}: ${effectiveAdminRole}`,
    );

    // 2. Get the original sender's pin_number (recipient of this direct message)
    const { data: senderMember, error: senderError } = await supabase
      .from("members")
      .select("pin_number")
      .eq("id", originalAdminMessage.sender_user_id)
      .single();

    if (senderError || !senderMember?.pin_number) {
      console.error(
        "[replyToUserInAdminMessage] Could not find pin number for original sender:",
        originalAdminMessage.sender_user_id,
        senderError,
      );
      throw new Error("Could not find original sender.");
    }
    const recipientPinNumber = senderMember.pin_number;

    // 3. (Optional) Get the admin's pin_number (sender of this direct message)
    // This assumes admins also have a record in the members table to get a pin_number
    let senderPinNumber = 0; // Default or system pin?
    const { data: adminMember, error: adminError } = await supabase
      .from("members")
      .select("pin_number")
      .eq("id", adminUserId)
      .single();
    if (adminMember?.pin_number) {
      senderPinNumber = adminMember.pin_number;
    } else {
      console.warn(
        `[replyToUserInAdminMessage] Could not find pin number for admin sender: ${adminUserId}. Using default.`,
      );
      // Decide handling if admin has no pin_number (e.g., use a system sender ID/pin)
    }

    // 4. Construct the direct message for the `messages` table
    const directMessage = {
      sender_pin_number: senderPinNumber, // Admin's pin or system pin
      recipient_pin_number: recipientPinNumber, // Original sender's pin
      subject: `Re: ${originalAdminMessage.subject || "(No Subject)"}`, // Prefix subject
      message: replyMessage,
      message_type: "direct_message", // Ensure this type exists/is handled
      requires_acknowledgment: false,
      metadata: { // Link back to the admin message thread if needed
        admin_message_parent_id: originalAdminMessage.parent_message_id ||
          originalAdminMessage.id,
        replying_admin_id: adminUserId,
        replying_admin_role: effectiveAdminRole,
      },
    };

    // 5. Insert into the `messages` table
    const { error: insertError } = await supabase
      .from("messages")
      .insert([directMessage]);

    if (insertError) {
      console.error(
        "[replyToUserInAdminMessage] Error inserting direct message reply:",
        insertError,
      );
      throw insertError;
    }

    console.log(
      `[replyToUserInAdminMessage] Successfully sent direct message reply to user ${recipientPinNumber}`,
    );
    // Push notification logic deferred - See push_notifications.md
    // Needs integration with sendMessageWithNotification flow.
  } catch (error) {
    console.error("[replyToUserInAdminMessage] Failed:", error);
    throw error;
  }
}

// TODO: Implement helper functions (potentially Edge Functions) for push notifications.
// See push_notifications.md for detailed requirements.
