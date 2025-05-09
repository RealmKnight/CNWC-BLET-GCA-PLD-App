import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Alert,
  TouchableOpacity,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useUserStore } from "@/store/userStore";
import { UserRole, CompanyAdminRole } from "@/types/auth";
import { format, parseISO } from "date-fns";
import { Tooltip } from "../../../components/Tooltip";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import Toast from "react-native-toast-message";
import { DatePicker } from "@/components/DatePicker";
import { Accordion } from "@/components/Accordion";

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
  id: number;
  calendar_id: string | null;
  week_start_date: string;
  max_allotment: number;
  current_requests: number | null;
  vac_year: number;
  is_override: boolean;
  override_by?: string | null;
  override_at?: string | null;
  override_reason?: string | null;
}

interface CalendarAllotmentsProps {
  calendarId: string | null;
  selectedDivision?: string;
}

// Component to display weekly vacation allotments
const WeeklyAllotmentsDisplay = ({ allotments }: { allotments: WeeklyVacationAllotment[] }) => {
  const sortedAllotments = [...allotments].sort(
    (a, b) => new Date(a.week_start_date).getTime() - new Date(b.week_start_date).getTime()
  );

  return (
    <ThemedView style={[styles.allotmentsContainer, Platform.OS === "android" && styles.androidFlexContainer]}>
      {sortedAllotments.length === 0 ? (
        <ThemedText style={styles.noDataText}>No weekly allotments found for this year.</ThemedText>
      ) : (
        <>
          <ThemedView style={styles.allotmentsHeader}>
            <ThemedText style={styles.allotmentHeaderText}>Week Starting</ThemedText>
            <ThemedText style={styles.allotmentHeaderText}>Allocation</ThemedText>
            <ThemedText style={styles.allotmentHeaderText}>Used</ThemedText>
          </ThemedView>
          {sortedAllotments.map((allotment) => (
            <ThemedView key={allotment.id.toString()} style={styles.allotmentRow}>
              <ThemedText>{format(new Date(allotment.week_start_date), "MMM d, yyyy")}</ThemedText>
              <ThemedText>{allotment.max_allotment}</ThemedText>
              <ThemedText>{allotment.current_requests ?? "0"}</ThemedText>
            </ThemedView>
          ))}
        </>
      )}
    </ThemedView>
  );
};

// Component to display daily PLD/SDV allotments
const DailyAllotmentsDisplay = ({ allotment }: { allotment?: YearlyAllotment }) => {
  return (
    <ThemedView style={[styles.allotmentsContainer, Platform.OS === "android" && styles.androidFlexContainer]}>
      {!allotment ? (
        <ThemedText style={styles.noDataText}>No yearly allotment found.</ThemedText>
      ) : (
        <ThemedView style={styles.allotmentSummary}>
          <ThemedText style={styles.allotmentSummaryText}>
            Default allotment: <ThemedText style={styles.allotmentValue}>{allotment.max_allotment}</ThemedText>
          </ThemedText>

          {allotment.is_override && (
            <ThemedView style={styles.overrideInfo}>
              <ThemedText style={styles.overrideText}>
                This value was overridden
                {allotment.override_at && ` on ${format(new Date(allotment.override_at), "MMM d, yyyy")}`}
              </ThemedText>
              {allotment.override_reason && (
                <ThemedText style={styles.overrideReasonText}>Reason: {allotment.override_reason}</ThemedText>
              )}
            </ThemedView>
          )}
        </ThemedView>
      )}
    </ThemedView>
  );
};

