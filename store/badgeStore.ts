import { create } from "zustand";
import * as Notifications from "expo-notifications";
import { supabase } from "@/utils/supabase";
import { Platform } from "react-native";

interface BadgeState {
    unreadCount: number;
    loading: boolean;
    error: string | null;
    fetchUnreadCount: (userId: string) => Promise<number>;
    incrementBadge: (count?: number) => void;
    decrementBadge: (count?: number) => void;
    resetBadge: () => void;
}

/**
 * Store for managing notification badge counts across devices
 *
 * This store provides a centralized way to manage badge counts,
 * ensuring they remain synchronized across devices.
 *
 * It uses the global read status of messages rather than device-specific
 * tracking, so when a message is marked as read on one device, it will
 * be considered read on all devices.
 */
export const useBadgeStore = create<BadgeState>((set, get) => ({
    unreadCount: 0,
    loading: false,
    error: null,

    /**
     * Fetch unread count from database and update badge
     * @param userId User ID to fetch count for
     * @returns The unread count
     */
    fetchUnreadCount: async (userId: string) => {
        try {
            set({ loading: true, error: null });

            let unreadCount = 0;

            if (Platform.OS === "web") {
                // For web, use two separate simple queries to avoid OR conditions

                // First query: Count messages where recipient_id matches userId
                const recipientIdQuery = await supabase
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .eq("is_read", false)
                    .eq("is_deleted", false)
                    .eq("is_archived", false)
                    .eq("recipient_id", userId);

                // Get member's PIN number from the members table
                const { data: memberData, error: memberError } = await supabase
                    .from("members")
                    .select("pin_number")
                    .eq("id", userId)
                    .single();

                if (memberError) {
                    console.error(
                        "[BadgeStore] Error fetching member PIN:",
                        memberError,
                    );
                }

                // Only do PIN-based query if we got the PIN number
                let pinCount = 0;
                if (memberData?.pin_number) {
                    const pinNumber = memberData.pin_number;

                    // Second query: Count messages where recipient_pin_number matches the member's PIN
                    const recipientPinQuery = await supabase
                        .from("messages")
                        .select("*", { count: "exact", head: true })
                        .eq("is_read", false)
                        .eq("is_deleted", false)
                        .eq("is_archived", false)
                        .eq("recipient_pin_number", pinNumber);

                    if (recipientPinQuery.error) {
                        console.error(
                            "[BadgeStore] Error in recipient_pin query:",
                            recipientPinQuery.error,
                        );
                    } else {
                        pinCount = recipientPinQuery.count || 0;
                    }

                    // Log the PIN number we're using
                    console.log(
                        `[BadgeStore] Using PIN number ${pinNumber} for user ${userId}`,
                    );
                }

                // Handle errors in ID query
                if (recipientIdQuery.error) {
                    console.error(
                        "[BadgeStore] Error in recipient_id query:",
                        recipientIdQuery.error,
                    );
                }

                // Combine counts from both queries
                const idCount = recipientIdQuery.count || 0;

                unreadCount = idCount + pinCount;

                // Log for debugging
                console.log(
                    `[BadgeStore] Web query results - ID count: ${idCount}, PIN count: ${pinCount}, Total: ${unreadCount}`,
                );
            } else {
                // For native platforms, look up PIN first, then do the query with OR condition
                // Get member's PIN number from the members table
                const { data: memberData, error: memberError } = await supabase
                    .from("members")
                    .select("pin_number")
                    .eq("id", userId)
                    .single();

                if (memberError) {
                    console.error(
                        "[BadgeStore] Error fetching member PIN:",
                        memberError,
                    );
                    // Continue with just the user ID query
                }

                let query = supabase
                    .from("messages")
                    .select("*", { count: "exact", head: true })
                    .eq("is_read", false)
                    .eq("is_deleted", false)
                    .eq("is_archived", false);

                if (memberData?.pin_number) {
                    // If we have the PIN, query with OR condition
                    query = query.or(
                        `recipient_id.eq.${userId},recipient_pin_number.eq.${memberData.pin_number}`,
                    );
                } else {
                    // Otherwise, just query by recipient_id
                    query = query.eq("recipient_id", userId);
                }

                const { count, error } = await query;

                if (error) {
                    console.error(
                        "[BadgeStore] Error fetching unread count:",
                        error,
                    );
                    set({
                        error: error.message || "Unknown database error",
                        loading: false,
                    });
                    return get().unreadCount;
                }

                unreadCount = count || 0;
            }

            // Set state and update device badge
            set({ unreadCount, loading: false });

            if (Platform.OS !== "web") {
                await Notifications.setBadgeCountAsync(unreadCount);
                console.log(
                    `[BadgeStore] Updated badge count to ${unreadCount}`,
                );
            } else {
                console.log(
                    `[BadgeStore] Web platform - badge count is ${unreadCount}`,
                );
            }

            return unreadCount;
        } catch (error: any) {
            console.error("[BadgeStore] Error in fetchUnreadCount:", error);
            set({
                error: error?.message || "Unknown error fetching unread count",
                loading: false,
            });
            return get().unreadCount;
        }
    },

    /**
     * Increment badge count by specified amount
     * @param count Amount to increment by (default: 1)
     */
    incrementBadge: (count = 1) => {
        const newCount = get().unreadCount + count;
        set({ unreadCount: newCount });

        if (Platform.OS !== "web") {
            Notifications.setBadgeCountAsync(newCount)
                .catch((error) =>
                    console.error("[BadgeStore] Error updating badge:", error)
                );
        }
    },

    /**
     * Decrement badge count by specified amount
     * @param count Amount to decrement by (default: 1)
     */
    decrementBadge: (count = 1) => {
        const currentCount = get().unreadCount;
        const newCount = Math.max(0, currentCount - count);
        set({ unreadCount: newCount });

        if (Platform.OS !== "web") {
            Notifications.setBadgeCountAsync(newCount)
                .catch((error) =>
                    console.error("[BadgeStore] Error updating badge:", error)
                );
        }
    },

    /**
     * Reset badge count to zero
     */
    resetBadge: () => {
        set({ unreadCount: 0 });

        if (Platform.OS !== "web") {
            Notifications.setBadgeCountAsync(0)
                .catch((error) =>
                    console.error("[BadgeStore] Error resetting badge:", error)
                );
        }
    },
}));
