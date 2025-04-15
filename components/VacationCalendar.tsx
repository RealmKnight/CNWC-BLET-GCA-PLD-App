import React, { useMemo, useEffect, useState } from "react";
import { StyleSheet, ActivityIndicator, ViewStyle, TextStyle, Modal } from "react-native";
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
  },
  dark: {
    backgroundColor: Colors.dark.background,
    calendarBackground: Colors.dark.background,
    textSectionTitleColor: Colors.dark.textDim,
    selectedDayBackgroundColor: Colors.dark.tint,
    selectedDayTextColor: "#ffffff",
    todayTextColor: Colors.dark.tint,
    dayTextColor: Colors.dark.text,
    textDisabledColor: Colors.dark.textDim,
    monthTextColor: Colors.dark.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.dark.tint,
    disabledArrowColor: Colors.dark.textDim,
  },
};

const AVAILABILITY_COLORS = {
  available: { color: Colors.light.success, text: "white" }, // Green - Available week
  full: { color: Colors.light.error, text: "white" }, // Red - Full week
  unallocated: { color: Colors.dark.border, text: Colors.dark.textDim }, // Grey - No allocation set
};

interface VacationCalendarProps {
  current?: string;
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

  // Add logging for component state
  useEffect(() => {
    console.log("[VacationCalendar] Component State:", {
      isInitialized,
      isLoading,
      hasAllotments: Object.keys(allotments).length,
      allotmentKeys: Object.keys(allotments),
      hasRequests: Object.keys(requests).length,
      hasNextYearAllotments,
    });
  }, [isInitialized, isLoading, allotments, requests, hasNextYearAllotments]);

  // Use the current prop directly for the calendar view
  const calendarDate = current || format(new Date(), "yyyy-MM-dd");

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
    });

    const dates: any = {};
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear + (hasNextYearAllotments ? 1 : 0), 11, 31);
    console.log("[VacationCalendar] Date Range Check:", { startDate, endDate, hasNextYearAllotments });

    let currentDate = startDate;
    while (currentDate <= endDate) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, "yyyy-MM-dd");

      console.log("[VacationCalendar] Processing week:", {
        weekStartStr,
        hasAllotment: !!currentAllotments[weekStartStr],
      });

      const allotmentData = currentAllotments[weekStartStr];

      if (allotmentData) {
        const availability = getWeekAvailability(weekStartStr);
        const colors = AVAILABILITY_COLORS[availability];

        // Mark the start of the week
        dates[weekStartStr] = {
          startingDay: true,
          color: colors.color,
          textColor: colors.text,
        };

        // Mark days in between
        let dayInWeek = new Date(weekStart);
        dayInWeek.setDate(dayInWeek.getDate() + 1);
        while (format(dayInWeek, "yyyy-MM-dd") !== format(weekEnd, "yyyy-MM-dd")) {
          const dayStr = format(dayInWeek, "yyyy-MM-dd");
          dates[dayStr] = {
            color: colors.color,
            textColor: colors.text,
          };
          dayInWeek.setDate(dayInWeek.getDate() + 1);
        }

        // Mark the end of the week
        const weekEndStr = format(weekEnd, "yyyy-MM-dd");
        dates[weekEndStr] = {
          endingDay: true,
          color: colors.color,
          textColor: colors.text,
        };
      }

      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
    }

    // Selection Highlighting Logic (should still work with customStyles)
    if (selectedWeek) {
      const weekStart = parseISO(selectedWeek);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      let selectionDate = new Date(weekStart);
      while (selectionDate <= weekEnd) {
        const dateStr = format(selectionDate, "yyyy-MM-dd");
        const existingMarking = dates[dateStr] || {}; // Get existing period marking if present
        dates[dateStr] = {
          ...existingMarking, // Keep startingDay/endingDay/color/textColor
          customStyles: {
            // Apply selection border via customStyles
            container: {
              ...existingMarking.customStyles?.container,
              borderWidth: 2,
              borderColor: Colors[theme].tint,
              backgroundColor: existingMarking.color, // Keep the period color as background
            },
            text: {
              ...existingMarking.customStyles?.text,
              color: existingMarking.textColor || Colors[theme].text, // Keep original text color
              fontWeight: "bold",
            },
          },
        };
        selectionDate.setDate(selectionDate.getDate() + 1);
      }
    }

    return dates;
    // Dependencies remain the same
  }, [isInitialized, allotments, requests, selectedWeek, theme, hasNextYearAllotments, getWeekAvailability]); // Added getWeekAvailability back as it's used inside

  const handleDayPress = (day: DateData) => {
    const weekStart = startOfWeek(parseISO(day.dateString), { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");

    const allotmentForWeek = allotments[weekStartStr];

    // Only allow selection/dialog opening if the week has an allotment
    if (allotmentForWeek) {
      setSelectedWeek(weekStartStr); // Highlight the selected week

      // Prepare data for the dialog
      const requestsForWeek = getActiveRequests(weekStartStr);
      setDialogWeekData({
        weekStartDate: weekStartStr,
        allotment: allotmentForWeek,
        requests: requestsForWeek,
      });
      setIsDialogVisible(true); // Show the dialog
    } else {
      // Optionally clear selection if clicking an unallocated week
      setSelectedWeek(null);
      console.log("Clicked week without allotment:", weekStartStr);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogVisible(false);
    setDialogWeekData(null);
    // Optionally clear the visual selection when closing the dialog
    // setSelectedWeek(null);
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
        key={`vacation-calendar-${calendarDate}-${isInitialized}-${Object.keys(allotments).length}-${
          Object.keys(requests).length
        }-${selectedWeek}`}
        theme={CALENDAR_THEME[theme]}
        markingType="period"
        markedDates={markedDates}
        onDayPress={handleDayPress}
        enableSwipeMonths
        style={styles.calendar}
        current={calendarDate}
        firstDay={1}
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
          {/* Remove unallocated from legend if unallocated weeks are not marked */}
          {/* <ThemedView style={styles.legendItem}>
            <ThemedView style={[styles.legendColor, { backgroundColor: AVAILABILITY_COLORS.unallocated.color }]} />
            <ThemedText>No Allocation Set</ThemedText>
          </ThemedView> */}
        </ThemedView>
      </ThemedView>

      {/* Render the Dialog Conditionally */}
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
