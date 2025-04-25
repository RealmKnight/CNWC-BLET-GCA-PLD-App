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
    // Only run navigation logic after initial loading is complete
    if (isLoading) {
      console.log("[Layout] Waiting for auth loading to complete before checking navigation...");
      return;
    }

    console.log("[Layout] Auth loading complete, checking navigation...");

    // Early password reset detection for incoming links (especially important for web)
    // This sets the window flag if needed
    handlePasswordResetURL();

    // Check for password reset flow *after* handling the URL
    const isPasswordReset =
      // Special global flag for password reset, set by handlePasswordResetURL or change-password component
      typeof window !== "undefined" && !!window.__passwordResetInProgress;

    // Don't redirect if user is in a password reset flow
    if (isPasswordReset) {
      console.log("[Layout] Password reset flag detected - skipping navigation guards");
      setInitialRouteHandled(true); // Mark as handled even if skipping redirect
      return;
    }

    // Now perform navigation checks
    const shouldBeRedirected = !session; // Simplified: redirect if no session
    const isAuthGroup = segments[0] === "(auth)";
    const isRootPath = pathname === "/";
    const isChangePasswordPath = pathname === "/change-password"; // Check for the specific target path

    console.log("[Layout] Navigation check state:", {
      shouldBeRedirected,
      isAuthGroup,
      isRootPath,
      isChangePasswordPath,
      session: !!session,
    });

    // Redirect to sign in if not authenticated AND not already on an auth page or change-password page
    if (shouldBeRedirected && !isAuthGroup && !isChangePasswordPath) {
      console.log("[Layout] Redirecting unauthenticated user to sign-in...");
      // Use the group syntax for redirection to auth routes
      router.replace("/(auth)/sign-in");
      setInitialRouteHandled(true);
      return;
    }

    // Redirect to home if authenticated and on auth pages or root path
    if (!shouldBeRedirected && (isAuthGroup || isRootPath)) {
      // Exception: If they are on the change-password page *after* authentication (e.g., via link), don't redirect yet.
      if (isChangePasswordPath) {
        console.log("[Layout] Authenticated user on change-password page, allowing stay.");
      } else {
        console.log("[Layout] Redirecting authenticated user to tabs...");
        router.replace("/(tabs)");
        setInitialRouteHandled(true);
        return;
      }
    }

    // If no redirect happened, mark as handled
    console.log("[Layout] No redirect necessary for current state.");
    setInitialRouteHandled(true);
  }, [session, isLoading, segments, pathname]); // Add isLoading to dependencies

  // Show loading indicator until the initial route is handled
  if (isLoading || !initialRouteHandled) {
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
