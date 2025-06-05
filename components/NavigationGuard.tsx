import React, { useEffect, useState } from "react";
import { usePriorityRouter } from "@/hooks/usePriorityRouter";
import { useAuth } from "@/hooks/useAuth";
import { usePathname } from "expo-router";
import { PriorityBlockingModal } from "@/components/modals/PriorityBlockingModal";
import { AppState } from "react-native";

interface NavigationGuardProps {
  children: React.ReactNode;
}

export function NavigationGuard({ children }: NavigationGuardProps) {
  const { member } = useAuth();
  const pathname = usePathname();
  const [showBlockingModal, setShowBlockingModal] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const {
    priorityItems,
    currentlyHandlingItem,
    shouldBlockNavigation,
    routeToNextPriorityItem,
    markItemAsHandled,
    isOnPriorityRoute,
    totalPriorityItems,
    checkForPriorityItems,
    manualCheckForPriorityItems,
    debugStoreState,
    debugInfo,
  } = usePriorityRouter();

  // Debug logging for subscription status
  // useEffect(() => {
  //   console.log("[NavigationGuard] Debug info:", debugInfo);
  // }, [debugInfo]);

  // Add app state change monitoring for debugging
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "active" && member) {
        console.log("[NavigationGuard] App came to foreground, running debug check");

        // Run debug after a delay to allow stores to refresh
        setTimeout(() => {
          console.log("[NavigationGuard] Running detailed store debug after foreground:");
          debugStoreState();

          // Also trigger a manual priority check
          manualCheckForPriorityItems().then((items) => {
            console.log("[NavigationGuard] Manual priority check after foreground found:", items.length, "items");
          });
        }, 2000);
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription?.remove();
  }, [member, debugStoreState, manualCheckForPriorityItems]);

  // Show blocking modal when navigation should be blocked (but not while navigating)
  useEffect(() => {
    if (member && shouldBlockNavigation() && !isNavigating) {
      console.log("[NavigationGuard] Navigation blocked - showing modal");
      console.log(
        "[NavigationGuard] Priority items causing block:",
        priorityItems.map((p) => ({ id: p.id, type: p.type, priority: p.priority, title: p.title }))
      );
      setShowBlockingModal(true);
    } else {
      console.log(
        `[NavigationGuard] Navigation not blocked - hiding modal (shouldBlock: ${shouldBlockNavigation()}, isNavigating: ${isNavigating})`
      );
      setShowBlockingModal(false);
    }
  }, [member, shouldBlockNavigation, priorityItems, isNavigating]);

  // Hide modal when user navigates to a priority route and clear navigation state
  useEffect(() => {
    if (isOnPriorityRoute()) {
      console.log("[NavigationGuard] User navigated to priority route - hiding modal and clearing navigation state");
      setShowBlockingModal(false);
      setIsNavigating(false);
    }
  }, [pathname, isOnPriorityRoute]);

  // Watch for changes in priority items and reprocess modal visibility
  useEffect(() => {
    console.log(`[NavigationGuard] Priority items changed: ${totalPriorityItems} items`);

    // If we have no priority items, definitely hide modal and clear navigation state
    if (totalPriorityItems === 0) {
      console.log("[NavigationGuard] No priority items - hiding modal and clearing navigation state");
      setShowBlockingModal(false);
      setIsNavigating(false);
    } else if (member && shouldBlockNavigation() && !isNavigating) {
      // If we have priority items and should block, show modal (only if not currently navigating)
      console.log("[NavigationGuard] Priority items found and should block - showing modal");
      setShowBlockingModal(true);
    }
  }, [totalPriorityItems, member, shouldBlockNavigation, isNavigating]);

  // Get the first unhandled priority item (not necessarily the "currently handling" one)
  const getCurrentItem = () => {
    // Find the first item that needs attention (unread or unacknowledged)
    const unhandledItem = priorityItems.find((item) => !item.isRead || !item.isAcknowledged);
    return unhandledItem || null;
  };

  const getCurrentIndex = () => {
    const currentItem = getCurrentItem();
    if (!currentItem) return 0;
    return priorityItems.findIndex((item) => item.id === currentItem.id);
  };

  const handleNavigateToItem = async () => {
    console.log("[NavigationGuard] User clicked to navigate to priority item");

    // Prevent multiple clicks during navigation
    if (isNavigating) {
      console.log("[NavigationGuard] Already navigating, ignoring click");
      return;
    }

    // Set navigation state to prevent re-opening modal
    setIsNavigating(true);

    // Hide modal immediately to provide immediate feedback
    setShowBlockingModal(false);

    // Route to the next priority item
    const success = routeToNextPriorityItem();

    if (!success) {
      console.log("[NavigationGuard] No priority item to route to, clearing navigation state");
      // If no item to route to, clear navigation state
      setIsNavigating(false);
    }
    // Note: isNavigating will be cleared when the route change is detected in the useEffect above
  };

  const currentItem = getCurrentItem();

  return (
    <>
      {children}
      <PriorityBlockingModal
        visible={showBlockingModal}
        currentItem={currentItem}
        totalItems={totalPriorityItems}
        currentIndex={getCurrentIndex()}
        onNavigateToItem={handleNavigateToItem}
      />
    </>
  );
}
