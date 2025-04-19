import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { useUserStore } from "@/store/userStore";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import type { Member } from "@/store/adminCalendarManagementStore";

interface TimeOffManagerProps {
  selectedDivision: string;
  selectedCalendarId: string | null;
}

type YearType = "current" | "next";

export function TimeOffManager({ selectedDivision, selectedCalendarId }: TimeOffManagerProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const { member } = useUserStore();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});

  // Use store state and actions
  const {
    memberTimeOffData,
    timeOffChanges,
    isTimeOffLoading,
    timeOffError,
    selectedTimeOffYear,
    setSelectedTimeOffYear,
    fetchMemberTimeOffData,
    setTimeOffChange,
    resetTimeOffChanges,
    calculateAndUpdateSDVs,
    updateMemberTimeOff,
    updateSingleMemberTimeOff,
  } = useAdminCalendarManagementStore();

  // Calculated state
  const hasChanges = useMemo(() => Object.keys(timeOffChanges).length > 0, [timeOffChanges]);

  // Add a debug log to check if changes are detected
  useEffect(() => {
    console.log("Time off changes:", timeOffChanges);
    console.log("Has changes:", hasChanges);
  }, [timeOffChanges, hasChanges]);

  // Instead of using Object.values which sorts by PIN numbers (object keys),
  // we'll preserve the order from the backend
  const membersList = useMemo(() => {
    // Get the raw data array from the store if available
    const storeData = useAdminCalendarManagementStore.getState().memberTimeOffDataArray || [];

    // If we have the raw array, use it
    if (storeData.length > 0) {
      return storeData;
    }

    // Fallback to Object.values if the array isn't available
    return Object.values(memberTimeOffData);
  }, [memberTimeOffData]);

  // Load division members when selectedDivision changes
  useEffect(() => {
    if (selectedDivision) {
      // Get division_id from member or from a divisionMapping if available
      const divisionId = member?.division_id || 0; // This should be replaced with actual division ID matching

      fetchMemberTimeOffData(divisionId);
    }
  }, [selectedDivision, fetchMemberTimeOffData]);

  // Add console log to check member order
  useEffect(() => {
    if (membersList.length > 0) {
      console.log(
        "Displaying members in order:",
        membersList.map((m: Member) => ({
          pin: m.pin_number,
          name: `${m.first_name} ${m.last_name}`,
          seniority: m.wc_sen_roster,
        }))
      );
    }
  }, [membersList]);

  // Handle year selection change
  const handleYearChange = (year: YearType) => {
    setSelectedTimeOffYear(year);
  };

  // Filter members based on search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) {
      return membersList;
    }

    const query = searchQuery.toLowerCase().trim();
    return membersList.filter(
      (member: Member) =>
        member.first_name.toLowerCase().includes(query) ||
        member.last_name.toLowerCase().includes(query) ||
        member.pin_number.toString().includes(query)
    );
  }, [membersList, searchQuery]);

  // Calculate weeks to bid
  const calculateWeeksToBid = (vacationWeeks: number, vacationSplit: number) => {
    return Math.max(0, vacationWeeks - vacationSplit);
  };

  // Handle field changes
  const handleFieldChange = (pinNumber: number, field: string, value: any) => {
    // Explicitly add this console log to debug
    console.log(`Setting ${field} for member ${pinNumber} to ${value}`);

    // Update the store state
    setTimeOffChange(pinNumber, field, value);

    // If vacation split changed, update SDVs automatically
    if (field === "curr_vacation_split" || field === "next_vacation_split") {
      const year = field.startsWith("curr") ? "current" : "next";
      calculateAndUpdateSDVs(pinNumber, value, year);
    }
  };

  // Save changes for a single member
  const handleSaveMember = async (pinNumber: number) => {
    if (!timeOffChanges[pinNumber]) return;

    // Set loading state for this specific member
    setIsSaving((prev) => ({ ...prev, [pinNumber]: true }));

    try {
      // Get only the changes for this specific member
      const memberChanges = timeOffChanges[pinNumber];

      // Use the new function that updates a single member without reloading everything
      const success = await updateSingleMemberTimeOff(pinNumber, memberChanges, selectedTimeOffYear);

      if (!success) {
        console.error("Failed to save changes for member:", pinNumber);
      }
    } catch (err) {
      console.error("Error saving changes for member:", pinNumber, err);
    } finally {
      // Clear loading state for this specific member
      setIsSaving((prev) => {
        const newState = { ...prev };
        delete newState[pinNumber];
        return newState;
      });
    }
  };

  // Render the year selector component
  const renderYearSelector = () => {
    const currentYear = new Date().getFullYear();

    return (
      <View style={styles.yearSelectorContainer}>
        <ThemedText style={styles.yearSelectorLabel}>View/Edit Time Off for:</ThemedText>
        <View style={styles.yearButtonsContainer}>
          <TouchableOpacity
            style={[styles.yearButton, selectedTimeOffYear === "current" && styles.selectedYearButton]}
            onPress={() => handleYearChange("current")}
            disabled={isTimeOffLoading}
          >
            <ThemedText
              style={[styles.yearButtonText, selectedTimeOffYear === "current" && styles.selectedYearButtonText]}
            >
              {currentYear} (Current)
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.yearButton, selectedTimeOffYear === "next" && styles.selectedYearButton]}
            onPress={() => handleYearChange("next")}
            disabled={isTimeOffLoading}
          >
            <ThemedText
              style={[styles.yearButtonText, selectedTimeOffYear === "next" && styles.selectedYearButtonText]}
            >
              {currentYear + 1} (Next)
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Render the search bar
  const renderSearchBar = () => {
    return (
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors[colorScheme].text} />
        <TextInput
          style={[styles.searchInput, { color: Colors[colorScheme].text }]}
          placeholder="Search by name or PIN..."
          placeholderTextColor={Colors[colorScheme].textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Render the table header
  const renderTableHeader = () => {
    return (
      <View style={styles.tableHeader}>
        <ThemedText style={[styles.headerCell, { flex: 2 }]}>Name</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>PIN</ThemedText>
        <ThemedText style={[styles.headerCell, { flex: 1.5 }]}>Hire Date</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>Vacation Weeks</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>Vacation Split</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>Weeks to Bid</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>PLDs</ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>SDVs</ThemedText>
        <ThemedText style={[styles.headerCell, { width: 60, textAlign: "center" }]}>Action</ThemedText>
      </View>
    );
  };

  // Render table rows
  const renderTableRows = () => {
    if (isTimeOffLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading members...</ThemedText>
        </View>
      );
    }

    if (filteredMembers.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyText}>
            {searchQuery ? "No members match your search." : "No members found in this division."}
          </ThemedText>
        </View>
      );
    }

    return filteredMembers.map((member: Member) => {
      const isCurrentYear = selectedTimeOffYear === "current";
      const originalVacationWeeks = isCurrentYear ? member.curr_vacation_weeks : member.next_vacation_weeks;
      const originalVacationSplit = isCurrentYear ? member.curr_vacation_split : member.next_vacation_split;

      // Get values from changes if they exist
      const pinChanges = timeOffChanges[member.pin_number] || {};
      const vacationWeeks = isCurrentYear
        ? pinChanges.curr_vacation_weeks !== undefined
          ? pinChanges.curr_vacation_weeks
          : originalVacationWeeks
        : pinChanges.next_vacation_weeks !== undefined
        ? pinChanges.next_vacation_weeks
        : originalVacationWeeks;

      const vacationSplit = isCurrentYear
        ? pinChanges.curr_vacation_split !== undefined
          ? pinChanges.curr_vacation_split
          : originalVacationSplit
        : pinChanges.next_vacation_split !== undefined
        ? pinChanges.next_vacation_split
        : originalVacationSplit;

      // For the SDVs, check if we should use the value from changes or the original
      let sdvs: number;
      if (isCurrentYear) {
        // For current year, use sdv_entitlement
        sdvs = pinChanges.sdv_entitlement !== undefined ? pinChanges.sdv_entitlement : member.sdv_entitlement;
      } else {
        // For next year, use sdv_election
        sdvs = pinChanges.sdv_election !== undefined ? pinChanges.sdv_election : member.sdv_election;
      }

      const weeksToBid = calculateWeeksToBid(vacationWeeks, vacationSplit);

      // Check if this member has any changes
      const hasChangesForMember = !!timeOffChanges[member.pin_number];
      // Check if we're currently saving this member
      const isSavingThisMember = !!isSaving[member.pin_number];

      return (
        <View key={member.pin_number} style={styles.tableRow}>
          <ThemedText style={[styles.cell, { flex: 2 }]}>{`${member.first_name} ${member.last_name}`}</ThemedText>
          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{member.pin_number}</ThemedText>
          <ThemedText style={[styles.cell, { flex: 1.5 }]}>
            {new Date(member.company_hire_date).toLocaleDateString()}
          </ThemedText>
          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{vacationWeeks}</ThemedText>

          {/* Editable vacation split as dropdown */}
          <View style={[styles.cell, { alignItems: "center" }]}>
            {Platform.OS === "web" ? (
              <View style={styles.selectContainer}>
                <select
                  style={{
                    ...Platform.select({
                      web: {
                        backgroundColor: Colors[colorScheme].background,
                        color: Colors[colorScheme].text,
                        border: `1px solid ${Colors[colorScheme].border}`,
                        borderRadius: "4px",
                        padding: "4px 8px",
                        outlineStyle: "none",
                        width: "100%",
                        cursor: "pointer",
                        fontSize: "14px",
                      },
                    }),
                  }}
                  value={vacationSplit}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value, 10);
                    // Ensure we update both the local state and store
                    handleFieldChange(
                      member.pin_number,
                      isCurrentYear ? "curr_vacation_split" : "next_vacation_split",
                      newValue
                    );
                  }}
                  disabled={isTimeOffLoading || isSavingThisMember}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </View>
            ) : (
              // On native, use a picker-style selector
              <TouchableOpacity
                style={styles.selectContainer}
                disabled={isTimeOffLoading || isSavingThisMember}
                onPress={() => {
                  const newSplit = (vacationSplit + 1) % 3;
                  handleFieldChange(
                    member.pin_number,
                    isCurrentYear ? "curr_vacation_split" : "next_vacation_split",
                    newSplit
                  );
                }}
              >
                <ThemedText style={styles.selectText}>{vacationSplit}</ThemedText>
                <Ionicons name="chevron-down" size={16} color={Colors[colorScheme].text} />
              </TouchableOpacity>
            )}
          </View>

          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{weeksToBid}</ThemedText>
          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{member.max_plds}</ThemedText>
          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{sdvs}</ThemedText>

          {/* Save button for this row */}
          <View style={[styles.cell, { width: 60, alignItems: "center", justifyContent: "center" }]}>
            <TouchableOpacity
              style={[styles.rowSaveButton, !hasChangesForMember && styles.rowSaveButtonDisabled]}
              disabled={!hasChangesForMember || isTimeOffLoading || isSavingThisMember}
              onPress={() => handleSaveMember(member.pin_number)}
            >
              {isSavingThisMember ? (
                <ActivityIndicator size="small" color={Colors.light.background} />
              ) : (
                <Ionicons
                  name="save-outline"
                  size={18}
                  color={hasChangesForMember ? Colors.light.background : Colors[colorScheme].textDim}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        {renderYearSelector()}
        {renderSearchBar()}
      </View>

      {timeOffError ? (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{timeOffError}</ThemedText>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              // Reload data on retry
              if (selectedDivision) {
                const divisionId = member?.division_id || 0; // Replace with actual division ID
                fetchMemberTimeOffData(divisionId);
              }
            }}
          >
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Main content in a relative container - no more need for the saveButtonContainer */}
          <View style={styles.contentWithSaveButton}>
            {/* Table area */}
            <View style={styles.tableContainer}>
              {renderTableHeader()}
              <ScrollView style={styles.tableScrollView}>
                {renderTableRows()}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  contentWithSaveButton: {
    flex: 1,
    position: "relative",
  },
  yearSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  },
  yearSelectorLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginRight: 16,
  },
  yearButtonsContainer: {
    flexDirection: "row",
  },
  yearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginRight: 8,
  },
  selectedYearButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  yearButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedYearButtonText: {
    color: Colors.light.background,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    padding: 0,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
    }),
  },
  tableContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.light.background,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerCell: {
    flex: 1,
    fontWeight: "600",
    fontSize: 14,
  },
  tableScrollView: {
    flex: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cell: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  selectContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderColor: Colors.light.border,
    borderRadius: 4,
    minWidth: 60,
    width: "70%",
  },
  selectText: {
    fontSize: 14,
  },
  loadingContainer: {
    padding: 24,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textDim,
  },
  errorContainer: {
    padding: 24,
    alignItems: "center",
  },
  errorText: {
    color: Colors.light.error,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.light.background,
    fontWeight: "500",
  },
  rowSaveButton: {
    backgroundColor: Colors.light.tint,
    borderRadius: 4,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  rowSaveButtonDisabled: {
    backgroundColor: Colors.light.border,
  },
});
