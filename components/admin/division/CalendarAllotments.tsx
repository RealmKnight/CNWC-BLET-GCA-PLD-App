import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, TextInput, Alert, TouchableOpacity, Platform, Dimensions, ScrollView } from "react-native";
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
import Toast from "react-native-toast-message";

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

interface WeeklyVacationAllotment {
  id: string;
  vac_year: number;
  week_start_date: string;
  current_requests: number;
  max_allotment: number;
}

interface CalendarAllotmentsProps {
  zoneId: number | undefined;
  isZoneSpecific?: boolean;
  selectedDivision?: string;
}

export function CalendarAllotments({ zoneId, isZoneSpecific = false, selectedDivision }: CalendarAllotmentsProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const {
    yearlyAllotments,
    weeklyVacationAllotments,
    pldSdvTempAllotments,
    vacationTempAllotments,
    selectedType,
    isLoading,
    error,
    setSelectedType,
    setPldSdvTempAllotments,
    setVacationTempAllotments,
    fetchAllotments,
    updateAllotment,
    updateVacationAllotment,
    resetAllotments,
    selectedZoneId,
    usesZoneCalendars,
  } = useAdminCalendarManagementStore();

  const [zoneName, setZoneName] = useState<string>("");

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { user } = useAuth();
  const userDivision = useUserStore((state) => state.division);
  const userRole = useUserStore((state) => state.userRole);

  // Use selectedDivision if provided (admin mode), otherwise fall back to userDivision
  const effectiveDivision = selectedDivision || userDivision;

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
    if (!user || !effectiveDivision) return;

    const fetchZoneId = isZoneSpecific ? zoneId : null;

    if (isZoneSpecific && (fetchZoneId === undefined || fetchZoneId === null)) {
      console.log("[CalendarAllotments] Zone specific view, but zoneId is not ready. Skipping fetch.");
      return;
    }

    console.log("[CalendarAllotments] Fetching allotments effect triggered", {
      division: effectiveDivision,
      currentYear,
      nextYear,
      fetchZoneId,
      isZoneSpecific,
    });

    const loadAllotments = async () => {
      await fetchAllotments(effectiveDivision, currentYear, fetchZoneId);
      await fetchAllotments(effectiveDivision, nextYear, fetchZoneId);
    };

    loadAllotments();

    // Only reset allotments when unmounting or when zone changes within the same division
    return () => {
      if (isZoneSpecific && fetchZoneId !== zoneId) {
        console.log("[CalendarAllotments] Cleanup: Resetting allotments for zone change", { zoneId: fetchZoneId });
        resetAllotments();
      }
    };
  }, [user, effectiveDivision, zoneId, isZoneSpecific, fetchAllotments, resetAllotments]);

  const getAllotmentForYear = (year: number): YearlyAllotment | undefined => {
    return yearlyAllotments.find((a) => a.year === year);
  };

  const getVacationAllotmentsForYear = (year: number): WeeklyVacationAllotment[] => {
    return weeklyVacationAllotments.filter((a) => a.vac_year === year);
  };

  const handleUpdateConfirmed = async (year: number, numValue: number) => {
    if (!user || !effectiveDivision) return;

    const updateZoneId = isZoneSpecific ? zoneId : null;

    if (isZoneSpecific && (updateZoneId === undefined || updateZoneId === null)) {
      const msg = "Cannot update: Zone ID is missing for zone-specific allotment.";
      console.error(msg);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: msg,
        position: "bottom",
        visibilityTime: 3000,
      });
      return;
    }

    try {
      // Get the current type from state to ensure we're using the correct one
      const currentType = selectedType;
      console.log("[CalendarAllotments] Updating allotment:", {
        type: currentType,
        year,
        value: numValue,
        zoneId: updateZoneId,
      });

      if (currentType === "vacation") {
        // For vacation type, we need a week start date
        const weekStartDate = `${year}-01-01`; // Use the selected year
        await updateVacationAllotment(effectiveDivision, weekStartDate, numValue, user.id, updateZoneId);
      } else if (currentType === "pld_sdv") {
        await updateAllotment(effectiveDivision, year, numValue, user.id, updateZoneId);
      } else {
        throw new Error(`Invalid allotment type: ${currentType}`);
      }

      await fetchAllotments(effectiveDivision, year, updateZoneId);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Allotment updated successfully",
        position: "bottom",
        visibilityTime: 2000,
      });
    } catch (error) {
      console.error("[handleUpdateConfirmed] Error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update allotment";
      Toast.show({
        type: "error",
        text1: "Error",
        text2: errorMessage,
        position: "bottom",
        visibilityTime: 3000,
      });
    }
  };

  const handleUpdateAllotment = async (year: number, type: AllotmentType) => {
    // Set the type first before proceeding with the update
    setSelectedType(type);

    if (!effectiveDivision) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "No division found. Please contact your administrator.",
        position: "bottom",
        visibilityTime: 3000,
      });
      return;
    }

    const allowedRoles: (UserRole | CompanyAdminRole)[] = [
      "application_admin",
      "union_admin",
      "division_admin",
      "company_admin",
    ];
    if (!userRole || !allowedRoles.includes(userRole)) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "You do not have permission to update allotments.",
        position: "bottom",
        visibilityTime: 3000,
      });
      return;
    }

    const value =
      type === "vacation"
        ? parseInt(vacationTempAllotments[year] ?? "", 10)
        : parseInt(pldSdvTempAllotments[year] ?? "", 10);

    if (isNaN(value) || value < 0) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter a valid number",
        position: "bottom",
        visibilityTime: 3000,
      });
      return;
    }

    Toast.show({
      type: "info",
      text1: `Update ${type === "vacation" ? "Vacation" : "Single Day"} Allotment`,
      text2: `Are you sure you want to update the ${
        type === "vacation" ? "vacation" : "single day"
      } allotment for ${year} to ${value}?`,
      position: "bottom",
      visibilityTime: 4000,
      autoHide: false,
      onPress: () => {
        Toast.hide();
      },
      props: {
        onAction: async (action: string) => {
          if (action === "confirm") {
            Toast.hide();
            await handleUpdateConfirmed(year, value);
          }
        },
        actionType: "confirm",
      },
    });
  };

  const handleInputChange = (year: number, type: AllotmentType, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter a valid number",
        position: "bottom",
        visibilityTime: 3000,
      });
      if (type === "vacation") {
        setVacationTempAllotments((prev) => {
          const currentVal = getVacationAllotmentsForYear(year)?.[0]?.max_allotment ?? 0;
          return {
            ...prev,
            [year]: currentVal.toString(),
          };
        });
      } else {
        setPldSdvTempAllotments((prev) => {
          const currentVal = getAllotmentForYear(year)?.max_allotment ?? 0;
          return {
            ...prev,
            [year]: currentVal.toString(),
          };
        });
      }
      return;
    }

    if (type === "vacation") {
      setVacationTempAllotments((prev) => ({
        ...prev,
        [year]: value,
      }));
    } else {
      setPldSdvTempAllotments((prev) => ({
        ...prev,
        [year]: value,
      }));
    }
  };

  useEffect(() => {
    setSelectedType("pld_sdv");
  }, []);

  const renderYearInput = (year: number, type: AllotmentType) => {
    const allotment = type === "pld_sdv" ? getAllotmentForYear(year) : undefined;
    const vacationAllotments = type === "vacation" ? getVacationAllotmentsForYear(year) : [];

    const isOverridden = allotment?.is_override;
    const overrideInfo =
      isOverridden && allotment
        ? {
            by: allotment.override_by,
            at: allotment.override_at ? format(new Date(allotment.override_at), "MMM d, yyyy h:mm a") : "Unknown",
            reason: allotment.override_reason || "No reason provided",
          }
        : null;

    const currentTempValue =
      type === "vacation"
        ? vacationTempAllotments[year] ?? (vacationAllotments[0]?.max_allotment ?? 0).toString()
        : pldSdvTempAllotments[year] ?? (allotment?.max_allotment ?? 0).toString();

    return (
      <ThemedView key={`${year}-${type}`} style={styles.yearContainerInternal}>
        <ThemedView style={styles.yearHeader}>
          <ThemedText type="subtitle" style={styles.yearTitle}>
            {year}
          </ThemedText>
          {isOverridden && type === "pld_sdv" && (
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
            onChangeText={(text) => handleInputChange(year, type, text)}
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
            onPress={() => handleUpdateAllotment(year, type)}
            disabled={isLoading}
          >
            <ThemedText style={styles.updateButtonText}>Update</ThemedText>
          </TouchableOpacity>
        </ThemedView>
        {type === "vacation" && vacationAllotments.length > 0 && (
          <ThemedView style={styles.weeklyAllotmentsContainer}>
            <ThemedText style={styles.weeklyAllotmentsTitle}>Weekly Breakdown</ThemedText>
            {vacationAllotments.map((weekAllotment) => (
              <ThemedView key={weekAllotment.id} style={styles.weeklyAllotmentRow}>
                <ThemedText>Week of {format(new Date(weekAllotment.week_start_date), "MMM d, yyyy")}</ThemedText>
                <ThemedText>
                  {weekAllotment.current_requests} / {weekAllotment.max_allotment} spots taken
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        )}
      </ThemedView>
    );
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      onScroll={(event) => {
        setScrollOffset(event.nativeEvent.contentOffset.y);
      }}
      scrollEventThrottle={16}
    >
      {isZoneSpecific ? (
        <ThemedView style={styles.zoneInfo}>
          <ThemedText type="title">Zone Calendar</ThemedText>
          <ThemedText style={styles.zoneDescription}>
            {zoneName ? `Managing calendar allotments for zone: ${zoneName}` : "Loading zone information..."}
          </ThemedText>
        </ThemedView>
      ) : (
        <ThemedView style={styles.zoneInfo}>
          <ThemedText type="title">Division Calendar</ThemedText>
          <ThemedText style={styles.zoneDescription}>
            {effectiveDivision
              ? `Managing calendar allotments for the whole division: ${effectiveDivision}`
              : "Loading division information..."}
          </ThemedText>
        </ThemedView>
      )}

      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      )}

      <ThemedText type="title" style={styles.titleStyle}>
        Single Day Allotments
      </ThemedText>
      <ThemedView style={styles.yearSectionsContainer}>
        {renderYearInput(currentYear, "pld_sdv")}
        {renderYearInput(nextYear, "pld_sdv")}
      </ThemedView>

      <ThemedText type="title" style={styles.titleStyle}>
        Vacation Allotments
      </ThemedText>
      <ThemedView style={styles.yearSectionsContainer}>
        {renderYearInput(currentYear, "vacation")}
        {renderYearInput(nextYear, "vacation")}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  titleStyle: {
    marginBottom: 16,
    marginTop: 6,
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
    marginBottom: 24,
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
  weeklyAllotmentsContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  weeklyAllotmentsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  weeklyAllotmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
});
