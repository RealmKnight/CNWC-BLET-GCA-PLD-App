import { Stack } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import Toast, { BaseToast, ErrorToast, BaseToastProps } from "react-native-toast-message";
import { Colors } from "@/constants/Colors";
import { ThemedToast } from "@/components/ThemedToast";
import { useNotificationStore } from "@/store/notificationStore";

// Define toast config
const toastConfig = {
  info: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: Colors.light.tint,
        backgroundColor: Colors.light.background,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: "600",
        color: Colors.light.text,
      }}
      text2Style={{
        fontSize: 14,
        color: Colors.light.text,
      }}
    />
  ),
};

function RootLayoutContent() {
  const { isLoading, session, userRole, member } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { fetchMessages, subscribeToMessages } = useNotificationStore();

  useEffect(() => {
    // Configure notifications when the app starts
    configureNotifications();

    // Set up notification listeners and store cleanup function
    const cleanupNotifications = setupNotificationListeners();

    return () => {
      // Clean up notification listeners when component unmounts
      cleanupNotifications();
    };
  }, []);

  // Initialize notifications when user is authenticated
  useEffect(() => {
    if (session && member?.pin_number) {
      console.log("[Notifications] Initializing notifications for user:", member.pin_number);
      // Fetch initial messages
      fetchMessages(member.pin_number);
      // Subscribe to real-time updates
      const unsubscribe = subscribeToMessages(member.pin_number);

      return () => {
        console.log("[Notifications] Cleaning up notifications subscription");
        unsubscribe();
      };
    }
  }, [session, member?.pin_number, fetchMessages, subscribeToMessages]);

  useEffect(() => {
    console.log("[Router] State:", { isLoading, hasSession: !!session, userRole, currentSegment: segments[0] });

    if (!isLoading) {
      const inAuthGroup = segments[0] === "(auth)";
      const inAdminGroup = segments[0] === "(admin)";
      const inTabsGroup = segments[0] === "(tabs)";
      const inProfileGroup = segments[0] === "(profile)";
      const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";
      const isModalRoute = segments[0] === "assign-officer";
      const inMemberAssociation = segments[0] === "(auth)" && segments[1] === "member-association";

      if (!session && !inAuthGroup) {
        // Redirect to sign-in if not authenticated
        console.log("[Router] Redirecting to sign-in");
        router.replace("/(auth)/sign-in");
      } else if (session && !member && !inMemberAssociation && !isCompanyAdmin) {
        // Redirect to member association if authenticated but not associated
        console.log("[Router] Redirecting to member association - no member record found");
        router.replace("/(auth)/member-association");
      } else if (session && isCompanyAdmin && segments[0] !== "company-admin") {
        // Redirect company admin to their page
        console.log("[Router] Redirecting company admin to their page");
        router.replace("/company-admin");
      } else if (session && !isCompanyAdmin && segments[0] === "company-admin") {
        // Redirect non-company admin away from company admin page
        console.log("[Router] Redirecting non-company admin away from company admin page");
        router.replace("/");
      } else if (session && !isCompanyAdmin && member) {
        // Handle regular user routing
        if (userRole && inAuthGroup && !inMemberAssociation) {
          // Redirect from auth group if authenticated
          console.log("[Router] Redirecting from auth group");
          if (userRole.includes("admin")) {
            router.replace(`/(admin)/${userRole}`);
          } else {
            router.replace("/(tabs)");
          }
        } else if (userRole?.includes("admin") && !inAdminGroup && !inTabsGroup && !inProfileGroup && !isModalRoute) {
          // Redirect admin to admin area if not in admin, tabs, profile, or modal route
          console.log("[Router] Redirecting admin to admin area");
          router.replace(`/(admin)/${userRole}`);
        } else if (!userRole?.includes("admin") && !inTabsGroup && !inAuthGroup) {
          // Redirect non-admin to tabs if not in tabs or auth group
          console.log("[Router] Redirecting to tabs");
          router.replace("/(tabs)");
        }
      }
    }
  }, [isLoading, session, segments, userRole, member]);

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Initializing app...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(profile)" options={{ headerShown: false }} />
      <Stack.Screen
        name="assign-officer"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="company-admin"
        options={{
          headerShown: true,
          title: "CN/WC BLET PLD/SDV App - Company Admin",
          headerBackVisible: false,
          headerTitleStyle: {
            fontFamily: "Inter",
            fontSize: 16, // Reduced font size to accommodate longer title
          },
          headerStyle: {
            backgroundColor: Colors.light.background,
          },
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerLeft: () => (
            <Image
              source={require("../assets/images/BLETblackgold.png")}
              style={{
                width: 40,
                height: 40,
                marginLeft: 16,
                resizeMode: "contain",
              }}
            />
          ),
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider>
          <RootLayoutContent />
          <ThemedToast />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
