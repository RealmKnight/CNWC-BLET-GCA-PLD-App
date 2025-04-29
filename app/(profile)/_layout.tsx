import React from "react";
import { Stack } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { StyleSheet } from "react-native";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type ColorScheme = "light" | "dark";

export default function ProfileLayout() {
  const colorScheme = (useColorScheme() ?? "light") as ColorScheme;

  return (
    <ProtectedRoute>
      <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
        <AppHeader />
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
      </ThemedView>
    </ProtectedRoute>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
