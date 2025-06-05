import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useBadgeStore } from "@/store/badgeStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface AnnouncementBadgeProps {
  style?: ViewStyle;
  targetType?: "division" | "gca" | "total";
  divisionId?: number; // Change to use division_id instead of division name for now
  color?: string; // Allow custom badge colors
}

export function AnnouncementBadge({
  style,
  targetType = "total",
  divisionId, // Use division_id for context filtering
  color, // Will use default from Colors if not provided
}: AnnouncementBadgeProps) {
  const { member } = useAuth();
  const colorScheme = useColorScheme() ?? "light";
  const announcementUnreadCount = useBadgeStore((state) => state.announcementUnreadCount);

  // Get unread count based on target type and division context
  const getUnreadCount = () => {
    if (!member) return 0;

    switch (targetType) {
      case "division":
        // Only show division count if user's division_id matches context or no context specified
        if (divisionId && member.division_id !== divisionId) {
          return 0;
        }
        return announcementUnreadCount.division;
      case "gca":
        return announcementUnreadCount.gca;
      case "total":
        return announcementUnreadCount.total;
      default:
        return 0;
    }
  };

  const unreadCount = getUnreadCount();

  // Don't render anything if there are no unread announcements
  if (unreadCount <= 0) {
    return null;
  }

  // Determine badge color based on target type if not specified
  const getBadgeColor = () => {
    if (color) return color;

    const colors = Colors[colorScheme as keyof typeof Colors];

    switch (targetType) {
      case "division":
        return colors.announcementBadgeDivision; // Blue
      case "gca":
        return colors.announcementBadgeGCA; // Green
      case "total":
        return colors.error; // Default error color for total
      default:
        return colors.error;
    }
  };

  // Limit displayed count for visual neatness (e.g., 99+)
  const displayCount = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <ThemedView style={[styles.badgeContainer, { backgroundColor: getBadgeColor() }, style]}>
      <ThemedText style={styles.badgeText}>{displayCount}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    zIndex: 1,
  },
  badgeText: {
    color: Colors.dark.buttonText,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
