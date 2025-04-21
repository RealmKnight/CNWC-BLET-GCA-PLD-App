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
import { VacationCalendar } from "@/components/VacationCalendar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { useVacationCalendarStore } from "@/store/vacationCalendarStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns-tz";
import { parseISO, isBefore } from "date-fns";
import { isSameDayWithFormat, getSixMonthDate } from "@/utils/date-utils";
import { isLastDayOfMonth } from "date-fns";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useFocusEffect } from "@react-navigation/native";
import { Member } from "@/types/member";
import { useMyTime } from "@/hooks/useMyTime";
import Toast from "react-native-toast-message";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";

type ColorScheme = keyof typeof Colors;
type CalendarType = "PLD/SDV" | "Vacation";

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
  const { stats, initialize: refreshMyTimeStats } = useMyTime();
  const { member } = useUserStore();
  const checkSixMonthRequest = useCalendarStore((state) => state.checkSixMonthRequest);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSixMonthRequest, setHasSixMonthRequest] = useState(false);
  const [totalSixMonthRequests, setTotalSixMonthRequests] = useState(0);
  const [localRequests, setLocalRequests] = useState<DayRequest[]>([]);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // Initialize local requests with the ones passed as props
  useEffect(() => {
    setLocalRequests(allRequests);
  }, [allRequests]);

  // Set up real-time subscription to handle active requests
  useEffect(() => {
    if (!selectedDate || !member?.calendar_id || !isVisible) return;

    // Clean up any existing subscription first
    if (realtimeChannelRef.current) {
      console.log("[RequestDialog] Cleaning up existing real-time subscription");
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }

    console.log("[RequestDialog] Setting up real-time subscription for", selectedDate);

    // Create a unique channel name with timestamp to prevent stale subscriptions
    const channelName = `request-dialog-${selectedDate}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `request_date=eq.${selectedDate}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log("[RequestDialog] Received realtime update:", payload);

          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === "INSERT") {
            // Check if this request already exists in our local state
            const requestAlreadyExists = localRequests.some((req) => req.id === newRecord.id);

            if (requestAlreadyExists) {
              console.log("[RequestDialog] Skipping INSERT for already existing request:", newRecord.id);
              return;
            }

            // Fetch the member details for the new request
            supabase
              .from("members")
              .select("id, first_name, last_name, pin_number")
              .eq("id", newRecord.member_id)
              .single()
              .then(({ data: memberData, error }) => {
                if (!error && memberData) {
                  const newRequest: DayRequest = {
                    ...newRecord,
                    member: {
                      id: memberData.id,
                      first_name: memberData.first_name,
                      last_name: memberData.last_name,
                      pin_number: memberData.pin_number || 0,
                    },
                  };

                  // Do a final check before adding to prevent race conditions
                  setLocalRequests((prev) => {
                    // Check again inside the setter to ensure we have the latest state
                    if (prev.some((req) => req.id === newRecord.id)) {
                      console.log(
                        "[RequestDialog] Request already added in state update, preventing duplicate:",
                        newRecord.id
                      );
                      return prev;
                    }
                    return [...prev, newRequest];
                  });
                }
              });
          } else if (eventType === "UPDATE") {
            setLocalRequests((prev) => prev.map((req) => (req.id === newRecord.id ? { ...req, ...newRecord } : req)));
          } else if (eventType === "DELETE") {
            setLocalRequests((prev) => prev.filter((req) => req.id !== oldRecord.id));
          }
        }
      )
      .subscribe((status) => {
        console.log("[RequestDialog] Subscription status:", status);
      });

    realtimeChannelRef.current = channel;

    // Cleanup function
    return () => {
      console.log("[RequestDialog] Cleaning up real-time subscription on unmount/update");
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedDate, member?.calendar_id, isVisible]);

  // Refresh stats whenever the dialog becomes visible
  useEffect(() => {
    if (isVisible) {
      console.log("[RequestDialog] Dialog opened, refreshing stats");
      refreshMyTimeStats(true);
    }
  }, [isVisible, refreshMyTimeStats]);

  // Ensure we have the latest stats even if useMyTime updates elsewhere
  // This ensures we're always showing accurate stats in the dialog
  useEffect(() => {
    console.log("[RequestDialog] Stats updated:", {
      pldAvailable: stats?.available.pld,
      sdvAvailable: stats?.available.sdv,
    });
  }, [stats]);

  // Wrap the onSubmit handler to also refresh stats after a request
  const handleSubmit = async (leaveType: "PLD" | "SDV") => {
    setIsSubmitting(true);

    // Store the current real-time channel to temporarily pause updates
    const currentChannel = realtimeChannelRef.current;

    // Temporarily disable real-time updates to prevent duplicates
    if (currentChannel) {
      console.log("[RequestDialog] Temporarily disabling real-time updates during submission");
      realtimeChannelRef.current = null;
      currentChannel.unsubscribe();
    }

    try {
      const result = await onSubmit(leaveType);

      // Force refresh stats after submitting a request
      await refreshMyTimeStats(true);

      // Allow some time for the database to process the request before re-enabling real-time
      setTimeout(() => {
        // Restart the real-time subscription if the dialog is still open
        if (isVisible && selectedDate && member?.calendar_id) {
          console.log("[RequestDialog] Re-enabling real-time updates after successful submission");

          // Set up a new subscription
          const channel = supabase
            .channel(`request-dialog-${selectedDate}-${Date.now()}`) // Add timestamp to ensure unique channel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "pld_sdv_requests",
                filter: `request_date=eq.${selectedDate}`,
              },
              (payload: RealtimePostgresChangesPayload<any>) => {
                // Use the same handler as before, but with additional duplicate prevention
                console.log("[RequestDialog] Received realtime update after resubscription:", payload);

                const { eventType, new: newRecord, old: oldRecord } = payload;

                if (eventType === "INSERT") {
                  // Check if this request already exists
                  const requestAlreadyExists = localRequests.some((req) => req.id === newRecord.id);

                  if (requestAlreadyExists) {
                    console.log("[RequestDialog] Skipping INSERT for already existing request:", newRecord.id);
                    return;
                  }

                  // Fetch the member details for the new request
                  supabase
                    .from("members")
                    .select("id, first_name, last_name, pin_number")
                    .eq("id", newRecord.member_id)
                    .single()
                    .then(({ data: memberData, error }) => {
                      if (!error && memberData) {
                        const newRequest: DayRequest = {
                          ...newRecord,
                          member: {
                            id: memberData.id,
                            first_name: memberData.first_name,
                            last_name: memberData.last_name,
                            pin_number: memberData.pin_number || 0,
                          },
                        };

                        // Double-check again before adding
                        setLocalRequests((prev) => {
                          if (prev.some((req) => req.id === newRecord.id)) {
                            console.log("[RequestDialog] Request already added, preventing duplicate:", newRecord.id);
                            return prev;
                          }
                          return [...prev, newRequest];
                        });
                      }
                    });
                } else if (eventType === "UPDATE") {
                  setLocalRequests((prev) =>
                    prev.map((req) => (req.id === newRecord.id ? { ...req, ...newRecord } : req))
                  );
                } else if (eventType === "DELETE") {
                  setLocalRequests((prev) => prev.filter((req) => req.id !== oldRecord.id));
                }
              }
            )
            .subscribe();

          realtimeChannelRef.current = channel;
        }
      }, 1000); // Wait 1 second before re-enabling real-time updates

      return result;
    } catch (err) {
      console.error("[RequestDialog] Error in handleSubmit:", err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    // Check if there is an existing six-month request for this date
    if (selectedDate && isVisible) {
      const checkForSixMonthRequest = async () => {
        const exists = await checkSixMonthRequest(selectedDate);
        setHasSixMonthRequest(exists);
      };

      checkForSixMonthRequest();
    } else {
      setHasSixMonthRequest(false);
    }
  }, [selectedDate, isVisible, checkSixMonthRequest]);

  // Determine if the selected date is a six month request date
  const isSixMonthRequest = useMemo(() => {
    const isSixMonthDate = isSameDayWithFormat(selectedDate, getSixMonthDate(), "yyyy-MM-dd");
    const isEndOfMonth = isLastDayOfMonth(new Date());
    const sixMonthDate = getSixMonthDate();

    const result =
      isSixMonthDate ||
      (isEndOfMonth &&
        parseISO(selectedDate).getMonth() === sixMonthDate.getMonth() &&
        parseISO(selectedDate).getFullYear() === sixMonthDate.getFullYear() &&
        !isBefore(parseISO(selectedDate), sixMonthDate));

    // Log detailed information about six-month date detection
    console.log(`[RequestDialog] Six-month request detection for ${selectedDate}:`, {
      isSixMonthDate,
      isEndOfMonth,
      sixMonthDate: format(sixMonthDate, "yyyy-MM-dd"),
      selectedDateMonth: parseISO(selectedDate).getMonth(),
      sixMonthDateMonth: sixMonthDate.getMonth(),
      selectedDateYear: parseISO(selectedDate).getFullYear(),
      sixMonthDateYear: sixMonthDate.getFullYear(),
      isBeforeSixMonthDate: isBefore(parseISO(selectedDate), sixMonthDate),
      result,
    });

    return result;
  }, [selectedDate]);

  // Fetch the total count of six-month requests for this date when dialog is shown
  useEffect(() => {
    if (selectedDate && isVisible && isSixMonthRequest && member?.calendar_id) {
      const fetchTotalSixMonthRequests = async () => {
        try {
          console.log(
            `[RequestDialog] Fetching six-month requests for date: ${selectedDate}, calendar: ${member.calendar_id}`
          );

          // Use the RPC function to get the count of all six-month requests for this date and calendar
          const { data, error } = await supabase.rpc("count_six_month_requests_by_date", {
            p_request_date: selectedDate,
            p_calendar_id: member.calendar_id,
          });

          if (error) {
            console.error("[RequestDialog] Error counting six-month requests:", error);

            // Fallback to direct query (will likely only show the user's own requests due to RLS)
            console.log("[RequestDialog] Falling back to direct query...");
            const { data: fallbackData, error: fallbackError } = await supabase
              .from("six_month_requests")
              .select("*", { count: "exact" })
              .eq("request_date", selectedDate)
              .eq("calendar_id", member.calendar_id);

            if (fallbackError) {
              console.error("[RequestDialog] Fallback query error:", fallbackError);
              setTotalSixMonthRequests(0);
              return;
            }

            console.log(
              `[RequestDialog] Fallback found ${fallbackData.length} records (likely incomplete due to RLS)`,
              fallbackData
            );
            setTotalSixMonthRequests(fallbackData.length);
            return;
          }

          const count = data || 0;
          console.log(`[RequestDialog] Found ${count} six-month requests for date ${selectedDate} via RPC`);
          setTotalSixMonthRequests(count);

          // Set up realtime subscription for six-month requests
          const sixMonthChannel = supabase
            .channel(`request-dialog-six-month-${selectedDate}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "six_month_requests",
                filter: `request_date=eq.${selectedDate}`,
              },
              async (payload) => {
                console.log("[RequestDialog] Received six-month request update:", payload);

                // Refresh the count of six-month requests
                try {
                  const { data: refreshData, error: refreshError } = await supabase.rpc(
                    "count_six_month_requests_by_date",
                    {
                      p_request_date: selectedDate,
                      p_calendar_id: member.calendar_id,
                    }
                  );

                  if (!refreshError) {
                    const newCount = refreshData || 0;
                    console.log(`[RequestDialog] Updated six-month request count: ${newCount}`);
                    setTotalSixMonthRequests(newCount);
                  }
                } catch (error) {
                  console.error("[RequestDialog] Error refreshing six-month request count:", error);
                }
              }
            )
            .subscribe();

          // Store this channel in the ref as well
          const existingChannel = realtimeChannelRef.current;
          if (existingChannel) {
            // Create a combined cleanup function
            realtimeChannelRef.current = {
              unsubscribe: () => {
                existingChannel.unsubscribe();
                sixMonthChannel.unsubscribe();
              },
            } as RealtimeChannel;
          } else {
            realtimeChannelRef.current = sixMonthChannel;
          }
        } catch (error) {
          console.error("[RequestDialog] Exception in fetchTotalSixMonthRequests:", error);
          setTotalSixMonthRequests(0);
        }
      };

      fetchTotalSixMonthRequests();
    }
  }, [selectedDate, isVisible, isSixMonthRequest, member?.calendar_id]);

  // For six month dates, we don't want to show other users' requests
  // as they shouldn't count against the allotment
  const filteredRequests = useMemo(() => {
    if (isSixMonthRequest) {
      // On six-month dates, don't show any requests in the dialog list
      // Six-month requests should only be visible on the MyTime screen
      return [];
    }
    return localRequests; // Use local requests that are updated in realtime
  }, [localRequests, isSixMonthRequest]);

  const activeRequests = useMemo(() => {
    return filteredRequests.filter(
      (r) =>
        r.status === "approved" ||
        r.status === "pending" ||
        r.status === "waitlisted" ||
        r.status === "cancellation_pending"
    );
  }, [filteredRequests]);

  const hasExistingRequest = useMemo(() => {
    // For six-month requests, check the hasSixMonthRequest flag
    if (isSixMonthRequest) {
      return hasSixMonthRequest;
    }
    // For regular requests, check if any of the active requests are from the current user
    return activeRequests.some((r) => r.member.id === member?.id);
  }, [activeRequests, member?.id, isSixMonthRequest, hasSixMonthRequest]);

  // For six month dates, don't count other users' requests against the allotment
  // But we do want to show the total count of six-month requests
  const currentAllotment = useMemo(() => {
    const result = {
      max: allotments.max,
      current: isSixMonthRequest
        ? totalSixMonthRequests // Show total six-month requests instead of just the user's request
        : activeRequests.length,
    };

    // Log the current allotment for debugging
    if (isSixMonthRequest) {
      console.log("[RequestDialog] Six-month allotment:", {
        date: selectedDate,
        max: result.max,
        total: totalSixMonthRequests,
      });
    }

    return result;
  }, [allotments.max, activeRequests.length, isSixMonthRequest, totalSixMonthRequests, selectedDate]);

  const isFull = currentAllotment.current >= currentAllotment.max;

  // Only display requests that we're showing to the user
  // (don't show six month requests from other users)
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

  const isFullMessage = useMemo(() => {
    if (currentAllotment.max <= 0) {
      return "No days allocated for this date";
    }

    // Show message about existing six-month request - only if user already submitted one
    if (hasSixMonthRequest && isSixMonthRequest) {
      return "You already have a six-month request pending for this date";
    }

    // If this is a six month request, show special message
    if (isSixMonthRequest) {
      return "Six-month requests are processed by seniority and do not count against daily allotment";
    }

    if (hasExistingRequest) {
      return "You already have a request for this date";
    }

    if (currentAllotment.current >= currentAllotment.max) {
      return `This day is full (${currentAllotment.current}/${currentAllotment.max})`;
    }

    return null;
  }, [currentAllotment, hasExistingRequest, hasSixMonthRequest, isSixMonthRequest]);

  // Ensure we clean up the subscription when the component unmounts or when dialog closes
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        console.log("[RequestDialog] Unmounting, cleaning up subscription");
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  // Also clean up when the dialog closes
  useEffect(() => {
    if (!isVisible && realtimeChannelRef.current) {
      console.log("[RequestDialog] Dialog closed, cleaning up subscription");
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }
  }, [isVisible]);

  const submitButtonProps = useMemo(() => {
    // For six-month requests, we allow submission even if the day is full
    // as they are processed by seniority and will be waitlisted if needed
    if (isSixMonthRequest) {
      // Disable if there's already a six-month request or no available days
      const isDisabled = (stats?.available.pld ?? 0) <= 0 || isSubmitting || hasSixMonthRequest;
      return {
        onPress: () => handleSubmit("PLD"),
        disabled: isDisabled,
        loadingState: isSubmitting,
      };
    }

    // For regular requests, follow normal rules
    const isDisabled =
      (stats?.available.pld ?? 0) <= 0 ||
      isSubmitting ||
      hasExistingRequest ||
      currentAllotment.current >= currentAllotment.max;

    return {
      onPress: () => handleSubmit("PLD"),
      disabled: isDisabled,
      loadingState: isSubmitting,
    };
  }, [
    stats?.available.pld,
    isSubmitting,
    hasExistingRequest,
    currentAllotment,
    handleSubmit,
    hasSixMonthRequest,
    isSixMonthRequest,
  ]);

  const sdvButtonProps = useMemo(() => {
    // For six-month requests, we allow submission even if the day is full
    // as they are processed by seniority and will be waitlisted if needed
    if (isSixMonthRequest) {
      // Disable if there's already a six-month request or no available days
      const isDisabled = (stats?.available.sdv ?? 0) <= 0 || isSubmitting || hasSixMonthRequest;
      return {
        onPress: () => handleSubmit("SDV"),
        disabled: isDisabled,
        loadingState: isSubmitting,
      };
    }

    // For regular requests, follow normal rules
    const isDisabled =
      (stats?.available.sdv ?? 0) <= 0 ||
      isSubmitting ||
      hasExistingRequest ||
      currentAllotment.current >= currentAllotment.max;

    return {
      onPress: () => handleSubmit("SDV"),
      disabled: isDisabled,
      loadingState: isSubmitting,
    };
  }, [
    stats?.available.sdv,
    isSubmitting,
    hasExistingRequest,
    currentAllotment,
    handleSubmit,
    hasSixMonthRequest,
    isSixMonthRequest,
  ]);

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.modalOverlay}>
        <View style={dialogStyles.modalContent}>
          <ThemedText style={dialogStyles.modalTitle}>Request Day Off - {selectedDate}</ThemedText>

          <View style={dialogStyles.allotmentContainer}>
            <ThemedText style={dialogStyles.allotmentInfo}>
              {isSixMonthRequest
                ? `${currentAllotment.current} six-month requests for this date`
                : `${currentAllotment.current}/${currentAllotment.max} spots filled`}
            </ThemedText>
            {isFull && activeRequests.length > currentAllotment.max && !isSixMonthRequest && (
              <ThemedText style={dialogStyles.waitlistInfo}>
                Waitlist: {activeRequests.length - currentAllotment.max}
              </ThemedText>
            )}
          </View>
          {isFullMessage && (
            <View style={dialogStyles.messageContainer}>
              <ThemedText style={[dialogStyles.allotmentInfo, { color: Colors[theme].error }]}>
                {isFullMessage}
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
                      request.status === "cancellation_pending" && dialogStyles.cancellationPendingStatus,
                    ]}
                  >
                    {request.status === "cancellation_pending"
                      ? "Cancellation Pending"
                      : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    {request.status === "waitlisted" && request.waitlist_position
                      ? ` #${request.waitlist_position}`
                      : ""}
                  </ThemedText>
                </View>
              </View>
            ))}
            {/* For six month dates, show empty slots differently */}
            {isSixMonthRequest ? (
              <View key="six-month-note" style={dialogStyles.requestSpot}>
                <ThemedText style={{ ...dialogStyles.emptySpot, textAlign: "center", flex: 1 }}>
                  Six month requests are processed by seniority
                </ThemedText>
              </View>
            ) : (
              // For regular dates, show the empty slots
              Array.from({ length: Math.max(0, currentAllotment.max - sortedRequests.length) }).map((_, index) => (
                <View key={`empty-${index}`} style={dialogStyles.requestSpot}>
                  <ThemedText style={dialogStyles.spotNumber}>#{sortedRequests.length + index + 1}</ThemedText>
                  <ThemedText style={dialogStyles.emptySpot}>Available</ThemedText>
                </View>
              ))
            )}
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
              onPress={submitButtonProps.onPress}
              disabled={submitButtonProps.disabled}
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
              onPress={sdvButtonProps.onPress}
              disabled={sdvButtonProps.disabled}
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
  const lastValidDateRef = useRef(selectedDate || today);

  useEffect(() => {
    if (selectedDate) {
      lastValidDateRef.current = selectedDate;
    }
  }, [selectedDate]);

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
      lastValidDateRef.current = formattedDate;
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
      lastValidDateRef.current = date;
    } else {
      onDateChange(lastValidDateRef.current);
    }
  };

  const handleTodayPress = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.5, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    onCurrentDateChange(today);
    onDateChange(today);
    lastValidDateRef.current = today;
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
    color: "black",
    fontWeight: "600",
  } as TextStyle,
});

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [activeCalendar, setActiveCalendar] = useState<CalendarType>("PLD/SDV");
  const [currentDate, setCurrentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const { user, session } = useAuth();
  const { member, division } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const [calendarName, setCalendarName] = useState<string | null>(null);
  const REFRESH_COOLDOWN = 2000;
  const [calendarKey, setCalendarKey] = useState(Date.now());

  const isLoadingRef = useRef(false);
  const mountTimeRef = useRef(Date.now());
  const lastRefreshTimeRef = useRef(Date.now());

  // PLD/SDV Calendar State
  const {
    selectedDate,
    requests: pldRequests,
    userSubmitRequest,
    submitSixMonthRequest,
    setSelectedDate,
    allotments: pldAllotments,
    yearlyAllotments,
    loadInitialData: loadPldData,
    isInitialized: isPldInitialized,
    isDateSelectable,
  } = useCalendarStore();

  // Vacation Calendar State
  const {
    selectedWeek,
    requests: vacationRequests,
    allotments: vacationAllotments,
    loadInitialData: loadVacationData,
    isInitialized: isVacationInitialized,
    setSelectedWeek,
  } = useVacationCalendarStore();

  const { stats, initialize: refreshMyTimeStats } = useMyTime();

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

      await Promise.all([
        loadPldData(dateRange.start, dateRange.end),
        loadVacationData(dateRange.start, dateRange.end),
      ]);
      console.log("[CalendarScreen] Data loaded successfully for both calendars");
    } catch (err) {
      console.error("[CalendarScreen] Error loading data:", err);
      setError(err instanceof Error ? err.message : "Failed to load calendar data");
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [user, member?.calendar_id, loadPldData, loadVacationData]);

  useEffect(() => {
    if (!isPldInitialized && !isVacationInitialized && user && member?.calendar_id) {
      console.log("[CalendarScreen] Initializing calendar data...");
      loadDataSafely();
      mountTimeRef.current = Date.now();
    } else if (!user || !member?.calendar_id) {
      setIsLoading(false);
      setError("User or Calendar information not available.");
      console.log("[CalendarScreen] Resetting due to missing user/calendar ID.");
    }
  }, [isPldInitialized, isVacationInitialized, user, member?.calendar_id, loadDataSafely]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - mountTimeRef.current < REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, skipping refresh (recent mount).");
        return;
      }
      if (isPldInitialized && now - lastRefreshTimeRef.current > REFRESH_COOLDOWN) {
        console.log("[CalendarScreen] Screen focused, refreshing data.");
        loadDataSafely();
        lastRefreshTimeRef.current = now;
      } else if (!isPldInitialized && !isVacationInitialized && user && member?.calendar_id) {
        console.log("[CalendarScreen] Screen focused, attempting initial load.");
        loadDataSafely();
        lastRefreshTimeRef.current = now;
      } else {
        console.log("[CalendarScreen] Screen focused, skipping refresh:", {
          isPldInitialized,
          isVacationInitialized,
          timeSinceLastRefresh: now - lastRefreshTimeRef.current,
          cooldown: REFRESH_COOLDOWN,
          isLoading: isLoadingRef.current,
        });
      }
    }, [isPldInitialized, isVacationInitialized, loadDataSafely, user, member?.calendar_id])
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

          if (currentSession && user && member?.calendar_id && isPldInitialized && isVacationInitialized) {
            console.log("[CalendarScreen] Session valid, refreshing data on foreground.");
            const now = Date.now();
            if (now - lastRefreshTime > REFRESH_COOLDOWN) {
              await loadDataSafely();
              setLastRefreshTime(now);
            } else {
              console.log("[CalendarScreen] Skipping refresh on foreground (cooldown).");
            }
          } else if (!isPldInitialized && !isVacationInitialized && currentSession && user && member?.calendar_id) {
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
  }, [appState, user, member?.calendar_id, isPldInitialized, isVacationInitialized, lastRefreshTime, loadDataSafely]);

  useEffect(() => {
    return () => {
      console.log("[CalendarScreen] Cleaning up on unmount");
      isLoadingRef.current = false;
    };
  }, []);

  // Set up global realtime updates for the calendar data
  useEffect(() => {
    if (!member?.calendar_id) {
      return;
    }

    console.log("[CalendarScreen] Setting up global realtime subscriptions");

    // Listen for changes to pld_sdv_requests table that might affect waitlist processing
    const requestsChannel = supabase
      .channel("calendar-waitlist-processing")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `calendar_id=eq.${member.calendar_id}`,
        },
        async (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          // Only process updates that affect waitlist positions
          if (
            eventType === "UPDATE" &&
            oldRecord &&
            newRecord &&
            (oldRecord.status !== newRecord.status || oldRecord.waitlist_position !== newRecord.waitlist_position)
          ) {
            console.log("[CalendarScreen] Waitlist position or status changed:", {
              id: newRecord.id,
              oldStatus: oldRecord.status,
              newStatus: newRecord.status,
              oldPosition: oldRecord.waitlist_position,
              newPosition: newRecord.waitlist_position,
              date: newRecord.request_date,
            });

            // Refresh requests for this specific date
            if (newRecord.request_date) {
              try {
                const now = Date.now();
                if (now - lastRefreshTimeRef.current > REFRESH_COOLDOWN) {
                  console.log("[CalendarScreen] Refreshing calendar data due to waitlist change");
                  await loadDataSafely();
                  lastRefreshTimeRef.current = now;
                }
              } catch (error) {
                console.error("[CalendarScreen] Error refreshing after waitlist change:", error);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log("[CalendarScreen] Cleaning up global realtime subscriptions");
      requestsChannel.unsubscribe();
    };
  }, [member?.calendar_id, loadDataSafely]);

  useEffect(() => {
    async function fetchCalendarName() {
      if (!member?.calendar_id) {
        setCalendarName(null);
        return;
      }

      try {
        const { data, error } = await supabase.from("calendars").select("name").eq("id", member.calendar_id).single();

        if (error) throw error;
        setCalendarName(data?.name || null);
      } catch (err) {
        console.error("[CalendarScreen] Error fetching calendar name:", err);
        setCalendarName(null);
      }
    }

    fetchCalendarName();
  }, [member?.calendar_id]);

  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (!selectedDate) return;

    setIsLoading(true);

    try {
      console.log(`[CalendarScreen] Submitting ${leaveType} request for ${selectedDate}`);

      const isSixMonthDate = isSameDayWithFormat(selectedDate, getSixMonthDate(), "yyyy-MM-dd");
      const isEndOfMonth = isLastDayOfMonth(new Date());
      const sixMonthDate = getSixMonthDate();

      const isSixMonthRequest =
        isSixMonthDate ||
        (isEndOfMonth &&
          parseISO(selectedDate).getMonth() === sixMonthDate.getMonth() &&
          parseISO(selectedDate).getFullYear() === sixMonthDate.getFullYear() &&
          !isBefore(parseISO(selectedDate), sixMonthDate));

      let result;
      if (isSixMonthRequest) {
        result = await submitSixMonthRequest(selectedDate, leaveType);
      } else {
        result = await userSubmitRequest(selectedDate, leaveType);
      }

      if (result) {
        Toast.show({
          type: "success",
          text1: "Success",
          text2: `Your ${leaveType} request has been submitted.`,
          position: "bottom",
          visibilityTime: 3000,
        });

        // Force refresh of MyTime stats to ensure up-to-date data
        await refreshMyTimeStats(true);

        // Close the dialog
        setRequestDialogVisible(false);
      }
    } catch (err) {
      console.error("[CalendarScreen] Error submitting request:", err);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err instanceof Error ? err.message : "Failed to submit request",
        position: "bottom",
        visibilityTime: 3000,
      });
    } finally {
      setIsLoading(false);
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

    const maxAllotment = pldAllotments[dateKey] ?? yearlyAllotments[yearKey] ?? 0;

    // Make sure we don't pass any six month requests to the dialog
    const dateRequests = pldRequests[dateKey] || [];

    // Filter out any requests that might be from six month requests
    // (they shouldn't be there, but just in case)
    const filteredRequests = dateRequests.filter((request) => {
      // Check if this is the six month date
      const isSixMonthDate = isSameDayWithFormat(selectedDate, getSixMonthDate(), "yyyy-MM-dd");
      const isEndOfMonth = isLastDayOfMonth(new Date());
      const sixMonthDate = getSixMonthDate();

      const isSixMonthRequest =
        isSixMonthDate ||
        (isEndOfMonth &&
          parseISO(selectedDate).getMonth() === sixMonthDate.getMonth() &&
          parseISO(selectedDate).getFullYear() === sixMonthDate.getFullYear() &&
          !isBefore(parseISO(selectedDate), sixMonthDate));

      // If this is a six month date, and the request has metadata indicating
      // it originated from a six month request, filter it out
      if (
        isSixMonthRequest &&
        request.metadata &&
        typeof request.metadata === "object" &&
        (request.metadata as any).from_six_month_request === true
      ) {
        return false;
      }

      return true;
    });

    // Count only requests that are not six month requests
    const currentAllotmentCount = filteredRequests.filter(
      (r: DayRequest) =>
        r.status === "approved" ||
        r.status === "pending" ||
        r.status === "waitlisted" ||
        r.status === "cancellation_pending"
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
      requests: filteredRequests,
    };
  }, [requestDialogVisible, selectedDate, pldAllotments, yearlyAllotments, pldRequests, handleRequestSubmit]);

  if (!isPldInitialized && !isVacationInitialized && isLoading) {
    return (
      <ThemedView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
        <ThemedText>Loading calendar data...</ThemedText>
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

  if (isPldInitialized && !member?.calendar_id) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>PLD/SDV Calendar not assigned. Please contact support.</ThemedText>
      </ThemedView>
    );
  }

  if (isVacationInitialized && !member?.calendar_id) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>Vacation Calendar not assigned. Please contact support.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.calendarId}>
        {activeCalendar === "PLD/SDV" ? "PLD/SDV Calendar" : "Vacation Calendar"}: {calendarName || "Loading..."}
      </ThemedText>

      {/* Calendar Type Tabs */}
      <ThemedView style={styles.tabContainer}>
        <TouchableOpacityComponent
          style={[styles.tab, activeCalendar === "PLD/SDV" && styles.activeTab, { borderColor: Colors[theme].border }]}
          onPress={() => {
            setActiveCalendar("PLD/SDV");
            setCalendarKey(Date.now()); // Force re-render
          }}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeCalendar === "PLD/SDV" && styles.activeTabText,
              { color: activeCalendar === "PLD/SDV" ? "black" : Colors[theme].text },
            ]}
          >
            PLD/SDV Calendar
          </ThemedText>
        </TouchableOpacityComponent>

        <TouchableOpacityComponent
          style={[styles.tab, activeCalendar === "Vacation" && styles.activeTab, { borderColor: Colors[theme].border }]}
          onPress={() => {
            setActiveCalendar("Vacation");
            setCalendarKey(Date.now()); // Force re-render

            // Refresh vacation calendar data when switching to it
            if (member?.calendar_id) {
              const now = new Date();
              const six_months_from_now = new Date(now);
              six_months_from_now.setMonth(now.getMonth() + 6);

              console.log("[CalendarScreen] Refreshing vacation calendar data");
              loadVacationData(format(now, "yyyy-MM-dd"), format(six_months_from_now, "yyyy-MM-dd")).catch((error) => {
                console.error("[CalendarScreen] Error refreshing vacation data:", error);
              });
            }
          }}
        >
          <ThemedText
            style={[
              styles.tabText,
              activeCalendar === "Vacation" && styles.activeTabText,
              { color: activeCalendar === "Vacation" ? "black" : Colors[theme].text },
            ]}
          >
            Vacation Calendar
          </ThemedText>
        </TouchableOpacityComponent>
      </ThemedView>

      {/* Date Controls */}
      <DateControls
        selectedDate={activeCalendar === "PLD/SDV" ? selectedDate : selectedWeek}
        onDateChange={(date) => {
          if (activeCalendar === "PLD/SDV") {
            setSelectedDate(date);
            if (!date) setRequestDialogVisible(false);
          } else {
            setSelectedWeek(date);
          }
        }}
        onCurrentDateChange={setCurrentDate}
      />

      {/* Calendar Content */}
      <ScrollView style={styles.scrollView}>
        {activeCalendar === "PLD/SDV" ? (
          <Calendar key={`pld-calendar-${currentDate}-${member?.calendar_id}-${calendarKey}`} current={currentDate} />
        ) : (
          <VacationCalendar key={`vacation-calendar-base-${member?.calendar_id}`} current={currentDate} />
        )}
      </ScrollView>

      {/* Request Button - Only show for PLD/SDV calendar and only if date is selectable */}
      {activeCalendar === "PLD/SDV" && selectedDate && (
        <TouchableOpacity
          style={[
            styles.requestButton,
            !isPldInitialized || !isDateSelectable(selectedDate) ? styles.disabledRequestButton : null,
          ]}
          onPress={() => setRequestDialogVisible(true)}
          disabled={!isPldInitialized || !isDateSelectable(selectedDate)}
        >
          <ThemedText style={styles.requestButtonText}>
            {isDateSelectable(selectedDate) ? "Request Day Off" : "This date is not available for requests"}
          </ThemedText>
        </TouchableOpacity>
      )}

      {/* Request Dialog - Only for PLD/SDV calendar */}
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
    color: "black",
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
  calendarId: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  } as TextStyle,
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  } as ViewStyle,
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  activeTab: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  } as ViewStyle,
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  } as TextStyle,
  activeTabText: {
    color: "black",
    fontWeight: "600",
  } as TextStyle,
  disabledRequestButton: {
    opacity: 0.7,
    backgroundColor: Colors.light.disabled,
  } as ViewStyle,
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
    color: "black",
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
  cancellationPendingStatus: {
    color: Colors.light.warning,
  } as TextStyle,
});
