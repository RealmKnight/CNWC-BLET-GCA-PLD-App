import { Slot } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function AdminLayout() {
  const { userRole, isLoading } = useAuth();

  // Show loading state while checking auth or waiting for role
  if (isLoading || !userRole) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Loading admin dashboard...</ThemedText>
      </ThemedView>
    );
  }

  // If we have an admin role, show the admin interface
  if (userRole.endsWith("_admin")) {
    return <Slot />;
  }

  // Otherwise show nothing (root layout will handle routing)
  return null;
}
