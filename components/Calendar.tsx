import React, { useEffect, useMemo, useCallback, useState } from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { Calendar as RNCalendar, DateData } from "react-native-calendars";
import { addMonths, format, parseISO, eachDayOfInterval, startOfDay, isAfter, isBefore, addDays } from "date-fns";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import Toast from "react-native-toast-message";

type ColorScheme = keyof typeof Colors;

const CALENDAR_THEME = {
  light: {
    backgroundColor: Colors.light.background,
    calendarBackground: Colors.light.background,
    textSectionTitleColor: Colors.light.textDim,
    selectedDayBackgroundColor: Colors.light.tint,
    selectedDayTextColor: "#000000",
    todayTextColor: Colors.light.tint,
    dayTextColor: Colors.light.text,
    textDisabledColor: Colors.light.textDim,
    dotColor: Colors.light.tint,
    monthTextColor: Colors.light.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.light.tint,
    disabledArrowColor: Colors.light.disabled,
  },
  dark: {
    backgroundColor: Colors.dark.background,
    calendarBackground: Colors.dark.background,
    textSectionTitleColor: Colors.dark.textDim,
    selectedDayBackgroundColor: Colors.dark.tint,
    selectedDayTextColor: "#000000",
    todayTextColor: Colors.dark.tint,
    dayTextColor: Colors.dark.text,
    textDisabledColor: Colors.dark.textDim,
    dotColor: Colors.dark.tint,
    monthTextColor: Colors.dark.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.dark.tint,
    disabledArrowColor: Colors.dark.disabled,
  },
};

const AVAILABILITY_COLORS = {
  available: { color: "#4CAF50", text: "black" }, // Green - Slots available
  limited: { color: "#FFC107", text: "black" }, // Yellow - Less than 30% slots left
  full: { color: "#F44336", text: "black" }, // Red - No slots available
  unavailable: { color: "#9E9E9E", text: "#666633" }, // Grey - Cannot be requested (past/too far)
  userRequested: { color: "#2196F3", text: "black" }, // Blue - User has already requested this day
};

interface CalendarProps {
  current?: string;
  zoneId?: number;
  isZoneSpecific?: boolean;
}

