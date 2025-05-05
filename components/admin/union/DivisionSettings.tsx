import React, { useState, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export const DivisionSettings = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const {
    divisions,
    zones,
    isLoadingDivisions,
    selectedDivisionId,
    setSelectedDivisionId,
    fetchDivisions,
    fetchZonesForDivision,
  } = useDivisionManagementStore();

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  // Fetch zones when selectedDivisionId changes
  useEffect(() => {
    if (selectedDivisionId) {
      fetchZonesForDivision(selectedDivisionId);
    }
  }, [selectedDivisionId, fetchZonesForDivision]);

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
        <ThemedText style={styles.selectorLabel}>Select Division:</ThemedText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.divisionButtonsContainer}
        >
          <View style={styles.divisionButtons}>
            {divisions.map((division) => (
              <TouchableOpacity
                key={division.id}
                style={[
                  styles.divisionButton,
                  selectedDivisionId === division.id && { backgroundColor: themeColor.tint },
                ]}
                onPress={() => setSelectedDivisionId(division.id)}
              >
                <ThemedText
                  style={[
                    styles.divisionButtonText,
                    selectedDivisionId === division.id && { color: Colors.dark.buttonText },
                  ]}
                >
                  {division.name}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
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

  const selectedDivision = divisions.find((d) => d.id === selectedDivisionId);
  const divisionZones = selectedDivisionId ? zones[selectedDivisionId] || [] : [];

  // Check if division has at least one zone
  const hasNoZones = divisionZones.length === 0;

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
        <ThemedText style={styles.settingSectionTitle}>Advanced Options</ThemedText>
        <ThemedText style={styles.comingSoon}>Advanced settings coming soon...</ThemedText>
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
  selectorLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
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
  comingSoon: {
    fontStyle: "italic",
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
