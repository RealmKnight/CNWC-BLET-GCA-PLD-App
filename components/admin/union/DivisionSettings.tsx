import React, { useState, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";

export const DivisionSettings = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];
  const [isDivisionListVisible, setIsDivisionListVisible] = useState(false);

  const {
    divisions,
    zones,
    isLoadingDivisions,
    selectedDivisionId,
    setSelectedDivisionId,
    fetchDivisions,
    fetchZonesForDivision,
  } = useDivisionManagementStore();

  // Get the selected division
  const selectedDivision = divisions.find((div) => div.id === selectedDivisionId);

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  // Fetch zones when selectedDivisionId changes
  useEffect(() => {
    if (selectedDivisionId) {
      fetchZonesForDivision(selectedDivisionId);
    }
  }, [selectedDivisionId, fetchZonesForDivision]);

  const toggleDivisionList = () => {
    setIsDivisionListVisible(!isDivisionListVisible);
  };

  if (isLoadingDivisions && divisions.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={themeColor.tint} />
        <ThemedText style={styles.loadingText}>Loading divisions...</ThemedText>
      </ThemedView>
    );
  }

  if (divisions.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="information-circle-outline" size={48} color={themeColor.text} />
        <ThemedText style={styles.emptyText}>No divisions found</ThemedText>
        <ThemedText style={styles.instructionText}>Create divisions first before accessing settings</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.divisionSelector}>
        <TouchableOpacity onPress={toggleDivisionList} style={styles.filterHeader}>
          <ThemedView style={styles.filterLabelContainer}>
            <ThemedText style={styles.selectorLabel}>Select Division:</ThemedText>
            {!isDivisionListVisible && (
              <ThemedText style={styles.selectedDivisionText}>
                {selectedDivisionId ? selectedDivision?.name : "Select a division"}
              </ThemedText>
            )}
          </ThemedView>
          <Ionicons name={isDivisionListVisible ? "chevron-up" : "chevron-down"} size={20} color={themeColor.text} />
        </TouchableOpacity>

        {isDivisionListVisible && (
          <ThemedView style={styles.divisionListWrapper}>
            <View style={styles.divisionList}>
              {divisions.map((division) => (
                <TouchableOpacity
                  key={division.id}
                  style={[styles.divisionChip, selectedDivisionId === division.id && styles.divisionChipSelected]}
                  onPress={() => {
                    setSelectedDivisionId(division.id);
                    setIsDivisionListVisible(false);
                  }}
                >
                  <ThemedText
                    style={[
                      styles.divisionChipText,
                      selectedDivisionId === division.id && styles.divisionChipTextSelected,
                    ]}
                  >
                    {division.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </ThemedView>
        )}
      </ThemedView>

      {selectedDivisionId ? (
        <ScrollView
          style={styles.settingsScrollContainer}
          contentContainerStyle={styles.settingsScrollContent}
          showsVerticalScrollIndicator={true}
          bounces={false}
        >
          <SettingsPanel />
        </ScrollView>
      ) : (
        <ThemedView style={styles.selectPrompt}>
          <ThemedText>Please select a division to manage settings</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
};

const SettingsPanel = () => {
  const { selectedDivisionId, divisions, zones } = useDivisionManagementStore();
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];
  const [sortOrder, setSortOrder] = useState<string>("wc_sen_roster");
  const [isUpdatingSortOrder, setIsUpdatingSortOrder] = useState(false);

  const selectedDivision = divisions.find((d) => d.id === selectedDivisionId);
  const divisionZones = selectedDivisionId ? zones[selectedDivisionId] || [] : [];

  // Check if division has at least one zone
  const hasNoZones = divisionZones.length === 0;

  // Sort order options
  const sortOrderOptions = [
    { label: "Wisconsin Central (WC)", value: "wc_sen_roster" },
    { label: "Duluth, Winnipeg & Pacific (DWP)", value: "dwp_sen_roster" },
    { label: "Duluth, Missabe & Iron Range (DMIR)", value: "dmir_sen_roster" },
    { label: "Elgin, Joliet & Eastern (EJ&E)", value: "eje_sen_roster" },
  ];

  // Fetch current sort order when division changes
  useEffect(() => {
    if (selectedDivisionId) {
      fetchCurrentSortOrder();
    }
  }, [selectedDivisionId]);

  const fetchCurrentSortOrder = async () => {
    try {
      const { data, error } = await supabase
        .from("divisions")
        .select("default_sort_order")
        .eq("id", selectedDivisionId)
        .single();

      if (error) throw error;
      setSortOrder(data.default_sort_order || "wc_sen_roster");
    } catch (error) {
      console.error("Error fetching sort order:", error);
    }
  };

  const updateSortOrder = async (newSortOrder: string) => {
    if (!selectedDivisionId) return;

    setIsUpdatingSortOrder(true);
    try {
      const { error } = await supabase
        .from("divisions")
        .update({ default_sort_order: newSortOrder })
        .eq("id", selectedDivisionId);

      if (error) throw error;
      setSortOrder(newSortOrder);
    } catch (error) {
      console.error("Error updating sort order:", error);
    } finally {
      setIsUpdatingSortOrder(false);
    }
  };

  return (
    <ThemedView style={styles.settingsContainer}>
      <ThemedView style={styles.settingsHeader}>
        <ThemedText style={styles.settingsTitle}>{selectedDivision?.name} Division Settings</ThemedText>
      </ThemedView>

      {hasNoZones && (
        <ThemedView style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={24} color={themeColor.warning} />
          <ThemedText style={[styles.warningText, { color: themeColor.warning }]}>
            This division has no zones. All divisions must have at least one zone.
          </ThemedText>
        </ThemedView>
      )}

      <ThemedView style={styles.settingSection}>
        <ThemedText style={styles.settingSectionTitle}>General Settings</ThemedText>
        <View style={styles.settingItem}>
          <ThemedText style={styles.settingLabel}>Division ID:</ThemedText>
          <ThemedText>{selectedDivisionId}</ThemedText>
        </View>
        <View style={styles.settingItem}>
          <ThemedText style={styles.settingLabel}>Name:</ThemedText>
          <ThemedText>{selectedDivision?.name}</ThemedText>
        </View>
        <View style={styles.settingItem}>
          <ThemedText style={styles.settingLabel}>Location:</ThemedText>
          <ThemedText>{selectedDivision?.location}</ThemedText>
        </View>
        <View style={styles.settingItem}>
          <ThemedText style={styles.settingLabel}>Total Zones:</ThemedText>
          <ThemedText>{divisionZones.length}</ThemedText>
        </View>
      </ThemedView>

      <ThemedView style={styles.settingSection}>
        <ThemedText style={styles.settingSectionTitle}>Zone Management</ThemedText>
        {divisionZones.length > 0 ? (
          <View style={styles.zonesList}>
            {divisionZones.map((zone) => (
              <View key={zone.id} style={styles.zoneListItem}>
                <ThemedText>{zone.name}</ThemedText>
                <ThemedText style={styles.zoneMemberCount}>{zone.member_count || 0} members</ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <ThemedView style={styles.noZonesContainer}>
            <ThemedText style={styles.emptyText}>No zones in this division</ThemedText>
            <ThemedText style={styles.instructionText}>
              Use the "Add Zone" button in the Divisions tab to add zones to this division
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      <ThemedView style={styles.settingSection}>
        <ThemedText style={styles.settingSectionTitle}>Member Display Settings</ThemedText>
        <ThemedText style={styles.settingDescription}>
          Choose the default roster order for displaying members in this division. This affects how members are sorted
          in the division member list.
        </ThemedText>

        <View style={styles.sortOrderContainer}>
          <ThemedText style={styles.settingLabel}>Default Sort Order:</ThemedText>
          <View style={styles.sortOrderOptions}>
            {sortOrderOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.sortOrderOption,
                  sortOrder === option.value && styles.sortOrderOptionSelected,
                  isUpdatingSortOrder && styles.sortOrderOptionDisabled,
                ]}
                onPress={() => !isUpdatingSortOrder && updateSortOrder(option.value)}
                disabled={isUpdatingSortOrder}
              >
                <Ionicons
                  name={sortOrder === option.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={sortOrder === option.value ? themeColor.tint : themeColor.text}
                />
                <ThemedText
                  style={[styles.sortOrderOptionText, sortOrder === option.value && styles.sortOrderOptionTextSelected]}
                >
                  {option.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          {isUpdatingSortOrder && (
            <View style={styles.updatingIndicator}>
              <ActivityIndicator size="small" color={themeColor.tint} />
              <ThemedText style={styles.updatingText}>Updating...</ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 16,
  },
  instructionText: {
    fontSize: 14,
    opacity: 0.7,
  },
  divisionSelector: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  selectedDivisionText: {
    fontSize: 15,
    marginLeft: 8,
    color: Colors.dark.tint,
    fontWeight: "500",
  },
  divisionListWrapper: {
    marginTop: 12,
  },
  divisionList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  divisionChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.dark.card,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  divisionChipSelected: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  divisionChipText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  divisionChipTextSelected: {
    color: Colors.dark.buttonText,
  },
  divisionButtonsContainer: {
    paddingRight: 16,
  },
  divisionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  divisionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.dark.card,
    marginRight: 8,
    marginBottom: 8,
  },
  divisionButtonText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  settingsScrollContainer: {
    flex: 1,
  },
  settingsScrollContent: {
    flexGrow: 1,
  },
  selectPrompt: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  settingsContainer: {
    padding: 16,
  },
  settingsHeader: {
    marginBottom: 24,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  warningText: {
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  settingSection: {
    marginBottom: 24,
    paddingBottom: 16,
    borderRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
    padding: 8,
  },
  settingSectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: "row",
    marginBottom: 12,
  },
  settingLabel: {
    fontWeight: "500",
    width: 120,
  },
  settingDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
  },
  sortOrderContainer: {
    marginTop: 8,
  },
  sortOrderOptions: {
    marginTop: 12,
  },
  sortOrderOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sortOrderOptionSelected: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  sortOrderOptionDisabled: {
    opacity: 0.5,
  },
  sortOrderOptionText: {
    fontSize: 14,
    color: Colors.dark.text,
    marginLeft: 12,
  },
  sortOrderOptionTextSelected: {
    color: Colors.dark.buttonText,
  },
  updatingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  updatingText: {
    marginLeft: 8,
    fontSize: 14,
    opacity: 0.7,
  },
  zonesList: {
    marginTop: 8,
  },
  zoneListItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 6,
    marginBottom: 8,
  },
  zoneMemberCount: {
    opacity: 0.7,
    fontSize: 14,
  },
  noZonesContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.03)",
    padding: 16,
    borderRadius: 8,
  },
});
