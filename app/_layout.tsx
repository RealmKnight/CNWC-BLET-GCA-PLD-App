import React, { useEffect, useState } from "react";
import { Slot, usePathname, useSegments, useRootNavigation } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedToast } from "@/components/ThemedToast";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import { handlePasswordResetURL } from "@/utils/authRedirects";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

// Separate loading screen component
function LoadingScreen() {
  return (
    <ThemedView style={styles.loadingContainer}>
      <ThemedText>Initializing app...</ThemedText>
    </ThemedView>
  );
}

// Auth-aware route handler component that focuses on initialization
// We'll let index.tsx handle the actual redirects
function AuthAwareRouteHandler() {
  const { authStatus } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasSeenAuthResponse, setHasSeenAuthResponse] = useState(false);

  // Add root navigation hook to check if router is ready
  const rootNavigation = useRootNavigation();

  // Handle password reset URL detection
  useEffect(() => {
    handlePasswordResetURL();
  }, []);

  // Configure basic notifications on app start
  useEffect(() => {
    configureNotifications();
    const cleanupNotifications = setupNotificationListeners();
    console.log("[Notifications] Basic notification configuration complete");
    return () => cleanupNotifications();
  }, []);

  // Mark initialization complete after a short delay
  useEffect(() => {
    const initTimer = setTimeout(() => {
      setIsInitialized(true);
      console.log("[Router] Initialization complete");
    }, 300);

    return () => {
      clearTimeout(initTimer);
    };
  }, []);

  // Track when we receive a meaningful auth response
  useEffect(() => {
    if (authStatus !== "loading" && !hasSeenAuthResponse) {
      setHasSeenAuthResponse(true);
      console.log(`[Router] First auth response received: ${authStatus}`);
    }
  }, [authStatus, hasSeenAuthResponse]);

  // Handle password reset flag cleanup
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.__passwordResetInProgress &&
      pathname === "/(auth)/change-password" &&
      Platform.OS === "web"
    ) {
      setTimeout(() => {
        delete window.__passwordResetInProgress;
      }, 500);
    }
  }, [authStatus, pathname]);

  // Show loading screen if we're not ready
  if (!isInitialized || (authStatus === "loading" && !hasSeenAuthResponse)) {
    console.log("[Router] Loading or initializing...");
    return <LoadingScreen />;
  }

  // CRITICAL: Let index.tsx and other pages handle their own redirects
  // Just render the Slot to allow the navigation system to work properly
  return <Slot />;
}

// Export a stable component tree for the root
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider>
          <AuthAwareRouteHandler />
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
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    zIndex: 9999,
  },
});