export function CalendarAllotments({ calendarId, selectedDivision }: CalendarAllotmentsProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adminCalendarStore = useAdminCalendarManagementStore();
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
  } = adminCalendarStore;

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { user } = useAuth();
  const userDivision = useUserStore((state) => state.division);
  const userRole = useUserStore((state) => state.userRole);

  const effectiveDivision = selectedDivision || userDivision;

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;

  const [activeTab, setActiveTab] = useState<AllotmentType>("pld_sdv");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [rangeAllotment, setRangeAllotment] = useState<string>("");

  useEffect(() => {
    if (!user || !effectiveDivision || !calendarId) {
      console.log("[CalendarAllotments] Missing user, division, or calendarId. Skipping fetch.", {
        user: !!user,
        effectiveDivision,
        calendarId,
      });
      return;
    }

    console.log("[CalendarAllotments] useEffect Triggered. Preparing to fetch...", {
      division: effectiveDivision,
      calendarId,
      currentYear,
      nextYear,
    });

    const abortController = new AbortController();

    const loadAllotments = async () => {
      try {
        if (abortController.signal.aborted) {
          console.log("[CalendarAllotments] Aborted before fetching year", currentYear);
          return;
        }
        console.log("[CalendarAllotments] Fetching year", currentYear, "for calendar", calendarId);
        await fetchAllotments(calendarId, currentYear);

        if (abortController.signal.aborted) {
          console.log("[CalendarAllotments] Aborted before fetching year", nextYear);
          return;
        }
        console.log("[CalendarAllotments] Fetching year", nextYear, "for calendar", calendarId);
        await fetchAllotments(calendarId, nextYear);

        console.log("[CalendarAllotments] Fetches completed for calendar", calendarId);
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("[CalendarAllotments] Error loading allotments:", err);
        }
      }
    };

    loadAllotments();

    return () => {
      console.log("[CalendarAllotments] Cleanup for effect with calendar", calendarId);
      abortController.abort();
    };
  }, [user, effectiveDivision, calendarId, fetchAllotments]);

  const getAllotmentForYear = (year: number): YearlyAllotment | undefined => {
    return yearlyAllotments.find((a) => a.year === year);
  };

  const getVacationAllotmentsForYear = (year: number): WeeklyVacationAllotment[] => {
    return weeklyVacationAllotments.filter((a) => a.vac_year === year);
  };

  const handleUpdateConfirmed = async (year: number, numValue: number) => {
    if (!user || !effectiveDivision || !calendarId) {
      console.error("[handleUpdateConfirmed] Missing user, division, or calendarId.");
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Cannot update: Missing required information.",
        position: "bottom",
      });
      return;
    }

    try {
      // Use activeTab instead of selectedType to determine the correct type
      const currentType = activeTab;
      // Get the calendar name from the store
      const calendarName =
        Object.values(adminCalendarStore.calendars)
          .flat()
          .find((cal) => cal.id === calendarId)?.name || calendarId;

      console.log("[CalendarAllotments] Updating allotment:", {
        type: currentType,
        year,
        value: numValue,
        calendarId: calendarId,
      });

      if (currentType === "vacation") {
        const weekStartDate = `${year}-01-01`;
        await updateVacationAllotment(calendarId, weekStartDate, numValue, user.id);
      } else if (currentType === "pld_sdv") {
        await updateAllotment(calendarId, year, numValue, user.id);
      } else {
        throw new Error(`Invalid allotment type: ${currentType}`);
      }

      await fetchAllotments(calendarId, year);

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Allotment updated successfully for calendar "${calendarName}"`,
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
      });
    }
  };

  const handleUpdateAllotment = async (year: number, type: AllotmentType) => {
    setSelectedType(type);

    if (!effectiveDivision) {
      Toast.show({ type: "error", text1: "Error", text2: "No division selected." });
      return;
    }
    if (!calendarId) {
      Toast.show({ type: "error", text1: "Error", text2: "No calendar selected." });
      return;
    }

    const allowedRoles: (UserRole | CompanyAdminRole)[] = [
      "application_admin",
      "union_admin",
      "division_admin",
      "company_admin",
    ];
    if (!userRole || !allowedRoles.includes(userRole)) {
      Toast.show({ type: "error", text1: "Error", text2: "Permission denied." });
      return;
    }

    const value =
      type === "vacation"
        ? parseInt(vacationTempAllotments[year] ?? "", 10)
        : parseInt(pldSdvTempAllotments[year] ?? "", 10);

    if (isNaN(value) || value < 0) {
      Toast.show({ type: "error", text1: "Error", text2: "Invalid number." });
      return;
    }

    // Get the calendar name from the store
    const calendarName =
      Object.values(adminCalendarStore.calendars)
        .flat()
        .find((cal) => cal.id === calendarId)?.name || calendarId;

    Toast.show({
      type: "info",
      text1: `Update ${type === "vacation" ? "Vacation" : "Single Day"} Allotment`,
      text2: `Update ${
        type === "vacation" ? "vacation" : "single day"
      } allotment for ${year} to ${value} on calendar "${calendarName}"?`,
      position: "bottom",
      visibilityTime: 4000,
      autoHide: false,
      onPress: () => Toast.hide(),
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
    if (isNaN(numValue) || value.trim() === "") {
      if (value.trim() !== "") {
        Toast.show({ type: "error", text1: "Error", text2: "Invalid number." });
      }
      if (type === "vacation") {
        setVacationTempAllotments((prev) => {
          const currentVal = getVacationAllotmentsForYear(year)?.[0]?.max_allotment ?? 0;
          return { ...prev, [year]: currentVal.toString() };
        });
      } else {
        setPldSdvTempAllotments((prev) => {
          const currentVal = getAllotmentForYear(year)?.max_allotment ?? 0;
          return { ...prev, [year]: currentVal.toString() };
        });
      }
      return;
    }

    if (type === "vacation") {
      setVacationTempAllotments((prev) => ({ ...prev, [year]: value }));
    } else {
      setPldSdvTempAllotments((prev) => ({ ...prev, [year]: value }));
    }
  };

  useEffect(() => {
    if (!selectedType) {
      setSelectedType("pld_sdv");
    }
  }, [selectedType, setSelectedType]);

  // Add a manual data fetch for both years
  useEffect(() => {
    if (!calendarId || !user) return;

    console.log("[CalendarAllotments] Component mounted with calendar:", calendarId);

    // Let's not automatically fetch all years to improve performance
    // User can expand each accordion to load the data they want to see

    // Cleanup
    return () => {
      console.log("[CalendarAllotments] Cleanup on unmount for calendar:", calendarId);
    };
  }, [calendarId, user]);

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
            placeholder="Spots"
            placeholderTextColor={Colors[colorScheme].textDim}
            editable={!isLoading && !!calendarId}
          />
          <TouchableOpacity
            style={[styles.updateButton, { backgroundColor: tintColor, opacity: isLoading || !calendarId ? 0.5 : 1 }]}
            onPress={() => handleUpdateAllotment(year, type)}
            disabled={isLoading || !calendarId}
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
                  {weekAllotment.current_requests ?? "N/A"} / {weekAllotment.max_allotment} spots
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        )}
      </ThemedView>
    );
  };

  const handleRangeUpdate = () => {
    if (!startDate || !endDate || !rangeAllotment || !calendarId || !user) {
      Toast.show({
        type: "error",
        text1: "Missing Information",
        text2: "Please select both start and end dates, and enter an allotment value.",
        position: "bottom",
      });
      return;
    }

    // Get the calendar name from the store
    const calendarName =
      Object.values(adminCalendarStore.calendars)
        .flat()
        .find((cal) => cal.id === calendarId)?.name || calendarId;

    // Validate the allotment value
    const numValue = parseInt(rangeAllotment, 10);
    if (isNaN(numValue) || numValue < 0) {
      Toast.show({
        type: "error",
        text1: "Invalid Value",
        text2: "Please enter a valid positive number for the allotment.",
        position: "bottom",
      });
      return;
    }

    // Format dates for display - use midnight UTC to represent whole days
    const formattedStartDate = format(startDate, "MMM d, yyyy");
    const formattedEndDate = format(endDate, "MMM d, yyyy");

    // Ensure start date is before or equal to end date
    if (startDate > endDate) {
      Toast.show({
        type: "error",
        text1: "Invalid Date Range",
        text2: "Start date must be before or equal to end date.",
        position: "bottom",
      });
      return;
    }

    // Format dates for API consumption (YYYY-MM-DD) - Using consistent format
    const apiStartDate = format(startDate, "yyyy-MM-dd");
    const apiEndDate = format(endDate, "yyyy-MM-dd");

    // Show confirmation with the date range and value
    Toast.show({
      type: "info",
      text1: "Confirm Range Update",
      text2: `Set ${
        activeTab === "vacation" ? "Vacation" : "Single Day"
      } allotment to ${numValue} for ${formattedStartDate} to ${formattedEndDate} on calendar "${calendarName}"?`,
      position: "bottom",
      visibilityTime: 4000,
      autoHide: false,
      onPress: () => Toast.hide(),
      props: {
        onAction: async (action: string) => {
          if (action === "confirm") {
            Toast.hide();

            try {
              setIsSubmitting(true);

              // Call the appropriate store function based on the active tab
              let result;
              if (activeTab === "pld_sdv") {
                result = await adminCalendarStore.updatePldSdvRangeOverride(
                  calendarId,
                  apiStartDate,
                  apiEndDate,
                  numValue,
                  user.id
                );
              } else {
                result = await adminCalendarStore.updateVacationRangeOverride(
                  calendarId,
                  apiStartDate,
                  apiEndDate,
                  numValue,
                  user.id
                );
              }

              console.log("Range update result:", result);

              // Success message
              Toast.show({
                type: "success",
                text1: "Range Update",
                text2: `Updated ${result?.affectedCount} ${
                  activeTab === "vacation" ? "weeks" : "days"
                } successfully for calendar "${calendarName}".`,
                position: "bottom",
              });

              // Clear form
              setStartDate(null);
              setEndDate(null);
              setRangeAllotment("");

              // Refresh the current year's data
              const currentYear = new Date().getFullYear();
              adminCalendarStore.fetchAllotments(calendarId, currentYear);
            } catch (error) {
              console.error("Range update error:", error);
              Toast.show({
                type: "error",
                text1: "Error",
                text2: error instanceof Error ? error.message : "Failed to update date range.",
                position: "bottom",
              });
            } finally {
              setIsSubmitting(false);
            }
          }
        },
        actionType: "confirm",
      },
    });
  };

  return (
    <ThemedView style={[styles.container, Platform.OS === "android" && styles.androidContainer]}>
      {/* Tab Navigation */}
      <ThemedView style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "pld_sdv" && styles.activeTab]}
          onPress={() => setActiveTab("pld_sdv")}
        >
          <ThemedText style={[styles.tabText, activeTab === "pld_sdv" && styles.activeTabText]}>
            PLD/SDV Allotment
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "vacation" && styles.activeTab]}
          onPress={() => setActiveTab("vacation")}
        >
          <ThemedText style={[styles.tabText, activeTab === "vacation" && styles.activeTabText]}>
            Vacation Allotment
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Component content */}
      <ThemedView style={{ flex: 1 }}>
        {/* Yearly Allotment Section */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            {activeTab === "vacation" ? "Yearly Vacation Allotment" : "Yearly Single Day Allotment"}
          </ThemedText>
          <ThemedText style={styles.sectionSubtitle}>
            {activeTab === "vacation"
              ? "Sets the lowest number of vacation spots available per week all year. Override this default below."
              : "Sets the lowest number of PLD/SDV spots available per day all year. Override this default below."}
          </ThemedText>
          {[currentYear, nextYear].map((year) => (
            <ThemedView key={year} style={styles.yearContainer}>
              <ThemedText style={styles.yearText}>{year}</ThemedText>
              <TextInput
                style={styles.input}
                value={
                  activeTab === "vacation"
                    ? vacationTempAllotments[year]?.toString() || ""
                    : pldSdvTempAllotments[year]?.toString() || ""
                }
                onChangeText={(text) => {
                  if (activeTab === "vacation") {
                    setVacationTempAllotments({ ...vacationTempAllotments, [year]: text });
                  } else {
                    setPldSdvTempAllotments({ ...pldSdvTempAllotments, [year]: text });
                  }
                }}
                keyboardType="numeric"
                placeholder="Enter allotment"
              />
              <TouchableOpacity style={styles.updateButton} onPress={() => handleUpdateAllotment(year, activeTab)}>
                <ThemedText style={styles.updateButtonText}>Update</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          ))}
        </ThemedView>

        {/* Date Range Allotment Section */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            {activeTab === "vacation" ? "Weekly Vacation Override" : "Daily Override"}
          </ThemedText>
          <ThemedView style={styles.dateRangeContainer}>
            <DatePicker
              date={startDate}
              onDateChange={setStartDate}
              mode="date"
              placeholder="Start Date"
              style={styles.datePicker}
            />
            <DatePicker
              date={endDate}
              onDateChange={setEndDate}
              mode="date"
              placeholder="End Date"
              style={styles.datePicker}
            />
            <TextInput
              style={[styles.input, styles.rangeInput]}
              value={rangeAllotment}
              onChangeText={setRangeAllotment}
              keyboardType="numeric"
              placeholder="Enter allotment"
            />
            <TouchableOpacity
              style={[
                styles.updateButton,
                {
                  backgroundColor: tintColor,
                  opacity:
                    isLoading || isSubmitting || !startDate || !endDate || !rangeAllotment || !calendarId ? 0.5 : 1,
                },
              ]}
              onPress={() => handleRangeUpdate()}
              disabled={isLoading || isSubmitting || !startDate || !endDate || !rangeAllotment || !calendarId}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText style={styles.updateButtonText}>Update Range</ThemedText>
              )}
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>

        {/* Current Allotments Display */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Current Allotments</ThemedText>

          {activeTab === "vacation" ? (
            <>
              {/* Current Year Accordion */}
              <Accordion
                title={`Current Year (${currentYear})`}
                onExpand={() => {
                  console.log(`[CalendarAllotments] Fetching vacation data for ${currentYear}`);
                  if (calendarId) fetchAllotments(calendarId, currentYear);
                }}
              >
                <WeeklyAllotmentsDisplay allotments={getVacationAllotmentsForYear(currentYear)} />
              </Accordion>

              {/* Next Year Accordion */}
              <Accordion
                title={`Next Year (${nextYear})`}
                onExpand={() => {
                  console.log(`[CalendarAllotments] Fetching vacation data for ${nextYear}`);
                  if (calendarId) fetchAllotments(calendarId, nextYear);
                }}
              >
                <WeeklyAllotmentsDisplay allotments={getVacationAllotmentsForYear(nextYear)} />
              </Accordion>
            </>
          ) : (
            <>
              {/* Current Year Accordion */}
              <Accordion
                title={`Current Year (${currentYear})`}
                onExpand={() => {
                  console.log(`[CalendarAllotments] Fetching PLD/SDV data for ${currentYear}`);
                  if (calendarId) fetchAllotments(calendarId, currentYear);
                }}
              >
                <DailyAllotmentsDisplay allotment={getAllotmentForYear(currentYear)} />
              </Accordion>

              {/* Next Year Accordion */}
              <Accordion
                title={`Next Year (${nextYear})`}
                onExpand={() => {
                  console.log(`[CalendarAllotments] Fetching PLD/SDV data for ${nextYear}`);
                  if (calendarId) fetchAllotments(calendarId, nextYear);
                }}
              >
                <DailyAllotmentsDisplay allotment={getAllotmentForYear(nextYear)} />
              </Accordion>
            </>
          )}
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  androidContainer: {
    flex: 0,
    height: "auto",
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.card,
  },
  tab: {
    flex: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  activeTab: {
    backgroundColor: Colors.dark.tint,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeTabText: {
    color: Colors.dark.background,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.dark.textDim,
    marginBottom: 16,
    fontStyle: "italic",
    lineHeight: 20,
  },
  yearContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: Colors.dark.card,
  },
  yearText: {
    fontSize: 16,
    width: 60,
  },
  input: {
    ...Platform.select({
      web: {
        flex: 0.05,
        marginRight: 8,
      },
      android: {
        flex: 0.15,
        minWidth: 30,
        minHeight: 30,
        fontSize: 16,
        paddingVertical: 8,
        marginRight: 8,
        placeholderTextColor: Colors.dark.textDim,
      },
      ios: {
        flex: 0.15,
        minWidth: 60,
        marginRight: 8,
      },
      default: {
        flex: 0.05,
        marginRight: 8,
      },
    }),
    height: Platform.OS === "android" ? 48 : 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    textAlign: "center",
    color: Colors.dark.text,
    backgroundColor: Colors.dark.background,
  },
  updateButton: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateButtonText: {
    color: Colors.dark.background,
    fontWeight: "500",
  },
  dateRangeContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: Colors.dark.card,
  },
  datePicker: {
    flex: 1,
    minWidth: 120,
    height: Platform.OS === "android" ? 48 : 40,
    borderRadius: 4,
    overflow: "hidden",
  },
  rangeInput: {
    flex: 0.5,
    minWidth: 100,
  },
  yearContainerInternal: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 12,
  },
  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  yearTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  infoIcon: {
    marginLeft: "auto",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tooltipContent: {
    padding: 8,
    gap: 4,
  },
  weeklyAllotmentsContainer: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 8,
  },
  weeklyAllotmentsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: Colors.dark.text,
  },
  weeklyAllotmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  textDim: {
    color: Colors.dark.textDim,
  },
  allotmentsContainer: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  allotmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  allotmentHeaderText: {
    fontSize: 14,
    fontWeight: "600",
  },
  allotmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  noDataText: {
    color: Colors.dark.textDim,
    textAlign: "center",
  },
  allotmentSummary: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  },
  allotmentSummaryText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  allotmentValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  overrideInfo: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  overrideText: {
    fontSize: 14,
    fontWeight: "500",
  },
  overrideReasonText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  androidFlexContainer: {
    flex: 0,
    flexGrow: 0,
    height: "auto",
  },
});
