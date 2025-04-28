import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import type { AdminMessage } from "@/types/adminMessages";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
// Import service functions we'll call
import { replyToAdminMessage } from "@/utils/notificationService";
// Potentially import userStore if needed to get user roles client-side
// import { useUserStore } from "@/store/userStore";

// Define structure for a grouped thread
// export interface AdminMessageThread {
//     parent: AdminMessage;
//     replies: AdminMessage[];
// }
// ^ Keeping grouping logic outside the store state for now

interface AdminNotificationStore {
    messages: AdminMessage[]; // Flat list of all messages
    unreadCount: number;
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;
    setMessages: (messages: AdminMessage[]) => void;
    addMessage: (message: AdminMessage) => void;
    fetchMessages: (userId: string) => Promise<void>;
    markAsRead: (messageId: string, userId: string) => Promise<void>;
    acknowledgeMessage: (messageId: string, userId: string) => Promise<void>;
    // Removed archiveMessage, replaced by archiveThread
    // archiveMessage: (messageId: string) => Promise<void>;
    subscribeToAdminMessages: (userId: string) => () => void;
    // Selector function signature (implementation remains the same)
    getGroupedThreads: () => {
        parent: AdminMessage;
        replies: AdminMessage[];
    }[];

    // --- NEW ACTIONS ---
    /** Sends a reply as the current user (assumed admin) to a thread */
    replyAsAdmin: (
        parentMessageId: string,
        senderUserId: string,
        message: string,
    ) => Promise<AdminMessage | null>;
    /** Archives all messages within a thread */
    archiveThread: (threadId: string) => Promise<void>;
    /** Marks the latest message in a thread as unread for the specified user */
    markThreadAsUnread: (threadId: string, userId: string) => Promise<void>;
}

// Helper to get root ID
const getRootMessageId = (msg: AdminMessage): string =>
    msg.parent_message_id || msg.id;

