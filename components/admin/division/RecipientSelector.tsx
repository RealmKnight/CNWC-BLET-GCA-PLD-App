import React, { useMemo, useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, Dimensions, TextInput, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Modal, Checkbox } from "@/components/ui";
import { supabase } from "@/utils/supabase";

// Get screen dimensions for responsive layout
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_MOBILE = Platform.OS === "android" || Platform.OS === "ios";

interface Member {
  pin_number: number;
  first_name: string;
  last_name: string;
  division: string;
  deleted?: boolean;
  division_id: number;
}

interface Officer {
  member_pin: number;
  position: string;
  division: string;
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

// Officer positions from DivisionOfficers.tsx
const OFFICER_POSITIONS = [
  "President",
  "Vice-President",
  "Secretary/Treasurer",
  "Alternate Secretary/Treasurer",
  "Legislative Representative",
  "Alternate Legislative Representative",
  "Local Chairman",
  "First Vice-Local Chairman",
  "Second Vice-Local Chairman",
  "Third Vice-Local Chairman",
  "Fourth Vice-Local Chairman",
  "Fifth Vice-Local Chairman",
  "Guide",
  "Chaplain",
  "Delegate to the National Division",
  "First Alternate Delegate to the National Division",
  "Second Alternate Delegate to the National Division",
  "First Trustee",
  "Second Trustee",
  "Third Trustee",
  "First Alternate Trustee",
  "Second Alternate Trustee",
  "Third Alternate Trustee",
];

type FilterType = "Division" | "Officer";

// Component for the filter selection modal
function FilterSelectionModal({
  visible,
  onClose,
  title,
  activeFilterType,
  onFilterTypeChange,
  divisions,
  selectedDivisions,
  onSelectDivisions,
  selectedOfficers,
  onSelectOfficers,
  onApply,
  onClear,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  activeFilterType: FilterType;
  onFilterTypeChange: (type: FilterType) => void;
  divisions: string[];
  selectedDivisions: string[];
  onSelectDivisions: (divisions: string[]) => void;
  selectedOfficers: string[];
  onSelectOfficers: (officers: string[]) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const toggleDivision = (division: string) => {
    const newDivisions = selectedDivisions.includes(division)
      ? selectedDivisions.filter((d) => d !== division)
      : [...selectedDivisions, division];

    onSelectDivisions(newDivisions);
  };

  const toggleOfficer = (position: string) => {
    // Special handling for "All" option
    if (position === "All") {
      if (selectedOfficers.includes("All")) {
        onSelectOfficers([]);
      } else {
        onSelectOfficers(["All"]);
      }
      return;
    }

    // Remove "All" if any specific position is selected
    let newOfficers = selectedOfficers.filter((p) => p !== "All");

    if (selectedOfficers.includes(position)) {
      newOfficers = newOfficers.filter((p) => p !== position);
    } else {
      newOfficers = [...newOfficers, position];
    }

    onSelectOfficers(newOfficers);
  };

  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <ThemedView style={styles.filterModalContainer}>
        {/* Filter Type Toggle */}
        <ThemedView style={styles.filterTypeSelector}>
          <TouchableOpacityComponent
            style={[styles.filterTypeButton, activeFilterType === "Division" && styles.activeFilterTypeButton]}
            onPress={() => onFilterTypeChange("Division")}
          >
            <ThemedText style={[styles.filterTypeText, activeFilterType === "Division" && styles.activeFilterTypeText]}>
              Division(s)
            </ThemedText>
          </TouchableOpacityComponent>
          <TouchableOpacityComponent
            style={[styles.filterTypeButton, activeFilterType === "Officer" && styles.activeFilterTypeButton]}
            onPress={() => onFilterTypeChange("Officer")}
          >
            <ThemedText style={[styles.filterTypeText, activeFilterType === "Officer" && styles.activeFilterTypeText]}>
              Officer(s)
            </ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>

        {/* Filter Options */}
        <ScrollView style={styles.filterOptionsScrollView} contentContainerStyle={styles.filterOptionsContent}>
          <ThemedView style={styles.filterOptionsList}>
            {activeFilterType === "Division" ? (
              <>
                <TouchableOpacityComponent
                  style={[styles.filterOption, selectedDivisions.length === 0 && styles.filterOptionSelected]}
                  onPress={() => onSelectDivisions([])}
                >
                  <Checkbox checked={selectedDivisions.length === 0} onCheckedChange={() => onSelectDivisions([])} />
                  <ThemedText style={styles.filterOptionText}>All Divisions</ThemedText>
                </TouchableOpacityComponent>

                {divisions.map((division) => (
                  <TouchableOpacityComponent
                    key={`division-option-${division}`}
                    style={[styles.filterOption, selectedDivisions.includes(division) && styles.filterOptionSelected]}
                    onPress={() => toggleDivision(division)}
                  >
                    <Checkbox
                      checked={selectedDivisions.includes(division)}
                      onCheckedChange={() => toggleDivision(division)}
                    />
                    <ThemedText style={styles.filterOptionText}>{division}</ThemedText>
                  </TouchableOpacityComponent>
                ))}
              </>
            ) : (
              <>
                <TouchableOpacityComponent
                  style={[styles.filterOption, selectedOfficers.length === 0 && styles.filterOptionSelected]}
                  onPress={() => onSelectOfficers([])}
                >
                  <Checkbox checked={selectedOfficers.length === 0} onCheckedChange={() => onSelectOfficers([])} />
                  <ThemedText style={styles.filterOptionText}>Select Group</ThemedText>
                </TouchableOpacityComponent>

                <TouchableOpacityComponent
                  style={[styles.filterOption, selectedOfficers.includes("All") && styles.filterOptionSelected]}
                  onPress={() => toggleOfficer("All")}
                >
                  <Checkbox checked={selectedOfficers.includes("All")} onCheckedChange={() => toggleOfficer("All")} />
                  <ThemedText style={styles.filterOptionText}>All Officers</ThemedText>
                </TouchableOpacityComponent>

                {OFFICER_POSITIONS.map((position) => (
                  <TouchableOpacityComponent
                    key={`officer-option-${position}`}
                    style={[styles.filterOption, selectedOfficers.includes(position) && styles.filterOptionSelected]}
                    onPress={() => toggleOfficer(position)}
                  >
                    <Checkbox
                      checked={selectedOfficers.includes(position)}
                      onCheckedChange={() => toggleOfficer(position)}
                    />
                    <ThemedText style={styles.filterOptionText}>{position}</ThemedText>
                  </TouchableOpacityComponent>
                ))}
              </>
            )}
          </ThemedView>
        </ScrollView>

        {/* Action Buttons */}
        <ThemedView style={styles.filterModalActions}>
          <TouchableOpacityComponent style={styles.clearButton} onPress={onClear}>
            <ThemedText style={styles.clearButtonText}>Clear</ThemedText>
          </TouchableOpacityComponent>
          <TouchableOpacityComponent style={styles.cancelButton} onPress={onClose}>
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacityComponent>
          <TouchableOpacityComponent style={styles.applyButton} onPress={onApply}>
            <ThemedText style={styles.applyButtonText}>Apply</ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
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
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilterType, setActiveFilterType] = useState<FilterType>("Division");
  const [selectedOfficers, setSelectedOfficers] = useState<string[]>([]);
  const [officerMembers, setOfficerMembers] = useState<Record<number, string[]>>({});
  const [isFilterModalVisible, setFilterModalVisible] = useState(false);

  // Temp state for filter modal selections
  const [tempSelectedDivisions, setTempSelectedDivisions] = useState<string[]>([]);
  const [tempSelectedOfficers, setTempSelectedOfficers] = useState<string[]>([]);

  // Get unique divisions from members
  const divisions = useMemo(() => {
    const uniqueDivisions = [...new Set(members.map((m) => m.division))];
    return uniqueDivisions.sort();
  }, [members]);

  // Fetch officer data on component mount
  useEffect(() => {
    if (visible) {
      fetchOfficerData();
    }
  }, [visible]);

  const fetchOfficerData = async () => {
    try {
      const { data, error } = await supabase
        .from("current_officers")
        .select("member_pin, position, division")
        .is("end_date", null);

      if (error) {
        console.error("Error fetching officers:", error);
        return;
      }

      // Create a mapping of member_pin to positions they hold
      const officersMap: Record<number, string[]> = {};
      data.forEach((officer: Officer) => {
        if (!officersMap[officer.member_pin]) {
          officersMap[officer.member_pin] = [];
        }
        officersMap[officer.member_pin].push(officer.position);
      });

      setOfficerMembers(officersMap);
    } catch (error) {
      console.error("Error in fetchOfficerData:", error);
    }
  };

  // Filter members based on selected divisions, officers, and search term
  const filteredMembers = useMemo(() => {
    let filtered = members;

    // Filter by division if any are selected
    if (selectedDivisions.length > 0) {
      filtered = filtered.filter((member) => selectedDivisions.includes(member.division));
    }

    // Filter by officer positions if any are selected
    if (selectedOfficers.length > 0) {
      // Special case for "All" option
      if (selectedOfficers.includes("All")) {
        filtered = filtered.filter(
          (member) => officerMembers[member.pin_number] && officerMembers[member.pin_number].length > 0
        );
      } else {
        filtered = filtered.filter((member) => {
          const positions = officerMembers[member.pin_number] || [];
          return selectedOfficers.some((position) => positions.includes(position));
        });
      }
    }

    // Apply search term filter
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
  }, [members, selectedDivisions, selectedOfficers, searchTerm, officerMembers]);

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

  const openFilterModal = (type: FilterType) => {
    setActiveFilterType(type);
    setTempSelectedDivisions([...selectedDivisions]);
    setTempSelectedOfficers([...selectedOfficers]);
    setFilterModalVisible(true);
  };

  const handleFilterTypeChange = (type: FilterType) => {
    setActiveFilterType(type);
  };

  const applyFilters = () => {
    if (activeFilterType === "Division") {
      onSelectDivisions(tempSelectedDivisions);
    } else {
      setSelectedOfficers(tempSelectedOfficers);
    }
    setFilterModalVisible(false);
  };

  const cancelFilters = () => {
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    if (activeFilterType === "Division") {
      setTempSelectedDivisions([]);
    } else {
      setTempSelectedOfficers([]);
    }
  };

  const getDivisionFilterLabel = () => {
    return selectedDivisions.length === 0
      ? "All"
      : selectedDivisions.length === 1
      ? selectedDivisions[0]
      : `${selectedDivisions.length} Selected`;
  };

  const getOfficerFilterLabel = () => {
    return selectedOfficers.length === 0
      ? "Select Group"
      : selectedOfficers.includes("All")
      ? "All Officers"
      : selectedOfficers.length === 1
      ? selectedOfficers[0]
      : `${selectedOfficers.length} Selected`;
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Select Recipients">
      <ThemedView style={styles.container}>
        {/* Filter Buttons */}
        <ThemedView style={styles.filterButtons}>
          <TouchableOpacityComponent style={styles.filterButton} onPress={() => openFilterModal("Division")}>
            <ThemedText style={styles.filterButtonLabel}>Division:</ThemedText>
            <ThemedText style={styles.filterButtonValue}>{getDivisionFilterLabel()}</ThemedText>
            <Ionicons name="chevron-down" size={16} color={Colors[colorScheme].text} />
          </TouchableOpacityComponent>

          <TouchableOpacityComponent style={styles.filterButton} onPress={() => openFilterModal("Officer")}>
            <ThemedText style={styles.filterButtonLabel}>Officer:</ThemedText>
            <ThemedText style={styles.filterButtonValue}>{getOfficerFilterLabel()}</ThemedText>
            <Ionicons name="chevron-down" size={16} color={Colors[colorScheme].text} />
          </TouchableOpacityComponent>
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
                    <ThemedView style={styles.memberDetailsRight}>
                      <ThemedText style={styles.memberDivision}>{member.division}</ThemedText>
                      {officerMembers[member.pin_number] && officerMembers[member.pin_number].length > 0 && (
                        <ThemedText style={styles.memberOfficer}>
                          {officerMembers[member.pin_number][0]}
                          {officerMembers[member.pin_number].length > 1 && " +"}
                        </ThemedText>
                      )}
                    </ThemedView>
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

        {/* Filter Modal */}
        <FilterSelectionModal
          visible={isFilterModalVisible}
          onClose={cancelFilters}
          title={`Filter by ${activeFilterType}`}
          activeFilterType={activeFilterType}
          onFilterTypeChange={handleFilterTypeChange}
          divisions={divisions}
          selectedDivisions={tempSelectedDivisions}
          onSelectDivisions={setTempSelectedDivisions}
          selectedOfficers={tempSelectedOfficers}
          onSelectOfficers={setTempSelectedOfficers}
          onApply={applyFilters}
          onClear={clearFilters}
        />
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
  filterButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginRight: 4,
  },
  filterButtonValue: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.tint,
    fontWeight: "500",
    textAlign: "right",
    marginRight: 8,
  },
  selectorHeaderText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 4,
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
    minHeight: IS_MOBILE ? SCREEN_HEIGHT * 0.45 : 250, // Larger on mobile
    maxHeight: IS_MOBILE ? SCREEN_HEIGHT * 0.75 : SCREEN_HEIGHT * 0.45, // Responsive height based on device
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
  memberDetailsRight: {
    alignItems: "flex-end",
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
  memberOfficer: {
    fontSize: 12,
    opacity: 0.7,
    color: Colors.dark.tint,
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
  filterTypeSelector: {
    flexDirection: "row",
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterTypeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  activeFilterTypeButton: {
    backgroundColor: Colors.dark.tint,
  },
  filterTypeText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeFilterTypeText: {
    color: Colors.dark.buttonText,
  },
  filterModalContainer: {
    width: "100%",
    minHeight: IS_MOBILE ? SCREEN_HEIGHT * 0.6 : 300, // Taller on mobile
    maxHeight: IS_MOBILE ? SCREEN_HEIGHT * 0.8 : 400, // Responsive height based on device
    display: "flex",
    flexDirection: "column",
  },
  filterOptionsScrollView: {
    flex: 1,
  },
  filterOptionsContent: {
    paddingBottom: 20, // Extra padding at bottom for scroll
  },
  filterOptionsList: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: IS_MOBILE ? 12 : 10, // Slightly larger touch targets on mobile
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  filterOptionSelected: {
    backgroundColor: Colors.dark.tint + "15",
  },
  filterOptionText: {
    marginLeft: 12,
    fontSize: 14,
  },
  filterModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: 8,
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  applyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.dark.tint,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.buttonText,
  },
});
