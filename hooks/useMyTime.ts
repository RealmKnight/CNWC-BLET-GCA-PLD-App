import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useAuth } from "./useAuth";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useUserStore } from "@/store/userStore";
import { useCalendarStore } from "@/store/calendarStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export interface TimeStats {
  total: {
    pld: number;
    sdv: number;
  };
  rolledOver: {
    pld: number;
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
}

export function useMyTime() {
  const [stats, setStats] = useState<TimeStats | null>(null);
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { member, isLoading: isAuthLoading } = useAuth();
  const [realtimeChannel, setRealtimeChannel] = useState<
    RealtimeChannel | null
  >(null);
  const { member: userStoreMember } = useUserStore();
  const [isDataFetching, setIsDataFetching] = useState(false);
  const initializationRef = useRef(false);

  const fetchStats = useCallback(async () => {
    if (!member?.id || isDataFetching) {
      console.log(
        "[MyTime] Skipping fetchStats - no member ID or already fetching",
      );
      return;
    }

    try {
      setIsDataFetching(true);
      console.log("[MyTime] Fetching stats for member:", member.id);
      setIsLoading(true);
      setError(null);

      const currentYear = new Date().getFullYear();

      // Get member's data including division, SDV entitlement, and rolled over PLDs
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("division, sdv_entitlement, pld_rolled_over, company_hire_date")
        .eq("id", member.id)
        .single();

      if (memberError) {
        console.error("[MyTime] Error fetching member data:", memberError);
        throw memberError;
      }

      console.log("[MyTime] Member data:", memberData);

      // Calculate PLD entitlement based on years of service
      const today = new Date();
      const hireDate = new Date(memberData.company_hire_date);
      const yearsOfService = currentYear - hireDate.getFullYear();
      const hasHitAnniversary = today.getMonth() > hireDate.getMonth() ||
        (today.getMonth() === hireDate.getMonth() &&
          today.getDate() >= hireDate.getDate());

      // If they haven't hit their anniversary this year, use previous year's service time
      const effectiveYearsOfService = hasHitAnniversary
        ? yearsOfService
        : yearsOfService - 1;

      // Calculate max PLDs based on years of service
      let maxPlds = 5;
      if (effectiveYearsOfService >= 10) {
        maxPlds = 13;
      } else if (effectiveYearsOfService >= 6) {
        maxPlds = 11;
      } else if (effectiveYearsOfService >= 3) {
        maxPlds = 8;
      }

      console.log("[MyTime] PLD calculation:", {
        yearsOfService,
        hasHitAnniversary,
        effectiveYearsOfService,
        maxPlds,
      });

      // Calculate base stats
      const baseStats: TimeStats = {
        total: {
          pld: maxPlds,
          sdv: memberData?.sdv_entitlement ?? 0,
        },
        rolledOver: {
          pld: memberData.pld_rolled_over ?? 0,
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

        if (request.paid_in_lieu) {
          if (request.status === "pending") {
            baseStats.requested[type]++;
          } else if (request.status === "approved") {
            baseStats.paidInLieu[type]++;
          }
        } else {
          if (
            request.status === "pending" ||
            request.status === "cancellation_pending"
          ) {
            baseStats.requested[type]++;
          } else if (request.status === "waitlisted") {
            baseStats.waitlisted[type]++;
          } else if (request.status === "approved") {
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
        status: "pending",
        requested_at: request.requested_at,
        is_six_month_request: true,
      }));

      // Combine all requests
      const allRequests = [
        ...(currentRequests || []),
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
      // Set default stats on error
      setStats({
        total: { pld: 0, sdv: 0 },
        rolledOver: { pld: 0 },
        available: { pld: 0, sdv: 0 },
        requested: { pld: 0, sdv: 0 },
        waitlisted: { pld: 0, sdv: 0 },
        approved: { pld: 0, sdv: 0 },
        paidInLieu: { pld: 0, sdv: 0 },
      });
    } finally {
      setIsLoading(false);
      setIsDataFetching(false);
    }
  }, [member?.id, isDataFetching]);

  const requestPaidInLieu = useCallback(
    async (type: "PLD" | "SDV") => {
      if (!member?.id) {
        throw new Error("No member ID found");
      }

      try {
        console.log("[MyTime] Requesting paid in lieu for:", {
          type,
          memberId: member.id,
        });
        const { data, error } = await supabase
          .from("pld_sdv_requests")
          .insert({
            member_id: member.id,
            leave_type: type,
            paid_in_lieu: true,
            status: "pending",
            request_date: new Date().toISOString().split("T")[0], // Format as YYYY-MM-DD
            division: member.division,
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
    [member?.id, member?.division],
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
        status: "pending",
        requested_at: request.requested_at,
        is_six_month_request: true,
      }));

      // Combine all requests and update stats
      const allRequests = [
        ...(regularRequests || []),
        ...transformedSixMonthRequests,
      ];
      setRequests(allRequests);

      // Recalculate stats to ensure consistency
      await fetchStats();
    } catch (err) {
      console.error("[MyTime] Error fetching requests:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to fetch time off requests",
      );
    }
  }, [member?.id, fetchStats]);

  const cancelRequest = useCallback(
    async (requestId: string) => {
      if (!member?.id) return false;

      try {
        // Call the database function to handle cancellation
        const { data, error } = await supabase.rpc("cancel_leave_request", {
          p_request_id: requestId,
          p_member_id: member.id,
        });

        if (error) throw error;

        // Send notification to user
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
          // Log but don't throw error for notification failures
          console.warn(
            "[MyTime] Failed to send notification:",
            notificationError,
          );
        }

        // Find the request in our current state to get its date
        const request = requests.find((req) => req.id === requestId);
        if (request) {
          // Update calendar store directly for the specific date
          const calendarStore = useCalendarStore.getState();
          const currentRequests =
            calendarStore.requests[request.request_date] || [];
          const updatedRequests = currentRequests.filter((req) =>
            req.id !== requestId
          );
          calendarStore.setRequests(request.request_date, updatedRequests);
        }

        // Let the realtime subscription handle the state update
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

  // Initialize data
  const initialize = useCallback(async () => {
    if (
      !member?.id || isInitialized || isDataFetching ||
      initializationRef.current
    ) {
      console.log("[MyTime] Skipping initialization - conditions not met:", {
        hasMemberId: !!member?.id,
        isInitialized,
        isDataFetching,
        isInitializing: initializationRef.current,
      });
      return;
    }

    try {
      console.log("[MyTime] Initializing data for member:", member.id);
      initializationRef.current = true;
      setIsDataFetching(true);
      setIsLoading(true);
      setError(null);

      await Promise.all([fetchStats(), fetchRequests()]);
      setIsInitialized(true);
      console.log("[MyTime] Data initialized successfully");
    } catch (error) {
      console.error("[MyTime] Error initializing data:", error);
      setError(
        error instanceof Error ? error.message : "Failed to initialize data",
      );
    } finally {
      setIsLoading(false);
      setIsDataFetching(false);
      initializationRef.current = false;
    }
  }, [member?.id, isInitialized, fetchStats, fetchRequests, isDataFetching]);

  // Set up realtime subscription when member is available and initialized
  useIsomorphicLayoutEffect(() => {
    if (!member?.id || !isInitialized) {
      console.log("[MyTime] Skipping realtime setup - not ready:", {
        hasMemberId: !!member?.id,
        isInitialized,
      });
      return;
    }

    console.log("[MyTime] Setting up realtime subscriptions");
    // Set up realtime subscription for regular requests
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
          try {
            const newRequest = payload.new as TimeOffRequest | null;
            const oldRequest = payload.old as TimeOffRequest | null;

            console.log("[MyTime] Processing regular request update:", {
              eventType: payload.eventType,
              requestId: newRequest?.id || oldRequest?.id,
              status: newRequest?.status || oldRequest?.status,
            });

            if (payload.eventType === "INSERT" && newRequest) {
              setRequests((prev) => [...prev, newRequest]);
              await fetchStats();
            } else if (payload.eventType === "UPDATE" && newRequest) {
              setRequests((prev) =>
                prev.map((req) => (req.id === newRequest.id ? newRequest : req))
              );
              await fetchStats();
            } else if (payload.eventType === "DELETE" && oldRequest) {
              setRequests((prev) =>
                prev.filter((req) => req.id !== oldRequest.id)
              );
              await fetchStats();
            }
          } catch (error) {
            console.error(
              "[MyTime] Error processing regular request update:",
              error,
            );
          }
        },
      )
      .subscribe();

    // Set up realtime subscription for six-month requests
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
        async (payload: RealtimePostgresChangesPayload<SixMonthRequest>) => {
          try {
            console.log("[MyTime] Processing six-month request update");
            await Promise.all([fetchStats(), fetchRequests()]);
          } catch (error) {
            console.error(
              "[MyTime] Error processing six-month request update:",
              error,
            );
          }
        },
      )
      .subscribe();

    return () => {
      console.log("[MyTime] Cleaning up realtime subscriptions");
      regularRequestsChannel.unsubscribe();
      sixMonthRequestsChannel.unsubscribe();
    };
  }, [member?.id, isInitialized, fetchStats, fetchRequests]);

  // Initialize only when auth is ready and not already initialized
  useEffect(() => {
    if (!isAuthLoading && member?.id && !isInitialized) {
      console.log("[MyTime] Auth ready, triggering initialization");
      initialize();
    }
  }, [isAuthLoading, member?.id, isInitialized, initialize]);

  return {
    stats,
    requests,
    isLoading,
    error,
    isInitialized,
    initialize,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
  };
}
