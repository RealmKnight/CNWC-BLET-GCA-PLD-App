import { Stack } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { router } from "expo-router";
import { Slot } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

export default function AuthLayout() {
  const { isLoading } = useAuth();

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  // Show auth screens
  return <Slot />;
}
