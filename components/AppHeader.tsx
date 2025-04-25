import React from "react";
import { StyleSheet, TouchableOpacity, Image } from "react-native";
import { usePathname, useRouter, useSegments } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Ionicons from "@expo/vector-icons/Ionicons";

export function AppHeader() {
  const pathname = usePathname();
  const segments = useSegments();
  const { user, userRole, member, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const isAdminRoute = segments[0] === "(admin)";
  const isAdmin = userRole?.includes("admin");
  const isProfileRoute = segments[0] === "(profile)";
  const isTabsRoute = segments[0] === "(tabs)";

  console.log("[AppHeader] State:", {
    pathname,
    segments,
    isAdminRoute,
    isAdmin,
    userRole,
    userId: user?.id,
    memberPinNumber: member?.pin_number,
  });

  const handleHomePress = () => {
    console.log("[AppHeader] Going to home tab");
    router.push("/(tabs)");
  };

  const handleSettingsPress = () => {
    if (isAdminRoute) {
      // If we're in admin route, go to home
      console.log("[AppHeader] Admin in admin route, going home");
      router.push("/(tabs)");
    } else if (isAdmin && typeof userRole === "string") {
      // If we're not in admin route but user is admin, go to their admin page
      console.log("[AppHeader] Going to admin page with role:", userRole);

      // Navigate based on role
      if (userRole === "division_admin") {
        router.push("/(admin)/division_admin");
      } else if (userRole === "union_admin") {
        router.push("/(admin)/union_admin");
      } else if (userRole === "application_admin") {
        router.push("/(admin)/application_admin");
      } else {
        // Default admin page
        router.push("/(admin)");
      }
    } else {
      console.log("[AppHeader] Settings pressed but user is not admin");
    }
  };

  const handleProfilePress = () => {
    // Use the member ID for profile navigation - should be the UUID, not the pin number
    if (member?.id) {
      console.log("[AppHeader] Navigating to profile with member ID:", member.id);

      // Use a simple string path with the member ID (not pin number)
      router.push(`/(profile)/${member.id}`);
    } else if (user?.id) {
      console.log("[AppHeader] Navigating to profile with user ID:", user.id);
      router.push(`/(profile)/${user.id}`);
    } else {
      console.log("[AppHeader] Profile pressed but no user ID or member ID available");
    }
  };

  const handleLogoutPress = () => {
    console.log("[AppHeader] Logging out");
    signOut();
  };

  const iconColor = Colors[colorScheme].tint;

  // Get the current tab title
  const getTabTitle = () => {
    if (!isTabsRoute) return "";
    // On the home page, segments[1] is undefined
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
                <Ionicons name="settings-outline" size={28} color={iconColor} />
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
                <Ionicons name={isAdminRoute ? "home-outline" : "settings-outline"} size={28} color={iconColor} />
              </TouchableOpacity>
            )}
            {isProfileRoute && (
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
    minWidth: 44, // Ensure consistent width whether there's an icon or not
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    padding: 8,
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
