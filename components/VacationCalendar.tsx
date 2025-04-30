import React, { useMemo, useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, ViewStyle, TextStyle, Modal, Platform } from "react-native";
import { Calendar as RNCalendar, DateData } from "react-native-calendars";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { useVacationCalendarStore, WeekAllotment, WeekRequest } from "@/store/vacationCalendarStore";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { VacationWeekDialog } from "./VacationWeekDialog";

type ColorScheme = keyof typeof Colors;

const CALENDAR_THEME = {
  light: {
    backgroundColor: Colors.light.background,
    calendarBackground: Colors.light.background,
    textSectionTitleColor: Colors.light.textDim,
    selectedDayBackgroundColor: Colors.light.tint,
    selectedDayTextColor: "#ffffff",
    todayTextColor: Colors.light.tint,
    dayTextColor: Colors.light.text,
    textDisabledColor: Colors.light.textDim,
    monthTextColor: Colors.light.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.light.tint,
    disabledArrowColor: Colors.light.textDim,
    textDayFontSize: 18,
    textDayFontWeight: "700",
    textDayFontFamily: Platform.OS === "ios" ? "System" : "Roboto",
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
    monthTextColor: Colors.dark.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.dark.tint,
    disabledArrowColor: Colors.dark.textDim,
    textDayFontSize: 18,
    textDayFontWeight: "700",
    textDayFontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
};

const AVAILABILITY_COLORS = {
  available: { color: Colors.light.success, text: "black" }, // Green - Available week
  full: { color: Colors.light.error, text: "black" }, // Red - Full week
  unallocated: { color: Colors.dark.border, text: Colors.dark.textDim }, // Grey - No allocation set
};

interface VacationCalendarProps {
  current?: string;
}

// Add a stable calendar data hook to avoid resets
function useStableCalendarData(initialCurrent: string | undefined) {
  // Keep track of the calendar date to prevent resets
  const [stableCurrentDate, setStableCurrentDate] = useState(initialCurrent || format(new Date(), "yyyy-MM-dd"));

  // Only update if it's a valid value
  useEffect(() => {
    if (initialCurrent) {
      setStableCurrentDate(initialCurrent);
    }
  }, [initialCurrent]);

  return stableCurrentDate;
}

export function VacationCalendar({ current }: VacationCalendarProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const {
    selectedWeek,
    setSelectedWeek,
    allotments,
    requests,
    isLoading,
    isInitialized,
    error,
    getWeekAvailability,
    hasNextYearAllotments,
    getActiveRequests,
  } = useVacationCalendarStore();

  // State for the dialog
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [dialogWeekData, setDialogWeekData] = useState<{
    weekStartDate: string;
    allotment: WeekAllotment;
    requests: WeekRequest[];
  } | null>(null);

  // Use our custom hook to maintain stable date
  const stableCalendarDate = useStableCalendarData(current);

  // Add logging for component state
  useEffect(() => {
    console.log("[VacationCalendar] Component State:", {
      isInitialized,
      isLoading,
      hasAllotments: Object.keys(allotments).length,
      allotmentKeys: Object.keys(allotments),
      hasRequests: Object.keys(requests).length,
      hasNextYearAllotments,
      selectedWeek,
      dialogVisible: isDialogVisible,
    });

    // Log the specific weeks we're having issues with
    const checkWeeks = ["2024-05-12", "2024-05-19"];
    checkWeeks.forEach((weekKey) => {
      if (allotments[weekKey]) {
        const availability = getWeekAvailability(weekKey);
        console.log(`[VacationCalendar] Week ${weekKey} availability:`, {
          availability,
          allotment: allotments[weekKey],
          requests: requests[weekKey] || [],
        });
      }
    });
  }, [
    isInitialized,
    isLoading,
    allotments,
    requests,
    hasNextYearAllotments,
    getWeekAvailability,
    selectedWeek,
    isDialogVisible,
  ]);

  // Generate a very stable key that doesn't change with dialog visibility
  const calendarKey = useMemo(() => {
    return `vacation-calendar-${stableCalendarDate}-${isInitialized}`;
  }, [stableCalendarDate, isInitialized]);

  // Generate marked dates for the calendar
  const markedDates = useMemo(() => {
    if (!isInitialized) {
      console.log("[VacationCalendar] Not ready to generate marks");
      return {};
    }

    const { allotments: currentAllotments, requests: currentRequests } = useVacationCalendarStore.getState();
    console.log("[VacationCalendar] Generating marks with state:", {
      allotmentCount: Object.keys(currentAllotments).length,
      requestCount: Object.keys(currentRequests).length,
      hasNextYearAllotments,
    });

    const dates: any = {};
    const currentYear = new Date().getFullYear();
    // Get first day of the year
    const yearStart = new Date(currentYear, 0, 1);
    // Find the first Monday
    const startDate = startOfWeek(yearStart, { weekStartsOn: 1 });
    // Get last day of the year (or next year if we have next year allotments)
    const yearEnd = new Date(currentYear + (hasNextYearAllotments ? 1 : 0), 11, 31);
    // Find the last Sunday
    const endDate = endOfWeek(yearEnd, { weekStartsOn: 1 });

    console.log("[VacationCalendar] Date Range for Marking:", {
      startDate,
      endDate,
      hasNextYearAllotments,
      isFirstDayMonday: format(startDate, "EEEE") === "Monday",
      isLastDaySunday: format(endDate, "EEEE") === "Sunday",
    });

    let currentDate = startDate;
    while (currentDate <= endDate) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");

      if (weekStart > endDate) {
        currentDate.setDate(currentDate.getDate() + 7);
        continue;
      }

      const allotmentData = currentAllotments[weekStartStr];

      let availability = "unallocated";
      if (allotmentData) {
        availability = getWeekAvailability(weekStartStr);
      }
      const colors = AVAILABILITY_COLORS[availability as keyof typeof AVAILABILITY_COLORS];

      dates[weekStartStr] = {
        startingDay: true,
        color: colors.color,
        textColor: colors.text,
        customStyles: {
          text: {
            fontWeight: "700",
            fontSize: 18,
          },
        },
      };

      let dayInWeek = new Date(weekStart);
      dayInWeek.setDate(dayInWeek.getDate() + 1);
      while (format(dayInWeek, "yyyy-MM-dd") !== format(weekEnd, "yyyy-MM-dd")) {
        const dayStr = format(dayInWeek, "yyyy-MM-dd");
        if (dayInWeek <= endDate) {
          dates[dayStr] = {
            color: colors.color,
            textColor: colors.text,
            customStyles: {
              text: {
                fontWeight: "700",
                fontSize: 18,
              },
            },
          };
        }
        dayInWeek.setDate(dayInWeek.getDate() + 1);
      }

      if (weekEnd <= endDate) {
        const weekEndStr = format(weekEnd, "yyyy-MM-dd");
        dates[weekEndStr] = {
          endingDay: true,
          color: colors.color,
          textColor: colors.text,
          customStyles: {
            text: {
              fontWeight: "700",
              fontSize: 18,
            },
          },
        };
      }

      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (selectedWeek) {
      const weekStart = parseISO(selectedWeek);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      let selectionDate = new Date(weekStart);
      while (selectionDate <= weekEnd) {
        const dateStr = format(selectionDate, "yyyy-MM-dd");
        const existingMarking = dates[dateStr] || {};
        dates[dateStr] = {
          ...existingMarking,
          customStyles: {
            container: {
              ...existingMarking.customStyles?.container,
              borderWidth: 2,
              borderColor: Colors[theme].tint,
              backgroundColor: existingMarking.color,
            },
            text: {
              ...existingMarking.customStyles?.text,
              color: existingMarking.textColor || Colors[theme].text,
              fontWeight: "bold",
            },
          },
        };
        selectionDate.setDate(selectionDate.getDate() + 1);
      }
    }

    return dates;
  }, [isInitialized, allotments, requests, selectedWeek, theme, hasNextYearAllotments, getWeekAvailability]);

  const handleDayPress = (day: DateData) => {
    const weekStart = startOfWeek(parseISO(day.dateString), { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");

    console.log("[VacationCalendar] Day pressed:", {
      date: day.dateString,
      weekStart: weekStartStr,
    });

    const allotmentForWeek = allotments[weekStartStr];

    if (allotmentForWeek) {
      setSelectedWeek(weekStartStr);

      const requestsForWeek = getActiveRequests(weekStartStr);

      console.log("[VacationCalendar] Opening dialog:", {
        weekStartStr,
        allotment: {
          max: allotmentForWeek.max_allotment,
          current: allotmentForWeek.current_requests,
        },
        requestsCount: requestsForWeek.length,
      });

      setDialogWeekData({
        weekStartDate: weekStartStr,
        allotment: allotmentForWeek,
        requests: requestsForWeek,
      });
      setIsDialogVisible(true);
    } else {
      setSelectedWeek(null);
      console.log("[VacationCalendar] No allotment for week:", weekStartStr);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogVisible(false);
  };

  if (!isInitialized && isLoading) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
        <ThemedText>Loading vacation calendar...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <RNCalendar
        key={calendarKey}
        theme={CALENDAR_THEME[theme]}
        markingType="period"
        markedDates={markedDates}
        onDayPress={handleDayPress}
        enableSwipeMonths
        style={styles.calendar}
        current={stableCalendarDate}
        firstDay={1}
        dayComponentHeight={50}
      />

      <ThemedView style={styles.legend}>
        <ThemedText type="subtitle">Vacation Week Status:</ThemedText>
        <ThemedView style={styles.legendItems}>
          <ThemedView style={styles.legendItem}>
            <ThemedView style={[styles.legendColor, { backgroundColor: AVAILABILITY_COLORS.available.color }]} />
            <ThemedText>Available</ThemedText>
          </ThemedView>
          <ThemedView style={styles.legendItem}>
            <ThemedView style={[styles.legendColor, { backgroundColor: AVAILABILITY_COLORS.full.color }]} />
            <ThemedText>Full</ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {dialogWeekData && (
        <VacationWeekDialog
          isVisible={isDialogVisible}
          onClose={handleCloseDialog}
          weekStartDate={dialogWeekData.weekStartDate}
          allotment={dialogWeekData.allotment}
          requests={dialogWeekData.requests}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  } as ViewStyle,
  errorText: {
    color: Colors.light.error,
    textAlign: "center",
  } as TextStyle,
  calendar: {
    marginBottom: 10,
  } as ViewStyle,
  legend: {
    padding: 10,
  } as ViewStyle,
  legendItems: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 5,
    marginBottom: 10,
  } as ViewStyle,
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  } as ViewStyle,
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
  } as ViewStyle,
});
