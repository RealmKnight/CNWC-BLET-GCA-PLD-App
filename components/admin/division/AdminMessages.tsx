import React, { useState, forwardRef, Ref } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ScrollView } from "react-native-gesture-handler";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "../../../hooks/useThemeColor";

interface AdminMessage {
  id: string;
  subject: string;
  content: string;
  sender: {
    id: string;
    name: string;
    role: string;
  };
  createdAt: string;
  isRead: boolean;
  requiresResponse: boolean;
}

export const AdminMessages = forwardRef<View, {}>((props, ref: Ref<View>) => {
  const [selectedMessage, setSelectedMessage] = useState<AdminMessage | null>(null);
  const [currentFilter, setCurrentFilter] = useState<"all" | "urgent">("all");
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const themeTintColor = useThemeColor({}, "tint");

  const renderFilters = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={[styles.actionButton, currentFilter === "all" && styles.activeButton]}
        onPress={() => setCurrentFilter("all")}
      >
        <Ionicons name="mail-outline" size={24} color={currentFilter === "all" ? "#000000" : themeTintColor} />
        <ThemedText style={[styles.buttonText, currentFilter === "all" && styles.activeText]}>All Messages</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionButton, currentFilter === "urgent" && styles.activeButton]}
        onPress={() => setCurrentFilter("urgent")}
      >
        <Ionicons
          name="alert-circle-outline"
          size={24}
          color={currentFilter === "urgent" ? "#000000" : themeTintColor}
        />
        <ThemedText style={[styles.buttonText, currentFilter === "urgent" && styles.activeText]}>
          Urgent Only
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const renderMessageList = () => (
    <ScrollView style={styles.messageList}>
      {/* TODO: Implement message list */}
      <ThemedText>Message list will go here</ThemedText>
    </ScrollView>
  );

  const renderMessageDetails = () => {
    if (!selectedMessage) {
      return (
        <ThemedView style={styles.emptyDetails}>
          <ThemedText>Select a message to view its details</ThemedText>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.messageDetails}>
        <ThemedView style={styles.messageHeader}>
          <ThemedText type="subtitle">{selectedMessage.subject}</ThemedText>
          <ThemedView style={styles.messageMetadata}>
            <ThemedText style={styles.metadataText}>From: {selectedMessage.sender.name}</ThemedText>
            <ThemedText style={styles.metadataText}>Role: {selectedMessage.sender.role}</ThemedText>
            <ThemedText style={styles.metadataText}>Date: {selectedMessage.createdAt}</ThemedText>
          </ThemedView>
        </ThemedView>

        <ScrollView style={styles.messageContent}>
          <ThemedText>{selectedMessage.content}</ThemedText>
        </ScrollView>

        {selectedMessage.requiresResponse && (
          <TouchableOpacity style={styles.replyButton}>
            <FontAwesome name="reply" size={20} color="#fff" />
            <ThemedText style={styles.replyButtonText}>Reply</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container} ref={ref}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Admin Messages</ThemedText>
      </ThemedView>
      {renderFilters()}
      <ThemedView style={styles.content}>
        {renderMessageList()}
        {renderMessageDetails()}
      </ThemedView>
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  activeButton: {
    backgroundColor: "#FFD700",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  activeText: {
    color: "#000000",
  },
  content: {
    flex: 1,
  },
  messageList: {
    width: 300,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 16,
  },
  messageDetails: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
  },
  emptyDetails: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  messageHeader: {
    marginBottom: 16,
  },
  messageMetadata: {
    marginTop: 8,
    gap: 4,
  },
  metadataText: {
    fontSize: 14,
    color: "#666",
  },
  messageContent: {
    flex: 1,
    marginBottom: 16,
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.tint,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  replyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
