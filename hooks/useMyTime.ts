import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useAuth } from "./useAuth";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useUserStore } from "@/store/userStore";
import { useCalendarStore } from "@/store/calendarStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useFocusEffect } from "@react-navigation/native";
import React from "react";
import { AppState } from "react-native";

export interface TimeStats {
  total: {
    pld: number;
    sdv: number;
  };
  rolledOver: {
    pld: number;
    unusedPlds: number;
  };
  available: {
    pld: number;
    sdv: number;
  };
  requested: {
    pld: number;
    sdv: number;
  };
  waitlisted: {
    pld: number;
    sdv: number;
  };
  approved: {
    pld: number;
    sdv: number;
  };
  paidInLieu: {
    pld: number;
    sdv: number;
  };
}

export interface TimeOffRequest {
  id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status:
    | "pending"
    | "approved"
    | "denied"
    | "waitlisted"
    | "cancellation_pending"
    | "cancelled";
  requested_at: string;
  waitlist_position?: number;
  paid_in_lieu?: boolean;
  is_six_month_request?: boolean;
  calendar_id?: string;
}

interface SixMonthRequest {
  id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  member_id: string;
  requested_at: string;
  processed: boolean;
  processed_at?: string;
  final_status?: string;
  position?: number;
  division: string;
  calendar_id?: string;
}

