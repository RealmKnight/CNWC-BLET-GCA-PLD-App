import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { StateCreator } from "zustand";
import { Platform } from "react-native";

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
  setMessages: (messages: Message[]) => void;
  fetchMessages: (pinNumber: number) => Promise<void>;
  markAsRead: (messageId: string, pinNumber: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  subscribeToMessages: (pinNumber: number) => () => void;
  acknowledgeMessage: (messageId: string, pinNumber: number) => Promise<void>;
  archiveMessage: (messageId: string) => Promise<void>;
}

const useNotificationStore = create<NotificationStore>((set, get) => ({
  messages: [],
  unreadCount: 0,
  isLoading: false,
  error: null,

  setMessages: (messages: Message[]) => {
    set({
      messages,
      unreadCount: messages.filter((msg) => !msg.is_read).length,
    });
  },

  fetchMessages: async (pinNumber: number) => {
    try {
      set({ isLoading: true, error: null });

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
        .eq("recipient_pin_number", pinNumber)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (messagesError) throw messagesError;

      // Transform the data to include delivery status in metadata
      const transformedMessages = messages.map((msg: any) => ({
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

      set({
        messages: transformedMessages,
        unreadCount: transformedMessages.filter((msg) => !msg.is_read).length,
        isLoading: false,
      });
    } catch (error) {
      console.error("Error fetching messages:", error);
      set({
        error: "Failed to fetch messages",
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
    } catch (error) {
      console.error("[NotificationStore] Error in deleteMessage:", error);
      throw error;
    }
  },

  subscribeToMessages: (pinNumber: number) => {
    const channelId = `messages-${pinNumber}-${Date.now()}`;

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
          const { messages } = get();

          // Handle different types of changes
          switch (payload.eventType) {
            case "INSERT": {
              // Fetch the new message to get all related data
              const { data: newMessage, error } = await supabase
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
                .eq("id", payload.new.id)
                .single();

              if (error) {
                console.error(
                  "[NotificationStore] Error fetching new message:",
                  error,
                );
                return;
              }

              if (newMessage && !newMessage.is_deleted) {
                const updatedMessages = [newMessage, ...messages];
                set({
                  messages: updatedMessages,
                  unreadCount: updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length,
                });
              }
              break;
            }

            case "UPDATE": {
              if (payload.new.is_deleted) {
                // If message was marked as deleted, remove it from the local state
                const updatedMessages = messages.filter(
                  (msg) => msg.id !== payload.new.id,
                );
                set({
                  messages: updatedMessages,
                  unreadCount: updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length,
                });
              } else {
                // For other updates, update the message in the local state
                const updatedMessages = messages.map((msg) =>
                  msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
                );
                set({
                  messages: updatedMessages,
                  unreadCount: updatedMessages.filter((msg) =>
                    !msg.is_read
                  ).length,
                });
              }
              break;
            }

            case "DELETE": {
              // Remove the message from local state
              const updatedMessages = messages.filter(
                (msg) => msg.id !== payload.old.id,
              );
              set({
                messages: updatedMessages,
                unreadCount: updatedMessages.filter((msg) =>
                  !msg.is_read
                ).length,
              });
              break;
            }
          }
        },
      )
      .subscribe((status) => {
        console.log(
          `[NotificationStore] Subscription status for ${channelId}:`,
          status,
        );
      });

    // Subscribe to push notification deliveries with a separate channel
    const deliveriesChannelId = `deliveries-${pinNumber}-${Date.now()}`;
    const deliveriesSubscription = supabase
      .channel(deliveriesChannelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "push_notification_deliveries",
          filter: `recipient_pin_number=eq.${pinNumber}`,
        },
        async () => {
          // Refetch messages when there's a delivery status change
          await get().fetchMessages(pinNumber);
        },
      )
      .subscribe((status) => {
        console.log(
          `[NotificationStore] Deliveries subscription status for ${deliveriesChannelId}:`,
          status,
        );
      });

    // Return cleanup function
    return () => {
      console.log("[NotificationStore] Cleaning up subscriptions");
      messagesSubscription.unsubscribe();
      deliveriesSubscription.unsubscribe();
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
    } catch (error) {
      console.error("[NotificationStore] Error archiving message:", error);
      throw error;
    }
  },
}));

export { useNotificationStore };
export type { Message };
