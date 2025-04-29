import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import type { AdminMessage } from "@/types/adminMessages";
import type {
    RealtimeChannel,
    RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import type { UserRole } from "@/types/auth"; // Import UserRole
// TODO: Create this service if needed, or remove import
// import { fetchDivisionIdByName, fetchDivisionNameById } from "@/utils/divisionService";
// Import service functions we'll call
// Assuming replyToAdminMessage exists and is correctly typed
// import { replyToAdminMessage } from "@/utils/notificationService";

// Interface for Read Status (can be moved to types if needed)
interface ReadStatus {
    message_id: string;
    user_id: string;
    read_at: string;
}

interface AdminNotificationStore {
    messages: AdminMessage[];
    readStatusMap: Record<string, boolean>; // Map messageId to read status (true if read)
    unreadCount: number;
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;
    viewingDivisionId: number | null; // Track the currently viewed division ID
    realtimeChannel: RealtimeChannel | null;
    effectiveRoles: UserRole[]; // <-- Add effective roles

    // Internal fetch/set helper
    _fetchAndSetMessages: (
        userId: string,
        divisionFilterId: number | null,
    ) => Promise<void>;
    // Initialization action
    initializeAdminNotifications: (
        userId: string,
        userRoles: UserRole[],
        assignedDivisionId: number | null,
        isCompanyAdmin: boolean,
    ) => () => void;
    // Action to change viewed division
    setViewDivision: (divisionId: number | null) => Promise<void>;
    // Action to mark as read (simplified signature)
    markMessageAsRead: (messageId: string) => Promise<void>;
    // Cleanup action
    cleanupAdminNotifications: () => void;

    // Old actions might be removed or adapted if no longer used directly
    // addMessage: (message: AdminMessage) => void; // Replaced by realtime refetch
    acknowledgeMessage: (messageId: string, userId: string) => Promise<void>; // Keep for now
    replyAsAdmin: (
        parentMessageId: string,
        message: string,
    ) => Promise<AdminMessage | null>; // Keep for now
    archiveThread: (threadId: string) => Promise<void>; // Keep for now
    markThreadAsUnread: (threadId: string) => Promise<void>; // Needs RPC/adjustment
}

// Helper to get root ID
const getRootMessageId = (msg: AdminMessage): string =>
    msg.parent_message_id || msg.id;

const useAdminNotificationStore = create<AdminNotificationStore>((
    set,
    get,
) => ({
    messages: [],
    readStatusMap: {}, // Initialize empty map
    unreadCount: 0,
    isLoading: false,
    error: null,
    isInitialized: false,
    viewingDivisionId: null,
    realtimeChannel: null,
    effectiveRoles: [], // <-- Initialize roles state

    // Internal Helper: Fetches messages and unread count based on filters
    _fetchAndSetMessages: async (userId, divisionFilterId) => {
        // Get effective roles from state
        const effectiveRoles = get().effectiveRoles;
        console.log(
            `[_fetchAndSetMessages] Fetching for user ${userId}, roles: [${
                effectiveRoles.join(", ")
            }], division filter: ${divisionFilterId}`,
        );
        if (!userId) {
            console.error("[_fetchAndSetMessages] User ID is required.");
            set({ isLoading: false, error: "User ID not provided" });
            return;
        }
        set({ isLoading: true, error: null });

        try {
            // 1. Fetch Messages based on roles and division filter
            let messageQuery = supabase
                .from("admin_messages")
                .select("*")
                .order("created_at", { ascending: false });

            // --- Filter Logic --- START ---
            // Base RLS will handle the basic permission check (can the user see *any* message based on their roles).
            // We add client-side filters for the specific view (division selection).

            // Filter 1: Role Overlap (User must have at least one of the recipient roles)
            // Note: RLS *should* already enforce this, but being explicit might be safer depending on RLS complexity.
            // If RLS is robust, this client-side role filter might be redundant.
            // For now, let's assume RLS handles the fundamental role access.
            // messageQuery = messageQuery.overlaps('recipient_roles', effectiveRoles);

            // Filter 2: Division Targeting (Specific division OR broadcast)
            if (divisionFilterId !== null) {
                // Message is broadcast (recipient_division_ids is empty) OR targets the specific division
                messageQuery = messageQuery.or(
                    `recipient_division_ids.eq.{},recipient_division_ids.cs.{${divisionFilterId}}`,
                );
            } else {
                // If viewing "All" divisions (divisionFilterId is null), no specific division filter is needed.
                // RLS should ensure the user only sees messages relevant to their roles/assigned divisions.
            }
            // --- Filter Logic --- END ---

            console.log("[_fetchAndSetMessages] Executing query...");
            const { data: messagesData, error: messagesError } =
                await messageQuery;
            if (messagesError) throw messagesError;
            console.log(
                `[_fetchAndSetMessages] Query returned ${
                    messagesData?.length ?? 0
                } messages initially.`,
            );

            // 2. Fetch Read Statuses for the fetched messages and current user
            let readStatusMap: Record<string, boolean> = {};
            let fetchReadStatusError: string | null = null;
            if (messagesData.length > 0) {
                const messageIds = messagesData.map((m) => m.id);
                const { data: readStatuses, error: readStatusError } =
                    await supabase
                        .from("admin_message_read_status")
                        .select("message_id") // Only need the ID to know it exists
                        .eq("user_id", userId)
                        .in("message_id", messageIds);

                if (readStatusError) {
                    console.error(
                        "[_fetchAndSetMessages] Error fetching read statuses:",
                        readStatusError,
                    );
                    fetchReadStatusError = readStatusError.message;
                    // Continue without read status, count will be inaccurate
                } else if (readStatuses) {
                    readStatuses.forEach((status) => {
                        readStatusMap[status.message_id] = true; // Mark as read
                    });
                }
            }

            // 3. Calculate Unread Count based on fetched data and read status map
            const groupedThreads = messagesData.reduce((acc, msg) => {
                const rootId = getRootMessageId(msg);
                if (!acc[rootId]) acc[rootId] = [];
                acc[rootId].push(msg);
                return acc;
            }, {} as Record<string, AdminMessage[]>);

            let calculatedUnreadCount = 0;
            for (const unknownThread of Object.values(groupedThreads)) {
                const thread = unknownThread as AdminMessage[];
                if (thread.length === 0) continue;
                thread.sort((a, b) =>
                    new Date(b.created_at ?? 0).getTime() -
                    new Date(a.created_at ?? 0).getTime()
                );
                const latestMessage = thread[0];
                if (
                    !latestMessage.is_archived &&
                    !readStatusMap[latestMessage.id]
                ) {
                    calculatedUnreadCount++;
                }
            }

            console.log(
                `[_fetchAndSetMessages] Fetched ${messagesData.length} messages, Calculated ${calculatedUnreadCount} unread.`,
            );

            set({
                messages: messagesData,
                readStatusMap: readStatusMap,
                unreadCount: calculatedUnreadCount,
                isLoading: false,
                isInitialized: true,
                viewingDivisionId: divisionFilterId,
                error: fetchReadStatusError, // Report read status error if any
            });
        } catch (error: any) {
            console.error("[_fetchAndSetMessages] Error:", error);
            set({
                isLoading: false,
                error: `Fetch failed: ${error.message}`,
                isInitialized: true, // Mark as initialized even on error to prevent re-init loops
            });
        }
    },

    // Initialize Store: Set default view, fetch initial data, subscribe
    initializeAdminNotifications: (
        userId,
        userRoles,
        assignedDivisionId,
        isCompanyAdmin,
    ) => {
        console.log("[initializeAdminNotifications] Initializing store...", {
            userId,
            userRoles,
            assignedDivisionId,
            isCompanyAdmin,
        });
        if (get().isInitialized || !userId) {
            console.log(
                "[initializeAdminNotifications] Already initialized or no userId, skipping.",
            );
            return () => {}; // Return empty cleanup if skipped
        }

        // Store the effective roles passed in
        set({ effectiveRoles: userRoles }); // <-- Store roles

        let initialDivisionFilterId: number | null = null;
        const validUserRoles = Array.isArray(userRoles) ? userRoles : [];
        // Check company admin status FIRST
        if (isCompanyAdmin) {
            console.log(
                `[initializeAdminNotifications] Company admin detected. Initial division filter: All`,
            );
            initialDivisionFilterId = null; // Company admins see all divisions by default
        } else {
            // Logic for non-company admins (members with roles)
            const isMemberAdmin =
                validUserRoles.includes("application_admin") ||
                validUserRoles.includes("union_admin") ||
                validUserRoles.includes("division_admin");

            if (isMemberAdmin) {
                if (validUserRoles.includes("division_admin")) {
                    initialDivisionFilterId = assignedDivisionId; // Division admin view
                    console.log(
                        `[initializeAdminNotifications] Division admin. Division filter: ${initialDivisionFilterId}`,
                    );
                    if (initialDivisionFilterId === null) {
                        console.warn(
                            `[initializeAdminNotifications] Division admin (${userId}) has null assignedDivisionId! Fetching all.`,
                        );
                    }
                } else { // Higher member admins (App/Union)
                    initialDivisionFilterId = assignedDivisionId; // Default to assigned, can be null for 'All'
                    console.log(
                        `[initializeAdminNotifications] Higher member admin. Initial division filter: ${
                            initialDivisionFilterId ?? "All"
                        }`,
                    );
                }
            } else {
                // User is neither company admin nor member admin - should not init
                console.warn(
                    "[initializeAdminNotifications] User is not an admin type that views admin messages. Setting empty.",
                );
                set({
                    messages: [],
                    readStatusMap: {},
                    unreadCount: 0,
                    isInitialized: true,
                    viewingDivisionId: null,
                    isLoading: false,
                });
                return () => {};
            }
        }

        // Proceed with fetch and subscribe if user is some type of admin
        set({ isLoading: true });
        get()._fetchAndSetMessages(userId, initialDivisionFilterId);

        // --- Realtime Subscription ---
        const handleRealtimeUpdate = (
            payload: RealtimePostgresChangesPayload<any>,
        ) => {
            const record = (payload.new || payload.old) as {
                id?: string;
                message_id?: string;
                [key: string]: any;
            };
            // Log the specific table that triggered the update (Keep this one? It's useful)
            console.log(
                `[handleRealtimeUpdate] Received ${payload.eventType} on table '${payload.table}' for record:`,
                record?.id ?? record?.message_id ?? "(no ID)",
            );

            const currentViewingDivision = get().viewingDivisionId;
            setTimeout(() => {
                get()._fetchAndSetMessages(userId, currentViewingDivision);
            }, 500);
        };

        // Cleanup previous channel if exists
        const existingChannel = get().realtimeChannel;
        if (existingChannel) {
            supabase.removeChannel(existingChannel).catch((err) =>
                console.error("Error removing existing channel:", err)
            );
        }

        const channel = supabase
            .channel(`admin-notifications-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "admin_messages" },
                handleRealtimeUpdate,
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "admin_message_read_status",
                    filter: `user_id=eq.${userId}`,
                },
                handleRealtimeUpdate, // Use the same handler - just refetch
            )
            .subscribe((status, err) => {
                // Log ALL statuses for debugging
                console.log(
                    `[initializeAdminNotifications] Realtime channel status: ${status}`,
                    err ? `Error: ${err.message}` : "",
                );

                if (status === "SUBSCRIBED") {
                    console.log(
                        "[initializeAdminNotifications] Realtime channel successfully subscribed.",
                    );
                    // Potentially trigger a final fetch here to catch anything missed during setup
                    // get()._fetchAndSetMessages(userId, get().viewingDivisionId);
                } else if (
                    status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err
                ) {
                    console.error(
                        "[initializeAdminNotifications] Realtime subscription error:",
                        err ?? status,
                    );
                    set({
                        error: `Subscription failed: ${err?.message ?? status}`,
                        isLoading: false,
                    });
                } else if (status === "CLOSED") {
                    console.warn(
                        "[initializeAdminNotifications] Realtime channel closed.",
                    );
                    // Optionally handle automatic reconnection or notify user
                }
            });

        set({ realtimeChannel: channel });

        // Return cleanup function
        return () => {
            console.log(
                "[initializeAdminNotifications] Cleanup: Unsubscribing realtime channel.",
            );
            const currentChannel = get().realtimeChannel; // Get channel from state
            if (currentChannel) {
                supabase.removeChannel(currentChannel).catch((err) =>
                    console.error("Error removing channel:", err)
                );
                set({ realtimeChannel: null }); // Clear channel from state
            }
        };
    },

    // Action to change the division being viewed by higher admins
    setViewDivision: async (divisionId) => {
        // Get user ID SYNCHRONOUSLY - don't use async getUser()
        const session = await supabase.auth.getSession();
        const userId = session?.data?.session?.user?.id;
        if (!userId) {
            console.error(
                "[setViewDivision] Cannot set view division without user ID.",
            );
            set({ error: "User not available" });
            return;
        }
        // Fetch data for the new division
        get()._fetchAndSetMessages(userId, divisionId);
    },

    // Action to mark a message as read by calling the RPC
    markMessageAsRead: async (messageId) => {
        // console.log(
        //     `[markMessageAsRead] Attempting RPC call for message ${messageId}.`,
        // ); // REMOVE/COMMENT OUT
        let rpcError = null;
        try {
            const { error } = await supabase.rpc("mark_admin_message_read", {
                message_id_to_mark: messageId,
            });
            rpcError = error;
            if (error) throw error;
            // console.log(
            //     `[markMessageAsRead] RPC called successfully for ${messageId}.`,
            // ); // REMOVE/COMMENT OUT
        } catch (error: any) {
            console.error("[markMessageAsRead] Error during RPC call:", error);
            set({
                error: `Mark read failed: ${error?.message ?? "Unknown error"}`,
            });
        } finally {
            if (rpcError) {
                console.error(
                    "[markMessageAsRead] RPC returned error:",
                    rpcError.message,
                );
            }
        }
    },

    // Cleanup Store State and Subscription
    cleanupAdminNotifications: () => {
        console.log("[cleanupAdminNotifications] Cleaning up store...");
        const channel = get().realtimeChannel;
        if (channel) {
            supabase.removeChannel(channel).catch((err) =>
                console.error("Error removing channel on cleanup:", err)
            );
        }
        set({
            messages: [],
            readStatusMap: {}, // Reset read status map
            unreadCount: 0,
            isLoading: false,
            error: null,
            isInitialized: false,
            viewingDivisionId: null,
            realtimeChannel: null,
        });
    },

    // --- Adapted/Kept old actions ---

    acknowledgeMessage: async (messageId, userId) => {
        // Keep optimistic update for now
        const { messages } = get();
        const message = messages.find((m) => m.id === messageId);

        // Check if already acknowledged by this user
        if (
            !message ||
            (Array.isArray(message.acknowledged_by) &&
                message.acknowledged_by.includes(userId))
        ) {
            console.log(
                `[acknowledgeMessage] Already acknowledged or message not found for ${messageId}`,
            );
            return;
        }

        const now = new Date().toISOString();
        // Ensure acknowledged_by is an array before spreading
        const currentAcknowledgedBy = Array.isArray(message.acknowledged_by)
            ? message.acknowledged_by
            : [];
        const newAcknowledgedBy = [...currentAcknowledgedBy, userId];
        const originalMessages = [...messages];

        try {
            // Optimistic
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
                    "[AdminNotificationStore] Error acknowledging message:",
                    error,
                );
                set({
                    messages: originalMessages,
                    error: "Acknowledge failed",
                }); // Revert
                throw error;
            }
            console.log(`[AcknowledgeMessage] Success for ${messageId}`);
        } catch (error) {
            console.error("Error in acknowledgeMessage:", error);
            set({ messages: originalMessages }); // Revert
        }
    },

    replyAsAdmin: async (parentMessageId, message) => {
        // senderUserId is no longer needed as RPC uses auth.uid()
        set({ isLoading: true });
        try {
            console.log(
                `[replyAsAdmin] Calling RPC for parent ${parentMessageId}...`,
            );

            // Call the RPC function
            const { data: result, error: rpcError } = await supabase.rpc(
                "create_admin_reply",
                {
                    p_parent_message_id: parentMessageId,
                    p_message: message.trim(), // Trim the message content
                },
            );

            if (rpcError) {
                console.error("[replyAsAdmin] RPC Error:", rpcError);
                throw new Error(
                    rpcError.message || "Failed to send reply via RPC.",
                );
            }

            // Rely on realtime to update the UI, no need to manually add to state.
            console.log(
                `[replyAsAdmin] RPC call successful for reply to ${parentMessageId}. Result:`,
                result,
            );

            // The RPC returns the inserted row, but we might not need it here
            // if the UI update is handled purely by realtime.
            // If you *do* need the returned message, ensure the RPC returns it
            // and handle it here.
            return result && result.length > 0 ? result[0] : null;
        } catch (error: any) {
            console.error("[replyAsAdmin] Error:", error);
            set({ isLoading: false, error: `Reply failed: ${error.message}` });
            return null;
        } finally {
            set({ isLoading: false });
        }
    },

    archiveThread: async (threadId) => {
        set({ isLoading: true });
        console.log(`[archiveThread] Archiving thread ${threadId}.`);
        try {
            // Call the RPC function
            const { error } = await supabase.rpc("archive_admin_thread", {
                thread_id_to_archive: threadId,
            });
            if (error) {
                console.error("[archiveThread] RPC Error:", error);
                throw new Error(
                    error.message || "Failed to archive thread via RPC.",
                );
            }

            // Rely on realtime to trigger refetch and update UI
            console.log(
                `[archiveThread] Archive RPC successful for ${threadId}.`,
            );
        } catch (error: any) {
            console.error("[archiveThread] Error:", error);
            set({
                isLoading: false,
                error: `Archive failed: ${error.message}`,
            });
        } finally {
            set({ isLoading: false });
        }
    },

    markThreadAsUnread: async (threadId) => {
        set({ isLoading: true });
        // console.log(
        //     `[markThreadAsUnread] Attempting RPC call for thread ${threadId} (latest message).`,
        // ); // REMOVE/COMMENT OUT
        let rpcError = null;
        try {
            const { error } = await supabase.rpc("unmark_admin_message_read", {
                p_thread_id: threadId,
            });
            rpcError = error;
            if (error) {
                throw error;
            }
            // console.log(`[markThreadAsUnread] RPC successful for ${threadId}.`); // REMOVE/COMMENT OUT
        } catch (error: any) {
            console.error("[markThreadAsUnread] Error during RPC call:", error);
            set({
                isLoading: false,
                error: `Mark unread failed: ${
                    error?.message ?? "Unknown error"
                }`,
            });
        } finally {
            if (rpcError) {
                console.error(
                    "[markThreadAsUnread] RPC returned error:",
                    rpcError.message,
                );
            }
            set({ isLoading: false });
        }
    },
}));

export { useAdminNotificationStore };
