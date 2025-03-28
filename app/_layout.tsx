import { Slot, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect } from "react";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

function RootLayoutContent() {
  const { isLoading, session, userRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    console.log("[Router] State:", { isLoading, hasSession: !!session, userRole, currentSegment: segments[0] });

    if (!isLoading) {
      const inAuthGroup = segments[0] === "(auth)";
      const inAdminGroup = segments[0] === "(admin)";
      const inTabsGroup = segments[0] === "(tabs)";

      if (!session && !inAuthGroup) {
        // Redirect to sign-in if not authenticated
        console.log("[Router] Redirecting to sign-in");
        router.replace("/(auth)/sign-in");
      } else if (session && userRole && inAuthGroup) {
        // Redirect from auth group if authenticated
        console.log("[Router] Redirecting from auth group");
        if (userRole.includes("admin")) {
          router.replace(`/(admin)/${userRole}`);
        } else {
          router.replace("/(tabs)");
        }
      } else if (
        session &&
        userRole?.includes("admin") &&
        !inAdminGroup &&
        !inTabsGroup &&
        segments[0] !== "(profile)"
      ) {
        // Redirect admin to admin area if not in admin, tabs, or profile group
        console.log("[Router] Redirecting admin to admin area");
        router.replace(`/(admin)/${userRole}`);
      } else if (session && !userRole?.includes("admin") && !inTabsGroup && !inAuthGroup) {
        // Redirect non-admin to tabs if not in tabs or auth group
        console.log("[Router] Redirecting to tabs");
        router.replace("/(tabs)");
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

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
