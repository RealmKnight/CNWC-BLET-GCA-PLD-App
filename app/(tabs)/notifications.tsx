import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StyleSheet, RefreshControl, Platform, TouchableOpacity, Image, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { PlatformScrollView } from "@/components/PlatformScrollView";
import { format } from "date-fns";
import { useNotificationStore, Message } from "@/store/notificationStore";
import { useUserStore } from "@/store/userStore";
import { Ionicons } from "@expo/vector-icons";
import { MessageModal } from "@/components/MessageModal";
import Toast from "react-native-toast-message";

type ColorScheme = keyof typeof Colors;

interface NotificationItemProps {
  message: Message;
  onPress: () => void;
  onAcknowledge: () => void;
  handleDelete: (messageId: string) => void;
}

type GroupBy = "none" | "date" | "type";
type FilterType = "all" | "unread" | "must_read" | "archived";

function NotificationItem({ message, onPress, onAcknowledge, handleDelete }: NotificationItemProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const isUnread = !message.is_read;
  const needsAcknowledgment = message.requires_acknowledgment;

  // Get delivery status icon and color
  const getDeliveryStatus = () => {
    const deliveryStatus = message.metadata?.delivery_attempts?.[0];
    if (!deliveryStatus) return null;

    const { success, error } = deliveryStatus;
    let icon: keyof typeof Ionicons.glyphMap;
    let color: string;

    if (success) {
      icon = "checkmark-done-circle";
      color = Colors[theme].success;
    } else if (error) {
      icon = "alert-circle";
      color = Colors[theme].error;
    } else {
      icon = "time";
      color = Colors[theme].warning;
    }

    return <Ionicons name={icon} size={16} color={color} style={styles.deliveryIcon} />;
  };

  const messageTypeIcon = useMemo(() => {
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
  }, [message.message_type]);

  const onDeletePress = () => {
    console.log("[NotificationItem] Delete button pressed for message:", message.id);
    handleDelete(message.id);
  };

  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        { backgroundColor: Colors[theme].card },
        isUnread && styles.unreadItem,
        Platform.OS === "web" && { cursor: "pointer" },
      ]}
      onPress={onPress}
    >
      {/* Left Icon Column */}
      <ThemedView style={styles.iconColumn}>
        <ThemedView style={[styles.iconWrapper, isUnread && styles.unreadIconWrapper]}>
          <Ionicons name={messageTypeIcon} size={24} color={isUnread ? Colors[theme].primary : Colors[theme].text} />
        </ThemedView>
      </ThemedView>

      {/* Content Column */}
      <ThemedView style={styles.contentColumn}>
        {/* Header Row */}
        <ThemedView style={styles.messageHeader}>
          <ThemedView style={styles.headerLeft}>
            <ThemedText style={styles.messageType}>
              {message.message_type.charAt(0).toUpperCase() + message.message_type.slice(1).replace(/_/g, " ")}
            </ThemedText>
            {getDeliveryStatus()}
          </ThemedView>
          <ThemedText style={styles.timestamp}>{format(new Date(message.created_at), "MMM d, h:mm a")}</ThemedText>
        </ThemedView>

        {/* Subject Line */}
        <ThemedText style={[styles.subject, isUnread && styles.unreadText]} numberOfLines={1}>
          {message.subject}
        </ThemedText>

        {/* Message Preview */}
        <ThemedText style={styles.preview} numberOfLines={2}>
          {message.content}
        </ThemedText>

        {/* Footer Actions */}
        <ThemedView style={styles.messageFooter}>
          {needsAcknowledgment && (
            <TouchableOpacity
              style={[styles.acknowledgeButton, { backgroundColor: Colors[theme].primary }]}
              onPress={onAcknowledge}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
              <ThemedText style={styles.acknowledgeButtonText}>Acknowledge</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: Colors[theme].error + "20" }]}
            onPress={onDeletePress}
          >
            <Ionicons name="trash-outline" size={20} color={Colors[theme].error} />
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const { member } = useUserStore();
  const router = useRouter();
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  const { messages, isLoading, error, fetchMessages, markAsRead, deleteMessage, subscribeToMessages } =
    useNotificationStore();

  // Filter and group messages
  const filteredAndGroupedMessages = useMemo(() => {
    let filtered = messages;

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(
        (msg) =>
          msg.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply filters
    switch (filterType) {
      case "unread":
        filtered = filtered.filter((msg) => !msg.is_read);
        break;
      case "must_read":
        filtered = filtered.filter((msg) => msg.message_type === "must_read");
        break;
      case "archived":
        filtered = filtered.filter((msg) => msg.is_deleted);
        break;
      default:
        filtered = filtered.filter((msg) => !msg.is_deleted);
    }

    // Group messages
    if (groupBy === "none") return { ungrouped: filtered };

    return filtered.reduce((groups, message) => {
      const key = groupBy === "date" ? format(new Date(message.created_at), "MMMM d, yyyy") : message.message_type;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(message);
      return groups;
    }, {} as Record<string, Message[]>);
  }, [messages, groupBy, filterType, searchQuery]);

  const handleRefresh = useCallback(async () => {
    if (!member?.pin_number) return;
    setRefreshing(true);
    await fetchMessages(member.pin_number);
    setRefreshing(false);
  }, [member, fetchMessages]);

  const handleMessagePress = async (message: Message) => {
    if (!member?.pin_number) return;
    setSelectedMessage(message);

    // Mark as read if not already read
    if (!message.is_read) {
      await markAsRead(message.id, member.pin_number);
    }
  };

  const handleCloseModal = () => {
    setSelectedMessage(null);
  };

  const handleAcknowledge = async (message: Message) => {
    if (!member?.pin_number) return;
    await markAsRead(message.id, member.pin_number);
  };

  const handleMarkAllRead = async () => {
    if (!member?.pin_number) return;
    const unreadMessages = messages.filter((msg) => !msg.is_read);
    for (const msg of unreadMessages) {
      await markAsRead(msg.id, member.pin_number);
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    if (!member?.pin_number) return;
    const unsubscribe = subscribeToMessages(member.pin_number);
    return () => {
      unsubscribe();
    };
  }, [member]);

  // Initial fetch
  useEffect(() => {
    if (member?.pin_number) {
      fetchMessages(member.pin_number);
    }
  }, [member]);

  const handleDelete = async (messageId: string) => {
    console.log("[Notifications] handleDelete called with messageId:", messageId);

    const handleDeleteAction = async () => {
      console.log("[Notifications] Delete action triggered for messageId:", messageId);
      try {
        console.log("[Notifications] Calling deleteMessage...");
        await deleteMessage(messageId);
        console.log("[Notifications] Message deleted successfully");

        // Close modal if the deleted message was being viewed
        if (selectedMessage?.id === messageId) {
          console.log("[Notifications] Closing modal for deleted message");
          setSelectedMessage(null);
        }

        // Refresh messages list
        if (member?.pin_number) {
          console.log("[Notifications] Refreshing messages list");
          await fetchMessages(member.pin_number);
        }

        Toast.show({
          type: "success",
          text1: "Message deleted successfully",
          position: "bottom",
          visibilityTime: 2000,
        });
      } catch (error) {
        console.error("[Notifications] Error deleting message:", error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to delete message. Please try again.",
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    };

    Toast.show({
      type: "info",
      text1: "Delete Message",
      text2: "Are you sure you want to delete this message?",
      position: "bottom",
      visibilityTime: 4000,
      autoHide: false,
      onPress: () => {
        Toast.hide();
      },
      props: {
        onAction: async (action: string) => {
          console.log("[Notifications] Toast action received:", action);
          if (action === "delete") {
            console.log("[Notifications] Delete action confirmed, hiding toast");
            Toast.hide();
            await handleDeleteAction();
          }
        },
      },
    });
  };

  // Update the renderItem to use the new NotificationItem props
  const renderItem = ({ item }: { item: Message }) => (
    <NotificationItem
      message={item}
      onPress={() => handleMessagePress(item)}
      onAcknowledge={() => handleAcknowledge(item)}
      handleDelete={handleDelete}
    />
  );

  return (
    <PlatformScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <ThemedView style={styles.controls}>
        <ThemedView style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors[theme].text} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: Colors[theme].text }]}
            placeholder="Search notifications..."
            placeholderTextColor={Colors[theme].text}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </ThemedView>

        <ThemedView style={styles.filterRow}>
          <PlatformScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {["all", "unread", "must_read", "archived"].map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setFilterType(filter as FilterType)}
                style={[styles.filterButton, filterType === filter && styles.filterButtonActive]}
              >
                <ThemedText style={[styles.filterButtonText, filterType === filter && styles.filterButtonTextActive]}>
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </PlatformScrollView>
        </ThemedView>

        <ThemedView style={styles.actionRow}>
          <TouchableOpacity
            onPress={() => setGroupBy(groupBy === "date" ? "type" : groupBy === "type" ? "none" : "date")}
            style={styles.actionButton}
          >
            <Ionicons
              name={groupBy === "date" ? "calendar" : groupBy === "type" ? "list" : "layers"}
              size={20}
              color={Colors[theme].text}
            />
            <ThemedText style={styles.actionButtonText}>
              Group by {groupBy === "date" ? "Date" : groupBy === "type" ? "Type" : "None"}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleMarkAllRead} style={styles.actionButton}>
            <Ionicons name="checkmark-done-circle" size={20} color={Colors[theme].text} />
            <ThemedText style={styles.actionButtonText}>Mark All Read</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {messages.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <Ionicons name="notifications-off" size={48} color={Colors[theme].text} />
          <ThemedText style={styles.emptyText}>No notifications</ThemedText>
        </ThemedView>
      ) : (
        Object.entries(filteredAndGroupedMessages).map(([key, groupMessages]) => (
          <ThemedView key={key} style={styles.group}>
            <ThemedText style={styles.groupHeader}>{key}</ThemedText>
            {groupMessages.map((message) => (
              <NotificationItem
                key={message.id}
                message={message}
                onPress={() => handleMessagePress(message)}
                onAcknowledge={() => handleAcknowledge(message)}
                handleDelete={handleDelete}
              />
            ))}
          </ThemedView>
        ))
      )}

      <MessageModal
        message={selectedMessage}
        visible={!!selectedMessage}
        onClose={handleCloseModal}
        onAcknowledge={handleAcknowledge}
        onDelete={handleDelete}
      />
    </PlatformScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  filterButtonActive: {
    backgroundColor: Colors.light.tint,
  },
  filterButtonText: {
    fontSize: 14,
  },
  filterButtonTextActive: {
    color: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  actionButtonText: {
    marginLeft: 4,
    fontSize: 14,
  },
  group: {
    marginBottom: 8,
  },
  groupHeader: {
    padding: 16,
    paddingBottom: 8,
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(128, 128, 128, 0.05)",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: "gray",
  },
  notificationItem: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  unreadItem: {
    backgroundColor: Colors.light.primary + "10",
  },
  iconColumn: {
    padding: 16,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadIconWrapper: {
    backgroundColor: Colors.light.primary + "20",
  },
  contentColumn: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageType: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.5,
  },
  subject: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: "700",
    color: Colors.light.primary,
  },
  preview: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
    marginBottom: 12,
  },
  messageFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  acknowledgeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
  },
  deliveryIcon: {
    marginLeft: 4,
  },
});
