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
import { useTimeStore } from "@/store/timeStore";
// Define TimeOffRequest interface based on pld_sdv_requests schema
interface TimeOffRequest {
  id: string;
  member_id: string;
  calendar_id?: string;
  request_date: string;
  date?: string; // Add date field for backward compatibility
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled" | "transferred";
  requested_at?: string;
  waitlist_position?: number;
  responded_at?: string;
  responded_by?: string;
  paid_in_lieu?: boolean;
}

type ColorScheme = keyof typeof Colors;
type CalendarType = "PLD/SDV" | "Vacation";

interface RequestDialogProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmitRequest: (leaveType: "PLD" | "SDV", date: string, isPaidInLieu?: boolean) => Promise<void>; // New submit action
  onCancelRequest: (requestId: string) => Promise<boolean>; // Use store action signature
  onCancelSixMonthRequest: (requestId: string) => Promise<boolean>; // Use store action signature
  selectedDate: string;
  maxAllotment: number; // Pass max allotment
  currentAllotment: number; // Pass current calculated allotment
  requests: DayRequest[]; // Keep requests for display list
  calendarType: CalendarType;
  calendarId: string;
  onAdjustmentComplete: () => void;
  viewMode?: "past" | "request" | "nearPast";
  availablePld: number;
  availableSdv: number;
  isExistingRequestPaidInLieu: boolean; // Flag for PIL status of user's request
  isSubmittingAction: Record<string, boolean>; // Loading state map
  error: string | null; // Error state from store
  onClearError: () => void; // Action to clear store error
}

