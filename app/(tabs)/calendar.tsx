import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
  Animated,
  Button,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "@/components/Calendar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns-tz";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useFocusEffect } from "@react-navigation/native";
import { Member } from "@/types/member";
import { useMyTime } from "@/hooks/useMyTime";
import Toast from "react-native-toast-message";

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
}

function RequestDialog({
  isVisible,
  onClose,
  onSubmit,
  selectedDate,
  allotments,
  requests: allRequests,
}: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { stats } = useMyTime();
  const { member } = useUserStore();

  const activeRequests = useMemo(() => {
    return allRequests.filter((r) => r.status === "approved" || r.status === "pending" || r.status === "waitlisted");
  }, [allRequests]);

  const hasExistingRequest = useMemo(() => {
    return activeRequests.some((r) => r.member.id === member?.id);
  }, [activeRequests, member?.id]);

  const currentAllotment = useMemo(
    () => ({
      max: allotments.max,
      current: activeRequests.length,
    }),
    [allotments.max, activeRequests.length]
  );

  const isFull = currentAllotment.current >= currentAllotment.max;

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
            {isFull && activeRequests.length > currentAllotment.max && (
              <ThemedText style={dialogStyles.waitlistInfo}>
                Waitlist: {activeRequests.length - currentAllotment.max}
              </ThemedText>
            )}
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
            {Array.from({ length: Math.max(0, currentAllotment.max - sortedRequests.length) }).map((_, index) => (
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
                (stats?.available.pld ?? 0) <= 0 && !isFull && dialogStyles.disabledButton,
              ]}
              onPress={() => onSubmit("PLD")}
              disabled={hasExistingRequest || ((stats?.available.pld ?? 0) <= 0 && !isFull)}
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
                (stats?.available.sdv ?? 0) <= 0 && !isFull && dialogStyles.disabledButton,
              ]}
              onPress={() => onSubmit("SDV")}
              disabled={hasExistingRequest || ((stats?.available.sdv ?? 0) <= 0 && !isFull)}
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

interface DateControlsProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
  onCurrentDateChange: (date: string) => void;
}

