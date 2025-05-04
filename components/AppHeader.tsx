import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, TouchableOpacity, Image, View } from "react-native";
import { usePathname, useRouter, useSegments, Redirect } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { AdminMessageBadge } from "@/components/ui/AdminMessageBadge";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";

export function AppHeader() {
  const pathname = usePathname();
  const segments = useSegments();
  const { user, userRole, member, signOut, authStatus } = useAuth();
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const isAdminRoute = segments[0] === "(admin)";
  const effectiveRoles = useEffectiveRoles() ?? [];
  const isAdmin = effectiveRoles.some((role) =>
    ["division_admin", "union_admin", "application_admin", "company_admin"].includes(role)
  );
  const isProfileRoute = segments[0] === "(profile)";
  const isTabsRoute = segments[0] === "(tabs)";
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Track initialization state
  const cleanupRef = useRef<(() => void) | null>(null);
  const hasInitializedRef = useRef(false);

  // Initialize the admin notification store
  const { unreadCount, initializeAdminNotifications, cleanupAdminNotifications, isInitialized } =
    useAdminNotificationStore();

  // Check if current route is one of the navigation card routes
  const isNavigationCardRoute = [
    "(division)",
    "(rosters)",
    "(agreements)",
    "(claims)",
    "(gca)",
    "(tools)",
    "(safety)",
    "(training)",
  ].includes(segments[0]);

  const showAdminBadge = isAdmin && !isAdminRoute && unreadCount > 0;

  // Initialize admin notifications for admin users
  useEffect(() => {
    if (isAdmin && user?.id && !hasInitializedRef.current) {
      console.log("[AppHeader] Initializing admin notifications store for badging");

      const cleanup = initializeAdminNotifications(
        user.id,
        effectiveRoles,
        member?.division_id || null,
        effectiveRoles.includes("company_admin")
      );

      cleanupRef.current = cleanup;
      hasInitializedRef.current = true;

      return () => {
        // Only clean up on unmount if we're actually unmounting the entire component
        // or if the user/admin state changes
        if (cleanupRef.current) {
          console.log("[AppHeader] Cleaning up admin notifications store on unmount");
          cleanupRef.current();
          cleanupRef.current = null;
          // Don't reset hasInitializedRef here to prevent re-initialization on re-renders
        }
      };
    }
  }, [isAdmin, user?.id]);

  // Reset initialization tracking if user changes
  useEffect(() => {
    return () => {
      // This will run when the component is fully unmounted
      if (cleanupRef.current) {
        console.log("[AppHeader] Component unmounting, doing final cleanup");
        cleanupRef.current();
        cleanupAdminNotifications();
        cleanupRef.current = null;
      }
      hasInitializedRef.current = false;
    };
  }, []);

  console.log("[AppHeader] State:", {
    pathname,
    segments,
    isAdminRoute,
    isAdmin,
    userRole,
    userId: user?.id,
    memberPinNumber: member?.pin_number,
    unreadAdminMessageCount: unreadCount,
    showAdminBadge,
    authStatus,
    isLoggingOut,
    isStoreInitialized: isInitialized,
    hasInitializedLocally: hasInitializedRef.current,
  });

  // If we've signOut out, let the redirect in index.tsx handle the navigation
  if (isLoggingOut && authStatus === "signedOut") {
    console.log("[AppHeader] Auth state is now signedOut, redirecting");
    return <Redirect href="/(auth)/sign-in" />;
  }

  const handleHomePress = () => {
    console.log("[AppHeader] Going to home tab");
    router.push("/(tabs)");
  };

  const handleSettingsPress = () => {
    // Already in admin? Go home.
    if (isAdminRoute) {
      console.log("[AppHeader] Admin in admin route, going home");
      router.push("/(tabs)");
      return; // Exit early
    }

    // Not in admin route, check if user IS admin and has a role string
    if (isAdmin && typeof userRole === "string") {
      console.log("[AppHeader] Going to admin page with role:", userRole);
      switch (userRole) {
        case "division_admin":
          router.push("/(admin)/division_admin");
          break;
        case "union_admin":
          router.push("/(admin)/union_admin");
          break;
        case "application_admin":
          router.push("/(admin)/application_admin");
          break;
        default:
          console.warn("[AppHeader] Unknown member admin role, cannot navigate:", userRole);
          // Optional: Navigate to a default admin route or show error
          // router.push("/(admin)");
          break;
      }
    } else {
      // Not an admin or role is not a string
      console.log("[AppHeader] Settings pressed but user is not an admin or role unknown/invalid");
    }
  };

  const handleProfilePress = () => {
    if (member?.id) {
      console.log("[AppHeader] Navigating to profile with member ID:", member.id);
      router.push(`/(profile)/${member.id}`);
    } else if (user?.id) {
      console.log("[AppHeader] Navigating to profile with user ID:", user.id);
      router.push(`/(profile)/${user.id}`);
    } else {
      console.log("[AppHeader] Profile pressed but no user ID or member ID available");
    }
  };

  const handleLogoutPress = async () => {
    console.log("[AppHeader] Logging out");
    setIsLoggingOut(true);
    try {
      await signOut();
      // Don't navigate here - we'll let our authStatus redirect handle it
    } catch (error) {
      console.error("[AppHeader] Error during logout:", error);
      setIsLoggingOut(false); // Reset in case of error
    }
  };

  const iconColor = Colors[colorScheme].tint;

  const getTabTitle = () => {
    if (!isTabsRoute) return "";
    if (segments.length === 1 && segments[0] === "(tabs)") {
      return "CN/WC GCA BLET PLD App";
    }
    const tabSegment = segments[1] as "index" | "notifications" | "calendar" | "mytime" | undefined;
    switch (tabSegment) {
      case "index":
        return "CN/WC GCA BLET PLD App";
      case "notifications":
        return "Notifications";
      case "calendar":
        return "Calendar";
      case "mytime":
        return "My Time";
      default:
        return "";
    }
  };

  return (
    <ThemedView style={styles.header}>
      {isTabsRoute ? (
        <>
          <ThemedView style={styles.leftIcons}>
            {isAdmin && (
              <TouchableOpacity onPress={handleSettingsPress} style={styles.iconButton}>
                <View style={styles.iconWrapper}>
                  <Ionicons name="settings-outline" size={28} color={iconColor} />
                  {showAdminBadge && (
                    <View style={styles.headerBadgeContainer}>
                      <AdminMessageBadge />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          </ThemedView>
          <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} resizeMode="contain" />
          <ThemedText type="title" style={styles.headerTitle}>
            {(() => {
              const title = getTabTitle();
              console.log("[AppHeader] Rendering title:", { title, segments, isTabsRoute });
              return title;
            })()}
          </ThemedText>
          <ThemedView style={styles.rightIcons}>
            <TouchableOpacity onPress={handleProfilePress} style={styles.iconButton}>
              <Ionicons name="person-circle-outline" size={28} color={iconColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogoutPress} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={28} color={iconColor} />
            </TouchableOpacity>
          </ThemedView>
        </>
      ) : (
        <>
          <ThemedView style={styles.leftIcons}>
            {isAdmin && (
              <TouchableOpacity onPress={handleSettingsPress} style={styles.iconButton}>
                <View style={styles.iconWrapper}>
                  <Ionicons name={isAdminRoute ? "home-outline" : "settings-outline"} size={28} color={iconColor} />
                  {showAdminBadge && (
                    <View style={styles.headerBadgeContainer}>
                      <AdminMessageBadge />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
            {(isProfileRoute || isNavigationCardRoute) && (
              <TouchableOpacity onPress={handleHomePress} style={styles.iconButton}>
                <Ionicons name="home-outline" size={28} color={iconColor} />
              </TouchableOpacity>
            )}
          </ThemedView>
          <ThemedView style={styles.rightIcons}>
            <TouchableOpacity onPress={handleProfilePress} style={styles.iconButton}>
              <Ionicons name="person-circle-outline" size={28} color={iconColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogoutPress} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={28} color={iconColor} />
            </TouchableOpacity>
          </ThemedView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
  },
  leftIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 44,
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  iconWrapper: {
    position: "relative",
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBadgeContainer: {
    position: "absolute",
    top: -4,
    right: -6,
    zIndex: 1,
  },
  logo: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
});
