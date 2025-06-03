import React, { useEffect, useState, Suspense } from "react";
import { Slot, usePathname, useSegments, useNavigationContainerRef } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Platform, AppState } from "react-native";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedToast } from "@/components/ThemedToast";
import {
  configureNotifications,
  setupNotificationListeners,
  getInitialNotification,
  initializeBadgeCount,
} from "@/utils/notificationConfig";
import { handlePasswordResetURL } from "@/utils/authRedirects";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ChangePasswordModal } from "@/components/ui/ChangePasswordModal";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { usePushTokenStore } from "@/store/pushTokenStore";
import { useBadgeStore } from "@/store/badgeStore";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "@/hooks/useColorScheme";
import * as SplashScreen from "expo-splash-screen";
import { createRealtimeCallback } from "@/utils/realtimeErrorHandler";
import { NavigationGuard } from "@/components/NavigationGuard";

// Prevent the splash screen from auto-hiding before App component declaration/export
SplashScreen.preventAutoHideAsync().catch((error) => {
  console.warn("[SplashScreen] Error preventing auto-hide:", error);
});

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
  const { session, authStatus, isPasswordRecoveryFlow, clearPasswordRecoveryFlag } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasSeenAuthResponse, setHasSeenAuthResponse] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Push notification state
  const { registerDevice, refreshToken, unregisterDevice, init, checkPermissionStatus } = usePushTokenStore();

  // Initialize push token store when component mounts
  useEffect(() => {
    // Initialize push token store if available
    if (init) {
      console.log("[PushNotification] Starting token store initialization");
      init()
        .then(() => {
          console.log("[PushNotification] Token store initialization successful");
        })
        .catch((error) => {
          console.error("[PushNotification] Error initializing push token store:", error);
        });
    } else {
      console.log("[PushNotification] Token store initialization function not available");
    }
  }, [init]);

  // Add navigation container ref to check if router is ready
  const navigationRef = useNavigationContainerRef();

  // Handle password reset URL detection
  useEffect(() => {
    handlePasswordResetURL();
  }, []);

  // Configure notifications and set up listeners
  useEffect(() => {
    if (Platform.OS !== "web") {
      // Configure platform-specific notification settings
      configureNotifications();

      // Setup listeners for notification interactions
      const cleanupListeners = setupNotificationListeners();

      // Check for app opened from notification
      getInitialNotification().catch((error) => {
        console.error("[PushNotification] Error checking initial notification:", error);
      });

      // Check notification permissions
      checkPermissionStatus().catch((error) => {
        console.error("[PushNotification] Error checking permission status:", error);
      });

      console.log("[Notifications] Notification configuration complete");

      return () => {
        // Clean up listeners when component unmounts
        cleanupListeners();
      };
    }
  }, [checkPermissionStatus]);

  // Handle push token registration based on auth state
  useEffect(() => {
    const isAuthenticated = authStatus === "signedInMember" || authStatus === "signedInAdmin";

    if (isAuthenticated && session?.user?.id && Platform.OS !== "web") {
      console.log("[PushNotification] Auth initialized, registering token");
      // Using the centralized token registration
      registerDevice(session.user.id).catch((error) => {
        console.error("[PushNotification] Error registering device:", error);
      });

      // Initialize badge count
      initializeBadgeCount(session.user.id);

      return () => {
        // Clean up on auth change or unmount
        if (authStatus !== "signedInMember" && authStatus !== "signedInAdmin") {
          unregisterDevice().catch((error) => {
            console.error("[PushNotification] Error unregistering device:", error);
          });
        }
      };
    }
  }, [authStatus, session?.user?.id, registerDevice, unregisterDevice]);

  // Badge syncing using the badge store
  useEffect(() => {
    const isAuthenticated = authStatus === "signedInMember" || authStatus === "signedInAdmin";
    let messageSubscription: RealtimeChannel | null = null;

    const setupBadgeSyncing = async () => {
      if (isAuthenticated && session?.user?.id) {
        console.log("[BadgeStore] Setting up badge syncing for user:", session.user.id);

        // Access badge store functions
        const { fetchUnreadCount } = useBadgeStore.getState();

        // Initial fetch of unread count
        try {
          await fetchUnreadCount(session.user.id);
          console.log("[BadgeStore] Initial badge count fetched");
        } catch (error) {
          console.error("[BadgeStore] Error fetching initial badge count:", error);
        }

        // Only set up realtime subscription on non-web platforms or if explicitly supported
        if (Platform.OS !== "web" || (Platform.OS === "web" && typeof supabase.channel === "function")) {
          try {
            // Subscribe to message changes to keep badge count updated in realtime
            messageSubscription = supabase
              .channel("badge_updates")
              .on(
                "postgres_changes",
                {
                  event: "*",
                  schema: "public",
                  table: "messages",
                  filter: `recipient_id=eq.${session.user.id}`,
                },
                async (payload) => {
                  console.log("[BadgeStore] Message change detected, updating badge count");
                  try {
                    // Update badge count when messages change
                    await fetchUnreadCount(session.user.id);
                  } catch (error) {
                    console.error("[BadgeStore] Error updating badge count after change:", error);
                  }
                }
              )
              .subscribe(
                createRealtimeCallback(
                  "BadgeStore",
                  // onError callback
                  (status) => {
                    console.error("[BadgeStore] Realtime subscription error:", status);
                  },
                  // onSuccess callback
                  (status) => {
                    console.log("[BadgeStore] Realtime subscription status:", status);
                  }
                )
              );
          } catch (error) {
            console.error("[BadgeStore] Error setting up realtime subscription:", error);
          }
        } else {
          console.log("[BadgeStore] Skipping realtime subscription on web platform");

          // For web, set up a periodic refresh instead
          const intervalId = setInterval(() => {
            fetchUnreadCount(session.user.id).catch((error) =>
              console.error("[BadgeStore] Error in periodic refresh:", error)
            );
          }, 30000); // Refresh every 30 seconds

          return () => clearInterval(intervalId);
        }
      }
    };

    setupBadgeSyncing();

    return () => {
      // Clean up subscription
      if (messageSubscription) {
        console.log("[BadgeStore] Cleaning up badge subscription");
        try {
          supabase.removeChannel(messageSubscription);
        } catch (error) {
          console.error("[BadgeStore] Error removing channel:", error);
        }
      }
    };
  }, [authStatus, session?.user?.id]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const isAuthenticated = authStatus === "signedInMember" || authStatus === "signedInAdmin";

      if (nextAppState === "active" && isAuthenticated && session?.user?.id) {
        // Refresh token when app comes to foreground using centralized store
        console.log("[PushNotification] App returned to foreground, refreshing token");
        refreshToken(session.user.id).catch((error) => {
          console.error("[PushNotification] Error refreshing token:", error);
        });

        // Update badge count using our new badge store
        try {
          const { fetchUnreadCount } = useBadgeStore.getState();
          fetchUnreadCount(session.user.id);
          console.log("[BadgeStore] Badge count refreshed on app foreground");
        } catch (error) {
          console.error("[BadgeStore] Error refreshing badge count:", error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [authStatus, session?.user?.id, refreshToken]);

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

  // Hide splash screen when app is ready
  useEffect(() => {
    const hideSplashScreen = async () => {
      if (authStatus !== "loading" && isInitialized && hasSeenAuthResponse && navigationRef.current?.isReady()) {
        try {
          console.log("[SplashScreen] App is ready, hiding splash screen");
          await SplashScreen.hideAsync();
        } catch (error) {
          console.warn("[SplashScreen] Error hiding splash screen:", error);
        }
      }
    };

    hideSplashScreen();
  }, [authStatus, isInitialized, hasSeenAuthResponse, navigationRef]);

  // Emergency splash screen hide after timeout
  useEffect(() => {
    const emergencyTimer = setTimeout(async () => {
      try {
        console.warn("[SplashScreen] Emergency timeout reached, forcing splash screen hide");
        await SplashScreen.hideAsync();
      } catch (error) {
        console.warn("[SplashScreen] Error in emergency hide:", error);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(emergencyTimer);
  }, []);

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
  // console.log(`[Router] Auth status is '${authStatus}'. Rendering Slot.`);
  return (
    <Suspense fallback={<LoadingScreen />} key="client-only-suspense">
      <NavigationGuard>
        <Slot />
      </NavigationGuard>
    </Suspense>
  );
}

// Export a stable component tree for the root
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.container}>
        <ThemeProvider>
          <AuthProvider>
            <AuthAwareRouteHandler />
            <ModalRenderer />
            <ThemedToast />
          </AuthProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
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
