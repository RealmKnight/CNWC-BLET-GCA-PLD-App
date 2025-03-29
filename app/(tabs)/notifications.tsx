import React, { useEffect, useState, useMemo } from "react";
import { StyleSheet, RefreshControl, Platform, TouchableOpacity, Image, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { markMessageRead } from "@/utils/notificationService";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ScrollView } from "react-native-gesture-handler";
import { format } from "date-fns";
import { useNotificationStore } from "@/store/notificationStore";

type ColorScheme = keyof typeof Colors;
type GroupBy = "date" | "type" | "none";
type FilterType = "all" | "unread" | "must_read" | "archived";

interface Message {
  id: string;
  subject: string;
  content: string;
  created_at: string;
  message_type: string;
  requires_acknowledgment: boolean;
  is_read: boolean;
  read_by: string[];
  is_archived?: boolean;
}

function NotificationItem({
  message,
  onPress,
  onAcknowledge,
  onArchive,
}: {
  message: Message;
  onPress: () => void;
  onAcknowledge: () => void;
  onArchive: () => void;
}) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const isUnread = !message.is_read;
  const requiresAck = message.requires_acknowledgment;

  const getIconName = () => {
    switch (message.message_type) {
      case "must_read":
        return "alert-circle";
      case "news":
        return "newspaper";
      case "direct_message":
        return "mail";
      case "approval":
        return "checkmark-circle";
      case "denial":
        return "close-circle";
      case "waitlist_promotion":
        return "arrow-up-circle";
      case "allotment_change":
        return "calendar";
      default:
        return "notifications";
    }
  };

  return (
    <TouchableOpacity onPress={onPress}>
      <ThemedView style={[styles.notificationItem, isUnread && styles.unreadItem]}>
        <ThemedView style={styles.notificationIcon}>
          <Ionicons name={getIconName()} size={24} color={Colors[theme].tint} />
        </ThemedView>
        <ThemedView style={styles.notificationContent}>
          <ThemedText type="subtitle" style={[styles.subject, isUnread && styles.unreadText]}>
            {message.subject}
          </ThemedText>
          <ThemedText numberOfLines={2} style={styles.content}>
            {message.content}
          </ThemedText>
          <ThemedText style={styles.timestamp}>{new Date(message.created_at).toLocaleDateString()}</ThemedText>
        </ThemedView>
        {requiresAck && !message.is_read && (
          <TouchableOpacity onPress={onAcknowledge} style={styles.acknowledgeButton}>
            <ThemedText style={styles.acknowledgeText}>Acknowledge</ThemedText>
          </TouchableOpacity>
        )}
        {message.is_archived && (
          <TouchableOpacity onPress={onArchive} style={styles.archiveButton}>
            <ThemedText style={styles.archiveText}>Archive</ThemedText>
          </TouchableOpacity>
        )}
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

  const { messages, fetchMessages, markAsRead: markMessageRead, archiveMessage } = useNotificationStore();

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
        filtered = filtered.filter((msg) => msg.is_archived);
        break;
      default:
        filtered = filtered.filter((msg) => !msg.is_archived);
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

  const handleRefresh = async () => {
    if (!user) return;
    setRefreshing(true);
    await fetchMessages(user.id);
    setRefreshing(false);
  };

  const handleMessagePress = async (message: Message) => {
    if (!user) return;

    // Mark as read if not already read
    if (!message.is_read) {
      await markMessageRead(message.id, user.id);
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
    await markMessageRead(message.id, user.id);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unreadMessages = messages.filter((msg) => !msg.is_read);
    for (const msg of unreadMessages) {
      await markMessageRead(msg.id, user.id);
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    if (!user) return;

    const subscription = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          fetchMessages(user.id);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchMessages(user.id);
    }
  }, [user]);

  return (
    <ScrollView
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
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
          </ScrollView>
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
                onArchive={() => archiveMessage(message.id)}
              />
            ))}
          </ThemedView>
        ))
      )}
    </ScrollView>
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
  notificationIcon: {
    marginRight: 16,
  },
  notificationContent: {
    flex: 1,
  },
  subject: {
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: "bold",
  },
  content: {
    fontSize: 14,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: "gray",
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
  acknowledgeButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  acknowledgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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
  archiveButton: {
    backgroundColor: Colors.light.text,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  archiveText: {
    color: Colors.light.background,
    fontSize: 12,
    fontWeight: "600",
  },
});
