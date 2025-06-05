import React from "react";
import { Modal, TouchableOpacity, ScrollView, StyleSheet, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

interface PriorityItem {
  id: string;
  type: "message" | "announcement";
  priority: "critical" | "high" | "normal";
  targetRoute: string;
  title: string;
  requiresAcknowledgment: boolean;
  isRead: boolean;
  isAcknowledged: boolean;
  createdAt: string;
  messageType?: string;
  targetType?: string;
}

interface PriorityBlockingModalProps {
  visible: boolean;
  currentItem: PriorityItem | null;
  totalItems: number;
  currentIndex: number;
  onNavigateToItem: () => void;
}

export function PriorityBlockingModal({
  visible,
  currentItem,
  totalItems,
  currentIndex,
  onNavigateToItem,
}: PriorityBlockingModalProps) {
  const theme = (useColorScheme() ?? "light") as keyof typeof Colors;

  if (!currentItem) return null;

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "critical":
        return "warning";
      case "high":
        return "alert-circle";
      default:
        return "information-circle";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return Colors[theme].error;
      case "high":
        return Colors[theme].primary;
      default:
        return Colors[theme].text;
    }
  };

  const getPriorityMessage = (item: PriorityItem) => {
    if (item.priority === "critical") {
      return "This is a critical message that requires your immediate attention. You must read and acknowledge it before continuing.";
    } else if (item.priority === "high") {
      return "This announcement requires your acknowledgment before you can continue using the app.";
    }
    return "This item requires your attention.";
  };

  const getItemTypeLabel = (item: PriorityItem) => {
    if (item.type === "message") {
      return item.messageType === "must_read" ? "Must Read Message" : "Message";
    } else {
      return item.targetType === "GCA" ? "GCA Announcement" : "Division Announcement";
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}} // Prevent dismissal
    >
      <ThemedView style={styles.overlay}>
        <ThemedView style={[styles.modalContent, { backgroundColor: Colors[theme].card }]}>
          {/* Header with priority indicator */}
          <ThemedView style={styles.header}>
            <ThemedView style={styles.headerLeft}>
              <ThemedView
                style={[styles.iconWrapper, { backgroundColor: getPriorityColor(currentItem.priority) + "20" }]}
              >
                <Ionicons
                  name={getPriorityIcon(currentItem.priority)}
                  size={24}
                  color={getPriorityColor(currentItem.priority)}
                />
              </ThemedView>
              <ThemedView>
                <ThemedText style={styles.itemType}>{getItemTypeLabel(currentItem)}</ThemedText>
                <ThemedText style={[styles.priorityLabel, { color: getPriorityColor(currentItem.priority) }]}>
                  {currentItem.priority.toUpperCase()} PRIORITY
                </ThemedText>
              </ThemedView>
            </ThemedView>

            {/* Progress indicator */}
            <ThemedView style={styles.progressContainer}>
              <ThemedText style={styles.progressText}>
                {currentIndex + 1} of {totalItems}
              </ThemedText>
            </ThemedView>
          </ThemedView>

          {/* Title */}
          <ThemedText style={styles.title}>{currentItem.title}</ThemedText>

          {/* Priority message */}
          <ThemedView style={[styles.messageContainer, { backgroundColor: Colors[theme].background }]}>
            <ThemedText style={styles.priorityMessage}>{getPriorityMessage(currentItem)}</ThemedText>
          </ThemedView>

          {/* Status indicators */}
          <ThemedView style={styles.statusContainer}>
            <ThemedView style={styles.statusItem}>
              <Ionicons
                name={currentItem.isRead ? "checkmark-circle" : "radio-button-off"}
                size={20}
                color={currentItem.isRead ? Colors[theme].success : Colors[theme].textDim}
              />
              <ThemedText
                style={[
                  styles.statusText,
                  {
                    color: currentItem.isRead ? Colors[theme].success : Colors[theme].textDim,
                  },
                ]}
              >
                Read
              </ThemedText>
            </ThemedView>

            {currentItem.requiresAcknowledgment && (
              <ThemedView style={styles.statusItem}>
                <Ionicons
                  name={currentItem.isAcknowledged ? "checkmark-circle" : "radio-button-off"}
                  size={20}
                  color={currentItem.isAcknowledged ? Colors[theme].success : Colors[theme].textDim}
                />
                <ThemedText
                  style={[
                    styles.statusText,
                    {
                      color: currentItem.isAcknowledged ? Colors[theme].success : Colors[theme].textDim,
                    },
                  ]}
                >
                  Acknowledged
                </ThemedText>
              </ThemedView>
            )}
          </ThemedView>

          {/* Navigation message */}
          <ThemedView style={styles.navigationMessage}>
            <Ionicons name="lock-closed" size={16} color={Colors[theme].warning} />
            <ThemedText style={[styles.navigationText, { color: Colors[theme].warning }]}>
              Navigation is blocked until this item is handled
            </ThemedText>
          </ThemedView>

          {/* Action button */}
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: getPriorityColor(currentItem.priority) }]}
            onPress={onNavigateToItem}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
            <ThemedText style={styles.actionButtonText}>
              {currentItem.priority === "critical" ? "Read Critical Message" : "Review Announcement"}
            </ThemedText>
          </TouchableOpacity>

          {/* Footer note */}
          <ThemedText style={[styles.footerNote, { color: Colors[theme].textDim }]}>
            {totalItems > 1 && `${totalItems - currentIndex - 1} more item(s) after this one`}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
      },
    }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  itemType: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priorityLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  progressContainer: {
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    lineHeight: 28,
  },
  messageContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  priorityMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  statusContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 20,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  navigationMessage: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
    paddingVertical: 8,
  },
  navigationText: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    marginBottom: 12,
  },
  actionButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "700",
  },
  footerNote: {
    fontSize: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
