import React, { useState, useEffect, useMemo } from "react";
import { StyleSheet, Alert, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TextInput } from "react-native";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { sendMessageWithNotification } from "@/utils/notificationService";
import { Checkbox } from "@/components/ui";
import { Modal } from "@/components/ui";

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
  const [isDivisionsModalOpen, setIsDivisionsModalOpen] = useState(false);

  // Get unique divisions from members
  const divisions = useMemo(() => {
    const uniqueDivisions = [...new Set(members.map((m) => m.division))];
    return uniqueDivisions.sort();
  }, [members]);

  // Filter members based on selected divisions
  const filteredMembers = useMemo(() => {
    if (selectedDivisions.length === 0) return members;
    return members.filter((member) => selectedDivisions.includes(member.division));
  }, [members, selectedDivisions]);

  // Update selected members when divisions change
  useEffect(() => {
    const currentSelected = selectedMembers.filter((pin) => filteredMembers.some((m) => m.pin_number === pin));
    setSelectedMembers(currentSelected);
    setMessageDraft((prev) => ({ ...prev, recipients: currentSelected }));
  }, [selectedDivisions]);

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

  const handleSelectAll = () => {
    if (selectedMembers.length === filteredMembers.length) {
      setSelectedMembers([]);
      setMessageDraft((prev) => ({ ...prev, recipients: [] }));
    } else {
      const allMemberPins = filteredMembers.map((m) => m.pin_number);
      setSelectedMembers(allMemberPins);
      setMessageDraft((prev) => ({ ...prev, recipients: allMemberPins }));
    }
  };

  const toggleMemberSelection = (pinNumber: number) => {
    setSelectedMembers((prev) => {
      const newSelection = prev.includes(pinNumber) ? prev.filter((pin) => pin !== pinNumber) : [...prev, pinNumber];

      setMessageDraft((draft) => ({ ...draft, recipients: newSelection }));
      return newSelection;
    });
  };

  const toggleDivision = (division: string) => {
    setSelectedDivisions((prev) => {
      if (prev.includes(division)) {
        return prev.filter((d) => d !== division);
      } else {
        return [...prev, division];
      }
    });
  };

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
        messageDraft.requiresAcknowledgment
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

  const renderDivisionFilters = () => (
    <View style={styles.divisionFilters}>
      <ThemedText style={styles.filterLabel}>Filter by Division(s):</ThemedText>
      <TouchableOpacityComponent style={styles.dropdownButton} onPress={() => setIsDivisionsModalOpen(true)}>
        <ThemedText style={styles.dropdownButtonText}>
          {selectedDivisions.length === 0 ? "All Divisions" : `${selectedDivisions.length} Selected`}
        </ThemedText>
        <Ionicons name="chevron-down" size={20} color={Colors[colorScheme].text} />
      </TouchableOpacityComponent>

      <Modal visible={isDivisionsModalOpen} onClose={() => setIsDivisionsModalOpen(false)} title="Select Divisions">
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          <TouchableOpacityComponent
            style={[styles.divisionItem, selectedDivisions.length === 0 && styles.divisionItemSelected]}
            onPress={() => {
              setSelectedDivisions([]);
              setIsDivisionsModalOpen(false);
            }}
          >
            <ThemedText>All Divisions</ThemedText>
            {selectedDivisions.length === 0 && <Ionicons name="checkmark" size={20} color={tintColor} />}
          </TouchableOpacityComponent>

          {divisions.map((division) => (
            <TouchableOpacityComponent
              key={`division-${division}`}
              style={[styles.divisionItem, selectedDivisions.includes(division) && styles.divisionItemSelected]}
              onPress={() => toggleDivision(division)}
            >
              <ThemedText>{division}</ThemedText>
              {selectedDivisions.includes(division) && <Ionicons name="checkmark" size={20} color={tintColor} />}
            </TouchableOpacityComponent>
          ))}
        </ScrollView>
      </Modal>
    </View>
  );

  const renderRecipientSelector = () => (
    <ThemedView style={styles.recipientSelector}>
      <ThemedView style={styles.selectorHeader}>
        <ThemedText type="subtitle">Recipients ({filteredMembers.length})</ThemedText>
        <TouchableOpacityComponent style={styles.selectAllButton} onPress={handleSelectAll}>
          <ThemedText style={{ color: tintColor }}>
            {selectedMembers.length === filteredMembers.length ? "Deselect All" : "Select All"}
          </ThemedText>
        </TouchableOpacityComponent>
      </ThemedView>

      {renderDivisionFilters()}

      <ScrollView style={styles.memberList} contentContainerStyle={styles.memberListContent}>
        {filteredMembers
          .map((member) => {
            if (!member?.pin_number) {
              console.warn("Invalid member data:", member);
              return null;
            }

            return (
              <TouchableOpacityComponent
                key={`member-${member.pin_number}`}
                style={styles.memberItem}
                onPress={() => toggleMemberSelection(member.pin_number)}
              >
                <ThemedView style={styles.memberInfo}>
                  <Checkbox
                    checked={selectedMembers.includes(member.pin_number)}
                    onCheckedChange={() => toggleMemberSelection(member.pin_number)}
                  />
                  <ThemedView style={styles.memberDetails}>
                    <ThemedText style={styles.memberName}>
                      {member.first_name} {member.last_name}
                    </ThemedText>
                    <ThemedText style={styles.memberPin}>PIN: {member.pin_number}</ThemedText>
                  </ThemedView>
                </ThemedView>
                <ThemedText style={styles.memberDivision}>{member.division}</ThemedText>
              </TouchableOpacityComponent>
            );
          })
          .filter(Boolean)}
      </ScrollView>
    </ThemedView>
  );

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
  activeText: {
    color: Colors.dark.text,
  },
  memberItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  memberInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  memberDetails: {
    gap: 4,
  },
  memberName: {
    fontWeight: "600",
  },
  memberPin: {
    fontSize: 12,
    opacity: 0.7,
  },
  memberDivision: {
    fontSize: 12,
    opacity: 0.7,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  memberListContent: {
    flexGrow: 1,
  },
  divisionFilters: {
    marginBottom: 16,
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
  },
  dropdownButtonText: {
    fontSize: 14,
  },
  modalScroll: {
    maxHeight: 300, // Limit the height of the scroll area
  },
  modalContent: {
    gap: 4,
  },
  divisionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  divisionItemSelected: {
    backgroundColor: Colors.light.primary + "10",
  },
});
