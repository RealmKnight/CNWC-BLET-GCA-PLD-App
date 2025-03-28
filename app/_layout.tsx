import { Slot } from "expo-router";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect } from "react";
import { router } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

function RootLayoutContent() {
  const { isLoading, session, userRole } = useAuth();

  useEffect(() => {
    console.log("[Router] Auth state:", {
      status: isLoading ? "loading" : session ? "authenticated" : "unauthenticated",
      role: userRole || "none",
    });

    if (!isLoading) {
      if (!session) {
        console.log("[Router] Redirecting to sign-in");
        router.replace("/(auth)/sign-in");
      } else if (userRole) {
        console.log(
          "[Router] Routing to:",
          userRole === "application_admin"
            ? "admin dashboard"
            : userRole === "union_admin"
            ? "union dashboard"
            : userRole === "division_admin"
            ? "division dashboard"
            : "member dashboard"
        );

        if (userRole === "application_admin") {
          router.replace("/(admin)/application_admin");
        } else if (userRole === "union_admin") {
          router.replace("/(admin)/union_admin");
        } else if (userRole === "division_admin") {
          router.replace("/(admin)/division_admin");
        } else {
          router.replace("/(tabs)");
        }
      }
    }
  }, [isLoading, session, userRole]);

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
