import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AdminMessageBadgeProps {
  // Add any style overrides or positioning props if needed
  style?: object;
}

export function AdminMessageBadge({ style }: AdminMessageBadgeProps) {
  const unreadCount = useAdminNotificationStore((state) => state.unreadCount);
  const colorScheme = useColorScheme() ?? "light";
  // Use error or primary color for the badge background for attention
  const badgeBackgroundColor = useThemeColor({}, "error");
  // Fix: Add type assertion for color scheme
  const colors = Colors[colorScheme as keyof typeof Colors];
  // Use a contrasting text color
  const badgeTextColor = colors.background;

  // Don't render anything if there are no unread messages
  if (unreadCount <= 0) {
    return null;
  }

  // Limit displayed count for visual neatness (e.g., 9+)
  const displayCount = unreadCount > 9 ? "9+" : unreadCount.toString();

  return (
    <View style={[styles.badgeContainer, { backgroundColor: badgeBackgroundColor }, style]}>
      <ThemedText style={[styles.badgeText, { color: badgeTextColor }]}>{displayCount}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    minWidth: 20,
    height: 20,
    borderRadius: 10, // Make it circular
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute", // Often positioned relative to another element
    top: -5, // Example positioning (adjust as needed)
    right: -5, // Example positioning (adjust as needed)
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
    lineHeight: 18, // Adjust line height for vertical centering
  },
});
