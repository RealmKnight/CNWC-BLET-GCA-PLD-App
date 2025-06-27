import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useBadgeStore } from "@/store/badgeStore";
import { useUserStore } from "@/store/userStore";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { AppState } from "react-native";

interface PriorityItem {
    id: string;
    type: "message" | "announcement";
    priority: "critical" | "high" | "normal";
    targetRoute: string;
    title: string;
    requiresAcknowledgment: boolean;
    isRead: boolean;
    isAcknowledged: boolean;
    createdAt: string;
    messageType?: string;
    targetType?: string;
}

export function usePriorityRouter() {
    const router = useRouter();
    const pathname = usePathname();
    const { member } = useAuth();
    const division = useUserStore((state) => state.division);
    const effectiveRoles = useEffectiveRoles() ?? [];
    const [isCheckingPriority, setIsCheckingPriority] = useState(false);
    const [priorityItems, setPriorityItems] = useState<PriorityItem[]>([]);
    const [currentlyHandlingItem, setCurrentlyHandlingItem] = useState<
        string | null
    >(null);
    const [hasCompletedInitialCheck, setHasCompletedInitialCheck] = useState(
        false,
    );
    const [isProcessingPriority, setIsProcessingPriority] = useState(false);

    // Get store data
    const messages = useNotificationStore((state) => state.messages);
    const announcements = useAnnouncementStore((state) => state.announcements);

    // Add app state monitoring to refresh stores when app comes to foreground
    useEffect(() => {
        const handleAppStateChange = async (nextAppState: string) => {
            if (nextAppState === "active" && member) {
                console.log(
                    "[PriorityRouter] App came to foreground, refreshing stores",
                );

                // Force refresh both stores
                try {
                    // Refresh notification store
                    const notificationStore = useNotificationStore.getState();
                    if (
                        notificationStore.refreshMessages &&
                        member.pin_number && member.id
                    ) {
                        await notificationStore.refreshMessages(
                            member.pin_number,
                            member.id,
                            true,
                        );
                    }

                    // Refresh announcement stores
                    const announcementStore = useAnnouncementStore.getState();
                    if (announcementStore.refreshAnnouncements) {
                        // Refresh GCA announcements
                        await announcementStore.refreshAnnouncements(
                            "GCA",
                            true,
                        );

                        // Refresh division announcements if user has a division
                        if (division) {
                            await announcementStore.refreshAnnouncements(
                                division,
                                true,
                            );
                        }
                    }

                    console.log(
                        "[PriorityRouter] Stores refreshed, triggering priority check",
                    );
                    // Force a priority check after refresh
                    setTimeout(() => {
                        checkForPriorityItems();
                    }, 1000);
                } catch (error) {
                    console.error(
                        "[PriorityRouter] Error refreshing stores:",
                        error,
                    );
                }
            }
        };

        const subscription = AppState.addEventListener(
            "change",
            handleAppStateChange,
        );
        return () => subscription?.remove();
    }, [member, division]);

    // Memoize checkForPriorityItems with stable dependencies only
    const checkForPriorityItems = useCallback(async () => {
        if (!member || !member.id) return [];

        // Prevent overlapping checks
        if (isProcessingPriority) {
            // console.log(
            //     "[PriorityRouter] Already processing priority items, skipping check",
            // );
            return priorityItems;
        }

        setIsProcessingPriority(true);
        setIsCheckingPriority(true);
        const items: PriorityItem[] = [];

        // console.log("[PriorityRouter] Checking for priority items...");

        try {
            // 1. Check for CRITICAL: Must Read messages (highest priority)
            // Only include messages that are UNREAD or UNACKNOWLEDGED
            const criticalMessages = messages.filter((msg) => {
                const isUnread = !msg.is_read;
                // Use PIN number for consistency with how acknowledgeMessage stores data
                const userIdentifier = member.pin_number?.toString() ||
                    member.id || "";
                const isUnacknowledged = msg.requires_acknowledgment &&
                    (!msg.acknowledged_at ||
                        !msg.acknowledged_by?.includes(userIdentifier));

                return msg.message_type === "must_read" &&
                    msg.requires_acknowledgment &&
                    (isUnread || isUnacknowledged);
            });

            criticalMessages.forEach((msg) => {
                // Use PIN number for consistency with how acknowledgeMessage stores data
                const userIdentifier = member.pin_number?.toString() ||
                    member.id || "";
                items.push({
                    id: msg.id,
                    type: "message",
                    priority: "critical",
                    targetRoute: `/(tabs)/notifications`, // Route to notifications tab, not individual message
                    title: msg.subject,
                    requiresAcknowledgment: true,
                    isRead: msg.is_read || false,
                    isAcknowledged:
                        msg.acknowledged_by?.includes(userIdentifier) ||
                        false,
                    createdAt: msg.created_at || new Date().toISOString(),
                    messageType: msg.message_type,
                });
            });

            // 2. Check for HIGH: Must acknowledge announcements (second priority)
            // Only include announcements that are UNREAD or UNACKNOWLEDGED
            Object.values(announcements).flat().forEach((announcement) => {
                if (announcement.require_acknowledgment) {
                    // Check raw database arrays instead of computed properties
                    const userIdentifier = member.pin_number?.toString() ||
                        member.id || "";
                    const isUnread = !announcement.read_by?.includes(
                        userIdentifier,
                    );
                    const isUnacknowledged = !announcement.acknowledged_by
                        ?.includes(userIdentifier);

                    // Only include if unread OR unacknowledged
                    if (isUnread || isUnacknowledged) {
                        // For division announcements, only treat as priority if it's for the user's PERSONAL division
                        const isDivisionAnnouncement =
                            announcement.target_type === "division";

                        if (isDivisionAnnouncement) {
                            // Check if this announcement is for the user's personal division
                            // We need to compare against the actual division ID, not the division name
                            let isForPersonalDivision = false;

                            if (member?.division_id) {
                                // Check if any of the announcement's target division IDs match the user's personal division
                                isForPersonalDivision =
                                    announcement.target_division_ids?.includes(
                                        member.division_id,
                                    ) || false;
                            }

                            if (!isForPersonalDivision) {
                                console.log(
                                    `[PriorityRouter] Skipping division announcement ${announcement.id} (${announcement.title}) - not for user's personal division (user division_id: ${member?.division_id}, announcement target_division_ids: ${announcement.target_division_ids})`,
                                );
                                return; // Skip this announcement
                            }
                        }

                        const route = announcement.target_type === "GCA"
                            ? `/(gca)/announcements`
                            : `/(division)/${division}/announcements`;

                        console.log(
                            `[PriorityRouter] Adding announcement ${announcement.id} (${announcement.title}) with target_type: ${announcement.target_type}, route: ${route}`,
                        );

                        items.push({
                            id: announcement.id,
                            type: "announcement",
                            priority: "high",
                            targetRoute: route,
                            title: announcement.title,
                            requiresAcknowledgment: true,
                            isRead: !isUnread,
                            isAcknowledged: !isUnacknowledged,
                            createdAt: announcement.created_at,
                            targetType: announcement.target_type,
                        });
                    }
                }
            });

            // Sort by priority: critical first, then high, then by creation date (newest first)
            items.sort((a, b) => {
                const priorityOrder = { critical: 0, high: 1, normal: 2 };
                const priorityDiff = priorityOrder[a.priority] -
                    priorityOrder[b.priority];

                if (priorityDiff !== 0) return priorityDiff;

                // If same priority, sort by creation date (newest first)
                return new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime();
            });

            // console.log(
            //     `[PriorityRouter] Found ${items.length} priority items:`,
            //     items.map((i) => ({
            //         id: i.id,
            //         title: i.title,
            //         priority: i.priority,
            //     })),
            // );

            setPriorityItems(items);
            return items;
        } finally {
            setIsCheckingPriority(false);
            setIsProcessingPriority(false);
        }
    }, [
        member,
        messages,
        announcements,
        division,
        isProcessingPriority,
        effectiveRoles,
        pathname,
        // REMOVED priorityItems from dependencies to break circular dependency
    ]);

    const getNextUnhandledItem = useCallback(() => {
        return priorityItems.find((item) =>
            item.id !== currentlyHandlingItem &&
            (!item.isRead || !item.isAcknowledged)
        );
    }, [priorityItems, currentlyHandlingItem]);

    const routeToNextPriorityItem = useCallback(() => {
        const nextItem = getNextUnhandledItem();

        if (nextItem) {
            // Prevent routing to the same item we're already handling
            if (currentlyHandlingItem === nextItem.id) {
                // console.log(
                //     `[PriorityRouter] Already handling item ${nextItem.id}, skipping`,
                // );
                return false;
            }

            // console.log(
            //     `[PriorityRouter] Routing to next priority item: ${nextItem.title}`,
            // );

            // Mark this item as currently being handled BEFORE routing
            setCurrentlyHandlingItem(nextItem.id);

            // Also temporarily remove it from the priority items list to prevent re-triggering
            setPriorityItems((prev) =>
                prev.filter((item) => item.id !== nextItem.id)
            );

            // console.log(
            //     `[PriorityRouter] Marked item ${nextItem.id} as being handled and temporarily removed from priority list`,
            // );

            router.push(nextItem.targetRoute as any);
            return true;
        }

        console.log("[PriorityRouter] No more priority items to handle");
        setCurrentlyHandlingItem(null);
        return false;
    }, [getNextUnhandledItem, router, currentlyHandlingItem]);

    const markItemAsHandled = useCallback((itemId: string) => {
        console.log(`[PriorityRouter] Marking item as handled: ${itemId}`);

        setPriorityItems((prev) => {
            const updated = prev.filter((item) => item.id !== itemId);
            // console.log(
            //     `[PriorityRouter] Items after removal: ${updated.length}`,
            // );
            return updated;
        });

        // Clear current handling if this was the item being handled
        if (currentlyHandlingItem === itemId) {
            // console.log(
            //     `[PriorityRouter] Currently handled item was marked as handled, clearing`,
            // );
            setCurrentlyHandlingItem(null);
        }
    }, [currentlyHandlingItem]);

    // Add a function to restore items if user navigates away without handling them
    const restoreUnhandledItem = useCallback((itemId: string) => {
        if (currentlyHandlingItem === itemId) {
            // console.log(
            //     `[PriorityRouter] Restoring unhandled item ${itemId} to priority list`,
            // );

            // Re-check for priority items to restore the item if it still needs attention
            setTimeout(() => {
                checkForPriorityItems();
            }, 500);

            setCurrentlyHandlingItem(null);
        }
    }, [currentlyHandlingItem, checkForPriorityItems]);

    const isOnPriorityRoute = useCallback(() => {
        return pathname.includes("/notifications") ||
            pathname.includes("/announcements") ||
            (pathname.includes("/admin/") &&
                pathname.includes("AdminMessages"));
    }, [pathname]);

    const shouldBlockNavigation = useCallback(() => {
        const hasCriticalItems = priorityItems.some((item) =>
            item.priority === "critical" &&
            (!item.isRead || !item.isAcknowledged)
        );

        const hasHighPriorityItems = priorityItems.some((item) =>
            item.priority === "high" &&
            (!item.isRead || !item.isAcknowledged)
        );

        // Don't block if user is already on a priority route, tabs index, or admin routes
        const isOnValidRoute = isOnPriorityRoute() ||
            pathname === "/(tabs)" ||
            pathname.startsWith("/(admin)");

        return (hasCriticalItems || hasHighPriorityItems) && !isOnValidRoute;
    }, [priorityItems, isOnPriorityRoute, pathname]);

    // Initial check when component mounts or member changes
    useEffect(() => {
        if (member && !hasCompletedInitialCheck) {
            checkForPriorityItems().then((items) => {
                setHasCompletedInitialCheck(true);
            });
        }
    }, [
        member?.id, // Only depend on member ID, not full member object
        hasCompletedInitialCheck,
    ]);

    // Monitor for items getting acknowledged and automatically mark them as handled
    useEffect(() => {
        if (!member || priorityItems.length === 0) return;

        // Check if any of our priority items have been acknowledged since last check
        const userIdentifier = member.pin_number?.toString() || member.id || "";

        priorityItems.forEach((item) => {
            if (item.type === "announcement") {
                // Find the actual announcement in the store
                const announcement = Object.values(announcements).flat().find(
                    (a) => a.id === item.id,
                );
                if (announcement) {
                    const isNowAcknowledged = announcement.acknowledged_by
                        ?.includes(userIdentifier);
                    const isNowRead = announcement.read_by?.includes(
                        userIdentifier,
                    );

                    // If the item was previously unacknowledged/unread but is now acknowledged/read, mark as handled
                    if (
                        (!item.isAcknowledged && isNowAcknowledged) ||
                        (!item.isRead && isNowRead &&
                            !announcement.require_acknowledgment)
                    ) {
                        console.log(
                            `[PriorityRouter] Announcement ${item.id} has been acknowledged/read, marking as handled`,
                        );
                        markItemAsHandled(item.id);
                    }
                }
            } else if (item.type === "message") {
                // Find the actual message in the store
                const message = messages.find((m) => m.id === item.id);
                if (message) {
                    const isNowAcknowledged = message.acknowledged_by?.includes(
                        member.id || "",
                    );
                    const isNowRead = message.is_read;

                    // If the item was previously unacknowledged/unread but is now acknowledged/read, mark as handled
                    if (
                        (!item.isAcknowledged && isNowAcknowledged) ||
                        (!item.isRead && isNowRead &&
                            !message.requires_acknowledgment)
                    ) {
                        console.log(
                            `[PriorityRouter] Message ${item.id} has been acknowledged/read, marking as handled`,
                        );
                        markItemAsHandled(item.id);
                    }
                }
            }
        });
    }, [
        // REMOVED circular dependencies: announcements, messages, priorityItems, markItemAsHandled
        // Only watch the length/count changes to avoid constant re-checking
        announcements && Object.keys(announcements).length,
        messages && messages.length,
        member?.id,
        // Create a stable reference for priority items by only watching their count and IDs
        priorityItems.length > 0
            ? priorityItems.map((p) => p.id).join(",")
            : "none",
    ]);

    // Re-check when messages or announcements change (realtime updates)
    // Use a separate effect with stable dependencies
    useEffect(() => {
        if (member && hasCompletedInitialCheck) {
            // console.log(
            //     "[PriorityRouter] Store data changed, checking for priority items",
            // );

            // Debounce the check to prevent rapid fire updates
            const timeoutId = setTimeout(() => {
                // Call checkForPriorityItems directly to avoid dependency issues
                const performCheck = async () => {
                    if (!member || !member.id) return;

                    // console.log(
                    //     "[PriorityRouter] Performing deferred priority check",
                    // );

                    // Use current store state directly instead of depending on variables
                    const currentMessages =
                        useNotificationStore.getState().messages;
                    const currentAnnouncements =
                        useAnnouncementStore.getState().announcements;

                    // Simplified priority check without circular dependencies
                    const items: PriorityItem[] = [];

                    // Check critical messages
                    const criticalMessages = currentMessages.filter((msg) => {
                        const isUnread = !msg.is_read;
                        // Use PIN number for consistency with how acknowledgeMessage stores data
                        const userIdentifier = member.pin_number?.toString() ||
                            member.id || "";
                        const isUnacknowledged = msg.requires_acknowledgment &&
                            (!msg.acknowledged_at ||
                                !msg.acknowledged_by?.includes(
                                    userIdentifier,
                                ));

                        return msg.message_type === "must_read" &&
                            msg.requires_acknowledgment &&
                            (isUnread || isUnacknowledged);
                    });

                    criticalMessages.forEach((msg) => {
                        // Use PIN number for consistency with how acknowledgeMessage stores data
                        const userIdentifier = member.pin_number?.toString() ||
                            member.id || "";
                        items.push({
                            id: msg.id,
                            type: "message",
                            priority: "critical",
                            targetRoute: `/(tabs)/notifications`,
                            title: msg.subject,
                            requiresAcknowledgment: true,
                            isRead: msg.is_read || false,
                            isAcknowledged: msg.acknowledged_by?.includes(
                                userIdentifier,
                            ) || false,
                            createdAt: msg.created_at ||
                                new Date().toISOString(),
                            messageType: msg.message_type,
                        });
                    });

                    // Check high priority announcements
                    Object.values(currentAnnouncements).flat().forEach(
                        (announcement) => {
                            if (announcement.require_acknowledgment) {
                                const userIdentifier =
                                    member.pin_number?.toString() ||
                                    member.id || "";
                                const isUnread = !announcement.read_by
                                    ?.includes(userIdentifier);
                                const isUnacknowledged = !announcement
                                    .acknowledged_by?.includes(userIdentifier);

                                if (isUnread || isUnacknowledged) {
                                    // For division announcements, only treat as priority if it's for the user's PERSONAL division
                                    const isDivisionAnnouncement =
                                        announcement.target_type === "division";

                                    if (isDivisionAnnouncement) {
                                        // Check if this announcement is for the user's personal division
                                        let isForPersonalDivision = false;

                                        if (member?.division_id) {
                                            // Check if any of the announcement's target division IDs match the user's personal division
                                            isForPersonalDivision =
                                                announcement.target_division_ids
                                                    ?.includes(
                                                        member.division_id,
                                                    ) || false;
                                        }

                                        if (!isForPersonalDivision) {
                                            console.log(
                                                `[PriorityRouter] Deferred check: Skipping division announcement ${announcement.id} (${announcement.title}) - not for user's personal division (user division_id: ${member?.division_id}, announcement target_division_ids: ${announcement.target_division_ids})`,
                                            );
                                            return; // Skip this announcement
                                        }
                                    }

                                    const route =
                                        announcement.target_type === "GCA"
                                            ? `/(gca)/announcements`
                                            : `/(division)/${division}/announcements`;

                                    console.log(
                                        `[PriorityRouter] Deferred check: Adding announcement ${announcement.id} (${announcement.title}) with target_type: ${announcement.target_type}, route: ${route}`,
                                    );

                                    items.push({
                                        id: announcement.id,
                                        type: "announcement",
                                        priority: "high",
                                        targetRoute: route,
                                        title: announcement.title,
                                        requiresAcknowledgment: true,
                                        isRead: !isUnread,
                                        isAcknowledged: !isUnacknowledged,
                                        createdAt: announcement.created_at,
                                        targetType: announcement.target_type,
                                    });
                                }
                            }
                        },
                    );

                    // Sort items
                    items.sort((a, b) => {
                        const priorityOrder = {
                            critical: 0,
                            high: 1,
                            normal: 2,
                        };
                        const priorityDiff = priorityOrder[a.priority] -
                            priorityOrder[b.priority];
                        if (priorityDiff !== 0) return priorityDiff;
                        return new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime();
                    });

                    // console.log(
                    //     `[PriorityRouter] Deferred check found ${items.length} total priority items`,
                    // );
                    setPriorityItems(items);
                };

                performCheck();
            }, 500); // Wait 500ms to batch updates

            return () => clearTimeout(timeoutId);
        }
    }, [
        // SIMPLIFIED dependencies - only watch actual data changes that matter
        messages.length,
        Object.keys(announcements).length,
        member?.id,
        hasCompletedInitialCheck,
        division,
    ]);

    // Monitor navigation changes to detect if user leaves priority routes without handling items
    useEffect(() => {
        // If user is currently handling an item but navigates away from priority routes, restore the item
        if (
            currentlyHandlingItem && !isOnPriorityRoute() &&
            pathname !== "/(tabs)"
        ) {
            // console.log(
            //     `[PriorityRouter] User navigated away from priority route while handling item ${currentlyHandlingItem}, restoring item`,
            // );
            restoreUnhandledItem(currentlyHandlingItem);
        }
    }, [
        pathname,
        currentlyHandlingItem,
        isOnPriorityRoute,
        restoreUnhandledItem,
    ]);

    const manualCheckForPriorityItems = useCallback(async () => {
        console.log("[PriorityRouter] Manual priority check triggered");
        return await checkForPriorityItems();
    }, [checkForPriorityItems]);

    // Enhanced debug function to show detailed store state
    const debugStoreState = useCallback(() => {
        const currentMessages = useNotificationStore.getState().messages;
        const currentAnnouncements =
            useAnnouncementStore.getState().announcements;

        console.log("[PriorityRouter] === DETAILED STORE DEBUG ===");
        console.log(
            "[PriorityRouter] Messages in store:",
            currentMessages.length,
        );

        const mustReadMessages = currentMessages.filter((m) =>
            m.message_type === "must_read" && m.requires_acknowledgment
        );
        console.log(
            "[PriorityRouter] Must-read messages:",
            mustReadMessages.map((m) => ({
                id: m.id,
                subject: m.subject,
                is_read: m.is_read,
                requires_acknowledgment: m.requires_acknowledgment,
                acknowledged_by: m.acknowledged_by,
                created_at: m.created_at,
            })),
        );

        console.log(
            "[PriorityRouter] Announcements by division:",
            Object.keys(currentAnnouncements),
        );
        Object.entries(currentAnnouncements).forEach(([divisionName, anns]) => {
            const requireAck = anns.filter((a) => a.require_acknowledgment);
            console.log(
                `[PriorityRouter] ${divisionName} announcements requiring acknowledgment:`,
                requireAck.map((a) => ({
                    id: a.id,
                    title: a.title,
                    require_acknowledgment: a.require_acknowledgment,
                    read_by: a.read_by,
                    acknowledged_by: a.acknowledged_by,
                    created_at: a.created_at,
                })),
            );
        });

        console.log("[PriorityRouter] Member info:", {
            id: member?.id,
            pin_number: member?.pin_number,
            division: division,
        });
        console.log(
            "[PriorityRouter] Current handling item:",
            currentlyHandlingItem,
        );
        console.log("[PriorityRouter] === END STORE DEBUG ===");
    }, [member, division, currentlyHandlingItem]);

    return {
        isCheckingPriority,
        priorityItems,
        currentlyHandlingItem,
        checkForPriorityItems,
        manualCheckForPriorityItems,
        debugStoreState,
        routeToNextPriorityItem,
        markItemAsHandled,
        restoreUnhandledItem,
        shouldBlockNavigation,
        isOnPriorityRoute,
        hasCriticalItems: priorityItems.some((item) =>
            item.priority === "critical"
        ),
        hasHighPriorityItems: priorityItems.some((item) =>
            item.priority === "high"
        ),
        totalPriorityItems: priorityItems.length,
        // Debug information
        debugInfo: {
            messagesCount: messages.length,
            announcementsCount: Object.keys(announcements).length,
            mustReadMessagesCount:
                messages.filter((m) =>
                    m.message_type === "must_read" && m.requires_acknowledgment
                ).length,
            requireAckAnnouncementsCount:
                Object.values(announcements).flat().filter((a) =>
                    a.require_acknowledgment
                ).length,
            notificationSubStatus:
                useNotificationStore.getState().subscriptionStatus,
            announcementSubStatus:
                useAnnouncementStore.getState().subscriptionStatus,
            currentlyHandlingItem: currentlyHandlingItem,
        },
    };
}