export function Calendar({ current, zoneId, isZoneSpecific = false }: CalendarProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const division = useUserStore((state) => state.division);
  const member = useUserStore((state) => state.member);
  const {
    selectedDate,
    setSelectedDate,
    isDateSelectable,
    getDateAvailability,
    isLoading,
    isInitialized,
    error,
    allotments,
    yearlyAllotments,
    requests,
    checkSixMonthRequest,
  } = useCalendarStore();

  // Store days with six month requests to avoid excessive DB lookups
  const [sixMonthRequestDays, setSixMonthRequestDays] = useState<Record<string, boolean>>({});

  // Use the current prop directly for the calendar view
  const calendarDate = current || selectedDate || format(new Date(), "yyyy-MM-dd");

  // Log when the calendar date changes
  useEffect(() => {
    console.log("[Calendar] Calendar date updated:", {
      current,
      selectedDate,
      calendarDate,
    });
  }, [current, selectedDate, calendarDate]);

  // Calculate date range for fetching data
  const dateRange = useMemo(() => {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
    return {
      start: format(now, "yyyy-MM-dd"),
      end: format(endDate, "yyyy-MM-dd"),
    };
  }, []);

  // Function to check if user has an active regular request for a specific date
  const hasUserRequestForDate = useCallback(
    (dateStr: string) => {
      if (!member?.id || !requests[dateStr]) return false;

      return requests[dateStr].some(
        (req) =>
          req.member_id === member.id &&
          ["approved", "pending", "waitlisted", "cancellation_pending"].includes(req.status)
      );
    },
    [member?.id, requests]
  );

  // Function to check if user has either a regular or six-month request for a date
  const hasUserAnyRequestForDate = useCallback(
    async (dateStr: string) => {
      // First check regular requests
      const hasRegularRequest = hasUserRequestForDate(dateStr);
      if (hasRegularRequest) return true;

      // If we've already checked for a six-month request for this date, use cached result
      if (sixMonthRequestDays[dateStr] !== undefined) {
        return sixMonthRequestDays[dateStr];
      }

      // Otherwise, check for six-month request
      try {
        const hasSixMonthRequest = await checkSixMonthRequest(dateStr);

        // Cache the result
        setSixMonthRequestDays((prev) => ({
          ...prev,
          [dateStr]: hasSixMonthRequest,
        }));

        return hasSixMonthRequest;
      } catch (error) {
        console.error(`[Calendar] Error checking six month request for ${dateStr}:`, error);
        return false;
      }
    },
    [hasUserRequestForDate, checkSixMonthRequest, sixMonthRequestDays]
  );

  // Prefetch six-month request data for visible dates
  useEffect(() => {
    if (!isInitialized || !member?.id) return;

    // Get the six-month date
    const sixMonthDate = addMonths(new Date(), 6);
    const sixMonthDateStr = format(sixMonthDate, "yyyy-MM-dd");

    // Check if user has a six-month request and cache the result
    checkSixMonthRequest(sixMonthDateStr)
      .then((hasRequest) => {
        if (hasRequest) {
          setSixMonthRequestDays((prev) => ({
            ...prev,
            [sixMonthDateStr]: true,
          }));
        }
      })
      .catch((error) => {
        console.error("[Calendar] Error pre-fetching six month request data:", error);
      });
  }, [isInitialized, member?.id, checkSixMonthRequest]);

  // Generate marked dates for the calendar
  const markedDates = useMemo(() => {
    if (!division || !isInitialized) {
      console.log("[Calendar] Not ready to generate marks:", { hasDivision: !!division, isInitialized });
      return {};
    }

    console.log("[Calendar] Generating marked dates", {
      isInitialized,
      division,
      zoneId,
      isZoneSpecific,
      hasRequests: Object.keys(requests).length,
      hasAllotments: Object.keys(allotments).length,
      hasYearlyAllotments: Object.keys(yearlyAllotments).length,
      selectedDate,
    });

    const dates: any = {};
    const now = startOfDay(new Date());

    // Get all dates in the visible range (including past month for context)
    const visibleRangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const visibleRangeEnd = addMonths(now, 6);

    const allDates = eachDayOfInterval({
      start: visibleRangeStart,
      end: visibleRangeEnd,
    });

    // Add marks for all dates in range
    allDates.forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");

      // First check if the user has a regular request for this date
      const userHasRegularRequest = hasUserRequestForDate(dateStr);

      // Then check if the user has a six-month request for this date
      const userHasSixMonthRequest = sixMonthRequestDays[dateStr] === true;

      // User has any request (regular or six-month)
      const userHasAnyRequest = userHasRegularRequest || userHasSixMonthRequest;

      // If user has any request, use the userRequested color
      // Otherwise, use the regular availability color
      const availability = userHasAnyRequest ? "userRequested" : getDateAvailability(dateStr);
      const colors = AVAILABILITY_COLORS[availability];

      if (!colors) {
        console.warn(`[Calendar] No colors found for availability: ${availability}`);
        return;
      }

      dates[dateStr] = {
        customStyles: {
          container: {
            backgroundColor: colors.color,
          },
          text: {
            color: colors.text,
            fontWeight: "bold",
          },
        },
      };

      // Add selection styling if this is the selected date
      if (selectedDate === dateStr) {
        dates[dateStr] = {
          ...dates[dateStr],
          selected: true,
          customStyles: {
            ...dates[dateStr].customStyles,
            container: {
              ...dates[dateStr].customStyles.container,
              borderWidth: 2,
              borderColor: Colors[theme].tint,
            },
          },
        };
      }
    });

    return dates;
  }, [
    division,
    isInitialized,
    zoneId,
    isZoneSpecific,
    selectedDate,
    theme,
    allotments,
    yearlyAllotments,
    requests,
    getDateAvailability,
    hasUserRequestForDate,
    sixMonthRequestDays,
  ]);

  // Log when marked dates are regenerated
  useEffect(() => {
    console.log("[Calendar] Marked dates updated:", {
      hasMarks: Object.keys(markedDates).length,
      zoneId,
      isInitialized,
    });
  }, [markedDates, zoneId, isInitialized]);

  const handleDayPress = async (day: DateData) => {
    const now = new Date();
    const dateObj = parseISO(day.dateString);
    const fortyEightHoursFromNow = addDays(now, 2);
    const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

    if (isBefore(dateObj, fortyEightHoursFromNow)) {
      Toast.show({
        type: "info",
        text1: "Not Available",
        text2: "Day you clicked is no longer available to Request",
        position: "bottom",
        visibilityTime: 3000,
        topOffset: 50,
      });
      return;
    }

    if (isAfter(dateObj, sixMonthsFromNow)) {
      Toast.show({
        type: "info",
        text1: "Not Available",
        text2: "That day is not yet available to be Requested",
        position: "bottom",
        visibilityTime: 3000,
        topOffset: 50,
      });
      return;
    }

    // We don't need to check zone access here since we've already validated it during zone ID calculation
    // and the calendar only shows the correct zone's data if the user has access

    if (isDateSelectable(day.dateString)) {
      setSelectedDate(day.dateString);

      // Check if the selected date has a six-month request after selection
      if (day.dateString) {
        const hasSixMonthRequest = await checkSixMonthRequest(day.dateString);
        if (hasSixMonthRequest) {
          setSixMonthRequestDays((prev) => ({
            ...prev,
            [day.dateString]: true,
          }));
        }
      }
    } else {
      // This case handles when the date is within range but not available (e.g., full)
      Toast.show({
        type: "info",
        text1: "Not Available",
        text2: "This date is not available for requests",
        position: "bottom",
        visibilityTime: 3000,
        topOffset: 50,
      });
    }
  };

  // Only show loading state if we're not initialized
  if (!isInitialized) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
        <ThemedText style={styles.loadingText}>Loading calendar data...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ThemedText style={styles.errorText}>Error loading calendar: {error}</ThemedText>
      </ThemedView>
    );
  }

  // If we're initialized but don't have a division, show an error
  if (!division) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ThemedText style={styles.errorText}>No division selected</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <RNCalendar
        key={`calendar-${zoneId}-${isInitialized}-${calendarDate}`}
        theme={CALENDAR_THEME[theme]}
        markingType="custom"
        markedDates={markedDates}
        onDayPress={(day: DateData) => {
          console.log("[Calendar] Day pressed:", day.dateString);
          handleDayPress(day);
        }}
        enableSwipeMonths
        style={styles.calendar}
        current={calendarDate}
        onMonthChange={(month: DateData) => {
          console.log("[Calendar] Month changed to:", month.dateString);
        }}
      />

      <ThemedView style={styles.legend}>
        <ThemedText type="subtitle">Day Availability:</ThemedText>
        <ThemedView style={styles.legendItems}>
          {Object.entries(AVAILABILITY_COLORS).map(([key, value]) => (
            <ThemedView key={key} style={styles.legendItem}>
              <ThemedView style={[styles.legendColor, { backgroundColor: value.color }]} />
              <ThemedText>
                {key === "available"
                  ? "Available"
                  : key === "limited"
                  ? "Limited Slots"
                  : key === "full"
                  ? "Full"
                  : key === "unavailable"
                  ? "Not Available"
                  : key === "userRequested"
                  ? "Your Requests"
                  : key}
              </ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
  },
  errorText: {
    color: Colors.light.error,
    textAlign: "center",
  },
  calendar: {
    marginBottom: 10,
  },
  legend: {
    padding: 10,
  },
  legendItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 5,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
