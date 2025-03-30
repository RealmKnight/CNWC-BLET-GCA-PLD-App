import React, { useState } from "react";
import { StyleSheet, useWindowDimensions, Alert, Modal, TouchableOpacity } from "react-native";
import { useColorScheme } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import { Feather } from "@expo/vector-icons";
import { useMyTime } from "@/hooks/useMyTime";

interface LeaveRowProps {
  label: string;
  pldValue: number;
  sdvValue?: number;
  showIcon?: boolean;
  onIconPress?: () => void;
}

function LeaveRow({ label, pldValue, sdvValue = undefined, showIcon, onIconPress }: LeaveRowProps) {
  const colorScheme = useColorScheme();

  const handleIconPress = () => {
    if (onIconPress) {
      onIconPress();
    } else {
      Alert.alert("Feature Not Available", "The ability to request paid in lieu is not available at this time.");
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <ThemedView style={styles.valueContainer}>
        <ThemedText style={styles.value}>{pldValue}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.valueContainer}>
        <ThemedText style={styles.value}>{sdvValue !== undefined ? sdvValue : "-"}</ThemedText>
      </ThemedView>
      {showIcon && (
        <TouchableOpacity style={styles.iconContainer} onPress={handleIconPress}>
          <Feather
            name="dollar-sign"
            size={24}
            color={Colors[colorScheme ?? "light"].primary}
            style={{ fontWeight: "bold" }}
          />
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

export default function MyTimeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const [showPaidInLieuModal, setShowPaidInLieuModal] = useState(false);
  const [selectedType, setSelectedType] = useState<"PLD" | "SDV" | null>(null);
  const { stats, isLoading, error, requestPaidInLieu } = useMyTime();

  // Calculate responsive card width
  const cardWidth = Math.min(width * 0.9, 600); // 90% of screen width, max 600px

  const handlePaidInLieuPress = () => {
    setShowPaidInLieuModal(true);
  };

  const handleConfirmPaidInLieu = async () => {
    if (!selectedType) return;

    try {
      const success = await requestPaidInLieu(selectedType);

      if (success) {
        Alert.alert("Request Submitted", `Your request to receive payment for ${selectedType} has been submitted.`);
      } else {
        Alert.alert("Request Failed", "Unable to process your request. Please try again later.");
      }
    } catch (error) {
      Alert.alert("Error", "An error occurred while processing your request.");
    } finally {
      setShowPaidInLieuModal(false);
      setSelectedType(null);
    }
  };

  const handleCancelPaidInLieu = () => {
    setShowPaidInLieuModal(false);
    setSelectedType(null);
  };

  if (isLoading || !stats) {
    return (
      <ScrollView
        style={[
          styles.container,
          {
            backgroundColor: Colors[colorScheme ?? "light"].background,
            paddingTop: insets.top,
          },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>Loading time statistics...</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView
        style={[
          styles.container,
          {
            backgroundColor: Colors[colorScheme ?? "light"].background,
            paddingTop: insets.top,
          },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>Error: {error}</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={[
          styles.container,
          {
            backgroundColor: Colors[colorScheme ?? "light"].background,
            paddingTop: insets.top,
          },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.tableHeader}>
            <ThemedText style={styles.headerLabel}>Type</ThemedText>
            <ThemedText style={styles.headerValue}>PLD</ThemedText>
            <ThemedText style={styles.headerValue}>SDV</ThemedText>
          </ThemedView>

          <LeaveRow label="Total" pldValue={stats.total.pld} sdvValue={stats.total.sdv} />
          <LeaveRow label="Rolled Over" pldValue={stats.rolledOver.pld} />
          <LeaveRow label="Available" pldValue={stats.available.pld} sdvValue={stats.available.sdv} />
          <LeaveRow label="Requested" pldValue={stats.requested.pld} sdvValue={stats.requested.sdv} />
          <LeaveRow label="Waitlisted" pldValue={stats.waitlisted.pld} sdvValue={stats.waitlisted.sdv} />
          <LeaveRow label="Approved" pldValue={stats.approved.pld} sdvValue={stats.approved.sdv} />
          <LeaveRow
            label="Paid in Lieu"
            pldValue={stats.paidInLieu.pld}
            sdvValue={stats.paidInLieu.sdv}
            showIcon={true}
            onIconPress={handlePaidInLieuPress}
          />
        </ThemedView>

        <ThemedView style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Time Off Requests</ThemedText>
        </ThemedView>

        {/* Space for Time Off Requests content */}
        <ThemedView style={styles.timeOffContent} />
      </ScrollView>

      <Modal visible={showPaidInLieuModal} transparent animationType="fade" onRequestClose={handleCancelPaidInLieu}>
        <ThemedView style={styles.modalContainer}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Request Paid in Lieu</ThemedText>
            <ThemedText style={styles.modalDescription}>
              Select the type of day you want to request payment for:
            </ThemedText>

            <ThemedView style={styles.typeButtonsContainer}>
              <TouchableOpacity
                style={[styles.typeButton, selectedType === "PLD" && styles.selectedTypeButton]}
                onPress={() => setSelectedType("PLD")}
              >
                <ThemedText style={[styles.typeButtonText, selectedType === "PLD" && styles.selectedTypeButtonText]}>
                  PLD
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.typeButton, selectedType === "SDV" && styles.selectedTypeButton]}
                onPress={() => setSelectedType("SDV")}
              >
                <ThemedText style={[styles.typeButtonText, selectedType === "SDV" && styles.selectedTypeButtonText]}>
                  SDV
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>

            <ThemedView style={styles.modalButtonsContainer}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelPaidInLieu}>
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !selectedType && styles.disabledButton]}
                onPress={handleConfirmPaidInLieu}
                disabled={!selectedType}
              >
                <ThemedText style={styles.confirmButtonText}>Request Payment</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    borderRadius: 12,
    backgroundColor: Colors.dark.card,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  headerLabel: {
    flex: 2,
    fontSize: 16,
    fontWeight: "600",
  },
  headerValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  label: {
    flex: 2,
    fontSize: 16,
  },
  valueContainer: {
    flex: 1,
    alignItems: "center",
  },
  value: {
    fontSize: 16,
  },
  iconContainer: {
    width: 24,
    alignItems: "center",
  },
  sectionHeader: {
    width: "100%",
    paddingVertical: 24,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  timeOffContent: {
    width: "100%",
    height: 200, // Placeholder height
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  typeButtonsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    width: "100%",
  },
  typeButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 8,
    minWidth: 100,
    alignItems: "center",
  },
  selectedTypeButton: {
    backgroundColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  selectedTypeButtonText: {
    color: Colors.dark.background,
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  cancelButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
  },
  confirmButtonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
