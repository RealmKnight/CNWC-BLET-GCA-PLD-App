import React, { useEffect, useState, Suspense } from "react";
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
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";

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
  const { authStatus, isPasswordRecoveryFlow, clearPasswordRecoveryFlag } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasSeenAuthResponse, setHasSeenAuthResponse] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

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

  // Effect to show modal when recovery flag is set
  useEffect(() => {
    if (isPasswordRecoveryFlow) {
      console.log("[RootLayout] Password recovery flag detected, showing modal.");
      setShowRecoveryModal(true);
      clearPasswordRecoveryFlag();
    }
  }, [isPasswordRecoveryFlow, clearPasswordRecoveryFlag]);

  // Show loading screen if we're not ready
  if (authStatus === "loading") {
    console.log("[Router] Auth status is loading...");
    return <LoadingScreen />;
  }

  // If authStatus is not loading, assume we are ready to render the rest of the app
  // Let specific pages handle redirects based on the actual authStatus ('signedOut', 'needsAssociation', etc.)
  console.log(`[Router] Auth status is '${authStatus}'. Rendering Slot.`);
  return (
    <Suspense fallback={<LoadingScreen />} key="client-only-suspense">
      <Slot />
    </Suspense>
  );
}

// Export a stable component tree for the root
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider>
          <AuthAwareRouteHandler />
          <ModalRenderer />
          <ThemedToast />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// New component to access auth context and render modal
function ModalRenderer() {
  const { isPasswordRecoveryFlow, clearPasswordRecoveryFlag } = useAuth();
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  useEffect(() => {
    if (isPasswordRecoveryFlow) {
      console.log("[ModalRenderer] Password recovery flag detected, showing modal.");
      setShowRecoveryModal(true);
      clearPasswordRecoveryFlag();
    }
  }, [isPasswordRecoveryFlow, clearPasswordRecoveryFlag]);

  return (
    <ChangePasswordModal
      visible={showRecoveryModal}
      onClose={() => setShowRecoveryModal(false)}
      signOutOnSuccess={true}
      showBackButton={false}
    />
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
