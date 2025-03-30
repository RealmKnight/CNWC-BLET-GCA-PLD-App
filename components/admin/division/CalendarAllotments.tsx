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

export function CalendarAllotments() {
  const [selectedType, setSelectedType] = useState<"pld_sdv" | "vacation">("pld_sdv");
  const [yearlyAllotments, setYearlyAllotments] = useState<YearlyAllotment[]>([]);
  const [tempAllotments, setTempAllotments] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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

  // Get the current and next year
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  // Fetch current allotments
  useEffect(() => {
    if (!user || !division) return;

    const fetchAllotments = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("pld_sdv_allotments")
          .select("year, max_allotment")
          .eq("division", division)
          .in("year", [currentYear, nextYear])
          .is("date", null) // Only get yearly defaults (no specific date)
          .limit(2);

        if (error) throw error;

        // Transform data into YearlyAllotment format
        const allotments =
          data?.map((d) => ({
            year: d.year,
            max_allotment: d.max_allotment,
          })) || [];

        setYearlyAllotments(allotments);

        // Initialize temp allotments
        const temp: Record<number, string> = {};
        allotments.forEach((allotment) => {
          temp[allotment.year] = allotment.max_allotment.toString();
        });
        // Set default values for years without allotments
        if (!temp[currentYear]) temp[currentYear] = "0";
        if (!temp[nextYear]) temp[nextYear] = "0";
        setTempAllotments(temp);
      } catch (error) {
        console.error("Error fetching allotments:", error);
        Alert.alert("Error", "Failed to fetch allotments");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllotments();
  }, [user, division]);

  const getAllotmentForYear = (year: number) => {
    return yearlyAllotments.find((a) => a.year === year)?.max_allotment || 0;
  };

  const handleUpdateConfirmed = async (year: number, numValue: number) => {
    console.log("[handleUpdateConfirmed] Starting update process");
    try {
      setIsLoading(true);
      console.log("[handleUpdateConfirmed] Preparing upsert data:", {
        year,
        max_allotment: numValue,
        division,
        current_requests: 0,
      });

      // First, check if a record exists
      const { data: existingData } = await supabase
        .from("pld_sdv_allotments")
        .select("id")
        .eq("division", division)
        .eq("year", year)
        .eq("date", `${year}-01-01`)
        .single();

      let result;
      if (existingData) {
        // Update existing record
        result = await supabase
          .from("pld_sdv_allotments")
          .update({
            max_allotment: numValue,
            current_requests: 0,
          })
          .eq("id", existingData.id)
          .select();
      } else {
        // Insert new record
        result = await supabase
          .from("pld_sdv_allotments")
          .insert({
            year,
            max_allotment: numValue,
            division,
            date: `${year}-01-01`,
            current_requests: 0,
          })
          .select();
      }

      console.log("[handleUpdateConfirmed] Operation response:", result);

      if (result.error) {
        console.error("[handleUpdateConfirmed] Operation error:", result.error);
        throw result.error;
      }

      console.log("[handleUpdateConfirmed] Updating local state");
      setYearlyAllotments((prev) => {
        const existing = prev.findIndex((a) => a.year === year);
        if (existing >= 0) {
          return prev.map((a) => (a.year === year ? { ...a, max_allotment: numValue } : a));
        }
        return [...prev, { year, max_allotment: numValue }];
      });

      console.log("[handleUpdateConfirmed] Update successful");
      if (Platform.OS === "web") {
        alert("Allotment updated successfully");
      } else {
        Alert.alert("Success", "Allotment updated successfully");
      }
    } catch (error) {
      console.error("[handleUpdateConfirmed] Error in update:", error);
      if (Platform.OS === "web") {
        alert("Failed to update allotment");
      } else {
        Alert.alert("Error", "Failed to update allotment");
      }
      setTempAllotments((prev) => ({
        ...prev,
        [year]: getAllotmentForYear(year).toString(),
      }));
    } finally {
      console.log("[handleUpdateConfirmed] Update process complete");
      setIsLoading(false);
      setConfirmDialog({ isVisible: false, year: 0, value: 0 });
    }
  };

  const handleUpdateAllotment = async (year: number, value: string) => {
    console.log("[handleUpdateAllotment] Starting with:", { year, value, division });

    if (!division) {
      console.log("[handleUpdateAllotment] No division found");
      if (Platform.OS === "web") {
        alert("No division found. Please contact your administrator.");
      } else {
        Alert.alert("Error", "No division found. Please contact your administrator.");
      }
      return;
    }

    // Check if user has admin role
    const allowedRoles: (UserRole | CompanyAdminRole)[] = [
      "application_admin",
      "union_admin",
      "division_admin",
      "company_admin",
    ];
    if (!userRole || !allowedRoles.includes(userRole)) {
      console.log("[handleUpdateAllotment] User does not have permission:", { userRole });
      if (Platform.OS === "web") {
        alert("You do not have permission to update allotments.");
      } else {
        Alert.alert("Error", "You do not have permission to update allotments.");
      }
      return;
    }

    const numValue = parseInt(value, 10);
    console.log("[handleUpdateAllotment] Parsed value:", numValue);

    if (isNaN(numValue) || numValue < 0) {
      console.log("[handleUpdateAllotment] Invalid input:", { numValue });
      if (Platform.OS === "web") {
        alert("Please enter a valid number");
      } else {
        Alert.alert("Invalid Input", "Please enter a valid number");
      }
      return;
    }

    console.log("[handleUpdateAllotment] Showing confirmation dialog");
    setConfirmDialog({ isVisible: true, year, value: numValue });
  };

  const renderTypeSelector = () => (
    <ThemedView style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeButton, selectedType === "pld_sdv" && styles.activeType]}
        onPress={() => setSelectedType("pld_sdv")}
        activeOpacity={0.7}
      >
        <ThemedText style={[styles.typeText, selectedType === "pld_sdv" && styles.activeTypeText]}>
          PLD/SDV Allotments
        </ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.typeButton, selectedType === "vacation" && styles.activeType]}
        onPress={() => setSelectedType("vacation")}
        activeOpacity={0.7}
      >
        <ThemedText style={[styles.typeText, selectedType === "vacation" && styles.activeTypeText]}>
          Vacation Allotments
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );

  const renderCalendar = () => (
    <ThemedView style={styles.calendar}>
      {/* TODO: Implement calendar view with allotment indicators */}
      <ThemedText>Calendar will go here</ThemedText>
    </ThemedView>
  );

  const renderAllotmentDetails = () => {
    if (!selectedDate) {
      return (
        <ThemedView style={styles.emptyDetails}>
          <ThemedText>Select a date to view or edit allotments</ThemedText>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.allotmentDetails}>
        <ThemedText type="subtitle">Allotments for {selectedDate}</ThemedText>
        {selectedType === "pld_sdv" ? (
          <>
            <ThemedText>PLD/SDV Allotment Settings:</ThemedText>
            {/* TODO: Implement PLD/SDV allotment form */}
          </>
        ) : (
          <>
            <ThemedText>Vacation Allotment Settings:</ThemedText>
            {/* TODO: Implement vacation allotment form */}
          </>
        )}
      </ThemedView>
    );
  };

  const renderYearlyAllotments = () => (
    <ThemedView style={styles.yearlyAllotments}>
      <ThemedText type="subtitle">{`Yearly PLD/SDV Allotments for Division ${division || ""}`}</ThemedText>
      <ThemedText style={styles.description}>
        Set the default daily allotment for each year. These values will apply to all days unless overridden by specific
        daily, weekly, or monthly adjustments.
      </ThemedText>

      {[currentYear, nextYear].map((year) => (
        <ThemedView key={year} style={styles.yearRow}>
          <ThemedText style={styles.yearLabel}>{year}:</ThemedText>
          <TextInput
            style={[styles.allotmentInput, { color: Colors[colorScheme].text, borderColor: Colors[colorScheme].tint }]}
            keyboardType="numeric"
            value={tempAllotments[year] || "0"}
            onChangeText={(value) => setTempAllotments((prev) => ({ ...prev, [year]: value }))}
            placeholder="Enter allotment"
            placeholderTextColor={Colors[colorScheme].text}
          />
          <ThemedText style={styles.perDay}>per day</ThemedText>
          <TouchableOpacity
            style={[styles.updateButton, { backgroundColor: Colors[colorScheme].tint }]}
            onPress={() => handleUpdateAllotment(year, tempAllotments[year] || "0")}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <ThemedText style={[styles.updateButtonText, { color: "#000000" }]}>Update</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      ))}

      <ThemedText style={styles.note}>
        Note: Changes to yearly allotments will not affect any existing daily, weekly, or monthly overrides.
      </ThemedText>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Calendar Allotments</ThemedText>
      </ThemedView>
      {renderTypeSelector()}
      {selectedType === "pld_sdv" && renderYearlyAllotments()}
      <ThemedView style={styles.content}>
        {renderCalendar()}
        {renderAllotmentDetails()}
      </ThemedView>
      <ConfirmationDialog
        isVisible={confirmDialog.isVisible}
        title="Confirm Update"
        message={`Are you sure you want to set the ${confirmDialog.year} daily PLD/SDV allotment to ${confirmDialog.value} for Division ${division}?`}
        onConfirm={() => handleUpdateConfirmed(confirmDialog.year, confirmDialog.value)}
        onCancel={() => {
          console.log("[handleUpdateAllotment] Update cancelled");
          setConfirmDialog({ isVisible: false, year: 0, value: 0 });
          setTempAllotments((prev) => ({
            ...prev,
            [confirmDialog.year]: getAllotmentForYear(confirmDialog.year).toString(),
          }));
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  typeSelector: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  activeType: {
    backgroundColor: Colors.light.tint,
  },
  typeText: {
    fontSize: 14,
  },
  activeTypeText: {
    color: "#000000",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    gap: 24,
  },
  calendar: {
    width: 300,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 16,
  },
  allotmentDetails: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
  },
  emptyDetails: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  activeText: {
    color: "#000000",
  },
  yearlyAllotments: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
  },
  description: {
    marginTop: 8,
    marginBottom: 16,
    opacity: 0.8,
  },
  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
  },
  yearLabel: {
    width: 80,
    fontSize: 16,
    fontWeight: "600",
  },
  allotmentInput: {
    width: 100,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    fontSize: 16,
  },
  updateButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  updateButtonText: {
    fontWeight: "600",
  },
  perDay: {
    opacity: 0.8,
  },
  note: {
    marginTop: 16,
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
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
