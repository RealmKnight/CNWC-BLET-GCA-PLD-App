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
import {
  useAdminCalendarManagementStore,
  calculateVacationWeeks,
  calculatePLDs,
} from "@/store/adminCalendarManagementStore";
import type { Member } from "@/store/adminCalendarManagementStore";
import type { Calendar } from "@/types/calendar";
import { CalendarFilter } from "./CalendarFilter";
import { supabase } from "@/utils/supabase";

interface TimeOffManagerProps {
  selectedDivision: string;
  selectedCalendarId: string | null;
}

type YearType = "current" | "next";

export function TimeOffManager({ selectedDivision, selectedCalendarId }: TimeOffManagerProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const { member, userRole } = useUserStore();

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});
  const [selectedFilterCalendarId, setSelectedFilterCalendarId] = useState<string | null>(null);
  const [availableCalendars, setAvailableCalendars] = useState<Calendar[]>([]);
  const [isCalendarsLoading, setIsCalendarsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Effect to track unsaved changes
  useEffect(() => {
    setHasUnsavedChanges(hasChanges);
  }, [hasChanges]);

  // Effect to handle division changes
  useEffect(() => {
    if (selectedDivision) {
      const loadDivisionData = async () => {
        try {
          // Get division_id from the database
          const { data: divisionData, error: divisionError } = await supabase
            .from("divisions")
            .select("id")
            .eq("name", selectedDivision)
            .single();

          if (divisionError) throw divisionError;
          if (!divisionData) {
            console.error("Division not found:", selectedDivision);
            return;
          }

          // Reset any existing changes before fetching new data
          resetTimeOffChanges();
          setHasUnsavedChanges(false); // Ensure the flag is reset

          // Fetch member data for the new division
          await fetchMemberTimeOffData(divisionData.id);

          // Reset calendar filter when switching divisions
          setSelectedFilterCalendarId(null);
        } catch (err) {
          console.error("Error loading division data:", err);
        }
      };

      loadDivisionData();
    }
  }, [selectedDivision, resetTimeOffChanges, fetchMemberTimeOffData]);

  // Effect to handle calendar changes
  useEffect(() => {
    if (selectedDivision) {
      const fetchCalendars = async () => {
        setIsCalendarsLoading(true);
        try {
          // First get the division ID
          const { data: divisionData, error: divisionError } = await supabase
            .from("divisions")
            .select("id")
            .eq("name", selectedDivision)
            .single();

          if (divisionError) throw divisionError;
          if (!divisionData) {
            console.error("Division not found:", selectedDivision);
            return;
          }

          // Then fetch calendars for this division
          const { data: calendars, error: calendarsError } = await supabase
            .from("calendars")
            .select("*")
            .eq("division_id", divisionData.id)
            .eq("is_active", true)
            .order("name");

          if (calendarsError) throw calendarsError;

          console.log("Fetched calendars:", calendars);
          setAvailableCalendars(calendars || []);

          // If user is division_admin, automatically select their calendar
          if (userRole === "division_admin" && member?.calendar_id) {
            setSelectedFilterCalendarId(member.calendar_id);
          }
        } catch (err) {
          console.error("Error fetching calendars:", err);
          setAvailableCalendars([]);
        } finally {
          setIsCalendarsLoading(false);
        }
      };

      fetchCalendars();
    }
  }, [selectedDivision, userRole, member?.calendar_id]);

  // Add a debug log to check if changes are detected
  useEffect(() => {
    console.log("Time off changes:", timeOffChanges);
    console.log("Has changes:", hasChanges);
  }, [timeOffChanges, hasChanges]);

  // Update membersList type
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

  // Effect to automatically stage changes if calculated values differ from stored ones
  const prevMembersListRef = React.useRef<Member[]>();
  useEffect(() => {
    // Access the original, potentially unmodified data directly from the store state
    const originalMemberData = useAdminCalendarManagementStore.getState().memberTimeOffData;

    membersList.forEach((member: Member) => {
      if (!member || !originalMemberData[member.pin_number]) return; // Skip if member data is missing

      const pinNumber = member.pin_number;
      const originalData = originalMemberData[pinNumber];
      const existingChanges = timeOffChanges[pinNumber] || {};

      const isCurrentYear = selectedTimeOffYear === "current";

      // Determine the reference date for calculation
      const currentReferenceDate = new Date();
      const nextReferenceDate = new Date();
      nextReferenceDate.setFullYear(currentReferenceDate.getFullYear() + 1);
      const referenceDate = isCurrentYear ? currentReferenceDate : nextReferenceDate;

      // --- Check Vacation Weeks ---
      const calculatedVacationWeeks = calculateVacationWeeks(member.company_hire_date, referenceDate);
      const originalVacationField = isCurrentYear ? "curr_vacation_weeks" : "next_vacation_weeks";
      const originalVacationValue = originalData[originalVacationField];

      // ---- REMOVE Detailed Logging ----
      const isFieldManuallyChanged = existingChanges[originalVacationField] !== undefined;
      const valuesDiffer = calculatedVacationWeeks !== originalVacationValue;
      // console.log( // <-- REMOVE
      //   `[TimeOffManager Debug - ${pinNumber} (${originalVacationField})] Calculated: ${calculatedVacationWeeks} (Type: ${typeof calculatedVacationWeeks}), Original: ${originalVacationValue} (Type: ${typeof originalVacationValue}), Differs: ${valuesDiffer}, Manually Changed: ${isFieldManuallyChanged}`
      // );
      // ---- End REMOVE Detailed Logging ----

      // If calculated value differs from original AND user hasn't already changed it
      if (valuesDiffer && !isFieldManuallyChanged) {
        // console.log( // <-- Keep this potentially useful log for now
        //   `[TimeOffManager] Staging calculated ${originalVacationField} change for ${pinNumber}: ${originalVacationValue} -> ${calculatedVacationWeeks}`
        // );
        // Use a timeout to avoid triggering state updates during render cycle if possible
        // and prevent potential infinite loops if calculateVacationWeeks had side effects (it shouldn't)
        setTimeout(() => {
          // ---- REMOVE Logging inside setTimeout ----
          // console.log( // <-- REMOVE
          //   `[TimeOffManager Debug - ${pinNumber}] Calling setTimeOffChange for ${originalVacationField} with value ${calculatedVacationWeeks} inside setTimeout`
          // );
          // ---- End REMOVE Logging inside setTimeout ----
          setTimeOffChange(pinNumber, originalVacationField, calculatedVacationWeeks);
        }, 0);
      }

      // --- Optionally Check PLDs (but likely not needed based on rules) ---
      // const calculatedPlds = calculatePLDs(member.company_hire_date, referenceDate);
      // const originalPldValue = originalData.max_plds; // Assuming max_plds always reflects current
      // if (calculatedPlds !== originalPldValue && existingChanges['max_plds'] === undefined) {
      //   // console.log(`[TimeOffManager] Staging calculated PLD change for ${pinNumber}: ${originalPldValue} -> ${calculatedPlds}`);
      //   // setTimeOffChange(pinNumber, 'max_plds', calculatedPlds); // Be cautious enabling this
      // }
    });
    // Depend on membersList and selectedTimeOffYear to re-run checks when they change.
    // Also include setTimeOffChange in dependency array as per linting rules.
  }, [membersList, selectedTimeOffYear, setTimeOffChange]);

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

  // Add debug logging when calendar selection changes
  useEffect(() => {
    console.log("Calendar selection changed:", {
      selectedCalendarId: selectedFilterCalendarId,
      availableCalendars: availableCalendars.map((cal) => ({
        id: cal.id,
        name: cal.name,
      })),
    });
  }, [selectedFilterCalendarId, availableCalendars]);

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
        <View style={styles.yearSelectorAndButtonContainer}>
          <View style={styles.yearSelectorContent}>
            <ThemedText style={styles.yearSelectorLabel}>View/Edit Time Off for:</ThemedText>
          </View>
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
          <TouchableOpacity
            style={[styles.saveAllButton, !hasChanges && styles.saveAllButtonDisabled]}
            disabled={!hasChanges || isTimeOffLoading}
            onPress={handleSaveAllChanges}
          >
            {isTimeOffLoading ? (
              <ActivityIndicator size="small" color={Colors.light.background} />
            ) : (
              <>
                <Ionicons
                  name="save-outline"
                  size={18}
                  color={hasChanges ? Colors.light.background : Colors[colorScheme].textDim}
                />
                <ThemedText style={[styles.saveAllButtonText, !hasChanges && styles.saveAllButtonTextDisabled]}>
                  Save All
                </ThemedText>
              </>
            )}
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
        <ThemedText style={[styles.headerCell, { flex: isMobile ? 2.5 : 2 }]}>Name</ThemedText>
        {!isMobile && <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>PIN</ThemedText>}
        {!isMobile && <ThemedText style={[styles.headerCell, { flex: 1.5 }]}>Hire Date</ThemedText>}
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>
          {isMobile ? "Vac Wks" : "Vacation Weeks"}
        </ThemedText>
        <ThemedText style={[styles.headerCell, { textAlign: "center" }]}>
          {isMobile ? "Vac Splt" : "Vacation Split"}
        </ThemedText>
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
      const pinChanges = timeOffChanges[member.pin_number] || {};

      // Determine the reference date for calculation based on selected year
      const currentReferenceDate = new Date();
      const nextReferenceDate = new Date();
      nextReferenceDate.setFullYear(currentReferenceDate.getFullYear() + 1);
      const referenceDate = isCurrentYear ? currentReferenceDate : nextReferenceDate;

      // Calculate the correct base entitlements for the selected year
      const calculatedVacationWeeks = calculateVacationWeeks(member.company_hire_date, referenceDate);
      const calculatedPlds = calculatePLDs(member.company_hire_date, referenceDate);

      // Determine displayed vacation weeks: prioritize changes, then use calculated value
      const vacationWeeks = isCurrentYear
        ? pinChanges.curr_vacation_weeks !== undefined
          ? pinChanges.curr_vacation_weeks
          : calculatedVacationWeeks
        : pinChanges.next_vacation_weeks !== undefined
        ? pinChanges.next_vacation_weeks
        : calculatedVacationWeeks;

      // Determine displayed vacation split: prioritize changes, then use original value
      const originalVacationSplit = isCurrentYear ? member.curr_vacation_split : member.next_vacation_split;
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

      // Calculate weeks to bid based on the *displayed* vacationWeeks and vacationSplit
      const weeksToBid = calculateWeeksToBid(vacationWeeks, vacationSplit);

      // Determine displayed PLDs (use calculated value for the selected year)
      // Assuming PLDs aren't directly editable here, so no need to check timeOffChanges
      const displayPlds = calculatedPlds;

      // Check if this member has any changes
      const hasChangesForMember = !!timeOffChanges[member.pin_number];
      // Check if we're currently saving this member
      const isSavingThisMember = !!isSaving[member.pin_number];

      return (
        <View key={member.pin_number} style={styles.tableRow}>
          <ThemedText
            style={[styles.cell, { flex: isMobile ? 2.5 : 2 }]}
          >{`${member.first_name} ${member.last_name}`}</ThemedText>
          {!isMobile && <ThemedText style={[styles.cell, { textAlign: "center" }]}>{member.pin_number}</ThemedText>}
          {!isMobile && (
            <ThemedText style={[styles.cell, { flex: 1.5 }]}>
              {new Date(member.company_hire_date).toLocaleDateString()}
            </ThemedText>
          )}
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
          <ThemedText style={[styles.cell, { textAlign: "center" }]}>{displayPlds}</ThemedText>
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

  // Add this new handler function before the return statement
  const handleSaveAllChanges = async () => {
    if (!hasChanges) return;

    try {
      // Convert timeOffChanges to array format expected by updateMemberTimeOff
      const changes = Object.entries(timeOffChanges).map(([pinNumber, fields]) => ({
        pin_number: parseInt(pinNumber, 10),
        ...fields,
      }));

      const success = await updateMemberTimeOff(changes, selectedTimeOffYear);

      if (success) {
        // Changes saved successfully
        console.log("All changes saved successfully");
      } else {
        // Handle save failure
        console.error("Failed to save all changes");
      }
    } catch (error) {
      console.error("Error saving all changes:", error);
    }
  };

  // Filter members based on search query and selected calendar
  const filteredMembers = useMemo(() => {
    let filtered = membersList;

    // Debug log for initial state
    console.log("Filtering members:", {
      totalMembers: membersList.length,
      selectedCalendarId: selectedFilterCalendarId,
      sampleMember: membersList[0]
        ? {
            name: `${membersList[0].first_name} ${membersList[0].last_name}`,
            calendar_id: membersList[0].calendar_id,
          }
        : null,
    });

    // Apply calendar filter if selected
    if (selectedFilterCalendarId) {
      filtered = filtered.filter((member: Member) => {
        const matches = member.calendar_id === selectedFilterCalendarId;
        // Debug log for each member that doesn't match
        if (!matches) {
          console.log("Member calendar mismatch:", {
            memberName: `${member.first_name} ${member.last_name}`,
            memberCalendarId: member.calendar_id,
            selectedCalendarId: selectedFilterCalendarId,
            typeMemberCalendarId: typeof member.calendar_id,
            typeSelectedCalendarId: typeof selectedFilterCalendarId,
          });
        }
        return matches;
      });
      // Debug log after calendar filtering
      console.log("After calendar filter:", {
        remainingMembers: filtered.length,
        selectedCalendarId: selectedFilterCalendarId,
      });
    }

    // Apply search filter if there's a search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (member: Member) =>
          member.first_name.toLowerCase().includes(query) ||
          member.last_name.toLowerCase().includes(query) ||
          member.pin_number.toString().includes(query)
      );
    }

    return filtered;
  }, [membersList, selectedFilterCalendarId, searchQuery]);

  // Handle year selection change
  const handleYearChange = (year: YearType) => {
    setSelectedTimeOffYear(year);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <CalendarFilter
          calendars={availableCalendars}
          selectedCalendarId={selectedFilterCalendarId}
          onSelectCalendar={setSelectedFilterCalendarId}
          style={styles.calendarFilter}
          isLoading={isCalendarsLoading}
        />
        {renderYearSelector()}
        {renderSearchBar()}
      </View>

      {timeOffError ? (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{timeOffError}</ThemedText>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              if (selectedDivision) {
                const divisionId = member?.division_id || 0;
                fetchMemberTimeOffData(divisionId);
              }
            }}
          >
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.contentWithSaveButton}>
            <View style={styles.tableContainer}>
              {renderTableHeader()}
              <View style={{ flex: 1 }}>
                <ScrollView style={styles.tableScrollView} nestedScrollEnabled={true} scrollEnabled={true}>
                  {renderTableRows()}
                </ScrollView>
              </View>
            </View>
            <View style={styles.bottomSaveButtonContainer}>
              <TouchableOpacity
                style={[styles.saveAllButton, !hasChanges && styles.saveAllButtonDisabled]}
                disabled={!hasChanges || isTimeOffLoading}
                onPress={handleSaveAllChanges}
              >
                {isTimeOffLoading ? (
                  <ActivityIndicator size="small" color={Colors.light.background} />
                ) : (
                  <>
                    <Ionicons
                      name="save-outline"
                      size={18}
                      color={hasChanges ? Colors.light.background : Colors[colorScheme].textDim}
                    />
                    <ThemedText style={[styles.saveAllButtonText, !hasChanges && styles.saveAllButtonTextDisabled]}>
                      Save All
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
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
  yearSelectorAndButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  } as const,
  yearSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  } as const,
  yearSelectorLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginRight: 16,
  },
  yearButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingBottom: 4,
  },
  yearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 8,
    backgroundColor: Colors.dark.card,
  },
  selectedYearButton: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  yearButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedYearButtonText: {
    color: Colors.dark.buttonText,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    borderColor: Colors.dark.border,
    borderRadius: 8,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.dark.card,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerCell: {
    flex: 1,
    fontWeight: "600",
    fontSize: 14,
  },
  tableScrollView: {},
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
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
    borderColor: Colors.dark.border,
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
    color: Colors.dark.textDim,
  },
  errorContainer: {
    padding: 24,
    alignItems: "center",
  },
  errorText: {
    color: Colors.dark.error,
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.dark.tint,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
  },
  rowSaveButton: {
    backgroundColor: Colors.dark.tint,
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
    backgroundColor: Colors.dark.border,
  },
  calendarFilter: {
    marginBottom: 16,
  },
  saveAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 16,
  } as const,
  saveAllButtonDisabled: {
    backgroundColor: Colors.dark.border,
  } as const,
  saveAllButtonText: {
    color: Colors.dark.buttonText,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
  } as const,
  saveAllButtonTextDisabled: {
    color: Colors.dark.textDim,
  } as const,
  bottomSaveButtonContainer: {
    position: "relative",
    alignItems: "flex-end",
    paddingTop: 16,
  } as const,
});
