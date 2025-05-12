import React, { useState, useEffect } from "react";
import { StyleSheet, View, VirtualizedList, TextInput, Platform, useWindowDimensions } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { Roster, RosterMember, RosterDisplayField } from "@/types/rosters";

interface RosterDetailsProps {
  roster: Roster;
  onBack: () => void;
  onExportPdf: (members: RosterMember[], rosterType: string, selectedFields: RosterDisplayField[]) => void;
}

export function RosterDetails({ roster, onBack, onExportPdf }: RosterDetailsProps) {
  const { width } = useWindowDimensions();
  const isMobileView = width < 768;
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const [members, setMembers] = useState<RosterMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFields, setSelectedFields] = useState<RosterDisplayField[]>([
    "rank",
    "name",
    "pin_number",
    "system_sen_type",
    "engineer_date",
    "zone_name",
    "division_name",
  ]);
  const [rosterType, setRosterType] = useState("");

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
    fetchRosterData();
  }, [roster]);

  const fetchRosterData = async () => {
    setIsLoading(true);
    try {
      // First, get the roster type name
      const { data: rosterTypeData, error: typeError } = await supabase
        .from("roster_types")
        .select("name")
        .eq("id", roster.roster_type_id)
        .single();

      if (typeError) throw typeError;

      setRosterType(rosterTypeData?.name || "");

      // Then get roster entries with member details
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
        .eq("roster_id", roster.id)
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
          // Add any details from the roster_entries.details field
          ...entry.details,
        };
      });

      setMembers(membersList);
    } catch (error) {
      console.error("Error fetching roster details:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch roster details");
    } finally {
      setIsLoading(false);
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

  const toggleField = (field: RosterDisplayField) => {
    setSelectedFields((prev) => {
      // Always keep rank, name, and pin_number selected
      if (["rank", "name", "pin_number"].includes(field)) return prev;

      return prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
    });
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
        <View style={styles.headerTop}>
          <TouchableOpacityComponent style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={Colors[colorScheme].text} />
          </TouchableOpacityComponent>

          <ThemedText style={styles.rosterTitle}>{roster.name}</ThemedText>

          <TouchableOpacityComponent
            style={styles.exportButton}
            onPress={() => onExportPdf(filteredMembers, rosterType, selectedFields)}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={20} color={Colors[colorScheme].text} />
            <ThemedText style={styles.exportText}>Export PDF</ThemedText>
          </TouchableOpacityComponent>
        </View>

        <View style={styles.searchContainer}>
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
          <ThemedText>Loading roster details...</ThemedText>
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
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  rosterTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  exportText: {
    marginLeft: 4,
    fontSize: 14,
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    paddingHorizontal: 12,
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
