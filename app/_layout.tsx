import React, { useEffect, useRef, useState } from "react";
import { Redirect, Stack, usePathname, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image, Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedToast } from "@/components/ThemedToast";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import { handlePasswordResetURL } from "@/utils/authRedirects";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";

// Separate loading screen component
function LoadingScreen() {
  return (
    <ThemedView style={styles.loadingContainer}>
      <ThemedText>Initializing app...</ThemedText>
    </ThemedView>
  );
}

// Define AppNavigator BEFORE components that use it (like AppContent)
function AppNavigator() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Ensure all necessary routes are defined */}
      <Stack.Screen name="index" options={{ presentation: "transparentModal", animation: "fade" }} />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="member-association" />
      <Stack.Screen
        name="company-admin"
        options={{
          headerShown: true,
          title: "CN/WC BLET PLD/SDV App - CN Admin",
          headerBackVisible: false,
          headerTitleStyle: {
            fontFamily: "Inter",
            fontSize: 16,
            color: Colors.light.text, // Consider theme colors
          },
          headerStyle: {
            backgroundColor: Colors.light.background, // Consider theme colors
          },
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerLeft: () => (
            <Image
              source={require("../assets/images/BLETblackgold.png")}
              style={{ width: 50, height: 50, marginLeft: 16, resizeMode: "contain" }}
            />
          ),
          headerRight: undefined,
        }}
      />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(profile)" />
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
    </Stack>
  );
}

// Navigation handler as a component that uses hooks
function NavigationHandler() {
  // Get authStatus and router
  const { authStatus } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Keep track of current path
  const [isRouterReady, setIsRouterReady] = useState(false);
  const isNavigating = useRef(false); // Ref to prevent multiple navigations

  // Handle password reset URL detection first (can stay here)
  useEffect(() => {
    handlePasswordResetURL();
  }, []);

  // Mark router as ready (can stay here)
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRouterReady(true);
      console.log("[Router] Marked as ready for navigation");
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Configure basic notifications (can stay here)
  useEffect(() => {
    configureNotifications();
    const cleanupNotifications = setupNotificationListeners();
    console.log("[Notifications] Basic notification configuration complete");
    return () => cleanupNotifications();
  }, []);

  // Simplified useEffect for navigation based *only* on authStatus
  useEffect(() => {
    // Wait until router is ready and navigation isn't already in progress
    if (!isRouterReady || isNavigating.current) {
      console.log("[Router Effect] Waiting for router/navigation flag:", {
        isRouterReady,
        isNavigating: isNavigating.current,
      });
      return;
    }

    let targetPath: string | null = null;
    let navigationReason: string = "Auth Status Change";

    console.log(`[Router Effect] Evaluating authStatus: ${authStatus} on path: ${pathname}`);

    switch (authStatus) {
      case "loading":
        // Should be handled by AuthWrapper, but good to be explicit
        console.log("[Router Effect] Auth status is loading, no navigation.");
        break;
      case "signedOut":
        // Only navigate if not already on sign-in
        if (pathname !== "/sign-in" && !pathname.includes("sign-in")) {
          targetPath = "/sign-in";
          navigationReason = "Status: signedOut";
        }
        break;
      case "needsAssociation":
        // Only navigate if not already on member-association
        if (pathname !== "/member-association") {
          targetPath = "/member-association";
          navigationReason = "Status: needsAssociation";
        }
        break;
      case "signedInAdmin":
        // Only navigate if not already on company-admin
        if (pathname !== "/company-admin") {
          targetPath = "/company-admin";
          navigationReason = "Status: signedInAdmin";
        }
        break;
      case "signedInMember":
        // Navigate to tabs if currently in auth group or at root
        const inAuthGroup =
          pathname.startsWith("/(auth)") || pathname === "/sign-in" || pathname === "/member-association";
        if (inAuthGroup || pathname === "/") {
          targetPath = "/(tabs)";
          navigationReason = "Status: signedInMember, moving to app home";
        }
        break;
      case "passwordReset":
        // Ensure user is on change-password page
        if (pathname !== "/change-password") {
          targetPath = "/change-password";
          navigationReason = "Status: passwordReset, ensuring correct page";
        }
        // Clear the flag after navigating or confirming page
        if (Platform.OS === "web" && typeof window !== "undefined") {
          // Delay clearing slightly to ensure navigation completes
          setTimeout(() => {
            delete window.__passwordResetInProgress;
          }, 500);
        }
        break;
      default:
        console.log("[Router Effect] Unhandled authStatus or no navigation needed:", authStatus);
        break;
    }

    if (targetPath) {
      console.log(`[Router Effect] Navigating to ${targetPath}. Reason: ${navigationReason}`);
      isNavigating.current = true; // Set navigation flag
      router.replace(targetPath as any);
      // Reset navigation flag after a delay to allow navigation to complete
      setTimeout(() => {
        isNavigating.current = false;
        console.log("[Router Effect] Navigation flag reset.");
      }, 1500); // Adjust delay if needed
    } else {
      // If no navigation occurred, ensure flag is false
      isNavigating.current = false;
    }
  }, [authStatus, isRouterReady, router, pathname]); // Depend on authStatus, router readiness, and pathname

  // NavigationHandler still doesn't render anything itself
  return null;
}

// Main app layout - define this outside the main default export

// Export a stable component tree for the root
export default function RootLayout() {
  const stableAuthProviderKey = "stable-auth-provider";
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider key={stableAuthProviderKey}>
          <AuthWrapper />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// This component holds the main app structure, rendered only after initial auth load
function AppContent() {
  return (
    <>
      <AppNavigator />
      <NavigationHandler />
      <ThemedToast />
    </>
  );
}

// Updated AuthWrapper uses authStatus for loading state
function AuthWrapper() {
  const { authStatus } = useAuth();

  // Show loading screen only when authStatus is loading
  if (authStatus === "loading") {
    console.log("[AuthWrapper] Auth status is loading, rendering LoadingScreen.");
    return <LoadingScreen />;
  }

  // Otherwise, render the main app content
  console.log("[AuthWrapper] Auth status is not loading, rendering AppContent.");
  return <AppContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background, // Or your theme background
    zIndex: 9999, // Ensure it's on top
  },
});
