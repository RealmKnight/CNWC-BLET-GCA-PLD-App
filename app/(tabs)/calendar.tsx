import React, { useEffect, useState, useMemo } from "react";
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
  View,
  AppState,
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
import { useZoneCalendarStore } from "@/store/zoneCalendarStore";
import { Member } from "@/types/member";
import { useMyTime } from "@/hooks/useMyTime";

type ColorScheme = keyof typeof Colors;

interface RequestDialogProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (leaveType: "PLD" | "SDV") => void;
  selectedDate: string;
  allotments: {
    max: number;
    current: number;
  };
  requests: DayRequest[];
  zoneId?: number;
  isZoneSpecific?: boolean;
}

function RequestDialog({
  isVisible,
  onClose,
  onSubmit,
  selectedDate,
  allotments,
  requests: allRequests,
  zoneId,
  isZoneSpecific = false,
}: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { stats } = useMyTime();

  // Filter active requests directly from props instead of using store selector
  const activeRequests = useMemo(() => {
    return allRequests.filter(
      (r) =>
        (r.status === "approved" || r.status === "pending" || r.status === "waitlisted") &&
        (!zoneId || r.zone_id === zoneId)
    );
  }, [allRequests, zoneId]);

  // Memoize derived values
  const currentAllotment = useMemo(
    () => ({
      max: allotments.max,
      current: activeRequests.length,
    }),
    [allotments.max, activeRequests.length]
  );

  const isFull = currentAllotment.current >= currentAllotment.max;

  // Memoize sorted requests to prevent unnecessary re-renders
  const sortedRequests = useMemo(() => {
    const statusPriority: Record<string, number> = {
      approved: 0,
      pending: 1,
      waitlisted: 2,
    };

    return [...activeRequests].sort((a, b) => {
      const aStatus = statusPriority[a.status] ?? 999;
      const bStatus = statusPriority[b.status] ?? 999;

      if (aStatus !== bStatus) return aStatus - bStatus;

      if (a.status === "waitlisted" && b.status === "waitlisted") {
        return (a.waitlist_position || 0) - (b.waitlist_position || 0);
      }

      return new Date(a.requested_at || "").getTime() - new Date(b.requested_at || "").getTime();
    });
  }, [activeRequests]);

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.modalOverlay}>
        <View style={dialogStyles.modalContent}>
          <ThemedText style={dialogStyles.modalTitle}>Request Day Off - {selectedDate}</ThemedText>

          <View style={dialogStyles.allotmentContainer}>
            <ThemedText style={dialogStyles.allotmentInfo}>
              {currentAllotment.current}/{currentAllotment.max} spots filled
            </ThemedText>
          </View>

          <View style={dialogStyles.remainingDaysContainer}>
            <ThemedText style={dialogStyles.remainingDaysText}>
              Available PLD Days: {stats?.available.pld ?? 0}
            </ThemedText>
            <ThemedText style={dialogStyles.remainingDaysText}>
              Available SDV Days: {stats?.available.sdv ?? 0}
            </ThemedText>
          </View>

          <ScrollView style={dialogStyles.requestList}>
            {sortedRequests.map((request, index) => (
              <View key={request.id} style={dialogStyles.requestSpot}>
                <ThemedText style={dialogStyles.spotNumber}>#{index + 1}</ThemedText>
                <View style={dialogStyles.spotInfo}>
                  <ThemedText>
                    {request.member.first_name} {request.member.last_name}
                  </ThemedText>
                  <ThemedText
                    style={[
                      dialogStyles.requestStatus,
                      request.status === "approved" && dialogStyles.approvedStatus,
                      request.status === "waitlisted" && dialogStyles.waitlistedStatus,
                    ]}
                  >
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    {request.status === "waitlisted" && request.waitlist_position
                      ? ` #${request.waitlist_position}`
                      : ""}
                  </ThemedText>
                </View>
              </View>
            ))}
            {Array.from({ length: currentAllotment.max - sortedRequests.length }).map((_, index) => (
              <View key={`empty-${index}`} style={dialogStyles.requestSpot}>
                <ThemedText style={dialogStyles.spotNumber}>#{sortedRequests.length + index + 1}</ThemedText>
                <ThemedText style={dialogStyles.emptySpot}>Available</ThemedText>
              </View>
            ))}
          </ScrollView>

          <View style={dialogStyles.modalButtons}>
            <TouchableOpacity style={[dialogStyles.modalButton, dialogStyles.cancelButton]} onPress={onClose}>
              <ThemedText style={dialogStyles.modalButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dialogStyles.modalButton, dialogStyles.submitButton, isFull && dialogStyles.waitlistButton]}
              onPress={() => onSubmit("PLD")}
            >
              <ThemedText style={dialogStyles.modalButtonText}>
                {isFull ? "Join Waitlist (PLD)" : "Request PLD"}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[dialogStyles.modalButton, dialogStyles.submitButton, isFull && dialogStyles.waitlistButton]}
              onPress={() => onSubmit("SDV")}
            >
              <ThemedText style={dialogStyles.modalButtonText}>
                {isFull ? "Join Waitlist (SDV)" : "Request SDV"}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface SubscriptionHandle {
  unsubscribe: () => void;
}

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { user, session } = useAuth();
  const { member, division } = useUserStore();
  const { divisionsWithZones } = useZoneCalendarStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [dataChanged, setDataChanged] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const REFRESH_COOLDOWN = 500; // milliseconds

  // Add refs to track loading state and prevent duplicate loads
  const isLoadingRef = React.useRef(false);
  const loadPromiseRef = React.useRef<Promise<void> | null>(null);

  // Force the date to be the actual current date, not system date
  const [currentDate, setCurrentDate] = useState("");
  // Add a key to force re-render
  const [calendarKey, setCalendarKey] = useState(0);

  // Get member's zone if division uses zone calendars
  const memberZoneId = useMemo(() => {
    if (!division || !member?.zone) return undefined;
    const hasZoneCalendars = divisionsWithZones[division];
    const memberRecord = member as Member;
    return hasZoneCalendars ? memberRecord.zone_id : undefined;
  }, [division, member?.zone, divisionsWithZones]);

  const {
    selectedDate,
    requests,
    submitRequest,
    setSelectedDate,
    allotments,
    yearlyAllotments,
    loadInitialData,
    isInitialized,
  } = useCalendarStore();

  // Calculate date range for fetching data
  const dateRange = useMemo(() => {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
    return {
      start: format(now, "yyyy-MM-dd"),
      end: format(endDate, "yyyy-MM-dd"),
    };
  }, []);

  // Add ref to track subscription
  const subscriptionRef = React.useRef<SubscriptionHandle | null>(null);

  // Add loading timeout ref
  const loadingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const MAX_LOADING_TIME = 10000; // 10 seconds maximum loading time

  // Coordinated data loading function with timeout
  const loadDataSafely = async () => {
    // If already loading, return existing promise
    if (isLoadingRef.current && loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    // If no user or division, skip load
    if (!user || !division) {
      setIsLoading(false);
      return;
    }

    // Clear any existing loading timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    // Set a timeout to clear loading state if it takes too long
    loadingTimeoutRef.current = setTimeout(() => {
      console.log("[CalendarScreen] Loading timeout reached, forcing state clear");
      isLoadingRef.current = false;
      setIsLoading(false);
      loadPromiseRef.current = null;
    }, MAX_LOADING_TIME);

    loadPromiseRef.current = loadInitialData(dateRange.start, dateRange.end)
      .catch((error) => {
        console.error("[CalendarScreen] Error loading data:", error);
        setError("Failed to load calendar data");
      })
      .finally(() => {
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        isLoadingRef.current = false;
        setIsLoading(false);
        loadPromiseRef.current = null;
      });

    return loadPromiseRef.current;
  };

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      console.log("[CalendarScreen] App state changed:", { from: appState, to: nextAppState });

      if (appState.match(/inactive|background/) && nextAppState === "active") {
        console.log("[CalendarScreen] App came to foreground, checking session and data");

        try {
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (currentSession && user) {
            console.log("[CalendarScreen] Session valid, refreshing data");
            const now = Date.now();
            if (now - lastRefreshTime > REFRESH_COOLDOWN) {
              await loadDataSafely();
              setLastRefreshTime(now);
              setCalendarKey((prev) => prev + 1);
            }
          }
        } catch (error) {
          console.error("[CalendarScreen] Error checking session:", error);
          // Clear loading state on error
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }

      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
      // Clear any pending timeouts
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [appState, user, lastRefreshTime]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clear all loading states and timeouts
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      isLoadingRef.current = false;
      setIsLoading(false);
      loadPromiseRef.current = null;
    };
  }, []);

  // Load initial data when component mounts or auth state changes
  useEffect(() => {
    loadDataSafely();
  }, [user, division]);

  // Handle visibility changes (app focus/background)
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (now - lastRefreshTime > REFRESH_COOLDOWN && user && division) {
        console.log("[CalendarScreen] Screen focused, refreshing data");
        loadDataSafely();
        setCalendarKey((prev) => prev + 1);
        setLastRefreshTime(now);
      }

      return () => {
        setSelectedDate(null);
      };
    }, [user, division, lastRefreshTime])
  );

  // Set up realtime subscriptions and cleanup
  useEffect(() => {
    if (!user || !division) return;

    console.log("[CalendarScreen] Setting up realtime subscriptions");
    const setupSubscriptions = () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
      subscriptionRef.current = setupCalendarSubscriptions();
    };

    setupSubscriptions();

    // Add listener for realtime updates with debounce
    let debounceTimeout: NodeJS.Timeout;

    const unsubscribe = useCalendarStore.subscribe((state, prevState) => {
      if (
        JSON.stringify(state.requests) !== JSON.stringify(prevState.requests) ||
        JSON.stringify(state.allotments) !== JSON.stringify(prevState.allotments)
      ) {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
          if (!isLoadingRef.current) {
            console.log("[CalendarScreen] Data changed in store, marking for refresh");
            setDataChanged(true);
          }
        }, 100);
      }
    });

    // Periodically check connection status and resubscribe if needed
    const connectionCheckInterval = setInterval(async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (currentSession && (!subscriptionRef.current || dataChanged)) {
          console.log("[CalendarScreen] Reestablishing realtime subscriptions");
          setupSubscriptions();
          setDataChanged(false);
        }
      } catch (error) {
        console.error("[CalendarScreen] Error checking connection:", error);
      }
    }, 30000);

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      clearInterval(connectionCheckInterval);
      setSelectedDate(null);
    };
  }, [user, division]);

  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (!selectedDate) return;

    try {
      await submitRequest(selectedDate, leaveType, memberZoneId);
      setRequestDialogVisible(false);
    } catch (err) {
      console.error("[CalendarScreen] Error submitting request:", err);
      Alert.alert("Error", "Failed to submit request");
    }
  };

  const handleTodayPress = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (selectedDate !== today) {
      setSelectedDate(today);
    }
  };

  // Memoize the request dialog props
  const requestDialogProps = useMemo(() => {
    if (!selectedDate) return null;

    const dateKey = memberZoneId ? `${selectedDate}_${memberZoneId}` : selectedDate;
    const yearKey = memberZoneId
      ? `${new Date(selectedDate).getFullYear()}_${memberZoneId}`
      : new Date(selectedDate).getFullYear().toString();

    const maxAllotment = allotments[dateKey] ?? yearlyAllotments[yearKey] ?? 0;
    const dateRequests = requests[dateKey] || [];
    const currentAllotmentCount = dateRequests.filter(
      (r: DayRequest) => r.status === "approved" || r.status === "pending"
    ).length;

    return {
      isVisible: requestDialogVisible,
      onClose: () => setRequestDialogVisible(false),
      onSubmit: handleRequestSubmit,
      selectedDate,
      allotments: {
        max: maxAllotment,
        current: currentAllotmentCount,
      },
      requests: dateRequests as DayRequest[],
      zoneId: memberZoneId,
      isZoneSpecific: !!memberZoneId,
    };
  }, [requestDialogVisible, selectedDate, memberZoneId, allotments, yearlyAllotments, requests, handleRequestSubmit]);

  if (!isInitialized) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <ThemedText>Initializing calendar...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Calendar current={selectedDate || undefined} zoneId={memberZoneId} isZoneSpecific={!!memberZoneId} />
      </ScrollView>

      {selectedDate && (
        <TouchableOpacity style={styles.requestButton} onPress={() => setRequestDialogVisible(true)}>
          <ThemedText style={styles.requestButtonText}>Request Day Off</ThemedText>
        </TouchableOpacity>
      )}

      {requestDialogProps && <RequestDialog {...requestDialogProps} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  scrollView: {
    flex: 1,
  } as ViewStyle,
  requestButton: {
    backgroundColor: Colors.light.tint,
    padding: 16,
    margin: 16,
    borderRadius: 8,
    alignItems: "center",
  } as ViewStyle,
  requestButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  } as TextStyle,
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  errorText: {
    color: Colors.light.error,
    fontWeight: "600",
  } as TextStyle,
});

