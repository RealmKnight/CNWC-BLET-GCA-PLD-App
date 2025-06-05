import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO } from "date-fns";
import type { Announcement } from "@/types/announcements";

type ColorScheme = keyof typeof Colors;

interface AnnouncementCardProps {
  announcement: Announcement;
  divisionContext?: string; // Division context for validation
  divisionId?: number; // Division ID for proper validation
  onPress: () => void; // Handler for card press (to open modal)
  onMarkAsRead?: () => void; // Handler to mark as read (optional)
}

export function AnnouncementCard({
  announcement,
  divisionContext,
  divisionId,
  onPress,
  onMarkAsRead,
}: AnnouncementCardProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  // Validate announcement belongs to current division context if specified
  const isValidForContext =
    !divisionId || announcement.target_type === "GCA" || announcement.target_division_ids?.includes(divisionId);

  // Don't render if announcement doesn't belong to current context
  if (!isValidForContext) {
    return null;
  }

  const handlePress = () => {
    onPress();
    // Mark as read when card is pressed (if handler provided)
    if (onMarkAsRead && !announcement.has_been_read) {
      onMarkAsRead();
    }
  };

  // Determine card styling based on announcement properties
  const isUnread = !announcement.has_been_read;
  const requiresAcknowledgment = announcement.require_acknowledgment && !announcement.has_been_acknowledged;
  const isExpired = announcement.end_date ? new Date() > parseISO(announcement.end_date) : false;

  const getAnnouncementIcon = () => {
    if (requiresAcknowledgment) return "alert-circle";
    if (announcement.target_type === "GCA") return "business";
    return "megaphone";
  };

  const getIconColor = () => {
    if (requiresAcknowledgment) return Colors[theme].primary;
    if (announcement.target_type === "GCA") return Colors[theme].announcementBadgeGCA;
    return Colors[theme].announcementBadgeDivision;
  };

  return (
    <TouchableOpacity
      style={[
        styles.announcementCard,
        isUnread && styles.unreadCard,
        requiresAcknowledgment && styles.requiresAcknowledgmentCard,
        isExpired && styles.expiredCard,
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <ThemedView style={styles.announcementCardHeader}>
        <ThemedView style={styles.announcementHeaderLeft}>
          <ThemedView style={[styles.iconContainer, { backgroundColor: getIconColor() + "20" }]}>
            <Ionicons name={getAnnouncementIcon()} size={20} color={getIconColor()} />
          </ThemedView>
          <ThemedView style={styles.announcementHeaderText}>
            <ThemedText style={styles.announcementType}>
              {announcement.target_type === "GCA" ? "GCA Announcement" : "Division Announcement"}
            </ThemedText>
            <ThemedText style={styles.announcementDate}>
              {format(parseISO(announcement.created_at), "MMM d, yyyy h:mm a")}
            </ThemedText>
            {announcement.author_name && (
              <ThemedText style={styles.authorName}>By {announcement.author_name}</ThemedText>
            )}
          </ThemedView>
        </ThemedView>
        <ThemedView style={styles.statusIndicators}>
          {isUnread && (
            <ThemedView style={[styles.statusBadge, { backgroundColor: Colors[theme].primary }]}>
              <ThemedText style={styles.statusBadgeText}>New</ThemedText>
            </ThemedView>
          )}
          {requiresAcknowledgment && (
            <ThemedView style={[styles.statusBadge, { backgroundColor: Colors[theme].error }]}>
              <ThemedText style={styles.statusBadgeText}>Action Required</ThemedText>
            </ThemedView>
          )}
          {isExpired && (
            <ThemedView style={[styles.statusBadge, { backgroundColor: Colors[theme].textDim }]}>
              <ThemedText style={styles.statusBadgeText}>Expired</ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.announcementContent}>
        <ThemedText style={styles.announcementTitle} numberOfLines={2}>
          {announcement.title}
        </ThemedText>
        <ThemedText style={styles.announcementMessage} numberOfLines={3}>
          {announcement.message}
        </ThemedText>
      </ThemedView>

      {/* Links and Documents indicators */}
      {(announcement.links?.length > 0 || announcement.document_ids?.length > 0) && (
        <ThemedView style={styles.attachmentsIndicator}>
          {announcement.links?.length > 0 && (
            <ThemedView style={styles.attachmentItem}>
              <Ionicons name="link" size={16} color={Colors[theme].textDim} />
              <ThemedText style={styles.attachmentText}>
                {announcement.links.length} link{announcement.links.length !== 1 ? "s" : ""}
              </ThemedText>
            </ThemedView>
          )}
          {announcement.document_ids?.length > 0 && (
            <ThemedView style={styles.attachmentItem}>
              <Ionicons name="document-text" size={16} color={Colors[theme].textDim} />
              <ThemedText style={styles.attachmentText}>
                {announcement.document_ids.length} document{announcement.document_ids.length !== 1 ? "s" : ""}
              </ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      )}

      {/* Expiration date indicator */}
      {announcement.end_date && (
        <ThemedView style={styles.expirationIndicator}>
          <Ionicons name="time" size={14} color={Colors[theme].textDim} />
          <ThemedText style={styles.expirationText}>
            {isExpired
              ? `Expired ${format(parseISO(announcement.end_date), "MMM d, yyyy")}`
              : `Expires ${format(parseISO(announcement.end_date), "MMM d, yyyy")}`}
          </ThemedText>
        </ThemedView>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  announcementCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 12,
    padding: 16,
  },
  unreadCard: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "10",
  },
  requiresAcknowledgmentCard: {
    borderColor: Colors.dark.error,
    borderWidth: 2,
  },
  expiredCard: {
    opacity: 0.7,
    backgroundColor: Colors.dark.background,
  },
  announcementCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  announcementHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  announcementHeaderText: {
    flex: 1,
  },
  announcementType: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.8,
    marginBottom: 2,
  },
  announcementDate: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 2,
  },
  authorName: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
  },
  statusIndicators: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    color: Colors.dark.buttonText,
    fontSize: 10,
    fontWeight: "600",
  },
  announcementContent: {
    marginBottom: 12,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  announcementMessage: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  attachmentsIndicator: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  attachmentText: {
    fontSize: 12,
    opacity: 0.7,
  },
  expirationIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  expirationText: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: "italic",
  },
});
