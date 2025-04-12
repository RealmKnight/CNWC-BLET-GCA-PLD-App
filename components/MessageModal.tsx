import React, { useState, useRef } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns";
import type { Message } from "@/store/notificationStore";
import { useNotificationStore } from "@/store/notificationStore";
import Toast from "react-native-toast-message";

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
  const [hasReadFully, setHasReadFully] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const archiveMessage = useNotificationStore((state) => state.archiveMessage);

  if (!message) return null;

  const handleAcknowledge = async () => {
    if (!hasReadFully) return;
    await onAcknowledge(message);
    onClose();
  };

  const handleDelete = () => {
    onDelete(message.id);
    onClose();
  };

  const handleArchive = async () => {
    if (!message) return;

    try {
      await archiveMessage(message.id);
      Toast.show({
        type: "success",
        text1: "Message archived",
        position: "bottom",
        visibilityTime: 2000,
      });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.message === "Message must be read before archiving") {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Message must be read before archiving",
          position: "bottom",
          visibilityTime: 3000,
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to archive message",
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20; // Adjust this value as needed
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && !hasReadFully) {
      setHasReadFully(true);
    }
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

  const isAcknowledged = message.acknowledged_by?.includes(message.recipient_pin_number?.toString() || "");
  const showAcknowledgeButton = message.requires_acknowledgment && !isAcknowledged;

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
              <ThemedView style={[styles.iconWrapper, message.requires_acknowledgment && styles.mustReadIconWrapper]}>
                <Ionicons
                  name={getMessageTypeIcon()}
                  size={24}
                  color={message.requires_acknowledgment ? Colors[theme].primary : Colors[theme].text}
                />
              </ThemedView>
              <ThemedView>
                <ThemedView style={styles.typeContainer}>
                  <ThemedText style={styles.messageType}>
                    {message.message_type.charAt(0).toUpperCase() + message.message_type.slice(1).replace(/_/g, " ")}
                  </ThemedText>
                  {message.requires_acknowledgment && !isAcknowledged && (
                    <ThemedView style={[styles.acknowledgmentBadge, { backgroundColor: Colors[theme].primary }]}>
                      <ThemedText style={styles.acknowledgmentBadgeText}>Requires Acknowledgment</ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
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
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            <ThemedText style={styles.content}>{message.content}</ThemedText>
          </ScrollView>

          {/* Footer */}
          <ThemedView style={styles.footer}>
            {showAcknowledgeButton && (
              <TouchableOpacity
                style={[
                  styles.acknowledgeButton,
                  { backgroundColor: hasReadFully ? Colors[theme].primary : Colors[theme].disabled },
                ]}
                onPress={handleAcknowledge}
                disabled={!hasReadFully}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <ThemedText style={styles.acknowledgeButtonText}>
                  {hasReadFully ? "Acknowledge" : "Read Full Message to Acknowledge"}
                </ThemedText>
              </TouchableOpacity>
            )}
            <ThemedView style={styles.actionButtons}>
              {!message?.is_archived && (
                <TouchableOpacity
                  style={[styles.iconButton, { backgroundColor: Colors[theme].secondary + "20" }]}
                  onPress={handleArchive}
                  disabled={!message?.is_read}
                >
                  <Ionicons
                    name="archive-outline"
                    size={20}
                    color={message?.is_read ? Colors[theme].secondary : Colors[theme].disabled}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: Colors[theme].error + "20" }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={20} color={Colors[theme].error} />
              </TouchableOpacity>
            </ThemedView>
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
  mustReadIconWrapper: {
    backgroundColor: Colors.light.primary + "20",
  },
  typeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageType: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  acknowledgmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  acknowledgmentBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
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
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
