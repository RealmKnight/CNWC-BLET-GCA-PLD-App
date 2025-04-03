import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { Calendar } from "@/components/Calendar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { setupCalendarSubscriptions } from "@/store/calendarStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns-tz";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useFocusEffect } from "@react-navigation/native";

type ColorScheme = keyof typeof Colors;

interface RequestWithMember extends DayRequest {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    pin_number: string;
  };
}

interface RequestDialogProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (leaveType: "PLD" | "SDV") => void;
  selectedDate: string;
  allotments: {
    max: number;
    current: number;
  };
  requests: RequestWithMember[];
}

function RequestDialog({ isVisible, onClose, onSubmit, selectedDate, allotments, requests }: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const isFull = allotments.current >= allotments.max;
  const [remainingDays, setRemainingDays] = useState<{ PLD: number; SDV: number }>({ PLD: 0, SDV: 0 });
  const [availableDays, setAvailableDays] = useState<{ PLD: number; SDV: number }>({ PLD: 0, SDV: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { member } = useUserStore();

  useEffect(() => {
    async function fetchRemainingDays() {
      if (!member?.id) {
        setError("Member information not found");
        return;
      }

      setIsLoading(true);
      setError(null);
      const year = new Date(selectedDate).getFullYear();

      try {
        console.log("[RequestDialog] Fetching remaining days for member:", member.id, "year:", year);
        const [pldResult, sdvResult] = await Promise.all([
          supabase.rpc("get_member_remaining_days", {
            p_member_id: member.id,
            p_year: year,
            p_leave_type: "PLD",
          }),
          supabase.rpc("get_member_remaining_days", {
            p_member_id: member.id,
            p_year: year,
            p_leave_type: "SDV",
          }),
        ]);

        if (pldResult.error) throw pldResult.error;
        if (sdvResult.error) throw sdvResult.error;

        console.log("[RequestDialog] Remaining days:", { PLD: pldResult.data, SDV: sdvResult.data });

        // Get all pending and waitlisted requests for the year
        const { data: pendingRequests, error: pendingError } = await supabase
          .from("pld_sdv_requests")
          .select("leave_type")
          .eq("member_id", member.id)
          .eq("status", "pending")
          .or("status.eq.waitlisted")
          .gte("request_date", `${year}-01-01`)
          .lte("request_date", `${year}-12-31`);

        if (pendingError) throw pendingError;

        // Count pending requests by type
        const pendingCounts = {
          PLD: pendingRequests?.filter((r) => r.leave_type === "PLD").length || 0,
          SDV: pendingRequests?.filter((r) => r.leave_type === "SDV").length || 0,
        };

        console.log("[RequestDialog] Pending/waitlisted requests:", pendingCounts);

        // Set both remaining and available days
        const remaining = {
          PLD: pldResult.data || 0,
          SDV: sdvResult.data || 0,
        };
        setRemainingDays(remaining);

        // Calculate available days by subtracting pending/waitlisted requests
        setAvailableDays({
          PLD: Math.max(0, remaining.PLD - pendingCounts.PLD),
          SDV: Math.max(0, remaining.SDV - pendingCounts.SDV),
        });
      } catch (error) {
        console.error("[RequestDialog] Error fetching remaining days:", error);
        setError("Failed to fetch remaining days");
      } finally {
        setIsLoading(false);
      }
    }

    if (isVisible) {
      fetchRemainingDays();
    }
  }, [isVisible, member?.id, selectedDate]);

  // Check if user already has a request for this date
  const hasExistingRequest = requests.some(
    (req) => req.member?.id === member?.id && !["denied", "cancelled"].includes(req.status)
  );

  const renderRequestList = () => {
    // Filter out cancelled and denied requests
    const activeRequests = requests.filter((req) => !["cancelled", "denied"].includes(req.status));
    const spots = Array.from({ length: allotments.max }, (_, i) => i + 1);
    return spots.map((spot) => {
      const request = activeRequests[spot - 1];
      return (
        <ThemedView key={spot} style={styles.requestSpot}>
          <ThemedText style={styles.spotNumber}>{spot}.</ThemedText>
          {request ? (
            <ThemedView style={styles.spotInfo}>
              <ThemedText>
                {request.member.first_name} {request.member.last_name} ({request.member.pin_number})
              </ThemedText>
              <ThemedText
                style={[
                  styles.requestStatus,
                  {
                    color:
                      request.status === "approved"
                        ? Colors[theme].success
                        : request.status === "denied"
                        ? Colors[theme].error
                        : Colors[theme].warning,
                  },
                ]}
              >
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedText style={styles.emptySpot}>Available</ThemedText>
          )}
        </ThemedView>
      );
    });
  };

  const handleSubmit = async (leaveType: "PLD" | "SDV") => {
    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(leaveType);
      // Wait for a brief moment to allow realtime subscription to process
      await new Promise((resolve) => setTimeout(resolve, 500));
      onClose();
    } catch (error) {
      console.error("[RequestDialog] Error submitting request:", error);
      setError("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <ThemedText type="title" style={styles.modalTitle}>
            Request for {selectedDate}
          </ThemedText>

          <ThemedText style={styles.allotmentInfo}>
            {allotments.current}/{allotments.max} spots filled
          </ThemedText>

          {error ? (
            <ThemedView style={styles.warningContainer}>
              <ThemedText style={styles.warningText}>{error}</ThemedText>
            </ThemedView>
          ) : hasExistingRequest ? (
            <ThemedView style={styles.warningContainer}>
              <ThemedText style={styles.warningText}>You already have a request for this date</ThemedText>
            </ThemedView>
          ) : isLoading ? (
            <ThemedView style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors[theme].tint} />
              <ThemedText style={styles.loadingText}>Checking available days...</ThemedText>
            </ThemedView>
          ) : (
            <>
              <ThemedView style={styles.remainingDaysInfo}>
                <ThemedText style={styles.availableDaysNote}>Available to Request:</ThemedText>
                <ThemedText>
                  PLD: {availableDays.PLD} SDV: {availableDays.SDV}
                </ThemedText>
              </ThemedView>

              {!isFull ? (
                <ThemedView style={styles.requestButtons}>
                  <TouchableOpacity
                    style={[
                      styles.requestButton,
                      { backgroundColor: Colors[theme].tint },
                      availableDays.PLD <= 0 && styles.disabledButton,
                    ]}
                    onPress={() => handleSubmit("PLD")}
                    activeOpacity={0.7}
                    disabled={availableDays.PLD <= 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={Colors[theme].background} />
                    ) : (
                      <ThemedText style={styles.requestButtonText}>
                        Request PLD {availableDays.PLD <= 0 ? "(None Left)" : ""}
                      </ThemedText>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.requestButton,
                      { backgroundColor: Colors[theme].tint },
                      availableDays.SDV <= 0 && styles.disabledButton,
                    ]}
                    onPress={() => handleSubmit("SDV")}
                    activeOpacity={0.7}
                    disabled={availableDays.SDV <= 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={Colors[theme].background} />
                    ) : (
                      <ThemedText style={styles.requestButtonText}>
                        Request SDV {availableDays.SDV <= 0 ? "(None Left)" : ""}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </ThemedView>
              ) : (
                <TouchableOpacity
                  style={[styles.requestButton, styles.waitlistButton]}
                  onPress={() => handleSubmit("PLD")}
                  activeOpacity={0.7}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={Colors[theme].background} />
                  ) : (
                    <ThemedText style={styles.requestButtonText}>Request Waitlist Spot</ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}

          <ScrollView style={styles.requestList}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Current Requests:
            </ThemedText>
            {renderRequestList()}
          </ScrollView>

          <TouchableOpacity
            style={[styles.modalButton, styles.cancelButton]}
            onPress={onClose}
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <ThemedText style={styles.modalButtonText}>Close</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { user } = useAuth();
  const {
    selectedDate,
    requests,
    submitRequest,
    setSelectedDate,
    allotments,
    yearlyAllotments,
    error,
    setError,
    loadInitialData,
    isInitialized,
  } = useCalendarStore();
  const [isRequestDialogVisible, setIsRequestDialogVisible] = useState(false);
  const [dataChanged, setDataChanged] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const REFRESH_COOLDOWN = 500; // milliseconds

  // Force the date to be the actual current date, not system date
  const [currentDate, setCurrentDate] = useState("");
  // Add a key to force re-render
  const [calendarKey, setCalendarKey] = useState(0);

  // Handle visibility change for web browsers
  useEffect(() => {
    if (Platform.OS !== "web") return;

    // Track when the component mounted
    const mountTime = Date.now();
    console.log("[CalendarScreen] Component mounted at:", mountTime);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        console.log("[CalendarScreen] Page became visible, checking data");
        const now = Date.now();
        const timeSinceMount = now - mountTime;
        const timeSinceLastRefresh = now - lastRefreshTime;

        // Skip refresh if we just mounted or refreshed recently
        if (timeSinceMount < REFRESH_COOLDOWN) {
          console.log("[CalendarScreen] Skipping refresh - component just mounted");
          return;
        }

        if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
          console.log("[CalendarScreen] Skipping refresh - within cooldown period");
          return;
        }

        console.log("[CalendarScreen] Refreshing data after visibility change");
        // Force calendar to re-render with current date
        const today = format(new Date(), "yyyy-MM-dd");
        setCurrentDate(today);
        setCalendarKey((prev) => prev + 1);
        // Load fresh data
        const dateRange = {
          start: format(new Date(), "yyyy-MM-dd"),
          end: format(
            new Date(new Date().getFullYear(), new Date().getMonth() + 6, new Date().getDate()),
            "yyyy-MM-dd"
          ),
        };
        loadInitialData(dateRange.start, dateRange.end);
        setLastRefreshTime(now);
        // Clear selected date when returning to visible
        setSelectedDate(null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadInitialData, lastRefreshTime, REFRESH_COOLDOWN, setSelectedDate]);

  // Initialize data once when component mounts
  useEffect(() => {
    const now = new Date();
    const dateRange = {
      start: format(now, "yyyy-MM-dd"),
      end: format(new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()), "yyyy-MM-dd"),
    };
    console.log("[CalendarScreen] Initial mount, loading data");
    loadInitialData(dateRange.start, dateRange.end);
    setCurrentDate(dateRange.start);
    setLastRefreshTime(Date.now());
  }, []); // Only run on mount

  // Handle focus events - only update visual state
  useFocusEffect(
    React.useCallback(() => {
      console.log("[CalendarScreen] Screen focused, checking if refresh needed");
      const now = Date.now();

      // Only refresh if we're outside cooldown period
      if (now - lastRefreshTime > REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, refreshing data");
        setCalendarKey((prev) => prev + 1);
        setLastRefreshTime(now);
      } else {
        console.log("[CalendarScreen] No refresh needed or within cooldown period");
      }

      return () => {
        setSelectedDate(null);
      };
    }, [lastRefreshTime])
  );

  // Set up realtime subscriptions and cleanup
  useEffect(() => {
    const subscription = setupCalendarSubscriptions();

    // Add listener for realtime updates with debounce
    let debounceTimeout: NodeJS.Timeout;

    const unsubscribe = useCalendarStore.subscribe((state, prevState) => {
      // Check if relevant data has changed
      if (
        JSON.stringify(state.requests) !== JSON.stringify(prevState.requests) ||
        JSON.stringify(state.allotments) !== JSON.stringify(prevState.allotments)
      ) {
        // Clear any existing timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        // Set a new timeout
        debounceTimeout = setTimeout(() => {
          console.log("[CalendarScreen] Data changed in store, marking for refresh");
          setDataChanged(true);
        }, 100); // Small delay to batch rapid updates
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      setSelectedDate(null);
    };
  }, []);

  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (selectedDate) {
      try {
        await submitRequest(selectedDate, leaveType);
        setIsRequestDialogVisible(false);
        // Removed setCalendarKey update since realtime will handle the refresh
        // Show success message using Alert
        if (Platform.OS === "web") {
          alert("Request submitted successfully");
        } else {
          Alert.alert("Success", "Request submitted successfully");
        }
      } catch (error) {
        // Show error message using Alert
        if (Platform.OS === "web") {
          alert(error instanceof Error ? error.message : "Failed to submit request");
        } else {
          Alert.alert("Error", error instanceof Error ? error.message : "Failed to submit request");
        }
      }
    }
  };

  const handleTodayPress = async () => {
    try {
      const { data, error } = await supabase.rpc("get_server_timestamp");
      if (error) throw error;

      const serverDate = new Date(data);
      const today = format(serverDate, "yyyy-MM-dd", { timeZone: "UTC" });
      console.log("[CalendarScreen] Today button pressed, setting date to:", today);
      // Clear the selection since today cannot be requested
      setSelectedDate(null);
      console.log("[CalendarScreen] Cleared selected date");
      // Update the current date and force calendar to re-render
      setCurrentDate(today);
      setCalendarKey((prev) => prev + 1);
    } catch (error) {
      console.error("[CalendarScreen] Error getting server time for Today button:", error);
      // Fallback to local time if server time fails
      const now = new Date();
      const today = format(now, "yyyy-MM-dd", { timeZone: "UTC" });
      setSelectedDate(null);
      setCurrentDate(today);
      setCalendarKey((prev) => prev + 1);
    }
  };

  const selectedDateRequests = selectedDate
    ? (requests[selectedDate] || []).filter((req) => !["cancelled", "denied"].includes(req.status))
    : [];
  const maxAllotment = selectedDate
    ? allotments[selectedDate] ?? yearlyAllotments[new Date(selectedDate).getFullYear()] ?? 6
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ThemedView style={styles.header}>
        <IconSymbol size={24} color={Colors[theme].text} name="calendar" style={styles.headerIcon} />
        <ThemedText type="title">PLD/SDV Calendar</ThemedText>
        <TouchableOpacity
          style={[styles.todayButton, { backgroundColor: Colors[theme].tint }]}
          onPress={handleTodayPress}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.todayButtonText}>Today</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <Calendar key={`calendar-${currentDate}-${calendarKey}`} current={currentDate} />

      {selectedDate && (
        <ThemedView style={styles.selectedDateInfo}>
          <ThemedText type="subtitle">Selected Date: {selectedDate}</ThemedText>
          <ThemedText>
            {selectedDateRequests.length}/{maxAllotment} spots filled
          </ThemedText>

          <TouchableOpacity
            style={[styles.requestButton, { backgroundColor: Colors[theme].tint }]}
            onPress={() => setIsRequestDialogVisible(true)}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.requestButtonText}>
              {selectedDateRequests.length >= maxAllotment ? "Request Waitlist Spot" : "Request Day Off"}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      <RequestDialog
        isVisible={isRequestDialogVisible}
        onClose={() => {
          setIsRequestDialogVisible(false);
          setError(null); // Clear any errors when closing the dialog
        }}
        onSubmit={handleRequestSubmit}
        selectedDate={selectedDate || ""}
        allotments={{
          max: maxAllotment,
          current: selectedDateRequests.length,
        }}
        requests={selectedDateRequests as unknown as RequestWithMember[]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  } as ViewStyle,
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 16,
    paddingBottom: 8,
  } as ViewStyle,
  headerIcon: {
    marginRight: 0,
  } as ViewStyle,
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 16,
  } as ViewStyle,
  todayButtonText: {
    color: "black",
    fontWeight: "600",
    fontSize: 14,
  } as TextStyle,
  selectedDateInfo: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
    marginTop: 10,
    alignItems: "center",
  } as ViewStyle,
  requestButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    marginTop: 16,
  } as ViewStyle,
  requestButtonText: {
    color: "white",
    fontWeight: "600",
  } as TextStyle,
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
  } as ViewStyle,
  modalContent: {
    backgroundColor: Colors.dark.background,
    padding: 20,
    borderRadius: 10,
    width: "90%",
    maxWidth: 500,
    maxHeight: Platform.OS === "web" ? "90%" : "90%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  } as ViewStyle,
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  } as TextStyle,
  modalMessage: {
    marginBottom: 20,
    textAlign: "center",
  } as TextStyle,
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  } as ViewStyle,
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  } as ViewStyle,
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  } as ViewStyle,
  confirmButton: {
    backgroundColor: Colors.dark.tint,
  } as ViewStyle,
  modalButtonText: {
    fontWeight: "600",
  } as TextStyle,
  requestSpot: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  } as ViewStyle,
  spotNumber: {
    marginRight: 8,
    fontWeight: "bold",
  } as TextStyle,
  spotInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  } as ViewStyle,
  emptySpot: {
    color: Colors.light.success,
    fontStyle: "italic",
  } as TextStyle,
  requestList: {
    width: "100%",
    maxHeight: Platform.OS === "web" ? "50%" : 300,
    marginVertical: 16,
  } as ViewStyle,
  sectionTitle: {
    marginBottom: 10,
  } as TextStyle,
  requestStatus: {
    marginLeft: 8,
    fontWeight: "500",
  } as TextStyle,
  allotmentInfo: {
    marginBottom: 16,
  } as TextStyle,
  requestButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 16,
    gap: 16,
  } as ViewStyle,
  waitlistButton: {
    backgroundColor: "#FFC107",
  } as ViewStyle,
  remainingDaysInfo: {
    marginBottom: 16,
    alignItems: "center",
  } as ViewStyle,
  disabledButton: {
    backgroundColor: "rgba(128, 128, 128, 0.5)",
  } as ViewStyle,
  warningContainer: {
    marginBottom: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.light.error,
    borderRadius: 8,
    backgroundColor: Colors.light.error + "20",
  } as ViewStyle,
  warningText: {
    color: Colors.light.error,
    fontWeight: "600",
  } as TextStyle,
  loadingContainer: {
    padding: 20,
    alignItems: "center",
  } as ViewStyle,
  loadingText: {
    marginTop: 12,
  } as TextStyle,
  availableDaysNote: {
    marginTop: 12,
    fontWeight: "600",
    fontSize: 14,
  } as TextStyle,
});
