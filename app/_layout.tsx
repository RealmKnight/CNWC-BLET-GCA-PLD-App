import { Stack } from "expo-router";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, Image } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { configureNotifications, setupNotificationListeners } from "@/utils/notificationConfig";
import Toast, { BaseToast, ErrorToast, BaseToastProps } from "react-native-toast-message";
import { Colors } from "@/constants/Colors";

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
  const { isLoading, session, userRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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

  useEffect(() => {
    console.log("[Router] State:", { isLoading, hasSession: !!session, userRole, currentSegment: segments[0] });

    if (!isLoading) {
      const inAuthGroup = segments[0] === "(auth)";
      const inAdminGroup = segments[0] === "(admin)";
      const inTabsGroup = segments[0] === "(tabs)";
      const isCompanyAdmin = session?.user?.user_metadata?.role === "company_admin";

      if (!session && !inAuthGroup) {
        // Redirect to sign-in if not authenticated
        console.log("[Router] Redirecting to sign-in");
        router.replace("/(auth)/sign-in");
      } else if (session && isCompanyAdmin && segments[0] !== "company-admin") {
        // Redirect company admin to their page
        console.log("[Router] Redirecting company admin to their page");
        router.replace("/company-admin");
      } else if (session && !isCompanyAdmin && segments[0] === "company-admin") {
        // Redirect non-company admin away from company admin page
        console.log("[Router] Redirecting non-company admin away from company admin page");
        router.replace("/");
      } else if (session && !isCompanyAdmin) {
        // Handle regular user routing
        if (userRole && inAuthGroup) {
          // Redirect from auth group if authenticated
          console.log("[Router] Redirecting from auth group");
          if (userRole.includes("admin")) {
            router.replace(`/(admin)/${userRole}`);
          } else {
            router.replace("/(tabs)");
          }
        } else if (userRole?.includes("admin") && !inAdminGroup && !inTabsGroup && segments[0] !== "(profile)") {
          // Redirect admin to admin area if not in admin, tabs, or profile group
          console.log("[Router] Redirecting admin to admin area");
          router.replace(`/(admin)/${userRole}`);
        } else if (!userRole?.includes("admin") && !inTabsGroup && !inAuthGroup) {
          // Redirect non-admin to tabs if not in tabs or auth group
          console.log("[Router] Redirecting to tabs");
          router.replace("/(tabs)");
        }
      }
    }
  }, [isLoading, session, segments, userRole]);

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Initializing app...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen name="(profile)" options={{ headerShown: false }} />
      <Stack.Screen
        name="assign-officer"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
          headerShown: false,
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
            fontSize: 16, // Reduced font size to accommodate longer title
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
          <Toast config={toastConfig} />
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
