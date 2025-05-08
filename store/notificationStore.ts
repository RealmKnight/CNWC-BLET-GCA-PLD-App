import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { StateCreator } from "zustand";
import { Platform } from "react-native";
import { useUserStore } from "@/store/userStore";
import * as Notifications from "expo-notifications";
import { RealtimeChannel } from "@supabase/supabase-js";

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
  subscriptionStatus: "none" | "subscribing" | "subscribed" | "error";
  setMessages: (messages: Message[]) => void;
  fetchMessages: (userId: string, recipientId: string) => Promise<void>;
  markAsRead: (messageId: string, pinNumber: number) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  subscribeToMessages: (userId: string) => () => void;
  acknowledgeMessage: (messageId: string, pinNumber: number) => Promise<void>;
  archiveMessage: (messageId: string) => Promise<void>;
  setIsInitialized: (initialized: boolean) => void;
  refreshMessages: (
    pinNumber: number,
    userId: string,
    force?: boolean,
  ) => Promise<void>;
}

const useNotificationStore = create<NotificationStore>((set, get) => ({
  messages: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isInitialized: false,
  subscriptionStatus: "none",

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

  fetchMessages: async (userId: string, recipientId: string) => {
    console.log(
      `[NotificationStore] fetchMessages called with userId: ${userId}`,
    );

    if (!userId) {
      console.warn(
        "[NotificationStore] fetchMessages requires userId",
      );
      set({
        messages: [],
        unreadCount: 0,
        isLoading: false,
        error: "User identifier missing.",
      });
      return;
    }

    try {
      set({ isLoading: true, error: null });

      // First, get the member data to find the pin number
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("pin_number, id")
        .eq("id", userId)
        .single();

      if (memberError) {
        console.error(
          "[NotificationStore] Error getting member data:",
          memberError,
        );
        throw memberError;
      }

      if (!memberData?.pin_number) {
        console.warn(
          "[NotificationStore] No pin number found for user ID:",
          userId,
        );
        set({
          messages: [],
          unreadCount: 0,
          isLoading: false,
          error: "User pin number not found.",
        });
        return;
      }

      const pinNumber = memberData.pin_number;

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
        data: messages?.length || 0,
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
          "[NotificationStore] Raw recipient identifiers sample:",
          messages.slice(0, 2).map((m) => ({
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

  subscribeToMessages: (userId: string) => {
    if (!userId) {
      console.warn(
        "[NotificationStore] subscribeToMessages called with no userId",
      );
      return () => {};
    }

    console.log(
      `[NotificationStore] Starting subscription for user ID: ${userId}`,
    );

    // Track initialization and subscription state
    set({
      isInitialized: true,
      subscriptionStatus: "subscribing",
      error: null,
    });

    // We'll use member data in our subscriptions
    const getUserData = async () => {
      try {
        // Get member data using userId
        const { data: memberData, error } = await supabase
          .from("members")
          .select("id, pin_number")
          .eq("id", userId)
          .single();

        if (error) throw error;

        return memberData;
      } catch (error) {
        console.error("[NotificationStore] Error getting member data:", error);
        return null;
      }
    };

    // Track active channels for cleanup
    const activeChannels: {
      messagesChannel: RealtimeChannel | null;
      userPinChannel: RealtimeChannel | null;
      deliveriesChannel: RealtimeChannel | null;
    } = {
      messagesChannel: null,
      userPinChannel: null,
      deliveriesChannel: null,
    };

    // Create unique channel IDs with current timestamp to avoid conflicts
    const timestamp = Date.now();
    const messagesChannelId = `messages-user-${userId}-${timestamp}`;
    const userPinChannelId = `messages-pin-${userId}-${timestamp}`;
    const deliveriesChannelId = `deliveries-${userId}-${timestamp}`;

    try {
      // Create all channels
      const messagesChannel = supabase.channel(messagesChannelId);
      const userPinChannel = supabase.channel(userPinChannelId);
      const deliveriesChannel = supabase.channel(deliveriesChannelId);

      // Track created channels
      activeChannels.messagesChannel = messagesChannel;
      activeChannels.userPinChannel = userPinChannel;
      activeChannels.deliveriesChannel = deliveriesChannel;

      // Subscribe to user ID messages
      messagesChannel
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
              payload.eventType,
              (payload.new as any)?.id || (payload.old as any)?.id,
            );
            // Get the user data to refresh messages
            const userData = await getUserData();
            if (userData?.pin_number) {
              // Always refresh on realtime events
              await get().refreshMessages(userData.pin_number, userId, true);
            }
          },
        )
        .subscribe((status) => {
          console.log(
            `[NotificationStore] User ID subscription status: ${status}`,
          );

          // Update subscription status based on first channel
          if (status === "SUBSCRIBED") {
            // Only update overall status if all channels are good
            set((state) => ({
              ...state,
              subscriptionStatus: state.error ? "error" : "subscribed",
            }));
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(
              `[NotificationStore] Channel error on messages channel: ${status}`,
            );
            set({
              subscriptionStatus: "error",
              error: `Realtime subscription error: ${status}`,
            });

            // Schedule a fallback data fetch in 2 seconds
            setTimeout(async () => {
              const userData = await getUserData();
              if (userData?.pin_number) {
                await get().refreshMessages(userData.pin_number, userId, true);
              }
            }, 2000);
          }
        });

      // Set up pin number subscription after getting the data
      getUserData().then((userData) => {
        if (userData?.pin_number) {
          const pinNumber = userData.pin_number;

          // Handle pin-based notifications
          userPinChannel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "messages",
                filter: `recipient_pin_number=eq.${pinNumber}`,
              },
              async (payload) => {
                console.log(
                  "[NotificationStore] Received realtime update for pin:",
                  payload.eventType,
                  (payload.new as any)?.id || (payload.old as any)?.id,
                );
                await get().refreshMessages(pinNumber, userId, true);
              },
            )
            .subscribe((status) => {
              console.log(
                `[NotificationStore] Pin subscription status: ${status}`,
              );

              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.error(
                  `[NotificationStore] Channel error on pin channel: ${status}`,
                );
                // Don't update overall status if already subscribed to at least one channel
                if (get().subscriptionStatus !== "subscribed") {
                  set({
                    subscriptionStatus: "error",
                    error: `Pin subscription error: ${status}`,
                  });
                }

                // Schedule a fallback data fetch
                setTimeout(() => {
                  get().refreshMessages(pinNumber, userId, true);
                }, 2000);
              }
            });

          // Set up delivery notifications
          deliveriesChannel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "push_notification_deliveries",
                filter: `recipient_id=eq.${userId}`,
              },
              async (payload) => {
                console.log(
                  "[NotificationStore] Received delivery update:",
                  payload.eventType,
                  (payload.new as any)?.id || (payload.old as any)?.id,
                );
                await get().refreshMessages(pinNumber, userId, true);
              },
            )
            .subscribe((status) => {
              console.log(
                `[NotificationStore] Deliveries subscription status: ${status}`,
              );

              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.error(
                  `[NotificationStore] Channel error on deliveries channel: ${status}`,
                );
                // Only log the error, don't change state if already subscribed to other channels
              }
            });

          // Initial data fetch after subscription setup
          get().refreshMessages(pinNumber, userId, true);
        }
      });
    } catch (error) {
      console.error(
        "[NotificationStore] Error setting up subscriptions:",
        error,
      );
      set({
        subscriptionStatus: "error",
        error: `Failed to set up realtime subscriptions: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });

      // Try to clean up any created channels
      Object.values(activeChannels).forEach((channel) => {
        if (channel) {
          try {
            supabase.removeChannel(channel);
          } catch (e) {
            console.error(
              "[NotificationStore] Error removing channel during error cleanup:",
              e,
            );
          }
        }
      });
    }

    // Return function to clean up all subscriptions
    return () => {
      console.log("[NotificationStore] Cleaning up all subscriptions");

      // Reset subscription status
      set({ subscriptionStatus: "none" });

      try {
        // Clean up all channels that were created
        Object.entries(activeChannels).forEach(([name, channel]) => {
          if (channel) {
            try {
              supabase.removeChannel(channel);
              console.log(`[NotificationStore] Removed ${name} successfully`);
            } catch (e) {
              console.error(`[NotificationStore] Error removing ${name}:`, e);
            }
          }
        });
        console.log("[NotificationStore] All channels removed successfully");
      } catch (error) {
        console.error("[NotificationStore] Error removing channels:", error);
      }
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

  refreshMessages: async (
    pinNumber: number,
    userId: string,
    force: boolean = false,
  ) => {
    console.log(
      `[NotificationStore] refreshMessages called with pinNumber: ${pinNumber}, userId: ${userId}, force: ${force}`,
    );

    if (!pinNumber || !userId) {
      console.warn(
        "[NotificationStore] refreshMessages requires pinNumber and userId.",
      );
      return;
    }

    // Check subscription status - if we're not in a good state or force is true, always refresh
    const subStatus = get().subscriptionStatus;
    const shouldRefresh = force ||
      subStatus === "error" ||
      subStatus === "none" ||
      get().messages.length === 0;

    if (!shouldRefresh) {
      console.log(
        "[NotificationStore] Skipping manual refresh, relying on realtime subscriptions. Set force=true to override.",
      );
      return;
    }

    try {
      // Only update the UI loading state if forced and not already loading
      if (!get().isLoading) {
        set({ isLoading: true, error: null });
      }

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

      if (messagesError) throw messagesError;

      // Ensure messages is an array before proceeding
      const validMessages = messages || [];

      // Transform the data
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
        "[NotificationStore] Refresh complete, updating messages (count):",
        transformedMessages.length,
      );

      set({
        messages: transformedMessages,
        unreadCount: transformedMessages.filter((msg) => !msg.is_read).length,
        isLoading: false,
        error: null,
      });

      // Update badge count
      if (Platform.OS !== "web") {
        updateBadgeCount(
          transformedMessages.filter((msg) => !msg.is_read).length,
        );
      }
    } catch (error: any) {
      console.error("[NotificationStore] Error refreshing messages:", error);
      set({
        error: `Failed to refresh messages: ${
          error.message || "Unknown error"
        }`,
        isLoading: false,
      });
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
