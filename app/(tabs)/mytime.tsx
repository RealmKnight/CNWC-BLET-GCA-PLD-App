import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  Alert,
  Modal,
  Animated,
  ActivityIndicator,
  Platform,
  AppState,
} from "react-native";
import { useColorScheme } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import { Feather } from "@expo/vector-icons";
import { useMyTime, UserVacationRequest, DatabaseError } from "@/hooks/useMyTime";
import { format } from "date-fns-tz";
import { parseISO, isWithinInterval, isBefore, addDays, subWeeks, addWeeks } from "date-fns";
import { useFocusEffect } from "@react-navigation/native";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";
import Toast from "react-native-toast-message";
import { Database } from "@/types/supabase";
import { ClientOnlyComponent, DefaultLoadingFallback } from "@/components/ClientOnlyComponent";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { PaidInLieuModal } from "@/components/modals/PaidInLieuModal";

interface LeaveRowProps {
  label: string;
  pldValue: number;
  sdvValue?: number;
  showIcon?: boolean;
  onIconPress?: () => void;
}

// Add new component for vacation summary display
interface VacationSummaryRowProps {
  label: string;
  value: number;
  highlight?: boolean;
}

function VacationSummaryRow({ label, value, highlight = false }: VacationSummaryRowProps) {
  const colorScheme = useColorScheme();

  // Add a fallback value of 0 if value is undefined or null
  const displayValue = value !== undefined && value !== null ? value : 0;

  return (
    <ThemedView style={styles.row}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <ThemedView style={styles.vacationValueContainer}>
        <ThemedText
          style={[
            styles.vacationValue,
            highlight && { color: Colors[colorScheme ?? "light"].primary, fontWeight: "bold" },
          ]}
        >
          {displayValue}
        </ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

function LeaveRow({ label, pldValue, sdvValue = undefined, showIcon, onIconPress }: LeaveRowProps) {
  const colorScheme = useColorScheme();

  const handleIconPress = () => {
    if (onIconPress) {
      onIconPress();
    } else {
      Alert.alert("Feature Not Available", "The ability to request paid in lieu is not available at this time.");
    }
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <ThemedView style={styles.valueContainer}>
        <ThemedText style={styles.value}>{pldValue}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.valueContainer}>
        <ThemedText style={styles.value}>{sdvValue !== undefined ? sdvValue : "-"}</ThemedText>
      </ThemedView>
      {showIcon && (
        <ThemedTouchableOpacity style={styles.iconContainer} onPress={handleIconPress}>
          <Feather
            name="dollar-sign"
            size={24}
            color={Colors[colorScheme ?? "light"].primary}
            style={{ fontWeight: "bold" }}
          />
        </ThemedTouchableOpacity>
      )}
    </ThemedView>
  );
}

// Interface for PLD/SDV/6mo requests (used by RequestRow)
interface TimeOffRequest {
  id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
  requested_at: string;
  waitlist_position?: number;
  paid_in_lieu?: boolean;
  is_six_month_request?: boolean;
  calendar_id?: string;
}

interface RequestRowProps {
  request: TimeOffRequest;
  onCancel: (request: TimeOffRequest) => void;
  onCancelSixMonth: (request: TimeOffRequest) => void;
}

function RequestRow({ request, onCancel, onCancelSixMonth }: RequestRowProps) {
  const colorScheme = useColorScheme();
  const positionAnim = useRef(new Animated.Value(1)).current;
  const prevPosition = useRef(request.waitlist_position);

  // Add check for 48-hour window
  const isWithin48Hours = useMemo(() => {
    const now = new Date();
    const requestDate = parseISO(request.request_date);
    const fortyEightHoursFromNow = addDays(now, 2);
    return isBefore(requestDate, fortyEightHoursFromNow);
  }, [request.request_date]);

  useEffect(() => {
    if (request.waitlist_position !== prevPosition.current) {
      positionAnim.setValue(0);
      Animated.spring(positionAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
      prevPosition.current = request.waitlist_position;
    }
  }, [request.waitlist_position, positionAnim]);

  const getStatusColor = () => {
    switch (request.status) {
      case "approved":
        return Colors[colorScheme ?? "light"].success;
      case "pending":
        return Colors[colorScheme ?? "light"].warning;
      case "waitlisted":
        return Colors[colorScheme ?? "light"].warning;
      case "cancellation_pending":
        return Colors[colorScheme ?? "light"].error;
      default:
        return Colors[colorScheme ?? "light"].textDim;
    }
  };

  const getStatusText = () => {
    if (request.is_six_month_request) {
      return "6-Month Request (Pending)";
    }
    switch (request.status) {
      case "approved":
        return request.paid_in_lieu ? "Payment Approved" : "Approved";
      case "pending":
        return request.paid_in_lieu ? "Payment Pending" : "Pending";
      case "waitlisted":
        return "Waitlisted";
      case "cancellation_pending":
        return "Cancellation Pending";
      default:
        return request.status.charAt(0).toUpperCase() + request.status.slice(1);
    }
  };

  return (
    <ThemedView
      style={[
        styles.row,
        request.status === "cancellation_pending" && styles.cancellationPendingRow,
        request.is_six_month_request && styles.sixMonthRequestRow,
      ]}
    >
      <ThemedView style={styles.dateContainer}>
        <ThemedText style={styles.date}>{format(parseISO(request.request_date), "MMM d, yyyy")}</ThemedText>
        <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>{getStatusText()}</ThemedText>
        {request.waitlist_position && (
          <Animated.Text style={[styles.waitlistPosition, { transform: [{ scale: positionAnim }] }]}>
            #{request.waitlist_position}
          </Animated.Text>
        )}
      </ThemedView>
      <ThemedView style={styles.typeContainer}>
        <ThemedText style={styles.type}>{request.leave_type}</ThemedText>
      </ThemedView>
      {(request.status === "pending" ||
        request.status === "approved" ||
        request.status === "waitlisted" ||
        request.is_six_month_request) &&
        parseISO(request.request_date) > new Date() &&
        !isWithin48Hours && (
          <ThemedTouchableOpacity
            style={styles.cancelButton}
            onPress={() => (request.is_six_month_request ? onCancelSixMonth(request) : onCancel(request))}
          >
            <Feather name="x-circle" size={24} color={Colors[colorScheme ?? "light"].error} />
          </ThemedTouchableOpacity>
        )}
      {isWithin48Hours &&
        (request.status === "pending" || request.status === "approved") &&
        parseISO(request.request_date) > new Date() && (
          <ThemedView style={styles.infoContainer}>
            <ThemedText style={styles.infoText}>Cannot cancel within 48 hours</ThemedText>
          </ThemedView>
        )}
    </ThemedView>
  );
}

interface CancelRequestModalProps {
  isVisible: boolean;
  request: TimeOffRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function CancelRequestModal({ isVisible, request, onConfirm, onCancel, isLoading }: CancelRequestModalProps) {
  const colorScheme = useColorScheme();

  if (!request) return null;

  const isApproved = request.status === "approved";
  const isPaidInLieu = request.paid_in_lieu;

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCancel}>
      <ThemedView style={styles.modalContainer}>
        <ThemedView style={styles.modalContent}>
          <ThemedText style={styles.modalTitle}>
            Cancel {isApproved ? "Approved" : ""} {isPaidInLieu ? "Payment" : ""} Request
          </ThemedText>
          <ThemedText style={styles.modalDescription}>
            {isApproved
              ? `Are you sure you want to cancel your approved ${request.leave_type} ${
                  isPaidInLieu ? "payment" : ""
                } request for ${format(parseISO(request.request_date), "MMMM d, yyyy")}? This action cannot be undone.`
              : `Are you sure you want to cancel your ${request.leave_type} ${
                  isPaidInLieu ? "payment" : ""
                } request for ${format(parseISO(request.request_date), "MMMM d, yyyy")}?`}
          </ThemedText>
          <ThemedView style={styles.modalButtonsContainer}>
            <ThemedTouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isLoading}>
              <ThemedText style={styles.cancelButtonText}>No, Keep It</ThemedText>
            </ThemedTouchableOpacity>
            <ThemedTouchableOpacity
              style={[styles.confirmButton, { backgroundColor: Colors[colorScheme ?? "light"].error }]}
              onPress={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={Colors[colorScheme ?? "light"].background} />
              ) : (
                <ThemedText style={styles.confirmButtonText}>Yes, Cancel</ThemedText>
              )}
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

// Add a safe date comparison function
const safeCompareDate = (dateA: string, dateB: string, descending: boolean = false) => {
  // During SSR, just compare the strings
  if (typeof window === "undefined") {
    return descending ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  }

  // On client, use full date parsing
  const dateObjA = parseISO(dateA);
  const dateObjB = parseISO(dateB);

  return descending ? dateObjB.getTime() - dateObjA.getTime() : dateObjA.getTime() - dateObjB.getTime();
};

// Update the sortRequestsByDate function
function sortRequestsByDate(requests: TimeOffRequest[]): {
  future: TimeOffRequest[];
  past: TimeOffRequest[];
} {
  // Use a stable approach to determining "now" that works in both SSR and client
  const now = typeof window !== "undefined" ? new Date() : new Date("2099-01-01");
  const today = typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : "2099-01-01";

  const future: TimeOffRequest[] = [];
  const past: TimeOffRequest[] = [];

  requests.forEach((request) => {
    // During SSR, just compare the date strings directly
    if (typeof window === "undefined") {
      // For SSR, anything before today is past, rest is future
      if (request.request_date < today) {
        past.push(request);
      } else {
        future.push(request);
      }
      return;
    }

    // On client, use full date parsing
    const requestDate = parseISO(request.request_date);
    if (requestDate >= now) {
      future.push(request);
    } else {
      past.push(request);
    }
  });

  return { future, past };
}

// Update the sortVacationRequestsByDate function
function sortVacationRequestsByDate(requests: UserVacationRequest[]): {
  future: UserVacationRequest[];
  past: UserVacationRequest[];
} {
  // Ensure consistent date representation in SSR and client
  const now = typeof window !== "undefined" ? new Date() : new Date("2099-01-01");
  const today = typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : "2099-01-01";

  const future: UserVacationRequest[] = [];
  const past: UserVacationRequest[] = [];

  requests.forEach((request) => {
    // During SSR, just compare the date strings directly
    if (typeof window === "undefined") {
      // For SSR, anything before today is past, rest is future
      if (request.start_date < today) {
        past.push(request);
      } else {
        future.push(request);
      }
      return;
    }

    // On client, use full date parsing
    const requestStartDate = parseISO(request.start_date);
    if (requestStartDate >= now) {
      future.push(request);
    } else {
      past.push(request);
    }
  });

  return { future, past };
}

function RolloverWarningBanner({ unusedPlds }: { unusedPlds: number }) {
  const colorScheme = useColorScheme();
  const now = new Date();
  const q1End = new Date(now.getFullYear(), 2, 31); // March 31st

  // Only show warning in Q1 and if there are unused PLDs
  if (unusedPlds <= 0 || !isWithinInterval(now, { start: new Date(now.getFullYear(), 0, 1), end: q1End })) {
    return null;
  }

  return (
    <ThemedView
      style={[
        styles.warningBanner,
        {
          backgroundColor: Colors[colorScheme ?? "light"].warning + "20",
          borderColor: Colors[colorScheme ?? "light"].warning,
        },
      ]}
    >
      <Feather name="alert-triangle" size={24} color={Colors[colorScheme ?? "light"].warning} />
      <ThemedText style={styles.warningText}>
        You have {unusedPlds} unused rolled over PLD{unusedPlds > 1 ? "s" : ""} that must be used by March 31st or{" "}
        {unusedPlds > 1 ? "they" : "it"} will be automatically converted to paid in lieu.
      </ThemedText>
    </ThemedView>
  );
}

// New component for Vacation Requests
interface VacationRequestRowProps {
  request: UserVacationRequest;
}

function VacationRequestRow({ request }: VacationRequestRowProps) {
  const colorScheme = useColorScheme();

  const getVacationStatusColor = () => {
    // Status type is already correctly inferred from UserVacationRequest prop
    // No need to cast here if UserVacationRequest uses the DB type
    switch (request.status) {
      case "approved":
        return Colors[colorScheme ?? "light"].success;
      case "pending":
        return Colors[colorScheme ?? "light"].warning;
      case "cancelled":
      case "denied":
        return Colors[colorScheme ?? "light"].error;
      // If 'transferred' is a valid status in the DB enum, it's covered.
      // If it's NOT in the DB enum, handle it explicitly if needed,
      // otherwise, the default case handles unknown statuses.
      // Assuming 'transferred' might appear even if not strictly typed:
      case "transferred" as any: // Use 'as any' if 'transferred' isn't in the enum but might occur
        return Colors[colorScheme ?? "light"].textDim;
      default:
        // This block handles any status not explicitly listed above.
        // This includes statuses potentially defined in the DB enum but missed in the cases,
        // or unexpected values.
        console.warn(`[VacationRequestRow] Unexpected or unhandled status: ${request.status}`);
        return Colors[colorScheme ?? "light"].textDim;
    }
  };

  const getVacationStatusText = () => {
    // Ensure all DB statuses are handled if needed
    return request.status.charAt(0).toUpperCase() + request.status.slice(1);
  };

  return (
    <ThemedView style={styles.row}>
      <ThemedView style={styles.dateContainer}>
        <ThemedText style={styles.date}>
          Week of {format(parseISO(request.start_date), "MMM d, yyyy")} -{" "}
          {format(parseISO(request.end_date), "MMM d, yyyy")}
        </ThemedText>
        <ThemedText style={[styles.statusText, { color: getVacationStatusColor() }]}>
          {getVacationStatusText()}
        </ThemedText>
      </ThemedView>
      {/* Placeholder for any potential future actions/details */}
      <ThemedView style={styles.typeContainer}></ThemedView>
    </ThemedView>
  );
}

export default function MyTimeScreen() {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { member } = useAuth();

  // Get data from the centralized myTime store instead of managing local state
  const {
    timeStats,
    vacationStats,
    timeOffRequests,
    vacationRequests,
    isLoading,
    isRefreshing,
    error,
    refreshData,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
  } = useMyTime();

  // Local UI state (non-data related)
  const [isPaidInLieuVisible, setIsPaidInLieuVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TimeOffRequest | null>(null);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  // Add state to track if component is mounted and force re-renders
  const [isMounted, setIsMounted] = useState(false);
  const mountedRef = useRef(false);
  const [renderCounter, setRenderCounter] = useState(0);
  const refreshAttempts = useRef(0);

  // Date range for paid in lieu
  const [dateRange, setDateRange] = useState({ minDate: "", maxDate: "" });

  // Debug logs to track component lifecycle
  console.log(`[MyTimeScreen] Rendering cycle #${renderCounter}, timeStats present: ${!!timeStats}`);

  // Set date range on component mount
  useIsomorphicLayoutEffect(() => {
    // Calculate date range of ±2 weeks
    const now = new Date();
    const minDate = subWeeks(now, 2).toISOString();
    const maxDate = addWeeks(now, 2).toISOString();
    setDateRange({ minDate, maxDate });
  }, []);

  // Improved mount effect with better logging
  useEffect(() => {
    console.log("[MyTimeScreen] Component mounting");
    setIsMounted(true);
    mountedRef.current = true;

    // Force refresh data as soon as the component mounts, but only once
    if (refreshAttempts.current === 0) {
      console.log("[MyTimeScreen] Initial data load triggered");
      refreshData(true);
      refreshAttempts.current++;
    }

    return () => {
      console.log("[MyTimeScreen] Component unmounting");
      setIsMounted(false);
      mountedRef.current = false;
    };
  }, [refreshData]);

  const cardWidth = useMemo(() => {
    return Math.min(width - 32, 480);
  }, [width]);

  // Add focus effect to refresh data when screen is focused - with cooldown
  useFocusEffect(
    React.useCallback(() => {
      console.log("[MyTime] Screen focused, mounted:", mountedRef.current);
      if (mountedRef.current && refreshAttempts.current > 0) {
        console.log("[MyTime] Non-initial screen focus, refreshing data quietly");
        refreshData(false); // Use non-user-initiated refresh on focus to avoid showing loading spinner
      } else if (mountedRef.current) {
        console.log("[MyTime] First focus, incrementing refresh attempts");
        refreshAttempts.current++;
      }
      return () => {};
    }, [refreshData])
  );

  // Log when stats update for debugging and force render
  useEffect(() => {
    if (timeStats) {
      console.log(
        "[MyTimeScreen] Stats updated: available PLD:",
        timeStats.available?.pld,
        "mounted:",
        mountedRef.current
      );

      // Force a re-render when stats update
      if (mountedRef.current) {
        setRenderCounter((prev) => prev + 1);
      }
    }
  }, [timeStats]);

  // Add use effect for more reliable stats presentation
  const forceUpdate = useCallback(() => {
    console.log("[MyTimeScreen] Force updating component...");
    // This causes a component re-render without changing state
    setRenderCounter((prev) => prev + 1);
  }, []);

  // If data doesn't appear within 1.5 seconds, force update
  useEffect(() => {
    if (!timeStats && !isLoading && mountedRef.current) {
      const timer = setTimeout(() => {
        console.log("[MyTimeScreen] Forced update due to missing stats");
        forceUpdate();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [timeStats, isLoading, forceUpdate]);

  // Memoize the filtered and sorted requests - guard against empty data
  const { pendingAndApproved, waitlisted, sortedVacationRequests } = useMemo(() => {
    // Ensure timeOffRequests is an array before filtering
    const safeTimeOffRequests = Array.isArray(timeOffRequests) ? timeOffRequests : [];

    // Sort PLD/SDV/6mo requests
    const pendingAndApproved = sortRequestsByDate(
      safeTimeOffRequests.filter(
        (request) =>
          request.status === "pending" || request.status === "approved" || request.status === "cancellation_pending"
      )
    );

    // Use safe date comparison instead of parseISO
    pendingAndApproved.future.sort((a, b) => safeCompareDate(a.request_date, b.request_date));
    pendingAndApproved.past.sort((a, b) => safeCompareDate(b.request_date, a.request_date, true));

    const waitlisted = sortRequestsByDate(safeTimeOffRequests.filter((request) => request.status === "waitlisted"));
    waitlisted.future.sort((a, b) => safeCompareDate(a.request_date, b.request_date));
    waitlisted.past.sort((a, b) => safeCompareDate(b.request_date, a.request_date, true));

    // Ensure vacationRequests is an array before sorting
    const safeVacationRequests = Array.isArray(vacationRequests) ? vacationRequests : [];
    const sortedVacationRequests = sortVacationRequestsByDate(safeVacationRequests);

    sortedVacationRequests.future.sort((a, b) => safeCompareDate(a.start_date, b.start_date));
    sortedVacationRequests.past.sort((a, b) => safeCompareDate(b.start_date, a.start_date, true));

    return { pendingAndApproved, waitlisted, sortedVacationRequests };
  }, [timeOffRequests, vacationRequests]);

  // Handle paid in lieu modal
  const handlePaidInLieuPress = () => {
    setIsPaidInLieuVisible(true);
  };

  const handleConfirmPaidInLieu = async (type: "PLD" | "SDV", selectedDate: Date) => {
    try {
      // Validate date is within allowed range
      const now = new Date();
      const minDate = subWeeks(now, 2);
      const maxDate = addWeeks(now, 2);

      if (!isWithinInterval(selectedDate, { start: minDate, end: maxDate })) {
        Toast.show({
          type: "error",
          text1: "Invalid Date Selection",
          text2: "Date must be within two weeks of today",
          position: "bottom",
          visibilityTime: 3000,
        });
        return;
      }

      if (!timeStats) {
        Toast.show({
          type: "error",
          text1: "Request Failed",
          text2: "Unable to determine available days. Please try again.",
          position: "bottom",
          visibilityTime: 3000,
        });
        return;
      }

      // Check if user has available days for the requested type
      const availableDays = type === "PLD" ? timeStats.available.pld : timeStats.available.sdv;
      if (availableDays <= 0) {
        Toast.show({
          type: "error",
          text1: "No Available Days",
          text2: `You don't have any available ${type} days to request payment for.`,
          position: "bottom",
          visibilityTime: 3000,
        });
        return;
      }

      // Show loading toast for better UX
      Toast.show({
        type: "info",
        text1: "Processing Request",
        text2: "Please wait while we process your request...",
        position: "bottom",
        visibilityTime: 2000,
      });

      // Use the requestPaidInLieu method from the hook
      const success = await requestPaidInLieu(type, selectedDate);

      if (success) {
        Toast.show({
          type: "success",
          text1: "Request Submitted",
          text2: `Your request to receive payment for ${type} has been submitted.`,
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    } catch (error) {
      console.error("[MyTime] Error in handleConfirmPaidInLieu:", error);

      // Handle specific error messages
      if (error instanceof DatabaseError) {
        // This is our DatabaseError from useMyTime.ts
        if (error.code === "P0001") {
          if (error.message?.includes("paid in lieu request already exists")) {
            Toast.show({
              type: "error",
              text1: "Duplicate Request",
              text2: "A paid in lieu request already exists for this date. Please select a different date.",
              position: "bottom",
              visibilityTime: 4000,
            });
          } else if (error.message?.includes("active request already exists")) {
            Toast.show({
              type: "error",
              text1: "Duplicate Request",
              text2: "You already have an active request for this date. Please cancel it before creating a new one.",
              position: "bottom",
              visibilityTime: 4000,
            });
          } else {
            // Show the database hint if available (more user-friendly) or message
            Toast.show({
              type: "error",
              text1: "Request Failed",
              text2: error.hint || error.message || "Database error occurred",
              position: "bottom",
              visibilityTime: 3000,
            });
          }
        } else {
          // For other database errors
          Toast.show({
            type: "error",
            text1: "Database Error",
            text2: error.message || "An error occurred with the database",
            position: "bottom",
            visibilityTime: 3000,
          });
        }
      } else {
        // Handle standard Error objects
        const errorMessage = error instanceof Error ? error.message : "An error occurred";

        if (errorMessage.includes("No available")) {
          Toast.show({
            type: "error",
            text1: "No Available Days",
            text2: errorMessage,
            position: "bottom",
            visibilityTime: 3000,
          });
        } else {
          Toast.show({
            type: "error",
            text1: "Request Failed",
            text2: errorMessage,
            position: "bottom",
            visibilityTime: 3000,
          });
        }
      }
    } finally {
      setIsPaidInLieuVisible(false);
    }
  };

  const handleCancelPaidInLieu = () => {
    setIsPaidInLieuVisible(false);
  };

  // Handle request cancellation
  const handleCancelRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setIsCancelModalVisible(true);
  };

  const handleCancelSixMonthRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setIsCancelModalVisible(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedRequest) return;

    try {
      setIsCancellingRequest(true);
      console.log("[MyTime] Attempting to cancel request:", {
        id: selectedRequest.id,
        isSixMonth: selectedRequest.is_six_month_request,
      });

      let success = false;
      if (selectedRequest.is_six_month_request) {
        success = await cancelSixMonthRequest(selectedRequest.id);
      } else {
        success = await cancelRequest(selectedRequest.id);
      }

      if (success) {
        Toast.show({
          type: "success",
          text1: "Success",
          text2: selectedRequest.is_six_month_request
            ? "Six-month request cancelled successfully"
            : "Request cancelled successfully",
          position: "bottom",
          visibilityTime: 3000,
        });

        setIsCancelModalVisible(false);
        setSelectedRequest(null);
      } else {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to cancel request. Please try again.",
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    } catch (error) {
      console.error("[MyTime] Error in handleConfirmCancel:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to cancel request",
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setIsCancellingRequest(false);
    }
  };

  // Handle pull-to-refresh - update to use the myTime store's refreshData
  const handleRefresh = () => {
    console.log("[MyTimeScreen] User-initiated pull-to-refresh");
    refreshData(true);
  };

  // Display loading indicator when data is loading
  if (isLoading) {
    console.log("[MyTimeScreen] Rendering loading state");
    return (
      <ThemedView style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? "light"].primary} />
        <ThemedText style={styles.loadingText}>Loading your time off data...</ThemedText>
      </ThemedView>
    );
  }

  // Display error state when there's an error
  if (error) {
    console.log("[MyTimeScreen] Rendering error state:", error);
    return (
      <ThemedView style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={Colors[colorScheme ?? "light"].error} />
        <ThemedText style={styles.errorTitle}>Error Loading Data</ThemedText>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedTouchableOpacity style={styles.retryButton} onPress={() => refreshData(true)}>
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </ThemedTouchableOpacity>
      </ThemedView>
    );
  }

  // Create a safe stats object that won't crash if timeStats is incomplete or null
  const safeStats = timeStats
    ? {
        total: { pld: timeStats.total?.pld ?? 0, sdv: timeStats.total?.sdv ?? 0 },
        rolledOver: { pld: timeStats.rolledOver?.pld ?? 0, unusedPlds: timeStats.rolledOver?.unusedPlds ?? 0 },
        available: { pld: timeStats.available?.pld ?? 0, sdv: timeStats.available?.sdv ?? 0 },
        requested: { pld: timeStats.requested?.pld ?? 0, sdv: timeStats.requested?.sdv ?? 0 },
        waitlisted: { pld: timeStats.waitlisted?.pld ?? 0, sdv: timeStats.waitlisted?.sdv ?? 0 },
        approved: { pld: timeStats.approved?.pld ?? 0, sdv: timeStats.approved?.sdv ?? 0 },
        paidInLieu: { pld: timeStats.paidInLieu?.pld ?? 0, sdv: timeStats.paidInLieu?.sdv ?? 0 },
        syncStatus: timeStats.syncStatus,
      }
    : null;

  return (
    <>
      <ThemedScrollView
        style={[
          styles.container,
          {
            backgroundColor: Colors[colorScheme ?? "light"].background,
            paddingTop: insets.top,
          },
        ]}
        contentContainerStyle={styles.contentContainer}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        {/* Add sync status indicator */}
        {timeStats?.syncStatus?.isSyncing && (
          <ThemedView style={styles.syncIndicator}>
            <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].tint} />
            <ThemedText style={styles.syncText}>Syncing...</ThemedText>
          </ThemedView>
        )}

        {timeStats?.syncStatus?.error && (
          <ThemedView style={styles.errorIndicator}>
            <Feather name="alert-circle" size={16} color={Colors[colorScheme ?? "light"].error} />
            <ThemedText style={styles.errorText}>{timeStats.syncStatus.error}</ThemedText>
          </ThemedView>
        )}

        {timeStats?.rolledOver?.unusedPlds > 0 && (
          <RolloverWarningBanner unusedPlds={timeStats.rolledOver.unusedPlds} />
        )}

        {/* Render statistics directly */}
        {!safeStats ? (
          // Show loading state if stats aren't available
          <ThemedView style={[styles.card, { width: cardWidth, padding: 20, alignItems: "center" }]}>
            <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].primary} />
            <ThemedText style={{ marginTop: 12 }}>Loading your time off data...</ThemedText>
          </ThemedView>
        ) : (
          // Render stats directly instead of using a separate component
          <ThemedView style={[styles.card, { width: cardWidth }]} key={`stats-${renderCounter}`}>
            <ThemedView style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Current Single Day Allocations</ThemedText>
            </ThemedView>
            <ThemedView style={styles.tableHeader}>
              <ThemedText style={styles.headerLabel}>Type</ThemedText>
              <ThemedText style={styles.headerValue}>PLD</ThemedText>
              <ThemedText style={styles.headerValue}>SDV</ThemedText>
            </ThemedView>

            <LeaveRow label="Total" pldValue={safeStats.total.pld} sdvValue={safeStats.total.sdv} />
            <LeaveRow label="Rolled Over" pldValue={safeStats.rolledOver.pld} />
            <LeaveRow label="Available" pldValue={safeStats.available.pld} sdvValue={safeStats.available.sdv} />
            <LeaveRow label="Requested/Pending" pldValue={safeStats.requested.pld} sdvValue={safeStats.requested.sdv} />
            <LeaveRow label="Waitlisted" pldValue={safeStats.waitlisted.pld} sdvValue={safeStats.waitlisted.sdv} />
            <LeaveRow label="Approved" pldValue={safeStats.approved.pld} sdvValue={safeStats.approved.sdv} />
            <LeaveRow
              label="Paid in Lieu"
              pldValue={safeStats.paidInLieu.pld}
              sdvValue={safeStats.paidInLieu.sdv}
              showIcon={true}
              onIconPress={handlePaidInLieuPress}
            />
          </ThemedView>
        )}

        {/* Vacation Summary Card */}
        {vacationStats && (
          <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
            <ThemedView style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Vacation Summary</ThemedText>
            </ThemedView>

            <VacationSummaryRow label="Total Vacation Weeks" value={vacationStats.totalWeeks ?? 0} />
            <VacationSummaryRow label="Split Weeks (converted to SDVs)" value={vacationStats.splitWeeks ?? 0} />
            <VacationSummaryRow label="Weeks to Bid" value={vacationStats.weeksToBid ?? 0} />
            <VacationSummaryRow label="Approved Vacation Requests" value={vacationStats.approvedWeeks ?? 0} />
            <VacationSummaryRow
              label="Remaining Weeks to Bid"
              value={vacationStats.remainingWeeks ?? 0}
              highlight={true}
            />
          </ThemedView>
        )}

        <ThemedView style={[styles.sectionHeader, { marginTop: 12 }]}>
          <ThemedText style={styles.sectionTitle}>Time Off Requests</ThemedText>
        </ThemedView>

        {/* PLD and SDV Requests Card */}
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedText style={styles.subsectionTitle}>Pending & Approved Requests</ThemedText>
          {pendingAndApproved.future.length > 0 || pendingAndApproved.past.length > 0 ? (
            <>
              {pendingAndApproved.future.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onCancel={handleCancelRequest}
                  onCancelSixMonth={handleCancelSixMonthRequest}
                />
              ))}

              {pendingAndApproved.past.length > 0 && pendingAndApproved.future.length > 0 && (
                <ThemedView style={styles.dateSeparator}>
                  <ThemedText style={styles.dateSeparatorText}>Past Requests</ThemedText>
                </ThemedView>
              )}

              {pendingAndApproved.past.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onCancel={handleCancelRequest}
                  onCancelSixMonth={handleCancelSixMonthRequest}
                />
              ))}
            </>
          ) : (
            <ThemedView style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>No pending or approved requests</ThemedText>
            </ThemedView>
          )}

          {(waitlisted.future.length > 0 || waitlisted.past.length > 0) && (
            <>
              <ThemedText style={[styles.subsectionTitle, styles.waitlistTitle]}>Waitlisted Requests</ThemedText>

              {waitlisted.future.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onCancel={handleCancelRequest}
                  onCancelSixMonth={handleCancelSixMonthRequest}
                />
              ))}

              {waitlisted.past.length > 0 && waitlisted.future.length > 0 && (
                <ThemedView style={styles.dateSeparator}>
                  <ThemedText style={styles.dateSeparatorText}>Past Requests</ThemedText>
                </ThemedView>
              )}

              {waitlisted.past.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  onCancel={handleCancelRequest}
                  onCancelSixMonth={handleCancelSixMonthRequest}
                />
              ))}
            </>
          )}
        </ThemedView>

        {/* Full-Week Vacation Requests Card - Updated Section */}
        <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
          <ThemedText style={styles.subsectionTitle}>Full-Week Vacation Requests</ThemedText>
          {sortedVacationRequests.future.length > 0 || sortedVacationRequests.past.length > 0 ? (
            <>
              {/* Future Vacation Requests */}
              {sortedVacationRequests.future.map((request) => (
                <VacationRequestRow key={request.id} request={request} />
              ))}

              {/* Separator for Past Vacation Requests */}
              {sortedVacationRequests.past.length > 0 && sortedVacationRequests.future.length > 0 && (
                <ThemedView style={styles.dateSeparator}>
                  <ThemedText style={styles.dateSeparatorText}>Past Requests</ThemedText>
                </ThemedView>
              )}

              {/* Past Vacation Requests */}
              {sortedVacationRequests.past.map((request) => (
                <VacationRequestRow key={request.id} request={request} />
              ))}
            </>
          ) : (
            <ThemedView style={styles.emptyState}>
              <ThemedText style={styles.emptyStateText}>No full-week vacation requests</ThemedText>
            </ThemedView>
          )}
        </ThemedView>
      </ThemedScrollView>

      {/* Paid In Lieu Modal */}
      <PaidInLieuModal
        isVisible={isPaidInLieuVisible}
        onConfirm={handleConfirmPaidInLieu}
        onCancel={handleCancelPaidInLieu}
        stats={timeStats}
        minDate={dateRange.minDate}
        maxDate={dateRange.maxDate}
      />

      <CancelRequestModal
        isVisible={isCancelModalVisible}
        request={selectedRequest}
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          setIsCancelModalVisible(false);
          setSelectedRequest(null);
        }}
        isLoading={isCancellingRequest}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  card: {
    borderRadius: 12,
    backgroundColor: Colors.dark.card,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  headerLabel: {
    flex: 2,
    fontSize: 16,
    fontWeight: "600",
  },
  headerValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  label: {
    flex: 2,
    fontSize: 16,
  },
  valueContainer: {
    flex: 1,
    alignItems: "center",
  },
  value: {
    fontSize: 16,
  },
  iconContainer: {
    width: 24,
    alignItems: "center",
  },
  sectionHeader: {
    width: "100%",
    paddingVertical: 24,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  timeOffContent: {
    width: "100%",
    height: 200, // Placeholder height
  },
  loadingContainer: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  modalDescription: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  typeButtonsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    width: "100%",
  },
  typeButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 8,
    minWidth: 100,
    alignItems: "center",
  },
  selectedTypeButton: {
    backgroundColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  selectedTypeButtonText: {
    color: Colors.dark.buttonText,
  },
  disabledButtonText: {
    opacity: 0.5,
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  cancelButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
  },
  confirmButtonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.5,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  requestInfo: {
    flex: 1,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  requestDate: {
    fontSize: 16,
    fontWeight: "600",
  },
  requestDetails: {
    fontSize: 14,
    opacity: 0.7,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  waitlistPosition: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.dark.warning,
    marginTop: 4,
  },
  subsectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  waitlistTitle: {
    marginTop: 16,
  },
  vacationTitle: {
    marginTop: 16,
  },
  emptyState: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontSize: 16,
    opacity: 0.7,
  },
  dateSeparator: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.dark.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  dateSeparatorText: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
  },
  cancellationPendingRow: {
    backgroundColor: Colors.dark.error + "10", // Light red background
  },
  sixMonthRequestRow: {
    backgroundColor: Colors.dark.warning + "10", // Light warning background
  },
  dateContainer: {
    flex: 1,
  },
  date: {
    fontSize: 16,
    fontWeight: "600",
  },
  typeContainer: {
    flex: 1,
  },
  type: {
    fontSize: 16,
    fontWeight: "600",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%",
    maxWidth: 600,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
  },
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 8,
    width: "100%",
  },
  syncText: {
    marginLeft: 8,
    fontSize: 14,
  },
  errorIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: 8,
    marginBottom: 8,
    width: "100%",
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.dark.error,
  },
  infoContainer: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 16,
  },
  infoText: {
    fontSize: 12,
    fontStyle: "italic",
    opacity: 0.7,
  },
  vacationValueContainer: {
    flex: 2,
    alignItems: "flex-end",
    paddingRight: 16,
  },
  vacationValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
  },
  warningMessageText: {
    marginLeft: 8,
    fontSize: 14,
  },
  retryButton: {
    flexDirection: "row",
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  retryText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginVertical: 10,
  },
  errorText: {
    textAlign: "center",
    marginBottom: 20,
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "bold",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    padding: 16,
  },
  moreRequestsText: {
    fontSize: 14,
    fontWeight: "bold",
    color: Colors.dark.primary,
    padding: 8,
    textAlign: "center",
  },
});
