import React, { useState, useRef, useEffect, useMemo } from "react";
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
import { useMyTime, UserVacationRequest } from "@/hooks/useMyTime";
import { format } from "date-fns-tz";
import { parseISO, isWithinInterval, isBefore, addDays } from "date-fns";
import { useFocusEffect } from "@react-navigation/native";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";
import Toast from "react-native-toast-message";
import { Database } from "@/types/supabase";

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

// Original sorting function for TimeOffRequest (PLD/SDV/6mo)
function sortRequestsByDate(requests: TimeOffRequest[]): {
  future: TimeOffRequest[];
  past: TimeOffRequest[];
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison

  return requests.reduce(
    (acc, request) => {
      const requestDate = parseISO(request.request_date);
      requestDate.setHours(0, 0, 0, 0);

      if (requestDate >= now) {
        acc.future.push(request);
      } else {
        acc.past.push(request);
      }
      return acc;
    },
    { future: [] as TimeOffRequest[], past: [] as TimeOffRequest[] }
  );
}

// New sorting function specifically for UserVacationRequest
function sortVacationRequestsByDate(requests: UserVacationRequest[]): {
  future: UserVacationRequest[];
  past: UserVacationRequest[];
} {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset time to start of day

  return requests.reduce(
    (acc, request) => {
      // Use start_date for comparison
      const requestDate = parseISO(request.start_date);
      requestDate.setHours(0, 0, 0, 0);

      if (requestDate >= now) {
        acc.future.push(request);
      } else {
        acc.past.push(request);
      }
      return acc;
    },
    { future: [] as UserVacationRequest[], past: [] as UserVacationRequest[] }
  );
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
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const [showPaidInLieuModal, setShowPaidInLieuModal] = useState(false);
  const [selectedType, setSelectedType] = useState<"PLD" | "SDV" | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TimeOffRequest | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const didSkipInitialFocusRef = useRef(false);

  // Get auth and store state
  const { session } = useAuth();
  const member = useUserStore((state) => state.member);

  const {
    stats,
    vacationStats,
    requests,
    vacationRequests,
    isLoading,
    error,
    isInitialized,
    initialize,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
    syncStatus,
  } = useMyTime();

  // Calculate responsive card width
  const cardWidth = Math.min(width * 0.9, 600);

  // Handle focus events
  useFocusEffect(
    React.useCallback(() => {
      if (!didSkipInitialFocusRef.current) {
        didSkipInitialFocusRef.current = true;
        console.log("[MyTimeScreen] Skipping initial focus event refresh.");
        return;
      }

      if (!member?.id) {
        console.log("[MyTimeScreen] Focus but no auth/member, skipping refresh attempt");
        return;
      }

      console.log("[MyTimeScreen] Screen focused, attempting refresh");
      initialize(true);
    }, [member?.id])
  );

  // Memoize the filtered and sorted requests
  const { pendingAndApproved, waitlisted, sortedVacationRequests } = useMemo(() => {
    // Sort PLD/SDV/6mo requests
    const pendingAndApproved = sortRequestsByDate(
      requests.filter(
        (request) =>
          request.status === "pending" || request.status === "approved" || request.status === "cancellation_pending"
      )
    );
    pendingAndApproved.future.sort((a, b) => parseISO(a.request_date).getTime() - parseISO(b.request_date).getTime());
    pendingAndApproved.past.sort((a, b) => parseISO(b.request_date).getTime() - parseISO(a.request_date).getTime());

    const waitlisted = sortRequestsByDate(requests.filter((request) => request.status === "waitlisted"));
    waitlisted.future.sort((a, b) => parseISO(a.request_date).getTime() - parseISO(b.request_date).getTime());
    waitlisted.past.sort((a, b) => parseISO(b.request_date).getTime() - parseISO(a.request_date).getTime());

    const sortedVacationRequests = sortVacationRequestsByDate(vacationRequests);
    sortedVacationRequests.future.sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime());
    sortedVacationRequests.past.sort((a, b) => parseISO(b.start_date).getTime() - parseISO(a.start_date).getTime());

    return { pendingAndApproved, waitlisted, sortedVacationRequests };
  }, [requests, vacationRequests]);

  const handlePaidInLieuPress = () => {
    setShowPaidInLieuModal(true);
  };

  const handleConfirmPaidInLieu = async () => {
    if (!selectedType) return;

    try {
      const success = await requestPaidInLieu(selectedType);

      if (success) {
        Toast.show({
          type: "success",
          text1: "Request Submitted",
          text2: `Your request to receive payment for ${selectedType} has been submitted.`,
          position: "bottom",
          visibilityTime: 3000,
        });
      } else {
        Toast.show({
          type: "error",
          text1: "Request Failed",
          text2: "Unable to process your request. Please try again later.",
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    } catch (error) {
      console.error("[MyTime] Error in handleConfirmPaidInLieu:", error);
      Toast.show({
        type: "error",
        text1: "Request Failed",
        text2: error instanceof Error ? error.message : "An error occurred while processing your request.",
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setShowPaidInLieuModal(false);
      setSelectedType(null);
    }
  };

  const handleCancelPaidInLieu = () => {
    setShowPaidInLieuModal(false);
    setSelectedType(null);
  };

  const handleCancelRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setShowCancelModal(true);
  };

  const handleCancelSixMonthRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedRequest) return;

    try {
      setIsCancelling(true);
      console.log("[MyTime] Attempting to cancel request:", {
        id: selectedRequest.id,
        isSixMonth: selectedRequest.is_six_month_request,
      });

      if (selectedRequest.is_six_month_request) {
        const success = await cancelSixMonthRequest(selectedRequest.id);
        if (success) {
          Toast.show({
            type: "success",
            text1: "Success",
            text2: "Six-month request cancelled successfully",
            position: "bottom",
            visibilityTime: 3000,
          });
        } else {
          Toast.show({
            type: "error",
            text1: "Error",
            text2: "Failed to cancel six-month request",
            position: "bottom",
            visibilityTime: 3000,
          });
        }
      } else {
        const success = await cancelRequest(selectedRequest.id);
        if (success) {
          Toast.show({
            type: "success",
            text1: "Success",
            text2: "Request cancelled successfully",
            position: "bottom",
            visibilityTime: 3000,
          });
        } else {
          Toast.show({
            type: "error",
            text1: "Error",
            text2: "Failed to cancel request",
            position: "bottom",
            visibilityTime: 3000,
          });
        }
      }

      setShowCancelModal(false);
      setSelectedRequest(null);
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
      setIsCancelling(false);
    }
  };

  if (!member?.id || isLoading || !isInitialized || !stats) {
    return (
      <ThemedScrollView
        style={[
          styles.container,
          { backgroundColor: Colors[colorScheme ?? "light"].background, paddingTop: insets.top },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors[colorScheme ?? "light"].tint} />
            <ThemedText style={styles.loadingText}>Loading time statistics...</ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedScrollView>
    );
  }

  if (error) {
    return (
      <ThemedScrollView
        style={[
          styles.container,
          {
            backgroundColor: Colors[colorScheme ?? "light"].background,
            paddingTop: insets.top,
          },
        ]}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>Error: {error}</ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedScrollView>
    );
  }

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
      >
        {/* Add sync status indicator */}
        {syncStatus.isSyncing && (
          <ThemedView style={styles.syncIndicator}>
            <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].tint} />
            <ThemedText style={styles.syncText}>Syncing...</ThemedText>
          </ThemedView>
        )}

        {syncStatus.error && (
          <ThemedView style={styles.errorIndicator}>
            <Feather name="alert-circle" size={16} color={Colors[colorScheme ?? "light"].error} />
            <ThemedText style={styles.errorText}>{syncStatus.error}</ThemedText>
          </ThemedView>
        )}

        {stats && <RolloverWarningBanner unusedPlds={stats.rolledOver.unusedPlds} />}

        {/* Current Allocations Card */}
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Current Single Day Allocations</ThemedText>
          </ThemedView>
          <ThemedView style={styles.tableHeader}>
            <ThemedText style={styles.headerLabel}>Type</ThemedText>
            <ThemedText style={styles.headerValue}>PLD</ThemedText>
            <ThemedText style={styles.headerValue}>SDV</ThemedText>
          </ThemedView>

          <LeaveRow label="Total" pldValue={stats.total.pld} sdvValue={stats.total.sdv} />
          <LeaveRow label="Rolled Over" pldValue={stats.rolledOver.pld} />
          <LeaveRow label="Available" pldValue={stats.available.pld} sdvValue={stats.available.sdv} />
          <LeaveRow label="Requested/Pending" pldValue={stats.requested.pld} sdvValue={stats.requested.sdv} />
          <LeaveRow label="Waitlisted" pldValue={stats.waitlisted.pld} sdvValue={stats.waitlisted.sdv} />
          <LeaveRow label="Approved" pldValue={stats.approved.pld} sdvValue={stats.approved.sdv} />
          <LeaveRow
            label="Paid in Lieu"
            pldValue={stats.paidInLieu.pld}
            sdvValue={stats.paidInLieu.sdv}
            showIcon={true}
            onIconPress={handlePaidInLieuPress}
          />
        </ThemedView>

        {/* Vacation Summary Card */}
        {vacationStats && (
          <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
            <ThemedView style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Vacation Summary</ThemedText>
            </ThemedView>

            <VacationSummaryRow label="Total Vacation Weeks" value={vacationStats.totalWeeks} />
            <VacationSummaryRow label="Split Weeks (converted to SDVs)" value={vacationStats.splitWeeks} />
            <VacationSummaryRow label="Weeks to Bid" value={vacationStats.weeksToBid} />
            <VacationSummaryRow label="Approved Vacation Requests" value={vacationStats.approvedWeeks} />
            <VacationSummaryRow label="Remaining Weeks to Bid" value={vacationStats.remainingWeeks} highlight={true} />
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
                  <ThemedText style={styles.sectionTitle}>Past Requests</ThemedText>
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

      <Modal visible={showPaidInLieuModal} transparent animationType="fade" onRequestClose={handleCancelPaidInLieu}>
        <ThemedView style={styles.modalContainer}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Request Paid in Lieu</ThemedText>
            <ThemedText style={styles.modalDescription}>
              Select the type of day you want to request payment for:
            </ThemedText>

            {/* Warning message if no days are available */}
            {stats && stats.available.pld <= 0 && stats.available.sdv <= 0 && (
              <ThemedView style={styles.warningContainer}>
                <Feather name="alert-triangle" size={18} color={Colors[colorScheme ?? "light"].warning} />
                <ThemedText style={styles.warningMessageText}>
                  You don't have any available days to request payment for.
                </ThemedText>
              </ThemedView>
            )}

            {/* PLD warning if only PLD is unavailable */}
            {stats && stats.available.pld <= 0 && stats.available.sdv > 0 && (
              <ThemedView style={styles.warningContainer}>
                <Feather name="info" size={18} color={Colors[colorScheme ?? "light"].warning} />
                <ThemedText style={styles.warningMessageText}>You don't have any available PLD days.</ThemedText>
              </ThemedView>
            )}

            {/* SDV warning if only SDV is unavailable */}
            {stats && stats.available.pld > 0 && stats.available.sdv <= 0 && (
              <ThemedView style={styles.warningContainer}>
                <Feather name="info" size={18} color={Colors[colorScheme ?? "light"].warning} />
                <ThemedText style={styles.warningMessageText}>You don't have any available SDV days.</ThemedText>
              </ThemedView>
            )}

            <ThemedView style={styles.typeButtonsContainer}>
              <ThemedTouchableOpacity
                style={[
                  styles.typeButton,
                  selectedType === "PLD" && styles.selectedTypeButton,
                  stats && stats.available.pld <= 0 && styles.disabledButton,
                ]}
                onPress={() => setSelectedType("PLD")}
                disabled={stats && stats.available.pld <= 0}
              >
                <ThemedText
                  style={[
                    styles.typeButtonText,
                    selectedType === "PLD" && styles.selectedTypeButtonText,
                    stats && stats.available.pld <= 0 && styles.disabledButtonText,
                  ]}
                >
                  PLD ({stats?.available.pld || 0})
                </ThemedText>
              </ThemedTouchableOpacity>

              <ThemedTouchableOpacity
                style={[
                  styles.typeButton,
                  selectedType === "SDV" && styles.selectedTypeButton,
                  stats && stats.available.sdv <= 0 && styles.disabledButton,
                ]}
                onPress={() => setSelectedType("SDV")}
                disabled={stats && stats.available.sdv <= 0}
              >
                <ThemedText
                  style={[
                    styles.typeButtonText,
                    selectedType === "SDV" && styles.selectedTypeButtonText,
                    stats && stats.available.sdv <= 0 && styles.disabledButtonText,
                  ]}
                >
                  SDV ({stats?.available.sdv || 0})
                </ThemedText>
              </ThemedTouchableOpacity>
            </ThemedView>

            <ThemedView style={styles.modalButtonsContainer}>
              <ThemedTouchableOpacity style={styles.cancelButton} onPress={handleCancelPaidInLieu}>
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </ThemedTouchableOpacity>

              <ThemedTouchableOpacity
                style={[
                  styles.confirmButton,
                  (!selectedType ||
                    (stats && selectedType === "PLD" && stats.available.pld <= 0) ||
                    (stats && selectedType === "SDV" && stats.available.sdv <= 0)) &&
                    styles.disabledButton,
                ]}
                onPress={handleConfirmPaidInLieu}
                disabled={
                  !selectedType ||
                  (stats && selectedType === "PLD" && stats.available.pld <= 0) ||
                  (stats && selectedType === "SDV" && stats.available.sdv <= 0)
                }
              >
                <ThemedText style={styles.confirmButtonText}>Request Payment</ThemedText>
              </ThemedTouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      <CancelRequestModal
        isVisible={showCancelModal}
        request={selectedRequest}
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          setShowCancelModal(false);
          setSelectedRequest(null);
        }}
        isLoading={isCancelling}
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
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
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
    backgroundColor: Colors.dark.background,
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
});
