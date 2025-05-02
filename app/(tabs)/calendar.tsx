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
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "@/components/Calendar";
import { VacationCalendar } from "@/components/VacationCalendar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useCalendarStore, DayRequest, setupCalendarSubscriptions } from "@/store/calendarStore";
import { useVacationCalendarStore, WeekRequest } from "@/store/vacationCalendarStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO, isBefore, isAfter, isLastDayOfMonth, startOfDay, addDays } from "date-fns";
import { isSameDayWithFormat, getSixMonthDate } from "@/utils/date-utils";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useFocusEffect } from "@react-navigation/native";
import { Member } from "@/types/member";
import { useMyTime } from "@/hooks/useMyTime";
import Toast from "react-native-toast-message";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { RealtimePostgresChangesPayload, RealtimeChannel } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { Calendar as RNCalendar } from "react-native-calendars";

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
  calendarType: CalendarType; // Add calendar type
  calendarId: string; // Add calendar ID
  onAdjustmentComplete: () => void; // Add new prop for reopening after adjustment
  viewMode?: "past" | "request" | "nearPast"; // Add new prop for view mode
}

function RequestDialog({
  isVisible,
  onClose,
  onSubmit,
  selectedDate,
  allotments,
  requests: allRequests,
  calendarType,
  calendarId,
  onAdjustmentComplete,
  viewMode,
}: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const {
    timeStats, // Correctly destructure timeStats
    initialize: refreshMyTimeStats,
    cancelSixMonthRequest,
    invalidateCache,
    isLoading: isMyTimeLoading,
  } = useMyTime();
  const { member } = useUserStore();
  const userRole = useUserStore((state) => state.userRole);
  const checkSixMonthRequest = useCalendarStore((state) => state.checkSixMonthRequest);
  const cancelRequest = useCalendarStore((state) => state.cancelRequest);
  const updateDailyAllotment = useAdminCalendarManagementStore((state) => state.updateDailyAllotment);
  const updateWeeklyAllotment = useAdminCalendarManagementStore((state) => state.updateWeeklyAllotment);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSixMonthRequest, setHasSixMonthRequest] = useState(false);
  const [totalSixMonthRequests, setTotalSixMonthRequests] = useState(0);
  const [localRequests, setLocalRequests] = useState<DayRequest[]>([]);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [sixMonthRequestId, setSixMonthRequestId] = useState<string | null>(null);
  // Add state for cancel confirmation dialog
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<"regular" | "six-month">("regular");

  // New state for allocation adjustment
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [newAllotment, setNewAllotment] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);

  // Add state for local tracking of allotments that can be updated by real-time events
  const [localAllotments, setLocalAllotments] = useState(allotments);

  // Admin check
  const isAdmin = userRole === "application_admin" || userRole === "union_admin" || userRole === "division_admin";

  // Initialize local state from props
  useEffect(() => {
    setLocalRequests(allRequests);
    setLocalAllotments(allotments);
  }, [allRequests, allotments]);

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
            // Use a function callback for setLocalRequests to get the latest state
            setLocalRequests((prev) => {
              const requestAlreadyExists = prev.some((req) => req.id === newRecord.id);
              if (requestAlreadyExists) {
                console.log("[RequestDialog] Skipping INSERT for already existing request:", newRecord.id);
                return prev;
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

                    // Double-check again before adding inside the state setter
                    setLocalRequests((currentPrev) => {
                      if (currentPrev.some((req) => req.id === newRecord.id)) {
                        console.log(
                          "[RequestDialog] Request already added in state update, preventing duplicate:",
                          newRecord.id
                        );
                        return currentPrev;
                      }
                      return [...currentPrev, newRequest];
                    });
                  }
                });
              return prev; // Return the previous state while async fetch happens
            });
          } else if (eventType === "UPDATE") {
            // Carefully merge updates, preserving the existing member object
            setLocalRequests((prev) =>
              prev.map((req) => {
                if (req.id === newRecord.id) {
                  // Preserve existing member data if not present in newRecord
                  const updatedMember = newRecord.member || req.member;
                  return {
                    ...req,
                    ...newRecord,
                    member: updatedMember, // Ensure member data is preserved/updated
                  };
                }
                return req;
              })
            );
          } else if (eventType === "DELETE") {
            setLocalRequests((prev) => prev.filter((req) => req.id !== oldRecord.id));
          }
        }
      )
      // Add subscription to pld_sdv_allotments to handle allocation changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_allotments",
          filter: `date=eq.${selectedDate}`,
        },
        async (payload: RealtimePostgresChangesPayload<any>) => {
          console.log("[RequestDialog] Received allotment update:", payload);
          const { new: newRecord } = payload;

          // Update the allotments state in the dialog
          if (newRecord && typeof newRecord === "object" && "max_allotment" in newRecord) {
            // Fetch the updated allotments and requests to ensure UI is in sync
            try {
              // Update local allotment state for immediate feedback
              const newAllotmentValue = {
                max: newRecord.max_allotment,
                current: newRecord.current_requests || localAllotments.current,
              };

              console.log("[RequestDialog] Updating allotment:", newAllotmentValue);

              // Update the dialog's local allotment state
              setLocalAllotments(newAllotmentValue);

              // Now, fetch the latest requests to show any waitlist changes
              const { data, error } = await supabase
                .from("pld_sdv_requests")
                .select(
                  `
                  id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position,
                  member:members!inner (
                    id, first_name, last_name, pin_number
                  )
                `
                )
                .eq("calendar_id", calendarId)
                .eq("request_date", selectedDate);

              if (!error && data) {
                // Update local requests
                setLocalRequests(data as unknown as DayRequest[]);
                console.log(`[RequestDialog] Updated requests after allotment change: ${data.length} requests`);
              }
            } catch (error) {
              console.error("[RequestDialog] Error refreshing after allotment update:", error);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("[RequestDialog] Subscription status (Requests Only Now):", status);
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
  }, [selectedDate, member?.calendar_id, isVisible, calendarId]);

  // Ensure we have the latest stats even if useMyTime updates elsewhere
  // This ensures we're always showing accurate stats in the dialog
  useEffect(() => {
    // Log the entire timeStats object when it changes
    console.log("[RequestDialog] timeStats object updated:", timeStats);
  }, [timeStats]); // Depend on timeStats

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
      // Call the original onSubmit passed from props
      await onSubmit(leaveType);

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
                  // Use functional update to prevent stale closures
                  setLocalRequests((prev) => {
                    const requestAlreadyExists = prev.some((req) => req.id === newRecord.id);
                    if (requestAlreadyExists) {
                      console.log(
                        "[RequestDialog] Skipping INSERT for already existing request (resubscribe):",
                        newRecord.id
                      );
                      return prev;
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

                          // Double-check again before adding inside the state setter
                          setLocalRequests((currentPrev) => {
                            if (currentPrev.some((req) => req.id === newRecord.id)) {
                              console.log(
                                "[RequestDialog] Request already added, preventing duplicate (resubscribe):",
                                newRecord.id
                              );
                              return currentPrev;
                            }
                            return [...currentPrev, newRequest];
                          });
                        }
                      });
                    return prev; // Return the previous state while async fetch happens
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
    } catch (err) {
      console.error("[RequestDialog] Error in handleSubmit:", err);
      // Don't re-throw, let the original onSubmit handle its errors
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    // Check if there is an existing six-month request for this date
    if (selectedDate && isVisible) {
      const checkForSixMonthRequest = async () => {
        // Check if the user has a six month request for this date and get its ID
        const { data: existingSixMonthReq, error } = await supabase
          .from("six_month_requests")
          .select("id")
          .eq("member_id", member?.id || "")
          .eq("request_date", selectedDate)
          .eq("processed", false)
          .maybeSingle();

        if (error) {
          console.error("[RequestDialog] Error checking for existing six-month request:", error);
          setHasSixMonthRequest(false);
          setSixMonthRequestId(null);
        } else {
          const exists = !!existingSixMonthReq;
          setHasSixMonthRequest(exists);
          setSixMonthRequestId(existingSixMonthReq?.id || null);
          console.log("[RequestDialog] Six month request check:", { exists, id: existingSixMonthReq?.id });
        }
      };

      checkForSixMonthRequest();
    } else {
      setHasSixMonthRequest(false);
    }
  }, [selectedDate, isVisible, checkSixMonthRequest]);

  // Determine if the selected date is a six month request date
  const isSixMonthRequest = useMemo(() => {
    // *** ADDED CHECK: If calendarType is Vacation, it's never a six-month request date ***
    if (calendarType === "Vacation") {
      return false;
    }

    const now = new Date();
    const dateObj = parseISO(selectedDate);
    const isSixMonthDate = isSameDayWithFormat(selectedDate, getSixMonthDate(), "yyyy-MM-dd");
    const isEndOfMonth = isLastDayOfMonth(now);
    const sixMonthDate = getSixMonthDate();

    // FIXED: Properly handle six-month requests according to business rules
    // Six month requests are ONLY the exact 6-month date OR dates after it in the same month on month-end
    const result =
      isSixMonthDate ||
      (isEndOfMonth &&
        dateObj.getMonth() === sixMonthDate.getMonth() &&
        dateObj.getFullYear() === sixMonthDate.getFullYear() &&
        dateObj.getDate() >= sixMonthDate.getDate());

    // Log detailed information about six-month date detection but only in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[RequestDialog] Six-month request detection for ${selectedDate}:`, {
        isSixMonthDate,
        isEndOfMonth,
        sixMonthDate: format(sixMonthDate, "yyyy-MM-dd"),
        selectedDateMonth: dateObj.getMonth(),
        sixMonthDateMonth: sixMonthDate.getMonth(),
        selectedDateYear: dateObj.getFullYear(),
        sixMonthDateYear: sixMonthDate.getFullYear(),
        selectedDateDay: dateObj.getDate(),
        sixMonthDateDay: sixMonthDate.getDate(),
        result,
      });
    }

    return result;
  }, [selectedDate, calendarType]);

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
    // If viewing past dates, only show approved requests
    if (viewMode === "past" || viewMode === "nearPast") {
      return localRequests.filter((req) => req.status === "approved");
    }
    if (isSixMonthRequest) {
      // On six-month dates, don't show any requests in the dialog list
      // Six-month requests should only be visible on the MyTime screen
      return [];
    }
    return localRequests; // Use local requests that are updated in realtime
  }, [localRequests, isSixMonthRequest, viewMode]);

  const activeRequests = useMemo(() => {
    // If viewing past dates, all filtered requests are considered 'active' for display
    if (viewMode === "past" || viewMode === "nearPast") {
      return filteredRequests;
    }
    // Otherwise, use existing logic
    return filteredRequests.filter(
      (r) =>
        r.status === "approved" ||
        r.status === "pending" ||
        r.status === "waitlisted" ||
        r.status === "cancellation_pending"
    );
  }, [filteredRequests, viewMode]);

  // Find the user's specific request for the selected date
  const userRequest = useMemo(() => {
    if (!member?.id) return null;
    // Look in localRequests, which is updated in realtime, not just activeRequests
    return localRequests.find(
      (req) =>
        req.member_id === member.id &&
        (req.status === "approved" ||
          req.status === "pending" ||
          req.status === "waitlisted" ||
          req.status === "cancellation_pending")
    );
  }, [localRequests, member?.id]);

  const hasExistingRequest = useMemo(() => {
    // For six month requests, check the hasSixMonthRequest flag
    if (isSixMonthRequest) {
      return hasSixMonthRequest;
    }
    // For regular requests, check if we found a userRequest
    return !!userRequest;
  }, [userRequest, isSixMonthRequest, hasSixMonthRequest]);

  // Handler for cancelling a request
  const handleCancelRequest = useCallback(() => {
    if (!userRequest || !selectedDate) return;
    console.log("[RequestDialog] Initiating request cancellation for:", userRequest.id);

    // Show confirmation dialog instead of immediately canceling
    setCancelType("regular");
    setShowCancelModal(true);
  }, [userRequest, selectedDate]);

  // Handler for confirming cancellation
  const handleConfirmCancel = useCallback(async () => {
    setIsSubmitting(true);
    try {
      if (cancelType === "regular") {
        if (!userRequest || !selectedDate) {
          Toast.show({ type: "error", text1: "Cannot find request to cancel" });
          return;
        }

        // Always use the regular cancellation function which uses the database function
        // that handles all request types correctly, including waitlisted requests
        console.log(
          "[RequestDialog] Cancelling request using database function:",
          userRequest.id,
          "status:",
          userRequest.status
        );
        const success = await cancelRequest(userRequest.id, selectedDate);

        if (success) {
          // Force refresh stats immediately after successful cancellation
          await refreshMyTimeStats(true);

          // Show different messages based on the request status
          if (userRequest.status === "waitlisted") {
            Toast.show({
              type: "success",
              text1: "Request cancelled",
              text2: "Your waitlisted request has been cancelled",
            });
          } else if (userRequest.status === "approved") {
            Toast.show({
              type: "success",
              text1: "Request cancellation initiated",
              text2: "Your approved request is now pending cancellation",
            });
          } else {
            Toast.show({
              type: "success",
              text1: "Request cancelled",
            });
          }

          // Remove the setTimeout
          onClose();
        } else {
          Toast.show({ type: "error", text1: "Failed to cancel request" });
        }
      } else if (cancelType === "six-month") {
        // Six-month cancellation logic remains unchanged
        if (!sixMonthRequestId) {
          Toast.show({ type: "error", text1: "Cannot find six-month request to cancel" });
          return;
        }

        const success = await cancelSixMonthRequest(sixMonthRequestId);
        if (success) {
          // Force refresh stats immediately after successful cancellation
          await refreshMyTimeStats(true);

          Toast.show({ type: "success", text1: "Six-month request cancelled" });
          setHasSixMonthRequest(false); // Update local state
          setSixMonthRequestId(null);

          // Remove the setTimeout
          onClose();
        } else {
          Toast.show({ type: "error", text1: "Failed to cancel six-month request" });
        }
      }
    } catch (error) {
      console.error("[RequestDialog] Error cancelling request:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      Toast.show({
        type: "error",
        text1: "Error cancelling request",
        text2: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      setShowCancelModal(false);
    }
  }, [
    cancelType,
    userRequest,
    selectedDate,
    cancelRequest,
    onClose,
    sixMonthRequestId,
    cancelSixMonthRequest,
    refreshMyTimeStats,
  ]);

  // For six month dates, don't count other users' requests against the allotment
  // But we do want to show the total count of six-month requests
  const currentAllotment = useMemo(() => {
    // Determine if this is truly a six-month request
    const now = new Date();
    const dateObj = parseISO(selectedDate);
    const sixMonthDate = getSixMonthDate();
    const isEndOfMonth = isLastDayOfMonth(now);
    const isSixMonthRequestDate =
      dateObj.getTime() === sixMonthDate.getTime() || // Exact date match
      (isEndOfMonth &&
        dateObj.getMonth() === sixMonthDate.getMonth() &&
        dateObj.getFullYear() === sixMonthDate.getFullYear() &&
        dateObj.getDate() >= sixMonthDate.getDate()); // Same month/year and day is at or after six-month date

    const result = {
      max: localAllotments.max,
      current: isSixMonthRequestDate
        ? totalSixMonthRequests // Show total six-month requests instead of just the user's request
        : activeRequests.length,
    };

    // Log the current allotment for debugging
    if (isSixMonthRequestDate) {
      console.log("[RequestDialog] Six-month allotment:", {
        date: selectedDate,
        max: result.max,
        total: totalSixMonthRequests,
        isEndOfMonth,
        sixMonthDate: format(sixMonthDate, "yyyy-MM-dd"),
      });
    }

    return result;
  }, [localAllotments.max, activeRequests.length, isSixMonthRequest, totalSixMonthRequests, selectedDate]);

  const isFull = currentAllotment.current >= currentAllotment.max;

  // Only display requests that we're showing to the user
  // (don't show six month requests from other users)
  const sortedRequests = useMemo(() => {
    const statusPriority: Record<string, number> = {
      approved: 0,
      pending: 1,
      cancellation_pending: 2, // Show cancellation pending with approved/pending
      waitlisted: 3,
    };

    return [...activeRequests].sort((a, b) => {
      const aStatusPriority = statusPriority[a.status] ?? 999;
      const bStatusPriority = statusPriority[b.status] ?? 999;

      // If status priorities are different, sort by priority
      if (aStatusPriority !== bStatusPriority) return aStatusPriority - bStatusPriority;

      // If both are waitlisted, sort by waitlist position (ascending)
      if (a.status === "waitlisted" && b.status === "waitlisted") {
        return (a.waitlist_position || 0) - (b.waitlist_position || 0);
      }

      // Otherwise, sort by requested time (ascending)
      return new Date(a.requested_at || "").getTime() - new Date(b.requested_at || "").getTime();
    });
  }, [activeRequests]);

  // Split sorted requests into approved/pending/cancellation_pending and waitlisted
  const approvedPendingRequests = useMemo(() => {
    return sortedRequests.filter(
      (r) => r.status === "approved" || r.status === "pending" || r.status === "cancellation_pending"
    );
  }, [sortedRequests]);

  const waitlistedRequests = useMemo(() => {
    return sortedRequests.filter((r) => r.status === "waitlisted");
  }, [sortedRequests]);

  // Calculate capped filled spots and waitlist count
  const filledSpotsCapped = useMemo(() => {
    if (isSixMonthRequest) return currentAllotment.current;
    return Math.min(approvedPendingRequests.length, currentAllotment.max);
  }, [approvedPendingRequests.length, currentAllotment.max, currentAllotment.current, isSixMonthRequest]);

  const waitlistCount = useMemo(() => {
    if (isSixMonthRequest) return 0; // Waitlist doesn't apply to six-month view
    return waitlistedRequests.length;
  }, [waitlistedRequests.length, isSixMonthRequest]);

  const isFullMessage = useMemo(() => {
    if (currentAllotment.max <= 0) {
      return "No days allocated for this date";
    }

    // Show message about existing six-month request - only if user already submitted one
    if (hasSixMonthRequest && isSixMonthRequest) {
      // Don't show if userRequest exists (it implies a regular request which is handled below)
      if (!userRequest) return "You already have a six-month request pending for this date";
    }

    // If this is a six month request, show special message (unless user has existing)
    if (isSixMonthRequest && !hasExistingRequest) {
      return "Six-month requests are processed by seniority and do not count against daily allotment";
    }

    // Check if user has an existing request (regular or six-month request that became regular)
    if (hasExistingRequest) {
      const status = userRequest?.status === "cancellation_pending" ? "Cancellation Pending" : userRequest?.status;
      return `You have a request for this date (Status: ${status})`;
    }

    // Only show "day is full" if there are no waitlisted spots AND approved/pending is full
    if (approvedPendingRequests.length >= currentAllotment.max && waitlistCount === 0) {
      return `This day is full (${filledSpotsCapped}/${currentAllotment.max})`;
    }

    return null;
  }, [
    currentAllotment.max,
    hasExistingRequest,
    hasSixMonthRequest,
    isSixMonthRequest,
    approvedPendingRequests.length,
    waitlistCount,
    filledSpotsCapped,
    userRequest,
  ]);

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
      const isDisabled = (timeStats?.available.pld ?? 0) <= 0 || isSubmitting || hasSixMonthRequest;
      return {
        onPress: () => handleSubmit("PLD"),
        disabled: isDisabled,
        loadingState: isSubmitting,
      };
    }

    // For regular requests, ONLY disable for:
    // - No available PLD days
    // - Submission in progress
    // - User already has a request for this date (handled by showing Cancel button)
    // DO NOT disable for full days as that prevents waitlisting
    const isDisabled = (timeStats?.available.pld ?? 0) <= 0 || isSubmitting; // Remove hasExistingRequest check

    return {
      onPress: () => handleSubmit("PLD"),
      disabled: isDisabled,
      loadingState: isSubmitting,
    };
  }, [
    timeStats?.available.pld, // Update dependency
    isSubmitting,
    handleSubmit,
    hasSixMonthRequest, // Keep this for six-month logic
    isSixMonthRequest,
  ]);

  const sdvButtonProps = useMemo(() => {
    // For six-month requests, we allow submission even if the day is full
    // as they are processed by seniority and will be waitlisted if needed
    if (isSixMonthRequest) {
      // Disable if there's already a six-month request or no available days
      const isDisabled = (timeStats?.available.sdv ?? 0) <= 0 || isSubmitting || hasSixMonthRequest;
      return {
        onPress: () => handleSubmit("SDV"),
        disabled: isDisabled,
        loadingState: isSubmitting,
      };
    }

    // For regular requests, ONLY disable for:
    // - No available SDV days
    // - Submission in progress
    // - User already has a request for this date (handled by showing Cancel button)
    // DO NOT disable for full days as that prevents waitlisting
    const isDisabled = (timeStats?.available.sdv ?? 0) <= 0 || isSubmitting; // Remove hasExistingRequest check

    return {
      onPress: () => handleSubmit("SDV"),
      disabled: isDisabled,
      loadingState: isSubmitting,
    };
  }, [
    timeStats?.available.sdv, // Update dependency
    isSubmitting,
    handleSubmit,
    hasSixMonthRequest, // Keep this for six-month logic
    isSixMonthRequest,
  ]);

  // Determine if the user can cancel their request
  const canCancelRequest = useMemo(() => {
    // Can only cancel if there is an existing request and it's not already 'cancelled' or 'denied'
    return userRequest && userRequest.status !== "cancelled" && userRequest.status !== "denied";
  }, [userRequest]);

  // Handler for cancelling a six-month request
  const handleCancelSixMonthRequest = useCallback(() => {
    if (!sixMonthRequestId) return;
    console.log("[RequestDialog] Initiating six-month request cancellation");

    // Show confirmation dialog instead of immediately canceling
    setCancelType("six-month");
    setShowCancelModal(true);
  }, [sixMonthRequestId]);

  // Determine if the user can cancel their six-month request
  const canCancelSixMonthRequest = useMemo(() => {
    return hasSixMonthRequest && sixMonthRequestId; // Can cancel if it exists
  }, [hasSixMonthRequest, sixMonthRequestId]);

  // Add new function to handle allocation adjustment
  const handleAdjustAllocation = () => {
    setNewAllotment(localAllotments.max.toString());
    setAdjustmentError(null);
    setShowAdjustmentModal(true);
  };

  // Add function to save allocation adjustment
  const handleSaveAdjustment = async () => {
    if (!member?.id) return;

    // Validate input
    const allotmentValue = parseInt(newAllotment, 10);
    if (isNaN(allotmentValue) || allotmentValue < 0) {
      setAdjustmentError("Please enter a valid non-negative number");
      return;
    }

    // Check if trying to reduce below approved+pending requests
    const pendingAndApprovedCount = approvedPendingRequests.length;
    if (allotmentValue < pendingAndApprovedCount) {
      setAdjustmentError(
        `Cannot reduce allocation below the current number of approved and pending requests (${pendingAndApprovedCount}).`
      );
      return;
    }

    setIsAdjusting(true);
    setAdjustmentError(null);

    try {
      // Call the appropriate store function based on calendar type
      if (calendarType === "PLD/SDV") {
        await updateDailyAllotment(calendarId, selectedDate, allotmentValue, member.id);
        Toast.show({
          type: "success",
          text1: `Daily allocation updated to ${allotmentValue}`,
          position: "bottom",
        });
      } else {
        await updateWeeklyAllotment(calendarId, selectedDate, allotmentValue, member.id);
        Toast.show({
          type: "success",
          text1: `Weekly allocation updated to ${allotmentValue}`,
          position: "bottom",
        });
      }

      // Close the adjustment modal first
      setShowAdjustmentModal(false);

      // ** TEMP: Keep main dialog open, do not close/reopen **
      // onClose();
      // setTimeout(() => {
      //   console.log("[RequestDialog] Triggering reopen after adjustment");
      //   onAdjustmentComplete();
      // }, 1000);

      // Optional: Maybe trigger a manual refresh of local state ONLY if needed
      // setLastAdjustmentTime(Date.now()); // If we still need this fallback
    } catch (error) {
      console.error("Error adjusting allocation:", error);

      let errorMessage = "An error occurred updating the allocation";
      if (error instanceof Error) {
        // Check for specific Supabase error codes if possible (e.g., from validation trigger)
        if (error.message.includes("check constraint violation")) {
          // Example check
          errorMessage = "Cannot reduce allocation below approved requests.";
        } else {
          errorMessage = error.message;
        }
      }
      setAdjustmentError(errorMessage);

      // Show toast at bottom of screen
      Toast.show({
        type: "error",
        text1: "Failed to update allocation",
        text2: errorMessage,
        position: "bottom",
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  // Add new state for dialog loading
  // const [isDialogLoading, setIsDialogLoading] = useState(false);
  // const initialLoadCompletedRef = useRef(false);

  // Add a ref to track initial load
  // const initialLoadCompletedRef = useRef(false);

  // Modify the effect that handles dialog visibility
  // useEffect(() => {
  //   if (isVisible) {
  //     const loadFreshStats = async () => {
  //       // Only show loading and force refresh on initial open
  //       if (!initialLoadCompletedRef.current) {
  //         setIsDialogLoading(true);
  //         try {
  //           console.log("[RequestDialog] Dialog opened, performing initial stats refresh");
  //           invalidateCache(); // Clear any cached stats
  //           await refreshMyTimeStats(true); // Force fresh stats
  //           initialLoadCompletedRef.current = true;
  //         } catch (error) {
  //           console.error("[RequestDialog] Error refreshing stats:", error);
  //           Toast.show({
  //             type: "error",
  //             text1: "Error",
  //             text2: "Failed to load current statistics",
  //             position: "bottom",
  //           });
  //         } finally {
  //           setIsDialogLoading(false);
  //         }
  //       } else {
  //         console.log("[RequestDialog] Dialog reopened, using existing stats");
  //       }
  //     };
  //
  //     loadFreshStats();
  //   } else {
  //     // Reset the initial load flag when dialog closes
  //     initialLoadCompletedRef.current = false;
  //   }
  // }, [isVisible, refreshMyTimeStats, invalidateCache]);

  // Define isPastView based on viewMode
  const isPastView = viewMode === "past" || viewMode === "nearPast";

  // Add loading indicator to the dialog content
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={() => setTimeout(() => onClose(), 100)}>
      <View style={dialogStyles.modalOverlay}>
        <View style={dialogStyles.modalContent}>
          <ThemedText style={dialogStyles.modalTitle}>Request Day Off - {selectedDate}</ThemedText>

          {/* Main content is always rendered */}
          <View style={dialogStyles.allotmentContainer}>
            <ThemedText style={dialogStyles.allotmentInfo}>
              {isSixMonthRequest
                ? `${totalSixMonthRequests} six-month requests`
                : `${filledSpotsCapped}/${localAllotments.max} spots filled`}{" "}
            </ThemedText>
            {waitlistCount > 0 && !isSixMonthRequest && (
              <ThemedText style={dialogStyles.waitlistInfo}>Waitlist: {waitlistCount}</ThemedText>
            )}
          </View>

          {isFullMessage && (
            <View style={dialogStyles.messageContainer}>
              <ThemedText
                style={[
                  dialogStyles.allotmentInfo,
                  { color: hasExistingRequest ? Colors[theme].tint : Colors[theme].error }, // Use tint color if user has request
                ]}
              >
                {isFullMessage}
              </ThemedText>
            </View>
          )}

          {/* Only show available days if NOT in past/near-past view mode */}
          {!isPastView && (
            <>
              {/* Conditionally render stats or loading indicator */}
              {isMyTimeLoading ? (
                <View style={[dialogStyles.remainingDaysContainer, dialogStyles.loadingContainer]}>
                  <ActivityIndicator size="small" color={Colors[theme].tint} />
                  <ThemedText style={dialogStyles.loadingText}>Loading available days...</ThemedText>
                </View>
              ) : (
                <View style={dialogStyles.remainingDaysContainer}>
                  <ThemedText style={dialogStyles.remainingDaysText}>
                    Available PLD Days: {timeStats?.available.pld ?? 0}
                  </ThemedText>
                  <ThemedText style={dialogStyles.remainingDaysText}>
                    Available SDV Days: {timeStats?.available.sdv ?? 0}
                  </ThemedText>
                </View>
              )}
            </>
          )}

          <ScrollView style={dialogStyles.requestList}>
            {/* Approved/Pending/Cancellation Pending Requests */}
            {approvedPendingRequests.map((request, index) => (
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
                      request.status === "cancellation_pending" && dialogStyles.cancellationPendingStatus,
                      request.status === "pending" && dialogStyles.pendingStatus, // Add style for pending
                    ]}
                  >
                    {request.status === "cancellation_pending"
                      ? "Cancellation Pending"
                      : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </ThemedText>
                </View>
              </View>
            ))}

            {/* Available Spots */}
            {!isSixMonthRequest &&
              Array.from({
                length: Math.max(0, currentAllotment.max - approvedPendingRequests.length),
              }).map((_, index) => (
                <View key={`empty-${index}`} style={dialogStyles.requestSpot}>
                  <ThemedText style={dialogStyles.spotNumber}>#{approvedPendingRequests.length + index + 1}</ThemedText>
                  <ThemedText style={dialogStyles.emptySpot}>Available</ThemedText>
                </View>
              ))}

            {/* Waitlisted Requests */}
            {waitlistCount > 0 && !isSixMonthRequest && (
              <>
                <ThemedText style={dialogStyles.waitlistHeader}>Waitlist</ThemedText>
                {waitlistedRequests.map((request, index) => (
                  <View key={request.id} style={dialogStyles.requestSpot}>
                    <ThemedText style={dialogStyles.spotNumber}>#{index + 1}</ThemedText>
                    <View style={dialogStyles.spotInfo}>
                      <ThemedText>
                        {request.member.first_name} {request.member.last_name}
                      </ThemedText>
                      <ThemedText style={[dialogStyles.requestStatus, dialogStyles.waitlistedStatus]}>
                        Waitlisted #{request.waitlist_position || index + 1}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Note for Six Month Requests */}
            {isSixMonthRequest && (
              <View key="six-month-note" style={dialogStyles.requestSpot}>
                <ThemedText style={{ ...dialogStyles.emptySpot, textAlign: "center", flex: 1 }}>
                  Six month requests are processed by seniority
                </ThemedText>
              </View>
            )}
          </ScrollView>

          <View style={dialogStyles.modalButtons}>
            {Platform.OS === "web" ? (
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <ThemedText style={dialogStyles.closeButtonText}>Close</ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <ThemedText style={dialogStyles.closeButtonText}>Close</ThemedText>
              </TouchableOpacity>
            )}

            {/* --- Conditionally render action buttons only if not past view --- */}
            {!isPastView && (
              <>
                {/* Conditional rendering for Request/Cancel buttons */}
                {isSixMonthRequest ? (
                  // --- SIX MONTH REQUEST DATE ---
                  canCancelSixMonthRequest ? (
                    // User has an existing, cancellable six-month request
                    Platform.OS === "web" ? (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmitting && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelSixMonthRequest}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>Cancel Six-Month Request</ThemedText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmitting && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelSixMonthRequest}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>Cancel Six-Month Request</ThemedText>
                      </TouchableOpacity>
                    )
                  ) : // User does NOT have an existing six-month request, show either one or both buttons
                  (timeStats?.available.pld ?? 0) <= 0 && (timeStats?.available.sdv ?? 0) > 0 ? (
                    // Only SDV is available, show one button that takes up full width
                    <TouchableOpacity
                      style={[
                        dialogStyles.modalButton,
                        dialogStyles.submitButton,
                        { flex: 2 }, // Take up full width (space of both buttons)
                        sdvButtonProps.disabled && dialogStyles.disabledButton,
                      ]}
                      onPress={sdvButtonProps.onPress}
                      disabled={sdvButtonProps.disabled}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={dialogStyles.modalButtonText}>Request SDV (Six Month)</ThemedText>
                    </TouchableOpacity>
                  ) : (timeStats?.available.sdv ?? 0) <= 0 && (timeStats?.available.pld ?? 0) > 0 ? (
                    // Only PLD is available, show one button that takes up full width
                    <TouchableOpacity
                      style={[
                        dialogStyles.modalButton,
                        dialogStyles.submitButton,
                        { flex: 2 }, // Take up full width (space of both buttons)
                        submitButtonProps.disabled && dialogStyles.disabledButton,
                      ]}
                      onPress={submitButtonProps.onPress}
                      disabled={submitButtonProps.disabled}
                      activeOpacity={0.7}
                    >
                      <ThemedText style={dialogStyles.modalButtonText}>Request PLD (Six Month)</ThemedText>
                    </TouchableOpacity>
                  ) : (
                    // Both PLD and SDV are available or both are unavailable, show both buttons
                    <>
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          submitButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={submitButtonProps.onPress}
                        disabled={submitButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>Request PLD (Six Month)</ThemedText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          sdvButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={sdvButtonProps.onPress}
                        disabled={sdvButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>Request SDV (Six Month)</ThemedText>
                      </TouchableOpacity>
                    </>
                  )
                ) : hasExistingRequest ? (
                  // --- REGULAR REQUEST DATE ---
                  // User has an existing regular request
                  canCancelRequest ? (
                    // Existing regular request IS cancellable
                    Platform.OS === "web" ? (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmitting && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelRequest}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>
                          {userRequest?.status === "cancellation_pending"
                            ? "Cancellation Pending..."
                            : "Cancel My Request"}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmitting && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelRequest}
                        disabled={isSubmitting}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>
                          {userRequest?.status === "cancellation_pending"
                            ? "Cancellation Pending..."
                            : "Cancel My Request"}
                        </ThemedText>
                      </TouchableOpacity>
                    )
                  ) : (
                    // Existing regular request is NOT cancellable (e.g., denied/cancelled)
                    <View style={dialogStyles.modalButtonDisabledPlaceholder}>
                      <ThemedText style={dialogStyles.modalButtonTextDisabled}>Request Cannot Be Cancelled</ThemedText>
                    </View>
                  )
                ) : (
                  // --- REGULAR REQUEST DATE ---
                  // User has NO existing regular request, show PLD/SDV buttons
                  <>
                    {Platform.OS === "web" ? (
                      (timeStats?.available.pld ?? 0) <= 0 && (timeStats?.available.sdv ?? 0) > 0 ? (
                        // Only SDV is available, show one button that takes up full width
                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            { flex: 2 }, // Take up full width (space of both buttons)
                            approvedPendingRequests.length >= currentAllotment.max &&
                            (timeStats?.available.sdv ?? 0) > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            sdvButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={sdvButtonProps.onPress}
                          disabled={sdvButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={dialogStyles.modalButtonText}>
                            {approvedPendingRequests.length >= currentAllotment.max
                              ? "Join Waitlist (SDV)"
                              : "Request SDV"}
                          </ThemedText>
                        </TouchableOpacity>
                      ) : (timeStats?.available.sdv ?? 0) <= 0 && (timeStats?.available.pld ?? 0) > 0 ? (
                        // Only PLD is available, show one button that takes up full width
                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            { flex: 2 }, // Take up full width (space of both buttons)
                            approvedPendingRequests.length >= currentAllotment.max &&
                            (timeStats?.available.pld ?? 0) > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            submitButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={submitButtonProps.onPress}
                          disabled={submitButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={dialogStyles.modalButtonText}>
                            {approvedPendingRequests.length >= currentAllotment.max
                              ? "Join Waitlist (PLD)"
                              : "Request PLD"}
                          </ThemedText>
                        </TouchableOpacity>
                      ) : (
                        // Both PLD and SDV are available or both are unavailable, show both buttons
                        <>
                          <TouchableOpacity
                            style={[
                              dialogStyles.modalButton,
                              dialogStyles.submitButton,
                              approvedPendingRequests.length >= currentAllotment.max &&
                              (timeStats?.available.pld ?? 0) > 0
                                ? dialogStyles.waitlistButton
                                : null,
                              submitButtonProps.disabled && dialogStyles.disabledButton,
                            ]}
                            onPress={submitButtonProps.onPress}
                            disabled={submitButtonProps.disabled}
                            activeOpacity={0.7}
                          >
                            <ThemedText style={dialogStyles.modalButtonText}>
                              {approvedPendingRequests.length >= currentAllotment.max
                                ? "Join Waitlist (PLD)"
                                : "Request PLD"}
                            </ThemedText>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              dialogStyles.modalButton,
                              dialogStyles.submitButton,
                              approvedPendingRequests.length >= currentAllotment.max &&
                              (timeStats?.available.sdv ?? 0) > 0
                                ? dialogStyles.waitlistButton
                                : null,
                              sdvButtonProps.disabled && dialogStyles.disabledButton,
                            ]}
                            onPress={sdvButtonProps.onPress}
                            disabled={sdvButtonProps.disabled}
                            activeOpacity={0.7}
                          >
                            <ThemedText style={dialogStyles.modalButtonText}>
                              {approvedPendingRequests.length >= currentAllotment.max
                                ? "Join Waitlist (SDV)"
                                : "Request SDV"}
                            </ThemedText>
                          </TouchableOpacity>
                        </>
                      )
                    ) : (timeStats?.available.pld ?? 0) <= 0 && (timeStats?.available.sdv ?? 0) > 0 ? (
                      // Only SDV is available, show one button that takes up full width
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          { flex: 2 }, // Take up full width (space of both buttons)
                          approvedPendingRequests.length >= currentAllotment.max && (timeStats?.available.sdv ?? 0) > 0
                            ? dialogStyles.waitlistButton
                            : null,
                          sdvButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={sdvButtonProps.onPress}
                        disabled={sdvButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>
                          {approvedPendingRequests.length >= currentAllotment.max
                            ? "Join Waitlist (SDV)"
                            : "Request SDV"}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (timeStats?.available.sdv ?? 0) <= 0 && (timeStats?.available.pld ?? 0) > 0 ? (
                      // Only PLD is available, show one button that takes up full width
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          { flex: 2 }, // Take up full width (space of both buttons)
                          approvedPendingRequests.length >= currentAllotment.max && (timeStats?.available.pld ?? 0) > 0
                            ? dialogStyles.waitlistButton
                            : null,
                          submitButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={submitButtonProps.onPress}
                        disabled={submitButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={dialogStyles.modalButtonText}>
                          {approvedPendingRequests.length >= currentAllotment.max
                            ? "Join Waitlist (PLD)"
                            : "Request PLD"}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : (
                      // Both PLD and SDV are available or both are unavailable, show both buttons
                      <>
                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            approvedPendingRequests.length >= currentAllotment.max &&
                            (timeStats?.available.pld ?? 0) > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            submitButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={submitButtonProps.onPress}
                          disabled={submitButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={dialogStyles.modalButtonText}>
                            {approvedPendingRequests.length >= currentAllotment.max
                              ? "Join Waitlist (PLD)"
                              : "Request PLD"}
                          </ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            approvedPendingRequests.length >= currentAllotment.max &&
                            (timeStats?.available.sdv ?? 0) > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            sdvButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={sdvButtonProps.onPress}
                          disabled={sdvButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={dialogStyles.modalButtonText}>
                            {approvedPendingRequests.length >= currentAllotment.max
                              ? "Join Waitlist (SDV)"
                              : "Request SDV"}
                          </ThemedText>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {/* --- End conditional action buttons --- */}
          </View>

          {/* Add the Adjust Allocation button for admins, conditionally based on viewMode */}
          {isAdmin && (viewMode === "request" || viewMode === "nearPast") && (
            <View style={dialogStyles.adminButtonContainer}>
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.adjustButton]}
                onPress={handleAdjustAllocation}
                activeOpacity={0.7}
              >
                <ThemedText style={dialogStyles.modalButtonText}>Adjust Allocation</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Allocation Adjustment Modal */}
      <Modal
        visible={showAdjustmentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdjustmentModal(false)}
      >
        <View style={dialogStyles.modalOverlay}>
          <View style={dialogStyles.modalContent}>
            <ThemedText style={dialogStyles.modalTitle}>Adjust {calendarType} Allocation</ThemedText>

            <ThemedText style={dialogStyles.modalDescription}>
              {calendarType === "PLD/SDV"
                ? `Adjust available spots for ${selectedDate}`
                : `Adjust available spots for the week of ${selectedDate}`}
            </ThemedText>

            <ThemedText style={dialogStyles.infoText}>
              Current allocation: {localAllotments.max} spots,{" "}
              {isSixMonthRequest ? totalSixMonthRequests : approvedPendingRequests.length} spots used
            </ThemedText>

            <ThemedText style={dialogStyles.infoText}>
              Note: You cannot reduce allocation below the current number of approved and pending requests.
            </ThemedText>

            <TextInput
              style={{
                width: "40%",
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: Colors[theme].border,
                color: Colors[theme].text,
                marginBottom: 16,
                alignSelf: "center",
                textAlign: "center",
              }}
              keyboardType="numeric"
              value={newAllotment}
              onChangeText={setNewAllotment}
              placeholder="Enter new allocation"
              placeholderTextColor={Colors[theme].textDim}
            />

            {adjustmentError && <ThemedText style={dialogStyles.errorText}>{adjustmentError}</ThemedText>}

            <View style={dialogStyles.modalButtons}>
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
                onPress={() => setShowAdjustmentModal(false)}
                disabled={isAdjusting}
              >
                <ThemedText style={dialogStyles.closeButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  dialogStyles.modalButton,
                  dialogStyles.submitButton,
                  isAdjusting && dialogStyles.disabledButton,
                ]}
                onPress={handleSaveAdjustment}
                disabled={isAdjusting}
              >
                {isAdjusting ? (
                  <ActivityIndicator color={Colors[theme].background} />
                ) : (
                  <ThemedText style={dialogStyles.modalButtonText}>Save</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel Request Confirmation Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={dialogStyles.modalOverlay}>
          <View style={dialogStyles.modalContent}>
            <ThemedText style={dialogStyles.modalTitle}>Confirm Cancellation</ThemedText>
            <ThemedText style={dialogStyles.modalDescription}>
              {cancelType === "regular"
                ? `Are you sure you want to cancel your ${userRequest?.leave_type} request for ${selectedDate}?`
                : "Are you sure you want to cancel your six-month request?"}
            </ThemedText>
            <View style={dialogStyles.modalButtons}>
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
                onPress={() => setShowCancelModal(false)}
                disabled={isSubmitting}
              >
                <ThemedText style={dialogStyles.closeButtonText}>No, Keep It</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  dialogStyles.modalButton,
                  dialogStyles.cancelRequestButton,
                  isSubmitting && dialogStyles.disabledButton,
                ]}
                onPress={handleConfirmCancel}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors[theme].background} />
                ) : (
                  <ThemedText style={dialogStyles.modalButtonText}>Yes, Cancel</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

interface DateControlsProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
  onCurrentDateChange: (date: string) => void;
  onClearDate: () => void; // Add new prop
}

function DateControls({ selectedDate, onDateChange, onCurrentDateChange, onClearDate }: DateControlsProps) {
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
      {/* Add Clear Button */}
      <TouchableOpacity
        style={[controlStyles.clearButton, !selectedDate && controlStyles.clearButtonDisabled]}
        onPress={onClearDate}
        disabled={!selectedDate}
      >
        <ThemedText style={controlStyles.clearButtonText}>Clear Date</ThemedText>
      </TouchableOpacity>
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
    color: Colors.dark.buttonText,
    fontWeight: "600",
  } as TextStyle,
  clearButton: {
    backgroundColor: Colors.dark.buttonBackground,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.buttonText,
    alignItems: "center",
  } as ViewStyle,
  clearButtonDisabled: {
    opacity: 0.5,
  } as ViewStyle,
  clearButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  } as TextStyle,
});

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [activeCalendar, setActiveCalendar] = useState<CalendarType>("PLD/SDV");
  const [currentDate, setCurrentDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const { user, session } = useAuth();
  const { member, division } = useUserStore();
  const [error, setError] = useState<string | null>(null);
  const [requestDialogVisible, setRequestDialogVisible] = useState(false);
  const [calendarName, setCalendarName] = useState<string | null>(null);
  const REFRESH_COOLDOWN = 2000; // 2 seconds
  const [calendarKey, setCalendarKey] = useState(Date.now()); // For forcing calendar re-render

  // Refs
  const isLoadingRef = useRef(false); // Ref for internal load logic coordination
  const mountTimeRef = useRef(Date.now());
  const lastRefreshTimeRef = useRef(Date.now());

  // PLD/SDV Calendar Store Hook
  const {
    selectedDate,
    requests: pldRequests,
    userSubmitRequest,
    submitSixMonthRequest,
    setSelectedDate,
    allotments: pldAllotments,
    yearlyAllotments,
    isInitialized: isPldInitialized,
    isLoading: isPldLoading,
    isDateSelectable,
    error: pldError,
  } = useCalendarStore();

  // Vacation Calendar Store Hook
  const {
    selectedWeek,
    requests: vacationRequests,
    allotments: vacationAllotments,
    isInitialized: isVacationInitialized,
    isLoading: isVacationLoading,
    setSelectedWeek,
    error: vacationError,
  } = useVacationCalendarStore();

  // MyTime Hook
  const { stats, initialize: refreshMyTimeStats } = useMyTime();

  // Combined store errors take precedence over component errors
  const displayError = pldError || vacationError || error;

  // Derive combined loading state from stores
  const isLoading = isPldLoading || isVacationLoading;

  // Effect to fetch calendar name (UI specific, can stay)
  useEffect(() => {
    async function fetchCalendarName() {
      if (!member?.calendar_id) {
        setCalendarName(null);
        return;
      }
      try {
        const { data, error } = await supabase.from("calendars").select("name").eq("id", member.calendar_id).single();
        if (error) throw error;
        setCalendarName(data?.name || "Unknown Calendar");
      } catch (error) {
        console.error("Error fetching calendar name:", error);
        setCalendarName("Error Loading Name");
      }
    }
    fetchCalendarName();
  }, [member?.calendar_id]);

  // Create a stable key for calendar type switching
  const calendarTypeKey = useMemo(
    () => `${activeCalendar}-calendar-${member?.calendar_id}`,
    [activeCalendar, member?.calendar_id]
  );

  // Modify updateCurrentCalendarView to not force re-renders
  const updateCurrentCalendarView = useCallback((newDate: string) => {
    setCurrentDate(newDate);
    console.log(`[CalendarScreen] Updating current view to: ${newDate}`);
  }, []);

  // Handler for day selection
  const handleDayPress = useCallback(
    (date: string) => {
      console.log(`[CalendarScreen] Day pressed: ${date}`);

      if (activeCalendar === "PLD/SDV") {
        setSelectedDate(date);
        // Always attempt to show the dialog for PLD/SDV if a date is pressed
        // The dialog itself will handle view modes (past/request)
        // The Calendar component should prevent pressing truly unavailable dates (>6 months)
        setRequestDialogVisible(true);
      } else if (activeCalendar === "Vacation") {
        setSelectedWeek(date);
        // Optionally open a dialog for vacation weeks too, if applicable
        // setRequestDialogVisible(true);
      }
    },
    [activeCalendar, setSelectedDate, setSelectedWeek] // Removed isDateSelectable dependency
  );

  // Handler for submitting PLD/SDV requests
  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (!selectedDate) return;

    try {
      console.log(`[CalendarScreen] Submitting ${leaveType} request for ${selectedDate}`);

      const now = new Date();
      const dateObj = parseISO(selectedDate);
      const isSixMonthDate = isSameDayWithFormat(selectedDate, getSixMonthDate(), "yyyy-MM-dd");
      const isEndOfMonth = isLastDayOfMonth(now);
      const sixMonthDate = getSixMonthDate();

      // Special debug for problematic dates
      const isSpecialDate = selectedDate.includes("10-31") || selectedDate.includes("04-30");
      if (isSpecialDate) {
        console.log(`[CalendarScreen] Handling special date ${selectedDate}:`, {
          isEndOfMonth,
          sixMonthDate: format(sixMonthDate, "yyyy-MM-dd"),
          selectedMonth: dateObj.getMonth(),
          sixMonthMonth: sixMonthDate.getMonth(),
          selectedYear: dateObj.getFullYear(),
          sixMonthYear: sixMonthDate.getFullYear(),
        });
      }

      // Properly handle six-month requests: either exact date or dates beyond in same month when end-of-month
      const isSixMonthRequest =
        isSixMonthDate ||
        (isEndOfMonth &&
          dateObj.getMonth() === sixMonthDate.getMonth() &&
          dateObj.getFullYear() === sixMonthDate.getFullYear() &&
          dateObj.getDate() >= sixMonthDate.getDate());

      let result;
      if (isSixMonthRequest) {
        result = await submitSixMonthRequest(selectedDate, leaveType);
      } else {
        result = await userSubmitRequest(selectedDate, leaveType);
      }

      if (result) {
        // Force refresh stats immediately after successful request
        await refreshMyTimeStats(true);

        Toast.show({
          type: "success",
          text1: "Success",
          text2: `Your ${leaveType} request has been submitted.`,
          position: "bottom",
          visibilityTime: 3000,
        });

        // Simply close the dialog
        setRequestDialogVisible(false);
      }
    } catch (err) {
      console.error("[CalendarScreen] Error submitting request:", err);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err instanceof Error ? err.message : "Failed to submit request",
        position: "bottom",
        visibilityTime: 4000,
      });
    }
  };

  // Handler for Today button
  const handleTodayPress = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    updateCurrentCalendarView(today); // Use the combined update function
    if (activeCalendar === "PLD/SDV") {
      setSelectedDate(today); // Also select today for PLD/SDV
    } else {
      setSelectedWeek(null);
    }
    // calendarKey update is now handled by updateCurrentCalendarView
  };

  // Callback to reopen the dialog after adjustment
  const handleAdjustmentComplete = async () => {
    console.log("[CalendarScreen] Adjustment complete. Reopening dialog.");
    setCalendarKey(Number(Date.now()));
    setRequestDialogVisible(true);
  };

  // --- Conditional Rendering ---

  // Show loading indicator until both stores are initialized by useAuth
  const showInitialLoading = isLoading && (!isPldInitialized || !isVacationInitialized);
  if (showInitialLoading) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
        <ThemedText style={styles.loadingText}>Initializing Calendar...</ThemedText>
      </ThemedView>
    );
  }

  // Show error state if error occurred during loading
  if (displayError) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <Ionicons name="warning-outline" size={48} color={Colors[theme].error} />
        <ThemedText style={styles.errorText}>Error: {displayError}</ThemedText>
      </ThemedView>
    );
  }

  // Check if calendar is assigned after initialization
  if (!member?.calendar_id) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors[theme].warning} />
        <ThemedText style={styles.errorText}>Calendar not assigned.</ThemedText>
        <ThemedText style={{ textAlign: "center" }}>Please contact support or your division admin.</ThemedText>
      </ThemedView>
    );
  }

  // --- Main Render ---
  return (
    <ThemedView style={styles.container}>
      {/* Header Section */}
      <ThemedView style={styles.headerContainer}>
        <ThemedText style={styles.calendarNameText}>{calendarName || "Loading Calendar..."}</ThemedText>
        <DateControls
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          // *** Pass the combined update function ***
          onCurrentDateChange={updateCurrentCalendarView}
          onClearDate={() => setSelectedDate(null)}
        />
      </ThemedView>

      {/* Calendar Type Tabs */}
      <ThemedView style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeCalendar === "PLD/SDV" && styles.activeTab]}
          onPress={() => setActiveCalendar("PLD/SDV")}
        >
          <ThemedText style={[styles.tabText, activeCalendar === "PLD/SDV" && styles.activeTabText]}>
            PLD/SDV
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeCalendar === "Vacation" && styles.activeTab]}
          onPress={() => setActiveCalendar("Vacation")}
        >
          <ThemedText style={[styles.tabText, activeCalendar === "Vacation" && styles.activeTabText]}>
            Vacation
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {/* Main Calendar Area */}
      <ScrollView style={styles.scrollView}>
        {isLoading && <ActivityIndicator style={{ marginTop: 20 }} size="small" color={Colors[theme].textDim} />}
        {activeCalendar === "PLD/SDV" ? (
          <Calendar key={calendarTypeKey} current={currentDate} onDayActuallyPressed={handleDayPress} />
        ) : (
          <VacationCalendar
            key={calendarTypeKey}
            current={currentDate}
            onDayActuallyPressed={(date) => updateCurrentCalendarView(date)}
          />
        )}
      </ScrollView>

      {/* Determine button and dialog behavior based on selected date */}
      {activeCalendar === "PLD/SDV" &&
        selectedDate &&
        (() => {
          const now = startOfDay(new Date());
          const fortyEightHoursFromNow = startOfDay(addDays(now, 2));
          let selectedDateObj: Date | null = null;
          try {
            selectedDateObj = parseISO(selectedDate);
          } catch (e) {
            /* ignore parsing error */
          }

          // Determine view mode for the dialog
          let viewMode: "past" | "request" | "nearPast" = "request";
          if (selectedDateObj && isBefore(selectedDateObj, now)) {
            viewMode = "past";
          } else if (selectedDateObj && isBefore(selectedDateObj, fortyEightHoursFromNow)) {
            viewMode = "nearPast";
          }

          // Determine button text
          const buttonText =
            viewMode === "past" || viewMode === "nearPast" ? "View Past Requests" : "Request Day / View Requests";

          // Always render the button if a date is selected.
          // The underlying Calendar component prevents pressing >6 month dates.
          return (
            <TouchableOpacity
              style={styles.requestButton}
              onPress={() => setRequestDialogVisible(true)} // Already set in handleDayPress, but safe to keep
              disabled={!isPldInitialized} // Disable if PLD store isn't ready
            >
              <ThemedText style={styles.requestButtonText}>{buttonText}</ThemedText>
            </TouchableOpacity>
          );

          // NOTE: Removed the logic that showed the "not available" banner here,
          // as handleDayPress now always opens the dialog for selected past/present dates.
          // The visual marking comes from getDateAvailability + Calendar component.
        })()}

      {/* Request Button - Only for Vacation if a week is selected */}
      {activeCalendar === "Vacation" && selectedWeek && (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={() => setRequestDialogVisible(true)}
          disabled={!isVacationInitialized} // Disable if Vacation store isn't ready
        >
          <ThemedText style={styles.requestButtonText}>View Week Details</ThemedText>
        </TouchableOpacity>
      )}

      {/* Request Dialog for PLD/SDV - Render conditionally */}
      {requestDialogVisible &&
        activeCalendar === "PLD/SDV" &&
        selectedDate &&
        (() => {
          const now = startOfDay(new Date());
          const fortyEightHoursFromNow = startOfDay(addDays(now, 2));
          let selectedDateObj: Date | null = null;
          try {
            selectedDateObj = parseISO(selectedDate);
          } catch (e) {
            /* ignore parsing error */
          }

          // Determine view mode for the dialog
          let viewMode: "past" | "request" | "nearPast" = "request";
          if (selectedDateObj && isBefore(selectedDateObj, now)) {
            viewMode = "past";
          } else if (selectedDateObj && isBefore(selectedDateObj, fortyEightHoursFromNow)) {
            viewMode = "nearPast";
          }

          return (
            <RequestDialog
              isVisible={requestDialogVisible}
              onClose={() => setRequestDialogVisible(false)}
              onSubmit={handleRequestSubmit}
              selectedDate={selectedDate || ""}
              allotments={{
                max: selectedDate
                  ? pldAllotments[selectedDate] ?? yearlyAllotments[new Date(selectedDate).getFullYear()] ?? 0
                  : 0,
                current: selectedDate && pldRequests[selectedDate] ? pldRequests[selectedDate].length : 0,
              }}
              requests={selectedDate && pldRequests[selectedDate] ? pldRequests[selectedDate] : []}
              calendarType="PLD/SDV"
              calendarId={member?.calendar_id || ""}
              onAdjustmentComplete={handleAdjustmentComplete}
              viewMode={viewMode} // Pass the viewMode prop
            />
          );
        })()}

      {/* Request Dialog - Vacation */}
      {activeCalendar === "Vacation" && (
        <RequestDialog
          isVisible={requestDialogVisible}
          onClose={() => setRequestDialogVisible(false)}
          onSubmit={() => {
            setRequestDialogVisible(false);
          }}
          selectedDate={selectedWeek || ""}
          allotments={{
            max: selectedWeek && vacationAllotments[selectedWeek] ? vacationAllotments[selectedWeek].max_allotment : 0,
            current:
              selectedWeek && vacationAllotments[selectedWeek]
                ? vacationAllotments[selectedWeek].current_requests || 0
                : 0,
          }}
          requests={
            selectedWeek && vacationRequests[selectedWeek]
              ? (vacationRequests[selectedWeek] as any as DayRequest[])
              : []
          }
          calendarType="Vacation"
          calendarId={member?.calendar_id || ""}
          onAdjustmentComplete={handleAdjustmentComplete}
        />
      )}
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
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 15,
  } as ViewStyle,
  loadingText: {
    color: Colors.light.textDim,
    fontWeight: "600",
    textAlign: "center",
  } as TextStyle,
  calendarNameText: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  } as TextStyle,
  headerContainer: {
    width: "100%",
    padding: 16,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  } as ViewStyle,
  notAvailableBanner: {
    backgroundColor: Colors.light.warning,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  } as ViewStyle,
  notAvailableText: {
    color: Colors.light.error,
    fontWeight: "600",
    textAlign: "center",
  } as TextStyle,
  refreshingOverlay: {
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
  refreshingText: {
    color: Colors.light.textDim,
    fontWeight: "600",
    textAlign: "center",
  } as TextStyle,
  todayButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  } as ViewStyle,
  todayButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  } as TextStyle,
  typeSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  } as ViewStyle,
  typeSelectorButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  typeSelectorText: {
    fontSize: 14,
    fontWeight: "500",
  } as TextStyle,
  header: {
    width: "100%",
    padding: 16,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  } as ViewStyle,
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.text,
  } as TextStyle,
  calendarName: {
    fontSize: 18,
    fontWeight: "500",
    color: Colors.dark.textDim,
    marginTop: 8,
  } as TextStyle,
  errorDescription: {
    color: Colors.light.textDim,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 16,
  } as TextStyle,
  retryButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  } as ViewStyle,
  retryButtonText: {
    color: "white",
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
    ...Platform.select({
      ios: {
        paddingBottom: 26, // Additional padding for iOS
      },
      android: {
        paddingBottom: 26, // Additional padding for Android
      },
      default: {
        paddingBottom: 20, // Keep original padding for web
      },
    }),
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
    minHeight: Platform.OS === "web" ? 44 : 48, // Taller buttons on mobile
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2.22,
      },
      android: {
        elevation: 3,
      },
    }),
  } as ViewStyle,
  modalButtonText: {
    fontSize: Platform.OS === "web" ? 14 : 16,
    fontWeight: "600",
    color: "black",
    textAlign: "center",
    lineHeight: Platform.OS === "web" ? 16 : 20,
  } as TextStyle,
  closeButtonText: {
    fontSize: Platform.OS === "web" ? 14 : 16,
    fontWeight: "600",
    color: Platform.OS === "web" ? Colors.dark.buttonText : Colors.dark.secondary,
    textAlign: "center",
    lineHeight: Platform.OS === "web" ? 16 : 20,
  } as TextStyle,
  cancelButton: {
    backgroundColor: Platform.OS === "web" ? Colors.dark.border : Colors.dark.card,
    flexGrow: 0,
    flexBasis: "auto",
    paddingHorizontal: 20,
    minWidth: Platform.OS === "web" ? 80 : 100,
    borderWidth: Platform.OS === "web" ? 0 : 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.buttonText,
  } as ViewStyle,
  submitButton: {
    backgroundColor: Colors.light.primary,
  } as ViewStyle,
  waitlistButton: {
    backgroundColor: Colors.light.warning,
  } as ViewStyle,
  cancelRequestButton: {
    backgroundColor: Colors.light.error,
    flex: 2,
  } as ViewStyle,
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  } as ViewStyle,
  disabledButton: {
    opacity: 0.5,
    backgroundColor: Colors.dark.border,
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
    fontWeight: "500",
  } as TextStyle,
  waitlistHeader: {
    marginTop: 10,
    marginBottom: 5,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.light.warning,
  } as TextStyle,
  approvedStatus: {
    color: Colors.light.success,
  } as TextStyle,
  pendingStatus: {
    color: Colors.light.warning,
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
  messageContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  } as ViewStyle,
  cancellationPendingStatus: {
    color: Colors.light.warning,
  } as TextStyle,
  modalButtonDisabledPlaceholder: {
    flex: 2,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.card,
    opacity: 0.7,
  } as ViewStyle,
  modalButtonTextDisabled: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.textDim,
    textAlign: "center",
    lineHeight: 16,
  } as TextStyle,
  modalDescription: {
    fontSize: 16,
    marginVertical: 16,
    textAlign: "center",
    paddingHorizontal: 8,
  } as TextStyle,
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  } as ViewStyle,
  // Admin adjustment button styles
  adminButtonContainer: {
    marginTop: 16,
    width: "100%",
    alignItems: "center",
  } as ViewStyle,
  adjustButton: {
    backgroundColor: Colors.light.primary,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  } as ViewStyle,
  infoText: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.textDim,
    marginBottom: 8,
    textAlign: "center",
  } as TextStyle,
  textInput: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    marginBottom: 16,
  } as TextStyle,
  errorText: {
    color: Colors.light.error,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
  } as TextStyle,
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  } as ViewStyle,
  loadingText: {
    fontSize: 16,
    color: Colors.dark.text,
    marginLeft: 8,
  } as TextStyle,
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10, // Match the modal content border radius
  } as ViewStyle,
  loadingContent: {
    backgroundColor: Colors.dark.card,
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  } as ViewStyle,
});
