import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/utils/supabase";
import { useAuth } from "./useAuth";
import { RealtimeChannel } from "@supabase/supabase-js";

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

export function useMyTime() {
  const [stats, setStats] = useState<TimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { member, isLoading: isAuthLoading } = useAuth();
  const [realtimeChannel, setRealtimeChannel] = useState<RealtimeChannel | null>(null);

  const fetchStats = useCallback(async () => {
    if (!member?.id) {
      console.log("[MyTime] No member ID available yet");
      return;
    }

    try {
      console.log("[MyTime] Fetching stats for member:", member.id);
      setIsLoading(true);
      setError(null);

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
      const yearsOfService = today.getFullYear() - hireDate.getFullYear();
      const hasHitAnniversary =
        today.getMonth() > hireDate.getMonth() ||
        (today.getMonth() === hireDate.getMonth() && today.getDate() >= hireDate.getDate());

      // If they haven't hit their anniversary this year, use previous year's service time
      const effectiveYearsOfService = hasHitAnniversary ? yearsOfService : yearsOfService - 1;

      // Calculate max PLDs based on years of service
      let maxPlds = 5; // Default for 1-3 years
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

      // Get member's SDV allotment for current year
      const currentYear = new Date().getFullYear();

      // Calculate stats
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

      // Get all requests for the member for current year
      const { data: currentRequests, error: currentRequestsError } = await supabase
        .from("pld_sdv_requests")
        .select("*")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      if (currentRequestsError) {
        console.error("[MyTime] Error fetching current year requests:", currentRequestsError);
        throw currentRequestsError;
      }

      // Get previous year's requests to calculate unused PLDs
      const { data: prevYearRequests, error: prevYearRequestsError } = await supabase
        .from("pld_sdv_requests")
        .select("*")
        .eq("member_id", member.id)
        .eq("leave_type", "PLD")
        .gte("request_date", `${currentYear - 1}-01-01`)
        .lte("request_date", `${currentYear - 1}-12-31`);

      if (prevYearRequestsError) {
        console.error("[MyTime] Error fetching previous year requests:", prevYearRequestsError);
        throw prevYearRequestsError;
      }

      // Get previous year's allotment
      const { data: prevYearAllotment, error: prevYearAllotmentError } = await supabase
        .from("pld_sdv_allotments")
        .select("max_allotment")
        .eq("division", memberData.division)
        .eq("year", currentYear - 1)
        .single();

      if (prevYearAllotmentError && prevYearAllotmentError.code !== "PGRST116") {
        // PGRST116 means no data found, which is fine for previous year
        console.error("[MyTime] Error fetching previous year allotment:", prevYearAllotmentError);
        throw prevYearAllotmentError;
      }

      // Calculate unused PLDs from previous year
      const prevYearTotal = prevYearAllotment?.max_allotment ?? 0;
      const prevYearUsed =
        prevYearRequests?.reduce((total, request) => {
          if (request.status === "approved" || request.paid_in_lieu) {
            return total + 1;
          }
          return total;
        }, 0) ?? 0;
      const unusedPlds = Math.max(0, prevYearTotal - prevYearUsed);

      // If unused PLDs are different from what's stored, update the member record
      if (unusedPlds !== memberData.pld_rolled_over) {
        const { error: updateError } = await supabase
          .from("members")
          .update({ pld_rolled_over: unusedPlds })
          .eq("id", member.id);

        if (updateError) {
          console.error("[MyTime] Error updating rolled over PLDs:", updateError);
          // Don't throw here, just log the error
        }
      }

      console.log("[MyTime] Current year requests:", currentRequests);

      // Process current year requests
      currentRequests?.forEach((request) => {
        if (request.paid_in_lieu) {
          baseStats.paidInLieu[request.leave_type.toLowerCase() as "pld" | "sdv"] += 1;
        } else if (request.waitlist_position) {
          baseStats.waitlisted[request.leave_type.toLowerCase() as "pld" | "sdv"] += 1;
        } else if (request.status === "approved") {
          baseStats.approved[request.leave_type.toLowerCase() as "pld" | "sdv"] += 1;
        } else if (request.status === "pending") {
          baseStats.requested[request.leave_type.toLowerCase() as "pld" | "sdv"] += 1;
        }
      });

      // Update available counts
      baseStats.available.pld -=
        baseStats.approved.pld + baseStats.requested.pld + baseStats.waitlisted.pld + baseStats.paidInLieu.pld;
      baseStats.available.sdv -=
        baseStats.approved.sdv + baseStats.requested.sdv + baseStats.waitlisted.sdv + baseStats.paidInLieu.sdv;

      console.log("[MyTime] Calculated stats:", baseStats);
      setStats(baseStats);
    } catch (err) {
      console.error("[MyTime] Error in fetchStats:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch time statistics");
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
    }
  }, [member?.id]);

  const requestPaidInLieu = useCallback(
    async (type: "PLD" | "SDV") => {
      if (!member?.id) {
        throw new Error("No member ID found");
      }

      try {
        console.log("[MyTime] Requesting paid in lieu for:", { type, memberId: member.id });
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
    [member?.id, member?.division]
  );

  // Set up realtime subscription when member is available
  useEffect(() => {
    if (!member?.id) {
      return;
    }

    console.log("[MyTime] Setting up realtime subscription for member:", member.id);
    // Subscribe to changes in pld_sdv_requests
    const channel = supabase
      .channel(`pld_sdv_requests:${member.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `member_id=eq.${member.id}`,
        },
        (payload) => {
          console.log("[MyTime] Received realtime update:", payload);
          fetchStats();
        }
      )
      .subscribe();

    setRealtimeChannel(channel);

    return () => {
      console.log("[MyTime] Cleaning up realtime subscription");
      channel.unsubscribe();
    };
  }, [member?.id, fetchStats]);

  // Fetch stats when auth is ready
  useEffect(() => {
    console.log("[MyTime] Auth state:", { isAuthLoading, memberId: member?.id });
    if (!isAuthLoading && member?.id) {
      fetchStats();
    }
  }, [isAuthLoading, member?.id, fetchStats]);

  return {
    stats,
    isLoading: isLoading || isAuthLoading,
    error,
    fetchStats,
    requestPaidInLieu,
  };
}
