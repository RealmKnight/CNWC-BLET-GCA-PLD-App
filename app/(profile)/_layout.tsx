import React from "react";
import { Stack } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { StyleSheet } from "react-native";

export default function ProfileLayout() {
  const colorScheme = useColorScheme() ?? "light";

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
      <AppHeader />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
