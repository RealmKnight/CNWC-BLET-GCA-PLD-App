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
  RefreshControl,
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
import { TimeOffRequest, UserVacationRequest } from "@/store/timeStore";
import { format } from "date-fns-tz";
import { parseISO, isWithinInterval, isBefore, addDays, subWeeks, addWeeks } from "date-fns";
import { useFocusEffect } from "@react-navigation/native";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";
import Toast from "react-native-toast-message";
import { Database } from "@/types/supabase";
import { PaidInLieuModal } from "@/components/modals/PaidInLieuModal";
import { Select } from "@/components/ui/Select";
import { supabase } from "@/utils/supabase";
import { Picker } from "@react-native-picker/picker";
import { useTimeStore } from "@/store/timeStore";

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
// TimeOffRequest is now imported from store/timeStore.ts

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

  // Check if this is an approved paid in lieu request
  const isApprovedPaidInLieu = useMemo(() => {
    return request.paid_in_lieu && request.status === "approved";
  }, [request.paid_in_lieu, request.status]);

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
        (request.status === "approved" && !request.paid_in_lieu) ||
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
        (request.status === "pending" || (request.status === "approved" && !request.paid_in_lieu)) &&
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

  // PHASE 4.2: Year-aware MyTime Screen implementation
  const currentDisplayYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentDisplayYear);

  // Get TimeStore methods for year-aware data
  const { fetchTimeStatsForYear, getTimeStatsForYear } = useTimeStore();

  // State for year-specific data
  const [yearSpecificStats, setYearSpecificStats] = useState<any>(null);
  const [isLoadingYearStats, setIsLoadingYearStats] = useState(false);
  const [yearSpecificError, setYearSpecificError] = useState<string | null>(null);

  // Get data from the simplified useMyTime hook (which gets it from useTimeStore)
  const {
    timeStats,
    vacationStats,
    timeOffRequests,
    vacationRequests,
    isLoading,
    isRefreshing,
    error,
    isSubmittingAction,
    refreshData,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
  } = useMyTime();

  // <<< --- ADDED DEBUG LOGGING useEffect --- >>>
  // useEffect(() => {
  //   console.log("[MyTimeScreen] timeOffRequests changed in useEffect:", timeOffRequests);
  // }, [timeOffRequests]);
  // // <<< --- END DEBUG LOGGING useEffect --- >>>

  // // <<< --- ADD DEBUG LOGGING --- >>>
  // console.log("[MyTimeScreen] Rendering with values:", {
  //   isLoading,
  //   error,
  //   hasTimeStats: !!timeStats,
  //   // timeStats, // Avoid logging large object directly unless needed
  // });
  // <<< --- END DEBUG LOGGING --- >>>

  // Local UI state (non-data related) - Keep these
  const [isPaidInLieuVisible, setIsPaidInLieuVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TimeOffRequest | null>(null);
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [dateRange, setDateRange] = useState({ minDate: "", maxDate: "" });

  // Debug logs can be removed or kept as needed
  // console.log(`[MyTimeScreen] Rendering, timeStats present: ${!!timeStats}`);

  // Keep effect for setting initial date range for PIL modal
  useEffect(() => {
    const now = new Date();
    const minDate = subWeeks(now, 2).toISOString();
    const maxDate = addWeeks(now, 2).toISOString();
    setDateRange({ minDate, maxDate });
  }, []);

  // PHASE 4.2: Effect to fetch year-specific stats when selected year changes
  useEffect(() => {
    let isMounted = true;

    // If current year is selected, use the data from useMyTime hook
    if (selectedYear === currentDisplayYear) {
      if (isMounted) {
        setYearSpecificStats(null); // Clear year-specific stats to use current data
        setYearSpecificError(null);
      }
      return;
    }

    // For non-current years, fetch year-specific data
    const fetchYearSpecificData = async () => {
      if (!member?.id) {
        if (isMounted) {
          setYearSpecificError("Member information not available");
        }
        return;
      }

      if (isMounted) {
        setIsLoadingYearStats(true);
        setYearSpecificError(null);
      }

      try {
        // Check cache first
        const cachedStats = getTimeStatsForYear(selectedYear);
        if (cachedStats && isMounted) {
          console.log(`[MyTimeScreen] Using cached stats for year ${selectedYear}:`, cachedStats);
          setYearSpecificStats(cachedStats);
        } else if (isMounted) {
          // Fetch year-specific stats
          console.log(`[MyTimeScreen] Fetching year-specific stats for ${selectedYear}`);
          const yearStats = await fetchTimeStatsForYear(member.id, selectedYear);
          if (yearStats && isMounted) {
            setYearSpecificStats(yearStats);
            console.log(`[MyTimeScreen] Fetched year ${selectedYear} stats:`, yearStats);
          } else if (isMounted) {
            setYearSpecificError(`Unable to load data for year ${selectedYear}`);
          }
        }
      } catch (error) {
        console.error(`[MyTimeScreen] Error fetching year ${selectedYear} stats:`, error);
        if (isMounted) {
          setYearSpecificError(
            `Error loading data for year ${selectedYear}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingYearStats(false);
        }
      }
    };

    fetchYearSpecificData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [selectedYear, currentDisplayYear, member?.id, fetchTimeStatsForYear, getTimeStatsForYear]);

  const cardWidth = useMemo(() => {
    return Math.min(width - 32, 480);
  }, [width]);

  // PHASE 4.2: Year-aware request filtering and sorting
  const { pendingAndApproved, waitlisted, sortedVacationRequests } = useMemo(() => {
    const safeTimeOffRequests = Array.isArray(timeOffRequests) ? timeOffRequests : [];

    // Filter requests by selected year
    const yearFilteredRequests = safeTimeOffRequests.filter((request) => {
      if (!request.request_date) return false;
      try {
        const requestYear = new Date(request.request_date).getFullYear();
        return requestYear === selectedYear;
      } catch (error) {
        console.error(`[MyTimeScreen] Error parsing request date: ${request.request_date}`, error);
        return false;
      }
    });

    console.log(
      `[MyTimeScreen] Filtering requests for year ${selectedYear}: ${yearFilteredRequests.length}/${safeTimeOffRequests.length} requests`
    );

    const pendingAndApproved = sortRequestsByDate(
      yearFilteredRequests.filter(
        (request) =>
          request.status === "pending" || request.status === "approved" || request.status === "cancellation_pending"
      )
    );
    pendingAndApproved.future.sort((a, b) => safeCompareDate(a.request_date, b.request_date));
    pendingAndApproved.past.sort((a, b) => safeCompareDate(b.request_date, a.request_date, true));

    const waitlisted = sortRequestsByDate(yearFilteredRequests.filter((request) => request.status === "waitlisted"));
    waitlisted.future.sort((a, b) => safeCompareDate(a.request_date, b.request_date));
    waitlisted.past.sort((a, b) => safeCompareDate(b.request_date, a.request_date, true));

    const safeVacationRequests = Array.isArray(vacationRequests) ? vacationRequests : [];
    const sortedVacationRequests = sortVacationRequestsByDate(safeVacationRequests);
    sortedVacationRequests.future.sort((a, b) => safeCompareDate(a.start_date, b.start_date));
    sortedVacationRequests.past.sort((a, b) => safeCompareDate(b.start_date, a.start_date, true));

    return { pendingAndApproved, waitlisted, sortedVacationRequests };
  }, [timeOffRequests, vacationRequests, selectedYear]);

  // PHASE 4.2: Determine which stats to display based on selected year - MOVED BEFORE EARLY RETURNS
  const displayStats = useMemo(() => {
    const sourceStats = selectedYear === currentDisplayYear ? timeStats : yearSpecificStats;

    if (!sourceStats) {
      return null;
    }

    try {
      return {
        total: {
          pld: sourceStats.total?.pld ?? 0,
          sdv: sourceStats.total?.sdv ?? 0,
        },
        rolledOver: {
          pld: sourceStats.rolledOver?.pld ?? 0,
          unusedPlds: sourceStats.rolledOver?.unusedPlds ?? 0,
        },
        available: {
          pld: sourceStats.available?.pld ?? 0,
          sdv: sourceStats.available?.sdv ?? 0,
        },
        requested: {
          pld: sourceStats.requested?.pld ?? 0,
          sdv: sourceStats.requested?.sdv ?? 0,
        },
        waitlisted: {
          pld: sourceStats.waitlisted?.pld ?? 0,
          sdv: sourceStats.waitlisted?.sdv ?? 0,
        },
        approved: {
          pld: sourceStats.approved?.pld ?? 0,
          sdv: sourceStats.approved?.sdv ?? 0,
        },
        paidInLieu: {
          pld: sourceStats.paidInLieu?.pld ?? 0,
          sdv: sourceStats.paidInLieu?.sdv ?? 0,
        },
      };
    } catch (error) {
      console.error("[MyTimeScreen] Error creating displayStats:", error);
      return null;
    }
  }, [selectedYear, currentDisplayYear, timeStats, yearSpecificStats]);

  // Create a safe stats object with guaranteed default values - MOVED BEFORE EARLY RETURNS
  const safeStats = useMemo(() => {
    if (!displayStats) {
      return {
        total: { pld: 0, sdv: 0 },
        rolledOver: { pld: 0, unusedPlds: 0 },
        available: { pld: 0, sdv: 0 },
        requested: { pld: 0, sdv: 0 },
        waitlisted: { pld: 0, sdv: 0 },
        approved: { pld: 0, sdv: 0 },
        paidInLieu: { pld: 0, sdv: 0 },
      };
    }
    return displayStats;
  }, [displayStats]);

  // Added for SDV election - MOVED BEFORE EARLY RETURNS
  const [isSavingSplitWeeks, setIsSavingSplitWeeks] = useState(false);
  const [nextYearSplitWeeks, setNextYearSplitWeeks] = useState<number>(0);
  const now = new Date();
  const currentYear = now.getFullYear();

  // Only show section from Jan 1 to June 30 - MOVED BEFORE EARLY RETURNS
  const isElectionPeriod = useMemo(() => {
    const startDate = new Date(currentYear, 0, 1); // Jan 1
    const endDate = new Date(currentYear, 5, 30); // June 30
    return now >= startDate && now <= endDate;
  }, [currentYear]);

  // Fetch next_vacation_split when component loads - MOVED BEFORE EARLY RETURNS
  useEffect(() => {
    const fetchNextVacationSplit = async () => {
      if (!member) return;

      try {
        const { data, error } = await supabase
          .from("members")
          .select("next_vacation_split")
          .eq("id", member.id)
          .single();

        if (error) throw error;

        if (data) {
          setNextYearSplitWeeks(data.next_vacation_split ?? 0);
        }
      } catch (error) {
        console.error("[MyTimeScreen] Error fetching next_vacation_split:", error);
      }
    };

    fetchNextVacationSplit();
  }, [member]);

  // PHASE 4.2: Updated loading state - MOVED BEFORE EARLY RETURNS
  const isInitialLoading = useMemo(() => {
    if (selectedYear === currentDisplayYear) {
      return isLoading && !timeStats;
    } else {
      return isLoadingYearStats && !yearSpecificStats;
    }
  }, [selectedYear, currentDisplayYear, isLoading, timeStats, isLoadingYearStats, yearSpecificStats]);

  // PHASE 4.2: Updated error state - MOVED BEFORE EARLY RETURNS
  const displayError = useMemo(() => {
    return selectedYear === currentDisplayYear ? error : yearSpecificError;
  }, [selectedYear, currentDisplayYear, error, yearSpecificError]);

  // Handle paid in lieu modal - logic remains the same
  const handlePaidInLieuPress = () => {
    setIsPaidInLieuVisible(true);
  };

  // handleConfirmPaidInLieu - logic remains the same, uses requestPaidInLieu from hook
  const handleConfirmPaidInLieu = async (type: "PLD" | "SDV", selectedDate: Date) => {
    // ... validation logic ...
    try {
      // ... validation ...
      Toast.show({
        type: "info",
        text1: "Processing Request",
        text2: "Please wait...",
        position: "bottom",
        visibilityTime: 2000,
      });
      const success = await requestPaidInLieu(type, selectedDate.toISOString().split("T")[0]); // Pass date string
      if (success) {
        Toast.show({
          type: "success",
          text1: "Request Submitted",
          text2: `Your ${type} PIL request submitted.`,
          position: "bottom",
          visibilityTime: 3000,
        });
      } else {
        // Error handling is now primarily within the store, but can show generic message here
        Toast.show({
          type: "error",
          text1: "Request Failed",
          text2: "Could not submit PIL request. Check available days.",
          position: "bottom",
          visibilityTime: 3000,
        });
      }
    } catch (error) {
      // This catch block might be less likely to trigger if store handles errors
      console.error("[MyTime] Error in handleConfirmPaidInLieu:", error);
      Toast.show({
        type: "error",
        text1: "Request Failed",
        text2: error instanceof Error ? error.message : "An error occurred",
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setIsPaidInLieuVisible(false);
    }
  };

  const handleCancelPaidInLieu = () => {
    setIsPaidInLieuVisible(false);
  };

  // Handle request cancellation - logic remains the same
  const handleCancelRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setIsCancelModalVisible(true);
  };

  const handleCancelSixMonthRequest = (request: TimeOffRequest) => {
    setSelectedRequest(request);
    setIsCancelModalVisible(true);
  };

  // handleConfirmCancel - uses cancelRequest/cancelSixMonthRequest from hook
  const handleConfirmCancel = async () => {
    if (!selectedRequest) return;

    // No need for local isCancellingRequest state, modal will use isSubmittingAction
    // setIsCancellingRequest(true);
    console.log("[MyTime] Attempting to cancel request:", {
      id: selectedRequest.id,
      isSixMonth: selectedRequest.is_six_month_request,
    });

    try {
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
          text2: "Request cancelled successfully.",
          position: "bottom",
          visibilityTime: 3000,
        });
        setIsCancelModalVisible(false);
        setSelectedRequest(null);
      } else {
        // Error primarily handled by store, show generic message
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
      // No need to set local cancelling state
      // setIsCancellingRequest(false);
    }
  };

  // Handle pull-to-refresh - uses refreshData from hook
  const handleRefresh = () => {
    console.log("[MyTimeScreen] User-initiated pull-to-refresh");
    // Check if member exists and use its ID, otherwise use empty string
    refreshData(member?.id || "");
  };

  // Update next_vacation_split and sdv_election in database
  const handleSplitWeeksChange = async (value: string | number | null) => {
    if (!member) return;

    // Convert value to number if it's a string, or use 0 if null
    const numericValue = value === null ? 0 : typeof value === "string" ? parseInt(value) : value;

    setIsSavingSplitWeeks(true);

    try {
      // Calculate SDVs (6 per split week)
      const sdvs = numericValue * 6;

      const { error } = await supabase
        .from("members")
        .update({
          next_vacation_split: numericValue,
          sdv_election: sdvs,
        })
        .eq("id", member.id);

      if (error) throw error;

      setNextYearSplitWeeks(numericValue);

      Toast.show({
        type: "success",
        text1: "Split Weeks Updated",
        text2: `Your split weeks election for next year has been updated to ${numericValue}.`,
        position: "bottom",
        visibilityTime: 3000,
      });

      // Refresh data to update the UI with new values
      refreshData(member.id || "");
    } catch (error) {
      console.error("[MyTimeScreen] Error updating split weeks:", error);
      Toast.show({
        type: "error",
        text1: "Update Failed",
        text2: error instanceof Error ? error.message : "An error occurred updating your split weeks.",
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setIsSavingSplitWeeks(false);
    }
  };

  // PHASE 4.2: Year Selector Component
  const renderYearSelector = () => {
    try {
      const availableYears = [currentDisplayYear, currentDisplayYear + 1];

      return (
        <ThemedView style={styles.yearSelectorContainer}>
          <ThemedText style={styles.yearSelectorLabel}>Viewing Year:</ThemedText>
          <ThemedView style={styles.yearPickerContainer}>
            <Picker
              selectedValue={selectedYear}
              onValueChange={(value) => {
                const newYear = Number(value);
                if (newYear && !isNaN(newYear)) {
                  setSelectedYear(newYear);
                }
              }}
              style={styles.yearPicker}
              dropdownIconColor={Colors[colorScheme ?? "light"].text}
            >
              {availableYears.map((year) => (
                <Picker.Item
                  key={year}
                  label={year === currentDisplayYear ? `${year} (Current)` : `${year}`}
                  value={year}
                />
              ))}
            </Picker>
          </ThemedView>
        </ThemedView>
      );
    } catch (error) {
      console.error("[MyTimeScreen] Error rendering year selector:", error);
      return (
        <ThemedView style={styles.yearSelectorContainer}>
          <ThemedText style={styles.yearSelectorLabel}>Viewing Year: {selectedYear}</ThemedText>
        </ThemedView>
      );
    }
  };

  if (isInitialLoading) {
    return (
      <ThemedView style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? "light"].primary} />
        <ThemedText style={styles.loadingText}>
          {selectedYear !== currentDisplayYear
            ? `Loading ${selectedYear} time off data...`
            : "Loading your time off data..."}
        </ThemedText>
      </ThemedView>
    );
  }

  if (displayError) {
    return (
      <ThemedView style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={Colors[colorScheme ?? "light"].error} />
        <ThemedText style={styles.errorTitle}>
          {selectedYear !== currentDisplayYear ? `Error Loading ${selectedYear} Data` : "Error Loading Data"}
        </ThemedText>
        <ThemedText style={styles.errorDescription}>{displayError}</ThemedText>
        <ThemedTouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            if (selectedYear === currentDisplayYear) {
              refreshData("");
            } else {
              // Retry year-specific data by re-triggering the effect
              setYearSpecificError(null);
              setYearSpecificStats(null);
            }
          }}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </ThemedTouchableOpacity>
      </ThemedView>
    );
  }

  // Replace the renderSplitWeeksSection function to include a message when outside election period
  const renderSplitWeeksSection = () => {
    // Define the split weeks options
    const splitWeeksOptions = [
      { label: "0 Weeks", value: 0 },
      { label: "1 Week (6 SDVs)", value: 1 },
      { label: "2 Weeks (12 SDVs)", value: 2 },
    ];

    return (
      <>
        <ThemedView style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Split Weeks Election for Next Year</ThemedText>
        </ThemedView>
        <ThemedView style={[styles.card, { width: cardWidth }]}>
          <ThemedView style={styles.splitWeeksContainer}>
            {isElectionPeriod ? (
              <>
                <ThemedText style={styles.splitWeeksDescription}>
                  Choose how many vacation weeks you want to split into SDVs for next year. Each split week provides 6
                  SDVs. You can split up to 2 weeks of your vacation time. This election must be made before June 30th.
                </ThemedText>

                <ThemedView style={styles.selectContainer}>
                  <ThemedText style={styles.splitWeeksLabel}>Select split weeks:</ThemedText>
                  <Picker
                    selectedValue={nextYearSplitWeeks ?? 0}
                    onValueChange={(itemValue) => handleSplitWeeksChange(Number(itemValue))}
                    enabled={!isSavingSplitWeeks}
                    style={styles.picker}
                    dropdownIconColor={Colors[colorScheme ?? "light"].text}
                  >
                    {splitWeeksOptions.map((option) => (
                      <Picker.Item key={option.value} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                  {isSavingSplitWeeks && (
                    <ActivityIndicator
                      size="small"
                      color={Colors[colorScheme ?? "light"].primary}
                      style={styles.saveIndicator}
                    />
                  )}
                </ThemedView>
              </>
            ) : (
              <ThemedView style={styles.notActiveContainer}>
                <Feather name="calendar" size={24} color={Colors[colorScheme ?? "light"].textDim} />
                <ThemedText style={styles.notActiveText}>
                  Split weeks election is only available from January 1st through June 30th.
                  {nextYearSplitWeeks !== null
                    ? ` Your current election for next year is ${nextYearSplitWeeks} split weeks (${
                        nextYearSplitWeeks * 6
                      } SDVs).`
                    : ""}
                </ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        </ThemedView>
      </>
    );
  };

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
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {/* Year-specific loading indicator */}
        {selectedYear !== currentDisplayYear && isLoadingYearStats && (
          <ThemedView style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].primary} />
            <ThemedText style={styles.loadingText}>Loading {selectedYear} data...</ThemedText>
          </ThemedView>
        )}

        {/* Rollover Warning Banner - only show for current year */}
        {selectedYear === currentDisplayYear && safeStats && safeStats.rolledOver.unusedPlds > 0 && (
          <RolloverWarningBanner unusedPlds={safeStats.rolledOver.unusedPlds} />
        )}

        {/* Single Day Allocations Card */}
        {(() => {
          try {
            return safeStats ? (
              <ThemedView style={[styles.card, { width: cardWidth }]}>
                <ThemedView style={styles.sectionHeader}>
                  <ThemedText style={styles.sectionTitle}>
                    {selectedYear !== currentDisplayYear
                      ? `${selectedYear} Single Day Allocations`
                      : "Single Day Allocations"}
                  </ThemedText>
                </ThemedView>
                {/* PHASE 4.2: Year Selector - moved to Single Day Allocations section */}
                {renderYearSelector()}
                <ThemedView style={styles.tableHeader}>
                  <ThemedText style={styles.headerLabel}></ThemedText>
                  <ThemedText style={styles.headerValue}>PLD</ThemedText>
                  <ThemedText style={styles.headerValue}>SDV</ThemedText>
                  <ThemedView style={styles.iconContainer} />
                </ThemedView>
                <LeaveRow label="Total" pldValue={safeStats.total.pld} sdvValue={safeStats.total.sdv} />
                <LeaveRow label="Rolled Over" pldValue={safeStats.rolledOver.pld} />
                <LeaveRow label="Available" pldValue={safeStats.available.pld} sdvValue={safeStats.available.sdv} />
                <LeaveRow label="Requested" pldValue={safeStats.requested.pld} sdvValue={safeStats.requested.sdv} />
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
            ) : (
              <ThemedView style={[styles.card, { width: cardWidth, padding: 20, alignItems: "center" }]}>
                <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].primary} />
                <ThemedText style={{ marginTop: 12 }}>Loading time off data...</ThemedText>
              </ThemedView>
            );
          } catch (error) {
            console.error("[MyTimeScreen] Error rendering Single Day Allocations:", error);
            return (
              <ThemedView style={[styles.card, { width: cardWidth, padding: 20, alignItems: "center" }]}>
                <ThemedText style={{ color: Colors[colorScheme ?? "light"].error }}>
                  Error loading time off data. Please try refreshing.
                </ThemedText>
              </ThemedView>
            );
          }
        })()}

        {/* Time Off Requests (Pending/Approved) */}
        <ThemedView style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>
            {selectedYear !== currentDisplayYear
              ? `${selectedYear} Pending/Approved Requests`
              : "Pending/Approved Requests"}
          </ThemedText>
        </ThemedView>
        <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
          {pendingAndApproved.future.length > 0 && (
            <ThemedText style={styles.dateSeparator}>Future Requests</ThemedText>
          )}
          {pendingAndApproved.future.length > 0 ? (
            pendingAndApproved.future.map((request) => (
              <RequestRow
                key={`pa-fut-${request.id}`}
                request={request}
                onCancel={handleCancelRequest}
                onCancelSixMonth={handleCancelSixMonthRequest}
              />
            ))
          ) : (
            <ThemedText style={styles.emptyText}>No future pending or approved requests.</ThemedText>
          )}

          {pendingAndApproved.past.length > 0 && <ThemedText style={styles.dateSeparator}>Past Requests</ThemedText>}
          {pendingAndApproved.past.map((request) => (
            <RequestRow
              key={`pa-past-${request.id}`}
              request={request}
              onCancel={handleCancelRequest}
              onCancelSixMonth={handleCancelSixMonthRequest}
            />
          ))}
        </ThemedView>

        {/* Time Off Requests (Waitlisted) - Conditionally Render Entire Section */}
        {(waitlisted.future.length > 0 || waitlisted.past.length > 0) && (
          <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
            <ThemedView style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>
                {selectedYear !== currentDisplayYear ? `${selectedYear} Waitlisted Requests` : "Waitlisted Requests"}
              </ThemedText>
            </ThemedView>
            {/* Future Waitlisted - Render only if future exists */}
            {waitlisted.future.length > 0 && (
              <>
                <ThemedText style={styles.dateSeparator}>Future Waitlisted</ThemedText>
                {waitlisted.future.map((request) => (
                  <RequestRow
                    key={`wl-fut-${request.id}`}
                    request={request}
                    onCancel={handleCancelRequest}
                    onCancelSixMonth={handleCancelSixMonthRequest}
                  />
                ))}
              </>
            )}

            {/* Past Waitlisted - Render only if past exists */}
            {waitlisted.past.length > 0 && (
              <>
                <ThemedText style={styles.dateSeparator}>Past Waitlisted</ThemedText>
                {waitlisted.past.map((request) => (
                  <RequestRow
                    key={`wl-past-${request.id}`}
                    request={request}
                    onCancel={handleCancelRequest}
                    onCancelSixMonth={handleCancelSixMonthRequest}
                  />
                ))}
              </>
            )}
          </ThemedView>
        )}

        {/* Vacation Summary Card */}
        {vacationStats ? (
          <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24, marginBottom: 24 }]}>
            <ThemedView style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>Vacation Summary</ThemedText>
            </ThemedView>
            <VacationSummaryRow label="Total Weeks" value={vacationStats.totalWeeks} />
            <VacationSummaryRow label="Split Weeks" value={vacationStats.splitWeeks} />
            <VacationSummaryRow label="Weeks to Bid" value={vacationStats.weeksToBid} />
            <VacationSummaryRow label="Approved Weeks" value={vacationStats.approvedWeeks} />
            <VacationSummaryRow
              label="Remaining Weeks (to Bid)"
              value={vacationStats.remainingWeeks}
              highlight={true}
            />
          </ThemedView>
        ) : (
          <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24, padding: 20, alignItems: "center" }]}>
            <ActivityIndicator size="small" color={Colors[colorScheme ?? "light"].primary} />
            <ThemedText style={{ marginTop: 12 }}>Loading vacation data...</ThemedText>
          </ThemedView>
        )}

        {/* Vacation Requests */}
        <ThemedView style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Vacation Requests</ThemedText>
        </ThemedView>
        <ThemedView style={[styles.card, { width: cardWidth, marginTop: 24 }]}>
          {sortedVacationRequests.future.length > 0 && (
            <ThemedText style={styles.dateSeparator}>Future Vacation</ThemedText>
          )}
          {sortedVacationRequests.future.length > 0 ? (
            sortedVacationRequests.future.map((request) => (
              <VacationRequestRow key={`vac-fut-${request.id}`} request={request} />
            ))
          ) : (
            <ThemedText style={styles.emptyText}>No future vacation requests.</ThemedText>
          )}

          {sortedVacationRequests.past.length > 0 && (
            <ThemedText style={styles.dateSeparator}>Past Vacation</ThemedText>
          )}
          {sortedVacationRequests.past.map((request) => (
            <VacationRequestRow key={`vac-past-${request.id}`} request={request} />
          ))}
        </ThemedView>

        {/* Vacation Split weeks for next year member's own election */}
        {renderSplitWeeksSection()}
      </ThemedScrollView>

      {/* Paid In Lieu Modal - No change needed in props passed */}
      <PaidInLieuModal
        isVisible={isPaidInLieuVisible}
        onConfirm={handleConfirmPaidInLieu}
        onCancel={handleCancelPaidInLieu}
        stats={timeStats}
        minDate={dateRange.minDate}
        maxDate={dateRange.maxDate}
      />

      {/* Cancel Request Modal - Update isLoading prop */}
      <CancelRequestModal
        isVisible={isCancelModalVisible}
        request={selectedRequest}
        onConfirm={handleConfirmCancel}
        onCancel={() => {
          setIsCancelModalVisible(false);
          setSelectedRequest(null);
        }}
        isLoading={isSubmittingAction} // Use isSubmittingAction from the hook
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
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
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
    backgroundColor: Colors.dark.card,
    borderBottomEndRadius: 12,
    borderBottomStartRadius: 12,
  },
  label: {
    flex: 2,
    fontSize: 16,
  },
  valueContainer: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  cancelButton: {
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  requestInfo: {
    flex: 1,
    backgroundColor: Colors.dark.card,
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    backgroundColor: Colors.dark.card,
  },
  requestDate: {
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: Colors.dark.card,
  },
  requestDetails: {
    fontSize: 14,
    opacity: 0.7,
    backgroundColor: Colors.dark.card,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.dark.card,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    backgroundColor: Colors.dark.card,
  },
  waitlistPosition: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.dark.warning,
    marginTop: 4,
    backgroundColor: Colors.dark.card,
  },
  subsectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  date: {
    fontSize: 16,
    fontWeight: "600",
  },
  typeContainer: {
    flex: 1,
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  vacationValue: {
    fontSize: 16,
    fontWeight: "500",
    backgroundColor: Colors.dark.card,
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
  errorDescription: {
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
  splitWeeksContainer: {
    padding: 16,
    alignItems: "center",
  },
  splitWeeksDescription: {
    fontSize: 16,
    marginBottom: 16,
  },
  selectContainer: {
    width: "100%",
    maxWidth: 250,
    minWidth: 150,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.card,
    padding: 4,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        height: 120,
      },
      android: {
        minHeight: 120,
        paddingHorizontal: 0,
        flexDirection: "column",
      },
    }),
  },
  picker: {
    backgroundColor: Colors.dark.card,
    color: Colors.dark.text,
    borderColor: Colors.dark.border,
    borderWidth: 1,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        height: 60,
        cursor: "pointer",
      },
      android: {
        height: 65,
        width: "100%",
        cursor: "pointer",
      },
      web: {
        height: 40,
        paddingRight: 24,
        cursor: "pointer",
      },
    }),
  },
  saveIndicator: {
    marginLeft: 12,
  },
  notActiveContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.background + "20",
  },
  notActiveText: {
    marginLeft: 12,
    fontSize: 16,
    flex: 1,
  },
  splitWeeksLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  // PHASE 4.2: Year selector styles
  yearSelectorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 2,
    width: "100%",
    maxWidth: 600,
  },
  yearSelectorLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 12,
  },
  yearPickerContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
  },
  yearPicker: {
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
    height: 40,
    borderColor: Colors.dark.border,
    ...Platform.select({
      ios: {
        height: 40,
      },
      android: {
        height: 50,
      },
      web: {
        height: 40,
        cursor: "pointer",
      },
    }),
  },
});
