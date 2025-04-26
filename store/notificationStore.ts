import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { StateCreator } from "zustand";
import { Platform } from "react-native";
import { useUserStore } from "@/store/userStore";
import * as Notifications from "expo-notifications";

interface Message {
  id: string;
  sender_pin_number: number | null;
  recipient_pin_number: number | null;
  subject: string;
  content: string;
  is_read: boolean;
  is_deleted: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  message_type: string;
  read_by: string[];
  requires_acknowledgment: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string[];
  metadata?: {
    topic?: string;
    event?: string;
    delivery_attempts?: Array<{
      method: string;
      success: boolean;
      error?: string;
    }>;
    final_status?: string;
    delivered_at?: string;
    error_message?: string;
  };
}

interface NotificationStore {
  messages: Message[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  setMessages: (messages: Message[]) => void;
  fetchMessages: (pinNumber: number, userId: string) => Promise<void>;
  markAsRead: (messageId: string, pinNumber: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  subscribeToMessages: (pinNumber: number) => () => void;
  acknowledgeMessage: (messageId: string, pinNumber: number) => Promise<void>;
  archiveMessage: (messageId: string) => Promise<void>;
  setIsInitialized: (initialized: boolean) => void;
}

const useNotificationStore = create<NotificationStore>((set, get) => ({
  messages: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isInitialized: false,

  setIsInitialized: (initialized: boolean) => {
    console.log(`[NotificationStore] Setting isInitialized to ${initialized}`);
    set({ isInitialized: initialized });
  },

  setMessages: (messages: Message[]) => {
    set({
      messages,
      unreadCount: messages.filter((msg) => !msg.is_read).length,
    });

    // Update the badge count when messages are set
    if (Platform.OS !== "web") {
      const unreadCount = messages.filter((msg) => !msg.is_read).length;
      updateBadgeCount(unreadCount);
    }
  },

  fetchMessages: async (pinNumber: number, userId: string) => {
    console.log(
      `[NotificationStore] fetchMessages called with pinNumber: ${pinNumber}, userId: ${userId}`,
    );

    if (!pinNumber || !userId) {
      console.warn(
        "[NotificationStore] fetchMessages requires pinNumber and userId.",
      );
      set({
        messages: [],
        unreadCount: 0,
        isLoading: false,
        error: "User identifiers missing.",
      });
      return;
    }
    try {
      set({ isLoading: true, error: null });

      // Revert to original select to include push_notification_deliveries
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select(`
          *,
          push_notification_deliveries (
            status,
            sent_at,
            delivered_at,
            error_message
          )
        `)
        .or(`recipient_pin_number.eq.${pinNumber},recipient_id.eq.${userId}`)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      // Log the raw data and error *directly* after the query
      console.log("[NotificationStore] Raw Supabase query result:", {
        data: messages,
        error: messagesError,
      });

      if (messagesError) {
        console.error(
          "[NotificationStore] Supabase query error detected:",
          messagesError,
        );
        throw messagesError;
      }

      // Check if data is null or empty even if no error
      if (!messages) {
        console.warn(
          "[NotificationStore] Supabase query returned null/undefined data, but no error.",
        );
      } else {
        console.log(
          "[NotificationStore] Supabase query successful, raw messages count:",
          messages.length,
        );
        // Log the recipient identifiers from the raw data
        console.log(
          "[NotificationStore] Raw recipient identifiers:",
          messages.map((m) => ({
            id: m.id,
            recipient_id: m.recipient_id,
            recipient_pin_number: m.recipient_pin_number,
          })),
        );
      }

      // Ensure messages is an array before proceeding
      const validMessages = messages || [];

      // Transform the data (only if validMessages is not empty)
      const transformedMessages = validMessages.map((msg: any) => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          delivery_status: msg.push_notification_deliveries?.[0]
            ? {
              status: msg.push_notification_deliveries[0].status,
              sent_at: msg.push_notification_deliveries[0].sent_at,
              delivered_at: msg.push_notification_deliveries[0].delivered_at,
              error_message: msg.push_notification_deliveries[0].error_message,
            }
            : undefined,
        },
      }));

      console.log(
        "[NotificationStore] Setting messages in store (count):",
        transformedMessages.length,
      );
      set({
        messages: transformedMessages,
        unreadCount: transformedMessages.filter((msg) => !msg.is_read).length,
        isLoading: false,
      });
    } catch (error: any) { // Added type any to error for better logging
      // Log the specific error encountered
      console.error(
        "[NotificationStore] Error fetching messages inside catch block:",
        error,
      );
      set({
        error: `Failed to fetch messages: ${error.message || "Unknown error"}`,
        isLoading: false,
      });
    }
  },

  markAsRead: async (messageId: string, pinNumber: number) => {
    try {
      const { messages } = get();
      const message = messages.find((m) => m.id === messageId);

      if (!message) return;

      const readBy = [...(message.read_by || [])];
      if (!readBy.includes(pinNumber.toString())) {
        readBy.push(pinNumber.toString());
      }

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("messages")
        .update({
          is_read: true,
          read_by: readBy,
          read_at: now,
        })
        .eq("id", messageId);

      if (error) throw error;

      // Update local state
      const updatedMessages = messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, is_read: true, read_by: readBy, read_at: now }
          : msg
      );

      set({
        messages: updatedMessages,
        unreadCount: updatedMessages.filter((msg) => !msg.is_read).length,
      });

      // Update badge count
      if (Platform.OS !== "web") {
        const unreadCount = updatedMessages.filter((msg) =>
          !msg.is_read
        ).length;
        updateBadgeCount(unreadCount);
      }
    } catch (error) {
      console.error("Error marking message as read:", error);
    }
  },

  acknowledgeMessage: async (messageId: string, pinNumber: number) => {
    try {
      const { messages } = get();
      const message = messages.find((m) => m.id === messageId);

      if (!message) return;

      const acknowledgedBy = [...(message.acknowledged_by || [])];
      if (!acknowledgedBy.includes(pinNumber.toString())) {
        acknowledgedBy.push(pinNumber.toString());
      }

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("messages")
        .update({
          acknowledged_by: acknowledgedBy,
          acknowledged_at: now,
        })
        .eq("id", messageId);

      if (error) throw error;

      // Update local state
      const updatedMessages = messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, acknowledged_by: acknowledgedBy, acknowledged_at: now }
          : msg
      );

      set({
        messages: updatedMessages,
      });

      // Also mark as read if not already read
      if (!message.is_read) {
        await get().markAsRead(messageId, pinNumber);
      }
    } catch (error) {
      console.error("Error acknowledging message:", error);
    }
  },

  deleteMessage: async (messageId: string) => {
    console.log("[NotificationStore] Attempting to delete message:", messageId);
    try {
      const { error } = await supabase
        .from("messages")
        .update({
          is_deleted: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) {
        console.error(
          "[NotificationStore] Supabase error deleting message:",
          error,
        );
        throw error;
      }

      console.log(
        "[NotificationStore] Successfully marked message as deleted in database",
      );

      // Update local state
      const { messages } = get();
      const updatedMessages = messages.filter((msg) => msg.id !== messageId);

      console.log(
        "[NotificationStore] Updating local state, removing message from list",
      );
      set({
        messages: updatedMessages,
        unreadCount: updatedMessages.filter((msg) => !msg.is_read).length,
      });
      console.log("[NotificationStore] Local state updated successfully");

      // Update badge count after deleting a message
      if (Platform.OS !== "web") {
        const unreadCount = updatedMessages.filter((msg) =>
          !msg.is_read
        ).length;
        updateBadgeCount(unreadCount);
      }
    } catch (error) {
      console.error("[NotificationStore] Error in deleteMessage:", error);
      throw error;
    }
  },

  subscribeToMessages: (pinNumber: number) => {
    console.log(`[NotificationStore] Starting subscription for ${pinNumber}`);

    // Track initialization state
    set({ isInitialized: true });

    const channelId = `messages-${pinNumber}-${Date.now()}`;

    const getUserId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id;
      } catch (error) {
        console.error("[NotificationStore] Error getting current user:", error);
        return null;
      }
    };

    // Subscribe to messages table changes
    const messagesSubscription = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `recipient_pin_number=eq.${pinNumber}`,
        },
        async (payload) => {
          console.log("[NotificationStore] Received realtime update:", payload);
          const eventType = payload.eventType;
          const newMessage = payload.new as Message;
          const oldMessage = payload.old as Message;
          const { messages: currentMessages } = get();
          const user = useUserStore.getState().member;

          if (!user?.id || !user?.pin_number) return;

          // Handle different event types separately for better performance
          switch (eventType) {
            case "INSERT":
              // For INSERT, add the new message to the state without refetching everything
              if (newMessage && !newMessage.is_deleted) {
                const updatedMessages = [newMessage, ...currentMessages];
                set({
                  messages: updatedMessages,
                  unreadCount: updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length,
                });

                // Update badge on app/device if on a native platform
                if (Platform.OS !== "web") {
                  const unreadCount = updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length;
                  updateBadgeCount(unreadCount);
                }
              }
              break;

            case "UPDATE":
              // For UPDATE, update the specific message in the state
              if (newMessage) {
                const messageIndex = currentMessages.findIndex((msg) =>
                  msg.id === newMessage.id
                );
                if (messageIndex >= 0) {
                  const updatedMessages = [...currentMessages];
                  updatedMessages[messageIndex] = {
                    ...updatedMessages[messageIndex],
                    ...newMessage,
                  };

                  set({
                    messages: updatedMessages,
                    unreadCount: updatedMessages.filter((msg) =>
                      !msg.is_read
                    ).length,
                  });

                  // Update badge count if read status changed
                  if (
                    oldMessage && oldMessage.is_read !== newMessage.is_read &&
                    Platform.OS !== "web"
                  ) {
                    const unreadCount = updatedMessages.filter((msg) =>
                      !msg.is_read
                    ).length;
                    updateBadgeCount(unreadCount);
                  }
                }
              }
              break;

            case "DELETE":
              // For DELETE or logical deletion (is_deleted = true), remove from state
              if (oldMessage) {
                const updatedMessages = currentMessages.filter((msg) =>
                  msg.id !== oldMessage.id
                );
                set({
                  messages: updatedMessages,
                  unreadCount: updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length,
                });

                // Update badge count if a message was deleted and it was unread
                if (!oldMessage.is_read && Platform.OS !== "web") {
                  const unreadCount = updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length;
                  updateBadgeCount(unreadCount);
                }
              }
              break;

            default:
              // For unknown events or if payload structure changed, do a full refetch
              console.log(
                "[NotificationStore] Unknown event type or payload format changed, doing a full refetch",
              );
              await get().fetchMessages(user.pin_number, user.id);
          }
        },
      )
      .subscribe((status) => {
        console.log(
          `[NotificationStore] Subscription status for ${channelId}:`,
          status,
        );
      });

    // Add another subscription for messages with recipient_id (for direct messages)
    getUserId().then((userId) => {
      if (userId) {
        // Create a different channel for recipient_id based messages
        const recipientIdChannelId = `messages-id-${userId}-${Date.now()}`;
        const recipientIdSubscription = supabase
          .channel(recipientIdChannelId)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `recipient_id=eq.${userId}`,
            },
            async (payload) => {
              console.log(
                "[NotificationStore] Received realtime update for recipient_id:",
                payload,
              );
              // Just do a full refresh when we get updates to recipient_id messages
              // Could optimize this later to handle specific events like the above
              const user = useUserStore.getState().member;
              if (user?.id && user?.pin_number) {
                await get().fetchMessages(user.pin_number, user.id);
              }
            },
          )
          .subscribe();

        // Set up push notification deliveries subscription with a separate channel
        const deliveriesChannelId = `deliveries-${pinNumber}-${Date.now()}`;
        const deliveriesSubscription = supabase
          .channel(deliveriesChannelId)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "push_notification_deliveries",
              filter: `recipient_id=eq.${userId}`,
            },
            async () => {
              // Refetch messages when there's a delivery status change
              const user = useUserStore.getState().member;
              if (user?.id && user?.pin_number) {
                await get().fetchMessages(user.pin_number, user.id);
              }
            },
          )
          .subscribe((status) => {
            console.log(
              `[NotificationStore] Deliveries subscription status for ${deliveriesChannelId}:`,
              status,
            );
          });

        // Update the original cleanup function to include all subscriptions
        const originalUnsubscribe = messagesSubscription.unsubscribe;
        messagesSubscription.unsubscribe = function (timeout?: number) {
          // Call the original unsubscribe method
          const result = originalUnsubscribe.call(this, timeout);
          // Also unsubscribe from the other subscriptions
          recipientIdSubscription.unsubscribe();
          deliveriesSubscription.unsubscribe();
          // Return the original promise
          return result;
        };
      } else {
        console.warn(
          "[NotificationStore] Could not get user ID for push notification deliveries subscription",
        );
      }
    });

    // Update the cleanup function to reset initialization state
    return () => {
      console.log("[NotificationStore] Cleaning up subscriptions");
      messagesSubscription.unsubscribe();

      // Reset initialization state on cleanup
      set({ isInitialized: false });
    };
  },

  archiveMessage: async (messageId: string) => {
    try {
      const { messages } = get();
      const message = messages.find((m) => m.id === messageId);

      if (!message) return;

      // Check if message is read
      if (!message.is_read) {
        throw new Error("Message must be read before archiving");
      }

      const { error } = await supabase
        .from("messages")
        .update({
          is_archived: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;

      // Update local state
      const updatedMessages = messages.map((msg) =>
        msg.id === messageId ? { ...msg, is_archived: true } : msg
      );

      set({
        messages: updatedMessages,
      });

      // Update badge count if an unread message was archived
      if (Platform.OS !== "web" && !message.is_read) {
        const unreadCount = updatedMessages.filter((msg) =>
          !msg.is_read
        ).length;
        updateBadgeCount(unreadCount);
      }
    } catch (error) {
      console.error("[NotificationStore] Error archiving message:", error);
      throw error;
    }
  },
}));

// Helper function to update badge count
function updateBadgeCount(count: number) {
  if (Platform.OS !== "web") {
    try {
      console.log(`[NotificationStore] Updating badge count to: ${count}`);
      Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error("[NotificationStore] Error updating badge count:", error);
    }
  }
}

export { useNotificationStore };
export type { Message };
