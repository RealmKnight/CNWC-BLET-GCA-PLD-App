import React, { useState, forwardRef, Ref, useEffect, useMemo, useRef, useCallback } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  FlatList,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { FontAwesome, Ionicons } from "@expo/vector-icons";

// State Management & Data
import { useAdminNotificationStore } from "@/store/adminNotificationStore";
import { useUserStore } from "@/store/userStore";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { AdminMessage } from "@/types/adminMessages";
import { supabase } from "@/utils/supabase";

// UI & Utils
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { ContactAdminModal } from "@/components/modals/ContactAdminModal";
import { DivisionSelector } from "@/components/admin/division/DivisionSelector";

interface DivisionInfo {
  id: number;
  name: string;
}

interface AdminMessagesProps {}

export const AdminMessages = forwardRef<View, AdminMessagesProps>((props, ref: Ref<View>) => {
  // State Hooks
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [currentFilter, setCurrentFilter] = useState<"all" | "unread" | "archived">("all");
  const [replyText, setReplyText] = useState("");
  const [isNewMessageModalVisible, setIsNewMessageModalVisible] = useState(false);
  const [availableDivisions, setAvailableDivisions] = useState<DivisionInfo[]>([]);
  const [divisionsLoading, setDivisionsLoading] = useState<boolean>(false);
  const [divisionsError, setDivisionsError] = useState<string | null>(null);
  const [selectedDivisionName, setSelectedDivisionName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Ref to track marked messages to prevent infinite loops
  const markedMessagesRef = useRef<Set<string>>(new Set());
  // Ref to track refresh interval
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get screen dimensions
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768;

  // Zustand Store
  const {
    messages,
    readStatusMap,
    isLoading: storeIsLoading,
    error: storeError,
    viewingDivisionId,
    markMessageAsRead,
    replyAsAdmin,
    archiveThread,
    acknowledgeMessage,
    setViewDivision,
    markThreadAsUnread,
    unarchiveThread,
    _fetchAndSetMessages,
  } = useAdminNotificationStore();

  const currentUser = useUserStore((state) => state.member);
  const effectiveRoles = useEffectiveRoles() ?? [];

  // Manual refresh function
  const refreshMessages = useCallback(async () => {
    if (!currentUser?.id) return;

    setRefreshing(true);
    try {
      console.log("[AdminMessages] Manually refreshing admin messages");
      await _fetchAndSetMessages(currentUser.id, viewingDivisionId);
    } catch (error) {
      console.error("[AdminMessages] Error refreshing messages:", error);
    } finally {
      setRefreshing(false);
    }
  }, [currentUser?.id, viewingDivisionId, _fetchAndSetMessages]);

  // Setup polling as a fallback in case realtime isn't working
  useEffect(() => {
    if (!currentUser?.id) return;

    // Clear any existing interval first
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Set up an interval to refresh data
    refreshIntervalRef.current = setInterval(() => {
      console.log("[AdminMessages] Running scheduled refresh");
      refreshMessages();
    }, 20000); // Check every 20 seconds (adjust as needed)

    // Initial refresh when component mounts
    refreshMessages();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [currentUser?.id, viewingDivisionId, refreshMessages]);

  // Determine if user can select divisions
  const canSelectDivision = useMemo(
    () =>
      effectiveRoles.includes("application_admin") ||
      effectiveRoles.includes("union_admin") ||
      effectiveRoles.includes("company_admin" as any),
    [effectiveRoles]
  );

  // Theme & Colors
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme as keyof typeof Colors];
  const themeTintColor = useThemeColor({}, "tint");
  const primaryContrastColor = colors.background;
  const selectedBackgroundColor = colors.tint + "30";
  const disabledColor = colors.icon;

  // Effect to fetch available divisions for the selector
  useEffect(() => {
    if (canSelectDivision) {
      async function fetchDivisions() {
        setDivisionsLoading(true);
        setDivisionsError(null);
        try {
          const { data, error } = await supabase
            .from("divisions")
            .select("id, name")
            .order("name", { ascending: true });

          if (error) throw error;
          const fetchedDivisions = data || [];
          setAvailableDivisions(fetchedDivisions);

          // Set initial selectedDivisionName based on viewingDivisionId from store
          if (viewingDivisionId) {
            const initialDivision = fetchedDivisions.find((d) => d.id === viewingDivisionId);
            setSelectedDivisionName(initialDivision?.name ?? null);
          } else if (fetchedDivisions.length > 0) {
            setSelectedDivisionName(null);
          }
        } catch (err: any) {
          console.error("Error fetching divisions:", err);
          setDivisionsError("Could not load divisions.");
        } finally {
          setDivisionsLoading(false);
        }
      }
      fetchDivisions();
    }
  }, [canSelectDivision, viewingDivisionId]);

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
        if (currentFilter === "archived") {
          return isArchived;
        } else {
          return !isArchived;
        }
      })
      .sort((threadA, threadB) => {
        const lastMsgA = threadA[threadA.length - 1];
        const lastMsgB = threadB[threadB.length - 1];
        return new Date(lastMsgB.created_at ?? 0).getTime() - new Date(lastMsgA.created_at ?? 0).getTime();
      });
  }, [messages, currentFilter]);

  // --- Handlers ---
  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setReplyText("");
  };

  const handleFilterChange = (filter: typeof currentFilter) => {
    setCurrentFilter(filter);
    setSelectedThreadId(null);
    setReplyText("");
  };

  const handleDivisionChange = async (divisionName: string) => {
    const nameToSet = divisionName === "" ? null : divisionName;
    setSelectedDivisionName(nameToSet);
    let divisionIdToSet: number | null = null;
    if (nameToSet) {
      const selectedDiv = availableDivisions.find((d) => d.name === nameToSet);
      divisionIdToSet = selectedDiv?.id ?? null;
      if (!selectedDiv && nameToSet !== null) console.error(`Could not find ID for division name: ${nameToSet}`);
    }
    await setViewDivision(divisionIdToSet);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThreadId || !currentUser?.id) return;
    console.log(`Attempting to send reply to thread ${selectedThreadId}...`);
    const thread = filteredThreads.find((t) => getRootMessageId(t[0]) === selectedThreadId);
    const isArchived = thread ? thread.some((msg) => msg.is_archived) : false;
    if (isArchived) {
      await unarchiveThread(selectedThreadId);
    }
    try {
      await replyAsAdmin(selectedThreadId, replyText);
      console.log(`Reply Sent to thread ${selectedThreadId}!`);
      setReplyText("");
      // Force refresh after sending a reply
      setTimeout(refreshMessages, 1000);
    } catch (error: any) {
      console.error("Failed to send reply:", error);
    }
  };

  const handleArchiveAction = (threadId: string | null) => {
    if (!threadId) return;
    console.log(`Archiving thread ${threadId}`);
    archiveThread(threadId).catch((err: any) => {
      console.error(`Failed to archive thread ${threadId}:`, err);
    });
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
    // Force refresh after archiving
    setTimeout(refreshMessages, 1000);
  };

  const handleMarkUnreadAction = (threadId: string | null) => {
    if (!threadId) return;
    console.log(`Marking thread ${threadId} as unread.`);
    markThreadAsUnread(threadId).catch((err: Error) => {
      console.error(`Failed to mark thread ${threadId} as unread:`, err);
    });
  };

  const handleAcknowledgeThread = (threadId: string | null) => {
    if (!threadId || !currentUser?.id) return;
    const thread = filteredThreads.find((t) => getRootMessageId(t[0]) === threadId);
    if (thread && thread.length > 0) {
      const latestMessage = thread[thread.length - 1];
      if (
        latestMessage.requires_acknowledgment &&
        !(Array.isArray(latestMessage.acknowledged_by) && latestMessage.acknowledged_by.includes(currentUser.id))
      ) {
        console.log(`Acknowledging message ${latestMessage.id}`);
        acknowledgeMessage(latestMessage.id, currentUser.id).catch((err: any) => {
          console.error(`Failed to acknowledge message ${latestMessage.id}:`, err);
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

      {canSelectDivision && (
        <View style={styles.divisionSelectorWrapper}>
          <DivisionSelector
            currentDivision={selectedDivisionName ?? ""}
            onDivisionChange={handleDivisionChange}
            isAdmin={true}
            disabled={storeIsLoading}
          />
        </View>
      )}

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

  const renderThreadItem = ({ item: thread }: { item: AdminMessage[] }) => {
    if (!thread || thread.length === 0) return null;

    thread.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    const latestMessage = thread[0];
    const rootMessage = thread.find((msg) => !msg.parent_message_id) || latestMessage;
    const rootId = getRootMessageId(rootMessage);
    const isSelected = selectedThreadId === rootId;
    const latestMessageDate = latestMessage.created_at ? new Date(latestMessage.created_at) : new Date();

    const isUnread = !readStatusMap[latestMessage.id];

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
          <ThemedText type={isUnread ? "defaultSemiBold" : "default"} style={isUnread ? styles.unreadText : {}}>
            {rootMessage.subject || "(No Subject)"}
          </ThemedText>
        </View>
        <ThemedText numberOfLines={1} style={[styles.threadMessagePreview, { color: colors.textDim }]}>
          {latestMessage.sender_role}: {latestMessage.message}
        </ThemedText>
        <ThemedText style={[styles.threadTimestamp, { color: colors.textDim }]}>
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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshMessages}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      ListEmptyComponent={
        storeIsLoading ? (
          <ActivityIndicator style={{ marginTop: 50 }} size="large" color={colors.tint} />
        ) : storeError ? (
          <View style={styles.emptyListContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
            <ThemedText style={[styles.emptyListText, { color: colors.error }]}>
              Error loading messages: {storeError}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.emptyListContainer}>
            <Ionicons name="mail-outline" size={48} color={colors.textDim} />
            <ThemedText style={[styles.emptyListText, { color: colors.textDim }]}>No messages found.</ThemedText>
          </View>
        )
      }
      extraData={selectedThreadId}
    />
  );

  const renderMessageDetails = () => {
    const currentThreadId = selectedThreadId;
    const selectedThread = currentThreadId
      ? filteredThreads.find((t) => getRootMessageId(t[0]) === currentThreadId)
      : null;

    useEffect(() => {
      console.log(
        `[renderMessageDetails] useEffect triggered. Thread ID: ${currentThreadId}, Thread length: ${
          selectedThread?.length || 0
        }`
      );
      if (selectedThread && selectedThread.length > 0) {
        const latestMessage = selectedThread.reduce((latest, current) =>
          new Date(current.created_at ?? 0) > new Date(latest.created_at ?? 0) ? current : latest
        );

        // Check if already marked in this session or already read in the store
        const isAlreadyMarked = markedMessagesRef.current.has(latestMessage.id) || readStatusMap[latestMessage.id];

        console.log(
          `[renderMessageDetails] Found latest message: ${latestMessage.id}, from: ${
            latestMessage.sender_role
          }, created: ${latestMessage.created_at}, read: ${
            readStatusMap[latestMessage.id] ? "yes" : "no"
          }, marked in session: ${markedMessagesRef.current.has(latestMessage.id)}`
        );

        // Only mark as read if not already read and not already marked in this session
        if (!isAlreadyMarked) {
          // Add to our ref to prevent re-marking
          markedMessagesRef.current.add(latestMessage.id);

          console.log(
            `[renderMessageDetails] Viewing thread ${currentThreadId}, marking latest message ${latestMessage.id} as read.`
          );
          markMessageAsRead(latestMessage.id).catch((err: any) => {
            console.error("Failed to mark message as read on view:", err);
          });
        } else {
          console.log(
            `[renderMessageDetails] Message ${latestMessage.id} already marked as read or marked in this session. Skipping.`
          );
        }
      } else {
        console.log(`[renderMessageDetails] No messages in thread to mark as read.`);
      }
    }, [currentThreadId, selectedThread, markMessageAsRead]);

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

    const latestMessage = selectedThread[selectedThread.length - 1];
    const needsAcknowledgement =
      latestMessage.requires_acknowledgment &&
      !(
        currentUser?.id &&
        Array.isArray(latestMessage.acknowledged_by) &&
        latestMessage.acknowledged_by.includes(currentUser.id)
      );

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
            {needsAcknowledgement && (
              <TouchableOpacity
                onPress={() => handleAcknowledgeThread(currentThreadId)}
                style={styles.acknowledgeButton}
                accessibilityRole="button"
                accessibilityLabel="Acknowledge message"
              >
                <Ionicons name="checkmark-done-outline" size={24} color={Colors.light.success} />
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

        {/* Reply Input (moved above the FlatList) */}
        <View
          style={[
            styles.replyInputContainer,
            {
              padding: 10,
              flexDirection: "row",
              alignItems: "center",
              minHeight: 60,
              borderTopWidth: 1,
            },
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

        {/* Message content FlatList */}
        <FlatList
          data={selectedThread}
          renderItem={renderDetailItem}
          keyExtractor={(item) => item.id}
          style={styles.messageContentList}
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
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  activeButton: {
    borderColor: Colors.light.primary,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  activeText: {
    // Example: fontWeight: "bold",
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
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    alignSelf: "center",
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
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 60,
    borderTopWidth: 1,
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
  divisionSelectorWrapper: {
    marginLeft: 10,
    zIndex: 10,
  },
});
