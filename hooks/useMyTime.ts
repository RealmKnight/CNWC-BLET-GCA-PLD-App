import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useAuth } from "./useAuth";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useUserStore } from "@/store/userStore";
import { useCalendarStore } from "@/store/calendarStore";
import {
  PostgrestError,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { useFocusEffect } from "@react-navigation/native";
import React from "react";
import { AppState, Platform } from "react-native";
import { Database } from "@/types/supabase";
import { addWeeks, subWeeks } from "date-fns";

// Cache configuration - removing CACHE_DURATION
// const CACHE_DURATION = 30000; // 30 seconds - REMOVED
// const VACATION_CACHE_DURATION = 120000; // 2 minutes for vacation data - REMOVED
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1 second base delay
const FETCH_TIMEOUT = 15000; // 15 second timeout (increased from 5s)
const REFRESH_COOLDOWN = 5000; // 5 second cooldown between refreshes
const FOCUS_REFRESH_COOLDOWN = 30000; // 30 second cooldown for screen focus refreshes

interface StatsCache {
  data: TimeStats | null;
  timestamp: number;
  isValid: boolean; // Added for event-based invalidation
}

interface VacationStatsCache {
  data: VacationStats | null;
  timestamp: number;
  isValid: boolean; // Added for event-based invalidation
}

const statsCache: StatsCache = {
  data: null,
  timestamp: 0,
  isValid: false,
};

const vacationStatsCache: VacationStatsCache = {
  data: null,
  timestamp: 0,
  isValid: false,
};

// Add timeout wrapper function
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  // Increase timeout to 15 seconds (from 5 seconds)
  const actualTimeout = 15000;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Operation timed out after ${actualTimeout}ms: ${context}`),
      );
    }, actualTimeout);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// Update the retry function with better error handling and exponential backoff
async function retryFetch<T>(
  fetchFn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`[MyTime] ${context} - Attempt ${attempt}/${maxRetries}`);

      // Add timeout to the fetch operation - don't pass timeoutMs as it's hardcoded now
      return await withTimeout(fetchFn(), FETCH_TIMEOUT, context);
    } catch (error) {
      lastError = error;

      // Log detailed error information
      console.warn(`[MyTime] ${context} - Attempt ${attempt} failed:`, {
        error: error instanceof Error ? error.message : "Unknown error",
        attempt,
        maxRetries,
        willRetry: attempt < maxRetries,
      });

      if (attempt < maxRetries) {
        // Exponential backoff with a cap on max delay
        const delay = Math.min(
          RETRY_BASE_DELAY * Math.pow(2, attempt - 1),
          10000, // Cap at 10 seconds max delay
        );
        console.log(`[MyTime] ${context} - Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[MyTime] ${context} - All ${maxRetries} attempts failed`);
  throw lastError;
}

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
  syncStatus: SyncStatus;
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

// New function to safely get the current timestamp
const getSafeTimestamp = () => typeof window !== "undefined" ? Date.now() : 0;

// Modify the global cache check function to use isValid flag
const isCacheFresh = (
  cache: { data: any; timestamp: number; isValid: boolean },
) => {
  if (typeof window === "undefined") return false; // Never use cache during SSR
  return cache.data && cache.isValid;
};

// Add hydration-safe date handling functions
const getSafeDate = () => {
  if (typeof window === "undefined") {
    // During SSR, return a stable date string
    return new Date("2099-01-01").toISOString();
  }
  return new Date().toISOString();
};

const getDateRange = () => {
  if (typeof window === "undefined") {
    // During SSR, return stable date range
    return {
      minDate: "2099-01-01",
      maxDate: "2099-01-15",
    };
  }

  const now = new Date();
  const minDate = subWeeks(now, 2);
  const maxDate = addWeeks(now, 2);
  return {
    minDate: minDate.toISOString(),
    maxDate: maxDate.toISOString(),
  };
};

// Define a custom error class to better handle database errors
export class DatabaseError extends Error {
  code?: string;
  details?: string | null;
  hint?: string | null;

  constructor(error: PostgrestError) {
    super(error.message);
    this.name = "DatabaseError";
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;

    // This allows instances of DatabaseError to be used with instanceof
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

// Add a singleton pattern for subscription management
// This ensures we only have one active subscription per user
let globalRealtimeChannel: {
  channel: RealtimeChannel | null;
  userId: string | null;
  unsubscribe: (() => void) | null;
} = {
  channel: null,
  userId: null,
  unsubscribe: null,
};

// Add a flag to prevent concurrent refreshes
let isRefreshingData = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_BACKOFF_TIME = 5000; // 5 seconds
let lastFailureTime = 0;

// Add tracking for focus events
let lastFocusRefreshTime = 0;
let lastRefreshAttemptTime = 0; // Add a timestamp to track refresh attempts

// At the module level, add a flag to track global initialization state
// let isGloballyInitialized = false; // REMOVE THIS - We'll rely on the hook's own state

// Determine initial state based on cache freshness
const initialStatsAreFresh = isCacheFresh(statsCache);
const initialVacationStatsAreFresh = isCacheFresh(vacationStatsCache);
const initialIsLoading =
  !(initialStatsAreFresh && initialVacationStatsAreFresh);

export function useMyTime() {
  const { member, user, authStatus } = useAuth();
  const { isInitialized: isCalendarInitialized } = useCalendarStore();
  // Initialize state from cache if fresh
  const [timeStats, setTimeStats] = useState<TimeStats | null>(() =>
    initialStatsAreFresh ? statsCache.data : null
  );
  const [vacationStats, setVacationStats] = useState<VacationStats | null>(() =>
    initialVacationStatsAreFresh ? vacationStatsCache.data : null
  );
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [vacationRequests, setVacationRequests] = useState<
    UserVacationRequest[]
  >([]);
  const [sixMonthRequests, setSixMonthRequests] = useState<SixMonthRequest[]>(
    [],
  );
  // Initialize isLoading based on initial cache status
  const [isLoading, setIsLoading] = useState(initialIsLoading);
  const [isRefreshing, setIsRefreshing] = useState(false); // For explicit user-triggered refreshes
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false); // Tracks if this hook instance has initialized

  // New Sync Status state to provide more detailed loading/error feedback
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncAttempt: null,
    lastSuccessfulSync: null,
    failedAttempts: 0,
    error: null,
  });

  // Refs
  const realtimeChannel = useRef<RealtimeChannel | null>(null);
  const lastRefreshTime = useRef<number>(0);
  const isMounted = useRef(false); // Change initial value to false
  // Add a ref to store the refreshData function
  const refreshDataRef = useRef<
    ((isUserInitiated?: boolean) => Promise<void>) | null
  >(null);

  // Set isMounted to true in an effect that runs once on mount
  useEffect(() => {
    console.log("[MyTime] Component mounting, setting isMounted = true");
    isMounted.current = true;

    return () => {
      console.log("[MyTime] Component unmounting, setting isMounted = false");
      isMounted.current = false;
    };
  }, []);

  // Export invalidateCache function - MOVED UP
  const invalidateCache = useCallback(() => {
    console.log("[MyTime] Invalidating cache");
    statsCache.isValid = false;
    vacationStatsCache.isValid = false;
  }, []);

  // MOVED UP - Update fetchTimeStats to use event-based caching with better error handling
  const fetchTimeStats = useCallback(
    async (memberId: string, forceRefresh = false) => {
      console.log(
        "[MyTime] Fetching time stats for member:",
        memberId,
        "force:",
        forceRefresh,
        "statsCache.isValid:",
        statsCache.isValid,
        "hasData:",
        !!statsCache.data,
        "isMounted:",
        isMounted.current,
      );

      // Check cache validity, use cache if valid and not forcing refresh
      if (!forceRefresh && isCacheFresh(statsCache)) {
        console.log("[MyTime] Using cached time stats:", statsCache.data);
        setTimeStats(statsCache.data);
        return statsCache.data;
      }

      try {
        const result = await retryFetch(
          async () => {
            console.log(
              "[MyTime] Starting actual database queries for time stats",
            );
            const currentYear = new Date().getFullYear();

            // Split into smaller queries to reduce timeout risk
            // First get member data
            const memberData = await supabase
              .from("members")
              .select(
                "division_id, sdv_entitlement, pld_rolled_over, company_hire_date",
              )
              .eq("id", memberId)
              .single();

            if (memberData.error) {
              console.error(
                "[MyTime] Error fetching member data:",
                memberData.error,
              );
              throw memberData.error;
            }

            console.log("[MyTime] Successfully fetched member data");

            // Get max PLDs
            const maxPldsResult = await supabase.rpc("update_member_max_plds", {
              p_member_id: memberId,
            });

            if (maxPldsResult.error) {
              console.error(
                "[MyTime] Error fetching max PLDs:",
                maxPldsResult.error,
              );
              throw maxPldsResult.error;
            }

            console.log(
              "[MyTime] Successfully fetched max PLDs:",
              maxPldsResult.data,
            );

            // Now fetch regular requests for current year
            const regularRequests = await supabase
              .from("pld_sdv_requests")
              .select("id, leave_type, status, paid_in_lieu, is_rollover_pld") // Select only needed fields
              .eq("member_id", memberId)
              .gte("request_date", `${currentYear}-01-01`)
              .lte("request_date", `${currentYear}-12-31`);

            if (regularRequests.error) {
              console.error(
                "[MyTime] Error fetching regular requests:",
                regularRequests.error,
              );
              throw regularRequests.error;
            }

            console.log(
              "[MyTime] Successfully fetched regular requests count:",
              regularRequests.data?.length || 0,
            );

            // Fetch six-month requests
            const sixMonthRequests = await supabase
              .from("six_month_requests")
              .select("id, leave_type, processed") // Select only needed fields
              .eq("member_id", memberId)
              .gte("request_date", `${currentYear}-01-01`)
              .lte("request_date", `${currentYear}-12-31`);

            if (sixMonthRequests.error) {
              console.error(
                "[MyTime] Error fetching six-month requests:",
                sixMonthRequests.error,
              );
              throw sixMonthRequests.error;
            }

            console.log(
              "[MyTime] Successfully fetched six-month requests count:",
              sixMonthRequests.data?.length || 0,
            );

            // Calculate used rollover PLDs from regular requests
            const usedRolloverPlds = regularRequests.data
              ? regularRequests.data
                .filter((req) =>
                  req.status === "approved" && req.is_rollover_pld
                )
                .length
              : 0;

            const unusedRolledOverPlds =
              (memberData.data.pld_rolled_over || 0) -
              usedRolloverPlds;

            // Calculate base stats
            const baseStats: TimeStats = {
              total: {
                pld: maxPldsResult.data,
                sdv: memberData.data?.sdv_entitlement ?? 0,
              },
              rolledOver: {
                pld: memberData.data.pld_rolled_over ?? 0,
                unusedPlds: Math.max(0, unusedRolledOverPlds),
              },
              available: {
                pld: maxPldsResult.data +
                  (memberData.data.pld_rolled_over ?? 0),
                sdv: memberData.data?.sdv_entitlement ?? 0,
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
              syncStatus: syncStatus,
            };

            // Update stats based on current year requests - with error handling
            try {
              (regularRequests.data || []).forEach((request) => {
                const type = request.leave_type?.toLowerCase() as "pld" | "sdv";
                if (!type) return; // Skip if no leave type

                if (request.paid_in_lieu) {
                  if (request.status === "pending") {
                    baseStats.requested[type]++;
                  } else if (request.status === "approved") {
                    baseStats.paidInLieu[type]++;
                  }
                } else {
                  if (request.status === "pending") {
                    baseStats.requested[type]++;
                  } else if (request.status === "cancellation_pending") {
                    baseStats.requested[type]++;
                  } else if (request.status === "waitlisted") {
                    baseStats.waitlisted[type]++;
                  } else if (request.status === "approved") {
                    baseStats.approved[type]++;
                  }
                }
              });
            } catch (err) {
              console.error("[MyTime] Error processing regular requests:", err);
              // Continue despite this error
            }

            // Update stats based on six-month requests - with error handling
            try {
              (sixMonthRequests.data || []).forEach((request) => {
                const type = request.leave_type?.toLowerCase() as "pld" | "sdv";
                if (!type) return; // Skip if no leave type

                if (!request.processed) {
                  baseStats.requested[type]++;
                }
              });
            } catch (err) {
              console.error(
                "[MyTime] Error processing six-month requests:",
                err,
              );
              // Continue despite this error
            }

            // Update available counts
            baseStats.available.pld -= baseStats.approved.pld +
              baseStats.requested.pld + baseStats.waitlisted.pld +
              baseStats.paidInLieu.pld;
            baseStats.available.sdv -= baseStats.approved.sdv +
              baseStats.requested.sdv + baseStats.waitlisted.sdv +
              baseStats.paidInLieu.sdv;

            // Ensure we don't have negative values
            baseStats.available.pld = Math.max(0, baseStats.available.pld);
            baseStats.available.sdv = Math.max(0, baseStats.available.sdv);

            console.log(
              "[MyTime] Successfully calculated stats:",
              JSON.stringify(baseStats, null, 2),
            );

            return baseStats;
          },
          "Fetch Time Stats",
        );

        console.log(
          "[MyTime] Successfully fetched time stats, updating state and cache",
        );

        // Update cache with new data and mark as valid
        statsCache.data = result;
        statsCache.timestamp = Date.now();
        statsCache.isValid = true;

        // IMPORTANT CHANGE: Always update the state regardless of isMounted
        // React will handle this safely even if the component unmounts during the async operation
        setTimeStats(result);
        console.log(
          "[MyTime] State updated with time stats data, isMounted =",
          isMounted.current,
        );

        return result;
      } catch (error) {
        console.error("[MyTime] Error fetching time stats:", error);

        // Return default data structure on error to prevent UI breakage
        const defaultStats: TimeStats = {
          total: { pld: 0, sdv: 0 },
          rolledOver: { pld: 0, unusedPlds: 0 },
          available: { pld: 0, sdv: 0 },
          requested: { pld: 0, sdv: 0 },
          waitlisted: { pld: 0, sdv: 0 },
          approved: { pld: 0, sdv: 0 },
          paidInLieu: { pld: 0, sdv: 0 },
          syncStatus: {
            ...syncStatus,
            error: error instanceof Error
              ? error.message
              : "Unknown error fetching time stats",
          },
        };

        // Always update the state even on error
        setTimeStats(defaultStats);
        console.log(
          "[MyTime] Setting default stats on error, isMounted =",
          isMounted.current,
        );

        throw error;
      }
    },
    [syncStatus],
  );

  // MOVED UP - Update fetchVacationStats to use event-based caching
  const fetchVacationStats = useCallback(
    async (memberId: string, forceRefresh = false) => {
      console.log(
        "[MyTime] Fetching vacation stats for member:",
        memberId,
        "force:",
        forceRefresh,
        "isMounted:",
        isMounted.current,
      );

      // Check cache validity, use cache if valid and not forcing refresh
      if (!forceRefresh && isCacheFresh(vacationStatsCache)) {
        console.log("[MyTime] Using cached vacation stats");
        setVacationStats(vacationStatsCache.data);
        return vacationStatsCache.data;
      }

      try {
        const result = await retryFetch(
          async () => {
            // Get member data for vacation entitlement
            const memberData = await supabase
              .from("members")
              .select("curr_vacation_weeks, curr_vacation_split, pin_number")
              .eq("id", memberId)
              .single();

            if (memberData.error) throw memberData.error;

            const pin = memberData.data?.pin_number;
            if (pin === null) {
              console.log(
                "[MyTime] Member has no PIN number, skipping vacation stats",
              );
              return {
                totalWeeks: 0,
                splitWeeks: 0,
                weeksToBid: 0,
                approvedWeeks: 0,
                remainingWeeks: 0,
              };
            }

            // Get approved vacation requests count using PIN number
            const currentYear = new Date().getFullYear();
            const vacationRequestsData = await supabase
              .from("vacation_requests")
              .select("id")
              .eq("pin_number", pin)
              .eq("status", "approved")
              .gte("start_date", `${currentYear}-01-01`)
              .lte("end_date", `${currentYear}-12-31`);

            if (vacationRequestsData.error) throw vacationRequestsData.error;

            const totalWeeks = memberData.data?.curr_vacation_weeks || 0;
            const splitWeeks = memberData.data?.curr_vacation_split || 0;
            const weeksToBid = totalWeeks - splitWeeks;
            const approvedWeeks = vacationRequestsData.data?.length || 0;
            const remainingWeeks = weeksToBid - approvedWeeks;

            return {
              totalWeeks,
              splitWeeks,
              weeksToBid,
              approvedWeeks,
              remainingWeeks: Math.max(0, remainingWeeks),
            };
          },
          "Fetch Vacation Stats",
        );

        // Update cache with new data and mark as valid
        vacationStatsCache.data = result;
        vacationStatsCache.timestamp = Date.now();
        vacationStatsCache.isValid = true;

        // Always update the state regardless of isMounted
        setVacationStats(result);
        console.log(
          "[MyTime] Vacation stats updated, isMounted =",
          isMounted.current,
        );

        return result;
      } catch (error) {
        console.error("[MyTime] Error fetching vacation stats:", error);
        // Don't set null on error - return empty stats object
        const defaultVacationStats = {
          totalWeeks: 0,
          splitWeeks: 0,
          weeksToBid: 0,
          approvedWeeks: 0,
          remainingWeeks: 0,
        };
        setVacationStats(defaultVacationStats);
        throw error;
      }
    },
    [],
  );

  // MOVED UP - Fetch time off requests (PLD/SDV)
  const fetchTimeOffRequests = useCallback(async (memberId: string) => {
    console.log(
      "[MyTime] Fetching time off requests for member:",
      memberId,
      "isMounted:",
      isMounted.current,
    );

    try {
      const currentYear = new Date().getFullYear();

      // Fetch regular requests
      const { data: regularRequests, error: regularError } = await supabase
        .from("pld_sdv_requests")
        .select("*")
        .eq("member_id", memberId)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`)
        .not("status", "in", '("cancelled","denied")')
        .order("request_date", { ascending: true });

      if (regularError) throw regularError;

      // Fetch six-month requests separately - we'll combine them later
      const { data: sixMonthRequests, error: sixMonthError } = await supabase
        .from("six_month_requests")
        .select("*")
        .eq("member_id", memberId)
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
        calendar_id: request.calendar_id,
      }));

      // Combine all requests
      const allRequests: TimeOffRequest[] = [
        ...(regularRequests || []).map((req) => ({
          ...req,
          status: req.status as TimeOffRequest["status"],
          requested_at: req.requested_at ?? "",
          is_six_month_request: false,
        })),
        ...transformedSixMonthRequests,
      ];

      // Always update state
      setTimeOffRequests(allRequests);
      console.log(
        "[MyTime] Time off requests updated, count:",
        allRequests.length,
      );

      return allRequests;
    } catch (error) {
      console.error("[MyTime] Error fetching time off requests:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to fetch time off requests",
      );
      // Set empty array on error
      setTimeOffRequests([]);
      return [];
    }
  }, []);

  // MOVED UP - Fetch vacation requests
  const fetchVacationRequests = useCallback(async (memberId: string) => {
    console.log(
      "[MyTime] Fetching vacation requests for member:",
      memberId,
      "isMounted:",
      isMounted.current,
    );

    try {
      const currentYear = new Date().getFullYear();

      // Get member's PIN number first
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("pin_number")
        .eq("id", memberId)
        .single();

      if (memberError) throw memberError;

      const pin = memberData?.pin_number;
      if (pin === null) {
        console.log(
          "[MyTime] Member has no PIN number, skipping vacation requests",
        );
        if (isMounted.current) {
          setVacationRequests([]);
        }
        return [];
      }

      // Now fetch vacation requests using the PIN
      const { data, error } = await supabase
        .from("vacation_requests")
        .select("id, start_date, end_date, status, requested_at")
        .eq("pin_number", pin)
        .gte("start_date", `${currentYear}-01-01`)
        .lte("start_date", `${currentYear}-12-31`)
        .order("start_date", { ascending: true });

      if (error) throw error;

      const vacRequests = (data || []).map((req) => ({
        ...req,
        requested_at: req.requested_at ?? new Date(0).toISOString(),
      })) as UserVacationRequest[];

      // Always update state
      setVacationRequests(vacRequests);
      console.log(
        "[MyTime] Vacation requests updated, count:",
        vacRequests.length,
      );

      return vacRequests;
    } catch (error) {
      console.error("[MyTime] Error fetching vacation requests:", error);
      // Don't set global error for vacation requests - this is secondary data
      // Set empty array on error
      setVacationRequests([]);
      return [];
    }
  }, []);

  // MOVED UP - Fetch six-month requests
  const fetchSixMonthRequests = useCallback(async (memberId: string) => {
    console.log("[MyTime] Fetching six-month requests for member:", memberId);

    try {
      const currentYear = new Date().getFullYear();

      const { data, error } = await supabase
        .from("six_month_requests")
        .select("*")
        .eq("member_id", memberId)
        .eq("processed", false)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      if (error) throw error;

      if (isMounted.current) {
        setSixMonthRequests(data || []);
      }

      return data || [];
    } catch (error) {
      console.error("[MyTime] Error fetching six-month requests:", error);
      return [];
    }
  }, []);

  // Function to refresh data with cooldown and cache check
  const refreshData = useCallback(async (isUserInitiated = false) => {
    if (!member || !user) {
      console.log("[MyTime] Cannot refresh without member and user data");
      return;
    }

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;
    const timeSinceLastAttempt = now - lastRefreshAttemptTime;

    // Update the last attempt time regardless of whether we proceed with the refresh
    lastRefreshAttemptTime = now;

    console.log(
      `[MyTime] refreshData called, userInitiated: ${isUserInitiated}, timeSinceLastRefresh: ${timeSinceLastRefresh}ms, isRefreshingData: ${isRefreshingData}`,
    );

    // PREVENT INFINITE LOOPS: Don't allow concurrent refreshes
    if (isRefreshingData) {
      console.log("[MyTime] Refresh already in progress, skipping");
      return;
    }

    // PREVENT INFINITE LOOPS: If we've had too many consecutive failures, back off
    if (!isUserInitiated && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const timeSinceLastFailure = now - lastFailureTime;
      if (timeSinceLastFailure < FAILURE_BACKOFF_TIME) {
        console.log(
          `[MyTime] Backing off after ${consecutiveFailures} consecutive failures. Will retry after cooldown.`,
        );
        return;
      }
    }

    // Apply cooldown unless user initiated or force refresh
    if (!isUserInitiated && timeSinceLastRefresh < REFRESH_COOLDOWN) {
      console.log(
        "[MyTime] Refresh on cooldown, skipping. Time since last refresh:",
        timeSinceLastRefresh,
        "ms",
      );
      return;
    }

    // Prevent frequent successive refresh attempts even if not concurrent
    if (!isUserInitiated && timeSinceLastAttempt < 1000) { // 1 second minimum between attempts
      console.log("[MyTime] Too many rapid refresh attempts, throttling");
      return;
    }

    // If user initiated, update UI immediately
    if (isUserInitiated) {
      setIsRefreshing(true);
      // Also invalidate cache for user-initiated refreshes
      invalidateCache();
    } else {
      // Background refresh
      setSyncStatus((prev) => ({
        ...prev,
        isSyncing: true,
        lastSyncAttempt: new Date(),
      }));
    }

    // Set the concurrent refresh flag
    isRefreshingData = true;

    try {
      console.log(
        "[MyTime] Starting refresh" +
          (isUserInitiated ? " (user initiated)" : ""),
      );

      // Critical safety check - ensure we're still mounted before continuing
      if (!isMounted.current) {
        console.log(
          "[MyTime] Component unmounted during refresh preparation, aborting",
        );
        isRefreshingData = false;
        return;
      }

      // Fetch all data with proper error handling for each
      try {
        await fetchTimeStats(member.id, isUserInitiated);
        console.log("[MyTime] Time stats fetched successfully");
      } catch (error) {
        console.error("[MyTime] Error fetching time stats:", error);
        // Continue with other fetches
      }

      try {
        await fetchVacationStats(member.id, isUserInitiated);
        console.log("[MyTime] Vacation stats fetched successfully");
      } catch (error) {
        console.error("[MyTime] Error fetching vacation stats:", error);
        // Continue with other fetches
      }

      try {
        await fetchTimeOffRequests(member.id);
        console.log("[MyTime] Time off requests fetched successfully");
      } catch (error) {
        console.error("[MyTime] Error fetching time off requests:", error);
        // Continue with other fetches
      }

      try {
        await fetchVacationRequests(member.id);
        console.log("[MyTime] Vacation requests fetched successfully");
      } catch (error) {
        console.error("[MyTime] Error fetching vacation requests:", error);
        // Continue with other fetches
      }

      try {
        await fetchSixMonthRequests(member.id);
        console.log("[MyTime] Six-month requests fetched successfully");
      } catch (error) {
        console.error("[MyTime] Error fetching six-month requests:", error);
        // Continue with other fetches
      }

      // Update status
      lastRefreshTime.current = now;
      consecutiveFailures = 0; // Reset failure counter on success

      if (!isUserInitiated) {
        setSyncStatus((prev) => ({
          ...prev,
          isSyncing: false,
          lastSuccessfulSync: new Date(),
          failedAttempts: 0,
          error: null,
        }));
      }

      console.log("[MyTime] Refresh complete");
    } catch (error) {
      console.error("[MyTime] Refresh error:", error);

      // Update failure tracking
      consecutiveFailures++;
      lastFailureTime = Date.now();

      if (!isUserInitiated) {
        setSyncStatus((prev) => ({
          ...prev,
          isSyncing: false,
          failedAttempts: prev.failedAttempts + 1,
          error: error instanceof Error
            ? error.message
            : "Failed to refresh MyTime data",
        }));
      } else {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to refresh MyTime data",
        );
      }
    } finally {
      if (isUserInitiated) {
        setIsRefreshing(false);
      }
      // Clear the concurrent refresh flag
      isRefreshingData = false;
    }
  }, [
    member,
    user,
    invalidateCache,
    fetchTimeStats,
    fetchVacationStats,
    fetchTimeOffRequests,
    fetchVacationRequests,
    fetchSixMonthRequests,
  ]);

  // Store the refreshData function in the ref so setupRealtimeChannel can use it
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  // MOVED UP - Setup realtime channel - Modified to use the singleton pattern
  const setupRealtimeChannel = useCallback((memberId: string) => {
    // Check if we already have a subscription for this user
    if (
      globalRealtimeChannel.channel && globalRealtimeChannel.userId === memberId
    ) {
      console.log("[MyTime] Subscription already exists for user:", memberId);
      return globalRealtimeChannel.unsubscribe;
    }

    // If we have a subscription for a different user, clean it up first
    if (
      globalRealtimeChannel.channel && globalRealtimeChannel.userId !== memberId
    ) {
      console.log(
        "[MyTime] Cleaning up existing subscription for different user before creating new one",
      );
      globalRealtimeChannel.channel.unsubscribe();
      globalRealtimeChannel.channel = null;
      globalRealtimeChannel.userId = null;
      if (globalRealtimeChannel.unsubscribe) {
        globalRealtimeChannel.unsubscribe();
        globalRealtimeChannel.unsubscribe = null;
      }
    }

    // Clean up local component subscription if it exists
    if (realtimeChannel.current) {
      console.log("[MyTime] Cleaning up component-level subscription");
      realtimeChannel.current.unsubscribe();
      realtimeChannel.current = null;
    }

    console.log("[MyTime] Setting up realtime channel for member:", memberId);

    try {
      // Get member's PIN number first for vacation requests
      supabase
        .from("members")
        .select("pin_number")
        .eq("id", memberId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("[MyTime] Error getting member PIN:", error);
            return;
          }

          const pin = data?.pin_number;

          const channel = supabase.channel(`mytime-updates-${memberId}`);
          console.log(
            "[MyTime] Creating new channel:",
            `mytime-updates-${memberId}`,
          );

          // Listen for changes to PLD/SDV requests
          channel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "pld_sdv_requests",
                filter: `member_id=eq.${memberId}`,
              },
              (payload) => {
                console.log(
                  "[MyTime Realtime] PLD/SDV request update:",
                  payload,
                );
                // Invalidate cache and refresh data
                invalidateCache();
                // Use refreshDataRef instead of calling refreshData directly
                if (refreshDataRef.current) {
                  refreshDataRef.current(false);
                }
              },
            );

          // Only set up vacation requests listener if PIN exists
          if (pin) {
            channel.on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "vacation_requests",
                filter: `pin_number=eq.${pin}`,
              },
              (payload) => {
                console.log(
                  "[MyTime Realtime] Vacation request update:",
                  payload,
                );
                // Invalidate cache and refresh data
                invalidateCache();
                // Use refreshDataRef instead of calling refreshData directly
                if (refreshDataRef.current) {
                  refreshDataRef.current(false);
                }
              },
            );
          }

          // Listen for changes to allocation
          channel
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "member_pld_sdv_allocations",
                filter: `member_id=eq.${memberId}`,
              },
              (payload) => {
                console.log("[MyTime Realtime] Allocation update:", payload);
                // Invalidate cache and refresh data
                invalidateCache();
                // Use refreshDataRef instead of calling refreshData directly
                if (refreshDataRef.current) {
                  refreshDataRef.current(false);
                }
              },
            )
            .subscribe((status) => {
              console.log(
                `[MyTime Realtime] Subscription status for user ${memberId}:`,
                status,
              );
            });

          // Store in both the component ref and global singleton
          realtimeChannel.current = channel;
          globalRealtimeChannel.channel = channel;
          globalRealtimeChannel.userId = memberId;

          // Create unsubscribe function
          const unsubscribeFn = () => {
            console.log(
              "[MyTime] Unsubscribing from channel:",
              `mytime-updates-${memberId}`,
            );
            channel.unsubscribe();
            // Clear the global reference if it's this channel
            if (globalRealtimeChannel.channel === channel) {
              globalRealtimeChannel.channel = null;
              globalRealtimeChannel.userId = null;
              globalRealtimeChannel.unsubscribe = null;
            }
          };

          // Store unsubscribe function
          globalRealtimeChannel.unsubscribe = unsubscribeFn;

          return unsubscribeFn;
        });

      // Return a dummy cleanup function for now, the real one will be set after async operation
      return () => {
        console.log("[MyTime] Placeholder cleanup called");
      };
    } catch (error) {
      console.error("[MyTime] Error setting up realtime channel:", error);
      return () => {};
    }
  }, [invalidateCache]); // Remove refreshData dependency

  // Initialization function for the hook instance
  const initialize = useCallback(async (force = false) => {
    console.log(
      "[MyTime] Hook initialize called with force =",
      force,
      "isMounted:",
      isMounted.current,
      "isInitialized (hook):",
      isInitialized,
    );

    if (!member || !user) {
      console.log("[MyTime] Cannot initialize without member and user data");
      setIsLoading(false); // Not loading if we can't initialize
      return;
    }

    // If already initialized in this instance and not forcing, do nothing
    if (isInitialized && !force) {
      console.log(
        "[MyTime] Already initialized this instance, skipping init logic",
      );
      // If cache is invalid, trigger a quiet refresh
      if (!isCacheFresh(statsCache) || !isCacheFresh(vacationStatsCache)) {
        console.log(
          "[MyTime] Cache invalid on skipped init, triggering quiet refresh",
        );
        refreshData(false); // Use non-user initiated refresh
      }
      setIsLoading(false); // Ensure loading is false if already initialized
      return;
    }

    // Prevent concurrent initializations for this instance
    if (isLoading && !force) {
      console.log(
        "[MyTime] Instance already loading, skipping duplicate initialization",
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Set up realtime channel - this should be safe to call multiple times due to singleton logic
      setupRealtimeChannel(member.id);

      console.log("[MyTime] Starting initial data fetching for hook instance");

      // Fetch all data - force refresh on initial load
      await refreshData(true); // Use user-initiated to ensure data is fetched fresh

      setIsInitialized(true); // Mark this instance as initialized
      lastRefreshTime.current = Date.now();
      lastFocusRefreshTime = Date.now(); // Update focus refresh time too

      console.log(
        "[MyTime] Hook instance initialization complete, isInitialized =",
        true,
      );
    } catch (error) {
      console.error("[MyTime] Hook instance initialization error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to initialize MyTime data",
      );
      // Mark as initialized even on error to prevent re-init loops
      setIsInitialized(true);
    } finally {
      // Always ensure isLoading is false after initialization attempt
      setIsLoading(false);
      console.log(
        "[MyTime] Setting isLoading = false after initialize attempt",
      );
    }
  }, [
    member,
    user,
    setupRealtimeChannel,
    refreshData, // Add refreshData dependency
  ]);

  // Modified cleanup function
  const cleanup = useCallback(() => {
    console.log("[MyTime] Running cleanup");

    // Clear all state
    setTimeStats(null);
    setVacationStats(null);
    setTimeOffRequests([]);
    setVacationRequests([]);
    setSixMonthRequests([]);
    setIsLoading(false);
    setIsRefreshing(false);
    setError(null);
    setIsInitialized(false);

    // Reset cache
    statsCache.data = null;
    statsCache.timestamp = 0;
    statsCache.isValid = false;
    vacationStatsCache.data = null;
    vacationStatsCache.timestamp = 0;
    vacationStatsCache.isValid = false;

    // Close realtime channel - component level
    if (realtimeChannel.current) {
      console.log("[MyTime] Removing component realtime subscription");
      realtimeChannel.current.unsubscribe();
      realtimeChannel.current = null;
    }

    // Don't touch the global subscription here - let the auth system manage that
    // This function is called when the component unmounts, but the user might still be logged in

    console.log("[MyTime] Cleanup complete");
  }, []);

  // Use effect for app state changes - refined to check realtime connection
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      // Only refresh when returning to active state
      if (nextAppState === "active" && member && user) {
        console.log("[MyTime] App became active, checking realtime connection");

        // Check if realtime channel needs to be re-established
        if (!realtimeChannel.current) {
          console.log("[MyTime] Realtime channel not found, setting up");
          setupRealtimeChannel(member.id);
        }

        // Only refresh if significant time has passed or cache invalid
        if (
          !isCacheFresh(statsCache) ||
          !isCacheFresh(vacationStatsCache) ||
          Date.now() - lastRefreshTime.current > 60000 // 1 minute
        ) {
          console.log("[MyTime] Cache invalid or stale, refreshing data");
          refreshData(false);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [member, user, setupRealtimeChannel, refreshData]);

  // Use focus effect for screen focus - refined to respect cooldown and prevent loops
  useFocusEffect(
    React.useCallback(() => {
      if (member && user) {
        const now = Date.now();
        // Only refresh on focus if significant time has passed
        if (now - lastFocusRefreshTime > FOCUS_REFRESH_COOLDOWN) {
          console.log(
            "[MyTime] Focus refresh cooldown passed, refreshing on focus",
          );
          lastFocusRefreshTime = now;

          // Check if realtime channel needs to be set up
          if (!realtimeChannel.current && !globalRealtimeChannel.channel) {
            console.log("[MyTime] Setting up realtime channel on focus");
            setupRealtimeChannel(member.id);
          }

          // Only refresh if cache is invalid
          if (!isCacheFresh(statsCache) || !isCacheFresh(vacationStatsCache)) {
            console.log("[MyTime] Cache invalid, refreshing data on focus");
            refreshData(false);
          }
        } else {
          console.log("[MyTime] Skipping focus refresh, cooldown active");
        }
      }

      return () => {
        // No cleanup needed, handled by useEffect unmount
      };
    }, [member, user, setupRealtimeChannel, refreshData]),
  );

  // Initialize when member and user are available AND component is mounted
  useEffect(() => {
    if (
      authStatus === "signedInMember" && member && user && isMounted.current
    ) {
      console.log(
        "[MyTime] Auth OK & Mounted. Checking initialization need. Hook initialized:",
        isInitialized,
        "Global channel user:",
        globalRealtimeChannel.userId,
        "Hook isLoading:",
        isLoading, // Log current loading state
      );

      // Check if the global channel is already set up for this user by the standalone init
      if (
        globalRealtimeChannel.channel &&
        globalRealtimeChannel.userId === member.id
      ) {
        console.log(
          "[MyTime] Global channel exists for this user. Checking initial cache status.",
        );

        // Mark the hook as initialized now, as the global setup handles the channel
        if (!isInitialized) {
          setIsInitialized(true);
        }

        // Re-check cache freshness (it might have changed since initial state setup)
        const statsFreshNow = isCacheFresh(statsCache);
        const vacationFreshNow = isCacheFresh(vacationStatsCache);

        // If the initial state was loaded from fresh cache, ensure isLoading is false.
        // If the cache became stale *after* initial load, this condition might not be met.
        if (statsFreshNow && vacationFreshNow) {
          console.log(
            "[MyTime] Cache still fresh or became fresh. Ensuring loading is false.",
          );
          // If state isn't already populated (edge case), populate it.
          if (!timeStats && statsCache.data) setTimeStats(statsCache.data);
          if (!vacationStats && vacationStatsCache.data) {
            setVacationStats(vacationStatsCache.data);
          }
          setIsLoading(false); // Ensure loading is false if cache is fresh
        } else {
          // Cache is NOW stale or missing. Trigger a background refresh.
          console.log(
            "[MyTime] Cache became stale or was initially stale. Triggering quiet background refresh.",
          );
          setIsLoading(true); // Set loading to true while background refresh happens
          refreshData(false);
        }
      } else if (!isInitialized) {
        // Global channel NOT set up correctly OR hook not initialized yet, run the hook's internal init
        console.log(
          "[MyTime] Global channel mismatch or hook not initialized. Running hook's internal initialize.",
        );
        // initialize() function manages its own isLoading state, so no need to set it here.
        initialize(false);
      } else {
        // Hook is already initialized, global channel check wasn't needed or passed earlier.
        console.log(
          "[MyTime] Hook already initialized, skipping initialize call.",
        );
        // Ensure loading is false if already initialized and not currently refreshing
        if (!isRefreshingData) { // Check if a refresh isn't already in progress
          setIsLoading(false);
        }
      }
    }
    return () => {};
  }, [
    authStatus,
    member,
    user,
    isInitialized,
    initialize,
    isMounted.current,
    timeStats,
    vacationStats,
  ]); // Add timeStats/vacationStats to deps

  // Add an AppState event listener specifically for background/foreground transitions
  useEffect(() => {
    if (Platform.OS !== "web") {
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (nextAppState === "active" && member && user && isInitialized) {
            console.log(
              "[MyTime] App became active after background - checking for data freshness",
            );

            // Check if cache is stale
            const now = Date.now();
            const timeSinceLastRefresh = now - lastRefreshTime.current;

            // If it's been more than 2 minutes or cache invalid, refresh data
            if (timeSinceLastRefresh > 120000 || !isCacheFresh(statsCache)) {
              console.log(
                "[MyTime] Cache is stale, refreshing data on return from background",
              );
              // Use a non-user-initiated refresh to avoid showing spinner
              refreshData(false);
            }
          }
        },
      );

      return () => {
        subscription.remove();
      };
    }

    return undefined;
  }, [member, user, isInitialized, refreshData]);

  // Request paid in lieu
  const requestPaidInLieu = useCallback(
    async (type: "PLD" | "SDV", date: Date): Promise<boolean> => {
      if (!member || !user) {
        console.error(
          "[MyTime] Cannot request paid in lieu without member and user data",
        );
        return false;
      }

      try {
        console.log(
          `[MyTime] Requesting paid in lieu for ${type} on ${date.toISOString()}`,
        );

        // Format date for database
        const formattedDate = date.toISOString().split("T")[0];

        // Insert request into database
        const { data, error } = await supabase
          .from("pld_sdv_requests")
          .insert({
            member_id: member.id,
            request_date: formattedDate,
            leave_type: type,
            status: "pending",
            paid_in_lieu: true,
            requested_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw error;

        // Invalidate cache and refresh data
        invalidateCache();
        refreshData(true);

        console.log("[MyTime] Paid in lieu request successful:", data);
        return true;
      } catch (error) {
        console.error("[MyTime] Error requesting paid in lieu:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Failed to request paid in lieu",
        );
        return false;
      }
    },
    [member, user, invalidateCache, refreshData],
  );

  // Cancel a regular request
  const cancelRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      if (!member || !user) {
        console.error(
          "[MyTime] Cannot cancel request without member and user data",
        );
        return false;
      }

      try {
        console.log(`[MyTime] Cancelling request ${requestId}`);

        // Update request status in database
        const { data, error } = await supabase
          .from("pld_sdv_requests")
          .update({
            status: "cancelled",
          })
          .eq("id", requestId)
          .eq("member_id", member.id)
          .select("id")
          .single();

        if (error) throw error;

        // Invalidate cache and refresh data
        invalidateCache();
        refreshData(true);

        console.log("[MyTime] Cancel request successful:", data);
        return true;
      } catch (error) {
        console.error("[MyTime] Error cancelling request:", error);
        setError(
          error instanceof Error ? error.message : "Failed to cancel request",
        );
        return false;
      }
    },
    [member, user, invalidateCache, refreshData],
  );

  // Cancel a six-month request
  const cancelSixMonthRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      if (!member || !user) {
        console.error(
          "[MyTime] Cannot cancel six-month request without member and user data",
        );
        return false;
      }

      try {
        console.log(`[MyTime] Cancelling six-month request ${requestId}`);

        // Delete six-month request from database
        const { data, error } = await supabase
          .from("six_month_requests")
          .delete()
          .eq("id", requestId)
          .eq("member_id", member.id)
          .eq("processed", false); // Only allow cancellation if not processed

        if (error) throw error;

        // Invalidate cache and refresh data
        invalidateCache();
        refreshData(true);

        console.log("[MyTime] Cancel six-month request successful");
        return true;
      } catch (error) {
        console.error("[MyTime] Error cancelling six-month request:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Failed to cancel six-month request",
        );
        return false;
      }
    },
    [member, user, invalidateCache, refreshData],
  );

  // Expose all the necessary functions and state
  return {
    timeStats,
    vacationStats,
    timeOffRequests,
    vacationRequests,
    sixMonthRequests,
    isLoading,
    isRefreshing,
    error,
    isInitialized,
    syncStatus,
    // Functions
    refreshData,
    initialize,
    requestPaidInLieu,
    cancelRequest,
    cancelSixMonthRequest,
    invalidateCache,
  };
}

