import React, { useState, useEffect } from "react";
import { StyleSheet, Alert, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TextInput } from "react-native";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { sendMessageWithNotification } from "@/utils/notificationService";
import { RecipientSelector } from "./RecipientSelector";

interface Member {
  pin_number: number;
  first_name: string;
  last_name: string;
  division: string;
  deleted?: boolean;
  division_id: number;
}

interface MessageDraft {
  subject: string;
  content: string;
  recipients: number[]; // Changed from string[] to number[] for PIN numbers
  requiresAcknowledgment: boolean;
}

export function MessageCenter() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [messageDraft, setMessageDraft] = useState<MessageDraft>({
    subject: "",
    content: "",
    recipients: [],
    requiresAcknowledgment: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { user } = useAuth();
  const [isRecipientSelectorOpen, setIsRecipientSelectorOpen] = useState(false);

  // Fetch members
  useEffect(() => {
    async function fetchMembers() {
      try {
        console.log("Fetching members...");

        // First fetch all divisions to create a lookup map
        const { data: divisionsData, error: divisionsError } = await supabase.from("divisions").select("id, name");

        if (divisionsError) {
          console.error("Error fetching divisions:", divisionsError);
          throw divisionsError;
        }

        const divisionMap = new Map(divisionsData.map((div) => [div.id, div.name]));

        // Then fetch members
        const { data: membersData, error: membersError } = await supabase
          .from("members")
          .select("pin_number, first_name, last_name, division_id, deleted")
          .eq("deleted", false)
          .order("last_name", { ascending: true });

        if (membersError) {
          console.error("Error fetching members:", membersError);
          throw membersError;
        }

        // Transform and validate the data
        const validMembers = (membersData || [])
          .filter(
            (
              member
            ): member is NonNullable<typeof member> & {
              pin_number: number;
              first_name: string;
              last_name: string;
              division_id: number;
            } =>
              !!member &&
              typeof member.pin_number === "number" &&
              typeof member.first_name === "string" &&
              member.first_name !== null &&
              typeof member.last_name === "string" &&
              member.last_name !== null &&
              typeof member.division_id === "number" &&
              member.division_id !== null &&
              divisionMap.has(member.division_id)
          )
          .map((member) => ({
            pin_number: member.pin_number,
            first_name: member.first_name,
            last_name: member.last_name,
            division: divisionMap.get(member.division_id) || "Unknown",
            division_id: member.division_id,
            deleted: !!member.deleted,
          }));

        console.log(`Found ${validMembers.length} valid members`);
        setMembers(validMembers);
      } catch (error) {
        console.error("Error in fetchMembers:", error);
        Alert.alert("Error", "Failed to load members");
      }
    }

    fetchMembers();
  }, []);

  const handleSendMessage = async () => {
    if (!user) {
      Alert.alert("Error", "You must be logged in to send messages");
      return;
    }

    if (!messageDraft.subject.trim()) {
      Alert.alert("Error", "Please enter a subject");
      return;
    }

    if (!messageDraft.content.trim()) {
      Alert.alert("Error", "Please enter a message");
      return;
    }

    if (messageDraft.recipients.length === 0) {
      Alert.alert("Error", "Please select at least one recipient");
      return;
    }

    setIsLoading(true);

    try {
      // Get sender's member details
      const { data: senderData, error: senderError } = await supabase
        .from("members")
        .select("pin_number")
        .eq("id", user.id)
        .single();

      if (senderError) {
        console.error("Error fetching sender details:", senderError);
        throw new Error("Could not find sender's member record");
      }

      if (!senderData?.pin_number) {
        throw new Error("Sender PIN not found");
      }

      // Send notifications to all selected recipients
      await sendMessageWithNotification(
        senderData.pin_number,
        messageDraft.recipients,
        messageDraft.subject,
        messageDraft.content,
        messageDraft.requiresAcknowledgment,
        messageDraft.requiresAcknowledgment ? "must_read" : "direct_message"
      );

      // Reset form
      setMessageDraft({
        subject: "",
        content: "",
        recipients: [],
        requiresAcknowledgment: false,
      });
      setSelectedMembers([]);

      Alert.alert(
        "Success",
        `Message sent to ${messageDraft.recipients.length} recipient${messageDraft.recipients.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      console.error("Error sending messages:", error);
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send messages");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMembers = (pins: number[]) => {
    setSelectedMembers(pins);
    setMessageDraft((prev) => ({ ...prev, recipients: pins }));
  };

  const handleSelectDivisions = (divisions: string[]) => {
    setSelectedDivisions(divisions);
  };

  const openRecipientSelector = () => {
    setIsRecipientSelectorOpen(true);
  };

  const closeRecipientSelector = () => {
    setIsRecipientSelectorOpen(false);
  };

  const renderMessageComposer = () => (
    <ThemedView style={styles.messageComposer}>
      <ThemedView style={styles.composerHeader}>
        <TextInput
          style={[styles.subjectInput, { color: Colors[colorScheme].text }]}
          placeholder="Subject"
          value={messageDraft.subject}
          onChangeText={(text) => setMessageDraft({ ...messageDraft, subject: text })}
          placeholderTextColor={Colors[colorScheme].textDim}
        />
        <TouchableOpacityComponent
          style={[styles.urgentToggle, messageDraft.requiresAcknowledgment && styles.urgentActive]}
          onPress={() =>
            setMessageDraft({ ...messageDraft, requiresAcknowledgment: !messageDraft.requiresAcknowledgment })
          }
        >
          <Ionicons
            name="alert-circle"
            size={20}
            color={messageDraft.requiresAcknowledgment ? "#fff" : Colors[colorScheme].text}
          />
          <ThemedText style={[styles.urgentText, messageDraft.requiresAcknowledgment && styles.urgentActiveText]}>
            Must Read
          </ThemedText>
        </TouchableOpacityComponent>
      </ThemedView>

      <TouchableOpacityComponent style={styles.recipientButton} onPress={openRecipientSelector}>
        <Ionicons name="people" size={20} color={tintColor} />
        <ThemedText style={styles.recipientButtonText}>
          {selectedMembers.length > 0
            ? `${selectedMembers.length} Recipient${selectedMembers.length === 1 ? "" : "s"} Selected`
            : "Select Recipients"}
        </ThemedText>
      </TouchableOpacityComponent>

      <TextInput
        style={[styles.contentInput, { color: Colors[colorScheme].text }]}
        placeholder="Type your message here..."
        value={messageDraft.content}
        onChangeText={(text) => setMessageDraft({ ...messageDraft, content: text })}
        multiline
        textAlignVertical="top"
        placeholderTextColor={Colors[colorScheme].textDim}
      />

      <TouchableOpacityComponent
        style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
        onPress={handleSendMessage}
        disabled={isLoading}
      >
        <Ionicons name="send" size={20} color={Colors.dark.buttonText} />
        <ThemedText style={styles.sendButtonText}>{isLoading ? "Sending..." : "Send Message"}</ThemedText>
      </TouchableOpacityComponent>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Message Center</ThemedText>
      </ThemedView>
      <ThemedView style={styles.content}>{renderMessageComposer()}</ThemedView>

      <RecipientSelector
        visible={isRecipientSelectorOpen}
        onClose={closeRecipientSelector}
        members={members}
        selectedMembers={selectedMembers}
        selectedDivisions={selectedDivisions}
        onSelectMembers={handleSelectMembers}
        onSelectDivisions={handleSelectDivisions}
      />
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
  messageComposer: {
    flex: 1,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 20,
  },
  composerHeader: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  subjectInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: Colors.dark.text,
  },
  urgentToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    color: Colors.dark.text,
  },
  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.tint,
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  sendButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  recipientButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    gap: 8,
  },
  recipientButtonText: {
    color: Colors.dark.text,
    fontWeight: "500",
  },
});
