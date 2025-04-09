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
import { useMyTime } from "@/hooks/useMyTime";
import { format } from "date-fns-tz";
import { parseISO } from "date-fns";
import { useFocusEffect } from "@react-navigation/native";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";

interface LeaveRowProps {
  label: string;
  pldValue: number;
  sdvValue?: number;
  showIcon?: boolean;
  onIconPress?: () => void;
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

interface TimeOffRequest {
  id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
  requested_at: string;
  waitlist_position?: number;
  paid_in_lieu?: boolean;
  is_six_month_request?: boolean;
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
      {(request.status === "pending" || request.status === "approved" || request.is_six_month_request) &&
        parseISO(request.request_date) > new Date() && (
          <ThemedTouchableOpacity
            style={styles.cancelButton}
            onPress={() => (request.is_six_month_request ? onCancelSixMonth(request) : onCancel(request))}
          >
            <Feather name="x-circle" size={24} color={Colors[colorScheme ?? "light"].error} />
          </ThemedTouchableOpacity>
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
                <ThemedText style={styles.confirmButtonText}>
                  Yes, Cancel {isApproved ? "Approved" : ""} {isPaidInLieu ? "Payment" : ""} Request
                </ThemedText>
              )}
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

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
    requests,
    isLoading,
    error,
    isInitialized,
    initialize,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
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
  const { pendingAndApproved, waitlisted } = useMemo(() => {
    // Filter and sort requests by status and date
    const pendingAndApproved = sortRequestsByDate(
      requests.filter(
        (request) =>
          request.status === "pending" || request.status === "approved" || request.status === "cancellation_pending"
      )
    );

    // Sort future dates ascending (closest first)
    pendingAndApproved.future.sort((a, b) => parseISO(a.request_date).getTime() - parseISO(b.request_date).getTime());

    // Sort past dates descending (most recent first)
    pendingAndApproved.past.sort((a, b) => parseISO(b.request_date).getTime() - parseISO(a.request_date).getTime());

    const waitlisted = sortRequestsByDate(requests.filter((request) => request.status === "waitlisted"));

    // Sort future dates ascending (closest first)
    waitlisted.future.sort((a, b) => parseISO(a.request_date).getTime() - parseISO(b.request_date).getTime());

    // Sort past dates descending (most recent first)
    waitlisted.past.sort((a, b) => parseISO(b.request_date).getTime() - parseISO(a.request_date).getTime());

    return { pendingAndApproved, waitlisted };
  }, [requests]); // Only recalculate when requests change

  const handlePaidInLieuPress = () => {
    setShowPaidInLieuModal(true);
  };

  const handleConfirmPaidInLieu = async () => {
    if (!selectedType) return;

    try {
      const success = await requestPaidInLieu(selectedType);

      if (success) {
        Alert.alert("Request Submitted", `Your request to receive payment for ${selectedType} has been submitted.`);
      } else {
        Alert.alert("Request Failed", "Unable to process your request. Please try again later.");
      }
    } catch (error) {
      Alert.alert("Error", "An error occurred while processing your request.");
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
          Alert.alert("Success", "Six-month request cancelled successfully");
        } else {
          Alert.alert("Error", "Failed to cancel six-month request");
        }
      } else {
        const success = await cancelRequest(selectedRequest.id);
        if (success) {
          Alert.alert("Success", "Request cancelled successfully");
        } else {
          Alert.alert("Error", "Failed to cancel request");
        }
      }

      setShowCancelModal(false);
      setSelectedRequest(null);
    } catch (error) {
      console.error("[MyTime] Error in handleConfirmCancel:", error);
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to cancel request");
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
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Current Allocations</ThemedText>
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

        <ThemedView style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Time Off Requests</ThemedText>
        </ThemedView>

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
      </ThemedScrollView>

      <Modal visible={showPaidInLieuModal} transparent animationType="fade" onRequestClose={handleCancelPaidInLieu}>
        <ThemedView style={styles.modalContainer}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Request Paid in Lieu</ThemedText>
            <ThemedText style={styles.modalDescription}>
              Select the type of day you want to request payment for:
            </ThemedText>

            <ThemedView style={styles.typeButtonsContainer}>
              <ThemedTouchableOpacity
                style={[styles.typeButton, selectedType === "PLD" && styles.selectedTypeButton]}
                onPress={() => setSelectedType("PLD")}
              >
                <ThemedText style={[styles.typeButtonText, selectedType === "PLD" && styles.selectedTypeButtonText]}>
                  PLD
                </ThemedText>
              </ThemedTouchableOpacity>

              <ThemedTouchableOpacity
                style={[styles.typeButton, selectedType === "SDV" && styles.selectedTypeButton]}
                onPress={() => setSelectedType("SDV")}
              >
                <ThemedText style={[styles.typeButtonText, selectedType === "SDV" && styles.selectedTypeButtonText]}>
                  SDV
                </ThemedText>
              </ThemedTouchableOpacity>
            </ThemedView>

            <ThemedView style={styles.modalButtonsContainer}>
              <ThemedTouchableOpacity style={styles.cancelButton} onPress={handleCancelPaidInLieu}>
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </ThemedTouchableOpacity>

              <ThemedTouchableOpacity
                style={[styles.confirmButton, !selectedType && styles.disabledButton]}
                onPress={handleConfirmPaidInLieu}
                disabled={!selectedType}
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
    color: Colors.dark.background,
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
});
