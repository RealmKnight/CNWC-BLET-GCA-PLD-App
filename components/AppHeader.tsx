import { StyleSheet, TouchableOpacity } from "react-native";
import { usePathname, useRouter, useSegments } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Ionicons from "@expo/vector-icons/Ionicons";

export function AppHeader() {
  const pathname = usePathname();
  const segments = useSegments();
  const { user, userRole, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const isAdminRoute = segments[0] === "(admin)";
  const isAdmin = userRole?.includes("admin");
  const isProfileRoute = segments[0] === "(profile)";

  console.log("[AppHeader] State:", {
    pathname,
    segments,
    isAdminRoute,
    isAdmin,
    userRole,
  });

  const handleHomePress = () => {
    router.replace("/(tabs)");
  };

  const handleSettingsPress = () => {
    if (isAdminRoute) {
      // If we're in admin route, go to home
      router.replace("/(tabs)");
    } else if (isAdmin) {
      // If we're not in admin route but user is admin, go to their admin page
      router.replace(`/(admin)/${userRole}`);
    }
  };

  const handleProfilePress = () => {
    if (user?.id) {
      router.push(`/(profile)/${user.id}`);
      console.log("Profile pressed");
    }
  };

  const handleLogoutPress = () => {
    signOut();
  };

  const iconColor = Colors[colorScheme].tint;

  return (
    <ThemedView style={styles.header}>
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
  },
  rightIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
});