const dialogStyles = StyleSheet.create({
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
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 8,
    marginTop: 16,
  } as ViewStyle,
  modalButton: {
    flex: 1,
    minHeight: 44,
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  modalButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
    lineHeight: 16,
  } as TextStyle,
  cancelButton: {
    backgroundColor: Colors.dark.border,
  } as ViewStyle,
  submitButton: {
    backgroundColor: Colors.light.primary,
  } as ViewStyle,
  waitlistButton: {
    backgroundColor: Colors.light.warning,
  } as ViewStyle,
  requestList: {
    width: "100%",
    maxHeight: Platform.OS === "web" ? "50%" : 300,
    marginVertical: 16,
  } as ViewStyle,
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
  requestStatus: {
    marginLeft: 8,
    fontWeight: "500",
  } as TextStyle,
  emptySpot: {
    color: Colors.light.success,
    fontStyle: "italic",
  } as TextStyle,
  allotmentInfo: {
    marginBottom: 16,
  } as TextStyle,
  approvedStatus: {
    color: Colors.light.success,
  } as TextStyle,
  waitlistedStatus: {
    color: Colors.light.error,
  } as TextStyle,
  allotmentContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  } as ViewStyle,
  remainingDaysContainer: {
    width: "100%",
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    gap: 8,
  } as ViewStyle,
  remainingDaysText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.light.success,
  } as TextStyle,
});
