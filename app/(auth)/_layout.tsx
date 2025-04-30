import { Stack, Redirect, usePathname } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function AuthLayout() {
  const { authStatus } = useAuth();
  const pathname = usePathname();

  // Show loading state while checking auth
  if (authStatus === "loading") {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  // Redirect authenticated members to the main app
  if (authStatus === "signedInMember") {
    return <Redirect href="/(tabs)" />;
  }

  // Redirect authenticated admins to the admin page
  if (authStatus === "signedInAdmin") {
    return <Redirect href="/company-admin" />;
  }

  // Allow member-association page to show when member needs association
  // but prevent access to other auth routes
  if (authStatus === "needsAssociation") {
    console.log("[AuthLayout] User needs member association, current path:", pathname);

    // When visiting a route other than member-association, redirect
    if (!pathname.includes("member-association")) {
      console.log("[AuthLayout] Redirecting to member association");
      return <Redirect href="/(auth)/member-association" />;
    }
  }

  // Show auth screens with proper stack configuration
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
