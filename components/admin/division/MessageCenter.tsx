import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacity, ScrollView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TextInput } from "react-native";

interface Member {
  id: string;
  firstName: string;
  lastName: string;
}

interface MessageDraft {
  subject: string;
  content: string;
  recipients: string[]; // Member IDs
  isUrgent: boolean;
}

export function MessageCenter() {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState<MessageDraft>({
    subject: "",
    content: "",
    recipients: [],
    isUrgent: false,
  });
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  const handleSelectAll = () => {
    // TODO: Implement select all members
  };

  const handleSendMessage = () => {
    // TODO: Implement message sending
  };

  const renderRecipientSelector = () => (
    <ThemedView style={styles.recipientSelector}>
      <ThemedView style={styles.selectorHeader}>
        <ThemedText type="subtitle">Recipients</ThemedText>
        <TouchableOpacity style={styles.selectAllButton} onPress={handleSelectAll}>
          <ThemedText style={{ color: tintColor }}>Select All</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ScrollView style={styles.memberList}>
        {/* TODO: Implement member list with checkboxes */}
        <ThemedText>Member list will go here</ThemedText>
      </ScrollView>
    </ThemedView>
  );

  const renderMessageComposer = () => (
    <ThemedView style={styles.messageComposer}>
      <ThemedView style={styles.composerHeader}>
        <TextInput
          style={styles.subjectInput}
          placeholder="Subject"
          value={messageDraft.subject}
          onChangeText={(text) => setMessageDraft({ ...messageDraft, subject: text })}
          placeholderTextColor={Colors[colorScheme].text}
        />
        <TouchableOpacity
          style={[styles.urgentToggle, messageDraft.isUrgent && styles.urgentActive]}
          onPress={() => setMessageDraft({ ...messageDraft, isUrgent: !messageDraft.isUrgent })}
        >
          <Ionicons name="warning" size={20} color={messageDraft.isUrgent ? "#fff" : Colors[colorScheme].text} />
          <ThemedText style={[styles.urgentText, messageDraft.isUrgent && styles.urgentActiveText]}>Urgent</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <TextInput
        style={styles.contentInput}
        placeholder="Type your message here..."
        value={messageDraft.content}
        onChangeText={(text) => setMessageDraft({ ...messageDraft, content: text })}
        multiline
        textAlignVertical="top"
        placeholderTextColor={Colors[colorScheme].text}
      />

      <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
        <Ionicons name="send" size={20} color="#fff" />
        <ThemedText style={styles.sendButtonText}>Send Message</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Message Center</ThemedText>
      </ThemedView>
      <ThemedView style={styles.content}>
        {renderRecipientSelector()}
        {renderMessageComposer()}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: 24,
  },
  recipientSelector: {
    width: 300,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 16,
  },
  selectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  selectAllButton: {
    padding: 8,
  },
  memberList: {
    flex: 1,
  },
  messageComposer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
  },
  composerHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  subjectInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: Colors.light.text,
  },
  urgentToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  urgentActive: {
    backgroundColor: "#ff4444",
    borderColor: "#ff4444",
  },
  urgentText: {
    fontSize: 14,
  },
  urgentActiveText: {
    color: "#fff",
  },
  contentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    color: Colors.light.text,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.tint,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  activeText: {
    color: "#000000",
  },
});
