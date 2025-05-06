import React, { useMemo, useState } from "react";
import { StyleSheet, View, ScrollView, Dimensions, TextInput } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Modal, Checkbox } from "@/components/ui";

interface Member {
  pin_number: number;
  first_name: string;
  last_name: string;
  division: string;
  deleted?: boolean;
  division_id: number;
}

interface RecipientSelectorProps {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  selectedMembers: number[];
  selectedDivisions: string[];
  onSelectMembers: (pins: number[]) => void;
  onSelectDivisions: (divisions: string[]) => void;
}

export function RecipientSelector({
  visible,
  onClose,
  members,
  selectedMembers,
  selectedDivisions,
  onSelectMembers,
  onSelectDivisions,
}: RecipientSelectorProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const [isDivisionListVisible, setIsDivisionListVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Get unique divisions from members
  const divisions = useMemo(() => {
    const uniqueDivisions = [...new Set(members.map((m) => m.division))];
    return uniqueDivisions.sort();
  }, [members]);

  // Filter members based on selected divisions and search term
  const filteredMembers = useMemo(() => {
    let filtered = members;

    if (selectedDivisions.length > 0) {
      filtered = filtered.filter((member) => selectedDivisions.includes(member.division));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(
        (member) =>
          member.first_name.toLowerCase().includes(term) ||
          member.last_name.toLowerCase().includes(term) ||
          member.pin_number.toString().includes(term)
      );
    }

    return filtered;
  }, [members, selectedDivisions, searchTerm]);

  const handleSelectAll = () => {
    if (selectedMembers.length === filteredMembers.length) {
      onSelectMembers([]);
    } else {
      const allMemberPins = filteredMembers.map((m) => m.pin_number);
      onSelectMembers(allMemberPins);
    }
  };

  const toggleMemberSelection = (pinNumber: number) => {
    const newSelection = selectedMembers.includes(pinNumber)
      ? selectedMembers.filter((pin) => pin !== pinNumber)
      : [...selectedMembers, pinNumber];

    onSelectMembers(newSelection);
  };

  const toggleDivision = (division: string) => {
    const newDivisions = selectedDivisions.includes(division)
      ? selectedDivisions.filter((d) => d !== division)
      : [...selectedDivisions, division];

    onSelectDivisions(newDivisions);
  };

  const toggleDivisionList = () => {
    setIsDivisionListVisible(!isDivisionListVisible);
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Select Recipients">
      <ThemedView style={styles.container}>
        {/* Division Filters */}
        <ThemedView style={styles.divisionFilters}>
          <TouchableOpacityComponent onPress={toggleDivisionList} style={styles.filterHeader}>
            <ThemedView style={styles.filterLabelContainer}>
              <ThemedText style={styles.filterLabel}>Filter by Division(s):</ThemedText>
              {!isDivisionListVisible && (
                <ThemedText style={styles.selectedDivisionText}>
                  {selectedDivisions.length === 0
                    ? "All"
                    : selectedDivisions.length === 1
                    ? selectedDivisions[0]
                    : `${selectedDivisions.length} Selected`}
                </ThemedText>
              )}
            </ThemedView>
            <Ionicons
              name={isDivisionListVisible ? "chevron-up" : "chevron-down"}
              size={16}
              color={Colors[colorScheme].text}
            />
          </TouchableOpacityComponent>

          {isDivisionListVisible && (
            <ThemedView style={styles.divisionListWrapper}>
              <ThemedView style={styles.divisionList}>
                <TouchableOpacityComponent
                  style={[styles.divisionChip, selectedDivisions.length === 0 && styles.divisionChipSelected]}
                  onPress={() => onSelectDivisions([])}
                >
                  <ThemedText style={selectedDivisions.length === 0 ? styles.chipTextSelected : styles.chipText}>
                    All Divisions
                  </ThemedText>
                </TouchableOpacityComponent>

                {divisions.map((division) => (
                  <TouchableOpacityComponent
                    key={`division-chip-${division}`}
                    style={selectedDivisions.includes(division) ? styles.divisionChipSelected : styles.divisionChip}
                    onPress={() => toggleDivision(division)}
                  >
                    <ThemedText
                      style={selectedDivisions.includes(division) ? styles.chipTextSelected : styles.chipText}
                    >
                      {division}
                    </ThemedText>
                  </TouchableOpacityComponent>
                ))}
              </ThemedView>
            </ThemedView>
          )}
        </ThemedView>

        {/* Member Selection Header */}
        <ThemedView style={styles.selectorHeader}>
          <ThemedText type="subtitle" style={styles.selectorHeaderText}>
            Members ({filteredMembers.length}) - Selected: {selectedMembers.length}
          </ThemedText>
          <TouchableOpacityComponent style={styles.selectAllButton} onPress={handleSelectAll}>
            <ThemedText style={styles.selectAllText}>
              {selectedMembers.length === filteredMembers.length ? "Deselect All" : "Select All"}
            </ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>

        {/*Search bar */}
        <ThemedView style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors[colorScheme].textDim} />
          <TextInput
            style={[styles.searchInput, { color: Colors[colorScheme].text }]}
            placeholder="Search by name or PIN"
            placeholderTextColor={Colors[colorScheme].textDim}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacityComponent onPress={() => setSearchTerm("")}>
              <Ionicons name="close-circle" size={18} color={Colors[colorScheme].textDim} />
            </TouchableOpacityComponent>
          )}
        </ThemedView>

        {/* Member List */}
        <ThemedView style={styles.memberListContainer}>
          <ScrollView style={styles.memberList}>
            {filteredMembers
              .map((member) => {
                if (!member?.pin_number) {
                  return null;
                }

                return (
                  <TouchableOpacityComponent
                    key={`member-${member.pin_number}`}
                    style={styles.memberItem}
                    onPress={() => toggleMemberSelection(member.pin_number)}
                  >
                    <View style={styles.memberInfo}>
                      <Checkbox
                        checked={selectedMembers.includes(member.pin_number)}
                        onCheckedChange={() => toggleMemberSelection(member.pin_number)}
                      />
                      <View style={styles.memberDetails}>
                        <ThemedText style={styles.memberName}>
                          {member.first_name} {member.last_name}
                        </ThemedText>
                        <ThemedText style={styles.memberPin}>PIN: {member.pin_number}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.memberDivision}>{member.division}</ThemedText>
                  </TouchableOpacityComponent>
                );
              })
              .filter(Boolean)}
          </ScrollView>
        </ThemedView>

        {/* Confirm Button */}
        <ThemedView style={styles.buttonContainer}>
          <TouchableOpacityComponent style={styles.confirmButton} onPress={onClose}>
            <ThemedText style={styles.confirmButtonText}>Confirm ({selectedMembers.length} selected)</ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
  },
  divisionFilters: {
    marginBottom: 8,
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  filterLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedDivisionText: {
    fontSize: 13,
    marginLeft: 8,
    color: Colors.dark.tint,
    fontWeight: "500",
  },
  selectorHeaderText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectionSummary: {
    fontSize: 13,
    marginTop: 4,
    color: Colors.dark.tint,
  },
  divisionListWrapper: {
    marginTop: 8,
  },
  divisionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  divisionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  divisionChipSelected: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
    color: Colors.dark.buttonText,
  },
  chipText: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  chipTextSelected: {
    fontSize: 13,
    color: Colors.dark.buttonText,
  },
  selectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 8,
  },
  selectAllButton: {
    padding: 8,
    backgroundColor: Colors.dark.buttonBackground,
    borderRadius: 8,
  },
  selectAllText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
  },
  memberListContainer: {
    flex: 1,
    minHeight: 200,
    maxHeight: 300,
  },
  memberList: {
    flex: 1,
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
  buttonContainer: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  confirmButton: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: Colors.dark.card,
  },
  searchInput: {
    flex: 1,
    height: 24,
    marginLeft: 8,
    fontSize: 14,
  },
});
