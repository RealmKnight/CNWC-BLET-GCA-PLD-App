import React, { useState, useEffect } from "react";
import { StyleSheet, TextInput, Alert, TouchableOpacity, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/userStore";
import { UserRole, CompanyAdminRole } from "@/types/auth";
import { format } from "date-fns";
import { Tooltip } from "../../../components/Tooltip";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";

type AllotmentType = "pld_sdv" | "vacation";

interface Allotment {
  id: string;
  date: string;
  type: AllotmentType;
  maxSpots: number;
  takenSpots: number;
  zone?: string;
}

interface YearlyAllotment {
  year: number;
  max_allotment: number;
  is_override?: boolean | null;
  override_by?: string | null;
  override_at?: string | null;
  override_reason?: string | null;
}

interface ConfirmationDialogProps {
  isVisible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmationDialog({ isVisible, title, message, onConfirm, onCancel }: ConfirmationDialogProps) {
  if (!isVisible) return null;

  return (
    <ThemedView style={styles.modalOverlay}>
      <ThemedView style={styles.modalContent}>
        <ThemedText type="title" style={styles.modalTitle}>
          {title}
        </ThemedText>
        <ThemedText style={styles.modalMessage}>{message}</ThemedText>
        <ThemedView style={styles.modalButtons}>
          <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onCancel} activeOpacity={0.7}>
            <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={onConfirm} activeOpacity={0.7}>
            <ThemedText style={[styles.modalButtonText, { color: "#000000" }]}>Update</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

interface CalendarAllotmentsProps {
  zoneId?: number;
  isZoneSpecific?: boolean;
}

export function CalendarAllotments({ zoneId, isZoneSpecific = false }: CalendarAllotmentsProps) {
  const {
    yearlyAllotments,
    tempAllotments,
    selectedType,
    isLoading,
    error,
    setSelectedType,
    setTempAllotments,
    fetchAllotments,
    updateAllotment,
    resetAllotments,
    selectedZoneId,
    usesZoneCalendars,
  } = useAdminCalendarManagementStore();

  const [zoneName, setZoneName] = useState<string>("");
  const [confirmDialog, setConfirmDialog] = useState<{
    isVisible: boolean;
    year: number;
    value: number;
  }>({ isVisible: false, year: 0, value: 0 });

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { user } = useAuth();
  const division = useUserStore((state) => state.division);
  const userRole = useUserStore((state) => state.userRole);

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  useEffect(() => {
    async function fetchZoneName() {
      if (!zoneId) {
        setZoneName("");
        return;
      }

      try {
        const { data, error } = await supabase.from("zones").select("name").eq("id", zoneId).single();

        if (error) throw error;
        setZoneName(data?.name || "");
      } catch (error) {
        console.error("Error fetching zone name:", error);
        setZoneName("");
      }
    }

    fetchZoneName();
  }, [zoneId]);

  useEffect(() => {
    if (!user || !division) return;

    const fetchZoneId = isZoneSpecific ? zoneId : null;

    if (isZoneSpecific && (fetchZoneId === undefined || fetchZoneId === null)) {
      console.log("[CalendarAllotments] Zone specific view, but zoneId is not ready. Skipping fetch.");
      resetAllotments();
      return;
    }

    console.log("[CalendarAllotments] Fetching allotments effect triggered", {
      division,
      currentYear,
      nextYear,
      fetchZoneId,
      isZoneSpecific,
    });

    const loadAllotments = async () => {
      await fetchAllotments(division, currentYear, fetchZoneId);
      await fetchAllotments(division, nextYear, fetchZoneId);
    };

    loadAllotments();

    return () => {
      console.log("[CalendarAllotments] Cleanup: Resetting allotments for", { zoneId: fetchZoneId });
      resetAllotments();
    };
  }, [user, division, zoneId, isZoneSpecific, fetchAllotments, resetAllotments]);

  const getAllotmentForYear = (year: number): YearlyAllotment | undefined => {
    return yearlyAllotments.find((a) => a.year === year);
  };

  const handleUpdateConfirmed = async (year: number, numValue: number) => {
    if (!user || !division) return;

    const updateZoneId = isZoneSpecific ? zoneId : null;

    if (isZoneSpecific && (updateZoneId === undefined || updateZoneId === null)) {
      const msg = "Cannot update: Zone ID is missing for zone-specific allotment.";
      console.error(msg);
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
      setConfirmDialog({ isVisible: false, year: 0, value: 0 });
      return;
    }

    try {
      await updateAllotment(division, year, numValue, user.id, updateZoneId);

      const successMsg = "Allotment updated successfully";
      if (Platform.OS === "web") {
        alert(successMsg);
      } else {
        Alert.alert("Success", successMsg);
      }
    } catch (error) {
      console.error("[handleUpdateConfirmed] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update allotment";
      if (Platform.OS === "web") {
        alert(errorMessage);
      } else {
        Alert.alert("Error", errorMessage);
      }
    } finally {
      setConfirmDialog({ isVisible: false, year: 0, value: 0 });
    }
  };

  const handleUpdateAllotment = async (year: number) => {
    if (!division) {
      const msg = "No division found. Please contact your administrator.";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
      return;
    }

    const allowedRoles: (UserRole | CompanyAdminRole)[] = [
      "application_admin",
      "union_admin",
      "division_admin",
      "company_admin",
    ];
    if (!userRole || !allowedRoles.includes(userRole)) {
      const msg = "You do not have permission to update allotments.";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
      return;
    }

    const value = parseInt(tempAllotments[year], 10);
    if (isNaN(value) || value < 0) {
      const msg = "Please enter a valid number";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
      return;
    }

    setConfirmDialog({ isVisible: true, year, value });
  };

  const handleInputChange = (year: number, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
      Alert.alert("Error", "Please enter a valid number");
      setTempAllotments((prev) => {
        const currentVal = getAllotmentForYear(year)?.max_allotment ?? 0;
        return {
          ...prev,
          [year]: currentVal.toString(),
        };
      });
      return;
    }

    setTempAllotments((prev) => {
      return {
        ...prev,
        [year]: value,
      };
    });
  };

  const renderYearInput = (year: number) => {
    const allotment = getAllotmentForYear(year);
    const isOverridden = allotment?.is_override;
    const overrideInfo =
      isOverridden && allotment
        ? {
            by: allotment.override_by,
            at: allotment.override_at ? format(new Date(allotment.override_at), "MMM d, yyyy h:mm a") : "Unknown",
            reason: allotment.override_reason || "No reason provided",
          }
        : null;

    const currentTempValue = tempAllotments[year] ?? (allotment?.max_allotment ?? 0).toString();

    return (
      <ThemedView key={year} style={styles.yearContainerInternal}>
        <ThemedView style={styles.yearHeader}>
          <ThemedText type="subtitle" style={styles.yearTitle}>
            {year}
          </ThemedText>
          {isOverridden && (
            <Tooltip
              content={
                <ThemedView style={styles.tooltipContent}>
                  <ThemedText>
                    Overridden on {format(new Date(allotment?.override_at || Date.now()), "MMM d, yyyy")}
                  </ThemedText>
                </ThemedView>
              }
            >
              <Ionicons name="information-circle" size={20} color={tintColor} style={styles.infoIcon} />
            </Tooltip>
          )}
        </ThemedView>
        <ThemedView style={styles.inputContainer}>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: Colors[colorScheme].border,
                color: Colors[colorScheme].text,
              },
            ]}
            value={currentTempValue}
            onChangeText={(text) => handleInputChange(year, text)}
            keyboardType="numeric"
            placeholder="Enter allotment"
            placeholderTextColor={Colors[colorScheme].text}
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[
              styles.updateButton,
              {
                backgroundColor: tintColor,
                opacity: isLoading ? 0.5 : 1,
              },
            ]}
            onPress={() => handleUpdateAllotment(year)}
            disabled={isLoading}
          >
            <ThemedText style={styles.updateButtonText}>Update</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {isZoneSpecific && (
        <ThemedView style={styles.zoneInfo}>
          <ThemedText type="title">Zone Calendar</ThemedText>
          <ThemedText style={styles.zoneDescription}>
            {zoneName ? `Managing calendar for zone: ${zoneName}` : "Loading zone information..."}
          </ThemedText>
        </ThemedView>
      )}

      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      )}

      <ThemedView style={styles.yearSectionsContainer}>
        {renderYearInput(currentYear)}
        {renderYearInput(nextYear)}
      </ThemedView>

      <ConfirmationDialog
        isVisible={confirmDialog.isVisible}
        title="Update Allotment"
        message={`Are you sure you want to update the allotment for ${confirmDialog.year} to ${confirmDialog.value}?`}
        onConfirm={() => handleUpdateConfirmed(confirmDialog.year, confirmDialog.value)}
        onCancel={() => setConfirmDialog({ isVisible: false, year: 0, value: 0 })}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  zoneInfo: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  zoneTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  zoneDescription: {
    fontSize: 14,
    color: Colors.light.text,
  },
  errorContainer: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.light.error,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  yearSectionsContainer: {
    gap: 24,
  },
  yearContainerInternal: {
    gap: 8,
  },
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  yearTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  infoIcon: {
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  updateButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  updateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  tooltipContent: {
    padding: 8,
    gap: 4,
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
    minWidth: 300,
    maxWidth: "90%",
  },
  modalTitle: {
    marginBottom: 12,
    textAlign: "center",
  },
  modalMessage: {
    marginBottom: 20,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  confirmButton: {
    backgroundColor: Colors.light.tint,
  },
  modalButtonText: {
    fontWeight: "600",
  },
});
