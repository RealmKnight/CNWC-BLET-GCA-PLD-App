import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { createRealtimeChannel } from "@/utils/realtime";
import {
    RealtimeChannel,
    RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { Database } from "@/types/supabase";
import { useUserStore } from "@/store/userStore"; // Import user store
// Remove circular import - replaced with event-based communication
// import { useCalendarStore } from "@/store/calendarStore";
// Import store event manager for inter-store communication
import {
    createStoreEventCleanup,
    emitRequestCancelled,
    emitRequestSubmitted,
    emitTimeDataUpdate,
    type StoreEventData,
    storeEventManager,
    StoreEventType,
} from "@/utils/storeManager";
import { createRealtimeCallback } from "@/utils/realtimeErrorHandler";
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
    member_id: string | null;
    pin_number?: number | null;
    request_date: string;
    leave_type: "PLD" | "SDV";
    status:
        | "pending"
        | "approved"
        | "denied"
        | "waitlisted"
        | "cancellation_pending"
        | "cancelled"
        | "transferred";
    requested_at: string;
    waitlist_position?: number | null;
    paid_in_lieu: boolean | null; // Change from optional to required with null
    is_six_month_request: boolean; // Flag to distinguish origin
    calendar_id?: string | null;
    import_source?: string | null;
    imported_at?: string | null;
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
    storeEventCleanup: (() => void) | null; // Cleanup function for store event listeners
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
    triggerPldSdvRefresh: () => Promise<void>;
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
    storeEventCleanup: null, // Initialize store event cleanup

    // --- Actions ---

    setIsInitialized: (isInitialized) => set({ isInitialized }),

    initialize: async (memberId) => {
        console.log(
            `[TimeStore] Initializing for member: ${memberId}. Subscribing to channel: mytime-updates-${memberId} and filter member_id=eq.${memberId}`,
        );
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
            // console.log(
            //     `[TimeStore] Fetched PIN for member ${memberId}: ${memberPin}`,
            // );
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
        const channelName = `mytime-updates-${memberId}`;
        const realtimeChannel = await createRealtimeChannel(channelName);

        // --- PLD/SDV Requests --- Correctly filtered by member_id
        realtimeChannel
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "pld_sdv_requests",
                    // filter: `member_id=eq.${memberId}`, // <-- Temporarily commented out
                },
                (payload: RealtimePostgresChangesPayload<DbPldSdvRequests>) => {
                    console.log(
                        "[TimeStore] >>> pld_sdv_requests REALTIME (NO FILTER) CALLBACK FIRED <<< Payload:",
                        payload,
                    );

                    const newRecord = payload.new as DbPldSdvRequests;
                    const oldRecord = payload.old as Partial<DbPldSdvRequests>;

                    if (payload.eventType === "UPDATE") {
                        console.log(
                            `[TimeStore DIAGNOSTIC] EventType is UPDATE. Store memberId: ${get().memberId}, Payload member_id: ${newRecord?.member_id}`,
                        );
                        // Unconditionally call handleRealtimeUpdate for UPDATE to see if it then works or logs [TimeStore RT]
                        get().handleRealtimeUpdate(payload, "pld_sdv_requests");
                    } else if (payload.eventType === "INSERT") {
                        if (
                            newRecord && newRecord.member_id === get().memberId
                        ) {
                            get().handleRealtimeUpdate(
                                payload,
                                "pld_sdv_requests",
                            );
                        } else {
                            console.log(
                                `[TimeStore] pld_sdv_requests (NO FILTER) INSERT for different/no member_id (${newRecord?.member_id}), ignoring.`,
                            );
                        }
                    } else if (payload.eventType === "DELETE") {
                        if (
                            oldRecord && oldRecord.member_id === get().memberId
                        ) {
                            get().handleRealtimeUpdate(
                                payload,
                                "pld_sdv_requests",
                            );
                        } else {
                            console.log(
                                `[TimeStore] pld_sdv_requests (NO FILTER) DELETE for different/no member_id (${oldRecord?.member_id}), ignoring.`,
                            );
                        }
                    } else {
                        console.log(
                            "[TimeStore] pld_sdv_requests (NO FILTER) other event type ('${payload.eventType}'), passing to handler:",
                            payload,
                        );
                        get().handleRealtimeUpdate(payload, "pld_sdv_requests");
                    }
                },
            );

        // --- Six Month Requests --- Correctly filtered by member_id
        realtimeChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "six_month_requests",
                filter: `member_id=eq.${memberId}`,
            },
            (payload) =>
                get().handleRealtimeUpdate(payload, "six_month_requests"),
        );

        // --- Vacation Requests --- Filter by PIN if available
        realtimeChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "vacation_requests",
                // Only add filter if PIN was successfully fetched
                filter: memberPin ? `pin_number=eq.${memberPin}` : undefined,
            },
            (payload) =>
                get().handleRealtimeUpdate(payload, "vacation_requests"),
        );

        // --- Allocations --- Watch the correct table
        realtimeChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "pld_sdv_allocations",
                filter: `member_id=eq.${memberId}`,
            },
            (payload) =>
                get().handleRealtimeUpdate(payload, "pld_sdv_allocations"),
        );

        // --- Member Info (Optional but useful for stats) --- Watch members table too
        realtimeChannel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "members",
                filter: `id=eq.${memberId}`,
            },
            (payload) => get().handleRealtimeUpdate(payload, "members"),
        );

        realtimeChannel.subscribe(createRealtimeCallback(
            "TimeStore",
            // onError callback
            (status, err) => {
                console.error("[TimeStore] Realtime subscription error:", err);
                set({
                    error: `Realtime connection failed: ${
                        err?.message ?? "Unknown error"
                    }`,
                });
            },
            // onSuccess callback
            (status) => {
                console.log(
                    `[TimeStore] Realtime subscription status for ${memberId}:`,
                    status,
                );
                set({ isSubscribing: status === "SUBSCRIBED" });
                if (status === "CLOSED") {
                    set({ isSubscribing: false });
                }
            },
        ));

        set({ channel: realtimeChannel, isLoading: false });

        // --- Setup Store Event Listeners ---
        console.log(
            "[TimeStore] Setting up store event listeners for calendar events",
        );

        const handleCalendarRequestsUpdated = (
            eventData: StoreEventData,
        ) => {
            const { payload } = eventData;
            if (payload.shouldRefreshTimeStore && get().memberId) {
                console.log(
                    "[TimeStore] Received CALENDAR_REQUESTS_UPDATED event, triggering refresh",
                );
                get().triggerPldSdvRefresh().catch((error) => {
                    console.error(
                        "[TimeStore] Error handling calendar requests update:",
                        error,
                    );
                });
            }
        };

        const handleSixMonthRequestsUpdated = (
            eventData: StoreEventData,
        ) => {
            const { payload } = eventData;
            if (payload.shouldRefreshTimeStore && get().memberId) {
                console.log(
                    "[TimeStore] Received SIX_MONTH_REQUESTS_UPDATED event, triggering refresh",
                );
                get().triggerPldSdvRefresh().catch((error) => {
                    console.error(
                        "[TimeStore] Error handling six-month requests update:",
                        error,
                    );
                });
            }
        };

        // Add event listeners
        storeEventManager.addStoreEventListener(
            StoreEventType.CALENDAR_REQUESTS_UPDATED,
            handleCalendarRequestsUpdated,
        );

        storeEventManager.addStoreEventListener(
            StoreEventType.SIX_MONTH_REQUESTS_UPDATED,
            handleSixMonthRequestsUpdated,
        );

        // Create cleanup function
        const eventCleanup = createStoreEventCleanup([
            {
                eventType: StoreEventType.CALENDAR_REQUESTS_UPDATED,
                listener: handleCalendarRequestsUpdated,
            },
            {
                eventType: StoreEventType.SIX_MONTH_REQUESTS_UPDATED,
                listener: handleSixMonthRequestsUpdated,
            },
        ]);

        set({ storeEventCleanup: eventCleanup });
        console.log("[TimeStore] Store event listeners setup complete");
    },

    cleanup: () => {
        console.log("[TimeStore] Cleanup action called!");
        // Clear any pending refresh on cleanup
        const existingTimeout = get().refreshTimeoutId;
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Clean up store event listeners
        const storeEventCleanup = get().storeEventCleanup;
        if (storeEventCleanup) {
            console.log("[TimeStore] Cleaning up store event listeners");
            storeEventCleanup();
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
            storeEventCleanup: null, // Reset store event cleanup
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

            // console.log(
            //     `[TimeStore] Fetched base member stats: TotalPLD=${totalPlds}, TotalSDV=${totalSdvs}, RolledOver=${rolledOverPlds}`,
            // );

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

                if (req.paid_in_lieu === true) { // Explicitly check for true
                    // Count approved and pending PIL requests
                    if (req.status === "approved" || req.status === "pending") {
                        paidInLieu[type]++;
                        // console.log(`[TimeStore] Counting PIL request:`, {
                        //     id: req.id,
                        //     type,
                        //     status: req.status,
                        //     isPIL: req.paid_in_lieu,
                        // });
                    }
                } else {
                    switch (req.status) {
                        case "pending":
                        case "cancellation_pending":
                            requested[type]++;
                            break;
                        case "waitlisted":
                            waitlisted[type]++;
                            break;
                        case "approved":
                        case "transferred":
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
            // Available = Total + RolledOver - (Approved + Requested + Waitlisted + Transferred + Approved PIL)
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

            // Get member PIN for additional queries
            const { data: memberData, error: memberError } = await supabase
                .from("members")
                .select("pin_number")
                .eq("id", memberId)
                .single();

            if (memberError && memberError.code !== "PGRST116") {
                console.error(
                    "[TimeStore] Error fetching member PIN:",
                    memberError,
                );
            }

            const memberPin = memberData?.pin_number;
            console.log(
                `[TimeStore] Using member PIN ${memberPin} for additional queries`,
            );

            // --- Step 1: Fetch Regular, PIN-based, & Six Month Requests Concurrently ---
            const regularRequestsPromise = supabase
                .from("pld_sdv_requests")
                .select(
                    "id, member_id, pin_number, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, calendar_id, import_source, imported_at",
                )
                .eq("member_id", memberId)
                .gte("request_date", startDate)
                .lte("request_date", endDate)
                .not("status", "in", '("cancelled","denied")'); // Exclude cancelled/denied

            // Only fetch by PIN if we have a valid PIN
            const pinRequestsPromise = memberPin
                ? supabase
                    .from("pld_sdv_requests")
                    .select(
                        "id, member_id, pin_number, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, calendar_id, import_source, imported_at",
                    )
                    .eq("pin_number", memberPin)
                    .is("member_id", null) // Only get requests without member_id
                    .gte("request_date", startDate)
                    .lte("request_date", endDate)
                    .not("status", "in", '("cancelled","denied")')
                : Promise.resolve({ data: [], error: null });

            const sixMonthRequestsPromise = supabase
                .from("six_month_requests")
                .select(
                    "id, member_id, request_date, leave_type, requested_at, processed, calendar_id",
                )
                .eq("member_id", memberId)
                .gte("request_date", startDate)
                .lte("request_date", endDate);
            // No status filter needed here, unprocessed are considered pending

            const [regularResult, pinResult, sixMonthResult] = await Promise
                .all([
                    regularRequestsPromise,
                    pinRequestsPromise,
                    sixMonthRequestsPromise,
                ]);

            if (regularResult.error) {
                throw new Error(
                    `Error fetching regular requests: ${regularResult.error.message}`,
                );
            }
            if (pinResult.error) {
                throw new Error(
                    `Error fetching PIN-based requests: ${pinResult.error.message}`,
                );
            }
            if (sixMonthResult.error) {
                throw new Error(
                    `Error fetching six-month requests: ${sixMonthResult.error.message}`,
                );
            }

            const regularRequests = regularResult.data || [];
            const pinRequests = pinResult.data || [];
            const sixMonthRequests = sixMonthResult.data || [];

            console.log(
                `[TimeStore] Fetched raw requests: Regular=${regularRequests.length}, PIN-based=${pinRequests.length}, SixMonth=${sixMonthRequests.length}`,
            );

            // --- Step 2: Combine and Transform Requests ---
            const combinedRequests: TimeOffRequest[] = [];

            // Process regular requests
            regularRequests.forEach((req) => {
                combinedRequests.push({
                    id: req.id,
                    member_id: req.member_id,
                    pin_number: req.pin_number || null,
                    request_date: req.request_date,
                    leave_type: req.leave_type as "PLD" | "SDV",
                    status: req.status as TimeOffRequest["status"], // Cast to the store's status type
                    requested_at: req.requested_at,
                    waitlist_position: req.waitlist_position,
                    paid_in_lieu: req.paid_in_lieu,
                    is_six_month_request: false, // Mark as not a six-month origin
                    calendar_id: req.calendar_id,
                    import_source: req.import_source || null,
                    imported_at: req.imported_at || null,
                });
            });

            // Process PIN-based requests (requests with pin_number but no member_id)
            pinRequests.forEach((req) => {
                combinedRequests.push({
                    id: req.id,
                    member_id: null,
                    pin_number: req.pin_number,
                    request_date: req.request_date,
                    leave_type: req.leave_type as "PLD" | "SDV",
                    status: req.status as TimeOffRequest["status"],
                    requested_at: req.requested_at,
                    waitlist_position: req.waitlist_position,
                    paid_in_lieu: req.paid_in_lieu,
                    is_six_month_request: false,
                    calendar_id: req.calendar_id,
                    import_source: req.import_source || null,
                    imported_at: req.imported_at || null,
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
            // Call the verified database function with schema name
            const { data, error } = await supabase.schema("public").rpc(
                "cancel_leave_request",
                {
                    p_request_id: requestId,
                    p_member_id: memberId,
                },
            );

            if (error) throw error;

            // The function returns true on success (status changed), false otherwise
            if (data === true) {
                console.log(
                    `[TimeStore] Cancellation successful/initiated for request ${requestId}`,
                );

                // Send email notification for the cancellation
                try {
                    console.log(
                        "[TimeStore] Sending cancellation email notification...",
                    );
                    const { error: emailError } = await supabase.functions
                        .invoke(
                            "send-cancellation-email",
                            {
                                body: {
                                    requestId: requestId,
                                },
                            },
                        );

                    if (emailError) {
                        console.error(
                            "[TimeStore] Cancellation email notification failed:",
                            emailError,
                        );
                        // Don't fail the cancellation if email fails - the cancellation was successful
                    } else {
                        console.log(
                            "[TimeStore] Cancellation email notification sent successfully",
                        );
                    }
                } catch (emailError) {
                    console.error(
                        "[TimeStore] Error sending cancellation email notification:",
                        emailError,
                    );
                    // Continue - cancellation was successful even if email failed
                }

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
            // First, get the request date for debugging
            const { data: requestData, error: fetchError } = await supabase
                .schema("public")
                .from("six_month_requests")
                .select("id, request_date")
                .eq("id", requestId)
                .eq("member_id", memberId)
                .single();

            if (fetchError) {
                console.error(
                    `[TimeStore] Error fetching six-month request before deletion:`,
                    fetchError,
                );
            } else {
                console.log(
                    `[TimeStore] Found six-month request to cancel:`,
                    requestData,
                );
            }

            // Execute the delete operation
            const { data, error } = await supabase
                .schema("public")
                .from("six_month_requests")
                .delete()
                .eq("id", requestId)
                .eq("member_id", memberId)
                .eq("processed", false); // Only allow cancellation if not processed

            if (error) throw error;

            console.log("[TimeStore] Six-month request deletion result:", data);
            set({ isSubmittingAction: false });
            console.log("[TimeStore] Cancel six-month request successful");

            // Refresh data after cancellation
            await get().refreshAll(memberId);

            // Update the sixMonthRequestDays in calendarStore if available
            try {
                if (requestData?.request_date) {
                    console.log(
                        `[TimeStore] Emitting SIX_MONTH_REQUESTS_UPDATED event for date ${requestData.request_date}`,
                    );

                    // Replace direct calendarStore call with event emission
                    storeEventManager.emitEvent(
                        StoreEventType.SIX_MONTH_REQUESTS_UPDATED,
                        {
                            source: "timeStore",
                            payload: {
                                requestDate: requestData.request_date,
                                memberId: memberId,
                                updateType: "single_item",
                                shouldRefreshCalendarStore: true,
                                triggerSource: "user_action",
                                isSixMonthRequest: true,
                                realtimeEventType: "DELETE",
                            },
                        },
                    );

                    console.log(
                        "[TimeStore] Emitted SIX_MONTH_REQUESTS_UPDATED event for CalendarStore",
                    );
                }
            } catch (calendarError) {
                console.error(
                    "[TimeStore] Error emitting calendarStore update event:",
                    calendarError,
                );
            }

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
            // Try with explicit schema name
            const { data, error } = await supabase
                .schema("public")
                .from("pld_sdv_requests")
                .insert({
                    member_id: memberId,
                    calendar_id: member.calendar_id,
                    request_date: date,
                    leave_type: leaveType,
                    status: "pending", // Initial status
                    paid_in_lieu: isPaidInLieu,
                    import_source: "app",
                    imported_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (error) throw error;

            console.log("[TimeStore] Request submitted successfully:", data);

            // Send email notification for the new request
            try {
                console.log(
                    "[TimeStore] Sending request email notification...",
                );
                const { error: emailError } = await supabase.functions.invoke(
                    "send-request-email",
                    {
                        body: {
                            requestId: data.id,
                        },
                    },
                );

                if (emailError) {
                    console.error(
                        "[TimeStore] Email notification failed:",
                        emailError,
                    );
                    // Don't fail the entire request submission if email fails
                    // The request is already in the database successfully
                } else {
                    console.log(
                        "[TimeStore] Email notification sent successfully",
                    );
                }
            } catch (emailError) {
                console.error(
                    "[TimeStore] Error sending email notification:",
                    emailError,
                );
                // Continue - request was successful even if email failed
            }

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
            // Try with explicit schema name
            const { data, error } = await supabase
                .schema("public")
                .from("six_month_requests")
                .insert({
                    member_id: memberId,
                    calendar_id: member.calendar_id,
                    request_date: date,
                    leave_type: leaveType,
                    // No metadata needed - validation trigger has been removed
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

        // Immediate UI updates for critical changes
        if (table === "pld_sdv_requests") {
            if (payload.eventType === "DELETE") {
                // Handle deletions by removing the request from state
                const updatedRequests = get().timeOffRequests.filter(
                    (request) => String(request.id) !== String(payload.old.id), // Robust comparison
                );
                console.log(
                    `[TimeStore RT] Immediately removing deleted pld_sdv_request from UI. ID: ${payload.old.id}`,
                );
                set({ timeOffRequests: updatedRequests });
            } else if (payload.eventType === "UPDATE") {
                const { timeOffRequests } = get();
                console.log(
                    `[TimeStore RT] Processing UPDATE for pld_sdv_requests. Payload ID: ${payload.new.id} (type: ${typeof payload
                        .new.id}). Current timeOffRequests count: ${timeOffRequests.length}`,
                );

                const updatedRequests = timeOffRequests.map((request) => {
                    if (request.is_six_month_request) {
                        // This payload is for pld_sdv_requests, so skip six_month_request placeholders
                        return request;
                    }
                    // Log current request's ID and type for comparison
                    // console.log(`[TimeStore RT Debug] Comparing with store request ID: ${request.id} (type: ${typeof request.id}), is_six_month: ${request.is_six_month_request}`);

                    if (String(request.id) === String(payload.new.id)) {
                        console.log(
                            `[TimeStore RT Debug] Match found for ID ${request.id}! Updating status from "${request.status}" to "${payload.new.status}". Waitlist: ${payload.new.waitlist_position}`,
                        );
                        return {
                            ...request,
                            status: payload.new.status,
                            waitlist_position: payload.new.waitlist_position,
                            // Ensure other relevant fields from payload.new are also updated if necessary
                            // For example, if paid_in_lieu can be changed by an admin:
                            // paid_in_lieu: payload.new.paid_in_lieu,
                        };
                    }
                    return request;
                });

                const originalRequest = timeOffRequests.find((req) =>
                    String(req.id) === String(payload.new.id) &&
                    !req.is_six_month_request
                );
                const newlyUpdatedRequest = updatedRequests.find((req) =>
                    String(req.id) === String(payload.new.id) &&
                    !req.is_six_month_request
                );

                if (
                    originalRequest && newlyUpdatedRequest &&
                    (originalRequest.status !== newlyUpdatedRequest.status ||
                        originalRequest.waitlist_position !==
                            newlyUpdatedRequest.waitlist_position)
                ) {
                    console.log(
                        `[TimeStore RT] Request ID ${payload.new.id} was updated. Old status: ${originalRequest.status}, New status: ${newlyUpdatedRequest.status}. Old waitlist: ${originalRequest.waitlist_position}, New waitlist: ${newlyUpdatedRequest.waitlist_position}`,
                    );
                } else if (originalRequest) {
                    console.log(
                        `[TimeStore RT] Request ID ${payload.new.id} found but relevant fields (status, waitlist_position) did not change or payload values were same.`,
                    );
                } else {
                    console.log(
                        `[TimeStore RT] No matching non-six-month request found in store for ID ${payload.new.id}.`,
                    );
                }

                // Remove cancelled/denied requests from the list
                const filteredRequests = updatedRequests.filter((request) =>
                    request.status !== "cancelled" &&
                    request.status !== "denied"
                );

                console.log(
                    `[TimeStore RT] Setting updated timeOffRequests for pld_sdv_request. Original count: ${timeOffRequests.length}, New count after map: ${updatedRequests.length}, New count after filter: ${filteredRequests.length}`,
                );
                set({ timeOffRequests: filteredRequests });
            } else if (payload.eventType === "INSERT") {
                // For new requests, add them to the UI immediately
                // But only if they belong to the current user
                if (payload.new.member_id === memberId) {
                    const newRequest: TimeOffRequest = {
                        id: String(payload.new.id), // Ensure ID is string
                        member_id: payload.new.member_id,
                        request_date: payload.new.request_date,
                        leave_type: payload.new.leave_type as "PLD" | "SDV",
                        status: payload.new.status as TimeOffRequest["status"],
                        requested_at: payload.new.requested_at ||
                            new Date().toISOString(),
                        waitlist_position: payload.new.waitlist_position ||
                            null,
                        paid_in_lieu: payload.new.paid_in_lieu || false,
                        is_six_month_request: false, // This is a pld_sdv_request
                        calendar_id: payload.new.calendar_id || null,
                        import_source: payload.new.import_source || null,
                        imported_at: payload.new.imported_at || null,
                    };

                    // Add the new request to the state
                    const currentRequests = get().timeOffRequests;
                    const updatedRequests = [
                        ...currentRequests,
                        newRequest,
                    ].sort((a, b) =>
                        new Date(a.request_date).getTime() -
                        new Date(b.request_date).getTime()
                    ); // Keep sorted

                    console.log(
                        `[TimeStore RT] Immediately adding new pld_sdv_request to UI. ID: ${payload.new.id}`,
                    );
                    set({ timeOffRequests: updatedRequests });
                }
            }
        } else if (table === "six_month_requests") {
            if (payload.eventType === "DELETE") {
                // Handle deletions by removing the request from state
                const updatedRequests = get().timeOffRequests.filter(
                    (request) =>
                        !(request.is_six_month_request &&
                            String(request.id) === String(payload.old.id)), // Robust comparison
                );
                console.log(
                    `[TimeStore RT] Immediately removing deleted six-month request from UI. ID: ${payload.old.id}`,
                );
                set({ timeOffRequests: updatedRequests });
            } else if (payload.eventType === "INSERT") {
                if (payload.new.member_id === memberId) {
                    const newSixMonthRequest: TimeOffRequest = {
                        id: String(payload.new.id), // Ensure ID is string
                        member_id: payload.new.member_id,
                        request_date: payload.new.request_date,
                        leave_type: payload.new.leave_type as "PLD" | "SDV",
                        status: "pending", // Six month requests are initially pending in this combined list
                        requested_at: payload.new.requested_at ||
                            new Date().toISOString(),
                        waitlist_position: null,
                        paid_in_lieu: false,
                        is_six_month_request: true,
                        calendar_id: payload.new.calendar_id || null,
                        import_source: payload.new.import_source || null,
                        imported_at: payload.new.imported_at || null,
                    };
                    const currentRequests = get().timeOffRequests;
                    const updatedRequests = [
                        ...currentRequests,
                        newSixMonthRequest,
                    ].sort((a, b) =>
                        new Date(a.request_date).getTime() -
                        new Date(b.request_date).getTime()
                    ); // Keep sorted

                    console.log(
                        `[TimeStore RT] Immediately adding new six-month request to UI. ID: ${payload.new.id}`,
                    );
                    set({ timeOffRequests: updatedRequests });
                }
            }
            // Other six_month_requests changes (like UPDATE to 'processed')
            // will be handled by the debounced refresh, which is generally fine
            // as they would typically disappear from the active list once processed.
        } else if (table === "vacation_requests") {
            if (payload.eventType === "UPDATE") {
                // Update vacation request status
                const updatedRequests = get().vacationRequests.map(
                    (request) => {
                        if (request.id === payload.new.id) {
                            return {
                                ...request,
                                status: payload.new.status,
                            };
                        }
                        return request;
                    },
                );
                console.log(
                    `[TimeStore RT] Immediately updating vacation request status in UI`,
                );
                set({ vacationRequests: updatedRequests });
            } else if (payload.eventType === "DELETE") {
                // Remove deleted vacation requests
                const updatedRequests = get().vacationRequests.filter(
                    (request) => request.id !== payload.old.id,
                );
                console.log(
                    `[TimeStore RT] Immediately removing deleted vacation request from UI`,
                );
                set({ vacationRequests: updatedRequests });
            }
        }

        // Queue a full refresh to ensure all related data is synchronized
        const newTimeoutId = setTimeout(() => {
            console.log(
                `[TimeStore RT] Debounced refresh triggered by ${table} update.`,
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

        // NOTE: Full refresh is now handled by the debounce logic above
        // No need to call refreshAll() again here
    },

    triggerPldSdvRefresh: async () => {
        console.log("[TimeStore] External triggerPldSdvRefresh called");
        const memberId = get().memberId;
        if (memberId) {
            set({ isLoading: true }); // Indicate loading
            try {
                // Focus on refreshing data most relevant to the requests list and stats
                await get().fetchTimeOffRequests(memberId);
                await get().fetchTimeStats(memberId);
                set({ lastRefreshed: new Date(), error: null });
            } catch (e: any) {
                console.error("[TimeStore] Error in triggerPldSdvRefresh:", e);
                set({
                    error: e?.message ||
                        "Error during triggered PLD/SDV refresh",
                });
            } finally {
                set({ isLoading: false });
            }
        } else {
            console.warn(
                "[TimeStore] triggerPldSdvRefresh called but no memberId available.",
            );
        }
    },
}));
