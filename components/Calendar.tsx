import React, { useEffect, useMemo } from "react";
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
    backgroundColor: "#ffffff",
    calendarBackground: "#ffffff",
    textSectionTitleColor: "#b6c1cd",
    selectedDayBackgroundColor: Colors.light.tint,
    selectedDayTextColor: "#ffffff",
    todayTextColor: Colors.light.tint,
    dayTextColor: "#2d4150",
    textDisabledColor: "#d9e1e8",
    dotColor: Colors.light.tint,
    monthTextColor: "#2d4150",
    textMonthFontWeight: "bold",
    arrowColor: Colors.light.tint,
    disabledArrowColor: "#d9e1e8",
  },
  dark: {
    backgroundColor: Colors.dark.background,
    calendarBackground: Colors.dark.background,
    textSectionTitleColor: "#7a7a7a",
    selectedDayBackgroundColor: Colors.dark.tint,
    selectedDayTextColor: "#ffffff",
    todayTextColor: Colors.dark.tint,
    dayTextColor: Colors.dark.text,
    textDisabledColor: "#4a4a4a",
    dotColor: Colors.dark.tint,
    monthTextColor: Colors.dark.text,
    textMonthFontWeight: "bold",
    arrowColor: Colors.dark.tint,
    disabledArrowColor: "#4a4a4a",
  },
};

const AVAILABILITY_COLORS = {
  available: { color: "#4CAF50", text: "white" }, // Green - Slots available
  limited: { color: "#FFC107", text: "black" }, // Yellow - Less than 30% slots left
  full: { color: "#F44336", text: "white" }, // Red - No slots available
  unavailable: { color: "#9E9E9E", text: "white" }, // Grey - Cannot be requested (past/too far)
};

interface CalendarProps {
  current?: string;
}

export function Calendar({ current }: CalendarProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const division = useUserStore((state) => state.division);
  const {
    selectedDate,
    setSelectedDate,
    isDateSelectable,
    getDateAvailability,
    isLoading,
    isInitialized,
    error,
    loadInitialData,
  } = useCalendarStore();

  // Log when component receives new current prop
  useEffect(() => {
    console.log("[Calendar] Received new current prop:", current);
  }, [current]);

  // Calculate date range for fetching data
  const dateRange = useMemo(() => {
    const now = new Date();
    // Calculate exactly 6 months from today (keeping the same date)
    const endDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
    return {
      start: format(now, "yyyy-MM-dd"),
      end: format(endDate, "yyyy-MM-dd"),
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    async function initializeData() {
      if (division) {
        try {
          await loadInitialData(dateRange.start, dateRange.end);
        } catch (error) {
          console.error("[Calendar] Error loading data:", error);
        }
      }
    }
    initializeData();
  }, [division, dateRange.start, dateRange.end, loadInitialData]);

  // Generate marked dates for the calendar
  const markedDates = useMemo(() => {
    if (!isInitialized) {
      console.log("[Calendar] Not initialized yet, returning empty marked dates");
      return {};
    }

    const dates: any = {};
    const now = new Date();

    // Get all dates in the visible range (including past month for context)
    const visibleRangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Calculate exactly 6 months from today (keeping the same date)
    const visibleRangeEnd = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

    const allDates = eachDayOfInterval({
      start: visibleRangeStart,
      end: visibleRangeEnd,
    });

    // Add marks for all dates in range
    allDates.forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const availability = getDateAvailability(dateStr);
      const colors = AVAILABILITY_COLORS[availability];

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
    });

    // Add selection styling
    if (selectedDate) {
      dates[selectedDate] = {
        ...dates[selectedDate],
        selected: true,
        customStyles: {
          ...(dates[selectedDate]?.customStyles || {}),
          container: {
            ...(dates[selectedDate]?.customStyles?.container || {}),
            borderWidth: 2,
            borderColor: Colors[theme].tint,
          },
        },
      };
    }

    return dates;
  }, [selectedDate, theme, isInitialized, getDateAvailability]);

  const handleDayPress = (day: DateData) => {
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

    if (isDateSelectable(day.dateString)) {
      setSelectedDate(day.dateString);
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

  if (isLoading || !isInitialized) {
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

  return (
    <ThemedView style={styles.container}>
      <RNCalendar
        key={`calendar-inner-${current}`}
        theme={CALENDAR_THEME[theme]}
        markingType="custom"
        markedDates={markedDates}
        onDayPress={(day: DateData) => {
          console.log("[Calendar] Day pressed:", day.dateString);
          handleDayPress(day);
        }}
        enableSwipeMonths
        style={styles.calendar}
        current={current}
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
                  : "Not Available"}
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
