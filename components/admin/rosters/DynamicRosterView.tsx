import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  VirtualizedList,
  TextInput,
  Switch,
  Platform,
  useWindowDimensions,
  Alert,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { RosterMember, RosterType, RosterDisplayField } from "@/types/rosters";
import { fetchRosterMembers, getRosterMembers, saveRosterToDatabase } from "@/utils/roster-utils";

interface DynamicRosterViewProps {
  onExportPdf: (members: RosterMember[], rosterType: string, selectedFields: RosterDisplayField[]) => void;
}

export function DynamicRosterView({ onExportPdf }: DynamicRosterViewProps) {
  const { width } = useWindowDimensions();
  const isMobileView = width < 768;
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");

  const [allMembers, setAllMembers] = useState<RosterMember[]>([]);
  const [displayMembers, setDisplayMembers] = useState<RosterMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<RosterType>("WC");
  const [applyOsl, setApplyOsl] = useState(false);
  const [isGeneratingYearlyRoster, setIsGeneratingYearlyRoster] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedFields, setSelectedFields] = useState<RosterDisplayField[]>([
    "rank",
    "name",
    "pin_number",
    "system_sen_type",
    "zone_name",
    "division_name",
  ]);

  // Available roster types
  const rosterTypes: Array<{ value: RosterType; label: string }> = [
    { value: "WC", label: "WC Roster" },
    { value: "DMIR", label: "DMIR Roster" },
    { value: "DWP", label: "DWP Roster" },
    { value: "EJE", label: "EJ&E Roster" },
  ];

  // Fields that can be selected for display
  const displayFields: { key: RosterDisplayField; label: string }[] = [
    { key: "rank", label: "Rank" },
    { key: "name", label: "Name" },
    { key: "pin_number", label: "PIN" },
    { key: "system_sen_type", label: "Prior Rights" },
    { key: "engineer_date", label: "Engineer Date" },
    { key: "date_of_birth", label: "Date of Birth" },
    { key: "zone_name", label: "Zone" },
    { key: "home_zone_name", label: "Home Zone" },
    { key: "division_name", label: "Division" },
    { key: "prior_vac_sys", label: "Prior Rights Rank" },
  ];

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (allMembers.length > 0) {
      generateRoster();
    }
  }, [allMembers, selectedType, applyOsl]);

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const members = await fetchRosterMembers();
      setAllMembers(members);
    } catch (error) {
      console.error("Error fetching members:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch members");
    } finally {
      setIsLoading(false);
    }
  };

  const generateRoster = () => {
    try {
      // Get the roster type with OSL prefix if needed
      const rosterType = applyOsl ? `osl-${selectedType}` : selectedType;

      // Use the utility to generate the roster
      const rosteredMembers = getRosterMembers(allMembers, rosterType);

      setDisplayMembers(rosteredMembers);
      setError(null);
    } catch (error) {
      console.error("Error generating roster:", error);
      setError(error instanceof Error ? error.message : "Failed to generate roster");
      setDisplayMembers([]);
    }
  };

  const generateYearlyRoster = async () => {
    setIsGeneratingYearlyRoster(true);
    setError(null);

    try {
      // Generate rosters for all types
      const yearlyRosters = [];

      for (const rosterType of rosterTypes) {
        // Generate standard roster only
        const members = getRosterMembers(allMembers, rosterType.value);
        yearlyRosters.push({
          type: rosterType.value,
          year: selectedYear,
          is_osl: false,
          members: members,
        });
      }

      // Save all generated rosters to database
      for (const roster of yearlyRosters) {
        await saveRosterToDatabase(roster.members, roster.type, roster.year, roster.is_osl);
      }

      // Success alert
      if (Platform.OS === "web") {
        alert(`Successfully generated and saved ${selectedYear} rosters for all types!`);
      } else {
        Alert.alert("Success", `Successfully generated and saved ${selectedYear} rosters for all types!`);
      }

      // Refresh the current view
      setSelectedType((prevType) => prevType);
    } catch (error) {
      console.error("Error generating yearly rosters:", error);
      setError(error instanceof Error ? error.message : "Failed to generate yearly rosters");

      if (Platform.OS === "web") {
        alert(`Failed to generate yearly rosters: ${error}`);
      } else {
        Alert.alert("Error", `Failed to generate yearly rosters: ${error}`);
      }
    } finally {
      setIsGeneratingYearlyRoster(false);
    }
  };

  // Filter members based on search query
  const filteredMembers = displayMembers.filter((member) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      `${member.first_name} ${member.last_name}`.toLowerCase().includes(query) ||
      member.pin_number.toString().includes(query) ||
      (member.system_sen_type && member.system_sen_type.toLowerCase().includes(query)) ||
      (member.zone_name && member.zone_name.toLowerCase().includes(query)) ||
      (member.division_name && member.division_name.toLowerCase().includes(query))
    );
  });

  const toggleField = (field: RosterDisplayField) => {
    setSelectedFields((prev) => {
      // Always keep rank, name, and pin_number selected
      if (["rank", "name", "pin_number"].includes(field)) return prev;

      return prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
    });
  };

  const renderTypeSelector = () => {
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as RosterType)}
          style={{
            height: 40,
            padding: 8,
            backgroundColor: Colors[colorScheme].background,
            color: Colors[colorScheme].text,
            borderColor: Colors[colorScheme].border,
            borderWidth: 1,
            borderRadius: 8,
            minWidth: 150,
          }}
        >
          {rosterTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      );
    } else {
      // For native platforms, we'd use buttons
      return (
        <View style={styles.typeButtonContainer}>
          {rosterTypes.map((type) => (
            <TouchableOpacityComponent
              key={type.value}
              style={[styles.typeButton, selectedType === type.value && { backgroundColor: themeTintColor }]}
              onPress={() => setSelectedType(type.value)}
            >
              <ThemedText style={selectedType === type.value ? styles.selectedTypeText : styles.typeText}>
                {type.label}
              </ThemedText>
            </TouchableOpacityComponent>
          ))}
        </View>
      );
    }
  };

  const renderYearSelector = () => {
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          style={{
            height: 40,
            padding: 8,
            backgroundColor: Colors[colorScheme].background,
            color: Colors[colorScheme].text,
            borderColor: Colors[colorScheme].border,
            borderWidth: 1,
            borderRadius: 8,
            minWidth: 100,
          }}
        >
          {[...Array(5)].map((_, i) => {
            const year = new Date().getFullYear() - 2 + i;
            return (
              <option key={year} value={year}>
                {year}
              </option>
            );
          })}
        </select>
      );
    } else {
      // For native platforms, we'd use buttons
      return (
        <View style={styles.typeButtonContainer}>
          {[...Array(5)].map((_, i) => {
            const year = new Date().getFullYear() - 2 + i;
            return (
              <TouchableOpacityComponent
                key={year}
                style={[styles.typeButton, selectedYear === year && { backgroundColor: themeTintColor }]}
                onPress={() => setSelectedYear(year)}
              >
                <ThemedText style={selectedYear === year ? styles.selectedTypeText : styles.typeText}>
                  {year}
                </ThemedText>
              </TouchableOpacityComponent>
            );
          })}
        </View>
      );
    }
  };

  const renderFieldSelector = () => (
    <View style={styles.fieldSelectorContainer}>
      <ThemedText style={styles.fieldSelectorTitle}>Display Fields:</ThemedText>
      <View style={styles.fieldChips}>
        {displayFields.map((field) => {
          const isSelected = selectedFields.includes(field.key);
          // Don't allow deselecting rank, name, and pin_number
          const isLocked = ["rank", "name", "pin_number"].includes(field.key);

          return (
            <TouchableOpacityComponent
              key={field.key}
              style={[styles.fieldChip, isSelected && styles.selectedFieldChip, isLocked && styles.lockedFieldChip]}
              onPress={() => !isLocked && toggleField(field.key)}
              activeOpacity={isLocked ? 1 : 0.7}
            >
              <ThemedText style={[styles.fieldChipText, isSelected && styles.selectedFieldChipText]}>
                {field.label}
                {isLocked && " *"}
              </ThemedText>
            </TouchableOpacityComponent>
          );
        })}
      </View>
      <ThemedText style={styles.fieldSelectorNote}>* Required fields</ThemedText>
    </View>
  );

  const renderMemberItem = ({ item }: { item: RosterMember }) => {
    const formatDate = (dateString?: string) => {
      if (!dateString) return "N/A";
      return new Date(dateString).toLocaleDateString();
    };

    return (
      <View style={styles.memberItem}>
        <View style={styles.memberRank}>
          <ThemedText style={styles.rankText}>{item.rank}</ThemedText>
        </View>
        <View style={styles.memberDetails}>
          <ThemedText style={styles.memberName}>
            {item.last_name}, {item.first_name}
          </ThemedText>
          <View style={styles.memberInfo}>
            <ThemedText style={styles.memberInfoText}>PIN: {item.pin_number}</ThemedText>

            {selectedFields.includes("system_sen_type") && (
              <ThemedText style={styles.memberInfoText}>Prior Rights: {item.system_sen_type || "N/A"}</ThemedText>
            )}

            {selectedFields.includes("engineer_date") && (
              <ThemedText style={styles.memberInfoText}>Engineer Date: {formatDate(item.engineer_date)}</ThemedText>
            )}

            {selectedFields.includes("date_of_birth") && (
              <ThemedText style={styles.memberInfoText}>DOB: {formatDate(item.date_of_birth)}</ThemedText>
            )}

            {selectedFields.includes("zone_name") && (
              <ThemedText style={styles.memberInfoText}>{item.zone_name || "N/A"}</ThemedText>
            )}

            {selectedFields.includes("home_zone_name") && (
              <ThemedText style={styles.memberInfoText}>Home Zone: {item.home_zone_name || "N/A"}</ThemedText>
            )}

            {selectedFields.includes("division_name") && (
              <ThemedText style={styles.memberInfoText}>Division: {item.division_name || "N/A"}</ThemedText>
            )}

            {selectedFields.includes("prior_vac_sys") && (
              <ThemedText style={styles.memberInfoText}>Prior Rights Rank: {item.prior_vac_sys || "N/A"}</ThemedText>
            )}
          </View>
        </View>
      </View>
    );
  };

  const getItem = (data: RosterMember[], index: number) => data[index];
  const getItemCount = (data: RosterMember[]) => data.length;
  const keyExtractor = (item: RosterMember) => item.id || item.pin_number.toString();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Dynamic Roster Generator</ThemedText>

        <View style={styles.controls}>
          <View style={styles.controlRow}>
            <ThemedText style={styles.controlLabel}>Roster Type:</ThemedText>
            {renderTypeSelector()}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacityComponent
              style={styles.exportButton}
              onPress={() => onExportPdf(filteredMembers, selectedType, selectedFields)}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={20} color={Colors[colorScheme].text} />
              <ThemedText style={styles.exportText}>Export PDF</ThemedText>
            </TouchableOpacityComponent>

            <View style={styles.yearlyRosterContainer}>
              <View style={styles.yearSelectorWrapper}>
                <ThemedText style={styles.controlLabel}>Year:</ThemedText>
                {renderYearSelector()}
              </View>

              <TouchableOpacityComponent
                style={[styles.generateYearlyButton, isGeneratingYearlyRoster && styles.disabledButton]}
                onPress={generateYearlyRoster}
                disabled={isGeneratingYearlyRoster}
                activeOpacity={isGeneratingYearlyRoster ? 1 : 0.7}
              >
                <Ionicons name="calendar-outline" size={20} color={Colors[colorScheme].text} />
                <ThemedText style={styles.exportText}>
                  {isGeneratingYearlyRoster ? "Generating..." : "Generate Yearly Rosters"}
                </ThemedText>
              </TouchableOpacityComponent>
            </View>
          </View>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={20} color={Colors[colorScheme].text} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: Colors[colorScheme].text }]}
              placeholder="Search members..."
              placeholderTextColor={Colors[colorScheme].text}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== "" && (
              <TouchableOpacityComponent
                style={styles.clearButton}
                onPress={() => setSearchQuery("")}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
              </TouchableOpacityComponent>
            )}
          </View>
        </View>

        {renderFieldSelector()}
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ThemedText>Loading members...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <ThemedText>Error: {error}</ThemedText>
        </View>
      ) : filteredMembers.length === 0 ? (
        <View style={styles.centerContent}>
          <ThemedText>No members found</ThemedText>
        </View>
      ) : (
        <VirtualizedList
          data={filteredMembers}
          renderItem={renderMemberItem}
          keyExtractor={keyExtractor}
          getItemCount={getItemCount}
          getItem={getItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  controls: {
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 8,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: Colors.dark.card,
  },
  controlLabel: {
    minWidth: 150,
    marginRight: 8,
  },
  typeButtonContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  typeText: {
    fontSize: 14,
  },
  selectedTypeText: {
    fontSize: 14,
    color: Colors.dark.buttonText,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    paddingRight: 40,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.border,
      outlineWidth: 0,
    }),
  },
  clearButton: {
    padding: 4,
    ...(Platform.OS === "web" && {
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }),
  },
  buttonContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: Colors.dark.border,
  },
  yearlyRosterContainer: {
    flexDirection: "column",
    marginBottom: 8,
  },
  yearSelectorWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  generateYearlyButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderColor: Colors.dark.border,
  },
  disabledButton: {
    opacity: 0.6,
  },
  exportText: {
    marginLeft: 4,
    fontSize: 14,
  },
  fieldSelectorContainer: {
    marginTop: 8,
  },
  fieldSelectorTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  fieldChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  fieldChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  selectedFieldChip: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  lockedFieldChip: {
    opacity: 0.6,
  },
  fieldChipText: {
    fontSize: 12,
  },
  selectedFieldChipText: {
    color: Colors.dark.buttonText,
  },
  fieldSelectorNote: {
    fontSize: 12,
    opacity: 0.6,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  memberItem: {
    flexDirection: "row",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    overflow: "hidden",
  },
  memberRank: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.tint,
    paddingVertical: 12,
  },
  rankText: {
    color: Colors.dark.buttonText,
    fontWeight: "bold",
  },
  memberDetails: {
    flex: 1,
    padding: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  memberInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  memberInfoText: {
    fontSize: 14,
    opacity: 0.8,
    marginRight: 12,
    marginBottom: 4,
  },
});
