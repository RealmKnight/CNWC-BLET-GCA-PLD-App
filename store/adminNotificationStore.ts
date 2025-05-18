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
    _lastRefreshTime?: number; // Track the last time we refreshed data
    _pendingRefreshTimeout?: NodeJS.Timeout | null; // Track any pending refresh
    subscriptionStatus?: "none" | "subscribing" | "subscribed" | "error"; // Track subscription status

    // Expose fetch helper to allow manual refresh from components
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
    unarchiveThread: (threadId: string) => Promise<void>;
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
    _lastRefreshTime: 0,
    _pendingRefreshTimeout: null,
    subscriptionStatus: "none",

    // Internal Helper: Fetches messages and unread count based on filters
    _fetchAndSetMessages: async (userId, divisionFilterId) => {
        // Get effective roles from state
        const effectiveRoles = get().effectiveRoles;
        // console.log(
        //     `[_fetchAndSetMessages] Fetching for user ${userId}, roles: [${
        //         effectiveRoles.join(", ")
        //     }], division filter: ${divisionFilterId}`,
        // );
        if (!userId) {
            console.error("[_fetchAndSetMessages] User ID is required.");
            set({ isLoading: false, error: "User ID not provided" });
            return;
        }
        set({ isLoading: true, error: null });

        try {
            // 1. Fetch Messages based on roles and division filter
            let messageQuery = supabase
                .from("admin_messages_with_names")
                .select(`*`)
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
                    `recipient_division_ids.eq.{},recipient_division_ids.cs.{${divisionFilterId}},sender_user_id.eq.${userId}`,
                );
            } else {
                // If viewing "All" divisions (divisionFilterId is null), no specific division filter is needed.
                // RLS should ensure the user only sees messages relevant to their roles/assigned divisions.
            }
            // --- Filter Logic --- END ---

            // console.log("[_fetchAndSetMessages] Executing query...");
            const { data: messagesData, error: messagesError } =
                await messageQuery;
            if (messagesError) throw messagesError;
            // console.log(
            //     `[_fetchAndSetMessages] Query returned ${
            //         messagesData?.length ?? 0
            //     } messages initially.`,
            // );

            // Add debug logging for the first few messages
            // if (messagesData && messagesData.length > 0) {
            //     console.log(
            //         "[_fetchAndSetMessages] First message data:",
            //         JSON.stringify(messagesData[0], null, 2),
            //     );
            // }

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

            // console.log(
            //     `[_fetchAndSetMessages] Fetched ${messagesData.length} messages, Calculated ${calculatedUnreadCount} unread.`,
            // );

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

        // Set subscription status to subscribing
        set({ subscriptionStatus: "subscribing" });

        // --- Realtime Subscription ---
        const handleRealtimeUpdate = (
            payload: RealtimePostgresChangesPayload<any>,
        ) => {
            const record = (payload.new || payload.old) as {
                id?: string;
                message_id?: string;
                user_id?: string;
                [key: string]: any;
            };
            // Log the specific table that triggered the update
            console.log(
                `[handleRealtimeUpdate] Received ${payload.eventType} on table '${payload.table}' for record:`,
                record?.id ?? record?.message_id ?? "(no ID)",
            );

            // For read status changes, we need to update immediately
            if (payload.table === "admin_message_read_status") {
                // If a new read status was created, update our readStatusMap optimistically
                if (
                    payload.eventType === "INSERT" && record.user_id === userId
                ) {
                    const message_id = record.message_id;
                    const currentReadStatusMap = { ...get().readStatusMap };
                    const messages = get().messages;
                    const currentUnreadCount = get().unreadCount;

                    // Only update if we don't already have this marked as read
                    if (message_id && !currentReadStatusMap[message_id]) {
                        currentReadStatusMap[message_id] = true;

                        // Check if this was the latest message in a thread
                        const isLatestInThread = messages.some((msg) => {
                            const rootId = msg.parent_message_id || msg.id;
                            const threadMessages = messages
                                .filter((m) =>
                                    (m.parent_message_id || m.id) === rootId
                                )
                                .sort((a, b) =>
                                    new Date(b.created_at ?? 0).getTime() -
                                    new Date(a.created_at ?? 0).getTime()
                                );

                            return threadMessages.length > 0 &&
                                threadMessages[0].id === message_id &&
                                !threadMessages[0].is_archived;
                        });

                        // Update the count if needed
                        if (isLatestInThread) {
                            set({
                                readStatusMap: currentReadStatusMap,
                                unreadCount: Math.max(
                                    0,
                                    currentUnreadCount - 1,
                                ),
                            });

                            console.log(
                                `[handleRealtimeUpdate] Updated read status for message ${message_id}, decremented unread count to ${
                                    Math.max(0, currentUnreadCount - 1)
                                }`,
                            );
                            return; // Skip the standard refresh
                        } else {
                            set({ readStatusMap: currentReadStatusMap });
                            return; // Skip the standard refresh
                        }
                    }
                }
            }

            // Limit duplicate refreshes by setting a minimum time between refreshes
            const currentTime = Date.now();
            const lastRefreshTime = get()._lastRefreshTime || 0;
            const timeSinceLastRefresh = currentTime - lastRefreshTime;

            // Only refresh if it's been at least 500ms since last refresh
            if (timeSinceLastRefresh > 500) {
                const currentViewingDivision = get().viewingDivisionId;
                set({ _lastRefreshTime: currentTime });

                // Immediate refresh for better responsiveness
                get()._fetchAndSetMessages(userId, currentViewingDivision);
            } else {
                // If we're receiving updates too quickly, schedule a single refresh after delay
                if (!get()._pendingRefreshTimeout) {
                    const timeout = setTimeout(() => {
                        const currentViewingDivision = get().viewingDivisionId;
                        set({
                            _pendingRefreshTimeout: null,
                            _lastRefreshTime: Date.now(),
                        });
                        get()._fetchAndSetMessages(
                            userId,
                            currentViewingDivision,
                        );
                    }, 800);

                    set({ _pendingRefreshTimeout: timeout });
                }
            }
        };

        // Cleanup previous channel if exists
        const existingChannel = get().realtimeChannel;
        if (existingChannel) {
            try {
                supabase.removeChannel(existingChannel).catch((err) =>
                    console.error(
                        "[initializeAdminNotifications] Error removing existing channel:",
                        err,
                    )
                );
            } catch (err) {
                console.error(
                    "[initializeAdminNotifications] Exception during channel cleanup:",
                    err,
                );
            }
        }

        // Create a safe channel name (avoid special characters that might cause issues)
        const channelName = `admin-notifications-${userId.replace(/-/g, "")}`;
        console.log(
            `[initializeAdminNotifications] Creating channel: ${channelName}`,
        );

        let retryCount = 0;
        const maxRetries = 3;
        const setupChannel = () => {
            try {
                const channel = supabase
                    .channel(channelName)
                    .on(
                        "postgres_changes",
                        {
                            event: "*",
                            schema: "public",
                            table: "admin_messages",
                        },
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
                        handleRealtimeUpdate,
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
                            retryCount = 0; // Reset retry count on success

                            // Set a flag to indicate successful subscription
                            set({
                                realtimeChannel: channel,
                                subscriptionStatus: "subscribed",
                            });

                            // Trigger a final fetch to catch anything missed during setup
                            get()._fetchAndSetMessages(
                                userId,
                                get().viewingDivisionId,
                            );
                        } else if (
                            status === "CHANNEL_ERROR" ||
                            status === "TIMED_OUT" || err
                        ) {
                            console.error(
                                "[initializeAdminNotifications] Realtime subscription error:",
                                err ?? status,
                            );

                            // Set a degraded state but don't block the UI
                            set({
                                error: `Subscription warning: ${
                                    err?.message ?? status
                                }`,
                                isLoading: false,
                                subscriptionStatus: "error",
                            });

                            // Attempt to retry connection with backoff
                            if (retryCount < maxRetries) {
                                retryCount++;
                                const delay = Math.min(
                                    1000 * Math.pow(2, retryCount),
                                    8000,
                                );
                                console.log(
                                    `[initializeAdminNotifications] Retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`,
                                );

                                setTimeout(() => {
                                    // Clean up failed channel before retry
                                    try {
                                        supabase.removeChannel(channel).catch(
                                            (e) =>
                                                console.warn(
                                                    "[initializeAdminNotifications] Error removing failed channel:",
                                                    e,
                                                ),
                                        );
                                    } catch (cleanupErr) {
                                        console.warn(
                                            "[initializeAdminNotifications] Exception during failed channel cleanup:",
                                            cleanupErr,
                                        );
                                    }

                                    setupChannel();
                                }, delay);
                            } else {
                                console.warn(
                                    "[initializeAdminNotifications] Max retries reached, falling back to polling.",
                                );
                                // Fall back to polling if we can't establish realtime
                                const pollInterval = setInterval(() => {
                                    console.log(
                                        "[initializeAdminNotifications] Polling for updates...",
                                    );
                                    get()._fetchAndSetMessages(
                                        userId,
                                        get().viewingDivisionId,
                                    );
                                }, 30000); // Poll every 30 seconds

                                // Store the interval for cleanup
                                set({
                                    realtimeChannel: null,
                                    // @ts-ignore - Adding a custom property for cleanup
                                    _pollInterval: pollInterval,
                                    subscriptionStatus: "none",
                                });
                            }
                        } else if (status === "CLOSED") {
                            console.warn(
                                "[initializeAdminNotifications] Realtime channel closed.",
                            );
                            // Channel closed normally, no action needed
                        }
                    });

                return channel;
            } catch (error) {
                console.error(
                    "[initializeAdminNotifications] Exception setting up channel:",
                    error,
                );
                set({
                    isLoading: false,
                    error: `Channel setup failed: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`,
                    subscriptionStatus: "error",
                });
                return null;
            }
        };

        const channel = setupChannel();
        if (channel) {
            set({ realtimeChannel: channel });
        }

        // Return cleanup function
        return () => {
            console.log(
                "[initializeAdminNotifications] Cleanup: Unsubscribing realtime channel.",
            );
            const currentChannel = get().realtimeChannel; // Get channel from state

            // Clear any polling interval if it exists
            // @ts-ignore - Custom property access
            const pollInterval = get()._pollInterval;
            if (pollInterval) {
                clearInterval(pollInterval);
                // @ts-ignore - Custom property cleanup
                set({ _pollInterval: null });
            }

            if (currentChannel) {
                try {
                    supabase.removeChannel(currentChannel).catch((err) =>
                        console.error(
                            "[initializeAdminNotifications] Error removing channel during cleanup:",
                            err,
                        )
                    );
                } catch (err) {
                    console.error(
                        "[initializeAdminNotifications] Exception during channel cleanup:",
                        err,
                    );
                } finally {
                    set({ realtimeChannel: null }); // Always clear channel from state
                }
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
        // Get current readStatusMap and messages
        const readStatusMap = { ...get().readStatusMap };
        const originalReadStatusMap = { ...readStatusMap };
        const messages = get().messages;

        // Calculate current unread count before the update
        const currentUnreadCount = get().unreadCount;

        // Optimistically update UI
        readStatusMap[messageId] = true;

        // Optimistically update unread count
        // Find if this message is the latest in its thread
        const isLatestInThread = messages.some((msg) => {
            // Get root message ID (either the parent_message_id or the message's own id if it's a root)
            const rootId = msg.parent_message_id || msg.id;
            // Sort messages in this thread by creation date, descending
            const threadMessages = messages
                .filter((m) => (m.parent_message_id || m.id) === rootId)
                .sort((a, b) =>
                    new Date(b.created_at ?? 0).getTime() -
                    new Date(a.created_at ?? 0).getTime()
                );

            // If this message is the latest in its thread and it's being marked as read,
            // then we should decrement the unread count
            return threadMessages.length > 0 &&
                threadMessages[0].id === messageId &&
                !originalReadStatusMap[messageId] &&
                !threadMessages[0].is_archived;
        });

        // Only decrement unread count if this was the latest message in a thread and it wasn't already read
        const newUnreadCount = isLatestInThread
            ? Math.max(0, currentUnreadCount - 1)
            : currentUnreadCount;

        // Update both the read status map and unread count
        set({
            readStatusMap,
            unreadCount: newUnreadCount,
        });

        try {
            const { error } = await supabase.rpc("mark_admin_message_read", {
                message_id_to_mark: messageId,
            });
            if (error) throw error;
        } catch (error: any) {
            console.error("[markMessageAsRead] Error during RPC call:", error);
            // Revert optimistic update on error
            set({
                readStatusMap: originalReadStatusMap,
                unreadCount: currentUnreadCount,
                error: `Mark read failed: ${error?.message ?? "Unknown error"}`,
            });
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

        // Clear any pending timeout
        const pendingTimeout = get()._pendingRefreshTimeout;
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
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
            _lastRefreshTime: 0,
            _pendingRefreshTimeout: null,
            subscriptionStatus: "none",
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

    unarchiveThread: async (threadId) => {
        // Optimistically update all messages in the thread to is_archived: false
        const { messages } = get();
        const originalMessages = [...messages];
        set((state) => ({
            messages: state.messages.map((msg) => {
                // Unarchive all messages in the thread (parent or child)
                const rootId = msg.parent_message_id || msg.id;
                return rootId === threadId
                    ? { ...msg, is_archived: false }
                    : msg;
            }),
        }));
        try {
            // Update all messages in the thread in the backend
            const { error } = await supabase
                .from("admin_messages")
                .update({ is_archived: false })
                .or(`id.eq.${threadId},parent_message_id.eq.${threadId}`);
            if (error) {
                set({ messages: originalMessages, error: "Unarchive failed" });
                throw error;
            }
            // Success: rely on realtime to update UI
        } catch (error) {
            set({ messages: originalMessages });
            console.error("[unarchiveThread] Error:", error);
        }
    },
}));

export { useAdminNotificationStore };