export function useMyTime() {
  const [stats, setStats] = useState<TimeStats | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { member: authMember, session } = useAuth();
  const member = useUserStore((state) => state.member);
  const [realtimeChannel, setRealtimeChannel] = useState<
    RealtimeChannel | null
  >(null);
  const mountTimeRef = useRef(Date.now());
  const lastRefreshTimeRef = useRef<number | null>(null);
  const isFetchInProgressRef = useRef(false);
  const REFRESH_COOLDOWN = 1000; // 1 second cooldown
  const initialAuthLoadCompleteRef = useRef(false);

  const fetchStats = useCallback(async () => {
    if (!member?.id) {
      console.log("[MyTime] Skipping fetchStats - no member ID");
      return;
    }

    try {
      console.log("[MyTime] Fetching stats for member:", member.id);
      setError(null);

      const currentYear = new Date().getFullYear();

      // Get member's data including division_id, SDV entitlement, and rolled over PLDs
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select(
          "division_id, sdv_entitlement, pld_rolled_over, company_hire_date",
        )
        .eq("id", member.id)
        .single();

      if (memberError) throw memberError;

      console.log("[MyTime] Member data:", memberData);

      // Get max PLDs from database function
      const { data: maxPldsResult, error: maxPldsError } = await supabase
        .rpc("update_member_max_plds", { p_member_id: member.id });

      if (maxPldsError) throw maxPldsError;

      const maxPlds = maxPldsResult;

      // Calculate used rolled over PLDs in Q1
      const { data: usedRolledOverPlds, error: usedRolledOverError } =
        await supabase
          .from("pld_sdv_requests")
          .select("id")
          .eq("member_id", member.id)
          .eq("leave_type", "PLD")
          .gte("request_date", `${currentYear}-01-01`)
          .lte("request_date", `${currentYear}-03-31`)
          .in("status", ["approved", "pending"])
          .not("paid_in_lieu", "is", true)
          .eq("is_rollover_pld", true);

      if (usedRolledOverError) throw usedRolledOverError;

      const unusedRolledOverPlds = (memberData.pld_rolled_over || 0) -
        (usedRolledOverPlds?.length || 0);

      // Calculate base stats
      const baseStats: TimeStats = {
        total: {
          pld: maxPlds,
          sdv: memberData?.sdv_entitlement ?? 0,
        },
        rolledOver: {
          pld: memberData.pld_rolled_over ?? 0,
          unusedPlds: Math.max(0, unusedRolledOverPlds),
        },
        available: {
          pld: maxPlds + (memberData.pld_rolled_over ?? 0),
          sdv: memberData?.sdv_entitlement ?? 0,
        },
        requested: {
          pld: 0,
          sdv: 0,
        },
        waitlisted: {
          pld: 0,
          sdv: 0,
        },
        approved: {
          pld: 0,
          sdv: 0,
        },
        paidInLieu: {
          pld: 0,
          sdv: 0,
        },
      };

      // Get all regular requests for the member for current year
      const { data: currentRequests, error: currentRequestsError } =
        await supabase
          .from("pld_sdv_requests")
          .select("*")
          .eq("member_id", member.id)
          .gte("request_date", `${currentYear}-01-01`)
          .lte("request_date", `${currentYear}-12-31`);

      if (currentRequestsError) {
        console.error(
          "[MyTime] Error fetching current year requests:",
          currentRequestsError,
        );
        throw currentRequestsError;
      }

      // Get all six-month requests for the member for current year
      const { data: sixMonthRequests, error: sixMonthError } = await supabase
        .from("six_month_requests")
        .select("*")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      if (sixMonthError) {
        console.error(
          "[MyTime] Error fetching six-month requests:",
          sixMonthError,
        );
        throw sixMonthError;
      }

      console.log("[MyTime] Current year requests:", currentRequests);
      console.log("[MyTime] Six-month requests:", sixMonthRequests);

      // Update stats based on current year requests
      currentRequests?.forEach((request) => {
        const type = request.leave_type.toLowerCase() as "pld" | "sdv";

        console.log("[MyTime] Processing request for stats:", {
          id: request.id,
          type,
          status: request.status,
          paid_in_lieu: request.paid_in_lieu,
        });

        if (request.paid_in_lieu) {
          if (request.status === "pending") {
            baseStats.requested[type]++;
          } else if (request.status === "approved") {
            baseStats.paidInLieu[type]++;
          }
        } else {
          if (request.status === "pending") {
            console.log(`[MyTime] Adding pending ${type} request to stats`);
            baseStats.requested[type]++;
          } else if (request.status === "cancellation_pending") {
            console.log(
              `[MyTime] Adding cancellation pending ${type} request to stats`,
            );
            baseStats.requested[type]++;
          } else if (request.status === "waitlisted") {
            console.log(`[MyTime] Adding waitlisted ${type} request to stats`);
            baseStats.waitlisted[type]++;
          } else if (request.status === "approved") {
            console.log(`[MyTime] Adding approved ${type} request to stats`);
            baseStats.approved[type]++;
          }
        }
      });

      // Update stats based on six-month requests - count all unprocessed as pending
      sixMonthRequests?.forEach((request) => {
        const type = request.leave_type.toLowerCase() as "pld" | "sdv";
        if (!request.processed) {
          baseStats.requested[type]++;
        }
      });

      // Update available counts
      baseStats.available.pld -= baseStats.approved.pld +
        baseStats.requested.pld + baseStats.waitlisted.pld +
        baseStats.paidInLieu.pld;
      baseStats.available.sdv -= baseStats.approved.sdv +
        baseStats.requested.sdv + baseStats.waitlisted.sdv +
        baseStats.paidInLieu.sdv;

      console.log("[MyTime] Calculated stats:", baseStats);

      // Combine and transform six-month requests into TimeOffRequest format
      const transformedSixMonthRequests = (sixMonthRequests || []).map((
        request,
      ) => ({
        id: request.id,
        request_date: request.request_date,
        leave_type: request.leave_type as "PLD" | "SDV",
        status: "pending" as TimeOffRequest["status"],
        requested_at: request.requested_at ?? "",
        is_six_month_request: true,
      }));

      // Combine all requests
      const allRequests: TimeOffRequest[] = [
        ...(currentRequests || []).map((req) => ({
          ...req,
          status: req.status as TimeOffRequest["status"],
          requested_at: req.requested_at ?? "",
          is_six_month_request: false,
        })),
        ...transformedSixMonthRequests,
      ];

      setStats(baseStats);
      setRequests(allRequests);
      setError(null);
    } catch (err) {
      console.error("[MyTime] Error in fetchStats:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch time statistics",
      );
      setStats({
        total: { pld: 0, sdv: 0 },
        rolledOver: { pld: 0, unusedPlds: 0 },
        available: { pld: 0, sdv: 0 },
        requested: { pld: 0, sdv: 0 },
        waitlisted: { pld: 0, sdv: 0 },
        approved: { pld: 0, sdv: 0 },
        paidInLieu: { pld: 0, sdv: 0 },
      });
      setRequests([]);
    }
  }, [member?.id]);

  const requestPaidInLieu = useCallback(
    async (type: "PLD" | "SDV") => {
      if (
        !member?.id || member.division_id === null ||
        member.division_id === undefined
      ) {
        throw new Error("No member ID or division ID found");
      }
      if (!member.calendar_id) {
        throw new Error("No calendar ID assigned to the member");
      }

      try {
        console.log("[MyTime] Requesting paid in lieu for:", {
          type,
          memberId: member.id,
          divisionId: member.division_id,
          calendarId: member.calendar_id,
        });
        const { data, error } = await supabase
          .from("pld_sdv_requests")
          .insert({
            member_id: member.id,
            leave_type: type,
            paid_in_lieu: true,
            status: "pending",
            request_date: new Date().toISOString().split("T")[0],
            division_id: member.division_id,
            calendar_id: member.calendar_id,
          })
          .select()
          .single();

        if (error) {
          console.error("[MyTime] Error requesting paid in lieu:", error);
          throw error;
        }

        console.log("[MyTime] Paid in lieu request successful:", data);
        return true;
      } catch (err) {
        console.error("[MyTime] Error in requestPaidInLieu:", err);
        throw err;
      }
    },
    [member?.id, member?.division_id, member?.calendar_id],
  );

  const fetchRequests = useCallback(async () => {
    if (!member?.id) return;

    try {
      const currentYear = new Date().getFullYear();

      // Fetch regular requests
      const { data: regularRequests, error: regularError } = await supabase
        .from("pld_sdv_requests")
        .select("*")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`)
        .not("status", "in", '("cancelled","denied")')
        .order("request_date", { ascending: true });

      if (regularError) throw regularError;

      // Fetch six-month requests
      const { data: sixMonthRequests, error: sixMonthError } = await supabase
        .from("six_month_requests")
        .select("*")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`)
        .order("request_date", { ascending: true });

      if (sixMonthError) throw sixMonthError;

      // Transform six-month requests to match TimeOffRequest format
      const transformedSixMonthRequests = (sixMonthRequests || []).map((
        request,
      ) => ({
        id: request.id,
        request_date: request.request_date,
        leave_type: request.leave_type as "PLD" | "SDV",
        status: "pending" as TimeOffRequest["status"],
        requested_at: request.requested_at ?? "",
        is_six_month_request: true,
      }));

      // Combine all requests and update state
      const allRequests: TimeOffRequest[] = [
        ...(regularRequests || []).map((req) => ({
          ...req,
          status: req.status as TimeOffRequest["status"],
          requested_at: req.requested_at ?? "",
          is_six_month_request: false,
        })),
        ...transformedSixMonthRequests,
      ];
      setRequests(allRequests);
    } catch (err) {
      console.error("[MyTime] Error fetching requests:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch time off requests",
      );
      setRequests([]);
    }
  }, [member?.id]);

  const cancelRequest = useCallback(
    async (requestId: string) => {
      if (!member?.id) return false;

      try {
        // Find the request in local state to get its date
        const requestToCancel = requests.find((req) =>
          req.id === requestId && !req.is_six_month_request
        );

        // Call the database function to handle cancellation logic
        const { data, error } = await supabase.rpc("cancel_leave_request", {
          p_request_id: requestId,
          p_member_id: member.id,
        });

        if (error) throw error;

        // Send notification to user
        // TODO: Verify column names (e.g., member_id vs user_id) and uncomment
        /*
        try {
          await supabase.from("push_notification_deliveries").insert({
            member_id: member.id,
            title: data
              ? "Request Cancelled"
              : "Cancellation Request Submitted",
            body: data
              ? "Your request has been cancelled."
              : "Your cancellation request has been submitted for approval.",
            data: {
              type: "leave_request",
              request_id: requestId,
              status: data ? "cancelled" : "cancellation_pending",
            },
          });
        } catch (notificationError) {
          console.warn(
            "[MyTime] Failed to send notification:",
            notificationError,
          );
        }
        */

        // Calendar Store Interaction Update
        if (requestToCancel?.request_date) {
          const calendarStore = useCalendarStore.getState();
          const requestsForDate =
            calendarStore.requests[requestToCancel.request_date] || [];
          const newStatus: TimeOffRequest["status"] = data
            ? "cancelled"
            : "cancellation_pending";

          const updatedRequests = requestsForDate.map((req) =>
            req.id === requestId ? { ...req, status: newStatus } : req
          ).filter((req) => req.status !== "cancelled");

          calendarStore.setRequests({
            ...calendarStore.requests,
            [requestToCancel.request_date]: updatedRequests,
          });
          console.log(
            `[MyTime] Updated calendarStore for date: ${requestToCancel.request_date} with status: ${newStatus}`,
          );
        } else {
          console.warn(
            "[MyTime] Could not update calendar store - request date unknown locally.",
          );
        }

        // Local state update will be handled by realtime or next refreshData
        return true;
      } catch (err) {
        console.error("[MyTime] Error cancelling request:", err);
        throw err;
      }
    },
    [member?.id, requests],
  );

  const cancelSixMonthRequest = useCallback(
    async (requestId: string) => {
      if (!member?.id) {
        console.error("[useMyTime] Cannot cancel request: No member ID");
        return false;
      }

      try {
        console.log("[useMyTime] Cancelling six-month request:", requestId);

        // First verify the request exists and belongs to the member
        const { data: existingRequest, error: fetchError } = await supabase
          .from("six_month_requests")
          .select("*")
          .eq("id", requestId)
          .eq("member_id", member.id)
          .single();

        if (fetchError || !existingRequest) {
          console.error("[useMyTime] Failed to fetch request:", fetchError);
          return false;
        }

        // Delete the request
        const { error: deleteError } = await supabase
          .from("six_month_requests")
          .delete()
          .eq("id", requestId)
          .eq("member_id", member.id);

        if (deleteError) {
          console.error("[useMyTime] Failed to delete request:", deleteError);
          return false;
        }

        console.log(
          "[useMyTime] Successfully deleted six-month request:",
          requestId,
        );

        // Update local state immediately
        setRequests((prev) =>
          prev.filter((r) => !(r.id === requestId && r.is_six_month_request))
        );

        // Refresh stats to ensure they're in sync
        await fetchStats();

        return true;
      } catch (error) {
        console.error("[useMyTime] Error in cancelSixMonthRequest:", error);
        return false;
      }
    },
    [member?.id, fetchStats],
  );

  const refreshData = useCallback(async (force = false) => {
    if (isFetchInProgressRef.current) {
      console.log(
        "[MyTime] Skipping refresh - fetch already in progress (ref check).",
      );
      return;
    }

    if (!member?.id) {
      console.log("[MyTime] Skipping refresh - no member ID");
      return;
    }

    const now = Date.now();
    if (
      !force && lastRefreshTimeRef.current &&
      now - lastRefreshTimeRef.current < REFRESH_COOLDOWN
    ) {
      console.log("[MyTime] Skipping refresh - within cooldown period");
      return;
    }

    try {
      isFetchInProgressRef.current = true;
      console.log("[MyTime] Starting data refresh (setting isRefreshing true)");
      setIsRefreshing(true);
      setError(null);

      await Promise.all([fetchStats(), fetchRequests()]);

      setIsInitialized(true);
      lastRefreshTimeRef.current = now;
      console.log("[MyTime] Data refreshed successfully");
    } catch (error) {
      console.error("[MyTime] Error refreshing data:", error);
      setError(
        error instanceof Error ? error.message : "Failed to refresh data",
      );
      if (!isInitialized) setIsInitialized(true);
    } finally {
      console.log(
        "[MyTime] Refresh attempt finished, setting isRefreshing state to false.",
      );
      setIsRefreshing(false);
      isFetchInProgressRef.current = false;
    }
  }, [member?.id, fetchStats, fetchRequests, isInitialized]);

  useIsomorphicLayoutEffect(() => {
    if (!member?.id /* || !session */) {
      console.log("[MyTime] Skipping realtime setup - no member ID");
      return;
    }
    console.log("[MyTime] Setting up realtime subscriptions");
    const regularRequestsChannel = supabase
      .channel("mytime-regular")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `member_id=eq.${member.id}`,
        },
        async (payload: RealtimePostgresChangesPayload<TimeOffRequest>) => {
          console.log(
            "[MyTime] Realtime regular request change detected, triggering refreshData.",
          );
          await refreshData();
        },
      )
      .subscribe();

    const sixMonthRequestsChannel = supabase
      .channel("mytime-six-month")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "six_month_requests",
          filter: `member_id=eq.${member.id}`,
        },
        async () => {
          console.log(
            "[MyTime] Realtime six-month request change detected, triggering refreshData.",
          );
          await refreshData();
        },
      )
      .subscribe();

    return () => {
      console.log("[MyTime] Cleaning up realtime subscriptions");
      regularRequestsChannel.unsubscribe();
      sixMonthRequestsChannel.unsubscribe();
    };
  }, [member?.id, refreshData]);

  useEffect(() => {
    if (member?.id && session && !initialAuthLoadCompleteRef.current) {
      console.log(
        "[MyTime] Member/Session ready and initial load pending, initializing (setting isLoading true)",
      );
      initialAuthLoadCompleteRef.current = true;
      setIsLoading(true);
      refreshData(true)
        .catch((err) => {
          console.error("[MyTime] Error during initial refreshData:", err);
        })
        .finally(() => {
          console.log(
            "[MyTime] Initial refreshData call completed (setting isLoading false).",
          );
          setIsLoading(false);
        });
      mountTimeRef.current = Date.now();
    } else if (!member?.id && !session) {
      initialAuthLoadCompleteRef.current = false;
      setIsInitialized(false);
      setStats(null);
      setRequests([]);
      setIsLoading(true);
      setIsRefreshing(false);
      console.log(
        "[MyTime] Member/Session lost, resetting initial load flag and state",
      );
    }
  }, [member?.id, session, refreshData]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        if (nextAppState === "active" && member?.id) {
          console.log(
            "[MyTime] App active, attempting refresh via refreshData()",
          );
          await refreshData();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [member?.id, refreshData]);

  useEffect(() => {
    return () => {
      console.log("[MyTime] Cleaning up on unmount");
      setIsLoading(true);
      setIsRefreshing(false);
      setIsInitialized(false);
      setError(null);
      setStats(null);
      setRequests([]);
      lastRefreshTimeRef.current = null;
      initialAuthLoadCompleteRef.current = false;
    };
  }, []);

  return {
    stats,
    requests,
    isLoading,
    isRefreshing,
    error,
    isInitialized,
    initialize: refreshData,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
  };
}
