import React, { useEffect, useState } from "react";
import { usePriorityRouter } from "@/hooks/usePriorityRouter";
import { useAuth } from "@/hooks/useAuth";
import { usePathname } from "expo-router";
import { PriorityBlockingModal } from "@/components/modals/PriorityBlockingModal";

interface NavigationGuardProps {
  children: React.ReactNode;
}

export function NavigationGuard({ children }: NavigationGuardProps) {
  const { member } = useAuth();
  const pathname = usePathname();
  const [showBlockingModal, setShowBlockingModal] = useState(false);

  const {
    priorityItems,
    currentlyHandlingItem,
    shouldBlockNavigation,
    routeToNextPriorityItem,
    markItemAsHandled,
    isOnPriorityRoute,
    totalPriorityItems,
  } = usePriorityRouter();

  // Show blocking modal when navigation should be blocked
  useEffect(() => {
    if (member && shouldBlockNavigation()) {
      console.log("[NavigationGuard] Navigation blocked - showing modal");
      setShowBlockingModal(true);
    } else {
      setShowBlockingModal(false);
    }
  }, [member, shouldBlockNavigation]);

  // Hide modal when user navigates to a priority route
  useEffect(() => {
    if (isOnPriorityRoute()) {
      console.log("[NavigationGuard] User navigated to priority route - hiding modal");
      setShowBlockingModal(false);
    }
  }, [pathname, isOnPriorityRoute]);

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

  const handleNavigateToItem = () => {
    console.log("[NavigationGuard] User clicked to navigate to priority item");
    setShowBlockingModal(false);

    // Route to the next priority item
    const success = routeToNextPriorityItem();

    if (!success) {
      console.log("[NavigationGuard] No priority item to route to");
      // If no item to route to, keep modal hidden
    }
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
