import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface DivisionLoadingIndicatorProps {
  divisionName?: string;
  operation?: string;
  isVisible?: boolean;
}

export function DivisionLoadingIndicator({
  divisionName,
  operation = "Loading",
  isVisible = true,
}: DivisionLoadingIndicatorProps) {
  const colorScheme = useColorScheme() ?? "light";

  if (!isVisible) return null;

  const loadingMessage = divisionName ? `${operation} for Division ${divisionName}...` : `${operation}...`;
  const colors = Colors[colorScheme as keyof typeof Colors];

  return (
    <ThemedView style={styles.loadingContainer}>
      <View style={[styles.loadingContent, { borderColor: colors.border }]}>
        <ThemedText style={styles.loadingText}>{loadingMessage}</ThemedText>
        {divisionName && (
          <ThemedText style={[styles.divisionText, { color: colors.tabIconDefault }]}>
            All data shown is specific to this division
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingContent: {
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    minWidth: 200,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 8,
  },
  divisionText: {
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
