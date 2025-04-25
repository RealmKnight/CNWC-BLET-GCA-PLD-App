import React, { useEffect, useRef, useState } from "react";
import { Redirect, Stack, usePathname, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image } from "react-native";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedToast } from "@/components/ThemedToast";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import { handlePasswordResetURL } from "@/utils/authRedirects";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useNotificationStore } from "@/store/notificationStore";
import { useUserStore } from "@/store/userStore";

// Separate loading screen component
function LoadingScreen() {
  return (
    <ThemedView style={styles.loadingContainer}>
      <ThemedText>Initializing app...</ThemedText>
    </ThemedView>
  );
}

// Navigation handler as a component that uses hooks
function NavigationHandler() {
  const { isLoading, session, userRole, member } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const [isRouterReady, setIsRouterReady] = useState(false);
  const hasRedirectedRef = useRef(false);
  const isNavigating = useRef(false);
  const router = useRouter();

  // Handle password reset URL detection first
  useEffect(() => {
    handlePasswordResetURL();
  }, []);

  // Mark router as ready after a short delay to ensure all routes are registered
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRouterReady(true);
      console.log("[Router] Marked as ready for navigation");
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  // Configure basic notifications at app startup (independent of auth)
  useEffect(() => {
    configureNotifications();
    const cleanupNotifications = setupNotificationListeners();
    console.log("[Notifications] Basic notification configuration complete");

    return () => {
      cleanupNotifications();
    };
  }, []);

  // Don't render redirects until loading is complete
  if (isLoading || !isRouterReady) {
    console.log("[Router] Not ready for navigation yet, loading:", isLoading, "router ready:", isRouterReady);
    return null;
  }

  // If we're already navigating, don't trigger another navigation
  if (isNavigating.current) {
    console.log("[Router] Already navigating, skipping redirect check");
    return null;
  }

  console.log("[Router] Ready to render navigation");

  // Reset redirect tracking on each render when ready
  if (hasRedirectedRef.current) {
    hasRedirectedRef.current = false;
  }

  // Check navigation conditions
  const inAuthGroup = segments[0] === "(auth)";
  const isSignInPath = pathname === "/sign-in" || pathname.includes("sign-in");
  const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";
  const isMemberAssociationPath = pathname === "/member-association";
  const isChangePasswordPath = pathname === "/change-password";
  const isPasswordResetInProgress = typeof window !== "undefined" && !!window.__passwordResetInProgress;
  const comingFromReset = isChangePasswordPath || isPasswordResetInProgress;
  const isRootPath = pathname === "/";
  const inTabsGroup = segments[0] === "(tabs)";

  console.log("[Router] Navigation status:", {
    pathname,
    segments,
    inAuthGroup,
    isCompanyAdmin,
    hasSession: !!session,
    hasMember: !!member,
    comingFromReset,
    inTabsGroup,
  });

  const performRedirect = (path: string, reason: string) => {
    if (isNavigating.current) return null;

    console.log(`[Router] Redirecting to ${path}: ${reason}`);
    isNavigating.current = true;
    hasRedirectedRef.current = true;

    // Reset the navigation flag after a short delay
    setTimeout(() => {
      isNavigating.current = false;
    }, 1000);

    // Use TypeScript-safe path conversion
    return <Redirect href={path as any} />;
  };

  // 1. Handle password reset specially - highest priority
  if (comingFromReset) {
    console.log("[Router] In password reset flow, no redirect needed");
    return null;
  }

  // 2. No Session Check - if not logged in, redirect to sign in
  if (!session && !isSignInPath) {
    return performRedirect("/sign-in", "No session, redirecting to sign-in");
  }

  // 3. Already on sign in page with session
  if (session && isSignInPath) {
    if (isCompanyAdmin) {
      return performRedirect("/company-admin", "Admin on sign-in page, redirecting to admin page");
    }

    if (!member) {
      return performRedirect("/member-association", "Signed in but no member data, redirecting to association");
    }

    return performRedirect("/(tabs)", "Signed in regular member on sign-in page, redirecting to tabs");
  }

  // 4. Company Admin Check
  if (session && isCompanyAdmin && pathname !== "/company-admin") {
    return performRedirect("/company-admin", "Company admin, redirecting to admin page");
  }

  // 5. Member Association Check for non-admins
  if (session && !isCompanyAdmin && !member && !isMemberAssociationPath) {
    return performRedirect("/member-association", "No member data, redirecting to association");
  }

  // 6. Regular member navigation
  if (session && !isCompanyAdmin && member) {
    // If in auth group but signed in with member data
    if (inAuthGroup) {
      return performRedirect("/(tabs)", "Member in auth group, redirecting to tabs");
    }

    // If at root path, redirect to tabs
    if (isRootPath) {
      return performRedirect("/(tabs)", "Member at root path, redirecting to tabs");
    }
  }

  console.log("[Router] No redirect needed");
  return null;
}

// Main app layout - define this outside the main default export
function AppLayout() {
  const { isLoading } = useAuth();

  return (
    <>
      {/* Always render the Stack navigator unconditionally first */}
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="sign-in" />
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

      {/* Show loading screen overlay if we're loading */}
      {isLoading ? <LoadingScreen /> : <NavigationHandler />}
    </>
  );
}

// Export a stable component tree for the root
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider>
          <AppLayout />
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
