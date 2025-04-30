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

// Add a global variable outside the component to track prefetch status
// This ensures it persists across re-renders
let GLOBAL_MONTH_END_PREFETCH_DONE = false;
let GLOBAL_PREFETCH_TIMESTAMP = 0;

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
    checkSixMonthRequest,
  } = useCalendarStore();

  // Store days with six month requests to avoid excessive DB lookups
  const [sixMonthRequestDays, setSixMonthRequestDays] = useState<Record<string, boolean>>({});

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
        if (hasSixMonthRequest) {
          console.log(`[Calendar] Found and caching six-month request for ${dateStr}`);
          setSixMonthRequestDays((prev) => ({
            ...prev,
            [dateStr]: true,
          }));
        }

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

    // Get the six-month date and check if today is the end of month
    const now = new Date();
    const nowTimestamp = now.getTime();

    // If we've performed a prefetch in the last 15 minutes, skip it
    if (GLOBAL_MONTH_END_PREFETCH_DONE && nowTimestamp - GLOBAL_PREFETCH_TIMESTAMP < 15 * 60 * 1000) {
      // console.log("[Calendar] Skipping prefetch - already done recently");
      return;
    }

    const isEndOfMonth = isLastDayOfMonth(now);
    const sixMonthDate = addMonths(now, 6);
    const sixMonthDateStr = format(sixMonthDate, "yyyy-MM-dd");

    const fetchSixMonthData = async () => {
      try {
        // Always check the exact six-month date
        const hasRequest = await checkSixMonthRequest(sixMonthDateStr);
        if (hasRequest) {
          setSixMonthRequestDays((prev) => ({
            ...prev,
            [sixMonthDateStr]: true,
          }));
        }

        // CRITICAL FIX: For end-of-month cases, we MUST prefetch ALL days
        // that might be six-month request days
        if (isEndOfMonth) {
          console.log("[Calendar] End of month detected, prefetching ALL eligible six-month target month days");

          // Mark as done so we don't keep prefetching and record timestamp
          GLOBAL_MONTH_END_PREFETCH_DONE = true;
          GLOBAL_PREFETCH_TIMESTAMP = nowTimestamp;

          // Get all days from the six-month date to the end of that month
          const targetYear = sixMonthDate.getFullYear();
          const targetMonth = sixMonthDate.getMonth();

          // Get the last day of the target month
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

          // Start from the day of the exact six-month date (inclusive)
          const startDay = sixMonthDate.getDate();

          console.log(`[Calendar] Prefetching end-of-month six-month days:`, {
            targetYear,
            targetMonth: targetMonth + 1, // +1 for human-readable month
            startDay,
            lastDayOfTargetMonth,
            daysToCheck: lastDayOfTargetMonth - startDay + 1,
          });

          // In month-end case, check ALL days from the six-month date to the end of the month
          // This is critical for correctly handling Oct 31 and similar dates
          for (let day = startDay; day <= lastDayOfTargetMonth; day++) {
            const dateToCheck = new Date(targetYear, targetMonth, day);
            const dateToCheckStr = format(dateToCheck, "yyyy-MM-dd");

            // Skip checking if we've already checked this date
            if (sixMonthRequestDays[dateToCheckStr] !== undefined) continue;

            const hasRequestForDay = await checkSixMonthRequest(dateToCheckStr);
            if (hasRequestForDay) {
              setSixMonthRequestDays((prev) => ({
                ...prev,
                [dateToCheckStr]: true,
              }));

              // Log when we find a request to help with debugging
              console.log(`[Calendar] Found existing six-month request for ${dateToCheckStr}`);
            }
          }
        }
      } catch (error) {
        console.error("[Calendar] Error prefetching six-month request data:", error);
      }
    };

    fetchSixMonthData();

    // No need for cleanup - the global flag with timestamp handles this now
  }, [isInitialized, member?.id, checkSixMonthRequest]);

  // NEW: Add an effect to fetch ALL six-month requests for the user on component mount
  useEffect(() => {
    if (!isInitialized || !member?.id) return;

    const fetchAllSixMonthRequests = async () => {
      try {
        console.log("[Calendar] Fetching all six-month requests for current user");
        const now = startOfDay(new Date());
        const isEndOfMonth = isLastDayOfMonth(now);
        const sixMonthDate = addMonths(now, 6);

        // Fetch from supabase directly
        const { data, error } = await supabase
          .from("six_month_requests")
          .select("id, request_date, leave_type")
          .eq("member_id", member.id)
          .eq("processed", false)
          .gte("request_date", format(now, "yyyy-MM-dd"))
          .lte("request_date", format(addMonths(now, 7), "yyyy-MM-dd")); // Add extra month to be safe

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          console.log(`[Calendar] Found ${data.length} six-month requests:`, data);

          // Add all found requests to the sixMonthRequestDays state
          const newSixMonthDays = { ...sixMonthRequestDays };
          data.forEach((req) => {
            newSixMonthDays[req.request_date] = true;
          });

          setSixMonthRequestDays(newSixMonthDays);

          // Force a refresh of markedDates
          markedDatesGeneratedRef.current = false;
        } else {
          console.log("[Calendar] No existing six-month requests found");
        }

        // If it's end of month, ensure we check all relevant dates in the target month
        if (isEndOfMonth) {
          console.log("[Calendar] End of month detected, ensuring all potential six-month days are checked");

          // Get the last day of the target month
          const targetMonth = sixMonthDate.getMonth();
          const targetYear = sixMonthDate.getFullYear();
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

          console.log(`[Calendar] Target month: ${targetMonth + 1}/${targetYear}, last day: ${lastDayOfTargetMonth}`);

          // Start from the six-month day
          const startDay = sixMonthDate.getDate();

          // Force an explicit prefetch of all days in the target month from the six-month date
          for (let day = startDay; day <= lastDayOfTargetMonth; day++) {
            const dateToCheck = new Date(targetYear, targetMonth, day);
            // Skip invalid dates
            if (dateToCheck.getMonth() !== targetMonth) continue;

            const dateStr = format(dateToCheck, "yyyy-MM-dd");

            // Skip if we already know about this date
            if (sixMonthRequestDays[dateStr] === true) continue;

            // Check for six-month request for this date
            const hasRequest = await checkSixMonthRequest(dateStr);
            if (hasRequest) {
              console.log(`[Calendar] Found six-month request for ${dateStr} during end-of-month prefetch`);
              setSixMonthRequestDays((prev) => ({
                ...prev,
                [dateStr]: true,
              }));
            }
          }
        }
      } catch (error) {
        console.error("[Calendar] Error fetching all six-month requests:", error);
      }
    };

    fetchAllSixMonthRequests();
  }, [isInitialized, member?.id, checkSixMonthRequest]);

  // Set up real-time subscription for six-month requests
  useEffect(() => {
    if (!isInitialized || !member?.id) return;

    console.log("[Calendar] Setting up real-time subscription for six-month requests");
    const sixMonthChannel = supabase
      .channel("six-month-requests")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to all events (INSERT, UPDATE, DELETE)
          schema: "public",
          table: "six_month_requests",
          filter: `member_id=eq.${member.id}`,
        },
        (payload) => {
          console.log("[Calendar] Six-month request update:", payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === "INSERT" && newRecord && newRecord.request_date) {
            console.log(`[Calendar] New six-month request for ${newRecord.request_date}`);
            setSixMonthRequestDays((prev) => ({
              ...prev,
              [newRecord.request_date]: true,
            }));

            // Force markedDates recalculation
            markedDatesGeneratedRef.current = false;
          } else if (eventType === "DELETE" && oldRecord && oldRecord.request_date) {
            console.log(`[Calendar] Removed six-month request for ${oldRecord.request_date}`);
            setSixMonthRequestDays((prev) => {
              const newState = { ...prev };
              delete newState[oldRecord.request_date];
              return newState;
            });

            // Force markedDates recalculation
            markedDatesGeneratedRef.current = false;
          }
        }
      )
      .subscribe((status) => {
        console.log("[Calendar] Six-month subscription status:", status);
      });

    return () => {
      console.log("[Calendar] Cleaning up six-month subscription");
      sixMonthChannel.unsubscribe();
    };
  }, [isInitialized, member?.id]);

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
      selectedDate,
    });

    // Always regenerate for consistency
    markedDatesGeneratedRef.current = true;

    const dates: any = {};
    const now = startOfDay(new Date());

    // CRITICAL FIX: Calculate the current six-month reference date directly here
    const sixMonthsFromNow = addMonths(now, 6);
    const isEndOfMonth = isLastDayOfMonth(now);

    // Log these critical values for debugging
    console.log("[Calendar] Six-month date calculation:", {
      today: format(now, "yyyy-MM-dd"),
      isEndOfMonth,
      sixMonthDate: format(sixMonthsFromNow, "yyyy-MM-dd"),
      sixMonthMonth: sixMonthsFromNow.getMonth() + 1,
      sixMonthYear: sixMonthsFromNow.getFullYear(),
      sixMonthDay: sixMonthsFromNow.getDate(),
    });

    // Get all dates in the visible range (including past month for context)
    const visibleRangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // CRITICAL FIX: Extend the visible range to ensure we include the entire six-month window
    // plus several extra days to account for edge cases at month boundaries
    const visibleRangeEnd = new Date(sixMonthsFromNow.getFullYear(), sixMonthsFromNow.getMonth() + 1, 0);

    console.log("[Calendar] Visible range:", {
      start: format(visibleRangeStart, "yyyy-MM-dd"),
      end: format(visibleRangeEnd, "yyyy-MM-dd"),
      includesLastDayOfTargetMonth: true,
    });

    const allDates = eachDayOfInterval({
      start: visibleRangeStart,
      end: visibleRangeEnd,
    });

    // Add marks for all dates in range
    allDates.forEach((date) => {
      const dateStr = format(date, "yyyy-MM-dd");

      // Check if the user has a regular request for this date
      const userHasRegularRequest = hasUserRequestForDate(dateStr);

      // Check if the user has a six-month request for this date
      const userHasSixMonthRequest = sixMonthRequestDays[dateStr] === true;

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

      // User has any request (regular or six-month)
      const userHasAnyRequest = userHasRegularRequest || userHasSixMonthRequest;

      // Determine availability
      let availability;

      if (userHasAnyRequest) {
        // If user has any request, mark as userRequested
        availability = "userRequested";
      } else if (isSixMonthRequest) {
        // If it's a six-month request date, always mark as available regardless of allotment
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
    // Include these as dependencies to ensure recalculation
    requests,
    allotments,
    yearlyAllotments,
    sixMonthRequestDays, // Include the actual state object, not just its length
    getDateAvailability,
    hasUserRequestForDate,
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

  // Log when marked dates are regenerated, but throttle it to avoid spamming
  useEffect(() => {
    if (Object.keys(markedDates).length > 0) {
      console.log("[Calendar] Marked dates updated:", {
        hasMarks: Object.keys(markedDates).length,
        zoneId,
        isInitialized,
      });
    }
  }, [markedDates, zoneId, isInitialized]);

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
    const fortyEightHoursFromNow = addDays(now, 2);
    const sixMonthsFromNow = addMonths(now, 6);

    // Basic time constraint checks
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

    // IMPORTANT: For six-month requests, always check if the user already has a request
    // This ensures the calendar is always updated with the latest request status
    if (isSixMonthRequest && member?.id) {
      console.log(`[Calendar] Checking for existing six-month request for ${day.dateString}`);
      try {
        const hasSixMonthRequest = await checkSixMonthRequest(day.dateString);
        if (hasSixMonthRequest) {
          console.log(`[Calendar] Found existing six-month request for ${day.dateString}, updating local state`);
          setSixMonthRequestDays((prev) => ({
            ...prev,
            [day.dateString]: true,
          }));

          // Force a re-render of the calendar to show the updated request status
          markedDatesGeneratedRef.current = false;
        }
      } catch (error) {
        console.error(`[Calendar] Error checking for six-month request for ${day.dateString}:`, error);
      }
    }

    // We don't need to check zone access here since we've already validated it during zone ID calculation
    // and the calendar only shows the correct zone's data if the user has access

    if (isDateSelectable(day.dateString)) {
      setSelectedDate(day.dateString);
      onDayActuallyPressed?.(day.dateString);

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
