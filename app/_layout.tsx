import { Stack, Slot } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import Toast, { BaseToast, ErrorToast, BaseToastProps } from "react-native-toast-message";
import { Colors } from "@/constants/Colors";
import { ThemedToast } from "@/components/ThemedToast";
import { useNotificationStore } from "@/store/notificationStore";
import { useUserStore } from "@/store/userStore";
import { handlePasswordResetURL } from "@/utils/authRedirects";

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
  const { isLoading, session, userRole, member, signOut, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const { fetchMessages, subscribeToMessages } = useNotificationStore();
  const [initialRouteHandled, setInitialRouteHandled] = useState(false);

  // Configure basic notifications at app startup (independent of auth)
  useEffect(() => {
    // Configure notifications when the app starts
    configureNotifications();

    // Set up notification listeners (NOT subscriptions yet)
    const cleanupNotifications = setupNotificationListeners();

    console.log("[Notifications] Basic notification configuration complete");

    return () => {
      // Clean up notification listeners when component unmounts
      cleanupNotifications();
    };
  }, []);

  // Initialize user-specific notifications only after auth is complete and member data is available
  useEffect(() => {
    // Only proceed if we have a complete member object with all required fields
    if (!session || !member?.pin_number || !member?.id) {
      console.log("[Notifications] Skipping initialization, incomplete member data:", {
        hasSession: !!session,
        pinNumber: member?.pin_number,
        memberId: member?.id,
      });
      return;
    }

    // Check if notifications are already initialized to avoid duplicate subscriptions
    if (useNotificationStore.getState().isInitialized) {
      console.log("[Notifications] Notifications already initialized, skipping");
      return;
    }

    console.log("[Notifications] Initializing notifications for user:", {
      pinNumber: member.pin_number,
      memberId: member.id,
    });

    try {
      // Fetch initial messages with both required parameters
      useNotificationStore.getState().fetchMessages(member.pin_number, member.id);

      // Subscribe to real-time updates
      const unsubscribe = useNotificationStore.getState().subscribeToMessages(member.pin_number);

      return () => {
        console.log("[Notifications] Cleaning up notifications subscription");
        unsubscribe();
      };
    } catch (error) {
      console.error("[Notifications] Error initializing notifications:", error);
    }
  }, [session, member]); // Depend on the entire member object to ensure we have complete data

  useEffect(() => {
    // Early password reset detection for incoming links (especially important for web)
    handlePasswordResetURL();

    const shouldBeRedirected = session?.toString() !== "true";
    const isAuthGroup = segments[0] === "(auth)";
    const isRootPath = pathname === "/";

    // Check for password reset flow
    const isPasswordReset =
      // Special global flag for password reset
      (typeof window !== "undefined" && window.__passwordResetInProgress) ||
      // Special flag in session state for reset flow
      session === null;

    // Don't redirect if user is in a password reset flow
    if (isPasswordReset) {
      console.log("Password reset in progress - skipping navigation guards");
      return;
    }

    // Allow access to onboarding when not signed in
    if (pathname.includes("onboarding")) return;

    // Redirect to sign in if not authenticated
    if (shouldBeRedirected && !isAuthGroup) {
      router.replace("/sign-in");
      return;
    }

    // Redirect to home if authenticated and on auth pages
    if (!shouldBeRedirected && (isAuthGroup || isRootPath)) {
      router.replace("/(tabs)");
    }
  }, [session, segments, pathname]);

  if (isLoading && !initialRouteHandled) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Initializing app...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(division)" />
      <Stack.Screen name="(rosters)" />
      <Stack.Screen name="(agreements)" />
      <Stack.Screen name="(claims)" />
      <Stack.Screen name="(gca)" />
      <Stack.Screen name="(tools)" />
      <Stack.Screen name="(safety)" />
      <Stack.Screen name="(training)" />
      <Stack.Screen
        name="assign-officer"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="company-admin"
        options={{
          headerShown: true,
          title: "CN/WC BLET PLD/SDV App - CN Admin",
          headerBackVisible: false,
          headerTitleStyle: {
            fontFamily: "Inter",
            fontSize: 16,
            color: Colors.light.text,
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
                width: 50,
                height: 50,
                marginLeft: 16,
                resizeMode: "contain",
              }}
            />
          ),
          headerRight: undefined,
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
          <RootLayoutContent key="stableRootLayoutContent" />
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
