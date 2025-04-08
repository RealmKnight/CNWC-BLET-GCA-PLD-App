import React, { useEffect, useState, useMemo, useRef } from "react";
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
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
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
  const { member } = useUserStore();

  // Filter active requests directly from props instead of using store selector
  const activeRequests = useMemo(() => {
    return allRequests.filter(
      (r) =>
        (r.status === "approved" || r.status === "pending" || r.status === "waitlisted") &&
        (!zoneId || r.zone_id === zoneId)
    );
  }, [allRequests, zoneId]);

  // Check if current user already has a request for this date
  const hasExistingRequest = useMemo(() => {
    return activeRequests.some((r) => r.member.id === member?.id);
  }, [activeRequests, member?.id]);

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
          {hasExistingRequest && (
            <View style={dialogStyles.messageContainer}>
              <ThemedText style={[dialogStyles.allotmentInfo, { color: Colors[theme].error }]}>
                You already have a request for this date
              </ThemedText>
            </View>
          )}

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
              style={[
                dialogStyles.modalButton,
                dialogStyles.submitButton,
                isFull && dialogStyles.waitlistButton,
                hasExistingRequest && dialogStyles.disabledButton,
              ]}
              onPress={() => onSubmit("PLD")}
              disabled={hasExistingRequest}
            >
              <ThemedText style={dialogStyles.modalButtonText}>
                {isFull ? "Join Waitlist (PLD)" : "Request PLD"}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                dialogStyles.modalButton,
                dialogStyles.submitButton,
                isFull && dialogStyles.waitlistButton,
                hasExistingRequest && dialogStyles.disabledButton,
              ]}
              onPress={() => onSubmit("SDV")}
              disabled={hasExistingRequest}
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
  const { usesZoneCalendars, zones: adminZones } = useAdminCalendarManagementStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [dataChanged, setDataChanged] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const REFRESH_COOLDOWN = 2000; // 2 seconds cooldown

  // --- State for calculated zone ID ---
  const [calculatedZoneId, setCalculatedZoneId] = useState<number | null | undefined>(undefined);
  const [isZoneIdCalculationDone, setIsZoneIdCalculationDone] = useState(false);

  // --- Refs ---
  const isLoadingRef = useRef(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const mountTimeRef = useRef(Date.now());
  const lastRefreshTimeRef = useRef(Date.now());
  const MAX_LOADING_TIME = 10000; // 10 seconds maximum loading time

  const {
    selectedDate,
    requests,
    submitRequest,
    userSubmitRequest,
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

  // Coordinated data loading function with timeout
  const loadDataSafely = async () => {
    if (isLoadingRef.current && loadPromiseRef.current) {
      console.log("[CalendarScreen] Already loading, returning existing promise");
      return loadPromiseRef.current;
    }

    if (!user || !division) {
      console.log("[CalendarScreen] No user or division, skipping load");
      setIsLoading(false);
      return;
    }

    // Don't reset zone calculation if we already have it
    const shouldResetZoneCalculation = calculatedZoneId === undefined;
    console.log("[CalendarScreen] Starting data load:", {
      hasExistingZoneId: calculatedZoneId !== undefined,
      currentZoneId: calculatedZoneId,
      shouldResetCalculation: shouldResetZoneCalculation,
    });

    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    loadingTimeoutRef.current = setTimeout(() => {
      console.log("[CalendarScreen] Loading timeout reached, forcing state clear");
      isLoadingRef.current = false;
      loadPromiseRef.current = null;
      setIsLoading(false);
      if (shouldResetZoneCalculation) {
        setIsZoneIdCalculationDone(true);
      }
    }, MAX_LOADING_TIME);

    try {
      if (shouldResetZoneCalculation) {
        setIsZoneIdCalculationDone(false);
        setCalculatedZoneId(undefined);
      }

      await loadInitialData(dateRange.start, dateRange.end);
      console.log("[CalendarScreen] Data loaded successfully");
      setIsLoading(false);
    } catch (error) {
      console.error("[CalendarScreen] Error loading data:", error);
      setError("Failed to load calendar data");
      setIsLoading(false);
    } finally {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      isLoadingRef.current = false;
      loadPromiseRef.current = null;
    }
  };

  // Effect to calculate zone ID using adminZones
  useEffect(() => {
    const currentDivisionZones = division ? adminZones[division] : [];

    if (isInitialized && division && member && usesZoneCalendars !== undefined) {
      console.log("[CalendarScreen useEffect] Calculating zone ID:", {
        division,
        memberZone: member.zone,
        usesZoneCalendars,
        zonesAvailable: currentDivisionZones && currentDivisionZones.length > 0,
        zonesFromAdminStore: currentDivisionZones,
        currentCalculatedId: calculatedZoneId,
      });

      // Only recalculate if we don't have a valid zone ID
      if (calculatedZoneId === undefined) {
        let finalZoneId: number | null = null;
        if (usesZoneCalendars && member.zone && currentDivisionZones && currentDivisionZones.length > 0) {
          const memberZoneClean = member.zone.trim().toLowerCase();
          const matchedZone = currentDivisionZones.find((z) => z.name.trim().toLowerCase() === memberZoneClean);
          if (matchedZone) {
            finalZoneId = matchedZone.id;
            console.log(`[CalendarScreen useEffect] Matched zone: ${member.zone} -> ID: ${finalZoneId}`);
          } else {
            console.warn(
              `[CalendarScreen useEffect] Member zone "${member.zone}" not found in division zones from admin store.`
            );
          }
        } else {
          console.log("[CalendarScreen useEffect] Not using zones or required data missing for calculation.");
        }

        setCalculatedZoneId(finalZoneId);
        setIsZoneIdCalculationDone(true);
        console.log("[CalendarScreen useEffect] Zone ID calculation complete:", finalZoneId);
      } else {
        console.log("[CalendarScreen useEffect] Keeping existing zone ID:", calculatedZoneId);
      }
    } else {
      if (!isInitialized) {
        setIsZoneIdCalculationDone(false);
        setCalculatedZoneId(undefined);
        console.log("[CalendarScreen useEffect] Dependencies not ready for zone calculation:", {
          isInitialized,
          hasDivision: !!division,
          hasMember: !!member,
          usesZoneCalendars,
          adminZonesAvailable: !!(currentDivisionZones && currentDivisionZones.length > 0),
        });
      }
    }
  }, [isInitialized, adminZones, usesZoneCalendars, member?.zone, division, calculatedZoneId]);

  // Initial load effect
  useEffect(() => {
    if (!isInitialized && user && division) {
      console.log("[CalendarScreen] Not initialized, loading initial data");
      loadDataSafely();
      mountTimeRef.current = Date.now();
    }
  }, [isInitialized, user, division]);

  // Handle focus events with proper state reset and cooldown
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (now - mountTimeRef.current < REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, skipping refresh (recent mount)");
        return;
      }

      if (isInitialized && now - lastRefreshTimeRef.current > REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, refreshing data");
        loadDataSafely();
        lastRefreshTimeRef.current = now;
      } else {
        console.log("[CalendarScreen] Screen focused, skipping refresh:", {
          isInitialized,
          timeSinceLastRefresh: now - lastRefreshTimeRef.current,
          cooldown: REFRESH_COOLDOWN,
        });
      }
    }, [isInitialized, loadDataSafely])
  );

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

  // Modify handleRequestSubmit to handle null zoneId
  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (!selectedDate) return;

    // Use the calculated ID from state, map null to undefined for the store function
    const zoneIdToSubmit = calculatedZoneId === null ? undefined : calculatedZoneId;

    try {
      console.log("[CalendarScreen] Submitting request:", {
        date: selectedDate,
        type: leaveType,
        zoneId: zoneIdToSubmit,
      });
      await userSubmitRequest(selectedDate, leaveType, zoneIdToSubmit);
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

  // Memoize the request dialog props, handling null zoneId
  const requestDialogProps = useMemo(() => {
    if (!selectedDate || !isZoneIdCalculationDone) return null;

    const effectiveZoneId = calculatedZoneId;
    // Map null to undefined for the dialog prop
    const dialogZoneIdProp = effectiveZoneId === null ? undefined : effectiveZoneId;

    const dateKey = effectiveZoneId ? `${selectedDate}_${effectiveZoneId}` : selectedDate;
    const yearKey = effectiveZoneId
      ? `${new Date(selectedDate).getFullYear()}_${effectiveZoneId}`
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
      zoneId: dialogZoneIdProp, // Pass undefined instead of null
      isZoneSpecific: !!effectiveZoneId,
    };
  }, [
    requestDialogVisible,
    selectedDate,
    isZoneIdCalculationDone,
    calculatedZoneId,
    allotments,
    yearlyAllotments,
    requests,
    handleRequestSubmit,
  ]);

  // --- RENDER LOGIC ---

  // Modify the loading check in render
  if (!isInitialized || (!isZoneIdCalculationDone && isLoading)) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
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

  if (!division) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>No division context available.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Calendar
          current={selectedDate || undefined}
          zoneId={calculatedZoneId ?? undefined}
          isZoneSpecific={!!calculatedZoneId}
        />
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
    textAlign: "center",
  } as TextStyle,
  disabledButton: {
    opacity: 0.5,
  } as ViewStyle,
  messageContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  } as ViewStyle,
});
