import React from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AdvertisementStatusToggleProps {
  status: "draft" | "active" | "inactive";
  onStatusChange: (newStatus: "draft" | "active" | "inactive") => void;
  disabled?: boolean;
}

export function AdvertisementStatusToggle({
  status,
  onStatusChange,
  disabled = false,
}: AdvertisementStatusToggleProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const getStatusColor = () => {
    switch (status) {
      case "active":
        return Colors[colorScheme].success;
      case "inactive":
        return Colors[colorScheme].warning;
      case "draft":
      default:
        return Colors[colorScheme].disabled;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "active":
        return "checkmark-circle";
      case "inactive":
        return "pause-circle";
      case "draft":
      default:
        return "document-outline";
    }
  };

  const cycleStatus = () => {
    if (disabled) return;

    switch (status) {
      case "draft":
        onStatusChange("active");
        break;
      case "active":
        onStatusChange("inactive");
        break;
      case "inactive":
        onStatusChange("active");
        break;
    }
  };

  return (
    <ThemedTouchableOpacity
      style={[styles.container, { borderColor: getStatusColor() }, disabled && styles.disabled]}
      onPress={cycleStatus}
      disabled={disabled}
    >
      <Ionicons name={getStatusIcon()} size={18} color={getStatusColor()} />
      <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </ThemedText>
    </ThemedTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
    textTransform: "capitalize",
  },
  disabled: {
    opacity: 0.5,
  },
});
