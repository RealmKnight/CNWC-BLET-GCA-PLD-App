import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { StateCreator } from "zustand";

interface Message {
  id: string;
  subject: string;
  content: string;
  created_at: string;
  message_type: string;
  requires_acknowledgment: boolean;
  is_read: boolean;
  read_by: string[];
  is_archived?: boolean;
}

interface NotificationStore {
  messages: Message[];
  unreadCount: number;
  setMessages: (messages: Message[]) => void;
  fetchMessages: (userId: string) => Promise<void>;
  markAsRead: (messageId: string, userId: string) => Promise<void>;
  archiveMessage: (messageId: string) => Promise<void>;
}

type NotificationStoreCreator = StateCreator<NotificationStore>;

export const useNotificationStore = create<NotificationStore>(
  (set, get): NotificationStore => ({
    messages: [],
    unreadCount: 0,
    setMessages: (messages: Message[]) => {
      set({
        messages,
        unreadCount: messages.filter((msg: Message) => !msg.is_read).length,
      });
    },
    fetchMessages: async (userId: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        set({
          messages: data as Message[],
          unreadCount: (data as Message[]).filter((msg: Message) => !msg.is_read).length,
        });
      }
    },
    markAsRead: async (messageId: string, userId: string) => {
      const { error } = await supabase
        .from("messages")
        .update({
          is_read: true,
          read_by: [...(get().messages.find((m: Message) => m.id === messageId)?.read_by || []), userId],
        })
        .eq("id", messageId);

      if (!error) {
        await get().fetchMessages(userId);
      }
    },
    archiveMessage: async (messageId: string) => {
      const { error } = await supabase.from("messages").update({ is_archived: true }).eq("id", messageId);

      if (!error) {
        const { messages } = get();
        const updatedMessages = messages.map((msg: Message) =>
          msg.id === messageId ? { ...msg, is_archived: true } : msg
        );
        set({
          messages: updatedMessages,
          unreadCount: updatedMessages.filter((msg: Message) => !msg.is_read).length,
        });
      }
    },
  })
);
