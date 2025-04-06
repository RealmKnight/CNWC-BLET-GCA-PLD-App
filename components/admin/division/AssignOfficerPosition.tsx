import React, { useState, useEffect, Fragment, useRef } from "react";
import {
  StyleSheet,
  Platform,
  TextInput,
  View,
  ScrollView,
  Modal as RNModal,
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
import { Modal as UIModal } from "@/components/ui/Modal";

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

interface ModalProps {
  children: React.ReactNode;
  visible: boolean;
  onClose: () => void;
}

const Modal = React.forwardRef<View, ModalProps>(({ children, visible, onClose }, ref) => {
  if (!visible) return null;

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.webModalOverlay}>
        <ThemedView ref={ref} style={styles.webModalContent}>
          {children}
        </ThemedView>
      </ThemedView>
    </RNModal>
  );
});

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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { assignPosition, fetchCurrentOfficers } = useOfficerPositions({ division });
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const modalRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      const now = new Date();
      setSelectedDate(now);
      setStartDate(now.toISOString().split("T")[0]);
    }
  }, [visible]);

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
    try {
      if (!selectedMember) {
        setError("Please select a member first");
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Please select a member first",
          position: "bottom",
          visibilityTime: 3000,
        });
        return;
      }

      if (!startDate) {
        setError("Please select a start date");
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Please select a start date",
          position: "bottom",
          visibilityTime: 3000,
        });
        return;
      }

      setIsLoading(true);
      setError(null);

      console.log("[AssignOfficerPosition] Assigning position:", {
        memberPin: selectedMember.pin_number,
        position,
        division,
        startDate,
      });

      // Create a date at noon UTC to avoid timezone issues
      const date = new Date(startDate);
      date.setUTCHours(12, 0, 0, 0);

      await assignPosition({
        memberPin: selectedMember.pin_number,
        position,
        startDate: date.toISOString(),
      });

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `${selectedMember.first_name} ${selectedMember.last_name} assigned as ${position}`,
        position: "bottom",
        visibilityTime: 3000,
      });

      onAssign();
    } catch (error: any) {
      console.error("[AssignOfficerPosition] Error assigning officer:", error);
      const errorMessage = error.message || "Failed to assign position";
      setError(errorMessage);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMessage,
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setIsLoading(false);
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

  const renderDatePicker = () => {
    if (isWeb) {
      return (
        <UIModal visible={isDatePickerVisible} onClose={() => setDatePickerVisible(false)} title="Select Start Date">
          <View style={styles.webDatePickerContainer}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                if (e.target.value) {
                  const newDate = new Date(e.target.value + "T12:00:00Z");
                  setSelectedDate(newDate);
                  setStartDate(e.target.value);
                }
              }}
              style={{
                fontSize: 16,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ccc",
                marginBottom: 20,
                width: 200,
              }}
            />
            <View style={styles.webDatePickerButtons}>
              <TouchableOpacityComponent
                style={[styles.button, styles.cancelButton]}
                onPress={() => setDatePickerVisible(false)}
              >
                <ThemedText style={styles.buttonText}>Cancel</ThemedText>
              </TouchableOpacityComponent>
              <TouchableOpacityComponent
                style={[styles.button, styles.assignButton]}
                onPress={() => {
                  handleDateConfirm(selectedDate);
                  setDatePickerVisible(false);
                }}
              >
                <ThemedText style={styles.buttonText}>Update</ThemedText>
              </TouchableOpacityComponent>
            </View>
          </View>
        </UIModal>
      );
    }

    return (
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={(date) => {
          handleDateConfirm(date);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
        date={selectedDate}
      />
    );
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
        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}
        <View style={styles.dateContainer}>
          <ThemedText>Start Date:</ThemedText>
          <TouchableOpacityComponent onPress={() => setDatePickerVisible(true)} style={styles.dateButton}>
            <ThemedText style={styles.dateText}>{format(selectedDate, "MMM d, yyyy")}</ThemedText>
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
            <View style={styles.buttonContent}>
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.buttonText}>{isLoading ? "Assigning..." : "Assign"}</ThemedText>
              )}
            </View>
          </TouchableOpacityComponent>
        </View>
      </ThemedView>
      {renderDatePicker()}
    </KeyboardAvoidingView>
  );

  if (isWeb) {
    return (
      <Modal ref={modalRef} visible={visible} onClose={onCancel}>
        {modalContent}
      </Modal>
    );
  }

  return (
    <RNModal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {modalContent}
    </RNModal>
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
  errorText: {
    color: Colors.light.error,
    marginBottom: 16,
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
    marginTop: 20,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dateButton: {
    padding: 8,
    backgroundColor: `${Colors.light.tint}10`,
    borderRadius: 8,
    marginLeft: 8,
  },
  webDatePickerContainer: {
    padding: 20,
    alignItems: "center",
  } as const,
  webDatePickerButtons: {
    flexDirection: "row" as const,
    gap: 16,
  } as const,
});
