import { Stack, Slot, Redirect, useSegments, usePathname, useRouter } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

  // Restore original routing logic structure in useEffect
  useEffect(() => {
    console.log("[Router Check] Start", { isLoading, initialRouteHandled, session: !!session, segments });

    // Handle password reset URL detection (sets window flag) - Still needed
    // Run this check regardless of isLoading because it just sets a flag
    handlePasswordResetURL();

    // If loading, reset the handled flag and wait
    if (isLoading) {
      setInitialRouteHandled(false);
      console.log("[Router Check] Waiting: isLoading is true");
      return;
    }

    // If already handled initial route after loading, do nothing
    if (initialRouteHandled) {
      console.log("[Router Check] Skipping: initialRouteHandled is true");
      return;
    }

    // ---- Core Routing Logic (adapted from original) ----
    const inAuthGroup = segments[0] === "(auth)";
    const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";
    const isMemberAssociationPath = pathname === "/member-association";
    const isChangePasswordPath = pathname === "/change-password";
    const isPasswordResetInProgress = typeof window !== "undefined" && !!window.__passwordResetInProgress;
    const comingFromReset = isChangePasswordPath || isPasswordResetInProgress;

    console.log("[Router Logic] Executing", {
      segments,
      pathname,
      isCompanyAdmin,
      hasSession: !!session,
      hasMember: !!member,
      comingFromReset,
    });

    // 1. No Session Check (Password reset exempt)
    // Redirect to sign-in if no session, not in auth group, and not in password reset flow
    if (!session && !inAuthGroup && !comingFromReset) {
      console.log("[Router Logic] No session, redirecting to sign-in");
      router.replace("/sign-in"); // Use corrected path
      setInitialRouteHandled(true); // Mark as handled
      return;
    }

    // 2. Company Admin Check
    if (session && isCompanyAdmin) {
      // Assuming company admin page is at /company-admin (adjust if needed)
      if (pathname !== "/company-admin") {
        console.log("[Router Logic] Company admin not on admin page, redirecting");
        router.replace("/company-admin");
      } else {
        console.log("[Router Logic] Company admin already on correct page");
      }
      setInitialRouteHandled(true); // Mark as handled
      return;
    }

    // 3. Handle non-admin users
    if (session && !isCompanyAdmin) {
      // Special case: If on password reset page, allow it, unless member data exists
      if (comingFromReset && !member) {
        console.log("[Router Logic] On password reset without member data, staying");
        // Don't redirect, allow change-password screen to handle auth
        setInitialRouteHandled(true); // Mark as handled for this specific check
        return;
      }

      // Member Association Check
      // Redirect if no member, not already on association page, and not coming from reset
      if (!member && !isMemberAssociationPath && !comingFromReset) {
        console.log("[Router Logic] Non-admin, no member data, redirecting to association");
        router.replace("/member-association"); // Use corrected path
        setInitialRouteHandled(true); // Mark as handled
        return;
      }

      // Normal Logged-in Member
      if (member) {
        // If in auth group but not association/reset, redirect to tabs
        if (inAuthGroup && !isMemberAssociationPath && !comingFromReset) {
          console.log("[Router Logic] Member in auth group (not assoc/reset), redirecting to tabs");
          router.replace("/(tabs)"); // Keep group syntax for tabs if it's a layout
        } else if (pathname !== "/" && segments[0] !== "(tabs)" && !inAuthGroup) {
          // Redirect to tabs if outside tabs and auth groups (e.g., landed on / or an invalid path)
          // Avoid redirecting if already landing on root ('/') which should be handled by next check if needed
          console.log("[Router Logic] Member outside tabs/auth, redirecting to tabs");
          router.replace("/(tabs)"); // Keep group syntax for tabs if it's a layout
        } else {
          console.log("[Router Logic] Member already in tabs or allowed auth group page (assoc/reset)");
        }
        setInitialRouteHandled(true); // Mark as handled
        return;
      }
    }

    // If none of the above conditions met (e.g., logged out, on auth page), mark as handled
    console.log("[Router Logic] No specific redirect action taken, marking handled");
    setInitialRouteHandled(true);
  }, [isLoading, session, user, segments, member, router, initialRouteHandled, pathname]); // Added pathname

  // Show loading indicator overlay while loading OR before initial route handled
  if (isLoading || !initialRouteHandled) {
    return (
      <ThemedView
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          // Ensure it covers the content if needed, though Stack might not be rendered yet
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10, // Make sure it's on top
        }}
      >
        <ThemedText>Initializing app...</ThemedText>
      </ThemedView>
    );
  }

  // Render the main stack navigator unconditionally (logic above handles redirects)
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