// ... keep existing utility functions ...

// Export the invalidateCache function at the module level
export function invalidateCache() {
  console.log("[MyTime] Module-level cache invalidation");
  statsCache.isValid = false;
  vacationStatsCache.isValid = false;
}

// Update the standalone initialize function to synchronize with the global initialization flag
export async function initialize(userId: string, force = false) {
  console.log(
    "[MyTime] Standalone initialize called for user:",
    userId,
    "force:",
    force,
    // "isGloballyInitialized:", // Remove check against removed flag
    // isGloballyInitialized,
  );

  try {
    if (!userId) {
      console.log("[MyTime] Standalone: Cannot initialize without user ID");
      return;
    }

    // Check if we already have a subscription for this user and not forcing
    if (
      globalRealtimeChannel.channel &&
      globalRealtimeChannel.userId === userId &&
      !force
    ) {
      console.log(
        "[MyTime] Standalone: Global channel already exists for this user, skipping setup.",
      );
      return { cleanup: globalRealtimeChannel.unsubscribe || (() => {}) };
    }

    // If forcing or channel is for a different user, clean up existing global channel
    if (globalRealtimeChannel.channel) {
      console.log(
        "[MyTime] Standalone: Cleaning up existing global channel before creating new one.",
      );
      if (globalRealtimeChannel.unsubscribe) {
        globalRealtimeChannel.unsubscribe();
      }
      // Clear global refs immediately after unsubscribe call
      globalRealtimeChannel.channel = null;
      globalRealtimeChannel.userId = null;
      globalRealtimeChannel.unsubscribe = null;
    }

    console.log("[MyTime] Standalone: Setting up global realtime channel.");
    // Setup channel logic (copied from hook's setupRealtimeChannel, simplified)
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("pin_number")
      .eq("id", userId)
      .single();

    if (memberError) {
      console.error(
        "[MyTime] Standalone: Error getting member PIN:",
        memberError,
      );
      // Continue without PIN if needed, channel setup might still work for PLD/SDV
    }
    const pin = memberData?.pin_number;

    const channel = supabase.channel(`mytime-updates-${userId}`);

    // Setup listeners (PLD/SDV, Allocation)
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_requests",
        filter: `member_id=eq.${userId}`,
      },
      (payload) => {
        invalidateCache();
      },
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "member_pld_sdv_allocations",
        filter: `member_id=eq.${userId}`,
      },
      (payload) => {
        invalidateCache();
      },
    );
    // Add vacation listener only if PIN exists
    if (pin) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vacation_requests",
          filter: `pin_number=eq.${pin}`,
        },
        (payload) => {
          invalidateCache();
        },
      );
    }

    channel.subscribe((status) => {
      console.log(
        `[MyTime Standalone] Subscription status for user ${userId}:`,
        status,
      );
    });

    // Store channel in global singleton
    globalRealtimeChannel.channel = channel;
    globalRealtimeChannel.userId = userId;

    // Create unsubscribe function
    const cleanupFn = () => {
      console.log("[MyTime] Standalone cleanup called for user:", userId);
      if (globalRealtimeChannel.channel === channel) {
        console.log("[MyTime] Standalone: Unsubscribing global channel.");
        channel.unsubscribe();
        globalRealtimeChannel.channel = null;
        globalRealtimeChannel.userId = null;
        globalRealtimeChannel.unsubscribe = null;
      }
      // No need to manage isGloballyInitialized flag here
    };
    globalRealtimeChannel.unsubscribe = cleanupFn;

    console.log("[MyTime] Standalone: Global channel setup complete.");
    // Optional: Pre-warm cache here if desired, but not strictly necessary
    // e.g., await fetchTimeStats(userId, true); // But be careful not to interfere with hook

    // No need to set isGloballyInitialized = true;

    return { cleanup: cleanupFn };
  } catch (error) {
    console.error("[MyTime] Error in standalone initialize:", error);
    // Ensure cleanup if error occurs mid-setup
    if (
      globalRealtimeChannel.channel && globalRealtimeChannel.userId === userId
    ) {
      if (globalRealtimeChannel.unsubscribe) {
        globalRealtimeChannel.unsubscribe();
      }
    }
    throw error; // Re-throw error
  }
}