function DateControls({ selectedDate, onDateChange, onCurrentDateChange }: DateControlsProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [showPicker, setShowPicker] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const today = format(new Date(), "yyyy-MM-dd");
  const isToday = selectedDate === today;

  const handleDateChange = (event: any, date?: Date) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }

    if (Platform.OS === "ios" && event.type === "dismissed") {
      return;
    }

    if (date) {
      const formattedDate = format(date, "yyyy-MM-dd");
      onCurrentDateChange(formattedDate);
      onDateChange(formattedDate);
      if (Platform.OS === "ios") {
        setShowPicker(false);
      }
    } else if (Platform.OS === "ios") {
      setShowPicker(false);
    }
  };

  const handleWebDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    if (date) {
      onCurrentDateChange(date);
      onDateChange(date);
    } else {
      onDateChange(null);
    }
  };

  const handleTodayPress = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.5, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    onCurrentDateChange(today);
    onDateChange(today);
  };

  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);

  return (
    <View style={controlStyles.container}>
      <View style={controlStyles.datePickerContainer}>
        {Platform.OS === "web" ? (
          <input
            type="date"
            value={selectedDate || ""}
            min={format(minDate, "yyyy-MM-dd")}
            onChange={handleWebDateChange}
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: Colors.dark.card,
              border: `1px solid ${Colors.dark.border}`,
              color: Colors.dark.text,
              outline: "none",
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
          />
        ) : (
          <>
            <TouchableOpacity style={controlStyles.dateButton} onPress={() => setShowPicker(true)}>
              <ThemedText>
                {selectedDate ? format(new Date(selectedDate + "T00:00:00"), "MMM d, yyyy") : "Select Date"}
              </ThemedText>
            </TouchableOpacity>
            {showPicker && (
              <DateTimePicker
                value={selectedDate ? new Date(selectedDate + "T00:00:00") : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDateChange}
                minimumDate={minDate}
                {...(Platform.OS === "ios" && { themeVariant: theme })}
              />
            )}
          </>
        )}
      </View>
      <Animated.View style={{ opacity: fadeAnim }}>
        <TouchableOpacity
          style={[controlStyles.todayButton, isToday && controlStyles.todayButtonDisabled]}
          onPress={handleTodayPress}
          disabled={isToday}
        >
          <ThemedText style={controlStyles.todayButtonText}>Today</ThemedText>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const controlStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    ...(Platform.OS === "web" && {
      position: "sticky",
      top: 0,
      zIndex: 1,
    }),
  } as ViewStyle,
  datePickerContainer: Platform.select({
    web: {
      marginRight: 16,
    },
    default: {},
  }) as ViewStyle,
  dateButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  } as ViewStyle,
  todayButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  } as ViewStyle,
  todayButtonDisabled: {
    opacity: 0.5,
  } as ViewStyle,
  todayButtonText: {
    color: "white",
    fontWeight: "600",
  } as TextStyle,
});

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { user, session } = useAuth();
  const { member, division } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const [currentDate, setCurrentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const REFRESH_COOLDOWN = 2000;

  const isLoadingRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const lastRefreshTimeRef = useRef(Date.now());

  const {
    selectedDate,
    requests,
    userSubmitRequest,
    setSelectedDate,
    allotments,
    yearlyAllotments,
    loadInitialData,
    isInitialized,
  } = useCalendarStore();

  console.log("[CalendarScreen Check] User:", user ? user.id : "null/undefined");
  console.log("[CalendarScreen Check] Member:", member ? member.id : "null/undefined");
  console.log("[CalendarScreen Check] Member Calendar ID:", member?.calendar_id);

  const loadDataSafely = useCallback(async () => {
    if (isLoadingRef.current) {
      console.log("[CalendarScreen] Already loading data.");
      return;
    }

    if (!user || !member?.calendar_id) {
      console.log("[CalendarScreen] No user or member calendar_id, skipping load.");
      setIsLoading(false);
      setError("User information or assigned calendar missing.");
      return;
    }

    console.log("[CalendarScreen] Starting data load for calendar:", member.calendar_id);
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const endDate = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
      const dateRange = {
        start: format(now, "yyyy-MM-dd"),
        end: format(endDate, "yyyy-MM-dd"),
      };

      await loadInitialData(dateRange.start, dateRange.end);
      console.log("[CalendarScreen] Data loaded successfully via store.");
    } catch (err) {
      console.error("[CalendarScreen] Error loading data via store:", err);
      setError(err instanceof Error ? err.message : "Failed to load calendar data");
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [user, member?.calendar_id, loadInitialData]);

  useEffect(() => {
    if (!isInitialized && user && member?.calendar_id) {
      console.log("[CalendarScreen] Initializing calendar data...");
      loadDataSafely();
      mountTimeRef.current = Date.now();
    } else if (!user || !member?.calendar_id) {
      setIsLoading(false);
      setError("User or Calendar information not available.");
      console.log("[CalendarScreen] Resetting due to missing user/calendar ID.");
    }
  }, [isInitialized, user, member?.calendar_id, loadDataSafely]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - mountTimeRef.current < REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, skipping refresh (recent mount).");
        return;
      }
      if (isInitialized && now - lastRefreshTimeRef.current > REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, refreshing data.");
        loadDataSafely();
        lastRefreshTimeRef.current = now;
      } else if (!isInitialized && user && member?.calendar_id) {
        console.log("[CalendarScreen] Screen focused, attempting initial load.");
        loadDataSafely();
        lastRefreshTimeRef.current = now;
      } else {
        console.log("[CalendarScreen] Screen focused, skipping refresh:", {
          isInitialized,
          timeSinceLastRefresh: now - lastRefreshTimeRef.current,
          cooldown: REFRESH_COOLDOWN,
          isLoading: isLoadingRef.current,
        });
      }
    }, [isInitialized, loadDataSafely, user, member?.calendar_id])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      console.log("[CalendarScreen] App state changed:", { from: appState, to: nextAppState });

      if (appState.match(/inactive|background/) && nextAppState === "active") {
        console.log("[CalendarScreen] App came to foreground, checking session and data");

        try {
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();

          if (currentSession && user && member?.calendar_id && isInitialized) {
            console.log("[CalendarScreen] Session valid, refreshing data on foreground.");
            const now = Date.now();
            if (now - lastRefreshTime > REFRESH_COOLDOWN) {
              await loadDataSafely();
              setLastRefreshTime(now);
            } else {
              console.log("[CalendarScreen] Skipping refresh on foreground (cooldown).");
            }
          } else if (!isInitialized && currentSession && user && member?.calendar_id) {
            console.log("[CalendarScreen] Attempting initial load on foreground.");
            await loadDataSafely();
            setLastRefreshTime(Date.now());
          }
        } catch (error) {
          console.error("[CalendarScreen] Error checking session/refreshing on foreground:", error);
          setError("Failed to refresh data on resume.");
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, user, member?.calendar_id, isInitialized, lastRefreshTime, loadDataSafely]);

  useEffect(() => {
    return () => {
      isLoadingRef.current = false;
    };
  }, []);

  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (!selectedDate) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "No date selected.",
        position: "bottom",
        visibilityTime: 3000,
      });
      return;
    }

    try {
      console.log("[CalendarScreen] Submitting request via store:", {
        date: selectedDate,
        type: leaveType,
      });
      await userSubmitRequest(selectedDate, leaveType);
      setRequestDialogVisible(false);
      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Request submitted successfully!",
        position: "bottom",
        visibilityTime: 3000,
      });
    } catch (err) {
      console.error("[CalendarScreen] Error submitting request:", err);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err instanceof Error ? err.message : "Failed to submit request",
        position: "bottom",
        visibilityTime: 3000,
      });
    }
  };

  const handleTodayPress = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (selectedDate !== today) {
      setSelectedDate(today);
      setCurrentDate(today);
    }
  };

  const requestDialogProps = useMemo(() => {
    if (!selectedDate) return null;

    const dateKey = selectedDate;
    const yearKey = new Date(selectedDate).getFullYear();

    const maxAllotment = allotments[dateKey] ?? yearlyAllotments[yearKey] ?? 0;
    const dateRequests = requests[dateKey] || [];

    const currentAllotmentCount = dateRequests.filter(
      (r: DayRequest) => r.status === "approved" || r.status === "pending" || r.status === "waitlisted"
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
      requests: dateRequests,
    };
  }, [requestDialogVisible, selectedDate, allotments, yearlyAllotments, requests, handleRequestSubmit]);

  if (!isInitialized && isLoading) {
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
        <Button title="Retry" onPress={() => loadDataSafely()} color={Colors[theme].tint} />
      </ThemedView>
    );
  }

  if (isInitialized && !member?.calendar_id) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>Calendar not assigned. Please contact support.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <DateControls
        selectedDate={selectedDate}
        onDateChange={(date) => {
          setSelectedDate(date);
          if (!date) {
            setRequestDialogVisible(false);
          }
        }}
        onCurrentDateChange={(date) => {
          setCurrentDate(date);
        }}
      />
      <ScrollView style={styles.scrollView}>
        <Calendar key={`calendar-${currentDate}-${member?.calendar_id}`} current={currentDate} />
      </ScrollView>

      {selectedDate && (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => setRequestDialogVisible(true)}
          disabled={!isInitialized}
        >
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
    gap: 10,
  } as ViewStyle,
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 15,
  } as ViewStyle,
  errorText: {
    color: Colors.light.error,
    fontWeight: "600",
    textAlign: "center",
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
    paddingVertical: 10,
    paddingHorizontal: 8,
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.dark.border,
  } as ViewStyle,
  requestSpot: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginVertical: 2,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  } as ViewStyle,
  spotNumber: {
    marginRight: 12,
    fontWeight: "bold",
    minWidth: 25,
    textAlign: "right",
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
    fontSize: 13,
  } as TextStyle,
  emptySpot: {
    color: Colors.light.success,
    fontStyle: "italic",
  } as TextStyle,
  allotmentContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  } as ViewStyle,
  allotmentInfo: {
    fontSize: 15,
    fontWeight: "500",
  } as TextStyle,
  waitlistInfo: {
    fontSize: 14,
    fontStyle: "italic",
    color: Colors.light.warning,
  } as TextStyle,
  approvedStatus: {
    color: Colors.light.success,
  } as TextStyle,
  waitlistedStatus: {
    color: Colors.light.error,
  } as TextStyle,
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
    backgroundColor: Colors.dark.border,
  } as ViewStyle,
  messageContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  } as ViewStyle,
});
