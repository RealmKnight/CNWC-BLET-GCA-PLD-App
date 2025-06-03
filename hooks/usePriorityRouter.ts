import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useBadgeStore } from "@/store/badgeStore";
import { useUserStore } from "@/store/userStore";

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

    const checkForPriorityItems = useCallback(async () => {
        if (!member || !member.id) return [];

        // Prevent overlapping checks
        if (isProcessingPriority) {
            console.log(
                "[PriorityRouter] Already processing priority items, skipping check",
            );
            return priorityItems;
        }

        setIsProcessingPriority(true);
        setIsCheckingPriority(true);
        const items: PriorityItem[] = [];

        console.log("[PriorityRouter] Checking for priority items...");

        try {
            // 1. Check for CRITICAL: Must Read messages (highest priority)
            // Only include messages that are UNREAD or UNACKNOWLEDGED
            const criticalMessages = messages.filter((msg) => {
                const isUnread = !msg.is_read;
                const isUnacknowledged = msg.requires_acknowledgment &&
                    (!msg.acknowledged_at ||
                        !msg.acknowledged_by?.includes(member.id || ""));

                return msg.message_type === "must_read" &&
                    msg.requires_acknowledgment &&
                    (isUnread || isUnacknowledged);
            });

            criticalMessages.forEach((msg) => {
                items.push({
                    id: msg.id,
                    type: "message",
                    priority: "critical",
                    targetRoute: `/(tabs)/notifications`, // Route to notifications tab, not individual message
                    title: msg.subject,
                    requiresAcknowledgment: true,
                    isRead: msg.is_read || false,
                    isAcknowledged:
                        msg.acknowledged_by?.includes(member.id || "") ||
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
                        const route = announcement.target_type === "GCA"
                            ? `/(gca)/announcements`
                            : `/(division)/${division}/announcements`;

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

            console.log(
                `[PriorityRouter] Found ${items.length} priority items:`,
                items.map((i) => ({
                    id: i.id,
                    title: i.title,
                    priority: i.priority,
                })),
            );

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
        priorityItems,
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
                console.log(
                    `[PriorityRouter] Already handling item ${nextItem.id}, skipping`,
                );
                return false;
            }

            console.log(
                `[PriorityRouter] Routing to next priority item: ${nextItem.title}`,
            );
            setCurrentlyHandlingItem(nextItem.id);
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
            console.log(
                `[PriorityRouter] Items after removal: ${updated.length}`,
            );
            return updated;
        });

        // Only check for next item if we're currently handling this specific item
        if (currentlyHandlingItem === itemId) {
            console.log(
                `[PriorityRouter] Currently handling item was marked as handled, checking for next`,
            );
            setCurrentlyHandlingItem(null);

            // Use a brief delay to allow state to settle
            setTimeout(() => {
                const remainingItems = priorityItems.filter((item) =>
                    item.id !== itemId
                );
                if (remainingItems.length > 0) {
                    console.log(
                        `[PriorityRouter] Found ${remainingItems.length} remaining items, routing to next`,
                    );
                    routeToNextPriorityItem();
                } else {
                    console.log(`[PriorityRouter] No remaining items`);
                }
            }, 100); // Reduced timeout
        }
    }, [currentlyHandlingItem, routeToNextPriorityItem]);

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

        // Don't block if user is already on a priority route or on tabs index
        const isOnValidRoute = isOnPriorityRoute() || pathname === "/(tabs)";

        return (hasCriticalItems || hasHighPriorityItems) && !isOnValidRoute;
    }, [priorityItems, isOnPriorityRoute, pathname]);

    // Initial check when component mounts or member changes
    useEffect(() => {
        if (member && !hasCompletedInitialCheck) {
            checkForPriorityItems().then((items) => {
                if (items.length > 0) {
                    routeToNextPriorityItem();
                }
                setHasCompletedInitialCheck(true);
            });
        }
    }, [
        member,
        hasCompletedInitialCheck,
        checkForPriorityItems,
        routeToNextPriorityItem,
    ]);

    // Re-check when messages or announcements change (realtime updates)
    useEffect(() => {
        if (member && hasCompletedInitialCheck) {
            console.log(
                "[PriorityRouter] Messages or announcements changed, checking for priority items",
            );

            // Debounce the check to prevent rapid fire updates
            const timeoutId = setTimeout(() => {
                checkForPriorityItems().then((items) => {
                    // Only route if we don't currently have an item being handled
                    // and there are new items that need attention
                    if (items.length > 0 && !currentlyHandlingItem) {
                        console.log(
                            "[PriorityRouter] New priority items found, routing to first",
                        );
                        routeToNextPriorityItem();
                    } else if (items.length === 0 && currentlyHandlingItem) {
                        console.log(
                            "[PriorityRouter] No priority items found, clearing current handling",
                        );
                        setCurrentlyHandlingItem(null);
                    }
                });
            }, 300); // Debounce for 300ms

            return () => clearTimeout(timeoutId);
        }
    }, [
        messages.length, // Only watch length changes, not the full array
        Object.keys(announcements).length, // Only watch keys length, not full object
        member?.id, // Only watch member ID, not full member object
        hasCompletedInitialCheck,
    ]); // Removed checkForPriorityItems, routeToNextPriorityItem, currentlyHandlingItem from dependencies

    return {
        isCheckingPriority,
        priorityItems,
        currentlyHandlingItem,
        checkForPriorityItems,
        routeToNextPriorityItem,
        markItemAsHandled,
        shouldBlockNavigation,
        isOnPriorityRoute,
        hasCriticalItems: priorityItems.some((item) =>
            item.priority === "critical"
        ),
        hasHighPriorityItems: priorityItems.some((item) =>
            item.priority === "high"
        ),
        totalPriorityItems: priorityItems.length,
    };
}
