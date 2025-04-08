import React from "react";
import { Modal, StyleSheet, TouchableOpacity, ScrollView, Pressable } from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns";
import type { Message } from "@/store/notificationStore";

type ColorScheme = keyof typeof Colors;

interface MessageModalProps {
  message: Message | null;
  visible: boolean;
  onClose: () => void;
  onAcknowledge: (message: Message) => Promise<void>;
  onDelete: (messageId: string) => void;
}

export function MessageModal({ message, visible, onClose, onAcknowledge, onDelete }: MessageModalProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  if (!message) return null;

  const handleAcknowledge = async () => {
    await onAcknowledge(message);
    onClose();
  };

  const handleDelete = () => {
    onDelete(message.id);
    onClose();
  };

  const getMessageTypeIcon = () => {
    let icon: keyof typeof Ionicons.glyphMap;
    switch (message.message_type) {
      case "must_read":
        icon = "alert-circle";
        break;
      case "news":
        icon = "newspaper";
        break;
      case "direct_message":
        icon = "chatbubble";
        break;
      case "approval":
      case "denial":
        icon = "calendar";
        break;
      case "waitlist_promotion":
        icon = "trending-up";
        break;
      case "allotment_change":
        icon = "sync";
        break;
      default:
        icon = "mail";
    }
    return icon;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: Colors[theme].card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedView style={styles.headerLeft}>
              <ThemedView style={styles.iconWrapper}>
                <Ionicons name={getMessageTypeIcon()} size={24} color={Colors[theme].text} />
              </ThemedView>
              <ThemedView>
                <ThemedText style={styles.messageType}>
                  {message.message_type.charAt(0).toUpperCase() + message.message_type.slice(1).replace(/_/g, " ")}
                </ThemedText>
                <ThemedText style={styles.timestamp}>
                  {format(new Date(message.created_at), "MMM d, yyyy h:mm a")}
                </ThemedText>
              </ThemedView>
            </ThemedView>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          </ThemedView>

          {/* Subject */}
          <ThemedText style={styles.subject}>{message.subject}</ThemedText>

          {/* Content */}
          <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
            <ThemedText style={styles.content}>{message.content}</ThemedText>
          </ScrollView>

          {/* Footer */}
          <ThemedView style={styles.footer}>
            {message.requires_acknowledgment && !message.is_read && (
              <TouchableOpacity
                style={[styles.acknowledgeButton, { backgroundColor: Colors[theme].primary }]}
                onPress={handleAcknowledge}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <ThemedText style={styles.acknowledgeButtonText}>Acknowledge</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: Colors[theme].error + "20" }]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color={Colors[theme].error} />
            </TouchableOpacity>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageType: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.6,
  },
  closeButton: {
    padding: 8,
  },
  subject: {
    fontSize: 20,
    fontWeight: "600",
    padding: 16,
    paddingTop: 8,
  },
  contentScroll: {
    maxHeight: "60%",
  },
  contentContainer: {
    padding: 16,
    paddingTop: 0,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  acknowledgeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
  },
});
