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
import { Ionicons } from "@expo/vector-icons";

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

// Props interface
interface AdminMessageSectionProps {}

// Define filter state shape
interface FilterState {
  status: "all" | "unread" | "archived" | "requires_ack";
  recipientRole: string | null; // e.g., 'division_admin', 'union_admin', null for all
}

// Placeholder for available roles company admin can filter by
const FILTERABLE_ADMIN_ROLES = [
  { label: "Division Admin", value: "division_admin" },
  { label: "Union Support", value: "union_admin" },
  { label: "Application Support", value: "application_admin" },
  // Add 'company_admin' if they can receive direct messages?
];

// Company Admin Message Viewing/Management Component
export function AdminMessageSection(props: AdminMessageSectionProps) {
  // State Hooks
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<FilterState>({ status: "all", recipientRole: null });
  const [replyText, setReplyText] = useState("");
  const [isNewMessageModalVisible, setIsNewMessageModalVisible] = useState(false);

  // Responsive Layout Hook
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768;

  // Zustand Store
  const {
    messages,
    readStatusMap,
    markMessageAsRead,
    archiveThread,
    replyAsAdmin,
    markThreadAsUnread,
    acknowledgeMessage,
    isLoading,
    error,
  } = useAdminNotificationStore();

  // User & Roles
  const currentUser = useUserStore((state) => state.member);
  const effectiveRoles = useEffectiveRoles() ?? [];
  const isCompanyAdmin = effectiveRoles.includes("company_admin");

  // Theme & Colors
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme as keyof typeof Colors];
  const themeTintColor = useThemeColor({}, "tint");
  const primaryContrastColor = colors.background;
  const selectedBackgroundColor = colors.tint + "30";
  const disabledColor = colors.icon;

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

        const rootMessage = thread[0];
        const latestMessage = thread[thread.length - 1];
        const isArchived = thread.some((msg) => msg.is_archived);

        if (filterState.recipientRole && !rootMessage.recipient_roles?.includes(filterState.recipientRole)) {
          return false;
        }

        const needsAdminAck =
          latestMessage.requires_acknowledgment &&
          !(currentUser?.id && latestMessage.acknowledged_by?.includes(currentUser.id));

        switch (filterState.status) {
          case "archived":
            return isArchived;
          case "requires_ack":
            return !isArchived && needsAdminAck;
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
  }, [messages, filterState, currentUser?.id]);

  // --- Handlers ---
  const handleSelectThread = (threadId: string) => {
    let foundThread: AdminMessage[] | undefined;
    try {
      foundThread = filteredThreads.find((t: AdminMessage[], index: number) => {
        if (!t || t.length === 0) return false;
        const rootId = getRootMessageId(t[0]);
        return rootId === threadId;
      });
    } catch (e: any) {
      console.error("[AdminMessageSection] Error during filteredThreads.find():", e);
      foundThread = undefined;
    }

    const thread = foundThread;

    if (thread && thread.length > 0) {
      try {
        thread.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      } catch (e: any) {}

      const latestMessage = thread[0];
      if (latestMessage?.id) {
        markMessageAsRead(latestMessage.id).catch((err: Error) => {
          console.error("Failed to mark thread as read:", err);
        });
      } else {
        console.warn("[AdminMessageSection] Could not find latest message ID to mark as read.");
      }
    } else {
    }

    setSelectedThreadId(threadId);
    setReplyText("");
  };

  const updateFilter = (part: Partial<FilterState>) => {
    setFilterState((prev) => ({ ...prev, ...part }));
    setSelectedThreadId(null);
    setReplyText("");
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThreadId || !currentUser?.id) return;
    console.log(`Attempting to send reply to thread ${selectedThreadId}...`);
    try {
      await replyAsAdmin(selectedThreadId, replyText);
      console.log(`Reply Sent to thread ${selectedThreadId}!`);
      setReplyText("");
    } catch (error: any) {
      console.error("Failed to send reply:", error);
      // TODO: Show error feedback
    }
  };

  const handleArchiveAction = (threadId: string | null) => {
    if (!threadId) return;
    console.log(`Calling archiveThread for thread ${threadId} (Admin context)`);
    archiveThread(threadId).catch((err: Error) => {
      console.error("Failed to archive thread:", err);
      // TODO: Show error feedback
    });
    if (selectedThreadId === threadId) setSelectedThreadId(null);
  };

  const handleMarkUnreadAction = (threadId: string | null) => {
    if (!threadId) return;
    markThreadAsUnread(threadId).catch((err: Error) => {
      console.error("Failed to mark thread as unread:", err);
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
        console.log(`Acknowledging message ${latestMessage.id} (Admin context)`);
        acknowledgeMessage(latestMessage.id, currentUser.id).catch((err: Error) => {
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
      {/* Status Filters */}
      <View style={styles.filterGroup}>
        <ThemedText style={styles.filterGroupLabel}>Status:</ThemedText>
        <TouchableOpacity
          onPress={() => updateFilter({ status: "all" })}
          style={[
            styles.filterButton,
            {
              borderColor: colors.border,
              backgroundColor: filterState.status === "all" ? colors.primary : colors.background,
            },
            filterState.status === "all" && styles.activeFilterButton,
          ]}
        >
          <ThemedText
            style={[
              styles.filterButtonText,
              { color: filterState.status === "all" ? primaryContrastColor : themeTintColor },
              filterState.status === "all" && styles.activeFilterText,
            ]}
          >
            All
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => updateFilter({ status: "requires_ack" })}
          style={[
            styles.filterButton,
            {
              borderColor: colors.border,
              backgroundColor: filterState.status === "requires_ack" ? colors.primary : colors.background,
            },
            filterState.status === "requires_ack" && styles.activeFilterButton,
          ]}
        >
          <ThemedText
            style={[
              styles.filterButtonText,
              { color: filterState.status === "requires_ack" ? primaryContrastColor : themeTintColor },
              filterState.status === "requires_ack" && styles.activeFilterText,
            ]}
          >
            Needs Ack
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => updateFilter({ status: "archived" })}
          style={[
            styles.filterButton,
            {
              borderColor: colors.border,
              backgroundColor: filterState.status === "archived" ? colors.primary : colors.background,
            },
            filterState.status === "archived" && styles.activeFilterButton,
          ]}
        >
          <ThemedText
            style={[
              styles.filterButtonText,
              { color: filterState.status === "archived" ? primaryContrastColor : themeTintColor },
              filterState.status === "archived" && styles.activeFilterText,
            ]}
          >
            Archived
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Recipient Role Filter */}
      <View style={styles.filterGroup}>
        <ThemedText style={styles.filterGroupLabel}>Recipient Role:</ThemedText>
        <TouchableOpacity
          onPress={() => updateFilter({ recipientRole: null })}
          style={[
            styles.filterButton,
            {
              borderColor: colors.border,
              backgroundColor: filterState.recipientRole === null ? colors.primary : colors.background,
            },
            filterState.recipientRole === null && styles.activeFilterButton,
          ]}
        >
          <ThemedText
            style={[
              styles.filterButtonText,
              { color: filterState.recipientRole === null ? primaryContrastColor : themeTintColor },
              filterState.recipientRole === null && styles.activeFilterText,
            ]}
          >
            All Roles
          </ThemedText>
        </TouchableOpacity>
        {FILTERABLE_ADMIN_ROLES.map((role) => (
          <TouchableOpacity
            key={role.value}
            onPress={() => updateFilter({ recipientRole: role.value })}
            style={[
              styles.filterButton,
              {
                borderColor: colors.border,
                backgroundColor: filterState.recipientRole === role.value ? colors.primary : colors.background,
              },
              filterState.recipientRole === role.value && styles.activeFilterButton,
            ]}
          >
            <ThemedText
              style={[
                styles.filterButtonText,
                { color: filterState.recipientRole === role.value ? primaryContrastColor : themeTintColor },
                filterState.recipientRole === role.value && styles.activeFilterText,
              ]}
            >
              {role.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* New Message Button (Positioned last or adjust layout) */}
      <TouchableOpacity
        style={[
          styles.filterButton,
          { marginLeft: "auto", borderColor: colors.primary, backgroundColor: colors.background },
        ]}
        onPress={openNewMessageModal}
        accessibilityRole="button"
        accessibilityLabel="Compose new message"
      >
        <Ionicons name="create-outline" size={18} color={colors.primary} />
        <ThemedText style={[styles.filterButtonText, { color: colors.primary, marginLeft: 5 }]}>New Message</ThemedText>
      </TouchableOpacity>
    </View>
  );

  // Adapt renderThreadItem with styling from AdminMessages
  const renderThreadItem = ({ item: thread }: { item: AdminMessage[] }) => {
    // Ensure thread is not empty before accessing elements
    if (!thread || thread.length === 0) return null;

    // Sort within the item render to ensure latest message is first
    thread.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    const latestMessage = thread[0]; // Latest message is now at index 0
    const rootMessage = thread.find((msg) => !msg.parent_message_id) || latestMessage; // Find root or fallback to latest
    const rootId = getRootMessageId(rootMessage);
    const isSelected = selectedThreadId === rootId;
    const recipientRolesText = rootMessage.recipient_roles?.join(", ") || "N/A";

    // Check read status using the map from the store
    const isUnread = !readStatusMap[latestMessage.id];

    return (
      <TouchableOpacity
        onPress={() => handleSelectThread(rootId)}
        style={[
          styles.threadItem,
          isSelected && { backgroundColor: selectedBackgroundColor },
          { borderBottomColor: colors.border },
        ]}
        accessibilityLabel={`Conversation: ${
          rootMessage.subject || "(No Subject)"
        }, To: ${recipientRolesText}. Status: ${isUnread ? "Unread" : "Read"}`}
      >
        {/* Row for Subject and Unread Dot */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
            {/* Add unread dot indicator */}
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
            <ThemedText
              type={isUnread ? "defaultSemiBold" : "default"}
              style={isUnread ? styles.unreadText : {}}
              numberOfLines={1}
            >
              {rootMessage.subject || "(No Subject)"}
            </ThemedText>
          </View>
          {/* Removed original unread dot position */}
        </View>
        {/* Recipient Roles */}
        <ThemedText numberOfLines={1} style={[styles.threadMetaText, { color: colors.textDim }]}>
          To: {recipientRolesText}
        </ThemedText>
        {/* Last Message Sender */}
        <ThemedText numberOfLines={1} style={[styles.threadMetaText, { color: colors.textDim }]}>
          Last from: {latestMessage.sender_role} {/* TODO: Add Name? */}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  const renderMessageList = () => {
    // Display loading indicator
    if (isLoading && messages.length === 0) {
      return (
        <View
          style={[
            styles.messageListContainer,
            styles.centeredStatus,
            !isWideScreen && styles.fullWidthPane,
            { backgroundColor: colors.card },
          ]}
        >
          <ThemedText>Loading messages...</ThemedText>
          {/* Consider adding an ActivityIndicator */}
        </View>
      );
    }
    // Display error message
    if (error && messages.length === 0) {
      return (
        <View
          style={[
            styles.messageListContainer,
            styles.centeredStatus,
            !isWideScreen && styles.fullWidthPane,
            { backgroundColor: colors.card },
          ]}
        >
          <ThemedText style={{ color: colors.error }}>Error: {error}</ThemedText>
        </View>
      );
    }

    return (
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
  };

  // Refine Message Details view
  const renderMessageDetails = () => {
    const currentThreadId = selectedThreadId;
    const selectedThread = currentThreadId
      ? filteredThreads.find((t) => getRootMessageId(t[0]) === currentThreadId)
      : null;

    if (!isWideScreen && !selectedThread) return null;
    if (!selectedThread) {
      return (
        <ThemedView style={[styles.detailsPane, styles.emptyDetails, { backgroundColor: colors.background }]}>
          {/* Add Icon for empty state */}
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

    // Detail item rendering logic with sender differentiation
    const renderDetailItem = ({ item }: { item: AdminMessage }) => {
      const messageDate = item.created_at ? new Date(item.created_at) : new Date();
      // Check if the sender is the current user AND acting as company admin for this message
      const isCurrentUserSender = item.sender_user_id === currentUser?.id && item.sender_role === "company_admin";

      return (
        <View
          key={item.id}
          style={[
            styles.detailMessageItem,
            // Apply distinct background and alignment based on sender
            isCurrentUserSender
              ? { alignSelf: "flex-end", backgroundColor: colors.primary + "30" } // Sent by current admin
              : { alignSelf: "flex-start", backgroundColor: colors.card }, // Received
          ]}
          accessibilityLabel={`Message from ${item.sender_role} at ${messageDate.toLocaleString()}: ${item.message}`}
        >
          <View style={styles.senderInfo}>
            {/* Use themed colors for avatar placeholder */}
            <View
              style={[styles.senderAvatar, { backgroundColor: isCurrentUserSender ? colors.primary : colors.icon }]}
            />
            <ThemedText type="defaultSemiBold">
              {item.sender_role} {isCurrentUserSender ? "(You)" : ""} {/* TODO: Fetch sender name */}
            </ThemedText>
          </View>
          <ThemedText style={[styles.messageTimestamp, { color: colors.textDim }]}>
            {messageDate.toLocaleString()}
          </ThemedText>
          <ThemedText style={styles.messageText}>{item.message}</ThemedText>
        </View>
      );
    };

    const rootSubject = selectedThread[0].subject || "(No Subject)";
    // Display recipient roles clearly
    const recipientRolesText = selectedThread[0].recipient_roles?.join(", ") || "N/A";

    const DetailsContent = (
      <>
        {/* Header: Include Recipient Roles */}
        <ThemedView style={[styles.messageHeader, { borderBottomColor: colors.border }]}>
          {/* Container for Back button (if needed) and Title/Recipients */}
          <View style={styles.messageHeaderContent}>
            {!isWideScreen && (
              <TouchableOpacity onPress={() => setSelectedThreadId(null)} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={themeTintColor} />
              </TouchableOpacity>
            )}
            <View style={{ flexShrink: 1 }}>
              <ThemedText type="subtitle" numberOfLines={1}>
                {rootSubject}
              </ThemedText>
              <ThemedText style={[styles.recipientHeaderText, { color: colors.textDim }]}>
                To: {recipientRolesText}
              </ThemedText>
            </View>
          </View>
          {/* Actions remain on the right */}
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
                {/* <ThemedText style={{color: Colors.light.success, marginLeft: 4}}>Ack</ThemedText> */}
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

        {/* Message List in Detail View */}
        <FlatList
          data={selectedThread} // Already sorted chronologically
          renderItem={renderDetailItem}
          keyExtractor={(item) => item.id}
          style={styles.messageContentList}
          inverted={false} // Render top-down
          contentContainerStyle={{ paddingVertical: 10 }} // Add vertical padding
          ListFooterComponent={
            // Themed Reply Input Area
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
                placeholder="Reply as Company Admin..."
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
          }
        />
      </>
    );

    // KeyboardAvoidingView wrapper remains the same
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.detailsPane, !isWideScreen && styles.fullWidthPane]}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0} // Adjust offset as needed
      >
        <ThemedView style={{ flex: 1, backgroundColor: colors.background }}>{DetailsContent}</ThemedView>
      </KeyboardAvoidingView>
    );
  };

  // --- Final Return ---
  // Check if user is company admin before rendering the main view
  if (!isCompanyAdmin) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Access Denied. You are not a Company Admin.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderFilters()}
      <ThemedView style={styles.contentContainer}>
        {(isWideScreen || !selectedThreadId) && (
          <View style={[styles.listPane, isWideScreen && { borderRightColor: colors.border }]}>
            {renderMessageList()}
          </View>
        )}
        {(isWideScreen || selectedThreadId) && renderMessageDetails()}
      </ThemedView>

      {/* Render the ContactAdminModal */}
      <ContactAdminModal
        visible={isNewMessageModalVisible}
        onClose={closeNewMessageModal}
        // We could potentially pre-filter availableRecipientRoles here for company admin if needed
      />
    </ThemedView>
  );
}

// --- Styles (Use similar styles as AdminMessages initially, adapt as needed) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterContainer: {
    flexDirection: Platform.OS === "web" ? "row" : "column", // Stack filters on mobile
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
    alignItems: Platform.OS === "web" ? "center" : "stretch",
    // borderBottomColor applied inline
  },
  filterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  filterGroupLabel: {
    fontWeight: "600",
    marginRight: 5,
    fontSize: 14,
    // color applied inline
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row", // Ensure icon and text are in a row for the new message button
    alignItems: "center", // Center icon and text vertically
    // Apply themed border/background inline
  },
  activeFilterButton: {
    // Handled mostly by inline background color change
  },
  filterButtonText: {
    fontSize: 13,
    // Apply themed color inline
  },
  activeFilterText: {
    fontWeight: "bold",
    // Apply themed active color inline
  },
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
  centeredStatus: {
    // Style for centering loading/error messages in the list pane
    justifyContent: "center",
    alignItems: "center",
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 50,
    paddingHorizontal: 20, // Add padding
  },
  emptyListText: {
    textAlign: "center",
    marginTop: 10,
  },
  threadItem: {
    padding: 15,
    borderBottomWidth: 1,
    // borderBottomColor & selected background applied inline
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
  messageHeaderContent: {
    // Container for back button and title/recipients
    flexDirection: "row",
    alignItems: "center",
    flex: 1, // Allow shrinking/growing
    marginRight: 10, // Space before actions
  },
  backButton: {
    marginRight: 10,
    padding: 5, // Easier tap target
  },
  recipientHeaderText: {
    fontSize: 12,
    marginTop: 2,
  },
  messageContentList: {
    flex: 1,
    // padding applied via contentContainerStyle
  },
  detailMessageItem: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    marginHorizontal: 10,
    maxWidth: "85%",
    // Background/alignment applied inline
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
    // backgroundColor applied inline
  },
  messageTimestamp: {
    // Style for the timestamp within a message bubble
    fontSize: 11,
    marginTop: 4,
    marginBottom: 4,
    // color applied inline
  },
  messageText: {
    // Style for the main message content
    fontSize: 15,
    lineHeight: 21, // Improve readability
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
    // background/border applied inline
  },
  replyTextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingTop: 10, // Adjust padding for multiline
    paddingBottom: 10,
    fontSize: 16,
    marginRight: 10,
    maxHeight: 120, // Allow slightly more height
    // Themed styles applied inline
  },
  sendButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 40,
    // Themed background applied inline
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    alignSelf: "center", // Center dot vertically
  },
  unreadText: {
    fontWeight: "bold",
  },
  threadMetaText: {
    // Style for meta info like To: and Last From:
    fontSize: 13,
    marginTop: 4,
    // color applied inline
  },
  // Add acknowledgeButton style
  acknowledgeButton: {
    padding: 5,
    borderWidth: 1,
    borderColor: Colors.light.success, // Use theme success color
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  // Add styles from AdminMessages if needed (e.g., senderInfo, senderAvatar, active*)
});
