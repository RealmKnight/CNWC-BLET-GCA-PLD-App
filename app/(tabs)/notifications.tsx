import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StyleSheet, RefreshControl, Platform, TouchableOpacity, Image, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { markMessageRead } from "@/utils/notificationService";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { PlatformScrollView } from "@/components/PlatformScrollView";
import { format } from "date-fns";
import { useNotificationStore } from "@/store/notificationStore";

type ColorScheme = keyof typeof Colors;

interface NotificationItemProps {
  message: Message;
  onPress: () => void;
  onAcknowledge: () => void;
  onDelete: (messageId: string) => void;
}

type GroupBy = "none" | "date" | "type";
type FilterType = "all" | "unread" | "must_read" | "archived";

interface Message {
  id: string;
  sender_id: string | null;
  recipient_id: string | null;
  subject: string;
  content: string;
  created_at: string;
  message_type: string;
  requires_acknowledgment: boolean;
  is_read: boolean;
  read_by: string[];
  is_deleted: boolean;
  delivery_status?: {
    status: "pending" | "sent" | "delivered" | "failed";
    sent_at?: string;
    delivered_at?: string;
    error_message?: string;
  };
}

function NotificationItem({ message, onPress, onAcknowledge, onDelete }: NotificationItemProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const isUnread = !message.is_read;
  const needsAcknowledgment = message.requires_acknowledgment;

  // Get delivery status icon and color
  const getDeliveryStatus = () => {
    if (!message.delivery_status) return null;

    const { status } = message.delivery_status;
    let icon: keyof typeof Ionicons.glyphMap;
    let color: string;

    switch (status) {
      case "delivered":
        icon = "checkmark-done-circle";
        color = Colors[theme].success;
        break;
      case "sent":
        icon = "checkmark-circle";
        color = Colors[theme].primary;
        break;
      case "pending":
        icon = "time";
        color = Colors[theme].warning;
        break;
      case "failed":
        icon = "alert-circle";
        color = Colors[theme].error;
        break;
      default:
        return null;
    }

    return <Ionicons name={icon} size={16} color={color} style={styles.deliveryIcon} />;
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
      <ThemedView style={styles.notificationHeader}>
        <ThemedView style={styles.notificationMeta}>
          <ThemedText style={styles.notificationType}>
            {message.message_type.charAt(0).toUpperCase() + message.message_type.slice(1).replace(/_/g, " ")}
          </ThemedText>
          <ThemedText style={styles.notificationDate}>
            {format(new Date(message.created_at), "MMM d, yyyy h:mm a")}
          </ThemedText>
        </ThemedView>
        {getDeliveryStatus()}
      </ThemedView>

      <ThemedText style={styles.notificationTitle}>{message.subject}</ThemedText>
      <ThemedText style={styles.notificationContent} numberOfLines={2}>
        {message.content}
      </ThemedText>

      <ThemedView style={styles.notificationFooter}>
        {isUnread && <ThemedView style={[styles.unreadDot, { backgroundColor: Colors[theme].primary }]} />}
        {needsAcknowledgment && (
          <TouchableOpacity
            style={[styles.acknowledgeButton, { backgroundColor: Colors[theme].primary }]}
            onPress={onAcknowledge}
          >
            <ThemedText style={styles.acknowledgeButtonText}>Acknowledge</ThemedText>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: Colors[theme].error + "20" }]}
          onPress={() => onDelete(message.id)}
        >
          <Ionicons name="trash-outline" size={20} color={Colors[theme].error} />
        </TouchableOpacity>
      </ThemedView>
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();
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
    if (!user) return;
    setRefreshing(true);
    await fetchMessages(user.id);
    setRefreshing(false);
  }, [user, fetchMessages]);

  const handleMessagePress = async (message: Message) => {
    if (!user) return;

    // Mark as read if not already read
    if (!message.is_read) {
      await markAsRead(message.id, user.id);
    }

    // Navigate based on message type
    switch (message.message_type) {
      case "must_read":
      case "news":
        router.push(`/messages/${message.id}`);
        break;
      case "approval":
      case "denial":
      case "waitlist_promotion":
        router.push(`/calendar/requests/${message.id}`);
        break;
      case "allotment_change":
        router.push("/calendar");
        break;
      case "direct_message":
        router.push(`/messages/direct/${message.id}`);
        break;
    }
  };

  const handleAcknowledge = async (message: Message) => {
    if (!user) return;
    await markAsRead(message.id, user.id);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unreadMessages = messages.filter((msg) => !msg.is_read);
    for (const msg of unreadMessages) {
      await markAsRead(msg.id, user.id);
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToMessages(user.id);
    return () => {
      unsubscribe();
    };
  }, [user]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchMessages(user.id);
    }
  }, [user]);

  const handleDelete = async (messageId: string) => {
    Alert.alert("Delete Message", "Are you sure you want to delete this message?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMessage(messageId),
      },
    ]);
  };

  // Update the renderItem to use the new NotificationItem props
  const renderItem = ({ item }: { item: Message }) => (
    <NotificationItem
      message={item}
      onPress={() => handleMessagePress(item)}
      onAcknowledge={() => handleAcknowledge(item)}
      onDelete={handleDelete}
    />
  );

  return (
    <PlatformScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <ThemedView style={styles.header}>
        <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} resizeMode="contain" />
        <ThemedText type="title" style={styles.headerTitle}>
          Notifications
        </ThemedText>
        <ThemedView style={styles.headerRight} />
      </ThemedView>

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
                onDelete={handleDelete}
              />
            ))}
          </ThemedView>
        ))
      )}
    </PlatformScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  headerRight: {
    width: 32, // Same as logo width to maintain center alignment
  },
  notificationItem: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
    alignItems: "center",
  },
  unreadItem: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  notificationType: {
    fontSize: 14,
    fontWeight: "bold",
  },
  notificationDate: {
    fontSize: 12,
    color: "gray",
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  notificationContent: {
    fontSize: 14,
  },
  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.tint,
    marginRight: 8,
  },
  acknowledgeButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: Colors.light.tint,
  },
  acknowledgeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  archiveButton: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: Colors.light.text,
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
  deliveryIcon: {
    marginLeft: 8,
  },
  notificationMeta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
});
