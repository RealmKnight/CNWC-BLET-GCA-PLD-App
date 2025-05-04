import React, { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { Calendar as RNCalendar, DateData } from "react-native-calendars";
import {
  addMonths,
  format,
  parseISO,
  eachDayOfInterval,
  startOfDay,
  isAfter,
  isBefore,
  addDays,
  isLastDayOfMonth,
} from "date-fns";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import Toast from "react-native-toast-message";
import { supabase } from "@/utils/supabase";
import { useTimeStore } from "@/store/timeStore";

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
  onDayActuallyPressed?: (date: string) => void;
}

export function Calendar({ current, zoneId, isZoneSpecific = false, onDayActuallyPressed }: CalendarProps) {
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
    sixMonthRequestDays,
    checkSixMonthRequest,
  } = useCalendarStore();

  const timeOffRequests = useTimeStore((state) => state.timeOffRequests);

  const pilRequestsByDate = useMemo(() => {
    if (!member?.id || !timeOffRequests || timeOffRequests.length === 0) return {};

    const pilMap: Record<string, boolean> = {};
    timeOffRequests.forEach((request) => {
      // Debug log for each request's structure to verify field names
      if (request.member_id === member.id) {
        console.log(`[Calendar] Examining timeStore request:`, {
          hasDate: !!request.date,
          hasRequestDate: !!request.request_date,
          isPIL: request.paid_in_lieu,
          status: request.status,
        });
      }

      if (
        request.member_id === member.id &&
        request.paid_in_lieu === true &&
        ["approved", "pending", "waitlisted", "cancellation_pending"].includes(request.status)
      ) {
        // Use request_date as the primary field, fallback to date if needed
        const dateField = request.request_date || request.date;
        if (dateField) {
          pilMap[dateField] = true;
          console.log(`[Calendar] Found PIL request in timeStore for ${dateField}:`, request);
        }
      }
    });

    console.log(`[Calendar] Total PIL requests from timeStore: ${Object.keys(pilMap).length}`);
    return pilMap;
  }, [timeOffRequests, member?.id]);

  // Use a ref to track if marked dates were already generated
  const markedDatesGeneratedRef = useRef(false);
  // Use a ref to store the last generated mark dates
  const lastGeneratedMarksRef = useRef<Record<string, any>>({});

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

  useEffect(() => {
    console.log("[Calendar] Initializing with memberId:", member?.id);

    // Debug: Check if there are any PIL requests in the request data
    if (isInitialized && member?.id) {
      const allDates = Object.keys(requests);
      let pilRequestCount = 0;

      allDates.forEach((date) => {
        const dateRequests = requests[date] || [];
        const userPilRequests = dateRequests.filter(
          (req) =>
            req.member_id === member.id &&
            req.paid_in_lieu === true &&
            ["approved", "pending", "waitlisted", "cancellation_pending"].includes(req.status)
        );

        pilRequestCount += userPilRequests.length;
        if (userPilRequests.length > 0) {
          console.log(
            `[Calendar] Found ${userPilRequests.length} PIL requests for ${date}:`,
            userPilRequests.map((r) => ({
              status: r.status,
              leave_type: r.leave_type,
              paid_in_lieu: r.paid_in_lieu,
            }))
          );
        }
      });

      console.log(`[Calendar] Total PIL requests found across all dates: ${pilRequestCount}`);
    }
  }, [isInitialized, member?.id, requests]);

  // Function to check if user has an active regular request for a specific date
  const hasUserRequestForDate = useCallback(
    (dateStr: string): DayRequest | null => {
      if (!member?.id || !requests[dateStr]) return null;

      // Make sure we're looking at ALL requests for this user on this date
      const userRequests = requests[dateStr].filter(
        (req) =>
          req.member_id === member.id &&
          ["approved", "pending", "waitlisted", "cancellation_pending"].includes(req.status)
      );

      // Specifically check for PIL requests
      const pilRequests = userRequests.filter((req) => req.paid_in_lieu === true);
      if (pilRequests.length > 0) {
        console.log(`[Calendar] hasUserRequestForDate found ${pilRequests.length} PIL requests for ${dateStr}`);
      }

      // Log all user requests for debugging
      if (userRequests.length > 0) {
        console.log(
          `[Calendar] User has ${userRequests.length} requests for ${dateStr}:`,
          userRequests.map((r) => ({ status: r.status, type: r.leave_type, isPIL: r.paid_in_lieu }))
        );
      }

      // Return any matching request (including PIL ones)
      return userRequests.length > 0 ? userRequests[0] : null;
    },
    [member?.id, requests]
  );

  // Generate marked dates for the calendar - with optimized memoization to reduce recalculations
  const markedDates = useMemo(() => {
    // Skip if not ready
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
      hasSixMonthRequests: Object.keys(sixMonthRequestDays).length,
      hasPilRequests: Object.keys(pilRequestsByDate).length,
      selectedDate,
    });

    // Always regenerate for consistency
    markedDatesGeneratedRef.current = true;

    const dates: any = {};
    const now = startOfDay(new Date());
    const currentYear = now.getFullYear();

    // Calculate the six-month reference date
    const sixMonthsFromNow = addMonths(now, 6);
    const sixMonthYear = sixMonthsFromNow.getFullYear();
    const isEndOfMonth = isLastDayOfMonth(now);

    // Log these critical values for debugging
    console.log("[Calendar] Six-month date calculation:", {
      today: format(now, "yyyy-MM-dd"),
      isEndOfMonth,
      sixMonthDate: format(sixMonthsFromNow, "yyyy-MM-dd"),
      sixMonthMonth: sixMonthsFromNow.getMonth() + 1,
      sixMonthYear: sixMonthYear,
      sixMonthDay: sixMonthsFromNow.getDate(),
    });

    // Expand range to cover Jan 1st of current year to Dec 31st of the six-month year
    const visibleRangeStart = new Date(currentYear, 0, 1); // Jan 1st of current year
    const visibleRangeEnd = new Date(sixMonthYear, 11, 31); // Dec 31st of the year the 6-month mark is in

    console.log("[Calendar] Generating marks for range:", {
      start: format(visibleRangeStart, "yyyy-MM-dd"),
      end: format(visibleRangeEnd, "yyyy-MM-dd"),
    });

    const allDates = eachDayOfInterval({
      start: visibleRangeStart,
      end: visibleRangeEnd,
    });

    // Add marks for all dates in range
    allDates.forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");

      // Check if the user has a request (Regular, PIL, or six-month)
      const userRequest = hasUserRequestForDate(dateStr);

      // Check for PIL requests from timeStore
      const hasPilRequest = pilRequestsByDate[dateStr] === true;

      // ANY user request should mark the day as "userRequested"
      const userHasRequest = !!userRequest;
      const userHasSixMonthRequest = sixMonthRequestDays[dateStr] === true;
      const userHasAnyRequest = userHasRequest || userHasSixMonthRequest || hasPilRequest;

      // Debug PIL requests specifically
      if (userRequest?.paid_in_lieu || hasPilRequest) {
        console.log(
          `[Calendar] User has a PIL request for ${dateStr} - from ${userRequest ? "calendarStore" : "timeStore"}`
        );
      }

      // CRITICAL FIX: Directly determine if this is a six-month request date
      // Same algorithm as in calendarStore.ts
      const isSixMonthDate = date.getTime() === sixMonthsFromNow.getTime();
      const isSixMonthRequest =
        isSixMonthDate ||
        (isEndOfMonth &&
          date.getMonth() === sixMonthsFromNow.getMonth() &&
          date.getFullYear() === sixMonthsFromNow.getFullYear() &&
          date.getDate() >= sixMonthsFromNow.getDate());

      // Debug problematic dates to make sure they're correctly identified
      if (date.getDate() === 31 && date.getMonth() === 9 && date.getFullYear() === 2025) {
        // Oct 31, 2025
        console.log(`[Calendar] Six-month status check for ${dateStr}:`, {
          isSixMonthDate,
          isEndOfMonth,
          isSameMonth: date.getMonth() === sixMonthsFromNow.getMonth(),
          isSameYear: date.getFullYear() === sixMonthsFromNow.getFullYear(),
          dateDay: date.getDate(),
          sixMonthDay: sixMonthsFromNow.getDate(),
          isAfterSixMonthDay: date.getDate() >= sixMonthsFromNow.getDate(),
          isSixMonthRequest,
          getDateAvailabilityResult: getDateAvailability(dateStr),
        });
      }

      // Determine availability
      let availability;

      if (userHasAnyRequest) {
        // If user has ANY request (regular, PIL, or six-month), mark as userRequested
        availability = "userRequested";
      } else if (isSixMonthRequest) {
        // If it's a six-month request date AND user doesn't have a request, mark available
        availability = "available";
      } else {
        // Otherwise use the standard getDateAvailability function
        availability = getDateAvailability(dateStr);
      }

      const colors = AVAILABILITY_COLORS[availability];

      if (!colors) {
        console.warn(`[Calendar] No colors found for availability: ${availability}`);
        return;
      }

      // Determine if the date should be disabled based on the store's logic
      const isDisabled = !isDateSelectable(dateStr);

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
        disabled: isDisabled, // Use disabled prop for visual cue
        disableTouchEvent: isDisabled, // Disable touch if not selectable
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

    // Store the generated dates for future use
    lastGeneratedMarksRef.current = dates;
    return dates;
  }, [
    division,
    isInitialized,
    zoneId,
    isZoneSpecific,
    selectedDate,
    theme,
    requests,
    allotments,
    yearlyAllotments,
    sixMonthRequestDays,
    getDateAvailability,
    hasUserRequestForDate,
    pilRequestsByDate,
  ]);

  // Reset the marked dates generated flag when fundamental data changes
  useEffect(() => {
    markedDatesGeneratedRef.current = false;
  }, [
    Object.keys(allotments).length,
    Object.keys(yearlyAllotments).length,
    Object.keys(requests).length,
    Object.keys(sixMonthRequestDays).length,
  ]);

  // Generate a unique key for the calendar that changes when data changes
  const calendarDataKey = useMemo(() => {
    // Create a string that changes when any relevant data changes
    const allotmentsLength = Object.keys(allotments).length;
    const yearlyAllotmentsLength = Object.keys(yearlyAllotments).length;
    const requestsLength = Object.keys(requests).length;

    // Count requests by status for more detailed tracking
    let approvedCount = 0;
    let pendingCount = 0;
    let waitlistedCount = 0;

    // Create a hash of the data that will change when the data changes
    Object.values(requests).forEach((dateRequests) => {
      dateRequests.forEach((req) => {
        if (req.status === "approved") approvedCount++;
        else if (req.status === "pending") pendingCount++;
        else if (req.status === "waitlisted") waitlistedCount++;
      });
    });

    // Return a unique key based on data counts
    return `calendar-${zoneId}-${isInitialized}-${calendarDate}-${allotmentsLength}-${yearlyAllotmentsLength}-${requestsLength}-${approvedCount}-${pendingCount}-${waitlistedCount}`;
  }, [zoneId, isInitialized, calendarDate, allotments, yearlyAllotments, requests]);

  const handleDayPress = async (day: DateData) => {
    const now = new Date();
    const dateObj = parseISO(day.dateString);
    const sixMonthsFromNow = addMonths(now, 6);

    // Check if the date is beyond the standard six-month window
    // But we need to handle month-end cases specially
    const isEndOfMonth = isLastDayOfMonth(now);

    // IMPORTANT: Use exact same logic as in markedDates to determine if a date is a six-month request
    const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();
    const isSixMonthRequest =
      isSixMonthDate ||
      (isEndOfMonth &&
        dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
        dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
        dateObj.getDate() >= sixMonthsFromNow.getDate());

    // If it's beyond six months and not a special month-end case or exact six-month date, reject
    if (isAfter(dateObj, sixMonthsFromNow) && !isSixMonthRequest) {
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

    // New validation to check if the date still fits within the target month
    if (
      isEndOfMonth &&
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear()
    ) {
      // Get the last day of the target month
      const lastDayOfMonth = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

      if (dateObj.getDate() > lastDayOfMonth) {
        Toast.show({
          type: "info",
          text1: "Not Available",
          text2: "This date doesn't exist in the target month",
          position: "bottom",
          visibilityTime: 3000,
          topOffset: 50,
        });
        return;
      }
    }

    // Note: The rest of the six-month request handling is now managed by the calendarStore,
    // so we don't need to maintain our own local state for sixMonthRequestDays

    if (isDateSelectable(day.dateString)) {
      setSelectedDate(day.dateString);
      onDayActuallyPressed?.(day.dateString);
    } else {
      // Get the availability to customize the message
      const availability = getDateAvailability(day.dateString);

      // Customize message based on the availability
      Toast.show({
        type: "info",
        text1: "Not Available",
        text2:
          availability === "full"
            ? "This date is full but you can still request to be on the waitlist"
            : "This date is not available for requests",
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
        key={calendarDataKey}
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
