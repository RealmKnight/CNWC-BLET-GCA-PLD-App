import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { useThemeColor } from "@/hooks/useThemeColor";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useUserStore } from "@/store/userStore";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { AdminMessage } from "@/types/adminMessages";

interface AdminMessageBadgeProps {
  // Add any style overrides or positioning props if needed
  style?: object;
}

export function AdminMessageBadge({ style }: AdminMessageBadgeProps) {
  const { unreadCount, messages, readStatusMap } = useAdminNotificationStore();
  const currentUser = useUserStore((state) => state.member);
  const effectiveRoles = useEffectiveRoles() ?? [];
  const isCompanyAdmin = effectiveRoles.includes("company_admin");

  const colorScheme = useColorScheme() ?? "light";
  // Use error or primary color for the badge background for attention
  const badgeBackgroundColor = useThemeColor({}, "error");
  // Fix: Add type assertion for color scheme
  const colors = Colors[colorScheme as keyof typeof Colors];
  // Use a contrasting text color
  const badgeTextColor = colors.background;

  // Calculate filtered unread count for company admin
  const filteredUnreadCount = useMemo(() => {
    // If not a company admin, use the regular unread count
    if (!isCompanyAdmin) {
      return unreadCount;
    }

    // Helper to get root message ID
    const getRootMessageId = (msg: AdminMessage): string => msg.parent_message_id || msg.id;

    // Group messages into threads, just like in AdminMessageSection
    const grouped = messages.reduce((acc, msg) => {
      const rootId = getRootMessageId(msg);
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(msg);
      return acc;
    }, {} as Record<string, AdminMessage[]>);

    // Filter threads for company admin
    const filteredThreads = Object.values(grouped).filter((thread) => {
      if (!thread || thread.length === 0) return false;

      // If thread is archived, don't count it
      const isArchived = thread.some((msg) => msg.is_archived);
      if (isArchived) return false;

      // Check if any message in the thread involves company_admin directly
      const hasCompanyAdminInvolved = thread.some(
        (msg) =>
          msg.sender_role === "company_admin" || (msg.recipient_roles && msg.recipient_roles.includes("company_admin"))
      );

      if (hasCompanyAdminInvolved) {
        return true; // Keep threads where company_admin is directly involved
      }

      // Check for admin-to-admin communications (keep these)
      const isAdminToAdminCommunication = thread.some((msg) => {
        // Check if sender is an admin (not member)
        const isSenderAdmin = msg.sender_role && msg.sender_role !== "member";

        // Check if recipients are only admins (excluding member-to-division_admin only communications)
        const hasAdminRecipients =
          msg.recipient_roles &&
          msg.recipient_roles.some((role) => role !== "division_admin" || msg.recipient_roles.length > 1);

        return isSenderAdmin && hasAdminRecipients;
      });

      if (isAdminToAdminCommunication) {
        return true; // Keep admin-to-admin communications
      }

      // Filter out member-to-division_admin only communications
      return false;
    });

    // Count unread threads based on filtered threads
    let calculatedUnreadCount = 0;
    for (const thread of filteredThreads) {
      if (thread.length === 0) continue;
      thread.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      const latestMessage = thread[0];
      if (!readStatusMap[latestMessage.id]) {
        calculatedUnreadCount++;
      }
    }

    return calculatedUnreadCount;
  }, [isCompanyAdmin, unreadCount, messages, readStatusMap, currentUser?.id]);

  // Use filteredUnreadCount for the badge
  const displayUnreadCount = isCompanyAdmin ? filteredUnreadCount : unreadCount;

  // Don't render anything if there are no unread messages
  if (displayUnreadCount <= 0) {
    return null;
  }

  // Limit displayed count for visual neatness (e.g., 9+)
  const displayCount = displayUnreadCount > 9 ? "9+" : displayUnreadCount.toString();

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
