import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, TextInput, View, ScrollView, useWindowDimensions } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { OfficerPosition, CurrentOfficer } from "@/types/officers";
import { useOfficerPositions } from "@/hooks/useOfficerPositions";
import { supabase } from "@/utils/supabase";
import DateTimePickerModal from "react-native-modal-datetime-picker";

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
}

export function AssignOfficerPosition({ position, division, onAssign, onCancel }: AssignOfficerPositionProps) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentOfficer, setCurrentOfficer] = useState<CurrentOfficer | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { assignPosition, fetchCurrentOfficers } = useOfficerPositions({ division });
  const { height: windowHeight } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    fetchMembers();
    fetchCurrentPositionHolder();
  }, [position, division]);

  const fetchCurrentPositionHolder = async () => {
    try {
      const officers = await fetchCurrentOfficers();
      console.log("Current officers:", officers);
      console.log("Looking for position:", position);

      // Strict comparison of position strings
      const currentHolder = officers.find((officer) => String(officer.position).trim() === String(position).trim());

      console.log("Found holder:", currentHolder);
      if (currentHolder) {
        setCurrentOfficer(currentHolder);
      } else {
        setCurrentOfficer(null);
      }
    } catch (err) {
      console.error("Failed to fetch current position holder:", err);
      setCurrentOfficer(null);
    }
  };

  const fetchMembers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("members")
        .select("pin_number, first_name, last_name, status")
        .eq("division", division)
        .eq("deleted", false)
        .order("last_name");

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch members");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      member.first_name.toLowerCase().includes(searchLower) ||
      member.last_name.toLowerCase().includes(searchLower) ||
      member.pin_number.toString().includes(searchLower)
    );
  });

  const handleAssign = async () => {
    if (!selectedMember) {
      setError("Please select a member");
      return;
    }

    try {
      setIsLoading(true);
      await assignPosition({
        memberPin: selectedMember.pin_number,
        position,
        startDate: startDate.toISOString(),
      });
      await fetchCurrentPositionHolder();
      onAssign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign position");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateConfirm = (date: Date) => {
    setStartDate(date);
    setDatePickerVisible(false);
  };

  const renderMemberList = () => (
    <View style={[styles.memberListContainer, !isWeb && { maxHeight: windowHeight * 0.3 }]}>
      <ScrollView style={styles.memberList} nestedScrollEnabled={true} contentContainerStyle={styles.memberListContent}>
        {filteredMembers.map((member) => (
          <TouchableOpacityComponent
            key={member.pin_number}
            style={[
              styles.memberItem,
              selectedMember?.pin_number === member.pin_number && styles.selectedMember,
              { borderColor: Colors[colorScheme].buttonBorder },
            ]}
            onPress={() => setSelectedMember(member)}
          >
            <ThemedText>
              {member.last_name}, {member.first_name} ({member.pin_number})
            </ThemedText>
          </TouchableOpacityComponent>
        ))}
      </ScrollView>
    </View>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.error}>{error}</ThemedText>
        <TouchableOpacityComponent onPress={onCancel} style={styles.button}>
          <ThemedText>Close</ThemedText>
        </TouchableOpacityComponent>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Assign {position}</ThemedText>

        {currentOfficer && (
          <ThemedView style={styles.currentOfficerContainer}>
            <ThemedText style={styles.currentOfficerLabel}>Current Position Holder:</ThemedText>
            <ThemedView style={styles.currentOfficerInfo}>
              <ThemedText style={styles.currentOfficerName}>
                {currentOfficer.lastName}, {currentOfficer.firstName}
              </ThemedText>
              <ThemedText style={styles.currentOfficerDate}>
                Since: {new Date(currentOfficer.startDate).toLocaleDateString()}
              </ThemedText>
            </ThemedView>
          </ThemedView>
        )}

        <TextInput
          style={[
            styles.searchInput,
            { color: Colors[colorScheme].text, borderColor: Colors[colorScheme].buttonBorder },
          ]}
          placeholder="Search members..."
          placeholderTextColor={Colors[colorScheme].text}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {renderMemberList()}

        <TouchableOpacityComponent style={styles.dateButton} onPress={() => setDatePickerVisible(true)}>
          <ThemedText>Start Date: {startDate.toLocaleDateString()}</ThemedText>
        </TouchableOpacityComponent>

        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleDateConfirm}
          onCancel={() => setDatePickerVisible(false)}
          date={startDate}
        />

        <View style={styles.buttonContainer}>
          <TouchableOpacityComponent style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <ThemedText>Cancel</ThemedText>
          </TouchableOpacityComponent>
          <TouchableOpacityComponent
            style={[styles.button, styles.assignButton]}
            onPress={handleAssign}
            disabled={!selectedMember}
          >
            <ThemedText>Assign</ThemedText>
          </TouchableOpacityComponent>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  memberListContainer: {
    marginBottom: 16,
  },
  memberList: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },
  memberListContent: {
    padding: 8,
  },
  memberItem: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedMember: {
    backgroundColor: "rgba(0, 122, 255, 0.1)",
  },
  dateButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    marginBottom: 16,
    alignItems: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(0, 122, 255, 0.1)",
    alignItems: "center",
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  assignButton: {
    backgroundColor: "rgba(52, 199, 89, 0.1)",
  },
  error: {
    color: "red",
    marginBottom: 16,
  },
  currentOfficerContainer: {
    backgroundColor: "rgba(0, 122, 255, 0.05)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  currentOfficerLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    opacity: 0.8,
  },
  currentOfficerInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  currentOfficerName: {
    fontSize: 16,
    fontWeight: "500",
  },
  currentOfficerDate: {
    fontSize: 14,
    opacity: 0.7,
  },
});
