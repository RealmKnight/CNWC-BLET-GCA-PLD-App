import { Stack, Slot } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image } from "react-native";
import { useRouter, useSegments } from "expo-router";
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
    if (!isLoading) {
      const inAuthGroup = segments[0] === "(auth)";
      const inAdminGroup = segments[0] === "(admin)";
      const inTabsGroup = segments[0] === "(tabs)";
      const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";
      const inMemberAssociation = segments[0] === "(auth)" && segments[1] === "member-association";

      console.log("[Router] Processing route:", {
        segments,
        inAuthGroup,
        inAdminGroup,
        inTabsGroup,
        isCompanyAdmin,
      });

      if (!session && !inAuthGroup) {
        router.replace("/(auth)/sign-in");
      } else if (session && !member && !inMemberAssociation && !isCompanyAdmin) {
        router.replace("/(auth)/member-association");
      } else if (session && isCompanyAdmin && segments[0] !== "company-admin") {
        router.replace("/company-admin");
      } else if (session && !isCompanyAdmin && segments[0] === "company-admin") {
        router.replace("/(tabs)");
      } else if (session && !isCompanyAdmin && member) {
        if (inAuthGroup && !inMemberAssociation) {
          router.replace("/(tabs)");
        } else if (!segments.length || segments[0] === undefined) {
          router.replace("/(tabs)");
        }
      }
    }
  }, [isLoading, session, segments, userRole, member, router]);

  if (isLoading) {
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
          title: "CN/WC BLET PLD/SDV App - Company Admin",
          headerBackVisible: false,
          headerTitleStyle: {
            fontFamily: "Inter",
            fontSize: 16,
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
