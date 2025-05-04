import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import {
    RealtimeChannel,
    RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { useUserStore } from "@/store/userStore"; // Import user store
// Import specific table types
type DbMembers = Database["public"]["Tables"]["members"]["Row"];
type DbPldSdvRequests = Database["public"]["Tables"]["pld_sdv_requests"]["Row"];
type DbVacationRequests =
    Database["public"]["Tables"]["vacation_requests"]["Row"];
type DbSixMonthRequests =
    Database["public"]["Tables"]["six_month_requests"]["Row"];

// ============================================================================
// Interfaces
// ============================================================================

export interface TimeStats {
    total: { pld: number; sdv: number };
    rolledOver: { pld: number; unusedPlds: number };
    available: { pld: number; sdv: number };
    requested: { pld: number; sdv: number };
    waitlisted: { pld: number; sdv: number };
    approved: { pld: number; sdv: number };
    paidInLieu: { pld: number; sdv: number };
    // syncStatus: SyncStatus; // Add later if needed based on complexity
}

export interface VacationStats {
    totalWeeks: number;
    splitWeeks: number;
    weeksToBid: number;
    approvedWeeks: number;
    remainingWeeks: number;
}

// Combined type for PLD/SDV and Six Month Requests for easier state management
export interface TimeOffRequest {
    id: string;
    member_id: string;
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
    waitlist_position?: number | null;
    paid_in_lieu?: boolean | null;
    is_six_month_request: boolean; // Flag to distinguish origin
    calendar_id?: string | null;
}

export interface UserVacationRequest {
    id: string;
    start_date: string;
    end_date: string;
    status: DbVacationRequests["status"]; // Use generated type
    requested_at: string | null;
}

interface TimeState {
    memberId: string | null;
    timeStats: TimeStats | null;
    vacationStats: VacationStats | null;
    timeOffRequests: TimeOffRequest[];
    vacationRequests: UserVacationRequest[];
    isLoading: boolean;
    isSubmittingAction: boolean; // Simplified for now
    isSubscribing: boolean;
    error: string | null;
    lastRefreshed: Date | null;
    channel: RealtimeChannel | null;
    isInitialized: boolean;
    refreshTimeoutId: NodeJS.Timeout | null; // Add state for debounce timeout
}

interface TimeActions {
    initialize: (memberId: string) => Promise<void>;
    cleanup: () => void;
    fetchTimeStats: (memberId: string) => Promise<TimeStats | null>;
    fetchVacationStats: (memberId: string) => Promise<VacationStats | null>;
    fetchTimeOffRequests: (memberId: string) => Promise<TimeOffRequest[]>;
    fetchVacationRequests: (memberId: string) => Promise<UserVacationRequest[]>;
    handleRealtimeUpdate: (
        payload: RealtimePostgresChangesPayload<any>,
        table: string,
    ) => void;
    requestPaidInLieu: (type: "PLD" | "SDV", date: string) => Promise<boolean>;
    cancelRequest: (requestId: string) => Promise<boolean>;
    cancelSixMonthRequest: (requestId: string) => Promise<boolean>;
    refreshAll: (memberId: string, force?: boolean) => Promise<void>;
    submitRequest: (
        leaveType: "PLD" | "SDV",
        date: string,
        isPaidInLieu?: boolean,
    ) => Promise<boolean>;
    submitSixMonthRequest: (
        leaveType: "PLD" | "SDV",
        date: string,
    ) => Promise<boolean>; // No PIL for 6mo
    clearError: () => void;
    setIsInitialized: (isInitialized: boolean) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

// Helper function for safe parsing
function safeParseInt(value: any, defaultValue = 0): number {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

export const useTimeStore = create<TimeState & TimeActions>((set, get) => ({
    // --- State ---
    memberId: null,
    timeStats: null,
    vacationStats: null,
    timeOffRequests: [],
    vacationRequests: [],
    isLoading: false,
    isSubmittingAction: false, // Simplified initial state
    isSubscribing: false,
    error: null,
    lastRefreshed: null,
    channel: null,
    isInitialized: false,
    refreshTimeoutId: null, // Initialize timeout ID

    // --- Actions ---

    setIsInitialized: (isInitialized) => set({ isInitialized }),

    initialize: async (memberId) => {
        console.log(`[TimeStore] Initializing for member: ${memberId}`);
        const existingChannel = get().channel;
        if (existingChannel) {
            console.log(
                "[TimeStore] Cleaning up existing channel before initializing",
            );
            existingChannel.unsubscribe();
        }

        set({ isLoading: true, error: null, memberId, channel: null });

        // Fetch initial data first
        await get().refreshAll(memberId, true);

        // Get member's PIN for vacation request filtering
        let memberPin: number | null = null;
        try {
            const { data: memberData, error: memberError } = await supabase
                .from("members")
                .select("pin_number")
                .eq("id", memberId)
                .single();
            if (memberError) throw memberError;
            memberPin = memberData?.pin_number ?? null;
            console.log(
                `[TimeStore] Fetched PIN for member ${memberId}: ${memberPin}`,
            );
        } catch (error) {
            console.error(
                `[TimeStore] Error fetching PIN for member ${memberId}:`,
                error,
            );
            // Proceed without PIN, vacation realtime might not work
        }

        // --- Realtime Setup ---
        console.log(
            `[TimeStore] Setting up realtime channel for member: ${memberId}`,
        );
        const realtimeChannel = supabase
            .channel(`mytime-updates-${memberId}`)
            // --- PLD/SDV Requests --- Correctly filtered by member_id
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "pld_sdv_requests",
                    filter: `member_id=eq.${memberId}`,
                },
                (payload) =>
                    get().handleRealtimeUpdate(payload, "pld_sdv_requests"),
            )
            // --- Six Month Requests --- Correctly filtered by member_id
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "six_month_requests",
                    filter: `member_id=eq.${memberId}`,
                },
                (payload) =>
                    get().handleRealtimeUpdate(payload, "six_month_requests"),
            )
            // --- Vacation Requests --- Filter by PIN if available
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "vacation_requests",
                    // Only add filter if PIN was successfully fetched
                    filter: memberPin
                        ? `pin_number=eq.${memberPin}`
                        : undefined,
                },
                (payload) =>
                    get().handleRealtimeUpdate(payload, "vacation_requests"),
            )
            // --- Allocations --- Watch the correct table
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "pld_sdv_allocations",
                    filter: `member_id=eq.${memberId}`,
                },
                (payload) =>
                    get().handleRealtimeUpdate(payload, "pld_sdv_allocations"),
            )
            // --- Member Info (Optional but useful for stats) --- Watch members table too
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "members",
                    filter: `id=eq.${memberId}`,
                },
                (payload) => get().handleRealtimeUpdate(payload, "members"),
            );

        realtimeChannel.subscribe((status, err) => {
            console.log(
                `[TimeStore] Realtime subscription status for ${memberId}:`,
                status,
            );
            set({ isSubscribing: status === "SUBSCRIBED" });
            if (status === "SUBSCRIPTION_ERROR" || err) {
                console.error("[TimeStore] Realtime subscription error:", err);
                set({
                    error: `Realtime connection failed: ${
                        err?.message ?? "Unknown error"
                    }`,
                });
            }
            if (status === "CLOSED") {
                set({ isSubscribing: false });
            }
        });

        set({ channel: realtimeChannel, isLoading: false });
    },

    cleanup: () => {
        console.log("[TimeStore] Cleanup action called!");
        // Clear any pending refresh on cleanup
        const existingTimeout = get().refreshTimeoutId;
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        const channel = get().channel;
        if (channel) {
            console.log("[TimeStore] Removing channel subscription");
            supabase.removeChannel(channel);
        }
        set({
            memberId: null,
            timeStats: null,
            vacationStats: null,
            timeOffRequests: [],
            vacationRequests: [],
            isLoading: false,
            isSubmittingAction: false,
            isSubscribing: false,
            error: null,
            lastRefreshed: null,
            channel: null,
            refreshTimeoutId: null, // Reset timeout ID on cleanup
            isInitialized: false,
        });
    },

    // --- Data Fetching Actions ---

    fetchTimeStats: async (memberId) => {
        console.log(`[TimeStore] Fetching time stats for member: ${memberId}`);
        try {
            const currentYear = new Date().getFullYear();

            // --- Step 1: Fetch Member Data & Max PLDs (RPC) ---
            const memberPromise = supabase
                .from("members")
                .select("id, sdv_entitlement, pld_rolled_over, max_plds") // Fetch max_plds directly if available
                .eq("id", memberId)
                .single();

            const maxPldsRpcPromise = supabase.rpc("update_member_max_plds", {
                p_member_id: memberId,
            });

            const [memberResult, maxPldsRpcResult] = await Promise.all([
                memberPromise,
                maxPldsRpcPromise,
            ]);

            if (memberResult.error) {
                throw new Error(
                    `Error fetching member data: ${memberResult.error.message}`,
                );
            }
            if (!memberResult.data) throw new Error("Member not found.");

            // Use RPC result as the source of truth for max PLDs
            if (maxPldsRpcResult.error) {
                throw new Error(
                    `Error fetching max PLDs: ${maxPldsRpcResult.error.message}`,
                );
            }
            const totalPlds = safeParseInt(maxPldsRpcResult.data, 0);

            const memberData = memberResult.data;
            const totalSdvs = safeParseInt(memberData.sdv_entitlement, 0);
            const rolledOverPlds = safeParseInt(memberData.pld_rolled_over, 0);

            console.log(
                `[TimeStore] Fetched base member stats: TotalPLD=${totalPlds}, TotalSDV=${totalSdvs}, RolledOver=${rolledOverPlds}`,
            );

            // --- Step 2: Fetch Current Year Requests ---
            const regularRequestsPromise = supabase
                .from("pld_sdv_requests")
                .select("id, leave_type, status, paid_in_lieu, is_rollover_pld")
                .eq("member_id", memberId)
                .gte("request_date", `${currentYear}-01-01`)
                .lte("request_date", `${currentYear}-12-31`);

            const sixMonthRequestsPromise = supabase
                .from("six_month_requests")
                .select("id, leave_type, processed")
                .eq("member_id", memberId)
                .gte("request_date", `${currentYear}-01-01`)
                .lte("request_date", `${currentYear}-12-31`);

            const [regularRequestsResult, sixMonthRequestsResult] =
                await Promise.all([
                    regularRequestsPromise,
                    sixMonthRequestsPromise,
                ]);

            if (regularRequestsResult.error) {
                throw new Error(
                    `Error fetching regular requests: ${regularRequestsResult.error.message}`,
                );
            }
            if (sixMonthRequestsResult.error) {
                throw new Error(
                    `Error fetching six-month requests: ${sixMonthRequestsResult.error.message}`,
                );
            }

            const regularRequests = regularRequestsResult.data || [];
            const sixMonthRequests = sixMonthRequestsResult.data || [];

            console.log(
                `[TimeStore] Fetched requests: Regular=${regularRequests.length}, SixMonth=${sixMonthRequests.length}`,
            );

            // --- Step 3: Calculate Stats ---
            let usedRolloverPlds = 0;
            let requested = { pld: 0, sdv: 0 };
            let waitlisted = { pld: 0, sdv: 0 };
            let approved = { pld: 0, sdv: 0 };
            let paidInLieu = { pld: 0, sdv: 0 };

            regularRequests.forEach((req) => {
                const type = req.leave_type === "PLD"
                    ? "pld"
                    : req.leave_type === "SDV"
                    ? "sdv"
                    : null;
                if (!type) return;

                if (req.paid_in_lieu) {
                    // Paid in Lieu requests count towards PIL totals regardless of status?
                    // Assuming only approved PIL count here, as per useMyTime logic
                    if (req.status === "approved") {
                        paidInLieu[type]++;
                    } else if (req.status === "pending") {
                        // Pending PIL might count as requested? Check logic. For now, count approved.
                    }
                } else {
                    switch (req.status) {
                        case "pending":
                        case "cancellation_pending": // Count cancellation pending as requested for available calc
                            requested[type]++;
                            break;
                        case "waitlisted":
                            waitlisted[type]++;
                            break;
                        case "approved":
                            approved[type]++;
                            // Count used rollover PLDs
                            if (type === "pld" && req.is_rollover_pld) {
                                usedRolloverPlds++;
                            }
                            break;
                            // 'denied' and 'cancelled' are ignored
                    }
                }
            });

            sixMonthRequests.forEach((req) => {
                const type = req.leave_type === "PLD"
                    ? "pld"
                    : req.leave_type === "SDV"
                    ? "sdv"
                    : null;
                if (!type) return;
                // Unprocessed six-month requests count as requested
                if (!req.processed) {
                    requested[type]++;
                }
            });

            const unusedPlds = Math.max(0, rolledOverPlds - usedRolloverPlds);
            // Available = Total + RolledOver - (Approved + Requested + Waitlisted + Approved PIL)
            const availablePlds = Math.max(
                0,
                totalPlds + rolledOverPlds -
                    (approved.pld + requested.pld + waitlisted.pld +
                        paidInLieu.pld),
            );
            const availableSdvs = Math.max(
                0,
                totalSdvs -
                    (approved.sdv + requested.sdv + waitlisted.sdv +
                        paidInLieu.sdv),
            );

            const finalStats: TimeStats = {
                total: { pld: totalPlds, sdv: totalSdvs },
                rolledOver: { pld: rolledOverPlds, unusedPlds: unusedPlds },
                available: { pld: availablePlds, sdv: availableSdvs },
                requested: requested,
                waitlisted: waitlisted,
                approved: approved,
                paidInLieu: paidInLieu,
            };

            console.log("[TimeStore] Calculated final stats:", finalStats);
            set({ timeStats: finalStats });
            return finalStats;
        } catch (error) {
            console.error("[TimeStore] Error fetching time stats:", error);
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch time stats",
            });
            return null;
        }
    },

    fetchVacationStats: async (memberId) => {
        console.log(
            `[TimeStore] Fetching vacation stats for member: ${memberId}`,
        );
        try {
            // --- Step 1: Fetch Member Vacation Data ---
            const { data: memberData, error: memberError } = await supabase
                .from("members")
                .select(
                    "id, curr_vacation_weeks, curr_vacation_split, pin_number",
                )
                .eq("id", memberId)
                .single();

            if (memberError) {
                throw new Error(
                    `Error fetching member vacation data: ${memberError.message}`,
                );
            }
            if (!memberData) throw new Error("Member not found.");

            const totalWeeks = safeParseInt(memberData.curr_vacation_weeks, 0);
            const splitWeeks = safeParseInt(memberData.curr_vacation_split, 0);
            const pin = memberData.pin_number; // pin_number is bigint, no need to parse

            console.log(
                `[TimeStore] Fetched member vacation info: TotalWeeks=${totalWeeks}, SplitWeeks=${splitWeeks}, PIN=${pin}`,
            );

            // If member has no PIN, they can't have vacation requests
            if (pin === null) {
                console.log(
                    "[TimeStore] Member has no PIN, returning zero vacation stats.",
                );
                const zeroStats: VacationStats = {
                    totalWeeks,
                    splitWeeks,
                    weeksToBid: totalWeeks - splitWeeks,
                    approvedWeeks: 0,
                    remainingWeeks: totalWeeks - splitWeeks, // Initially, remaining = weeks to bid
                };
                set({ vacationStats: zeroStats });
                return zeroStats;
            }

            // --- Step 2: Fetch Approved Vacation Requests ---
            const currentYear = new Date().getFullYear();
            const { data: approvedRequests, error: requestsError } =
                await supabase
                    .from("vacation_requests")
                    .select("id") // Only need count
                    .eq("pin_number", pin)
                    .eq("status", "approved")
                    .gte("start_date", `${currentYear}-01-01`)
                    .lte("start_date", `${currentYear}-12-31`); // Filter by start_date within current year

            if (requestsError) {
                throw new Error(
                    `Error fetching approved vacation requests: ${requestsError.message}`,
                );
            }

            const approvedWeeksCount = approvedRequests?.length || 0;

            console.log(
                `[TimeStore] Fetched approved vacation requests count: ${approvedWeeksCount}`,
            );

            // --- Step 3: Calculate Stats ---
            const weeksToBid = totalWeeks - splitWeeks;
            const remainingWeeks = Math.max(0, weeksToBid - approvedWeeksCount);

            const finalStats: VacationStats = {
                totalWeeks,
                splitWeeks,
                weeksToBid,
                approvedWeeks: approvedWeeksCount,
                remainingWeeks,
            };

            console.log(
                "[TimeStore] Calculated final vacation stats:",
                finalStats,
            );
            set({ vacationStats: finalStats });
            return finalStats;
        } catch (error) {
            console.error("[TimeStore] Error fetching vacation stats:", error);
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch vacation stats",
            });
            // Return null or a default state on error?
            // Let's return null for now to indicate failure
            set({ vacationStats: null });
            return null;
        }
    },

    fetchTimeOffRequests: async (memberId) => {
        console.log(
            `[TimeStore] Fetching time off requests for member: ${memberId}`,
        );
        try {
            const currentYear = new Date().getFullYear();
            const startDate = `${currentYear}-01-01`;
            const endDate = `${currentYear}-12-31`;

            // --- Step 1: Fetch Regular & Six Month Requests Concurrently ---
            const regularRequestsPromise = supabase
                .from("pld_sdv_requests")
                .select(
                    "id, member_id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, calendar_id",
                )
                .eq("member_id", memberId)
                .gte("request_date", startDate)
                .lte("request_date", endDate)
                .not("status", "in", '("cancelled","denied")'); // Exclude cancelled/denied

            const sixMonthRequestsPromise = supabase
                .from("six_month_requests")
                .select(
                    "id, member_id, request_date, leave_type, requested_at, processed, calendar_id",
                )
                .eq("member_id", memberId)
                .gte("request_date", startDate)
                .lte("request_date", endDate);
            // No status filter needed here, unprocessed are considered pending

            const [regularResult, sixMonthResult] = await Promise.all([
                regularRequestsPromise,
                sixMonthRequestsPromise,
            ]);

            if (regularResult.error) {
                throw new Error(
                    `Error fetching regular requests: ${regularResult.error.message}`,
                );
            }
            if (sixMonthResult.error) {
                throw new Error(
                    `Error fetching six-month requests: ${sixMonthResult.error.message}`,
                );
            }

            const regularRequests = regularResult.data || [];
            const sixMonthRequests = sixMonthResult.data || [];

            console.log(
                `[TimeStore] Fetched raw requests: Regular=${regularRequests.length}, SixMonth=${sixMonthRequests.length}`,
            );

            // --- Step 2: Combine and Transform Requests ---
            const combinedRequests: TimeOffRequest[] = [];

            // Process regular requests
            regularRequests.forEach((req) => {
                combinedRequests.push({
                    id: req.id,
                    member_id: req.member_id,
                    request_date: req.request_date,
                    leave_type: req.leave_type as "PLD" | "SDV",
                    status: req.status as TimeOffRequest["status"], // Cast to the store's status type
                    requested_at: req.requested_at,
                    waitlist_position: req.waitlist_position,
                    paid_in_lieu: req.paid_in_lieu,
                    is_six_month_request: false, // Mark as not a six-month origin
                    calendar_id: req.calendar_id,
                });
            });

            // Process six-month requests (only include unprocessed ones)
            sixMonthRequests.forEach((req) => {
                if (!req.processed) { // Only add if not yet processed
                    combinedRequests.push({
                        id: req.id,
                        member_id: req.member_id,
                        request_date: req.request_date,
                        leave_type: req.leave_type as "PLD" | "SDV", // Assuming text maps correctly
                        status: "pending", // Treat unprocessed six-month as pending in the combined list
                        requested_at: req.requested_at,
                        waitlist_position: null, // Six month requests don't have waitlist pos initially
                        paid_in_lieu: false, // Six month requests cannot be PIL
                        is_six_month_request: true, // Mark as six-month origin
                        calendar_id: req.calendar_id,
                    });
                }
            });

            // --- Step 3: Sort and Set State ---
            combinedRequests.sort((a, b) =>
                new Date(a.request_date).getTime() -
                new Date(b.request_date).getTime()
            );

            console.log(
                `[TimeStore] Combined and processed requests count: ${combinedRequests.length}`,
            );
            set({ timeOffRequests: combinedRequests });
            return combinedRequests;
        } catch (error) {
            console.error(
                "[TimeStore] Error fetching time off requests:",
                error,
            );
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch time off requests",
            });
            set({ timeOffRequests: [] }); // Set empty on error
            return [];
        }
    },

    fetchVacationRequests: async (memberId) => {
        console.log(
            `[TimeStore] Fetching vacation requests for member: ${memberId}`,
        );
        try {
            // --- Step 1: Get Member PIN ---
            const { data: memberData, error: memberError } = await supabase
                .from("members")
                .select("pin_number")
                .eq("id", memberId)
                .single();

            if (memberError) {
                throw new Error(
                    `Error fetching member PIN: ${memberError.message}`,
                );
            }

            const pin = memberData?.pin_number;

            // If no PIN, return empty array
            if (pin === null || pin === undefined) {
                console.log(
                    "[TimeStore] Member has no PIN, skipping vacation request fetch.",
                );
                set({ vacationRequests: [] });
                return [];
            }

            console.log(
                `[TimeStore] Using PIN ${pin} to fetch vacation requests.`,
            );

            // --- Step 2: Fetch Vacation Requests By PIN ---
            const currentYear = new Date().getFullYear();
            const { data: requestsData, error: requestsError } = await supabase
                .from("vacation_requests")
                .select("id, start_date, end_date, status, requested_at")
                .eq("pin_number", pin)
                .gte("start_date", `${currentYear}-01-01`)
                .lte("start_date", `${currentYear}-12-31`)
                .order("start_date", { ascending: true });

            if (requestsError) {
                throw new Error(
                    `Error fetching vacation requests: ${requestsError.message}`,
                );
            }

            // --- Step 3: Format and Set State ---
            const formattedRequests = (requestsData || []).map((req) => ({
                id: req.id,
                start_date: req.start_date,
                end_date: req.end_date,
                status: req.status as UserVacationRequest["status"], // Cast to specific status type
                requested_at: req.requested_at ?? new Date(0).toISOString(), // Provide default for null
            }));

            console.log(
                `[TimeStore] Fetched vacation requests count: ${formattedRequests.length}`,
            );
            set({ vacationRequests: formattedRequests });
            return formattedRequests;
        } catch (error) {
            console.error(
                "[TimeStore] Error fetching vacation requests:",
                error,
            );
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch vacation requests",
            });
            set({ vacationRequests: [] }); // Set empty on error
            return [];
        }
    },

    // --- Update Actions ---

    requestPaidInLieu: async (type, date) => {
        console.log(`[TimeStore] Requesting Paid in Lieu: ${type} on ${date}`);
        set({ isSubmittingAction: true });
        try {
            const success = await get().submitRequest(type, date, true);
            set({ isSubmittingAction: false });
            return success;
        } catch (error) {
            console.error("[TimeStore] Error requesting paid in lieu:", error);
            set({
                isSubmittingAction: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to request PIL",
            });
            return false;
        }
    },

    cancelRequest: async (requestId) => {
        console.log(`[TimeStore] Cancelling request: ${requestId}`);
        const memberId = get().memberId;
        if (!memberId) {
            const errorMsg = "Cannot cancel request, user not found";
            console.error(`[TimeStore] ${errorMsg}`);
            set({ error: errorMsg });
            return false;
        }

        set({ isSubmittingAction: true, error: null });

        try {
            // Call the verified database function
            const { data, error } = await supabase.rpc("cancel_leave_request", {
                p_request_id: requestId,
                p_member_id: memberId,
            });

            if (error) throw error;

            // The function returns true on success (status changed), false otherwise
            if (data === true) {
                console.log(
                    `[TimeStore] Cancellation successful/initiated for request ${requestId}`,
                );
                set({ isSubmittingAction: false });
                // Refresh data after cancellation/status change
                // The realtime listener should eventually catch this, but a manual refresh ensures quicker UI update
                await get().refreshAll(memberId);
                return true;
            } else {
                // This could happen if the request wasn't found, didn't belong to the user,
                // or was already cancelled/denied.
                console.warn(
                    `[TimeStore] cancel_leave_request returned false for request ${requestId}. Might already be cancelled/denied or not found.`,
                );
                set({
                    isSubmittingAction: false,
                    error:
                        "Could not cancel request. It might already be processed or not exist.",
                });
                // Refresh anyway to ensure UI consistency
                await get().refreshAll(memberId);
                return false;
            }
        } catch (error) {
            console.error(
                "[TimeStore] Error calling cancel_leave_request RPC:",
                error,
            );
            set({
                isSubmittingAction: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to cancel request",
            });
            // Optionally refresh even on error
            await get().refreshAll(memberId);
            return false;
        }
    },

    cancelSixMonthRequest: async (requestId) => {
        console.log(`[TimeStore] Cancelling six-month request: ${requestId}`);
        set({ isSubmittingAction: true });
        const memberId = get().memberId;
        if (!memberId) {
            set({
                isSubmittingAction: false,
                error: "Cannot cancel, user not found",
            });
            return false;
        }
        try {
            const { error } = await supabase
                .from("six_month_requests")
                .delete()
                .eq("id", requestId)
                .eq("member_id", memberId)
                .eq("processed", false); // Only allow cancellation if not processed

            if (error) throw error;

            set({ isSubmittingAction: false });
            console.log("[TimeStore] Cancel six-month request successful");
            // Refresh data after cancellation
            await get().refreshAll(memberId);
            return true;
        } catch (error) {
            console.error(
                "[TimeStore] Error cancelling six-month request:",
                error,
            );
            set({
                isSubmittingAction: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to cancel six-month request",
            });
            return false;
        }
    },

    refreshAll: async (memberId, force = false) => {
        // TODO: Add cooldown logic if needed
        console.log(
            `[TimeStore] Refreshing all data for member ${memberId}, force: ${force}`,
        );
        set({ isLoading: true, error: null });
        try {
            await Promise.all([
                get().fetchTimeStats(memberId),
                get().fetchVacationStats(memberId),
                get().fetchTimeOffRequests(memberId),
                get().fetchVacationRequests(memberId),
            ]);
            set({ lastRefreshed: new Date() });
        } catch (error) {
            console.error("[TimeStore] Error during refreshAll:", error);
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to refresh data",
            });
        } finally {
            set({ isLoading: false });
        }
    },

    submitRequest: async (leaveType, date, isPaidInLieu = false) => {
        console.log(
            `[TimeStore] Submitting request: ${leaveType} on ${date}, PIL: ${isPaidInLieu}`,
        );
        const memberId = get().memberId;
        const member = useUserStore.getState().member; // Get full member details for calendar_id
        if (!memberId || !member?.calendar_id) {
            const errorMsg =
                "Cannot submit request, user or calendar not found";
            console.error(`[TimeStore] ${errorMsg}`);
            set({ error: errorMsg });
            return false;
        }
        set({ isSubmittingAction: true, error: null });

        try {
            const { data, error } = await supabase
                .from("pld_sdv_requests")
                .insert({
                    member_id: memberId,
                    calendar_id: member.calendar_id,
                    request_date: date,
                    leave_type: leaveType,
                    status: "pending", // Initial status
                    paid_in_lieu: isPaidInLieu,
                })
                .select() // Select the inserted row to confirm
                .single();

            if (error) throw error;

            console.log("[TimeStore] Request submitted successfully:", data);
            set({ isSubmittingAction: false });
            // Refresh data after submission
            await get().refreshAll(memberId);
            return true;
        } catch (error) {
            console.error("[TimeStore] Error submitting request:", error);
            set({
                isSubmittingAction: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to submit request",
            });
            return false;
        }
    },

    submitSixMonthRequest: async (leaveType, date) => {
        console.log(
            `[TimeStore] Submitting six-month request: ${leaveType} on ${date}`,
        );
        const memberId = get().memberId;
        const member = useUserStore.getState().member; // Get full member details for calendar_id
        if (!memberId || !member?.calendar_id) {
            const errorMsg =
                "Cannot submit six-month request, user or calendar not found";
            console.error(`[TimeStore] ${errorMsg}`);
            set({ error: errorMsg });
            return false;
        }
        set({ isSubmittingAction: true, error: null });
        try {
            const { data, error } = await supabase
                .from("six_month_requests")
                .insert({
                    member_id: memberId,
                    calendar_id: member.calendar_id,
                    request_date: date,
                    leave_type: leaveType,
                })
                .select()
                .single();

            if (error) throw error;

            console.log(
                "[TimeStore] Six-month request submitted successfully:",
                data,
            );
            set({ isSubmittingAction: false });
            // Refresh data after submission
            await get().refreshAll(memberId);
            return true;
        } catch (error) {
            console.error(
                "[TimeStore] Error submitting six-month request:",
                error,
            );
            set({
                isSubmittingAction: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to submit six-month request",
            });
            return false;
        }
    },

    clearError: () => set({ error: null }),

    // --- Realtime Handling ---

    handleRealtimeUpdate: (payload, table) => {
        console.log(
            `[TimeStore] Realtime update received for table ${table}:`,
            payload,
        );
        const memberId = get().memberId;
        if (!memberId) return;

        // --- Debounce Refresh Logic --- >
        const existingTimeout = get().refreshTimeoutId;
        if (existingTimeout) {
            clearTimeout(existingTimeout); // Clear previous timeout if exists
        }

        const newTimeoutId = setTimeout(() => {
            console.log(
                `[TimeStore] Debounced refresh triggered by ${table} update.`,
            );
            get().refreshAll(memberId);
            set({ refreshTimeoutId: null }); // Clear timeout ID after execution
        }, 500); // 500ms debounce delay

        set({ refreshTimeoutId: newTimeoutId }); // Store the new timeout ID
        // <<< --- End Debounce Refresh Logic --- <<<

        // TODO: Implement more granular updates based on payload and table
        // - pld_sdv_requests change -> refreshTimeOffRequests, refreshTimeStats
        // - six_month_requests change -> refreshTimeOffRequests, refreshTimeStats
        // - vacation_requests change -> refreshVacationRequests, refreshVacationStats
        // - pld_sdv_allocations change -> refreshTimeStats (? or specific recalculation)
        // - members change -> refreshTimeStats, refreshVacationStats

        // For now, just trigger a full refresh, potentially debounced
        // Consider adding debounce logic here
        console.log(
            `[TimeStore] Triggering refreshAll due to ${table} update.`,
        );
        get().refreshAll(memberId);
    },
}));
