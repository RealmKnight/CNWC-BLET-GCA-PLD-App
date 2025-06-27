import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { createRealtimeChannel } from "@/utils/realtime";
import type {
    AnalyticsExportRequest,
    Announcement,
    AnnouncementAnalytics,
    AnnouncementReadStatus,
    AnnouncementsDashboardAnalytics,
    DetailedAnnouncementAnalytics,
    DivisionAnalytics,
    MemberReadStatus,
} from "@/types/announcements";
import type {
    RealtimeChannel,
    RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Division context validation helper (following pattern from divisionMeetingStore)
const validateAnnouncementDivisionContext = async (
    announcementId: string,
    expectedDivisionName?: string,
): Promise<boolean> => {
    if (!expectedDivisionName) return true;

    try {
        const { data } = await supabase
            .from("announcements")
            .select("target_division_ids, target_type")
            .eq("id", announcementId)
            .single();

        if (data?.target_type === "GCA") return true; // GCA announcements are visible to all divisions

        if (data?.target_type === "division" && data?.target_division_ids) {
            // Get division ID for the expected division name
            const { data: divisionData } = await supabase
                .from("divisions")
                .select("id")
                .eq("name", expectedDivisionName)
                .single();

            return divisionData?.id
                ? data.target_division_ids.includes(divisionData.id)
                : false;
        }

        return false;
    } catch (error) {
        console.error("Error validating announcement division context:", error);
        return false;
    }
};

// Enhanced error handling with division context (following pattern from divisionMeetingStore)
const handleAnnouncementDivisionError = (
    error: Error,
    divisionName?: string,
    operation?: string,
): string => {
    const contextualMessage = divisionName
        ? `Error in ${divisionName} ${operation}: ${error.message}`
        : `Error in ${operation}: ${error.message}`;

    console.error(contextualMessage, error);
    return contextualMessage;
};

interface AnnouncementStore {
    // Data organized by division context (following pattern from divisionMeetingStore)
    announcements: Record<string, Announcement[]>; // Announcements by division name ("GCA" for union announcements)
    readStatusMap: Record<string, boolean>;
    acknowledgedMap: Record<string, boolean>; // Track acknowledgment status
    unreadCount: {
        division: number;
        gca: number;
        total: number;
    };
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;
    currentDivisionContext: string | null; // Track current division context (following pattern from divisionMeetingStore)
    subscriptionStatus: "none" | "subscribing" | "subscribed" | "error";
    loadingOperation: string | null; // Track what operation is currently loading
    userDivisionId: number | null; // Store user's division ID for badge calculations

    // Enhanced analytics state
    analyticsCache: Record<string, DetailedAnnouncementAnalytics>;
    dashboardAnalyticsCache: Record<string, AnnouncementsDashboardAnalytics>; // Changed from single to context-based cache
    analyticsLastUpdated: Record<string, string>; // Track when analytics were last fetched

    // Realtime subscriptions (following pattern from divisionMeetingStore)
    realtimeSubscriptions: {
        announcements: RealtimeChannel | null;
        readStatus: RealtimeChannel | null;
    };

    // Fetch helpers with division context
    _fetchAndSetAnnouncements: (divisionName: string) => Promise<void>;
    _calculateUnreadCounts: (userDivisionId?: number) => void;
    _updateBadgeStore: (
        unreadCounts: { division: number; gca: number; total: number },
    ) => void; // Integration with existing badgeStore
    _populateReadStatusFromAnnouncements: (
        announcements: Announcement[],
        userPin?: string,
    ) => void; // New helper method
    _fetchUserPinAndPopulateReadStatus: (
        announcements: Announcement[],
    ) => Promise<void>; // Helper to fetch PIN and populate read status

    // Public API with division context support
    initializeAnnouncementStore: (
        userId: string,
        assignedDivisionId: number | null,
        roles: string[],
    ) => Promise<() => void>;
    setDivisionContext: (divisionName: string | null) => void; // Following pattern from divisionMeetingStore
    fetchDivisionAnnouncements: (divisionName: string) => Promise<void>; // Following pattern from divisionMeetingStore
    fetchGCAnnouncements: () => Promise<void>;
    markAnnouncementAsRead: (announcementId: string) => Promise<void>;
    markAnnouncementAsUnread: (announcementId: string) => Promise<void>;
    acknowledgeAnnouncement: (announcementId: string) => Promise<void>;
    createAnnouncement: (
        announcement: Omit<
            Announcement,
            | "id"
            | "created_at"
            | "updated_at"
            | "created_by"
            | "creator_role"
            | "has_been_read"
            | "has_been_acknowledged"
            | "read_by"
            | "acknowledged_by"
        >,
    ) => Promise<string | null>;
    updateAnnouncement: (
        id: string,
        updates: Partial<Announcement>,
    ) => Promise<void>;
    deleteAnnouncement: (id: string) => Promise<void>;

    // Enhanced Analytics Methods
    getAnnouncementAnalytics: (
        announcementId: string,
    ) => Promise<AnnouncementAnalytics | null>;
    getDetailedAnnouncementAnalytics: (
        announcementId: string,
        forceRefresh?: boolean,
    ) => Promise<DetailedAnnouncementAnalytics | null>;
    getDashboardAnalytics: (
        divisionContext?: string,
        dateRange?: { start_date: string; end_date: string },
        forceRefresh?: boolean,
    ) => Promise<AnnouncementsDashboardAnalytics | null>;
    exportAnalytics: (
        request: AnalyticsExportRequest,
    ) => Promise<{ url: string; filename: string } | null>;
    getLowEngagementAnnouncements: (
        thresholdPercentage?: number,
        daysThreshold?: number,
        divisionContext?: string,
    ) => Promise<
        Array<{
            announcement_id: string;
            title: string;
            read_percentage: number;
            days_since_created: number;
        }>
    >;

    // Data integrity validation (following pattern from divisionMeetingStore)
    validateAnnouncementDataIntegrity: (divisionName: string) => Promise<{
        isValid: boolean;
        issues: string[];
    }>;
    // Loading state management (following pattern from divisionMeetingStore)
    setLoadingState: (isLoading: boolean, operation?: string) => void;

    // Store management methods
    cleanupAnnouncementStore: () => void;
    setIsInitialized: (initialized: boolean) => void;
    refreshAnnouncements: (
        divisionName: string,
        force?: boolean,
    ) => Promise<void>;
    subscribeToAnnouncements: (divisionName?: string) => Promise<() => void>; // Following pattern from divisionMeetingStore
    unsubscribeFromAnnouncements: () => void; // Following pattern from divisionMeetingStore
}

export const useAnnouncementStore = create<AnnouncementStore>((set, get) => ({
    // Implementation following pattern from divisionMeetingStore.ts
    announcements: {},
    readStatusMap: {},
    acknowledgedMap: {},
    unreadCount: {
        division: 0,
        gca: 0,
        total: 0,
    },
    isLoading: false,
    error: null,
    isInitialized: false,
    currentDivisionContext: null,
    subscriptionStatus: "none",
    loadingOperation: null,
    userDivisionId: null,

    // Enhanced analytics state
    analyticsCache: {},
    dashboardAnalyticsCache: {},
    analyticsLastUpdated: {},

    realtimeSubscriptions: {
        announcements: null,
        readStatus: null,
    },

    setIsInitialized: (initialized: boolean) => {
        console.log(
            `[AnnouncementStore] Setting isInitialized to ${initialized}`,
        );
        set({ isInitialized: initialized });
    },

    // Division context actions (following pattern from divisionMeetingStore)
    setDivisionContext: (divisionName: string | null) => {
        set({ currentDivisionContext: divisionName });
    },

    // Loading state management (following pattern from divisionMeetingStore)
    setLoadingState: (isLoading: boolean, operation?: string) => {
        set({
            isLoading,
            loadingOperation: isLoading ? operation || null : null,
        });
    },

    // Integration with existing badgeStore using different categories
    _updateBadgeStore: (unreadCounts) => {
        try {
            // Import badgeStore dynamically to avoid circular dependencies
            import("@/store/badgeStore")
                .then(({ useBadgeStore }) => {
                    const badgeStoreState = useBadgeStore.getState();

                    // Only update if the function exists and counts have changed
                    if (badgeStoreState.updateAnnouncementBadges) {
                        const currentCounts =
                            badgeStoreState.announcementUnreadCount;

                        // Only update if counts have actually changed
                        if (
                            currentCounts.division !== unreadCounts.division ||
                            currentCounts.gca !== unreadCounts.gca ||
                            currentCounts.total !== unreadCounts.total
                        ) {
                            badgeStoreState.updateAnnouncementBadges(
                                unreadCounts,
                            );
                            console.log(
                                "[AnnouncementStore] Updated badge store:",
                                unreadCounts,
                            );
                        }
                    }
                })
                .catch((error) => {
                    console.error(
                        "[AnnouncementStore] Failed to update badge store:",
                        error,
                    );
                });
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error in badge store integration:",
                error,
            );
        }
    },

    // Calculate unread counts and update badge store
    _calculateUnreadCounts: (userDivisionId?: number) => {
        const state = get();
        let divisionCount = 0;
        let gcaCount = 0;

        // Calculate GCA announcements unread count (always available to all users)
        const gcaAnnouncements = state.announcements["GCA"] || [];
        gcaCount =
            gcaAnnouncements.filter((a) => !state.readStatusMap[a.id]).length;

        // Calculate division announcements unread count
        if (userDivisionId) {
            // Only count announcements for the user's specific division
            Object.entries(state.announcements).forEach(
                ([divisionName, announcements]) => {
                    if (divisionName !== "GCA") {
                        // Check if these announcements are for the user's division
                        const userDivisionAnnouncements = announcements.filter(
                            (a) => {
                                return a.target_type === "division" &&
                                    a.target_division_ids?.includes(
                                        userDivisionId,
                                    );
                            },
                        );

                        divisionCount += userDivisionAnnouncements.filter((a) =>
                            !state.readStatusMap[a.id]
                        ).length;
                    }
                },
            );
        } else {
            // Fallback: count all division announcements if no user division provided
            Object.entries(state.announcements).forEach(
                ([divisionName, announcements]) => {
                    if (divisionName !== "GCA") {
                        divisionCount += announcements.filter((a) =>
                            !state.readStatusMap[a.id]
                        ).length;
                    }
                },
            );
        }

        const newUnreadCount = {
            division: divisionCount,
            gca: gcaCount,
            total: divisionCount + gcaCount,
        };

        set({ unreadCount: newUnreadCount });

        // Update badge store with new counts
        get()._updateBadgeStore(newUnreadCount);
    },

    // Fetch division announcements with context validation (following pattern from divisionMeetingStore)
    fetchDivisionAnnouncements: async (divisionName: string) => {
        get().setLoadingState(true, `Loading ${divisionName} announcements`);

        try {
            console.log(
                `[AnnouncementStore] Fetching announcements for division: ${divisionName}`,
            );

            // Get division ID first
            const { data: divisionData } = await supabase.from("divisions")
                .select("id").eq("name", divisionName).single();

            if (!divisionData?.id) {
                throw new Error(`Division ${divisionName} not found`);
            }

            // Fetch announcements ONLY for this specific division (exclude GCA announcements)
            const { data, error } = await supabase
                .from("announcements_with_author")
                .select("*")
                .eq("target_type", "division")
                .contains("target_division_ids", [divisionData.id])
                .eq("is_active", true)
                .order("created_at", { ascending: false });

            if (error) throw error;

            // Store announcements by division context (following pattern from divisionMeetingStore)
            set((state) => ({
                announcements: {
                    ...state.announcements,
                    [divisionName]: data || [],
                },
            }));

            // Populate read status from fetched announcements
            if (data && data.length > 0) {
                await get()._fetchUserPinAndPopulateReadStatus(data);
            }

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);

            get().setLoadingState(false);
        } catch (error) {
            const errorMessage = handleAnnouncementDivisionError(
                error instanceof Error ? error : new Error(String(error)),
                divisionName,
                "fetching announcements",
            );
            set({
                error: errorMessage,
            });
            get().setLoadingState(false);
        }
    },

    // Fetch GCA announcements
    fetchGCAnnouncements: async () => {
        get().setLoadingState(true, "Loading GCA announcements");

        try {
            console.log("[AnnouncementStore] Fetching GCA announcements");

            const { data, error } = await supabase
                .from("announcements_with_author")
                .select("*")
                .eq("target_type", "GCA")
                .eq("is_active", true)
                .order("created_at", { ascending: false });

            if (error) throw error;

            // Store GCA announcements
            set((state) => ({
                announcements: {
                    ...state.announcements,
                    GCA: data || [],
                },
            }));

            // Populate read status from fetched announcements
            if (data && data.length > 0) {
                await get()._fetchUserPinAndPopulateReadStatus(data);
            }

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);

            get().setLoadingState(false);
        } catch (error) {
            const errorMessage = handleAnnouncementDivisionError(
                error instanceof Error ? error : new Error(String(error)),
                "GCA",
                "fetching announcements",
            );
            set({
                error: errorMessage,
            });
            get().setLoadingState(false);
        }
    },

    // Mark announcement as read
    markAnnouncementAsRead: async (announcementId: string) => {
        try {
            await supabase.rpc("mark_announcement_as_read", {
                p_announcement_id: announcementId,
            });

            // Update local state
            set((state) => {
                // Update the readStatusMap
                const updatedReadStatusMap = {
                    ...state.readStatusMap,
                    [announcementId]: true,
                };

                // Update the announcement objects with computed properties
                const updatedAnnouncementsState = { ...state.announcements };
                Object.keys(updatedAnnouncementsState).forEach(
                    (divisionName) => {
                        updatedAnnouncementsState[divisionName] =
                            updatedAnnouncementsState[divisionName].map(
                                (announcement) => {
                                    if (announcement.id === announcementId) {
                                        return {
                                            ...announcement,
                                            has_been_read: true,
                                        };
                                    }
                                    return announcement;
                                },
                            );
                    },
                );

                return {
                    announcements: updatedAnnouncementsState,
                    readStatusMap: updatedReadStatusMap,
                };
            });

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error marking announcement as read:",
                error,
            );
        }
    },

    // Mark announcement as unread
    markAnnouncementAsUnread: async (announcementId: string) => {
        try {
            await supabase.rpc("mark_announcement_as_unread", {
                p_announcement_id: announcementId,
            });

            // Update local state
            set((state) => ({
                readStatusMap: {
                    ...state.readStatusMap,
                    [announcementId]: false,
                },
            }));

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error marking announcement as unread:",
                error,
            );
        }
    },

    // Acknowledge announcement
    acknowledgeAnnouncement: async (announcementId: string) => {
        try {
            await supabase.rpc("acknowledge_announcement", {
                p_announcement_id: announcementId,
            });

            // Update local state
            set((state) => {
                // Update both maps
                const updatedAcknowledgedMap = {
                    ...state.acknowledgedMap,
                    [announcementId]: true,
                };
                const updatedReadStatusMap = {
                    ...state.readStatusMap,
                    [announcementId]: true, // Acknowledging also marks as read
                };

                // Update the announcement objects with computed properties
                const updatedAnnouncementsState = { ...state.announcements };
                Object.keys(updatedAnnouncementsState).forEach(
                    (divisionName) => {
                        updatedAnnouncementsState[divisionName] =
                            updatedAnnouncementsState[divisionName].map(
                                (announcement) => {
                                    if (announcement.id === announcementId) {
                                        return {
                                            ...announcement,
                                            has_been_read: true,
                                            has_been_acknowledged: true,
                                        };
                                    }
                                    return announcement;
                                },
                            );
                    },
                );

                return {
                    announcements: updatedAnnouncementsState,
                    acknowledgedMap: updatedAcknowledgedMap,
                    readStatusMap: updatedReadStatusMap,
                };
            });

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error acknowledging announcement:",
                error,
            );
        }
    },

    // Create announcement
    createAnnouncement: async (announcement) => {
        try {
            const { data, error } = await supabase.rpc("create_announcement", {
                p_title: announcement.title,
                p_message: announcement.message,
                p_links: announcement.links,
                p_target_type: announcement.target_type,
                p_target_division_ids: announcement.target_division_ids,
                p_start_date: announcement.start_date,
                p_end_date: announcement.end_date,
                p_require_acknowledgment: announcement.require_acknowledgment,
                p_document_ids: announcement.document_ids,
            });

            if (error) throw error;

            if (data && data.length > 0) {
                const newAnnouncement = data[0];
                console.log(
                    "[AnnouncementStore] Created announcement:",
                    newAnnouncement.id,
                );

                // Refresh announcements for the relevant division/GCA
                if (announcement.target_type === "GCA") {
                    await get().fetchGCAnnouncements();
                } else {
                    // Find division name for the division IDs
                    const { data: divisionData } = await supabase
                        .from("divisions")
                        .select("name")
                        .in("id", announcement.target_division_ids);

                    if (divisionData) {
                        for (const division of divisionData) {
                            await get().fetchDivisionAnnouncements(
                                division.name,
                            );
                        }
                    }
                }

                return newAnnouncement.id;
            }

            return null;
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error creating announcement:",
                error,
            );
            throw error;
        }
    },

    // Update announcement
    updateAnnouncement: async (id: string, updates: Partial<Announcement>) => {
        try {
            const { error } = await supabase
                .from("announcements")
                .update(updates)
                .eq("id", id);

            if (error) throw error;

            // Update local state
            set((state) => ({
                announcements: Object.keys(state.announcements).reduce(
                    (acc, divisionName) => {
                        acc[divisionName] = state.announcements[divisionName]
                            .map((announcement) =>
                                announcement.id === id
                                    ? { ...announcement, ...updates }
                                    : announcement
                            );
                        return acc;
                    },
                    {} as Record<string, Announcement[]>,
                ),
            }));
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error updating announcement:",
                error,
            );
            throw error;
        }
    },

    // Delete announcement
    deleteAnnouncement: async (id: string) => {
        try {
            const { error } = await supabase
                .from("announcements")
                .delete()
                .eq("id", id);

            if (error) throw error;

            // Update local state
            set((state) => ({
                announcements: Object.keys(state.announcements).reduce(
                    (acc, divisionName) => {
                        acc[divisionName] = state.announcements[divisionName]
                            .filter(
                                (announcement) => announcement.id !== id,
                            );
                        return acc;
                    },
                    {} as Record<string, Announcement[]>,
                ),
            }));

            // Recalculate unread counts
            get()._calculateUnreadCounts(get().userDivisionId || undefined);
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error deleting announcement:",
                error,
            );
            throw error;
        }
    },

    // Get announcement analytics
    getAnnouncementAnalytics: async (announcementId: string) => {
        try {
            const { data, error } = await supabase
                .from("announcement_read_counts")
                .select("*")
                .eq("announcement_id", announcementId)
                .single();

            if (error) throw error;

            if (data) {
                const analytics: AnnouncementAnalytics = {
                    ...data,
                    read_percentage: data.eligible_member_count > 0
                        ? Math.round(
                            (data.read_count / data.eligible_member_count) *
                                100,
                        )
                        : 0,
                };
                return analytics;
            }

            return null;
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error fetching announcement analytics:",
                error,
            );
            return null;
        }
    },

    // Enhanced Analytics Methods
    getDetailedAnnouncementAnalytics: async (
        announcementId: string,
        forceRefresh?: boolean,
    ) => {
        try {
            const state = get();
            const cacheKey = announcementId;

            // Check cache if not forcing refresh
            if (!forceRefresh && state.analyticsCache[cacheKey]) {
                const cached = state.analyticsCache[cacheKey];
                const lastUpdated = new Date(cached.last_updated);
                const now = new Date();
                const diffMinutes = (now.getTime() - lastUpdated.getTime()) /
                    (1000 * 60);

                // Return cached data if less than 5 minutes old
                if (diffMinutes < 5) {
                    return cached;
                }
            }

            // Import and call the analytics utility function
            const { getDetailedAnnouncementAnalytics } = await import(
                "@/utils/announcementAnalytics"
            );
            const analytics = await getDetailedAnnouncementAnalytics(
                announcementId,
            );

            if (analytics) {
                // Cache the result
                set((state) => ({
                    analyticsCache: {
                        ...state.analyticsCache,
                        [cacheKey]: analytics,
                    },
                    analyticsLastUpdated: {
                        ...state.analyticsLastUpdated,
                        [cacheKey]: analytics.last_updated,
                    },
                }));

                // Return the analytics data
                return analytics;
            }

            return null;
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error fetching detailed analytics:",
                error,
            );
            return null;
        }
    },

    getDashboardAnalytics: async (
        divisionContext?: string,
        dateRange?: { start_date: string; end_date: string },
        forceRefresh?: boolean,
    ) => {
        try {
            const state = get();
            const cacheKey = divisionContext || "default"; // Use a fallback key for undefined context

            // Check cache if not forcing refresh
            if (!forceRefresh && state.dashboardAnalyticsCache[cacheKey]) {
                const lastUpdated = new Date(
                    state.dashboardAnalyticsCache[cacheKey].last_updated,
                );
                const now = new Date();
                const diffMinutes = (now.getTime() - lastUpdated.getTime()) /
                    (1000 * 60);

                // Return cached data if less than 10 minutes old
                if (diffMinutes < 10) {
                    return state.dashboardAnalyticsCache[cacheKey];
                }
            }

            // Import and call the dashboard analytics utility function
            const { getDashboardAnalytics } = await import(
                "@/utils/announcementAnalytics"
            );
            const analytics = await getDashboardAnalytics(
                divisionContext,
                dateRange,
            );

            if (analytics) {
                // Cache the dashboard analytics with the proper key
                set((state) => ({
                    dashboardAnalyticsCache: {
                        ...state.dashboardAnalyticsCache,
                        [cacheKey]: analytics,
                    },
                }));
            }

            return analytics;
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error fetching dashboard analytics:",
                error,
            );
            return null;
        }
    },

    exportAnalytics: async (request: AnalyticsExportRequest) => {
        try {
            // Import and call the export utility function
            const { exportAnalytics } = await import(
                "@/utils/announcementAnalytics"
            );
            return await exportAnalytics(request);
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error exporting analytics:",
                error,
            );
            return null;
        }
    },

    getLowEngagementAnnouncements: async (
        thresholdPercentage?: number,
        daysThreshold?: number,
        divisionContext?: string,
    ) => {
        try {
            // Import and call the low engagement utility function
            const { getLowEngagementAnnouncements } = await import(
                "@/utils/announcementAnalytics"
            );
            return await getLowEngagementAnnouncements(
                thresholdPercentage,
                daysThreshold,
                divisionContext,
            );
        } catch (error) {
            console.error(
                "[AnnouncementStore] Error fetching low engagement announcements:",
                error,
            );
            return [];
        }
    },

    // Subscription handling with division context (following pattern from divisionMeetingStore)
    subscribeToAnnouncements: async (divisionName?: string) => {
        const { unsubscribeFromAnnouncements, subscriptionStatus } = get();

        // Don't set up new subscriptions if we're already subscribed
        if (subscriptionStatus === "subscribed") {
            console.log(
                "[AnnouncementStore] Already subscribed, skipping setup",
            );
            return unsubscribeFromAnnouncements;
        }

        // Clean up existing subscriptions first
        unsubscribeFromAnnouncements();

        console.log(
            `[AnnouncementStore] Setting up realtime subscriptions for ${
                divisionName || "ALL"
            }`,
        );

        // Set subscribing status to prevent race conditions
        set({ subscriptionStatus: "subscribing" });

        // Get division ID for filtering if division is specified
        let divisionId: number | null = null;
        if (divisionName && divisionName !== "GCA") {
            // Fetch division ID asynchronously but don't block subscription setup
            const fetchDivisionId = async () => {
                try {
                    const { data } = await supabase
                        .from("divisions")
                        .select("id")
                        .eq("name", divisionName)
                        .single();
                    divisionId = data?.id || null;
                } catch (error) {
                    console.error(
                        "[AnnouncementStore] Error fetching division ID:",
                        error,
                    );
                }
            };

            fetchDivisionId();
        }

        const channelSuffix = divisionName ? `-${divisionName}` : "";

        // Subscribe to announcements changes with division filtering
        const announcementsChannel = await createRealtimeChannel(
            `announcements-changes${channelSuffix}`,
        );
        announcementsChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "announcements",
            },
            (payload) => {
                console.log(
                    `[Realtime] Announcements change received for ${
                        divisionName || "ALL"
                    }:`,
                    {
                        event: payload.eventType,
                        table: payload.table,
                        recordId: (payload.new as any)?.id ||
                            (payload.old as any)?.id,
                        targetType: (payload.new as any)?.target_type ||
                            (payload.old as any)?.target_type,
                        targetDivisionIds:
                            (payload.new as any)?.target_division_ids ||
                            (payload.old as any)?.target_division_ids,
                    },
                );

                // Validate that this change is relevant to our division context
                const changeTargetType = (payload.new as any)?.target_type ||
                    (payload.old as any)?.target_type;
                const changeTargetDivisionIds =
                    (payload.new as any)?.target_division_ids ||
                    (payload.old as any)?.target_division_ids;

                if (
                    divisionId &&
                    changeTargetType === "division" &&
                    changeTargetDivisionIds &&
                    !changeTargetDivisionIds.includes(divisionId)
                ) {
                    console.log(
                        `[Realtime] Ignoring change for different division (expected: ${divisionId}, got: ${changeTargetDivisionIds})`,
                    );
                    return;
                }

                // Refresh the appropriate announcement type based on the actual change
                if (changeTargetType === "GCA") {
                    console.log(
                        `[Realtime] Refreshing GCA announcements due to GCA change`,
                    );
                    get().fetchGCAnnouncements();
                } else if (
                    changeTargetType === "division" && divisionName &&
                    divisionName !== "GCA"
                ) {
                    console.log(
                        `[Realtime] Refreshing announcements for division: ${divisionName}`,
                    );
                    get().fetchDivisionAnnouncements(divisionName);
                } else {
                    console.log(
                        `[Realtime] Skipping refresh - changeTargetType: ${changeTargetType}, divisionName: ${divisionName}`,
                    );
                }
            },
        );

        announcementsChannel.subscribe();

        // Subscribe to read status changes
        const readStatusChannel = await createRealtimeChannel(
            `announcement-read-status-changes${channelSuffix}`,
        );
        readStatusChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "announcement_read_status",
            },
            (payload) => {
                console.log(
                    `[Realtime] Read status change received:`,
                    payload,
                );

                // Update read status in local state
                const announcementId = (payload.new as any)?.announcement_id ||
                    (payload.old as any)?.announcement_id;
                const userId = (payload.new as any)?.user_id ||
                    (payload.old as any)?.user_id;

                if (announcementId && userId) {
                    // Update local read status map
                    set((state) => ({
                        readStatusMap: {
                            ...state.readStatusMap,
                            [announcementId]: payload.eventType !== "DELETE",
                        },
                    }));

                    // Recalculate unread counts
                    get()._calculateUnreadCounts(
                        get().userDivisionId || undefined,
                    );
                }
            },
        );

        readStatusChannel.subscribe();

        // Store the subscription channels (following pattern from divisionMeetingStore)
        set({
            realtimeSubscriptions: {
                announcements: announcementsChannel,
                readStatus: readStatusChannel,
            },
            subscriptionStatus: "subscribed",
        });

        // Return cleanup function
        return () => {
            unsubscribeFromAnnouncements();
        };
    },

    // Unsubscribe from realtime (following pattern from divisionMeetingStore)
    unsubscribeFromAnnouncements: () => {
        const { realtimeSubscriptions } = get();

        console.log(
            "[AnnouncementStore] Unsubscribing from announcement channels",
        );

        // Clear state first to prevent any new subscriptions
        set({
            realtimeSubscriptions: {
                announcements: null,
                readStatus: null,
            },
            subscriptionStatus: "none",
        });

        // Clean up subscriptions with error handling and timeout protection
        const cleanupChannel = (
            channel: RealtimeChannel | null,
            channelName: string,
        ) => {
            if (channel) {
                try {
                    console.log(
                        `[AnnouncementStore] Removing ${channelName} channel`,
                    );

                    // Set a timeout to prevent hanging operations
                    const cleanupTimer = setTimeout(() => {
                        console.warn(
                            `[AnnouncementStore] ${channelName} cleanup timed out`,
                        );
                    }, 5000);

                    const removePromise = supabase.removeChannel(channel);

                    // Clear the timer if removal completes
                    if (
                        removePromise &&
                        typeof removePromise.then === "function"
                    ) {
                        removePromise.finally(() => clearTimeout(cleanupTimer));
                    } else {
                        clearTimeout(cleanupTimer);
                    }
                } catch (error) {
                    console.error(
                        `[AnnouncementStore] Error removing ${channelName} channel:`,
                        error,
                    );
                }
            }
        };

        cleanupChannel(realtimeSubscriptions.announcements, "announcements");
        cleanupChannel(realtimeSubscriptions.readStatus, "read status");

        console.log("[AnnouncementStore] Unsubscription complete");
    },

    // Initialize announcement store
    initializeAnnouncementStore: async (
        userId: string,
        assignedDivisionId: number | null,
        roles: string[],
    ) => {
        console.log("[AnnouncementStore] Initializing announcement store", {
            userId,
            assignedDivisionId,
            roles,
        });

        // Store user division ID for badge calculations
        set({ userDivisionId: assignedDivisionId });

        // Set initialized flag
        get().setIsInitialized(true);

        // Subscribe to realtime updates
        const cleanup = await get().subscribeToAnnouncements();

        // Fetch initial announcement data to populate badges
        const fetchInitialData = async () => {
            try {
                // Fetch GCA announcements (available to all users)
                await get().fetchGCAnnouncements();

                // Fetch division announcements if user has a division
                if (assignedDivisionId) {
                    // Get division name from ID
                    const { data: divisionData } = await supabase
                        .from("divisions")
                        .select("name")
                        .eq("id", assignedDivisionId)
                        .single();

                    if (divisionData?.name) {
                        await get().fetchDivisionAnnouncements(
                            divisionData.name,
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "[AnnouncementStore] Error fetching initial announcement data:",
                    error,
                );
            }
        };

        // Fetch initial data asynchronously (don't block initialization)
        fetchInitialData();

        // Return cleanup function for useAuth integration
        return cleanup;
    },

    // Cleanup announcement store
    cleanupAnnouncementStore: () => {
        console.log("[AnnouncementStore] Cleaning up announcement store");

        get().unsubscribeFromAnnouncements();

        set({
            announcements: {},
            readStatusMap: {},
            acknowledgedMap: {},
            unreadCount: { division: 0, gca: 0, total: 0 },
            isLoading: false,
            error: null,
            isInitialized: false,
            currentDivisionContext: null,
            subscriptionStatus: "none",
            loadingOperation: null,
            userDivisionId: null,
            // Clear analytics caches
            analyticsCache: {},
            dashboardAnalyticsCache: {},
            analyticsLastUpdated: {},
            // Clear realtime subscriptions
            realtimeSubscriptions: {
                announcements: null,
                readStatus: null,
            },
        });
    },

    // Refresh announcements
    refreshAnnouncements: async (divisionName: string, force?: boolean) => {
        if (force || !get().announcements[divisionName]) {
            if (divisionName === "GCA") {
                await get().fetchGCAnnouncements();
            } else {
                await get().fetchDivisionAnnouncements(divisionName);
            }
        }
    },

    // Data integrity validation (following pattern from divisionMeetingStore)
    validateAnnouncementDataIntegrity: async (divisionName: string) => {
        const issues: string[] = [];
        let isValid = true;

        try {
            // Validate that all announcements in the division context are properly filtered
            const divisionAnnouncements = get().announcements[divisionName] ||
                [];

            for (const announcement of divisionAnnouncements) {
                if (announcement.target_type === "division") {
                    const isValidContext =
                        await validateAnnouncementDivisionContext(
                            announcement.id,
                            divisionName,
                        );

                    if (!isValidContext) {
                        issues.push(
                            `Announcement ${announcement.id} does not belong to division ${divisionName}`,
                        );
                        isValid = false;
                    }
                }
            }
        } catch (error) {
            issues.push(`Error validating division data integrity: ${error}`);
            isValid = false;
        }

        return { isValid, issues };
    },

    // Helper function to fetch and set announcements
    _fetchAndSetAnnouncements: async (divisionName: string) => {
        if (divisionName === "GCA") {
            await get().fetchGCAnnouncements();
        } else {
            await get().fetchDivisionAnnouncements(divisionName);
        }
    },

    // New helper method to populate the readStatusMap from the read_by field in announcements
    _populateReadStatusFromAnnouncements: (
        announcements: Announcement[],
        userPin?: string,
    ) => {
        if (!userPin) {
            console.warn(
                "[AnnouncementStore] No user PIN provided for read status population",
            );
            return;
        }

        const updatedReadStatusMap: Record<string, boolean> = {};
        const updatedAcknowledgedMap: Record<string, boolean> = {};

        // Update the announcements with computed properties AND populate maps
        const updatedAnnouncements = announcements.map((announcement) => {
            // Check if user's PIN is in the read_by array
            const hasBeenRead = announcement.read_by?.includes(userPin) ||
                false;
            const hasBeenAcknowledged =
                announcement.acknowledged_by?.includes(userPin) || false;

            updatedReadStatusMap[announcement.id] = hasBeenRead;
            updatedAcknowledgedMap[announcement.id] = hasBeenAcknowledged;

            // Return announcement with computed properties
            return {
                ...announcement,
                has_been_read: hasBeenRead,
                has_been_acknowledged: hasBeenAcknowledged,
            };
        });

        // Update the state with both the populated read status and updated announcements
        set((state) => {
            // Find which division these announcements belong to and update them
            const updatedAnnouncementsState = { ...state.announcements };

            // Update announcements in the appropriate division contexts
            Object.keys(updatedAnnouncementsState).forEach((divisionName) => {
                updatedAnnouncementsState[divisionName] =
                    updatedAnnouncementsState[divisionName].map((existing) => {
                        const updated = updatedAnnouncements.find((a) =>
                            a.id === existing.id
                        );
                        return updated || existing;
                    });
            });

            return {
                announcements: updatedAnnouncementsState,
                readStatusMap: {
                    ...state.readStatusMap,
                    ...updatedReadStatusMap,
                },
                acknowledgedMap: {
                    ...state.acknowledgedMap,
                    ...updatedAcknowledgedMap,
                },
            };
        });

        console.log(
            `[AnnouncementStore] Populated read status for ${announcements.length} announcements for PIN ${userPin}`,
        );
    },

    // Helper to fetch PIN and populate read status
    _fetchUserPinAndPopulateReadStatus: async (
        announcements: Announcement[],
    ) => {
        try {
            // Get current user from auth
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
                // Get user's PIN from members table
                const { data: memberData } = await supabase
                    .from("members")
                    .select("pin_number")
                    .eq("id", user.id)
                    .single();

                if (memberData?.pin_number) {
                    // Populate read status from the fetched announcements
                    get()._populateReadStatusFromAnnouncements(
                        announcements,
                        memberData.pin_number.toString(),
                    );
                }
            }
        } catch (pinError) {
            console.warn(
                "[AnnouncementStore] Could not fetch user PIN for read status:",
                pinError,
            );
        }
    },
}));
