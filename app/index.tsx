import React, { useEffect } from "react";
import { router } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Platform } from "react-native";
import { useAuth } from "@/hooks/useAuth";

// Helper to handle direct password reset URLs
function handlePasswordResetRedirect(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return false;
  }

  // Check for the problematic URL format
  if (window.location.search.includes("code=") && window.location.hash.includes("/auth/change-password")) {
    const code = new URLSearchParams(window.location.search).get("code");
    console.log("[Index] Detected password reset URL format, redirecting to change-password");

    // Navigate to the correct route
    if (code) {
      router.replace({
        pathname: "/(auth)/change-password",
        params: { code },
      });
      return true;
    }
  }

  return false;
}

export default function IndexPage() {
  const { session } = useAuth();

  useEffect(() => {
    // Give priority to password reset handling
    const redirected = handlePasswordResetRedirect();
    if (redirected) {
      return;
    }

    // Handle normal navigation based on auth state
    if (session) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(auth)/sign-in");
    }
  }, [session]);

  return (
    <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ThemedText>Loading...</ThemedText>
    </ThemedView>
  );
}
