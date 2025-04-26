import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Database } from "@/types/supabase";

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

// New interface for vacation statistics
export interface VacationStats {
  totalWeeks: number;
  splitWeeks: number;
  weeksToBid: number;
  approvedWeeks: number;
  remainingWeeks: number;
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

export interface UserVacationRequest {
  id: string;
  start_date: string;
  end_date: string;
  status: Database["public"]["Tables"]["vacation_requests"]["Row"]["status"];
  requested_at: string | null;
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
  calendar_id: string;
}

interface SyncStatus {
  isSyncing: boolean;
  lastSyncAttempt: Date | null;
  lastSuccessfulSync: Date | null;
  failedAttempts: number;
  error: string | null;
}

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 1000; // 1 second

export function useMyTime() {
  const [stats, setStats] = useState<TimeStats | null>(null);
  const [vacationStats, setVacationStats] = useState<VacationStats | null>(
    null,
  );
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [vacationRequests, setVacationRequests] = useState<
    UserVacationRequest[]
  >([]);
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAttempt: null,
    lastSuccessfulSync: null,
    failedAttempts: 0,
    error: null,
  });

  // New function to fetch vacation statistics
  const fetchVacationStats = useCallback(async () => {
    if (!member?.id || member.pin_number === null) {
      console.log(
        "[MyTime] Skipping fetchVacationStats - no member ID or PIN",
      );
      setVacationStats(null);
      return;
    }

    try {
      console.log(
        "[MyTime] Fetching vacation statistics for member PIN:",
        member.pin_number,
      );
      setError(null);

      // Get current year's vacation statistics
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("curr_vacation_weeks, curr_vacation_split")
        .eq("id", member.id)
        .single();

      if (memberError) throw memberError;

      const totalWeeks = memberData?.curr_vacation_weeks || 0;
      const splitWeeks = memberData?.curr_vacation_split || 0;
      const weeksToBid = totalWeeks - splitWeeks;

      // Count approved vacation requests
      const { data: vacationRequestsData, error: vacationError } =
        await supabase
          .from("vacation_requests")
          .select("id")
          .eq("pin_number", member.pin_number)
          .eq("status", "approved")
          .gte("start_date", `${new Date().getFullYear()}-01-01`)
          .lte("end_date", `${new Date().getFullYear()}-12-31`);

      if (vacationError) throw vacationError;

      const approvedWeeks = vacationRequestsData?.length || 0;
      const remainingWeeks = weeksToBid - approvedWeeks;

      const vacStats: VacationStats = {
        totalWeeks,
        splitWeeks,
        weeksToBid,
        approvedWeeks,
        remainingWeeks: Math.max(0, remainingWeeks),
      };

      console.log("[MyTime] Calculated vacation stats:", vacStats);
      setVacationStats(vacStats);
    } catch (err) {
      console.error("[MyTime] Error in fetchVacationStats:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch vacation statistics",
      );
      setVacationStats({
        totalWeeks: 0,
        splitWeeks: 0,
        weeksToBid: 0,
        approvedWeeks: 0,
        remainingWeeks: 0,
      });
    }
  }, [member?.id, member?.pin_number]);

  const fetchStats = useCallback(async () => {
    if (!member?.id) {
      console.log("[MyTime] Skipping fetchStats - no member ID");
      return;
    }

    try {
      // console.log("[MyTime] Fetching stats for member:", member.id);
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

      // console.log("[MyTime] Member data:", memberData);

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

      // console.log("[MyTime] Current year requests:", currentRequests);
      // console.log("[MyTime] Six-month requests:", sixMonthRequests);

      // Update stats based on current year requests
      currentRequests?.forEach((request) => {
        const type = request.leave_type.toLowerCase() as "pld" | "sdv";

        // console.log("[MyTime] Processing request for stats:", {
        //   id: request.id,
        //   type,
        //   status: request.status,
        //   paid_in_lieu: request.paid_in_lieu,
        // });

        if (request.paid_in_lieu) {
          if (request.status === "pending") {
            baseStats.requested[type]++;
          } else if (request.status === "approved") {
            baseStats.paidInLieu[type]++;
          }
        } else {
          if (request.status === "pending") {
            // console.log(`[MyTime] Adding pending ${type} request to stats`);
            baseStats.requested[type]++;
          } else if (request.status === "cancellation_pending") {
            // console.log(
            //   `[MyTime] Adding cancellation pending ${type} request to stats`,
            // );
            baseStats.requested[type]++;
          } else if (request.status === "waitlisted") {
            // console.log(`[MyTime] Adding waitlisted ${type} request to stats`);
            baseStats.waitlisted[type]++;
          } else if (request.status === "approved") {
            // console.log(`[MyTime] Adding approved ${type} request to stats`);
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

      // console.log("[MyTime] Calculated stats:", baseStats);

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
      if (!member?.id) {
        throw new Error("No member ID found");
      }
      if (!member.calendar_id) {
        throw new Error("No calendar ID assigned to the member");
      }

      try {
        console.log("[MyTime] Requesting paid in lieu for:", {
          type,
          memberId: member.id,
          calendarId: member.calendar_id,
        });

        // Check if user has available days for the requested type
        const currentYear = new Date().getFullYear();
        const { data: memberEntitlements, error: memberError } = await supabase
          .from("members")
          .select("max_plds, sdv_entitlement, pld_rolled_over")
          .eq("id", member.id)
          .single();

        if (memberError) {
          throw new Error(
            "Unable to determine available days. Please try again.",
          );
        }

        // Get existing requests to determine how many days are already used
        const { data: existingRequests, error: requestsError } = await supabase
          .from("pld_sdv_requests")
          .select("leave_type, status, paid_in_lieu")
          .eq("member_id", member.id)
          .gte("request_date", `${currentYear}-01-01`)
          .lte("request_date", `${currentYear}-12-31`);

        if (requestsError) {
          throw new Error(
            "Unable to check existing requests. Please try again.",
          );
        }

        // Check if user already has a paid in lieu request for this type
        const hasExistingPaidInLieuRequest = existingRequests?.some(
          (req) =>
            req.leave_type === type &&
            req.paid_in_lieu === true &&
            (req.status === "pending" || req.status === "approved"),
        );

        if (hasExistingPaidInLieuRequest) {
          throw new Error(
            `You already have an active paid in lieu request for ${type}. Please cancel it before creating a new one.`,
          );
        }

        // Get existing six-month requests to also count against available days
        const { data: sixMonthRequests, error: sixMonthRequestsError } =
          await supabase
            .from("six_month_requests")
            .select("leave_type")
            .eq("member_id", member.id)
            .eq("processed", false)
            .gte("request_date", `${currentYear}-01-01`)
            .lte("request_date", `${currentYear}-12-31`);

        if (sixMonthRequestsError) {
          throw new Error(
            "Unable to check six-month requests. Please try again.",
          );
        }

        // Calculate used days
        let usedPlds = 0;
        let usedSdvs = 0;

        existingRequests?.forEach((request) => {
          // Only count requests that are consuming days (approved, pending, or waitlisted but not paid in lieu)
          if (
            (request.status === "approved" ||
              request.status === "pending" ||
              request.status === "waitlisted" ||
              request.status === "cancellation_pending") &&
            !request.paid_in_lieu
          ) {
            if (request.leave_type === "PLD") {
              usedPlds++;
            } else if (request.leave_type === "SDV") {
              usedSdvs++;
            }
          }

          // Count paid in lieu requests separately
          if (
            (request.status === "approved" || request.status === "pending") &&
            request.paid_in_lieu
          ) {
            if (request.leave_type === "PLD") {
              usedPlds++;
            } else if (request.leave_type === "SDV") {
              usedSdvs++;
            }
          }
        });

        // Count pending six-month requests against available days
        sixMonthRequests?.forEach((request) => {
          if (request.leave_type === "PLD") {
            usedPlds++;
          } else if (request.leave_type === "SDV") {
            usedSdvs++;
          }
        });

        // Calculate available days
        const totalPlds = (memberEntitlements?.max_plds || 0) +
          (memberEntitlements?.pld_rolled_over || 0);
        const totalSdvs = memberEntitlements?.sdv_entitlement || 0;

        const availablePlds = totalPlds - usedPlds;
        const availableSdvs = totalSdvs - usedSdvs;

        console.log("[MyTime] Available days for paid in lieu:", {
          pld: availablePlds,
          sdv: availableSdvs,
          totalPlds,
          totalSdvs,
          usedPlds,
          usedSdvs,
        });

        // Check if user has available days for the requested type
        const availableDays = type === "PLD" ? availablePlds : availableSdvs;

        if (availableDays <= 0) {
          throw new Error(
            `No available ${type} days left. Cannot request paid in lieu.`,
          );
        }

        const { data, error } = await supabase
          .from("pld_sdv_requests")
          .insert({
            member_id: member.id,
            leave_type: type,
            paid_in_lieu: true,
            status: "pending",
            request_date: new Date().toISOString().split("T")[0],
            calendar_id: member.calendar_id,
          })
          .select()
          .single();

        if (error) {
          console.error("[MyTime] Error requesting paid in lieu:", error);

          // Handle specific database errors with user-friendly messages
          if (error.code === "P0001") {
            if (error.message?.includes("active request already exists")) {
              throw new Error(
                `You already have an active request for this date. Please cancel it before creating a new one.`,
              );
            }
          }

          throw error;
        }

        console.log("[MyTime] Paid in lieu request successful:", data);
        return true;
      } catch (err) {
        console.error("[MyTime] Error in requestPaidInLieu:", err);

        // Return the error message directly for display to user
        if (err instanceof Error) {
          throw new Error(err.message);
        } else {
          throw new Error("An error occurred while requesting paid in lieu.");
        }
      }
    },
    [member?.id, member?.calendar_id],
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

  const fetchVacationRequests = useCallback(async () => {
    if (!member?.id || member.pin_number === null) {
      console.log(
        "[MyTime] Skipping fetchVacationRequests - no member ID or PIN",
      );
      setVacationRequests([]);
      return;
    }

    try {
      console.log(
        "[MyTime] Fetching vacation requests for member PIN:",
        member.pin_number,
      );
      setError(null);

      const currentYear = new Date().getFullYear();

      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, start_date, end_date, status, requested_at")
        .eq("pin_number", member.pin_number)
        .gte("start_date", `${currentYear}-01-01`)
        .lte("start_date", `${currentYear}-12-31`)
        .order("start_date", { ascending: true });

      if (error) {
        console.error("[MyTime] Error fetching vacation requests:", error);
        throw error;
      }

      console.log("[MyTime] Fetched vacation requests:", data);
      setVacationRequests(
        (data || []).map((req) => ({
          ...req,
          requested_at: req.requested_at ?? new Date(0).toISOString(),
        })) as UserVacationRequest[],
      );
    } catch (err) {
      console.error("[MyTime] Error in fetchVacationRequests:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch vacation requests",
      );
      setVacationRequests([]);
    }
  }, [member?.id, member?.pin_number]);

  const cancelRequest = useCallback(
    async (requestId: string) => {
      if (!member?.id) return false;

      try {
        // Find the request in local state to get its date
        const requestToCancel = requests.find((req) =>
          req.id === requestId && !req.is_six_month_request
        );

        if (!requestToCancel) {
          throw new Error("Request not found");
        }

        // Optimistically update the UI state
        setRequests((prevRequests) =>
          prevRequests.map((req) =>
            req.id === requestId
              ? { ...req, status: "cancellation_pending" as const }
              : req
          )
        );

        // Call the database function to handle cancellation logic
        const { data, error } = await supabase.rpc("cancel_leave_request", {
          p_request_id: requestId,
          p_member_id: member.id,
        });

        if (error) {
          // Revert optimistic update on error
          setRequests((prevRequests) =>
            prevRequests.map((req) =>
              req.id === requestId ? requestToCancel : req
            )
          );
          throw error;
        }

        // If immediate cancellation (data is true), update stats
        if (data) {
          await fetchStats();
        }

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
            [requestToCancel.request_date]: updatedRequests as any, // Type assertion needed due to complex types
          });
          console.log(
            `[MyTime] Updated calendarStore for date: ${requestToCancel.request_date} with status: ${newStatus}`,
          );
        }

        return true;
      } catch (err) {
        console.error("[MyTime] Error cancelling request:", err);
        throw err;
      }
    },
    [member?.id, requests, fetchStats],
  );

  const cancelSixMonthRequest = useCallback(
    async (requestId: string) => {
      if (!member?.id) {
        console.error("[useMyTime] Cannot cancel request: No member ID");
        return false;
      }

      try {
        // Find the request in local state
        const requestToCancel = requests.find(
          (req) => req.id === requestId && req.is_six_month_request,
        );

        if (!requestToCancel) {
          throw new Error("Six-month request not found");
        }

        // Optimistically remove from UI
        setRequests((prevRequests) =>
          prevRequests.filter((req) =>
            !(req.id === requestId && req.is_six_month_request)
          )
        );

        // Delete the request
        const { error: deleteError } = await supabase
          .from("six_month_requests")
          .delete()
          .eq("id", requestId)
          .eq("member_id", member.id);

        if (deleteError) {
          // Revert optimistic update on error
          setRequests((prevRequests) => [...prevRequests, requestToCancel]);
          throw deleteError;
        }

        // Update stats since a request was removed
        await fetchStats();

        return true;
      } catch (error) {
        console.error("[useMyTime] Error in cancelSixMonthRequest:", error);
        return false;
      }
    },
    [member?.id, requests, fetchStats],
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

      await Promise.all([
        fetchStats(),
        fetchRequests(),
        fetchVacationRequests(),
        fetchVacationStats(),
      ]);

      setIsInitialized(true);
      lastRefreshTimeRef.current = now;
      // console.log("[MyTime] Data refreshed successfully");
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
  }, [
    member?.id,
    fetchStats,
    fetchRequests,
    fetchVacationRequests,
    fetchVacationStats,
    isInitialized,
  ]);

  const handleRealtimeChange = useCallback(
    async (payload: RealtimePostgresChangesPayload<any>) => {
      const { eventType, new: newRecord, old: oldRecord, table } = payload;

      switch (table) {
        case "pld_sdv_requests":
          if (eventType === "INSERT") {
            setRequests(
              (prev) => [...prev, transformToTimeOffRequest(newRecord)],
            );
          } else if (eventType === "UPDATE") {
            setRequests((prev) =>
              prev.map((req) =>
                req.id === newRecord.id
                  ? transformToTimeOffRequest(newRecord)
                  : req
              )
            );
          } else if (eventType === "DELETE") {
            setRequests((prev) =>
              prev.filter((req) => req.id !== oldRecord.id)
            );
          }
          // Refresh stats since they need recalculation
          await retryableOperation(fetchStats);
          break;

        case "six_month_requests":
          if (eventType === "INSERT") {
            setRequests((prev) => [...prev, {
              ...transformToTimeOffRequest(newRecord),
              is_six_month_request: true,
            }]);
          } else if (eventType === "DELETE") {
            setRequests((prev) =>
              prev.filter((req) =>
                !(req.id === oldRecord.id && req.is_six_month_request)
              )
            );
          }
          await retryableOperation(fetchStats);
          break;

        case "vacation_requests":
          if (eventType === "INSERT") {
            setVacationRequests((prev) => [...prev, {
              id: newRecord.id,
              start_date: newRecord.start_date,
              end_date: newRecord.end_date,
              status: newRecord.status,
              requested_at: newRecord.requested_at ?? new Date(0).toISOString(),
            }]);
          } else if (eventType === "UPDATE") {
            setVacationRequests((prev) =>
              prev.map((req) =>
                req.id === newRecord.id
                  ? {
                    ...req,
                    start_date: newRecord.start_date,
                    end_date: newRecord.end_date,
                    status: newRecord.status,
                    requested_at: newRecord.requested_at ?? req.requested_at,
                  }
                  : req
              )
            );
          } else if (eventType === "DELETE") {
            setVacationRequests((prev) =>
              prev.filter((req) => req.id !== oldRecord.id)
            );
          }
          // Update vacation stats when requests change
          await retryableOperation(fetchVacationStats);
          break;

        case "members":
          if (eventType === "UPDATE" && newRecord.id === member?.id) {
            // If member data was updated (like vacation weeks/split), refresh vacation stats
            await retryableOperation(fetchVacationStats);
          }
          break;
      }
    },
    [fetchStats, fetchVacationStats, member?.id],
  );

  useIsomorphicLayoutEffect(() => {
    if (!member?.id || !member.pin_number) {
      console.log("[MyTime] Skipping realtime setup - no member ID or PIN");
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
        handleRealtimeChange,
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
        handleRealtimeChange,
      )
      .subscribe();

    const vacationRequestsChannel = supabase
      .channel(`mytime-vacation-requests-${member.pin_number}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vacation_requests",
          filter: `pin_number=eq.${member.pin_number}`,
        },
        handleRealtimeChange,
      )
      .subscribe();

    return () => {
      console.log("[MyTime] Cleaning up realtime subscriptions");
      regularRequestsChannel.unsubscribe();
      sixMonthRequestsChannel.unsubscribe();
      vacationRequestsChannel.unsubscribe();
    };
  }, [member?.id, member?.pin_number, handleRealtimeChange]);

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
      setVacationRequests([]);
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
      setVacationRequests([]);
      lastRefreshTimeRef.current = null;
      initialAuthLoadCompleteRef.current = false;
    };
  }, []);

  // Add transform helper function
  const transformToTimeOffRequest = (record: any): TimeOffRequest => ({
    id: record.id,
    request_date: record.request_date,
    leave_type: record.leave_type,
    status: record.status,
    requested_at: record.requested_at ?? "",
    waitlist_position: record.waitlist_position,
    paid_in_lieu: record.paid_in_lieu,
    is_six_month_request: false,
    calendar_id: record.calendar_id,
  });

  // Add retryable operation helper
  const retryableOperation = async (operation: () => Promise<void>) => {
    setSyncStatus((prev) => ({
      ...prev,
      isSyncing: true,
      lastSyncAttempt: new Date(),
    }));

    try {
      await operation();
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: false,
        lastSuccessfulSync: new Date(),
        failedAttempts: 0,
        error: null,
      }));
    } catch (error) {
      const newFailedAttempts = syncStatus.failedAttempts + 1;

      if (newFailedAttempts < MAX_RETRY_ATTEMPTS) {
        setSyncStatus((prev) => ({
          ...prev,
          failedAttempts: newFailedAttempts,
          error: `Retry attempt ${newFailedAttempts} of ${MAX_RETRY_ATTEMPTS}`,
        }));

        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * Math.pow(2, newFailedAttempts - 1))
        );
        await retryableOperation(operation);
      } else {
        setSyncStatus((prev) => ({
          ...prev,
          isSyncing: false,
          failedAttempts: newFailedAttempts,
          error: "Max retry attempts reached. Please try again later.",
        }));
      }
    }
  };

  return {
    stats,
    vacationStats,
    requests,
    vacationRequests,
    isLoading,
    isRefreshing,
    error,
    isInitialized,
    initialize: refreshData,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
    syncStatus,
  };
}