// --- Start Replace RequestDialog Here ---
function RequestDialog({
  isVisible,
  onClose,
  onSubmitRequest, // Use this prop
  onCancelRequest, // Use this prop
  onCancelSixMonthRequest, // Use this prop
  selectedDate,
  maxAllotment,
  currentAllotment: propCurrentAllotment, // Renamed prop
  requests: allRequests, // Renamed prop for clarity
  calendarType,
  calendarId,
  onAdjustmentComplete,
  viewMode,
  availablePld, // Use this prop
  availableSdv, // Use this prop
  isExistingRequestPaidInLieu, // Use this prop
  isSubmittingAction, // Use this prop
  error: storeError, // Use this prop
  onClearError, // Use this prop
}: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  // Log PIL status for debugging
  useEffect(() => {
    if (isVisible && selectedDate) {
      console.log(`[RequestDialog] Opened dialog for ${selectedDate} with PIL status:`, {
        isExistingRequestPaidInLieu,
        viewMode,
        calendarType,
      });
    }
  }, [isVisible, selectedDate, isExistingRequestPaidInLieu, viewMode, calendarType]);

  const { member } = useUserStore();
  const userRole = useUserStore((state) => state.userRole);
  // Removed useCalendarStore calls for actions

  const updateDailyAllotment = useAdminCalendarManagementStore((state) => state.updateDailyAllotment);
  const updateWeeklyAllotment = useAdminCalendarManagementStore((state) => state.updateWeeklyAllotment);

  // Removed isSubmitting state
  const [hasSixMonthRequest, setHasSixMonthRequest] = useState(false);
  // --- REINTRODUCE local state for six-month count ---
  const [totalSixMonthRequestsState, setTotalSixMonthRequestsState] = useState(0);
  const [localRequests, setLocalRequests] = useState<DayRequest[]>([]);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [sixMonthRequestId, setSixMonthRequestId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<"regular" | "six-month">("regular");
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [newAllotment, setNewAllotment] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [localAllotments, setLocalAllotments] = useState({ max: maxAllotment, current: propCurrentAllotment });

  // Added state for Paid In Lieu toggle
  const [requestAsPaidInLieu, setRequestAsPaidInLieu] = useState(false);

  const isAdmin = userRole === "application_admin" || userRole === "union_admin" || userRole === "division_admin";

  // Update local allotments when props change
  useEffect(() => {
    setLocalAllotments({ max: maxAllotment, current: propCurrentAllotment });
  }, [maxAllotment, propCurrentAllotment]);

  // Initialize local state from props
  useEffect(() => {
    setLocalRequests(allRequests);
  }, [allRequests]);

  // Set up real-time subscription (Uses props.calendarId and propCurrentAllotment)
  useEffect(() => {
    if (!selectedDate || !calendarId || !isVisible) return;

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      console.log("[RequestDialog] Cleaning up existing real-time subscription");
      realtimeChannelRef.current.unsubscribe();
      realtimeChannelRef.current = null;
    }

    console.log("[RequestDialog] Setting up real-time subscription for", selectedDate);
    const channelName = `request-dialog-${selectedDate}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `request_date=eq.${selectedDate} AND calendar_id=eq.${calendarId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          console.log("[RequestDialog] Received pld_sdv_requests update:", payload);
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === "INSERT") {
            setLocalRequests((prev) => {
              if (prev.some((req) => req.id === newRecord.id)) return prev;
              supabase
                .from("members")
                .select("id, first_name, last_name, pin_number")
                .eq("id", newRecord.member_id)
                .single()
                .then(({ data: memberData, error }) => {
                  if (!error && memberData) {
                    const newRequest: DayRequest = {
                      ...newRecord,
                      member: { ...memberData, pin_number: memberData.pin_number || 0 },
                    };
                    setLocalRequests((currentPrev) =>
                      currentPrev.some((req) => req.id === newRecord.id) ? currentPrev : [...currentPrev, newRequest]
                    );
                  }
                });
              return prev;
            });
          } else if (eventType === "UPDATE") {
            setLocalRequests((prev) =>
              prev.map((req) =>
                req.id === newRecord.id ? { ...req, ...newRecord, member: newRecord.member || req.member } : req
              )
            );

            // Only update time stats if it affects the current user
            if (member && newRecord.member_id === member.id) {
              // Do a targeted update instead of refreshing the entire time store
              if (newRecord.status !== oldRecord.status) {
                console.log(`[RequestDialog] Request status changed: ${oldRecord.status} -> ${newRecord.status}`);
                // Only update the specific piece of state that changed instead of refreshing everything
              }
            }
          } else if (eventType === "DELETE") {
            setLocalRequests((prev) => prev.filter((req) => req.id !== oldRecord.id));
          }
        }
      )
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
          if (newRecord && typeof newRecord === "object" && "max_allotment" in newRecord) {
            try {
              const newAllotmentValue = {
                max: newRecord.max_allotment,
                current: newRecord.current_requests ?? propCurrentAllotment,
              };
              console.log("[RequestDialog] Updating allotment:", newAllotmentValue);
              setLocalAllotments(newAllotmentValue);

              // Only fetch requests if allotment changed significantly
              if (newAllotmentValue.max !== localAllotments.max) {
                const { data, error } = await supabase
                  .from("pld_sdv_requests")
                  .select(
                    `id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, member:members!inner (id, first_name, last_name, pin_number)`
                  )
                  .eq("calendar_id", calendarId)
                  .eq("request_date", selectedDate);
                if (!error && data) {
                  setLocalRequests(data as unknown as DayRequest[]);
                  console.log(`[RequestDialog] Updated requests after allotment change: ${data.length} requests`);
                }
              }
            } catch (error) {
              console.error("[RequestDialog] Error refreshing after allotment update:", error);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log("[RequestDialog] Subscription status:", status);
      });

    realtimeChannelRef.current = channel;

    return () => {
      console.log("[RequestDialog] Cleaning up real-time subscription on unmount/update");
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedDate, calendarId, isVisible, propCurrentAllotment, member?.id]);

  // Modified handleSubmit to avoid unnecessary refreshes
  const handleSubmit = async (leaveType: "PLD" | "SDV") => {
    // No local isSubmitting state needed

    const currentChannel = realtimeChannelRef.current;
    if (currentChannel) {
      console.log("[RequestDialog] Temporarily disabling real-time updates during submission");
      realtimeChannelRef.current = null;
      currentChannel.unsubscribe();
    }

    try {
      // Use props.onSubmitRequest, passing the PIL flag
      await onSubmitRequest(leaveType, selectedDate, requestAsPaidInLieu);

      // If successful, reset PIL toggle
      setRequestAsPaidInLieu(false);

      // The stores already have their own realtime subscriptions
      // No need to manually refresh them here

      // Re-enable realtime for this dialog
      setTimeout(() => {
        if (isVisible && selectedDate && calendarId) {
          console.log("[RequestDialog] Re-enabling real-time updates after successful submission");
          // Re-setup subscription (logic is identical to the initial setup in useEffect)
          const channelName = `request-dialog-${selectedDate}-${Date.now()}`;
          const channel = supabase
            .channel(channelName)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "pld_sdv_requests",
                filter: `request_date=eq.${selectedDate} AND calendar_id=eq.${calendarId}`,
              },
              (payload: RealtimePostgresChangesPayload<any>) => {
                console.log("[RequestDialog] Received pld_sdv_requests update (re-sub):", payload);
                const { eventType, new: newRecord, old: oldRecord } = payload;
                if (eventType === "INSERT") {
                  setLocalRequests((prev) => {
                    if (prev.some((req) => req.id === newRecord.id)) return prev;
                    supabase
                      .from("members")
                      .select("id, first_name, last_name, pin_number")
                      .eq("id", newRecord.member_id)
                      .single()
                      .then(({ data: memberData, error }) => {
                        if (!error && memberData) {
                          const newRequest: DayRequest = {
                            ...newRecord,
                            member: { ...memberData, pin_number: memberData.pin_number || 0 },
                          };
                          setLocalRequests((currentPrev) =>
                            currentPrev.some((req) => req.id === newRecord.id)
                              ? currentPrev
                              : [...currentPrev, newRequest]
                          );
                        }
                      });
                    return prev;
                  });
                } else if (eventType === "UPDATE") {
                  setLocalRequests((prev) =>
                    prev.map((req) =>
                      req.id === newRecord.id ? { ...req, ...newRecord, member: newRecord.member || req.member } : req
                    )
                  );

                  // Only update if status changed
                  if (newRecord.status !== oldRecord.status) {
                    console.log(`[RequestDialog] Request status changed: ${oldRecord.status} -> ${newRecord.status}`);
                  }
                } else if (eventType === "DELETE") {
                  setLocalRequests((prev) => prev.filter((req) => req.id !== oldRecord.id));
                }
              }
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "pld_sdv_allotments",
                filter: `date=eq.${selectedDate}`,
              },
              async (payload: RealtimePostgresChangesPayload<any>) => {
                console.log("[RequestDialog] Received allotment update (re-sub):", payload);
                const { new: newRecord } = payload;
                if (newRecord && typeof newRecord === "object" && "max_allotment" in newRecord) {
                  try {
                    const newAllotmentValue = {
                      max: newRecord.max_allotment,
                      current: newRecord.current_requests ?? propCurrentAllotment,
                    };
                    console.log("[RequestDialog] Updating allotment (re-sub):", newAllotmentValue);
                    setLocalAllotments(newAllotmentValue);

                    // Only fetch if value changed significantly
                    if (newAllotmentValue.max !== localAllotments.max) {
                      const { data, error } = await supabase
                        .from("pld_sdv_requests")
                        .select(
                          `id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, member:members!inner (id, first_name, last_name, pin_number)`
                        )
                        .eq("calendar_id", calendarId)
                        .eq("request_date", selectedDate);
                      if (!error && data) {
                        setLocalRequests(data as unknown as DayRequest[]);
                        console.log(
                          `[RequestDialog] Updated requests after allotment change (re-sub): ${data.length} requests`
                        );
                      }
                    }
                  } catch (error) {
                    console.error("[RequestDialog] Error refreshing after allotment update (re-sub):", error);
                  }
                }
              }
            )
            .subscribe((status) => console.log(`[RequestDialog] Re-subscription status (${channelName}):`, status));
          realtimeChannelRef.current = channel;
        }
      }, 1000);
    } catch (err) {
      console.error("[RequestDialog] Error in handleSubmit:", err);
    }
  };

  // Updated useEffect for six-month check (uses member.id, no store dependency)
  useEffect(() => {
    if (selectedDate && isVisible && member?.id) {
      const checkForSixMonthRequest = async () => {
        const { data: existingSixMonthReq, error } = await supabase
          .from("six_month_requests")
          .select("id")
          .eq("member_id", member.id)
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
        }
      };
      checkForSixMonthRequest();
    } else {
      setHasSixMonthRequest(false);
      setSixMonthRequestId(null);
    }
  }, [selectedDate, isVisible, member?.id]);

  // --- Start Replace isSixMonthRequest Memo ---
  const isSixMonthRequest = useMemo(() => {
    if (calendarType === "Vacation") return false;
    // Add guard for selectedDate being a valid string
    if (typeof selectedDate !== "string" || !selectedDate) {
      return false;
    }
    try {
      const now = new Date();
      // Ensure selectedDate is parsed safely
      const dateObj = parseISO(selectedDate);
      // Use Date object directly from getSixMonthDate
      const sixMonthDate = getSixMonthDate();
      const isEndOfMonth = isLastDayOfMonth(now);

      // Compare dates using startOfDay to ignore time components
      // Make sure startOfDay is imported from date-fns if not already
      const isExactSixMonthDate = startOfDay(dateObj).getTime() === startOfDay(sixMonthDate).getTime();

      const result =
        isExactSixMonthDate ||
        (isEndOfMonth &&
          dateObj.getMonth() === sixMonthDate.getMonth() &&
          dateObj.getFullYear() === sixMonthDate.getFullYear() &&
          dateObj.getDate() >= sixMonthDate.getDate());

      return result;
    } catch (e) {
      console.error(`[isSixMonthRequest] Error parsing date: ${selectedDate}`, e);
      return false; // Return false if parsing fails
    }
  }, [selectedDate, calendarType]);
  // --- End Replace isSixMonthRequest Memo ---

  // --- Update useEffect for fetching total six-month requests ---
  useEffect(() => {
    // Reset count when dependencies change
    setTotalSixMonthRequestsState(0);

    if (selectedDate && isVisible && isSixMonthRequest && calendarId) {
      const fetchTotalSixMonthRequests = async () => {
        try {
          console.log(`[RequestDialog] Fetching six-month requests for date: ${selectedDate}, calendar: ${calendarId}`);
          const { data, error } = await supabase.rpc("count_six_month_requests_by_date", {
            p_request_date: selectedDate,
            p_calendar_id: calendarId,
          });

          if (error) {
            console.error("[RequestDialog] Error counting six-month requests via RPC:", error);
            // Fallback logic...
            const { count: fallbackCount, error: fallbackError } = await supabase
              .from("six_month_requests")
              .select("*", { count: "exact", head: true })
              .eq("request_date", selectedDate)
              .eq("calendar_id", calendarId);
            if (fallbackError) {
              console.error("[RequestDialog] Fallback query error:", fallbackError);
              setTotalSixMonthRequestsState(0); // Set state on error
            } else {
              console.log(`[RequestDialog] Fallback found ${fallbackCount ?? 0} records.`);
              setTotalSixMonthRequestsState(fallbackCount ?? 0); // Use local state setter
            }
            return;
          }

          const count = data || 0;
          console.log(`[RequestDialog] Found ${count} six-month requests for date ${selectedDate} via RPC`);
          // --- Use local state setter ---
          setTotalSixMonthRequestsState(count);

          // Setup realtime subscription for six_month_requests
          const sixMonthChannelName = `request-dialog-six-month-${selectedDate}-${Date.now()}`;
          const sixMonthChannel = supabase
            .channel(sixMonthChannelName)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "six_month_requests", filter: `request_date=eq.${selectedDate}` },
              async (payload) => {
                console.log("[RequestDialog] Received six-month request update:", payload);
                // Refresh the count on update
                try {
                  const { data: refreshData, error: refreshError } = await supabase.rpc(
                    "count_six_month_requests_by_date",
                    { p_request_date: selectedDate, p_calendar_id: calendarId }
                  );
                  if (!refreshError) {
                    const newCount = refreshData || 0;
                    console.log(`[RequestDialog] Updated six-month request count: ${newCount}`);
                    // --- Use local state setter ---
                    setTotalSixMonthRequestsState(newCount);
                  }
                } catch (refreshErr) {
                  console.error("[RequestDialog] Error refreshing six-month request count:", refreshErr);
                }
              }
            )
            .subscribe((status) => console.log(`Six-month sub status (${sixMonthChannelName}):`, status));

          // Combine cleanup if other channel exists (improved logic)
          const existingChannel = realtimeChannelRef.current;
          realtimeChannelRef.current = {
            // Store the new channel or a combined unsubscriber
            unsubscribe: () => {
              console.log(`[RequestDialog] Unsubscribing six-month channel: ${sixMonthChannelName}`);
              sixMonthChannel.unsubscribe();
              if (existingChannel && existingChannel !== sixMonthChannel) {
                console.log(`[RequestDialog] Unsubscribing previous channel during combine`);
                existingChannel.unsubscribe();
              }
            },
          } as RealtimeChannel;
        } catch (error) {
          console.error("[RequestDialog] Exception in fetchTotalSixMonthRequests:", error);
          // --- Use local state setter ---
          setTotalSixMonthRequestsState(0);
        }
      };
      fetchTotalSixMonthRequests();
    }

    // Ensure cleanup runs if dependencies change while subscribed
    return () => {
      if (realtimeChannelRef.current && typeof realtimeChannelRef.current.unsubscribe === "function") {
        console.log("[RequestDialog] Cleaning up six-month fetch effect subscription");
        realtimeChannelRef.current.unsubscribe();
        realtimeChannelRef.current = null; // Clear ref after unsubscribing
      }
    };
  }, [selectedDate, isVisible, isSixMonthRequest, calendarId]);

  // filteredRequests memo remains the same
  const filteredRequests = useMemo(() => {
    if (viewMode === "past" || viewMode === "nearPast") {
      return localRequests.filter((req) => req.status === "approved");
    }
    if (isSixMonthRequest) return [];
    return localRequests;
  }, [localRequests, isSixMonthRequest, viewMode]);

  // activeRequests memo remains the same
  const activeRequests = useMemo(() => {
    if (viewMode === "past" || viewMode === "nearPast") return filteredRequests;
    return filteredRequests.filter(
      (r) =>
        (r.status === "approved" || r.status === "pending" || r.status === "cancellation_pending") && !r.paid_in_lieu
    );
  }, [filteredRequests, viewMode]);

  // userRequest memo handles both regular and PIL requests
  const userRequest = useMemo(() => {
    if (!member?.id) return null;
    return localRequests.find(
      (req) =>
        req.member_id === member.id &&
        ["approved", "pending", "waitlisted", "cancellation_pending"].includes(req.status)
    );
  }, [localRequests, member?.id]);

  // hasExistingRequest memo remains the same but handles PIL logic too
  const hasExistingRequest = useMemo(() => {
    if (isSixMonthRequest) return hasSixMonthRequest;
    // Include isExistingRequestPaidInLieu in the check
    return !!userRequest || isExistingRequestPaidInLieu;
  }, [userRequest, isSixMonthRequest, hasSixMonthRequest, isExistingRequestPaidInLieu]);

  // Modified handleCancelRequest
  const handleCancelRequest = useCallback(() => {
    if (!userRequest || !selectedDate) return;
    setCancelType("regular");
    setShowCancelModal(true);
  }, [userRequest, selectedDate]);

  // Modified handleConfirmCancel to use props actions
  const handleConfirmCancel = useCallback(async () => {
    // No local isSubmitting state
    try {
      let success = false;
      if (cancelType === "regular") {
        if (!userRequest) {
          Toast.show({ type: "error", text1: "Cannot find request to cancel" });
          return;
        }
        success = await onCancelRequest(userRequest.id); // Use prop
        if (success) {
          if (userRequest.status === "waitlisted")
            Toast.show({ type: "success", text1: "Request cancelled", text2: "Your waitlisted request was cancelled" });
          else if (userRequest.status === "approved")
            Toast.show({ type: "success", text1: "Cancellation Initiated", text2: "Request pending cancellation" });
          else Toast.show({ type: "success", text1: "Request cancelled" });

          // No need to manually refresh - the realtime handlers will update the UI
        } // Error handled by store
      } else if (cancelType === "six-month") {
        if (!sixMonthRequestId) {
          Toast.show({ type: "error", text1: "Cannot find six-month request to cancel" });
          return;
        }
        success = await onCancelSixMonthRequest(sixMonthRequestId); // Use prop
        if (success) {
          Toast.show({ type: "success", text1: "Six-month request cancelled" });
          setHasSixMonthRequest(false);
          setSixMonthRequestId(null);

          // No need to manually refresh - the realtime handlers will update the UI
        } // Error handled by store
      }
    } catch (error) {
      console.error("[RequestDialog] Error confirming cancel (should be handled by store):", error);
    } finally {
      setShowCancelModal(false);
    }
  }, [cancelType, userRequest, selectedDate, onCancelRequest, onClose, sixMonthRequestId, onCancelSixMonthRequest]);

  // Modified displayAllotment calculation to use local state
  const displayAllotment = useMemo(() => {
    const result = {
      max: localAllotments.max,
      current: isSixMonthRequest
        ? totalSixMonthRequestsState // Use local state
        : activeRequests.length,
    };
    return result;
    // Use local state in dependency array
  }, [localAllotments.max, activeRequests.length, isSixMonthRequest, totalSixMonthRequestsState, selectedDate]);

  // sortedRequests, approvedPendingRequests, waitlistedRequests memos remain the same
  const sortedRequests = useMemo(() => {
    const statusPriority: Record<string, number> = { approved: 0, pending: 1, cancellation_pending: 2, waitlisted: 3 };
    return [...localRequests]
      .filter((r) => !r.paid_in_lieu)
      .sort((a, b) => {
        const aStatusPriority = statusPriority[a.status] ?? 999;
        const bStatusPriority = statusPriority[b.status] ?? 999;
        if (aStatusPriority !== bStatusPriority) return aStatusPriority - bStatusPriority;
        if (a.status === "waitlisted" && b.status === "waitlisted") {
          const aPos = a.waitlist_position ?? Infinity;
          const bPos = b.waitlist_position ?? Infinity;
          return aPos - bPos;
        }
        const aTime = a.requested_at ? new Date(a.requested_at).getTime() : 0;
        const bTime = b.requested_at ? new Date(b.requested_at).getTime() : 0;
        return aTime - bTime;
      });
  }, [localRequests]);

  const approvedPendingRequests = useMemo(
    () => sortedRequests.filter((r) => ["approved", "pending", "cancellation_pending"].includes(r.status)),
    [sortedRequests]
  );
  const waitlistedRequests = useMemo(() => sortedRequests.filter((r) => r.status === "waitlisted"), [sortedRequests]);

  // Modified filledSpotsCapped/waitlistCount to use displayAllotment
  const filledSpotsCapped = useMemo(
    () =>
      isSixMonthRequest ? displayAllotment.current : Math.min(approvedPendingRequests.length, displayAllotment.max),
    [approvedPendingRequests.length, displayAllotment, isSixMonthRequest]
  );
  const waitlistCount = useMemo(
    () => (isSixMonthRequest ? 0 : waitlistedRequests.length),
    [waitlistedRequests.length, isSixMonthRequest]
  );

  const isFullMessage = useMemo(() => {
    if (displayAllotment.max <= 0) return "No days allocated for this date";
    if (hasSixMonthRequest && isSixMonthRequest && !userRequest)
      return "You already have a six-month request pending for this date";
    if (isSixMonthRequest && !hasExistingRequest) return "Six-month requests are processed by seniority";

    // Added specific display for PIL requests - check isExistingRequestPaidInLieu FIRST
    if (isExistingRequestPaidInLieu) {
      // The user has a PIL request for this date
      const status =
        userRequest?.status === "cancellation_pending" ? "Cancellation Pending" : userRequest?.status || "Pending";
      return `You have a Paid in Lieu request for this date`;
    } else if (hasExistingRequest && userRequest) {
      // Regular request
      const status = userRequest.status === "cancellation_pending" ? "Cancellation Pending" : userRequest.status;
      return `You have a request for this date (Status: ${status})`;
    }

    if (approvedPendingRequests.length >= displayAllotment.max && waitlistCount === 0)
      return `This day is full (${filledSpotsCapped}/${displayAllotment.max})`;
    return null;
  }, [
    displayAllotment.max,
    hasExistingRequest,
    hasSixMonthRequest,
    isExistingRequestPaidInLieu,
    isSixMonthRequest,
    approvedPendingRequests.length,
    waitlistCount,
    filledSpotsCapped,
    userRequest,
  ]);

  // Cleanup effects remain the same
  useEffect(() => {
    /* Unsubscribe on unmount */ return () => {
      if (realtimeChannelRef.current) realtimeChannelRef.current.unsubscribe();
    };
  }, []);
  useEffect(() => {
    /* Unsubscribe on close */ if (!isVisible && realtimeChannelRef.current) realtimeChannelRef.current.unsubscribe();
  }, [isVisible]);

  const submitButtonProps = useMemo(() => {
    const actionKey = isSixMonthRequest ? `${selectedDate}-PLD-6mo` : `${selectedDate}-PLD`;
    const isLoading =
      isSubmittingAction[actionKey] ||
      isSubmittingAction["submitRequest"] ||
      isSubmittingAction["submitSixMonthRequest"];

    // Disable when user has a PIL request
    let isDisabled = availablePld <= 0 || isLoading || isExistingRequestPaidInLieu;
    if (isSixMonthRequest) isDisabled = isDisabled || hasSixMonthRequest;

    return { onPress: () => handleSubmit("PLD"), disabled: isDisabled, loadingState: isLoading };
  }, [
    availablePld,
    isSubmittingAction,
    handleSubmit,
    hasSixMonthRequest,
    isSixMonthRequest,
    selectedDate,
    isExistingRequestPaidInLieu,
  ]);

  // Modified sdvButtonProps to also be disabled when user has a PIL request
  const sdvButtonProps = useMemo(() => {
    const actionKey = isSixMonthRequest ? `${selectedDate}-SDV-6mo` : `${selectedDate}-SDV`;
    const isLoading =
      isSubmittingAction[actionKey] ||
      isSubmittingAction["submitRequest"] ||
      isSubmittingAction["submitSixMonthRequest"];

    // Disable when user has a PIL request
    let isDisabled = availableSdv <= 0 || isLoading || isExistingRequestPaidInLieu;
    if (isSixMonthRequest) isDisabled = isDisabled || hasSixMonthRequest;

    return { onPress: () => handleSubmit("SDV"), disabled: isDisabled, loadingState: isLoading };
  }, [
    availableSdv,
    isSubmittingAction,
    handleSubmit,
    hasSixMonthRequest,
    isSixMonthRequest,
    selectedDate,
    isExistingRequestPaidInLieu,
  ]);

  // canCancelRequest memo remains the same
  const canCancelRequest = useMemo(
    () => userRequest && !["cancelled", "denied"].includes(userRequest.status),
    [userRequest]
  );

  // Modified handleCancelSixMonthRequest
  const handleCancelSixMonthRequest = useCallback(() => {
    if (!sixMonthRequestId) return;
    setCancelType("six-month");
    setShowCancelModal(true);
  }, [sixMonthRequestId]);

  // canCancelSixMonthRequest memo remains the same
  const canCancelSixMonthRequest = useMemo(
    () => hasSixMonthRequest && sixMonthRequestId,
    [hasSixMonthRequest, sixMonthRequestId]
  );

  // handleAdjustAllocation remains the same
  const handleAdjustAllocation = () => {
    setNewAllotment(localAllotments.max.toString());
    setAdjustmentError(null);
    setShowAdjustmentModal(true);
  };

  // Modified handleSaveAdjustment
  const handleSaveAdjustment = async () => {
    if (!member?.id) return;
    const allotmentValue = parseInt(newAllotment, 10);
    if (isNaN(allotmentValue) || allotmentValue < 0) {
      setAdjustmentError("Please enter a valid non-negative number");
      return;
    }
    const pendingAndApprovedCount = approvedPendingRequests.length;
    if (allotmentValue < pendingAndApprovedCount) {
      setAdjustmentError(`Cannot reduce allocation below approved/pending requests (${pendingAndApprovedCount}).`);
      return;
    }
    setIsAdjusting(true);
    setAdjustmentError(null);
    try {
      if (calendarType === "PLD/SDV") await updateDailyAllotment(calendarId, selectedDate, allotmentValue, member.id);
      else await updateWeeklyAllotment(calendarId, selectedDate, allotmentValue, member.id);
      Toast.show({ type: "success", text1: `Allocation updated to ${allotmentValue}`, position: "bottom" });
      setShowAdjustmentModal(false);
    } catch (error) {
      console.error("Error adjusting allocation:", error);
      let errorMessage = error instanceof Error ? error.message : "An error occurred updating the allocation";
      setAdjustmentError(errorMessage);
      Toast.show({ type: "error", text1: "Failed to update allocation", text2: errorMessage, position: "bottom" });
    } finally {
      setIsAdjusting(false);
    }
  };

  // isPastView definition remains the same
  const isPastView = viewMode === "past" || viewMode === "nearPast";

  // --- Start of Render ---
  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={dialogStyles.modalOverlay}>
        <View style={dialogStyles.modalContent}>
          {/* Added Clear Error Button */}
          {storeError && (
            <TouchableOpacity onPress={onClearError} style={dialogStyles.clearErrorButton}>
              <Ionicons name="close-circle" size={20} color={Colors[theme].text} />
            </TouchableOpacity>
          )}
          <ThemedText style={dialogStyles.modalTitle}>Request Day Off - {selectedDate}</ThemedText>

          {/* Added Display Store Error */}
          {storeError && (
            <View style={dialogStyles.errorContainer}>
              <ThemedText style={dialogStyles.errorTextDisplay}>{storeError}</ThemedText>
            </View>
          )}

          {/* Main content (Uses displayAllotment, totalSixMonthRequests) */}
          <View style={dialogStyles.allotmentContainer}>
            <ThemedText style={dialogStyles.allotmentInfo}>
              {isSixMonthRequest
                ? `${totalSixMonthRequestsState} six-month requests` // Use local state
                : `${filledSpotsCapped}/${displayAllotment.max} spots filled`}
            </ThemedText>
            {waitlistCount > 0 && !isSixMonthRequest && (
              <ThemedText style={dialogStyles.waitlistInfo}>Waitlist: {waitlistCount}</ThemedText>
            )}
          </View>

          {/* Updated message display logic (Uses isFullMessage) */}
          {isFullMessage && (
            <View style={dialogStyles.messageContainer}>
              <ThemedText
                style={[
                  dialogStyles.allotmentInfo,
                  {
                    color:
                      hasExistingRequest || isExistingRequestPaidInLieu
                        ? isExistingRequestPaidInLieu
                          ? Colors[theme].primary // Use primary color for PIL
                          : Colors[theme].tint // Use tint for regular requests
                        : Colors[theme].error, // Use error for full/unavailable messages
                  },
                ]}
              >
                {isFullMessage}
              </ThemedText>
            </View>
          )}

          {!isPastView && !isExistingRequestPaidInLieu && !hasExistingRequest && !hasSixMonthRequest && (
            <>
              {/* Uses props availablePld/availableSdv */}
              <View style={dialogStyles.remainingDaysContainer}>
                <ThemedText style={dialogStyles.remainingDaysText}>Available PLD Days: {availablePld}</ThemedText>
                <ThemedText style={dialogStyles.remainingDaysText}>Available SDV Days: {availableSdv}</ThemedText>
              </View>
            </>
          )}

          {/* Only show PIL toggle when appropriate */}
          {!isPastView &&
            !hasExistingRequest &&
            !isSixMonthRequest &&
            !isExistingRequestPaidInLieu && // Explicitly check PIL status
            (availablePld > 0 || availableSdv > 0) &&
            (() => {
              // Check if selected date is within 15 days of today
              try {
                const selectedDateObj = parseISO(selectedDate);
                const today = startOfDay(new Date());
                const fifteenDaysFromNow = addDays(today, 15);
                return isBefore(selectedDateObj, fifteenDaysFromNow) && !isBefore(selectedDateObj, today);
              } catch (e) {
                console.error("[RequestDialog] Error checking date range for PIL toggle:", e);
                return false;
              }
            })() && (
              <TouchableOpacity
                style={dialogStyles.pilToggleContainer}
                onPress={() => setRequestAsPaidInLieu(!requestAsPaidInLieu)}
                activeOpacity={0.8}
              >
                <ThemedText style={dialogStyles.pilToggleText}>
                  <Ionicons
                    name={requestAsPaidInLieu ? "checkbox" : "square-outline"}
                    size={24}
                    color={Colors[theme].tint}
                    style={{ marginRight: 8 }}
                  />
                  Request as Paid In Lieu (uses day)
                </ThemedText>
              </TouchableOpacity>
            )}

          <ScrollView style={dialogStyles.requestList}>
            {/* Render request list (logic uses approvedPendingRequests, displayAllotment, waitlistedRequests) */}
            {approvedPendingRequests.map((request, index) => (
              <View key={request.id} style={dialogStyles.requestSpot}>
                {/* --- Restore content --- */}
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
                      request.status === "pending" && dialogStyles.pendingStatus,
                    ]}
                  >
                    {request.status === "cancellation_pending"
                      ? "Cancellation Pending"
                      : request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </ThemedText>
                </View>
              </View>
            ))}
            {!isSixMonthRequest &&
              Array.from({ length: Math.max(0, displayAllotment.max - approvedPendingRequests.length) }).map(
                (_, index) => (
                  <View key={`empty-${index}`} style={dialogStyles.requestSpot}>
                    {/* --- Restore content --- */}
                    <ThemedText style={dialogStyles.spotNumber}>
                      #{approvedPendingRequests.length + index + 1}
                    </ThemedText>
                    <ThemedText style={dialogStyles.emptySpot}>Available</ThemedText>
                  </View>
                )
              )}
            {waitlistCount > 0 && !isSixMonthRequest && (
              <>
                {/* --- Restore content --- */}
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
            {isSixMonthRequest && (
              <View key="six-month-note" style={dialogStyles.requestSpot}>
                {/* --- Restore content --- */}
                <ThemedText style={{ ...dialogStyles.emptySpot, textAlign: "center", flex: 1 }}>
                  Six month requests are processed by seniority
                </ThemedText>
              </View>
            )}
          </ScrollView>

          <View style={dialogStyles.modalButtons}>
            {/* Close Button */}
            <TouchableOpacity
              style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <ThemedText style={dialogStyles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>

            {!isPastView && (
              <>
                {
                  isSixMonthRequest ? (
                    canCancelSixMonthRequest ? (
                      // Cancel Six Month Button (Uses props.isSubmittingAction)
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmittingAction[sixMonthRequestId ?? ""] && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelSixMonthRequest}
                        disabled={isSubmittingAction[sixMonthRequestId ?? ""]}
                        activeOpacity={0.7}
                      >
                        {isSubmittingAction[sixMonthRequestId ?? ""] ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <ThemedText style={dialogStyles.modalButtonText}>Cancel Six-Month Request</ThemedText>
                        )}
                      </TouchableOpacity>
                    ) : // Request Six Month Buttons (PLD/SDV - Uses submitButtonProps, sdvButtonProps)
                    availablePld <= 0 && availableSdv > 0 ? (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          { flex: 2 },
                          sdvButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={sdvButtonProps.onPress}
                        disabled={sdvButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        {sdvButtonProps.loadingState ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <ThemedText style={dialogStyles.modalButtonText}>Request SDV (Six Month)</ThemedText>
                        )}
                      </TouchableOpacity>
                    ) : availableSdv <= 0 && availablePld > 0 ? (
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.submitButton,
                          { flex: 2 },
                          submitButtonProps.disabled && dialogStyles.disabledButton,
                        ]}
                        onPress={submitButtonProps.onPress}
                        disabled={submitButtonProps.disabled}
                        activeOpacity={0.7}
                      >
                        {submitButtonProps.loadingState ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <ThemedText style={dialogStyles.modalButtonText}>Request PLD (Six Month)</ThemedText>
                        )}
                      </TouchableOpacity>
                    ) : (
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
                          {submitButtonProps.loadingState ? (
                            <ActivityIndicator color="#000" />
                          ) : (
                            <ThemedText style={dialogStyles.modalButtonText}>Request PLD (Six Month)</ThemedText>
                          )}
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
                          {sdvButtonProps.loadingState ? (
                            <ActivityIndicator color="#000" />
                          ) : (
                            <ThemedText style={dialogStyles.modalButtonText}>Request SDV (Six Month)</ThemedText>
                          )}
                        </TouchableOpacity>
                      </>
                    )
                  ) : hasExistingRequest && !isExistingRequestPaidInLieu ? (
                    canCancelRequest ? (
                      // Cancel Regular Button (Uses props.isSubmittingAction)
                      <TouchableOpacity
                        style={[
                          dialogStyles.modalButton,
                          dialogStyles.cancelRequestButton,
                          isSubmittingAction[userRequest?.id ?? ""] && dialogStyles.disabledButton,
                        ]}
                        onPress={handleCancelRequest}
                        disabled={isSubmittingAction[userRequest?.id ?? ""]}
                        activeOpacity={0.7}
                      >
                        {isSubmittingAction[userRequest?.id ?? ""] ? (
                          <ActivityIndicator color="#000" />
                        ) : (
                          <ThemedText style={dialogStyles.modalButtonText}>
                            {userRequest?.status === "cancellation_pending"
                              ? "Cancellation Pending..."
                              : "Cancel My Request"}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <View style={dialogStyles.modalButtonDisabledPlaceholder}>
                        <ThemedText style={dialogStyles.modalButtonTextDisabled}>
                          Request Cannot Be Cancelled
                        </ThemedText>
                      </View>
                    )
                  ) : !isExistingRequestPaidInLieu ? (
                    // Request Regular Buttons (PLD/SDV - Uses submitButtonProps, sdvButtonProps, displayAllotment)
                    <>
                      {availablePld <= 0 && availableSdv > 0 ? (
                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            { flex: 2 },
                            approvedPendingRequests.length >= displayAllotment.max && availableSdv > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            sdvButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={sdvButtonProps.onPress}
                          disabled={sdvButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          {sdvButtonProps.loadingState ? (
                            <ActivityIndicator color="#000" />
                          ) : (
                            <ThemedText style={dialogStyles.modalButtonText}>
                              {approvedPendingRequests.length >= displayAllotment.max
                                ? "Join Waitlist (SDV)"
                                : "Request SDV"}
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      ) : availableSdv <= 0 && availablePld > 0 ? (
                        <TouchableOpacity
                          style={[
                            dialogStyles.modalButton,
                            dialogStyles.submitButton,
                            { flex: 2 },
                            approvedPendingRequests.length >= displayAllotment.max && availablePld > 0
                              ? dialogStyles.waitlistButton
                              : null,
                            submitButtonProps.disabled && dialogStyles.disabledButton,
                          ]}
                          onPress={submitButtonProps.onPress}
                          disabled={submitButtonProps.disabled}
                          activeOpacity={0.7}
                        >
                          {submitButtonProps.loadingState ? (
                            <ActivityIndicator color="#000" />
                          ) : (
                            <ThemedText style={dialogStyles.modalButtonText}>
                              {approvedPendingRequests.length >= displayAllotment.max
                                ? "Join Waitlist (PLD)"
                                : "Request PLD"}
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[
                              dialogStyles.modalButton,
                              dialogStyles.submitButton,
                              approvedPendingRequests.length >= displayAllotment.max && availablePld > 0
                                ? dialogStyles.waitlistButton
                                : null,
                              submitButtonProps.disabled && dialogStyles.disabledButton,
                            ]}
                            onPress={submitButtonProps.onPress}
                            disabled={submitButtonProps.disabled}
                            activeOpacity={0.7}
                          >
                            {submitButtonProps.loadingState ? (
                              <ActivityIndicator color="#000" />
                            ) : (
                              <ThemedText style={dialogStyles.modalButtonText}>
                                {approvedPendingRequests.length >= displayAllotment.max
                                  ? "Join Waitlist (PLD)"
                                  : "Request PLD"}
                              </ThemedText>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              dialogStyles.modalButton,
                              dialogStyles.submitButton,
                              approvedPendingRequests.length >= displayAllotment.max && availableSdv > 0
                                ? dialogStyles.waitlistButton
                                : null,
                              sdvButtonProps.disabled && dialogStyles.disabledButton,
                            ]}
                            onPress={sdvButtonProps.onPress}
                            disabled={sdvButtonProps.disabled}
                            activeOpacity={0.7}
                          >
                            {sdvButtonProps.loadingState ? (
                              <ActivityIndicator color="#000" />
                            ) : (
                              <ThemedText style={dialogStyles.modalButtonText}>
                                {approvedPendingRequests.length >= displayAllotment.max
                                  ? "Join Waitlist (SDV)"
                                  : "Request SDV"}
                              </ThemedText>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  ) : null /* End of hasExistingRequest/isExistingRequestPaidInLieu checks */
                }
              </>
            )}
          </View>

          {/* Adjust Allocation Button */}
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

      {/* Allocation Adjustment Modal (Uses localAllotments) */}
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
              Adjust the number of spots available for {selectedDate}.
            </ThemedText>
            <ThemedText style={dialogStyles.infoText}>
              Current allocation: {localAllotments.max} spots,{" "}
              {isSixMonthRequest ? totalSixMonthRequestsState : approvedPendingRequests.length} spots used
            </ThemedText>
            <ThemedText style={dialogStyles.infoText}>
              Note: You cannot reduce allocation below approved/pending requests.
            </ThemedText>
            {/* Apply the correct style object */}
            <TextInput
              style={dialogStyles.textInput}
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
                {/* --- Restore content --- */}
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

      {/* Cancel Request Confirmation Modal (Uses props.isSubmittingAction) */}
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
              Are you sure you want to cancel the request for {selectedDate}?
            </ThemedText>
            <View style={dialogStyles.modalButtons}>
              <TouchableOpacity
                style={[dialogStyles.modalButton, dialogStyles.cancelButton]}
                onPress={() => setShowCancelModal(false)}
                disabled={
                  isSubmittingAction[cancelType === "regular" ? userRequest?.id ?? "" : sixMonthRequestId ?? ""]
                }
              >
                {/* --- Restore content --- */}
                <ThemedText style={dialogStyles.closeButtonText}>No, Keep It</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  dialogStyles.modalButton,
                  dialogStyles.cancelRequestButton,
                  isSubmittingAction[cancelType === "regular" ? userRequest?.id ?? "" : sixMonthRequestId ?? ""] &&
                    dialogStyles.disabledButton,
                ]}
                onPress={handleConfirmCancel}
                disabled={
                  isSubmittingAction[cancelType === "regular" ? userRequest?.id ?? "" : sixMonthRequestId ?? ""]
                }
              >
                {isSubmittingAction[cancelType === "regular" ? userRequest?.id ?? "" : sixMonthRequestId ?? ""] ? (
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
// --- End Replace RequestDialog Here ---

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
    backgroundColor: Colors.dark.card,
    ...(Platform.OS === "web" && {
      position: "sticky",
      top: 0,
      zIndex: 10,
    }),
  } as ViewStyle,
  datePickerContainer: Platform.select({
    web: {
      marginRight: 16,
    },
    default: {
      backgroundColor: Colors.dark.card,
    },
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

  // PLD/SDV Calendar Store Hook (Keep for calendar-specific view state)
  const {
    selectedDate,
    requests: pldRequests, // Calendar store's view of requests
    setSelectedDate,
    allotments: pldAllotments,
    yearlyAllotments,
    isInitialized: isPldInitialized,
    isLoading: isPldLoading,
    isDateSelectable,
    error: pldError,
    sixMonthRequestDays, // Use this correctly named property from the store
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
  // const { stats, initialize: refreshMyTimeStats } = useMyTime(); // Remove old hook usage

  // --- Get data/actions from useMyTime (connected to useTimeStore) ---
  const {
    timeStats,
    // vacationStats, // Not used directly here
    timeOffRequests,
    // vacationRequests: userVacationRequests, // Not used directly here
    isLoading: isMyTimeLoading, // Loading state for time data specifically
    isSubmittingAction, // Loading state for actions (request, cancel)
    // isSubscribing, // Not used directly here
    error: timeStoreError, // Error state from the time store
    // lastRefreshed, // Not used directly here
    initialize: initializeTimeStore, // Called by useAuth
    // cleanup: cleanupTimeStore, // Called by useAuth
    // fetchTimeStats, // Actions can be called if needed, but usually triggered by initialize/refreshAll
    // fetchVacationStats,
    // fetchTimeOffRequests,
    // fetchVacationRequests,
    // handleRealtimeUpdate, // Handled internally by store
    // requestPaidInLieu, // Action for PIL - handled by submit actions with flag
    cancelRequest, // Action from time store
    cancelSixMonthRequest, // Action from time store
    // refreshAll: refreshTimeStore, // Can be used for manual refresh if needed
    submitRequest, // Action from time store
    submitSixMonthRequest, // Action from time store
    clearError, // Action from time store
  } = useMyTime();

  // Set up timeStore initialization and cleanup
  useEffect(() => {
    if (member?.id && !useTimeStore.getState().isInitialized) {
      console.log("[CalendarScreen] Initializing timeStore for member:", member.id);
      initializeTimeStore(member.id)
        .then(() => {
          console.log("[CalendarScreen] timeStore initialized successfully");
          useTimeStore.getState().setIsInitialized(true);
        })
        .catch((err) => {
          console.error("[CalendarScreen] Failed to initialize timeStore:", err);
        });
    }

    return () => {
      // We won't call cleanup here as it might be used elsewhere
      // That should be handled at the app level (i.e., in AuthProvider)
    };
  }, [member?.id, initializeTimeStore]);

  // Set up calendar subscriptions
  useEffect(() => {
    if (member?.id && member?.calendar_id) {
      console.log("[CalendarScreen] Setting up calendar subscriptions");
      const cleanupFn = setupCalendarSubscriptions();

      return cleanupFn; // Return the cleanup function directly
    }
  }, [member?.id, member?.calendar_id]);

  // --- Combine errors (prioritize time store error) ---
  const displayError = timeStoreError || pldError || vacationError;

  // Derive combined loading state from stores
  const isInitialLoading = !isPldInitialized || !isVacationInitialized; // Base on calendar init
  // const isLoading = isPldLoading || isVacationLoading; // Keep for specific calendar loading?

  // --- Step 1: Create a pilRequestsByDate map in CalendarScreen ---
  // Add this after the isInitialLoading calculation, around line 1250-1300

  // Create a map of dates with PIL requests (similar to Calendar.tsx approach)
  const pilRequestsByDate = useMemo(() => {
    if (!member?.id || !timeOffRequests || timeOffRequests.length === 0) return {};

    const pilMap: Record<string, boolean> = {};
    timeOffRequests.forEach((request) => {
      // Check for relevant debug data
      if (request.member_id === member.id) {
        console.log(`[CalendarScreen] Examining timeStore request:`, {
          date: request.request_date, // Just use request_date
          requestDate: request.request_date,
          isPIL: request.paid_in_lieu,
          status: request.status,
        });
      }

      if (
        request.member_id === member.id &&
        request.paid_in_lieu === true &&
        ["approved", "pending", "waitlisted", "cancellation_pending"].includes(request.status)
      ) {
        // Just use request_date (we know it exists because it's required)
        const dateField = request.request_date;
        if (dateField) {
          pilMap[dateField] = true;
          console.log(`[CalendarScreen] Found PIL request in timeStore for ${dateField}:`, request);
        }
      }
    });

    console.log(`[CalendarScreen] Total PIL requests from timeStore: ${Object.keys(pilMap).length}`);
    return pilMap;
  }, [timeOffRequests, member?.id]);

  // --- Step 2: Update isExistingRequestPaidInLieu calculation ---
  // Replace the existing calculation with this:
  const isExistingRequestPaidInLieu = useMemo(() => {
    if (!selectedDate || !member?.id) return false;

    // Check if this date has a PIL request in our map
    const hasPilRequest = pilRequestsByDate[selectedDate] === true;

    if (hasPilRequest) {
      console.log(`[CalendarScreen] Found PIL request for selected date ${selectedDate} in pilRequestsByDate map`);
    }

    return hasPilRequest;
  }, [selectedDate, member?.id, pilRequestsByDate]);

  // Check if the user has a six-month request for the selected date
  const hasSixMonthRequestForSelectedDate = useMemo(() => {
    if (!selectedDate || !sixMonthRequestDays) return false;

    const hasSixMonthRequest = !!sixMonthRequestDays[selectedDate];
    if (hasSixMonthRequest) {
      console.log(`[CalendarScreen] Found six-month request for selected date ${selectedDate} in sixMonthRequestDays`);
    }

    return hasSixMonthRequest;
  }, [selectedDate, sixMonthRequestDays]);

  // --- Step 3: Add additional debugging when opening RequestDialog ---
  // In the code that determines ViewMode before showing RequestDialog, add:

  // DEBUG: Check if we're receiving PIL requests in timeOffRequests
  if (selectedDate) {
    // Check for timeOffRequests and filter safely
    const pilRequests = timeOffRequests.filter((req) => {
      const dateToCheck = req.request_date;
      return dateToCheck === selectedDate && req.paid_in_lieu && req.member_id === member?.id;
    });

    if (pilRequests.length > 0) {
      console.log(`[CalendarScreen] Found PIL requests for selected date ${selectedDate}:`, pilRequests);

      // Also check if these requests appear in calendarStore data
      const calendarRequests = pldRequests[selectedDate] || [];
      const pilInCalendar = member?.id
        ? calendarRequests.filter((req) => req.member_id === member?.id && req.paid_in_lieu)
        : [];

      console.log(`[CalendarScreen] PIL requests in calendarStore:`, pilInCalendar);
    }
  }

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

  // Ref to track whether we've logged diagnostic info for this session
  const hasLoggedDiagnosticsRef = useRef(false);

  // Add diagnostics to track subscription status and six-month state on screen focus
  useFocusEffect(
    useCallback(() => {
      const runDiagnostics = async () => {
        if (!member?.id) return;

        // Log current state of sixMonthRequestDays
        const sixMonthDays = useCalendarStore.getState().sixMonthRequestDays;
        const dayCount = Object.keys(sixMonthDays).length;

        console.log(
          `[CalendarScreen] Screen focused, sixMonthRequestDays: ${dayCount} days:`,
          Object.keys(sixMonthDays)
        );

        // Check if we have a selected date that should be a six-month request
        if (selectedDate && sixMonthDays[selectedDate]) {
          console.log(`[CalendarScreen] Current selected date ${selectedDate} IS in sixMonthRequestDays`);
        } else if (selectedDate) {
          console.log(`[CalendarScreen] Current selected date ${selectedDate} is NOT in sixMonthRequestDays`);
        }

        // If member has calendar_id, check for existing requests directly
        if (member.calendar_id && selectedDate) {
          try {
            // Query the database directly as a diagnostic check
            console.log(`[CalendarScreen] Checking for six-month requests for ${selectedDate} directly from database`);
            const { data, error } = await supabase
              .from("six_month_requests")
              .select("id, request_date")
              .eq("member_id", member.id)
              .eq("request_date", selectedDate)
              .eq("processed", false);

            if (error) {
              console.error("[CalendarScreen] Error checking six-month requests:", error);
            } else if (data && data.length > 0) {
              console.log(
                `[CalendarScreen] Found ${data.length} six-month request(s) in database for date ${selectedDate}:`,
                data
              );

              // Check if this data is reflected in our local state
              if (!sixMonthDays[selectedDate]) {
                console.warn(
                  `[CalendarScreen] DISCREPANCY DETECTED: The six-month request exists in database but is NOT in the store state.`
                );
              }
            } else {
              console.log(`[CalendarScreen] No six-month requests found in database for date ${selectedDate}`);

              // Check if our local state incorrectly thinks we have this request
              if (sixMonthDays[selectedDate]) {
                console.warn(
                  `[CalendarScreen] DISCREPANCY DETECTED: The store state has a six-month request that doesn't exist in the database.`
                );
              }
            }
          } catch (err) {
            console.error("[CalendarScreen] Error during diagnostic check:", err);
          }
        }

        // Only run the more comprehensive diagnostics once per component mount
        if (!hasLoggedDiagnosticsRef.current) {
          console.log("[CalendarScreen] Running initial comprehensive diagnostics");

          // Check ALL six-month requests for the user
          try {
            const { data: allRequests, error: allError } = await supabase
              .from("six_month_requests")
              .select("id, request_date")
              .eq("member_id", member.id)
              .eq("processed", false);

            if (allError) {
              console.error("[CalendarScreen] Error checking all six-month requests:", allError);
            } else {
              const dbDates = allRequests.map((req) => req.request_date);
              const storeDates = Object.keys(sixMonthDays);

              console.log(`[CalendarScreen] Database has ${dbDates.length} six-month requests:`, dbDates);
              console.log(`[CalendarScreen] Store has ${storeDates.length} six-month requests:`, storeDates);

              // Check for dates in DB but not in store
              const missingInStore = dbDates.filter((date) => !sixMonthDays[date]);
              if (missingInStore.length > 0) {
                console.warn(
                  `[CalendarScreen] Found ${missingInStore.length} dates in DB but missing in store:`,
                  missingInStore
                );
              }

              // Check for dates in store but not in DB
              const missingInDb = storeDates.filter((date) => !dbDates.includes(date));
              if (missingInDb.length > 0) {
                console.warn(
                  `[CalendarScreen] Found ${missingInDb.length} dates in store but missing in DB:`,
                  missingInDb
                );
              }
            }
          } catch (err) {
            console.error("[CalendarScreen] Error during comprehensive diagnostic check:", err);
          }

          hasLoggedDiagnosticsRef.current = true;
        }
      };

      runDiagnostics();

      return () => {
        // No cleanup needed for diagnostics
      };
    }, [member?.id, member?.calendar_id, selectedDate])
  );

  // Existing useEffect for refreshing timeStore
  useFocusEffect(
    useCallback(() => {
      if (member?.id && useTimeStore.getState().isInitialized) {
        const lastRefreshed = useTimeStore.getState().lastRefreshed;
        const now = new Date();

        // Only refresh if it's been more than a minute since the last refresh
        if (!lastRefreshed || now.getTime() - lastRefreshed.getTime() > 60000) {
          console.log("[CalendarScreen] Screen focused after inactivity, refreshing timeStore");
          useTimeStore.getState().refreshAll(member.id);
        } else {
          console.log("[CalendarScreen] Screen focused, but timeStore was recently refreshed");
        }
      }
    }, [member?.id])
  );

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
        // Also update current view to stay on this month
        updateCurrentCalendarView(date);
        // Always attempt to show the dialog for PLD/SDV if a date is pressed
        // The dialog itself will handle view modes (past/request)
        // The Calendar component should prevent pressing truly unavailable dates (>6 months)
        setRequestDialogVisible(true);
      } else if (activeCalendar === "Vacation") {
        setSelectedWeek(date);
        // Also update current view to stay on this month
        updateCurrentCalendarView(date);
        // Optionally open a dialog for vacation weeks too, if applicable
        // setRequestDialogVisible(true);
      }
    },
    [activeCalendar, setSelectedDate, setSelectedWeek, updateCurrentCalendarView] // Add updateCurrentCalendarView to deps
  );

  // --- Define wrapper function to call correct store submit action ---
  const handleRequestSubmitWithStore = async (leaveType: "PLD" | "SDV", date: string, isPaidInLieu = false) => {
    if (!date || !member?.id) {
      Toast.show({ type: "error", text1: "Cannot submit request", text2: "Missing date or user info." });
      return;
    }
    console.log(`[CalendarScreen] Submitting ${leaveType} request for ${date} (PIL: ${isPaidInLieu}) via TimeStore`);
    try {
      const now = new Date();
      const dateObj = parseISO(date);
      // --- Use Date object directly from getSixMonthDate ---
      const sixMonthDate = getSixMonthDate();

      const isEndOfMonth = isLastDayOfMonth(now);
      // --- Compare against the Date object directly ---
      const isExactSixMonthDate = startOfDay(dateObj).getTime() === startOfDay(sixMonthDate).getTime();

      const isSixMonthRequestDate =
        isExactSixMonthDate ||
        (isEndOfMonth &&
          dateObj.getMonth() === sixMonthDate.getMonth() &&
          dateObj.getFullYear() === sixMonthDate.getFullYear() &&
          dateObj.getDate() >= sixMonthDate.getDate());

      // Call the correct store action
      const success = isSixMonthRequestDate
        ? await submitSixMonthRequest(leaveType, date)
        : await submitRequest(leaveType, date, isPaidInLieu);

      if (success) {
        Toast.show({
          type: "success",
          text1: "Success",
          text2: `Request submitted successfully.`,
          position: "bottom",
          visibilityTime: 3000,
        });

        // No need to refresh stores manually - the realtime subscriptions will handle it
        // The stores have their own realtime subscriptions that will update them

        // Close the dialog but don't update the current date
        setRequestDialogVisible(false);
        // Don't reset currentDate here, preserve the current view
      } // Error is handled by store state and displayed via displayError
    } catch (err) {
      console.error("[CalendarScreen] Error calling submit action:", err);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: err instanceof Error ? err.message : "An unexpected error occurred.",
        position: "bottom",
        visibilityTime: 4000,
      });
    }
  };

  // handleTodayPress remains the same
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

  // handleAdjustmentComplete remains the same
  const handleAdjustmentComplete = async () => {
    console.log("[CalendarScreen] Adjustment complete. Reopening dialog.");
    setCalendarKey(Number(Date.now()));
    setRequestDialogVisible(true);
  };

  // --- Conditional Rendering ---
  if (isInitialLoading) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={Colors[theme].tint} />
        <ThemedText style={styles.loadingText}>Initializing Calendar...</ThemedText>
      </ThemedView>
    );
  }
  if (displayError && !requestDialogVisible) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <Ionicons name="warning-outline" size={48} color={Colors[theme].error} />
        <ThemedText style={styles.errorText}>Error: {displayError}</ThemedText>
        <TouchableOpacity onPress={clearError} style={styles.retryButton}>
          <ThemedText style={styles.retryButtonText}>Dismiss Error</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }
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
      {/* Header Section (remains the same) */}
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

      {/* Calendar Type Tabs (remains the same) */}
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
      {/* Main Calendar Area (use isInitialLoading) */}
      <ScrollView style={styles.scrollView}>
        {isInitialLoading && <ActivityIndicator style={{ marginTop: 20 }} size="small" color={Colors[theme].textDim} />}
        {activeCalendar === "PLD/SDV" ? (
          <Calendar key={calendarTypeKey} current={currentDate} onDayActuallyPressed={handleDayPress} />
        ) : (
          <VacationCalendar
            key={calendarTypeKey}
            current={currentDate}
            // Remove onDayActuallyPressed which isn't in the component's props
          />
        )}
      </ScrollView>

      {/* Request Button Logic (remains the same) */}
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
          const fortyEightHoursFromNow = startOfDay(addDays(now, 3));
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

          const maxAllotmentForDialog = selectedDate
            ? pldAllotments[selectedDate] ?? yearlyAllotments[new Date(selectedDate).getFullYear()] ?? 0
            : 0;
          // Use timeOffRequests from useMyTime, filter out PIL
          const currentRequestsForDialog = timeOffRequests.filter(
            (req) =>
              req.request_date === selectedDate &&
              ["approved", "pending", "cancellation_pending"].includes(req.status) &&
              !req.paid_in_lieu
          ).length;
          // Use pldRequests from calendarStore for display list
          const displayRequests = pldRequests[selectedDate] ? pldRequests[selectedDate] : [];

          return (
            <RequestDialog
              isVisible={requestDialogVisible}
              onClose={() => {
                // Just close the dialog without changing the calendar date
                setRequestDialogVisible(false);
              }}
              onSubmitRequest={handleRequestSubmitWithStore} // Pass the wrapper function
              onCancelRequest={cancelRequest} // Pass action from useMyTime
              onCancelSixMonthRequest={cancelSixMonthRequest} // Pass action from useMyTime
              selectedDate={selectedDate}
              maxAllotment={maxAllotmentForDialog}
              currentAllotment={currentRequestsForDialog} // Pass calculated current count
              requests={displayRequests} // Pass requests for list display
              calendarType="PLD/SDV"
              calendarId={member?.calendar_id || ""}
              onAdjustmentComplete={handleAdjustmentComplete}
              viewMode={viewMode}
              // Pass state/actions from useMyTime
              availablePld={timeStats?.available.pld ?? 0}
              availableSdv={timeStats?.available.sdv ?? 0}
              isExistingRequestPaidInLieu={isExistingRequestPaidInLieu} // Pass calculated flag
              isSubmittingAction={createActionMap(isSubmittingAction)} // Safe fallback
              error={timeStoreError} // Pass error from time store
              onClearError={clearError} // Pass clear action from time store
            />
          );
        })()}

      {/* Request Dialog - Vacation */}
      {activeCalendar === "Vacation" && (
        <RequestDialog
          isVisible={requestDialogVisible}
          onClose={() => {
            // Just close the dialog without changing the calendar date
            setRequestDialogVisible(false);
          }}
          onSubmitRequest={async (leaveType, date, isPaidInLieu) => {
            // Mock implementation that fulfills the Promise<void> type requirement
            console.log(`[VacationCalendar] Request action not implemented: ${leaveType}, ${date}, ${isPaidInLieu}`);
            // Just close the dialog without changing the calendar date
            setRequestDialogVisible(false);
            return Promise.resolve();
          }}
          onCancelRequest={cancelRequest} // Pass action from useMyTime
          onCancelSixMonthRequest={cancelSixMonthRequest} // Pass action from useMyTime
          selectedDate={selectedWeek || ""}
          maxAllotment={
            selectedWeek && vacationAllotments[selectedWeek] ? vacationAllotments[selectedWeek].max_allotment : 0
          }
          currentAllotment={
            selectedWeek && vacationAllotments[selectedWeek]
              ? vacationAllotments[selectedWeek].current_requests || 0
              : 0
          }
          requests={
            selectedWeek && vacationRequests[selectedWeek]
              ? (vacationRequests[selectedWeek] as any as DayRequest[])
              : []
          }
          calendarType="Vacation"
          calendarId={member?.calendar_id || ""}
          onAdjustmentComplete={handleAdjustmentComplete}
          availablePld={timeStats?.available.pld ?? 0}
          availableSdv={timeStats?.available.sdv ?? 0}
          isExistingRequestPaidInLieu={false}
          isSubmittingAction={createActionMap(isSubmittingAction)} // Safe fallback
          error={timeStoreError}
          onClearError={clearError}
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
    backgroundColor: Colors.dark.card,
  } as ViewStyle,
  activeTab: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
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
    backgroundColor: Colors.dark.card,
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
    width: "40%",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    color: Colors.dark.text,
    marginBottom: 16,
    textAlign: "center",
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
  pilToggleContainer: {
    marginBottom: 0,
    padding: 2,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: "center",
  } as ViewStyle,
  pilToggleText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.dark.text,
  } as TextStyle,
  // Add missing styles for error handling UI
  clearErrorButton: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 8,
    zIndex: 1,
  } as ViewStyle,
  errorContainer: {
    marginVertical: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.light.error,
  } as ViewStyle,
  errorTextDisplay: {
    color: Colors.light.error,
    fontSize: 14,
    textAlign: "center",
  } as TextStyle,
});

// Create a helper function at the top of the file before any component definitions
// to safely convert the isSubmittingAction value
function createActionMap(source: any): Record<string, boolean> {
  if (typeof source === "object" && source !== null) {
    return source as Record<string, boolean>;
  }
  return {}; // Return empty object as fallback
}
