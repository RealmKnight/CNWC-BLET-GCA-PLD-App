import { Stack, Slot } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
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
  const { isLoading, session, userRole, member, signOut, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { fetchMessages, subscribeToMessages } = useNotificationStore();
  const [initialRouteHandled, setInitialRouteHandled] = useState(false);

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
    console.log("[Router Check] Start", { isLoading, initialRouteHandled, session: !!session, segments });

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

    // ---- Core Routing Logic ----
    // This block now only runs once after isLoading becomes false

    const inAuthGroup = segments[0] === "(auth)";
    const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";
    const inMemberAssociation = segments[0] === "(auth)" && segments[1] === "member-association";
    const isPasswordReset = segments[0] === "(auth)" && segments[1] === "change-password";
    const isProcessingReset = typeof window !== "undefined" && window.__passwordResetInProgress;
    const comingFromReset = isPasswordReset || isProcessingReset;

    console.log("[Router Logic] Executing", {
      segments,
      isCompanyAdmin,
      hasSession: !!session,
      hasMember: !!member,
      comingFromReset,
    });

    // 1. No Session Check (Password reset exempt)
    if (!session && !inAuthGroup && !comingFromReset) {
      console.log("[Router Logic] No session, redirecting to sign-in");
      router.replace("/(auth)/sign-in");
      setInitialRouteHandled(true); // Mark as handled
      return;
    }

    // 2. Company Admin Check
    if (session && isCompanyAdmin) {
      if (segments[0] !== "company-admin") {
        console.log("[Router Logic] Company admin not on admin page, redirecting");
        router.replace("/company-admin");
      } else {
        console.log("[Router Logic] Company admin already on correct page");
      }
      setInitialRouteHandled(true); // Mark as handled
      return;
    }

    // 3. Handle non-admin users (Password reset needs special check)
    if (session && !isCompanyAdmin) {
      // Special case: If on password reset page, allow it, unless member data exists
      if (comingFromReset && !member) {
        console.log("[Router Logic] On password reset without member data, staying");
        setInitialRouteHandled(true); // Consider handled for now
        return;
      }

      // Member Association Check
      if (!member && !inMemberAssociation && !comingFromReset) {
        console.log("[Router Logic] Non-admin, no member data, redirecting to association");
        router.replace("/(auth)/member-association");
        setInitialRouteHandled(true); // Mark as handled
        return;
      }

      // Normal Logged-in Member
      if (member) {
        if (inAuthGroup && !inMemberAssociation && !comingFromReset) {
          console.log("[Router Logic] Member in auth group (not assoc/reset), redirecting to tabs");
          router.replace("/(tabs)");
        } else if (segments[0] !== "(tabs)" && !inAuthGroup) {
          // Redirect to tabs if not already there and not in auth
          console.log("[Router Logic] Member not in tabs or auth, redirecting to tabs");
          router.replace("/(tabs)");
        } else {
          console.log("[Router Logic] Member already in tabs or auth group (assoc/reset)");
        }
        setInitialRouteHandled(true); // Mark as handled
        return;
      }
    }

    // If none of the above conditions met (should be rare), mark as handled anyway
    console.log("[Router Logic] No specific route action taken, marking handled");
    setInitialRouteHandled(true);

    // Ensure 'user' is included in the dependencies for role check
  }, [isLoading, session, user, segments, member, router, initialRouteHandled]);

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
