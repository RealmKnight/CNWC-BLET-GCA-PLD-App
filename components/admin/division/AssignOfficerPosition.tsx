import React, { useState, useEffect, Fragment } from "react";
import {
  StyleSheet,
  Platform,
  TextInput,
  View,
  ScrollView,
  Modal,
  useWindowDimensions,
  KeyboardAvoidingView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { OfficerPosition } from "@/types/officers";
import { useOfficerPositions } from "@/hooks/useOfficerPositions";
import { supabase } from "@/utils/supabase";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { format } from "date-fns";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import Toast from "react-native-toast-message";

interface Member {
  pin_number: number;
  first_name: string;
  last_name: string;
  status: string;
}

interface AssignOfficerPositionProps {
  position: OfficerPosition;
  division: string;
  onAssign: () => void;
  onCancel: () => void;
  visible: boolean;
  updateDateOnly?: boolean;
}

export function AssignOfficerPosition({
  position,
  division,
  onAssign,
  onCancel,
  visible,
  updateDateOnly = false,
}: AssignOfficerPositionProps) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentOfficer, setCurrentOfficer] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { assignPosition, fetchCurrentOfficers } = useOfficerPositions({ division });
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [startDate, setStartDate] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (visible) {
        console.log("[AssignOfficerPosition] Loading data for division:", division);
        await fetchMembers();
        await fetchCurrentPositionHolder();
      }
    }
    loadData();
  }, [visible, position, division]);

  const fetchMembers = async () => {
    try {
      console.log("[AssignOfficerPosition] Fetching members for division:", division);
      setIsLoading(true);

      // First, let's log what we're querying
      const query = supabase
        .from("members")
        .select("pin_number, first_name, last_name, status")
        .eq("division", division)
        .eq("status", "ACTIVE")
        .is("deleted", false)
        .order("last_name", { ascending: true });

      console.log("[AssignOfficerPosition] Query parameters:", { division, status: "ACTIVE", deleted: false });

      const { data, error } = await query;

      if (error) {
        console.error("[AssignOfficerPosition] Database error:", error);
        throw error;
      }

      console.log("[AssignOfficerPosition] Raw response:", data);
      console.log("[AssignOfficerPosition] Fetched members:", data?.length || 0);

      if (data) {
        setMembers(data);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("[AssignOfficerPosition] Error fetching members:", err);
      setError("Failed to fetch members");
      setIsLoading(false);
    }
  };

  const fetchCurrentPositionHolder = async () => {
    try {
      const officers = await fetchCurrentOfficers();
      const currentHolder = officers.find((officer) => String(officer.position).trim() === String(position).trim());
      if (currentHolder) {
        setCurrentOfficer(currentHolder);
        // Set the initial date from the timestamp
        const date = new Date(currentHolder.startDate);
        setSelectedDate(date);
        setStartDate(date.toISOString().split("T")[0]);
      }
    } catch (err) {
      console.error("Failed to fetch current position holder:", err);
    }
  };

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    setStartDate(date.toISOString().split("T")[0]);
  };

  const handleConfirm = async () => {
    if (!selectedMember || !startDate) return;

    try {
      // Create a date at noon UTC to avoid timezone issues
      const date = new Date(startDate);
      date.setUTCHours(12, 0, 0, 0);

      const { error } = await supabase.from("officer_positions").insert({
        member_pin: selectedMember.pin_number,
        position: position,
        division: division,
        start_date: date.toISOString(), // Store as ISO timestamp at noon UTC
      });

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `${selectedMember.first_name} ${selectedMember.last_name} assigned as ${position}`,
        position: "bottom",
        visibilityTime: 3000,
      });

      onAssign();
    } catch (error: any) {
      console.error("Error assigning officer:", error);
      setError(error.message);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "MMM d, yyyy");
  };

  const filteredMembers = React.useMemo(() => {
    console.log("[AssignOfficerPosition] Filtering members. Total:", members.length, "Search:", searchQuery);
    return members.filter(
      (member) =>
        searchQuery === "" ||
        `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.pin_number.toString().includes(searchQuery)
    );
  }, [members, searchQuery]);

  const handleDateConfirm = (date: Date) => {
    setSelectedDate(date);
    setDatePickerVisible(false);
  };

  const modalContent = (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors[colorScheme].text} />
        </TouchableOpacity>
        <ThemedText style={styles.title}>{position}</ThemedText>
        <View style={styles.backButton} />
      </ThemedView>
      <ThemedView style={styles.searchContainer}>
        {currentOfficer && (
          <ThemedView style={styles.currentHolderCard}>
            <ThemedText style={styles.currentHolderTitle}>Current Position Holder</ThemedText>
            <ThemedText style={styles.currentHolderName}>
              {currentOfficer.firstName} {currentOfficer.lastName}
            </ThemedText>
            <ThemedText style={styles.currentHolderDetails}>PIN: {currentOfficer.memberPin}</ThemedText>
            <ThemedText style={styles.currentHolderDetails}>Since: {formatDate(currentOfficer.startDate)}</ThemedText>
          </ThemedView>
        )}
        <TextInput
          style={[styles.searchInput, { color: Colors[colorScheme].text }]}
          placeholder="Search members..."
          placeholderTextColor={Colors[colorScheme].textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== "" && (
          <TouchableOpacityComponent style={styles.clearButton} onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
          </TouchableOpacityComponent>
        )}
      </ThemedView>

      <ScrollView
        style={styles.memberList}
        contentContainerStyle={styles.memberListContent}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ThemedText style={styles.centerText}>Loading members...</ThemedText>
        ) : filteredMembers.length === 0 ? (
          <ThemedText style={styles.centerText}>No members found</ThemedText>
        ) : (
          filteredMembers.map((member) => (
            <TouchableOpacityComponent
              key={member.pin_number}
              style={[styles.memberItem, selectedMember?.pin_number === member.pin_number && styles.selectedMember]}
              onPress={() => setSelectedMember(member)}
            >
              <View style={styles.memberInfo}>
                <ThemedText style={styles.memberName}>
                  {member.last_name}, {member.first_name}
                </ThemedText>
                <ThemedText style={styles.memberPin}>PIN: {member.pin_number}</ThemedText>
              </View>
              {selectedMember?.pin_number === member.pin_number && (
                <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].tint} />
              )}
            </TouchableOpacityComponent>
          ))
        )}
      </ScrollView>
      <ThemedView style={[styles.footer, { paddingBottom: insets.bottom }]}>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        <View style={styles.dateContainer}>
          <ThemedText>Start Date:</ThemedText>
          <TouchableOpacityComponent onPress={() => setDatePickerVisible(true)}>
            <ThemedText style={styles.dateText}>{format(selectedDate || new Date(), "MMM d, yyyy")}</ThemedText>
          </TouchableOpacityComponent>
        </View>
        <View style={styles.buttonContainer}>
          <TouchableOpacityComponent style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <ThemedText style={styles.buttonText}>Cancel</ThemedText>
          </TouchableOpacityComponent>
          <TouchableOpacityComponent
            style={[styles.button, styles.assignButton, (!selectedMember || isLoading) && styles.disabledButton]}
            onPress={handleConfirm}
            disabled={!selectedMember || isLoading}
          >
            <ThemedText style={styles.buttonText}>{isLoading ? "Assigning..." : "Assign"}</ThemedText>
          </TouchableOpacityComponent>
        </View>
      </ThemedView>
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleDateConfirm}
        onCancel={() => setDatePickerVisible(false)}
        date={selectedDate || new Date()}
      />
    </KeyboardAvoidingView>
  );

  if (isWeb) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
        <ThemedView style={styles.webModalOverlay}>
          <ThemedView style={styles.webModalContent}>{modalContent}</ThemedView>
        </ThemedView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {modalContent}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  webModalContent: {
    width: "100%",
    maxWidth: 600,
    height: "90%",
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    flex: 1,
  },
  currentHolderCard: {
    margin: 16,
    padding: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  currentHolderTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  currentHolderName: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  currentHolderDetails: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  clearButton: {
    position: "absolute",
    right: 24,
    padding: 4,
  },
  memberList: {
    flex: 1,
  },
  memberListContent: {
    padding: 16,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
  },
  memberPin: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  selectedMember: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + "10",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
    backgroundColor: Colors.light.background,
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  dateText: {
    fontSize: 16,
    color: Colors.light.tint,
    marginLeft: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  assignButton: {
    backgroundColor: Colors.light.tint,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: Colors.light.error,
    marginBottom: 16,
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
    marginTop: 20,
  },
});
