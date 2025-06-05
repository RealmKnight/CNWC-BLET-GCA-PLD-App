import React, { useEffect, useState } from "react";
import { StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, View, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useDivisionManagementStore, Division, Zone } from "@/store/divisionManagementStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { EditDivisionForm } from "./EditDivisionForm";
import { EditZoneForm } from "./EditZoneForm";
import { CreateZoneForm } from "./CreateZoneForm";
import { TABS } from "./DivisionConstants";

interface DivisionsListProps {
  onSwitchTab?: (tabKey: string) => void;
}

export const DivisionsList = ({ onSwitchTab }: DivisionsListProps) => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const { divisions, zones, isLoadingDivisions, error, fetchDivisions, fetchZonesForDivision, setSelectedDivisionId } =
    useDivisionManagementStore();

  const [expandedDivisions, setExpandedDivisions] = useState<Record<number, boolean>>({});
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [addingZoneToDivision, setAddingZoneToDivision] = useState<number | null>(null);

  useEffect(() => {
    fetchDivisions();
  }, [fetchDivisions]);

  const toggleDivisionExpanded = (divisionId: number) => {
    setExpandedDivisions((prev) => {
      const isExpanded = !prev[divisionId];

      // If expanding, fetch zones if not already loaded
      if (isExpanded && !zones[divisionId]) {
        fetchZonesForDivision(divisionId);
      }

      return {
        ...prev,
        [divisionId]: isExpanded,
      };
    });
  };

  const handleEditDivision = (division: Division) => {
    setEditingDivision(division);
  };

  const handleEditZone = (zone: Zone) => {
    setEditingZone(zone);
  };

  const handleAddZone = (divisionId: number) => {
    setAddingZoneToDivision(divisionId);
    setSelectedDivisionId(divisionId);
  };

  const navigateToOfficers = (divisionId: number) => {
    setSelectedDivisionId(divisionId);
    if (onSwitchTab) {
      onSwitchTab(TABS.OFFICERS);
    }
  };

  const onDivisionEditComplete = () => {
    setEditingDivision(null);
    fetchDivisions();
  };

  const onZoneEditComplete = () => {
    setEditingZone(null);

    // Refresh zones for the division
    if (editingZone) {
      fetchZonesForDivision(editingZone.division_id);
    }
  };

  const onZoneAddComplete = () => {
    setAddingZoneToDivision(null);

    // Refresh zones for the division
    if (addingZoneToDivision) {
      fetchZonesForDivision(addingZoneToDivision);
    }
  };

  if (isLoadingDivisions && divisions.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={themeColor.tint} />
        <ThemedText style={styles.loadingText}>Loading divisions...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={themeColor.error} />
        <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchDivisions()}>
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (divisions.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <Ionicons name="information-circle-outline" size={48} color={themeColor.text} />
        <ThemedText style={styles.emptyText}>No divisions found</ThemedText>
        <ThemedText style={styles.instructionText}>Use the Create tab to add divisions</ThemedText>
      </ThemedView>
    );
  }

  const renderZoneItem = ({ item }: { item: Zone }) => (
    <ThemedView style={styles.zoneItem}>
      <View style={styles.zoneHeader}>
        <ThemedText style={styles.zoneName}>{item.name}</ThemedText>
        <ThemedText style={styles.memberCount}>{item.member_count || 0} members</ThemedText>
      </View>
      <View style={styles.zoneActions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleEditZone(item)}>
          <Ionicons name="pencil-outline" size={18} color={themeColor.tabIconDefault} />
        </TouchableOpacity>
        {/* // Commented out for now unless we decide to allow zone deletion later
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="trash-outline" size={18} color={themeColor.error} />
        </TouchableOpacity> */}
      </View>
    </ThemedView>
  );

  const renderDivisionItem = ({ item }: { item: Division }) => {
    const isExpanded = expandedDivisions[item.id] || false;
    const divisionZones = zones[item.id] || [];

    return (
      <ThemedView style={styles.divisionContainer}>
        <TouchableOpacity style={styles.divisionHeader} onPress={() => toggleDivisionExpanded(item.id)}>
          <View style={styles.divisionInfo}>
            <ThemedText style={styles.divisionName}>{item.name}</ThemedText>
            <ThemedText style={styles.divisionLocation}>{item.location}</ThemedText>
          </View>

          <View style={styles.divisionMeta}>
            <ThemedText style={styles.memberCount}>{item.member_count || 0} members</ThemedText>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={themeColor.text} />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <ThemedView style={styles.zonesContainer}>
            <View style={styles.zonesHeader}>
              <ThemedText style={styles.zonesTitle}>Zones</ThemedText>
              <TouchableOpacity style={styles.addZoneButton} onPress={() => handleAddZone(item.id)}>
                <Ionicons name="add-circle-outline" size={20} color={themeColor.tint} />
                <ThemedText style={styles.addZoneText}>Add Zone</ThemedText>
              </TouchableOpacity>
            </View>

            {divisionZones.length === 0 ? (
              <ThemedView style={styles.emptyZones}>
                <ThemedText style={styles.emptyZonesText}>No zones in this division</ThemedText>
              </ThemedView>
            ) : (
              <FlatList
                data={divisionZones}
                renderItem={renderZoneItem}
                keyExtractor={(item) => `zone-${item.id}`}
                scrollEnabled={false}
              />
            )}
          </ThemedView>
        )}

        <View style={styles.divisionActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => navigateToOfficers(item.id)}>
            <Ionicons name="people-outline" size={18} color={themeColor.tabIconDefault} />
            <ThemedText style={styles.actionText}>Officers</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleEditDivision(item)}>
            <Ionicons name="pencil-outline" size={18} color={themeColor.tabIconDefault} />
            <ThemedText style={styles.actionText}>Edit</ThemedText>
          </TouchableOpacity>
          {/* // Commented out for now unless we decide to allow division deletion later
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="trash-outline" size={18} color={themeColor.error} />
            <ThemedText style={styles.actionText}>Delete</ThemedText>
          </TouchableOpacity> */}
        </View>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={divisions}
        renderItem={renderDivisionItem}
        keyExtractor={(item) => `division-${item.id}`}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      {/* Edit Division Modal */}
      <Modal
        visible={editingDivision !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingDivision(null)}
      >
        <View style={styles.modalBackground}>
          <ThemedView style={styles.modalContainer}>
            {editingDivision && <EditDivisionForm division={editingDivision} onComplete={onDivisionEditComplete} />}
          </ThemedView>
        </View>
      </Modal>

      {/* Edit Zone Modal */}
      <Modal
        visible={editingZone !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingZone(null)}
      >
        <View style={styles.modalBackground}>
          <ThemedView style={styles.modalContainer}>
            {editingZone && <EditZoneForm zone={editingZone} onComplete={onZoneEditComplete} />}
          </ThemedView>
        </View>
      </Modal>

      {/* Add Zone Modal */}
      <Modal
        visible={addingZoneToDivision !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAddingZoneToDivision(null)}
      >
        <View style={styles.modalBackground}>
          <ThemedView style={styles.modalContainer}>
            <CreateZoneForm />
            <TouchableOpacity style={styles.closeButton} onPress={onZoneAddComplete}>
              <Ionicons name="close" size={24} color={themeColor.text} />
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
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
  listContainer: {
    padding: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#3498db",
  },
  retryText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "500",
  },
  instructionText: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.7,
  },
  divisionContainer: {
    borderRadius: 8,
    marginBottom: 16,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 2,
    overflow: "hidden",
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
    borderWidth: 1,
  },
  divisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  divisionInfo: {
    flex: 1,
  },
  divisionName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  divisionLocation: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.7,
  },
  divisionMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberCount: {
    fontSize: 14,
    marginRight: 8,
  },
  divisionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    marginLeft: 16,
  },
  actionText: {
    fontSize: 14,
    marginLeft: 4,
  },
  zonesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  zonesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  zonesTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  addZoneButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  addZoneText: {
    marginLeft: 4,
    fontSize: 14,
  },
  zoneItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  zoneHeader: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
  },
  zoneActions: {
    flexDirection: "row",
  },
  emptyZones: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  emptyZonesText: {
    fontSize: 14,
    opacity: 0.7,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "90%",
    maxWidth: 600,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.card,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 5,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 8,
    borderRadius: 20,
    zIndex: 10,
  },
});
