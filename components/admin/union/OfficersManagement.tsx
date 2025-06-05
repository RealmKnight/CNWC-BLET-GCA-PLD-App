import React, { useState, useEffect } from "react";
import { StyleSheet, FlatList, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export const OfficersManagement = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];
  const [isDivisionListVisible, setIsDivisionListVisible] = useState(false);

  const {
    divisions,
    officers,
    isLoadingDivisions,
    isLoadingOfficers,
    selectedDivisionId,
    setSelectedDivisionId,
    fetchDivisions,
    fetchOfficersForDivision,
  } = useDivisionManagementStore();

  // Get the selected division name
  const selectedDivision = divisions.find((div) => div.id === selectedDivisionId);

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  // Fetch officers data when selectedDivisionId changes
  useEffect(() => {
    if (selectedDivisionId) {
      fetchOfficersForDivision(selectedDivisionId);
    }
  }, [selectedDivisionId, fetchOfficersForDivision]);

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
        <ThemedText style={styles.instructionText}>Create divisions first before managing officers</ThemedText>
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
        <OfficersList />
      ) : (
        <ThemedView style={styles.selectPrompt}>
          <ThemedText>Please select a division to manage officers</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
};

const OfficersList = () => {
  const { officers, isLoadingOfficers, selectedDivisionId } = useDivisionManagementStore();

  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  if (isLoadingOfficers) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="small" color={themeColor.tint} />
        <ThemedText>Loading officers...</ThemedText>
      </ThemedView>
    );
  }

  if (officers.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText style={styles.emptyText}>No officers assigned to this division</ThemedText>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle-outline" size={20} color={themeColor.tint} />
          <ThemedText style={styles.addButtonText}>Assign Officers</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.officersContainer}>
      <ThemedView style={styles.officersHeader}>
        <ThemedText style={styles.officersTitle}>Division Officers</ThemedText>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add-circle-outline" size={20} color={themeColor.tint} />
          <ThemedText style={styles.addButtonText}>Assign New Officer</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <FlatList
        data={officers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ThemedView style={styles.officerCard}>
            <View style={styles.officerInfo}>
              <ThemedText style={styles.officerName}>
                {item.first_name} {item.last_name}
              </ThemedText>
              <ThemedText style={styles.officerPosition}>{item.position}</ThemedText>
              <ThemedText style={styles.officerDetail}>
                Started: {new Date(item.start_date).toLocaleDateString()}
              </ThemedText>
              {item.phone_number && <ThemedText style={styles.officerDetail}>Phone: {item.phone_number}</ThemedText>}
            </View>
            <View style={styles.officerActions}>
              <TouchableOpacity style={styles.officerActionButton}>
                <Ionicons name="create-outline" size={22} color={themeColor.tabIconDefault} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.officerActionButton}>
                <Ionicons name="close-circle-outline" size={22} color={themeColor.error} />
              </TouchableOpacity>
            </View>
          </ThemedView>
        )}
        contentContainerStyle={styles.officersList}
      />
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
    borderBottomColor: Colors.dark.border,
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
  selectPrompt: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  officersContainer: {
    padding: 16,
    flex: 1,
  },
  officersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  officersTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addButtonText: {
    marginLeft: 4,
    color: Colors.dark.text,
  },
  officersList: {
    paddingBottom: 20,
  },
  officerCard: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  officerInfo: {
    flex: 1,
  },
  officerName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  officerPosition: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  officerDetail: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  officerActions: {
    justifyContent: "space-around",
  },
  officerActionButton: {
    padding: 8,
  },
});
