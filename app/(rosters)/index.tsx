import React, { useState, useEffect } from "react";
import { StyleSheet, View, ActivityIndicator, FlatList, useWindowDimensions, TextInput, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/utils/supabase";
import { Roster, RosterMember, RosterDisplayField } from "@/types/rosters";
import { getRosterMembers } from "@/utils/roster-utils";
import { generateRosterPdf } from "@/utils/roster-pdf-generator";
import { Select } from "@/components/ui/Select";

type ColorSchemeName = keyof typeof Colors;

// Roster types enum
const ROSTER_TYPES = ["WC", "DMIR", "DWP", "EJE"];

export default function RostersScreen() {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isMobileView = width < 768;

  const [selectedRosterType, setSelectedRosterType] = useState("WC");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<Roster | null>(null);
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Available years for the dropdown (current year and 7 previous years)
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 8 }, (_, i) => currentYear - i);

  // Fields to display in the roster view
  const [selectedFields, setSelectedFields] = useState<RosterDisplayField[]>([
    "rank",
    "name",
    "pin_number",
    "system_sen_type",
    "engineer_date",
    "zone_name",
    "home_zone_name",
    "division_name",
  ]);

  // Fetch roster types and saved rosters on component mount
  useEffect(() => {
    fetchRosters();
  }, [selectedYear, selectedRosterType]);

  // Fetch rosters for the selected year and type
  const fetchRosters = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get roster type ID
      const { data: typeData, error: typeError } = await supabase
        .from("roster_types")
        .select("id")
        .eq("name", selectedRosterType)
        .single();

      if (typeError) throw typeError;

      // Fetch rosters for selected year and type
      const { data: rostersData, error: rostersError } = await supabase
        .from("rosters")
        .select("*")
        .eq("year", selectedYear)
        .eq("roster_type_id", typeData.id)
        .order("effective_date", { ascending: false });

      if (rostersError) throw rostersError;

      setRosters(rostersData || []);

      // If rosters exist, select the most recent one
      if (rostersData && rostersData.length > 0) {
        setSelectedRoster(rostersData[0]);
        fetchRosterMembers(rostersData[0].id);
      } else {
        setSelectedRoster(null);
        setMembers([]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error fetching rosters:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch rosters");
      setIsLoading(false);
    }
  };

  // Fetch members for the selected roster
  const fetchRosterMembers = async (rosterId: string) => {
    setIsLoading(true);
    try {
      // Fetch roster entries with member details
      const { data: entriesData, error: entriesError } = await supabase
        .from("roster_entries")
        .select(
          `
          id,
          roster_id,
          member_pin_number,
          order_in_roster,
          details,
          members:member_pin_number (
            id,
            pin_number,
            first_name,
            last_name,
            system_sen_type,
            engineer_date,
            date_of_birth,
            prior_vac_sys,
            misc_notes,
            current_zone_id,
            home_zone_id,
            division_id
          )
        `
        )
        .eq("roster_id", rosterId)
        .order("order_in_roster", { ascending: true });

      if (entriesError) throw entriesError;

      // Fetch zones and divisions for names
      const { data: zones, error: zonesError } = await supabase.from("zones").select("id, name");
      if (zonesError) throw zonesError;

      const { data: divisions, error: divisionsError } = await supabase.from("divisions").select("id, name");
      if (divisionsError) throw divisionsError;

      // Create lookup maps
      const zoneMap = new Map(zones.map((zone: any) => [zone.id, zone.name]));
      const divisionMap = new Map(divisions.map((div: any) => [div.id, div.name]));

      // Transform data to match RosterMember format
      const membersList: RosterMember[] = entriesData.map((entry: any, index: number) => {
        const member = entry.members;
        return {
          id: member.id,
          pin_number: member.pin_number,
          first_name: member.first_name,
          last_name: member.last_name,
          system_sen_type: member.system_sen_type,
          engineer_date: member.engineer_date,
          date_of_birth: member.date_of_birth,
          prior_vac_sys: member.prior_vac_sys,
          misc_notes: member.misc_notes,
          current_zone_id: member.current_zone_id,
          home_zone_id: member.home_zone_id,
          division_id: member.division_id,
          // Add lookup values
          zone_name: member.current_zone_id ? zoneMap.get(member.current_zone_id) : undefined,
          home_zone_name: member.home_zone_id ? zoneMap.get(member.home_zone_id) : undefined,
          division_name: member.division_id ? divisionMap.get(member.division_id) : undefined,
          // Add rank
          rank: entry.order_in_roster || index + 1,
        };
      });

      setMembers(membersList);
    } catch (error) {
      console.error("Error fetching roster members:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch roster members");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle PDF export
  const handleExportPdf = async () => {
    try {
      await generateRosterPdf({
        members: filteredMembers,
        selectedFields,
        rosterType: selectedRosterType,
        title: `${selectedRosterType} Seniority Roster - ${selectedYear}`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError(error instanceof Error ? error.message : "Failed to generate PDF");
    }
  };

  // Filter members based on search query
  const filteredMembers = members.filter((member) => {
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

  // Render a member in the roster list
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

  // Render the year picker based on platform
  const renderYearPicker = () => {
    // Transform the years into options for Select
    const yearOptions = availableYears.map((year) => ({ label: year.toString(), value: year }));

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
            minWidth: 120,
          }}
        >
          {availableYears.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      );
    } else {
      // For mobile platforms, use the Select component
      return (
        <View style={styles.selectContainer}>
          <Select
            label="Year"
            value={selectedYear}
            onValueChange={(value) => setSelectedYear(value as number)}
            options={yearOptions}
          />
        </View>
      );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.typeSelector}>
          {ROSTER_TYPES.map((type) => (
            <TouchableOpacityComponent
              key={type}
              style={[styles.typeButton, selectedRosterType === type && { backgroundColor: "#B4975A" }]}
              onPress={() => setSelectedRosterType(type)}
            >
              <ThemedText
                style={[
                  styles.typeButtonText,
                  selectedRosterType === type && { color: Colors[colorScheme].background },
                ]}
              >
                {type}
              </ThemedText>
            </TouchableOpacityComponent>
          ))}
        </View>

        <View style={styles.yearSelectorContainer}>
          <View style={styles.yearSelector}>
            <ThemedText style={styles.selectorLabel}>Year:</ThemedText>
            {renderYearPicker()}
          </View>
        </View>

        <View style={styles.utilityRow}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={Colors[colorScheme].text} />
            <TextInput
              style={[styles.searchInput, { color: Colors[colorScheme].text }]}
              placeholder="Search roster..."
              placeholderTextColor={Colors[colorScheme].text + "80"}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacityComponent onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
              </TouchableOpacityComponent>
            ) : null}
          </View>

          <TouchableOpacityComponent
            style={styles.exportButton}
            onPress={handleExportPdf}
            disabled={members.length === 0}
          >
            <Ionicons name="download-outline" size={16} color={Colors.dark.buttonText} />
            <ThemedText style={styles.exportButtonText}>Export PDF</ThemedText>
          </TouchableOpacityComponent>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <ThemedText>Error: {error}</ThemedText>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.centerContent}>
          <ThemedText>
            No roster data available for {selectedRosterType} - {selectedYear}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          renderItem={renderMemberItem}
          keyExtractor={(item) => item.id || item.pin_number.toString()}
          contentContainerStyle={styles.listContent}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
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
  typeSelector: {
    flexDirection: "row",
    marginBottom: 16,
    justifyContent: "space-between",
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  yearSelectorContainer: {
    marginBottom: 16,
  },
  yearSelector: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorLabel: {
    marginRight: 8,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  yearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  yearText: {
    fontSize: 14,
  },
  utilityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    paddingVertical: 0,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#B4975A", // BLET gold
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  exportButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
    marginLeft: 6,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  memberRank: {
    backgroundColor: "#B4975A", // BLET gold
    width: 40,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  rankText: {
    color: Colors.dark.buttonText,
    fontWeight: "bold",
    fontSize: 16,
  },
  memberDetails: {
    flex: 1,
    padding: 12,
    backgroundColor: Colors.dark.card,
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
    marginBottom: 3,
  },
  selectContainer: {
    minWidth: 120,
    maxWidth: 200,
    ...Platform.select({
      ios: {
        minHeight: 60,
      },
      android: {
        minHeight: 65,
      },
    }),
  },
});
