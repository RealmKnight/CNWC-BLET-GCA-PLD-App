import React, { useState, forwardRef, Ref, useEffect, useMemo } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  FlatList,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { FontAwesome, Ionicons } from "@expo/vector-icons";

// State Management & Data
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { useUserStore } from "@/store/userStore";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { AdminMessage } from "@/types/adminMessages";

// UI & Utils
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ContactAdminModal } from "@/components/modals/ContactAdminModal";

interface AdminMessagesProps {}

export const AdminMessages = forwardRef<View, AdminMessagesProps>((props, ref: Ref<View>) => {
  // State Hooks
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [currentFilter, setCurrentFilter] = useState<"all" | "unread" | "archived">("all");
  const [replyText, setReplyText] = useState("");
  const [isNewMessageModalVisible, setIsNewMessageModalVisible] = useState(false);

  // Get screen dimensions
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768; // Define breakpoint

  // Zustand Store
  const {
    messages,
    fetchMessages,
    subscribeToAdminMessages,
    markAsRead,
    replyAsAdmin,
    archiveThread,
    markThreadAsUnread,
    acknowledgeMessage,
  } = useAdminNotificationStore();

  const currentUser = useUserStore((state) => state.member);
  const effectiveRoles = useEffectiveRoles() ?? [];

  // Theme & Colors
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme as keyof typeof Colors];
  const themeTintColor = useThemeColor({}, "tint");
  const primaryContrastColor = colors.background;
  const selectedBackgroundColor = colors.tint + "30";
  const disabledColor = colors.icon;

  // Fetch & Subscribe Effect
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (currentUser?.id) {
      fetchMessages(currentUser.id);
      unsubscribe = subscribeToAdminMessages(currentUser.id);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.id, fetchMessages, subscribeToAdminMessages]);

  // --- Thread Grouping and Filtering ---
  const getRootMessageId = (msg: AdminMessage): string => msg.parent_message_id || msg.id;

  const filteredThreads = useMemo(() => {
    const grouped = messages.reduce((acc, msg) => {
      const rootId = getRootMessageId(msg);
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(msg);
      return acc;
    }, {} as Record<string, AdminMessage[]>);

    Object.values(grouped).forEach((thread) =>
      thread.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
    );

    return Object.values(grouped)
      .filter((thread) => {
        if (!thread || thread.length === 0) return false;
        const isArchived = thread.some((msg) => msg.is_archived);
        const latestMessage = thread[thread.length - 1];
        const isAdminReader = currentUser?.id && latestMessage.read_by?.includes(currentUser.id);
        switch (currentFilter) {
          case "unread":
            return !isArchived && !isAdminReader;
          case "archived":
            return isArchived;
          case "all":
          default:
            return !isArchived;
        }
      })
      .sort((threadA, threadB) => {
        const lastMsgA = threadA[threadA.length - 1];
        const lastMsgB = threadB[threadB.length - 1];
        return new Date(lastMsgB.created_at ?? 0).getTime() - new Date(lastMsgA.created_at ?? 0).getTime();
      });
  }, [messages, currentFilter, currentUser?.id]);

  // --- Handlers ---
  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setReplyText("");

    const thread = filteredThreads.find((t) => getRootMessageId(t[0]) === threadId);
    if (thread && thread.length > 0 && currentUser?.id) {
      const latestMessage = thread[thread.length - 1];
      if (!latestMessage.read_by?.includes(currentUser.id)) {
        markAsRead(latestMessage.id, currentUser.id).catch((err) => {
          console.error("Failed to mark thread as read:", err);
        });
      }
    } else {
      console.warn("Could not mark thread as read - thread or user ID missing");
    }
  };

  const handleFilterChange = (filter: typeof currentFilter) => {
    setCurrentFilter(filter);
    setSelectedThreadId(null);
    setReplyText("");
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThreadId || !currentUser?.id) return;
    console.log(`Attempting to send reply to thread ${selectedThreadId}...`);
    try {
      await replyAsAdmin(selectedThreadId, currentUser.id, replyText);
      console.log(`Reply Sent to thread ${selectedThreadId}!`);
      setReplyText("");
    } catch (error) {
      console.error("Failed to send reply:", error);
      // TODO: Show error feedback to the user
    }
  };

  const handleArchiveAction = (threadId: string | null) => {
    if (!threadId) return;
    console.log(`Archiving thread ${threadId}`);
    archiveThread(threadId).catch((err) => {
      console.error(`Failed to archive thread ${threadId}:`, err);
      // TODO: Show error feedback
    });
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  };

  const handleMarkUnreadAction = (threadId: string | null) => {
    if (!threadId || !currentUser?.id) return;
    console.log(`Marking thread ${threadId} as unread`);
    markThreadAsUnread(threadId, currentUser.id).catch((err) => {
      console.error(`Failed to mark thread ${threadId} as unread:`, err);
      // TODO: Show error feedback
    });
  };

  // --- Handler for Acknowledgment ---
  const handleAcknowledgeThread = (threadId: string | null) => {
    if (!threadId || !currentUser?.id) return;
    const thread = filteredThreads.find((t) => getRootMessageId(t[0]) === threadId);
    if (thread && thread.length > 0) {
      const latestMessage = thread[thread.length - 1];
      if (latestMessage.requires_acknowledgment && !latestMessage.acknowledged_by?.includes(currentUser.id)) {
        console.log(`Acknowledging message ${latestMessage.id}`);
        acknowledgeMessage(latestMessage.id, currentUser.id).catch((err) => {
          console.error(`Failed to acknowledge message ${latestMessage.id}:`, err);
          // TODO: Show error feedback
        });
      }
    }
  };

  // --- Modal Handlers ---
  const openNewMessageModal = () => setIsNewMessageModalVisible(true);
  const closeNewMessageModal = () => setIsNewMessageModalVisible(false);

  // --- Render Functions ---

  const renderFilters = () => (
    <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            borderColor: colors.border,
            backgroundColor: currentFilter === "all" ? colors.primary : colors.background,
          },
          currentFilter === "all" && styles.activeButton,
        ]}
        onPress={() => handleFilterChange("all")}
      >
        <Ionicons
          name="mail-outline"
          size={24}
          color={currentFilter === "all" ? primaryContrastColor : themeTintColor}
        />
        <ThemedText
          style={[
            styles.buttonText,
            { color: currentFilter === "all" ? primaryContrastColor : themeTintColor },
            currentFilter === "all" && styles.activeText,
          ]}
        >
          All Messages
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            borderColor: colors.border,
            backgroundColor: currentFilter === "unread" ? colors.primary : colors.background,
          },
          currentFilter === "unread" && styles.activeButton,
        ]}
        onPress={() => handleFilterChange("unread")}
      >
        <Ionicons
          name="mail-unread-outline"
          size={24}
          color={currentFilter === "unread" ? primaryContrastColor : themeTintColor}
        />
        <ThemedText
          style={[
            styles.buttonText,
            { color: currentFilter === "unread" ? primaryContrastColor : themeTintColor },
            currentFilter === "unread" && styles.activeText,
          ]}
        >
          Unread Only
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.actionButton,
          {
            borderColor: colors.border,
            backgroundColor: currentFilter === "archived" ? colors.primary : colors.background,
          },
          currentFilter === "archived" && styles.activeButton,
        ]}
        onPress={() => handleFilterChange("archived")}
      >
        <Ionicons
          name="archive-outline"
          size={24}
          color={currentFilter === "archived" ? primaryContrastColor : themeTintColor}
        />
        <ThemedText
          style={[
            styles.buttonText,
            { color: currentFilter === "archived" ? primaryContrastColor : themeTintColor },
            currentFilter === "archived" && styles.activeText,
          ]}
        >
          Archived
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.actionButton,
          { marginLeft: "auto", borderColor: colors.primary, backgroundColor: colors.background },
        ]}
        onPress={openNewMessageModal}
        accessibilityRole="button"
        accessibilityLabel="Compose new message"
      >
        <Ionicons name="create-outline" size={24} color={colors.primary} />
        <ThemedText style={[styles.buttonText, { color: colors.primary }]}>New Message</ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderThreadItem = ({ item }: { item: AdminMessage[] }) => {
    const rootMessage = item[0];
    const latestMessage = item[item.length - 1];
    const rootId = getRootMessageId(rootMessage);
    const isSelected = selectedThreadId === rootId;
    const latestMessageDate = latestMessage.created_at ? new Date(latestMessage.created_at) : new Date();
    const isAdminReader = currentUser?.id && latestMessage.read_by?.includes(currentUser.id);
    const isUnread = !isAdminReader;

    return (
      <TouchableOpacity
        style={[
          styles.threadItem,
          isSelected && { backgroundColor: selectedBackgroundColor },
          { borderBottomColor: colors.border },
        ]}
        onPress={() => handleSelectThread(rootId)}
        accessibilityRole="button"
        accessibilityLabel={`Conversation: ${rootMessage.subject || "(No Subject)"}. Status: ${
          isUnread ? "Unread" : "Read"
        }`}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
          {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          <ThemedText type="defaultSemiBold" style={isUnread ? styles.unreadText : {}}>
            {rootMessage.subject || "(No Subject)"}
          </ThemedText>
        </View>
        <ThemedText
          numberOfLines={1}
          style={[styles.threadMessagePreview, { color: colors.textDim, marginLeft: isUnread ? 16 : 0 }]}
        >
          {latestMessage.sender_role}: {latestMessage.message}
        </ThemedText>
        <ThemedText style={[styles.threadTimestamp, { color: colors.textDim, marginLeft: isUnread ? 16 : 0 }]}>
          {latestMessageDate.toLocaleString()}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  const renderMessageList = () => (
    <FlatList
      data={filteredThreads}
      renderItem={renderThreadItem}
      keyExtractor={(item) => getRootMessageId(item[0])}
      style={[styles.messageListContainer, !isWideScreen && styles.fullWidthPane, { backgroundColor: colors.card }]}
      ListEmptyComponent={
        <View style={styles.emptyListContainer}>
          <Ionicons name="mail-outline" size={48} color={colors.textDim} />
          <ThemedText style={[styles.emptyListText, { color: colors.textDim }]}>No messages found.</ThemedText>
        </View>
      }
      extraData={selectedThreadId}
    />
  );

  const renderMessageDetails = () => {
    const currentThreadId = selectedThreadId;
    const selectedThread = currentThreadId
      ? filteredThreads.find((t) => getRootMessageId(t[0]) === currentThreadId)
      : null;

    if (!isWideScreen && !selectedThread) {
      return null;
    }

    if (!selectedThread) {
      return (
        <ThemedView style={[styles.detailsPane, styles.emptyDetails, { backgroundColor: colors.background }]}>
          <Ionicons name="chatbubbles-outline" size={48} color={colors.textDim} />
          <ThemedText style={{ color: colors.textDim, marginTop: 10 }}>Select a conversation</ThemedText>
        </ThemedView>
      );
    }

    // Determine if acknowledgment is needed for the latest message
    const latestMessage = selectedThread[selectedThread.length - 1];
    const needsAcknowledgement =
      latestMessage.requires_acknowledgment &&
      !(currentUser?.id && latestMessage.acknowledged_by?.includes(currentUser.id));

    const renderDetailItem = ({ item }: { item: AdminMessage }) => {
      const messageDate = item.created_at ? new Date(item.created_at) : new Date();
      const isCurrentUserSender = item.sender_user_id === currentUser?.id;

      return (
        <View
          key={item.id}
          style={[
            styles.detailMessageItem,
            { borderBottomColor: colors.border },
            isCurrentUserSender
              ? { alignSelf: "flex-end", backgroundColor: colors.primary + "30" }
              : { alignSelf: "flex-start", backgroundColor: colors.card },
          ]}
          accessibilityLabel={`Message from ${item.sender_role} at ${messageDate.toLocaleString()}: ${item.message}`}
        >
          <View style={styles.senderInfo}>
            <View
              style={[styles.senderAvatar, { backgroundColor: isCurrentUserSender ? colors.primary : colors.icon }]}
            />
            <ThemedText type="defaultSemiBold">
              {item.sender_role} {isCurrentUserSender ? "(You)" : ""}
            </ThemedText>
          </View>
          <ThemedText style={{ color: colors.textDim, fontSize: 12, marginBottom: 5 }}>
            {messageDate.toLocaleString()}
          </ThemedText>
          <ThemedText>{item.message}</ThemedText>
        </View>
      );
    };

    const rootSubject = selectedThread[0].subject || "(No Subject)";

    const DetailsContent = (
      <>
        <ThemedView style={[styles.messageHeader, { borderBottomColor: colors.border }]}>
          {!isWideScreen && (
            <TouchableOpacity
              onPress={() => setSelectedThreadId(null)}
              style={{ marginRight: 15, padding: 5 }}
              accessibilityRole="button"
              accessibilityLabel="Back to messages list"
            >
              <Ionicons name="arrow-back" size={24} color={themeTintColor} />
            </TouchableOpacity>
          )}
          <ThemedText type="subtitle" numberOfLines={1} style={{ flexShrink: 1, marginRight: 10 }}>
            {rootSubject}
          </ThemedText>
          <View style={styles.detailActionsContainer}>
            {/* Conditionally render Acknowledge button */}
            {needsAcknowledgement && (
              <TouchableOpacity
                onPress={() => handleAcknowledgeThread(currentThreadId)}
                style={styles.acknowledgeButton} // Add specific style if needed
                accessibilityRole="button"
                accessibilityLabel="Acknowledge message"
              >
                <Ionicons name="checkmark-done-outline" size={24} color={Colors.light.success} />
                {/* Optionally add text */}
                {/* <ThemedText style={{color: colors.success, marginLeft: 4}}>Ack</ThemedText> */}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleMarkUnreadAction(currentThreadId)}
              accessibilityRole="button"
              accessibilityLabel="Mark as unread"
            >
              <Ionicons name="mail-unread-outline" size={24} color={themeTintColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleArchiveAction(currentThreadId)}
              accessibilityRole="button"
              accessibilityLabel="Archive conversation"
            >
              <Ionicons name="archive-outline" size={24} color={themeTintColor} />
            </TouchableOpacity>
          </View>
        </ThemedView>

        <FlatList
          data={selectedThread}
          renderItem={renderDetailItem}
          keyExtractor={(item) => item.id}
          style={styles.messageContentList}
          ListFooterComponent={
            currentFilter !== "archived" ? (
              <View
                style={[
                  styles.replyInputContainer,
                  { borderTopColor: colors.border, backgroundColor: colors.background },
                ]}
              >
                <ThemedTextInput
                  style={{
                    ...styles.replyTextInput,
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.card,
                  }}
                  placeholder="Type your reply..."
                  placeholderTextColor={colors.textDim}
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.sendButton, { backgroundColor: !replyText.trim() ? disabledColor : colors.primary }]}
                  onPress={handleSendReply}
                  disabled={!replyText.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Send reply"
                >
                  <ThemedText style={{ color: primaryContrastColor }}>Send</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null
          }
          inverted={false}
          contentContainerStyle={{ paddingBottom: 10 }}
        />
      </>
    );

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.detailsPane, !isWideScreen && styles.fullWidthPane]}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ThemedView style={{ flex: 1, backgroundColor: colors.background }}>{DetailsContent}</ThemedView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <ThemedView style={styles.container} ref={ref}>
      {renderFilters()}
      <ThemedView style={styles.contentContainer}>
        {(isWideScreen || !selectedThreadId) && (
          <View style={[styles.listPane, isWideScreen && { borderRightColor: colors.border }]}>
            {renderMessageList()}
          </View>
        )}
        {(isWideScreen || selectedThreadId) && renderMessageDetails()}
      </ThemedView>

      <ContactAdminModal visible={isNewMessageModalVisible} onClose={closeNewMessageModal} />
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  activeButton: {},
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  activeText: {},
  contentContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "transparent",
  },
  listPane: {
    width: 300,
    borderRightWidth: 1,
    backgroundColor: "transparent",
  },
  detailsPane: {
    flex: 1,
    backgroundColor: "transparent",
  },
  fullWidthPane: {
    width: "100%",
    borderRightWidth: 0,
  },
  messageListContainer: {
    flex: 1,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
  },
  emptyListText: {
    textAlign: "center",
    marginTop: 10,
  },
  threadItem: {
    padding: 15,
    borderBottomWidth: 1,
  },
  selectedThreadItem: {},
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  unreadText: {
    fontWeight: "bold",
  },
  threadMessagePreview: {
    fontSize: 14,
  },
  threadTimestamp: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyDetails: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  messageHeader: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  messageContentList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  detailMessageItem: {
    padding: 10,
    borderBottomWidth: 0,
    borderRadius: 8,
    marginBottom: 10,
    marginHorizontal: 0,
    maxWidth: "85%",
  },
  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  detailActionsContainer: {
    flexDirection: "row",
    gap: 15,
  },
  replyInputContainer: {
    borderTopWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
  },
  replyTextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 100,
  },
  sendButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 40,
  },
  acknowledgeButton: {
    padding: 5,
    borderWidth: 1,
    borderColor: Colors.light.success,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
});