// Basic store structure - function implementations will be added next
const useAdminNotificationStore = create<AdminNotificationStore>((
    set,
    get,
) => ({
    messages: [],
    // Removed threads Map initialization
    unreadCount: 0,
    isLoading: false,
    error: null,
    isInitialized: false,

    setMessages: (messages) => {
        const unreadCount = messages.filter((msg) => !msg.is_read).length;
        // Sort messages once here to ensure consistent order for threading
        const sortedMessages = [...messages].sort((a, b) =>
            new Date(a.created_at ?? 0).getTime() -
            new Date(b.created_at ?? 0).getTime()
        );
        set({
            messages: sortedMessages,
            unreadCount,
            isInitialized: true,
            isLoading: false,
            error: null,
        });
    },

    addMessage: (message) => {
        set((state) => {
            // Avoid adding duplicates if subscription already added it
            if (state.messages.some((m) => m.id === message.id)) {
                return {}; // No change
            }
            const newMessages = [...state.messages, message];
            const sortedMessages = newMessages.sort((a, b) =>
                new Date(a.created_at ?? 0).getTime() -
                new Date(b.created_at ?? 0).getTime()
            );
            // Recalculate unread count
            const newUnreadCount = sortedMessages.filter((msg) =>
                !msg.is_read && !msg.is_archived
            ).length;
            return { messages: sortedMessages, unreadCount: newUnreadCount };
        });
    },

    fetchMessages: async (userId) => {
        if (!userId) {
            console.warn(
                "[AdminNotificationStore] fetchMessages requires userId.",
            );
            set({
                messages: [],
                unreadCount: 0,
                isLoading: false,
                error: "User ID missing.",
            });
            return;
        }
        console.log(
            `[AdminNotificationStore] fetchMessages called for userId: ${userId}`,
        );
        set({ isLoading: true, error: null });

        try {
            // RLS ('Allow access based on effective role or sender') ensures we only get relevant messages.
            // The user ID is implicitly handled by RLS via auth.uid() in the DB function.
            const { data, error } = await supabase
                .from("admin_messages")
                .select("*"); // RLS restricts this select
            // Fetching all and sorting client-side after fetch

            if (error) {
                console.error(
                    "[AdminNotificationStore] Error fetching admin messages:",
                    error,
                );
                throw error;
            }

            get().setMessages(data || []); // Use setMessages to sort and update state
            set({ isLoading: false, error: null }); // Update loading state
        } catch (error: any) {
            console.error(
                "[AdminNotificationStore] fetchMessages failed:",
                error,
            );
            // Avoid setting error state again if already set in the try block
            if (!get().error) {
                set({
                    isLoading: false,
                    error: `Fetch failed: ${error.message || "Unknown error"}`,
                });
            }
        }
    },

    markAsRead: async (messageId, userId) => {
        const { messages } = get();
        const message = messages.find((m) => m.id === messageId);

        // Check if the specific user has already read it via the read_by array
        if (!message || message.read_by.includes(userId)) {
            // If globally marked as read, ensure local state reflects it (edge case)
            if (message && !message.is_read && message.read_by.length > 0) {
                set((state) => ({
                    messages: state.messages.map((msg) =>
                        msg.id === messageId ? { ...msg, is_read: true } : msg
                    ),
                }));
            }
            return;
        }

        const originalMessages = [...messages]; // Preserve original state for potential revert
        const newReadBy = [...message.read_by, userId];
        // Consider setting is_read = true only if needed by application logic, or let DB handle it?
        // For simplicity, we set it true here as well.
        const isNowGloballyRead = true; // Assume marking read makes it globally read for simplicity here

        try {
            // Optimistic UI update
            set((state) => {
                const updatedMessages = state.messages.map((msg) =>
                    msg.id === messageId
                        ? {
                            ...msg,
                            is_read: isNowGloballyRead,
                            read_by: newReadBy,
                        }
                        : msg
                );
                // Recalculate unread count based on the potentially updated list
                const newUnreadCount = updatedMessages.filter((msg) =>
                    !msg.is_read
                ).length; // Simple recalculation
                return {
                    messages: updatedMessages,
                    unreadCount: newUnreadCount,
                };
            });

            // Actual DB update
            const { error } = await supabase
                .from("admin_messages")
                .update({
                    // is_read: isNowGloballyRead, // Let DB trigger handle this based on read_by?
                    read_by: newReadBy,
                })
                .eq("id", messageId);

            if (error) {
                console.error(
                    "[AdminNotificationStore] Error marking message as read in DB:",
                    error,
                );
                // Revert optimistic update on error
                get().setMessages(originalMessages);
                throw error;
            }
            console.log(
                `[AdminNotificationStore] Marked message ${messageId} as read by ${userId}.`,
            );
        } catch (error) {
            console.error("Error in markAsRead:", error);
            // Ensure state is reverted if not already
            get().setMessages(originalMessages);
        }
    },

    acknowledgeMessage: async (messageId, userId) => {
        const { messages } = get();
        const message = messages.find((m) => m.id === messageId);

        if (!message || message.acknowledged_by.includes(userId)) {
            return;
        }

        const now = new Date().toISOString();
        const newAcknowledgedBy = [...message.acknowledged_by, userId];
        const originalMessages = [...messages];

        try {
            set((state) => ({
                messages: state.messages.map((msg) =>
                    msg.id === messageId
                        ? {
                            ...msg,
                            acknowledged_at: now,
                            acknowledged_by: newAcknowledgedBy,
                        }
                        : msg
                ),
            }));

            const { error } = await supabase
                .from("admin_messages")
                .update({
                    acknowledged_at: now,
                    acknowledged_by: newAcknowledgedBy,
                })
                .eq("id", messageId);

            if (error) {
                console.error(
                    "[AdminNotificationStore] Error acknowledging message in DB:",
                    error,
                );
                set({ messages: originalMessages }); // Revert
                throw error;
            }
            console.log(
                `[AdminNotificationStore] Acknowledged message ${messageId} by ${userId}.`,
            );

            if (!message.read_by.includes(userId)) {
                await get().markAsRead(messageId, userId);
            }
        } catch (error) {
            console.error("Error in acknowledgeMessage:", error);
            set({ messages: originalMessages }); // Ensure revert
        }
    },

    // --- NEW ACTIONS IMPLEMENTATION ---

    replyAsAdmin: async (parentMessageId, senderUserId, message) => {
        set({ isLoading: true });
        try {
            // Call the service function (which now determines senderRole internally)
            const newReply = await replyToAdminMessage(
                parentMessageId,
                senderUserId,
                message,
            );
            if (!newReply) {
                throw new Error(
                    "Service function failed to return reply message.",
                );
            }
            // Optimistic Update: Add the new reply directly to the store state
            get().addMessage(newReply);
            console.log(
                "[AdminNotificationStore] replyAsAdmin successful, optimistically updated store.",
            );
            set({ isLoading: false, error: null });
            return newReply;
        } catch (error: any) {
            console.error(
                "[AdminNotificationStore] replyAsAdmin failed:",
                error,
            );
            set({ isLoading: false, error: `Reply failed: ${error.message}` });
            return null;
        }
    },

    archiveThread: async (threadId) => {
        const { messages } = get();
        const originalMessages = [...messages];
        const messagesToArchive = messages.filter((msg) =>
            getRootMessageId(msg) === threadId
        );
        const messageIdsToArchive = messagesToArchive.map((msg) => msg.id);

        if (messageIdsToArchive.length === 0) {
            console.warn(
                `[AdminNotificationStore] No messages found for threadId ${threadId} to archive.`,
            );
            return;
        }

        // Optimistic UI update: Mark messages as archived locally
        const updatedMessages = messages.map((msg) =>
            messageIdsToArchive.includes(msg.id)
                ? { ...msg, is_archived: true }
                : msg
        );
        const newUnreadCount =
            updatedMessages.filter((msg) => !msg.is_read && !msg.is_archived)
                .length;
        set({ messages: updatedMessages, unreadCount: newUnreadCount });

        try {
            // DB Update
            const { error } = await supabase
                .from("admin_messages")
                .update({
                    is_archived: true,
                    updated_at: new Date().toISOString(),
                })
                .in("id", messageIdsToArchive); // Update all messages in the thread

            if (error) {
                console.error(
                    "[AdminNotificationStore] Error archiving thread in DB:",
                    error,
                );
                set({
                    messages: originalMessages,
                    unreadCount: get().messages.filter((msg) =>
                        !msg.is_read && !msg.is_archived
                    ).length,
                }); // Revert and recalculate
                throw error;
            }
            console.log(
                `[AdminNotificationStore] Archived thread ${threadId} (${messageIdsToArchive.length} messages).`,
            );
        } catch (error) {
            console.error("Error in archiveThread:", error);
            // Ensure revert if DB call threw non-supabase error
            set({
                messages: originalMessages,
                unreadCount: get().messages.filter((msg) =>
                    !msg.is_read && !msg.is_archived
                ).length,
            });
        }
    },

    markThreadAsUnread: async (threadId, userId) => {
        const { messages } = get();
        const originalMessages = [...messages];
        const threadMessages = messages.filter((msg) =>
            getRootMessageId(msg) === threadId
        );

        if (threadMessages.length === 0) {
            console.warn(
                `[AdminNotificationStore] No messages found for threadId ${threadId} to mark unread.`,
            );
            return;
        }

        // Find the latest message in the thread
        const latestMessage = threadMessages.reduce((latest, current) =>
            new Date(current.created_at ?? 0) > new Date(latest.created_at ?? 0)
                ? current
                : latest
        );

        // Check if user is actually in read_by list
        if (!latestMessage.read_by.includes(userId)) {
            console.log(
                `[AdminNotificationStore] User ${userId} hasn't read latest message ${latestMessage.id}, cannot mark unread.`,
            );
            return; // Already considered unread by this user
        }

        const newReadBy = latestMessage.read_by.filter((id) => id !== userId);
        // Determine new global is_read status. If anyone else read it, it stays read globally.
        const newIsReadStatus = newReadBy.length > 0;

        // Optimistic UI Update
        const updatedMessages = messages.map((msg) =>
            msg.id === latestMessage.id
                ? { ...msg, is_read: newIsReadStatus, read_by: newReadBy }
                : msg
        );
        const newUnreadCount =
            updatedMessages.filter((msg) => !msg.is_read && !msg.is_archived)
                .length;
        set({ messages: updatedMessages, unreadCount: newUnreadCount });

        try {
            // DB Update - only update the latest message
            const { error } = await supabase
                .from("admin_messages")
                .update({
                    is_read: newIsReadStatus,
                    read_by: newReadBy,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", latestMessage.id);

            if (error) {
                console.error(
                    "[AdminNotificationStore] Error marking thread unread in DB:",
                    error,
                );
                set({
                    messages: originalMessages,
                    unreadCount: get().messages.filter((msg) =>
                        !msg.is_read && !msg.is_archived
                    ).length,
                }); // Revert
                throw error;
            }
            console.log(
                `[AdminNotificationStore] Marked thread ${threadId} (latest msg ${latestMessage.id}) as unread for user ${userId}.`,
            );
        } catch (error) {
            console.error("Error in markThreadAsUnread:", error);
            set({
                messages: originalMessages,
                unreadCount: get().messages.filter((msg) =>
                    !msg.is_read && !msg.is_archived
                ).length,
            }); // Ensure revert
        }
    },

    // --- SUBSCRIPTION --- (Remains the same, might need refinement for retry logic)
    subscribeToAdminMessages: (userId) => {
        if (!userId) {
            console.error(
                "[AdminNotificationStore] Cannot subscribe without userId.",
            );
            return () => {}; // Return no-op unsubscribe
        }
        console.log(
            `[AdminNotificationStore] Attempting subscription for userId: ${userId}`,
        );
        // Initial state set before attempting subscription
        if (!get().isInitialized) {
            set({ isLoading: true }); // Set loading only if not initialized
        }

        let channel: ReturnType<typeof supabase.channel> | null = null;
        let retryTimeoutId: NodeJS.Timeout | null = null;
        let retryCount = 0;
        const maxRetries = 5;
        const baseRetryDelay = 2000; // 2 seconds

        const setupSubscription = () => {
            if (channel) {
                supabase.removeChannel(channel).catch((err) =>
                    console.error(
                        "[AdminNotificationStore] Error removing channel during retry:",
                        err,
                    )
                );
                channel = null;
            }
            if (retryTimeoutId) {
                clearTimeout(retryTimeoutId);
                retryTimeoutId = null;
            }

            const channelId = `admin-messages-${userId}-${Date.now()}`;
            console.log(
                `[AdminNotificationStore] Subscribing to channel: ${channelId} (Attempt: ${
                    retryCount + 1
                })`,
            );

            channel = supabase
                .channel(channelId)
                .on<AdminMessage>(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "admin_messages" },
                    (payload: RealtimePostgresChangesPayload<AdminMessage>) => {
                        if (retryCount > 0) {
                            console.log(
                                "[AdminNotificationStore] Subscription successful after retry.",
                            );
                            retryCount = 0;
                        }
                        console.log(
                            "[AdminNotificationStore] Realtime Event Received:",
                            payload,
                        );
                        // Use addMessage for inserts to handle duplicates and sorting
                        if (payload.eventType === "INSERT") {
                            get().addMessage(payload.new);
                        } else {
                            // Handle UPDATE and DELETE as before (using setMessages for simplicity)
                            const currentMessages = get().messages;
                            let updatedMessages = [...currentMessages];
                            switch (payload.eventType) {
                                case "UPDATE":
                                    const updatedMessage = payload.new;
                                    const index = updatedMessages.findIndex((
                                        msg,
                                    ) => msg.id === updatedMessage.id);
                                    if (index !== -1) {
                                        updatedMessages[index] = updatedMessage;
                                        console.log(
                                            "[AdminNotificationStore] Updated message:",
                                            updatedMessage.id,
                                        );
                                    } else {
                                        console.warn(
                                            "[AdminNotificationStore] Received UPDATE for non-existent message, treating as INSERT:",
                                            updatedMessage.id,
                                        );
                                        updatedMessages.push(updatedMessage);
                                    }
                                    break;
                                case "DELETE":
                                    const deletedMessage = payload.old;
                                    updatedMessages = updatedMessages.filter((
                                        msg,
                                    ) => msg.id !== deletedMessage?.id);
                                    console.log(
                                        "[AdminNotificationStore] Deleted message:",
                                        deletedMessage?.id,
                                    );
                                    break;
                                default:
                                    break;
                            }
                            get().setMessages(updatedMessages); // Update state for non-inserts
                        }
                    },
                )
                .subscribe((status, err) => {
                    if (status === "SUBSCRIBED") {
                        console.log(
                            `[AdminNotificationStore] Successfully subscribed to ${channelId}`,
                        );
                        retryCount = 0;
                        set({
                            isInitialized: true,
                            isLoading: false,
                            error: null,
                        }); // Ensure loading is false
                        // Optionally trigger a fetch after successful subscribe to ensure consistency?
                        // get().fetchMessages(userId);
                    }
                    if (
                        status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
                        err
                    ) {
                        console.error(
                            `[AdminNotificationStore] Subscription error on ${channelId}:`,
                            status,
                            err,
                        );
                        set({
                            error: `Subscription failed: ${status}`,
                            isInitialized: false,
                            isLoading: false,
                        }); // Stop loading on error

                        retryCount++;
                        if (retryCount <= maxRetries) {
                            const delay = baseRetryDelay *
                                Math.pow(2, retryCount - 1);
                            console.log(
                                `[AdminNotificationStore] Retrying subscription in ${delay}ms (Attempt ${retryCount}/${maxRetries})`,
                            );
                            retryTimeoutId = setTimeout(
                                setupSubscription,
                                delay,
                            );
                        } else {
                            console.error(
                                `[AdminNotificationStore] Subscription failed after ${maxRetries} retries.`,
                            );
                            set({
                                error:
                                    `Subscription failed permanently after ${maxRetries} retries.`,
                            });
                        }
                    }
                });
        };

        setupSubscription();

        return () => {
            console.log(
                `[AdminNotificationStore] Unsubscribing and cleaning up for userId: ${userId}`,
            );
            if (retryTimeoutId) {
                clearTimeout(retryTimeoutId);
                retryTimeoutId = null;
            }
            if (channel) {
                supabase.removeChannel(channel).catch((err) =>
                    console.error(
                        "[AdminNotificationStore] Error removing channel on cleanup:",
                        err,
                    )
                );
                channel = null;
            }
            // set({ isInitialized: false }); // Reset initialization status on unsubscribe?
        };
    },

    // --- SELECTORS --- (Remains the same)
    getGroupedThreads: (): {
        parent: AdminMessage;
        replies: AdminMessage[];
    }[] => {
        const { messages } = get();
        const threads: Map<
            string,
            { parent: AdminMessage; replies: AdminMessage[] }
        > = new Map();
        const repliesMap: Map<string, AdminMessage[]> = new Map();

        messages.forEach((msg) => {
            if (msg.parent_message_id === null) {
                threads.set(msg.id, { parent: msg, replies: [] });
            } else {
                const existingReplies = repliesMap.get(msg.parent_message_id) ||
                    [];
                repliesMap.set(msg.parent_message_id, [
                    ...existingReplies,
                    msg,
                ]);
            }
        });

        repliesMap.forEach((replies, parentId) => {
            if (threads.has(parentId)) {
                threads.get(parentId)!.replies = replies.sort((a, b) =>
                    new Date(a.created_at ?? 0).getTime() -
                    new Date(b.created_at ?? 0).getTime()
                );
            } else {
                console.warn(
                    `[AdminNotificationStore] Found replies for non-existent parent: ${parentId}`,
                );
            }
        });

        // Return threads sorted by the *latest* message in the thread (parent or last reply)
        return Array.from(threads.values()).sort((a, b) => {
            const lastMsgTime = (
                thread: { parent: AdminMessage; replies: AdminMessage[] },
            ) => {
                const lastReplyTime = thread.replies.length > 0
                    ? new Date(
                        thread.replies[thread.replies.length - 1].created_at ??
                            0,
                    ).getTime()
                    : 0;
                const parentTime = new Date(thread.parent.created_at ?? 0)
                    .getTime();
                return Math.max(lastReplyTime, parentTime);
            };
            return lastMsgTime(b) - lastMsgTime(a); // Most recent thread first
        });
    },
}));

export { useAdminNotificationStore };
