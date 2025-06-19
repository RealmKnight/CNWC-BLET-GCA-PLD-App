import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { createRealtimeChannel } from "@/utils/realtime";
import {
    addDays,
    endOfWeek,
    isAfter,
    isBefore,
    parseISO,
    startOfDay,
    startOfWeek,
} from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { Database } from "@/types/supabase";

type Member = Database["public"]["Tables"]["members"]["Row"];
type VacationRequest = Database["public"]["Tables"]["vacation_requests"]["Row"];

export interface WeekRequest extends VacationRequest {
    member: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        pin_number: number;
    };
}

export interface WeekAllotment {
    id: string;
    calendar_id: string;
    week_start_date: string;
    max_allotment: number;
    current_requests: number;
    vac_year: number;
}

interface VacationCalendarState {
    selectedWeek: string | null; // Monday date of selected week
    allotments: Record<string, WeekAllotment>; // Key: week_start_date
    requests: Record<string, WeekRequest[]>; // Key: week_start_date
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;
    hasNextYearAllotments: boolean;

    // Actions
    setSelectedWeek: (date: string | null) => void;
    setAllotments: (allotments: Record<string, WeekAllotment>) => void;
    setRequests: (requests: Record<string, WeekRequest[]>) => void;
    setError: (error: string | null) => void;
    setIsLoading: (isLoading: boolean) => void;
    setIsInitialized: (isInitialized: boolean) => void;
    setHasNextYearAllotments: (hasNextYearAllotments: boolean) => void;

    // Data fetching
    fetchAllotments: (
        startDate: string,
        endDate: string,
        calendarId: string,
    ) => Promise<Record<string, WeekAllotment>>;
    fetchRequests: (
        startDate: string,
        endDate: string,
        calendarId: string,
    ) => Promise<Record<string, WeekRequest[]>>;
    loadInitialData: (
        startDate: string,
        endDate: string,
        calendarId: string,
    ) => Promise<void>;
    checkNextYearAllotments: (
        calendarId: string,
        year: number,
    ) => Promise<boolean>;

    // Computed
    getWeekAvailability: (weekStartDate: string) => "available" | "full";
    isWeekSelectable: (weekStartDate: string) => boolean;
    getActiveRequests: (weekStartDate: string) => WeekRequest[];

    // Cleanup
    cleanupCalendarState: () => void;
    cleanupVacationCalendarState: () => void;
    refreshData: (
        startDate: string,
        endDate: string,
        calendarId: string,
        force: boolean,
    ) => Promise<void>;

    // New refresh all function
    refreshAll: () => Promise<void>;
}

export const useVacationCalendarStore = create<VacationCalendarState>((
    set,
    get,
) => ({
    selectedWeek: null,
    allotments: {},
    requests: {},
    isLoading: false,
    error: null,
    isInitialized: false,
    hasNextYearAllotments: false,

    setSelectedWeek: (date) => set({ selectedWeek: date }),
    setAllotments: (allotments) => {
        const { selectedWeek } = get();
        set({ allotments, selectedWeek });
    },
    setRequests: (requests) => {
        const { selectedWeek } = get();
        set({ requests, selectedWeek });
    },
    setError: (error) => set({ error }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setIsInitialized: (isInitialized) => set({ isInitialized }),
    setHasNextYearAllotments: (hasNextYearAllotments: boolean) =>
        set({ hasNextYearAllotments }),

    fetchAllotments: async (startDate, endDate, calendarId) => {
        if (!calendarId) {
            console.warn(
                "[VacationCalendarStore] fetchAllotments: No calendarId provided.",
            );
            return {};
        }

        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(
                    `[VacationCalendarStore] Fetching allotments (attempt ${attempt}/${MAX_RETRIES}) from ${startDate} onwards for calendarId: ${calendarId}`,
                );

                const { data: allotmentsData, error } = await supabase
                    .from("vacation_allotments")
                    .select("*")
                    .eq("calendar_id", calendarId)
                    .gte("week_start_date", startDate);

                if (error) {
                    // If it's a CORS error, log it specifically
                    if (
                        error.message?.includes("CORS") ||
                        error.message?.includes("Access-Control-Allow-Origin")
                    ) {
                        console.error(
                            "[VacationCalendarStore] CORS error detected:",
                            error,
                        );
                        throw new Error(`CORS error: ${error.message}`);
                    }
                    throw error;
                }

                console.log("[VacationCalendarStore] Fetched allotments:", {
                    count: allotmentsData?.length,
                    firstAllotment: allotmentsData?.[0],
                    lastAllotment: allotmentsData?.[allotmentsData.length - 1],
                });

                const allotmentsByWeek: Record<string, WeekAllotment> = {};
                allotmentsData?.forEach((allotment) => {
                    const weekKey = allotment.week_start_date;
                    if (
                        typeof weekKey === "string" &&
                        weekKey.match(/^\d{4}-\d{2}-\d{2}$/)
                    ) {
                        // Ensure the week starts on a Monday
                        const weekDate = parseISO(weekKey);
                        const weekDay = format(weekDate, "EEEE");
                        if (weekDay !== "Monday") {
                            console.warn(
                                `[VacationCalendarStore] Week ${weekKey} doesn't start on Monday (starts on ${weekDay})`,
                            );
                            return;
                        }

                        allotmentsByWeek[weekKey] = allotment as WeekAllotment;
                    } else {
                        console.warn(
                            `[VacationCalendarStore] Invalid week_start_date found: ${weekKey}`,
                        );
                    }
                });

                return allotmentsByWeek;
            } catch (error) {
                console.error(
                    `[VacationCalendarStore] Error fetching allotments (attempt ${attempt}/${MAX_RETRIES}):`,
                    error,
                );

                if (attempt === MAX_RETRIES) {
                    throw error;
                }

                // Wait before retrying
                await new Promise((resolve) =>
                    setTimeout(resolve, RETRY_DELAY * attempt)
                );
            }
        }

        throw new Error("Failed to fetch allotments after all retries");
    },

    fetchRequests: async (
        startDate: string,
        endDate: string,
        calendarId: string,
    ) => {
        if (!calendarId) {
            console.warn(
                "[VacationCalendarStore] fetchRequests: No calendarId provided.",
            );
            return {};
        }

        try {
            console.log("[VacationCalendarStore] Fetching requests:", {
                startDate,
                endDate,
                calendarId,
            });

            const { data: requestsData, error } = await supabase
                .from("vacation_requests")
                .select(`
          *,
          member:members!inner (
            id, first_name, last_name, pin_number
          )
        `)
                .eq("calendar_id", calendarId)
                .gte("start_date", startDate)
                .lte("start_date", endDate);

            if (error) throw error;

            const requestsByWeek: Record<string, WeekRequest[]> = {};

            console.log("[VacationCalendarStore] Fetched requests:", {
                count: requestsData?.length || 0,
            });

            if (requestsData) {
                requestsData.forEach((rawRequest) => {
                    const requestDate = parseISO(rawRequest.start_date);
                    const weekStart = startOfWeek(requestDate, {
                        weekStartsOn: 1,
                    });
                    const weekStartDate = format(weekStart, "yyyy-MM-dd");

                    if (!requestsByWeek[weekStartDate]) {
                        requestsByWeek[weekStartDate] = [];
                    }

                    const memberData = (rawRequest as any).member;
                    const weekRequest: WeekRequest = {
                        ...rawRequest,
                        member: {
                            id: memberData?.id ?? "",
                            first_name: memberData?.first_name ?? null,
                            last_name: memberData?.last_name ?? null,
                            pin_number: memberData?.pin_number ?? 0,
                        },
                    };

                    requestsByWeek[weekStartDate].push(weekRequest);
                });
            }

            console.log("[VacationCalendarStore] Processed requests by week:", {
                weekKeys: Object.keys(requestsByWeek),
            });

            return requestsByWeek;
        } catch (error) {
            console.error(
                "[VacationCalendarStore] Error fetching requests:",
                error,
            );
            throw error;
        }
    },

    loadInitialData: async (startDate, endDate, calendarId) => {
        if (!calendarId) {
            console.error(
                "[VacationStore] loadInitialData called without calendarId.",
            );
            set({
                isLoading: false,
                error: "Calendar not found",
            });
            return;
        }

        set({ isLoading: true, error: null });
        console.log(
            `[VacationStore] Loading initial data for calendar ${calendarId} from ${startDate} to ${endDate}...`,
        );
        try {
            const [allotmentsResult, requestsResult, hasNextYear] =
                await Promise.all([
                    get().fetchAllotments(startDate, endDate, calendarId),
                    get().fetchRequests(startDate, endDate, calendarId),
                    get().checkNextYearAllotments(
                        calendarId,
                        new Date().getFullYear() + 1,
                    ),
                ]);

            set({
                allotments: allotmentsResult,
                requests: requestsResult,
                hasNextYearAllotments: hasNextYear,
                isLoading: false,
                error: null,
                isInitialized: true,
            });
            console.log("[VacationStore] Initial data loaded successfully.");
        } catch (error) {
            console.error(
                "[VacationStore] Failed to load initial data:",
                error,
            );
            set({
                isLoading: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to load vacation data",
                isInitialized: false,
            });
        }
    },

    checkNextYearAllotments: async (calendarId, year) => {
        if (!calendarId) return false;
        try {
            const { count, error } = await supabase
                .from("vacation_allotments")
                .select("*", { count: "exact", head: true })
                .eq("calendar_id", calendarId)
                .eq("vac_year", year);

            if (error) throw error;
            return (count ?? 0) > 0;
        } catch (error) {
            console.error(
                "[VacationStore] Error checking next year allotments:",
                error,
            );
            return false;
        }
    },

    getWeekAvailability: (weekStartDate) => {
        const state = get();
        const allotment = state.allotments[weekStartDate];

        if (!allotment) {
            console.log(
                `[VacationCalendarStore] No allotment found for week ${weekStartDate}`,
            );
            return "full";
        }

        // Get the actual requests for this week
        const requests = state.requests[weekStartDate] || [];
        const actualRequestCount = requests.length;

        // Log comparison data for debugging
        console.log(
            `[VacationCalendarStore] Availability for ${weekStartDate}:`,
            {
                max: allotment.max_allotment,
                current_in_allotment: allotment.current_requests,
                actual_requests: actualRequestCount,
            },
        );

        // Use the actual request count instead of allotment.current_requests
        return actualRequestCount < allotment.max_allotment
            ? "available"
            : "full";
    },

    isWeekSelectable: (weekStartDate) => {
        const state = get();
        return state.getWeekAvailability(weekStartDate) === "available";
    },

    getActiveRequests: (weekStartDate) => {
        const requests = get().requests[weekStartDate] || [];
        // Log request details for the problematic weeks
        if (weekStartDate === "2024-05-12" || weekStartDate === "2024-05-19") {
            console.log(
                `[VacationCalendarStore] Active requests for ${weekStartDate}:`,
                {
                    count: requests.length,
                    requestIds: requests.map((r) => r.id),
                },
            );
        }
        return requests;
    },

    cleanupCalendarState: () => {
        console.log("[VacationStore] Cleaning up vacation calendar state...");
        set({
            selectedWeek: null,
            allotments: {},
            requests: {},
            isLoading: false,
            error: null,
            isInitialized: false,
            hasNextYearAllotments: false,
        });
    },

    cleanupVacationCalendarState: () => {
        console.log("[VacationStore] Cleaning up vacation calendar state...");
        set({
            selectedWeek: null,
            allotments: {},
            requests: {},
            isLoading: false,
            error: null,
            isInitialized: false,
            hasNextYearAllotments: false,
        });
    },

    refreshData: async (
        startDate: string,
        endDate: string,
        calendarId: string,
        force: boolean = false,
    ) => {
        console.log(`[VacationStore] Refreshing data with force=${force}...`);

        if (!calendarId) {
            console.error(
                "[VacationStore] refreshData called without calendarId.",
            );
            return;
        }

        // If not forcing refresh, we primarily rely on realtime subscriptions
        // which are set up in the setupVacationCalendarSubscriptions function
        if (!force) {
            console.log(
                "[VacationStore] Skipping manual refresh, realtime subscriptions will handle updates",
            );
            return;
        }

        // For forced refreshes, update loading state but don't block the UI
        set((state) => ({ isLoading: true, error: null }));

        try {
            const [allotmentsResult, requestsResult, hasNextYear] =
                await Promise.all([
                    get().fetchAllotments(startDate, endDate, calendarId),
                    get().fetchRequests(startDate, endDate, calendarId),
                    get().checkNextYearAllotments(
                        calendarId,
                        new Date().getFullYear() + 1,
                    ),
                ]);

            set({
                allotments: allotmentsResult,
                requests: requestsResult,
                hasNextYearAllotments: hasNextYear,
                isLoading: false,
                error: null,
            });
            console.log("[VacationStore] Data refreshed successfully");
        } catch (error) {
            console.error("[VacationStore] Failed to refresh data:", error);
            set({
                isLoading: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to refresh vacation data",
            });
        }
    },

    // Add new refreshAll function
    refreshAll: async () => {
        console.log("[VacationStore] Executing refreshAll function...");

        // Get necessary data from store
        const { member } = useUserStore.getState();
        const calendarId = member?.calendar_id;

        if (!calendarId) {
            console.error(
                "[VacationStore] refreshAll: No calendar_id found for member",
            );
            return;
        }

        // Calculate date range (previous 1 month to next 8 months)
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 8, 0);
        const formattedStartDate = format(startDate, "yyyy-MM-dd");
        const formattedEndDate = format(endDate, "yyyy-MM-dd");

        console.log("[VacationStore] refreshAll: Refreshing data with range:", {
            startDate: formattedStartDate,
            endDate: formattedEndDate,
            calendarId,
        });

        // Call existing refreshData with force=true
        await get().refreshData(
            formattedStartDate,
            formattedEndDate,
            calendarId,
            true,
        );

        console.log("[VacationStore] refreshAll completed");
    },
}));

export async function setupVacationCalendarSubscriptions() {
    const { member } = useUserStore.getState();
    const calendarId = member?.calendar_id;

    if (!calendarId) {
        console.log(
            "[VacationCalendarStore] No calendar_id found, skipping subscriptions",
        );
        return () => {};
    }

    console.log(
        "[VacationCalendarStore] Setting up subscriptions for calendar:",
        calendarId,
    );

    let isSubscribed = true;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;
    const RECONNECT_DELAY = 5000;

    const allotmentsChannel = await createRealtimeChannel(
        `vacation-allotments-${calendarId}`,
    );
    const requestsChannel = await createRealtimeChannel(
        `vacation-requests-${calendarId}`,
    );

    const handleSubscriptionError = async (error: any, channelName: string) => {
        console.error(
            `[VacationCalendarStore] ${channelName} subscription error:`,
            error,
        );
        reconnectAttempts++;

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isSubscribed) {
            console.log(
                `[VacationCalendarStore] Attempting to reconnect ${channelName} (attempt ${reconnectAttempts})`,
            );
            await new Promise((resolve) =>
                setTimeout(resolve, RECONNECT_DELAY)
            );
            return true;
        }

        console.log(
            `[VacationCalendarStore] Max reconnection attempts reached for ${channelName}`,
        );
        return false;
    };

    allotmentsChannel
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "vacation_allotments",
                filter: `calendar_id=eq.${calendarId}`,
            },
            async (payload) => {
                try {
                    const store = useVacationCalendarStore.getState();
                    const newRecord = payload.new as any;
                    const oldRecord = payload.old as any;
                    const eventType = payload.eventType;

                    if (newRecord && typeof newRecord === "object") {
                        const weekKey = format(
                            new Date(newRecord.week_start_date),
                            "yyyy-MM-dd",
                        );

                        if (eventType === "INSERT" || eventType === "UPDATE") {
                            store.setAllotments({
                                ...store.allotments,
                                [weekKey]: newRecord as WeekAllotment,
                            });
                        } else if (eventType === "DELETE" && oldRecord) {
                            const { [weekKey]: _, ...remainingAllotments } =
                                store.allotments;
                            store.setAllotments(remainingAllotments);
                        }

                        // Check if we need to update next year status
                        const currentYear = new Date().getFullYear();
                        if (newRecord.vac_year > currentYear) {
                            store.setHasNextYearAllotments(true);
                        }
                    }
                } catch (error) {
                    if (await handleSubscriptionError(error, "allotments")) {
                        allotmentsChannel.subscribe();
                    }
                }
            },
        )
        .subscribe();

    requestsChannel
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "vacation_requests",
                filter: `calendar_id=eq.${calendarId}`,
            },
            async (payload) => {
                try {
                    const store = useVacationCalendarStore.getState();
                    const newRecord = payload.new as any;
                    const oldRecord = payload.old as any;
                    const eventType = payload.eventType;

                    console.log(
                        `[VacationCalendarStore] Received ${eventType} event for vacation_requests:`,
                        {
                            id: newRecord?.id || oldRecord?.id,
                            eventType,
                            newStatus: newRecord?.status,
                            oldStatus: oldRecord?.status,
                        },
                    );

                    const weekStartDate = newRecord?.start_date ||
                        oldRecord?.start_date;
                    if (weekStartDate) {
                        const weekKey = format(
                            startOfWeek(new Date(weekStartDate), {
                                weekStartsOn: 1,
                            }),
                            "yyyy-MM-dd",
                        );
                        const currentRequests = store.requests[weekKey] || [];

                        if (eventType === "INSERT") {
                            // Process all requests regardless of status (not just "approved")
                            try {
                                const { data: memberData } = await supabase
                                    .from("members")
                                    .select(
                                        "id, first_name, last_name, pin_number",
                                    )
                                    .eq("pin_number", newRecord.pin_number)
                                    .single();

                                if (memberData) {
                                    console.log(
                                        `[VacationCalendarStore] Adding ${newRecord.status} request for ${weekKey}:`,
                                        newRecord.id,
                                    );

                                    const weekRequest: WeekRequest = {
                                        ...newRecord,
                                        member: {
                                            ...memberData,
                                        },
                                    };
                                    store.setRequests({
                                        ...store.requests,
                                        [weekKey]: [
                                            ...currentRequests,
                                            weekRequest,
                                        ],
                                    });

                                    // Sync allotment with actual request count
                                    syncAllotmentWithRequestCount(
                                        weekKey,
                                        calendarId,
                                    );
                                } else {
                                    console.error(
                                        `[VacationCalendarStore] Could not find member data for pin ${newRecord.pin_number}`,
                                    );
                                }
                            } catch (error) {
                                console.error(
                                    "[VacationCalendarStore] Error processing INSERT:",
                                    error,
                                );
                            }
                        } else if (eventType === "UPDATE") {
                            // Handle status transitions for all status types
                            // Check if this request already exists in our store
                            const existingRequestIndex = currentRequests
                                .findIndex(
                                    (req) => req.id === newRecord.id,
                                );

                            if (existingRequestIndex >= 0) {
                                // Update existing request
                                console.log(
                                    `[VacationCalendarStore] Updating existing request ${newRecord.id} with status ${newRecord.status}`,
                                );

                                const updatedRequests = [
                                    ...currentRequests,
                                ];
                                updatedRequests[existingRequestIndex] = {
                                    ...updatedRequests[existingRequestIndex],
                                    ...newRecord,
                                };
                                store.setRequests({
                                    ...store.requests,
                                    [weekKey]: updatedRequests,
                                });

                                // Sync allotment with actual request count
                                syncAllotmentWithRequestCount(
                                    weekKey,
                                    calendarId,
                                );
                            } else {
                                // This is a new request we don't have yet
                                try {
                                    const { data: memberData } = await supabase
                                        .from("members")
                                        .select(
                                            "id, first_name, last_name, pin_number",
                                        )
                                        .eq(
                                            "pin_number",
                                            newRecord.pin_number,
                                        )
                                        .single();

                                    if (memberData) {
                                        console.log(
                                            `[VacationCalendarStore] Adding new request from UPDATE event ${newRecord.id} with status ${newRecord.status}`,
                                        );

                                        const weekRequest: WeekRequest = {
                                            ...newRecord,
                                            member: {
                                                ...memberData,
                                            },
                                        };
                                        store.setRequests({
                                            ...store.requests,
                                            [weekKey]: [
                                                ...currentRequests,
                                                weekRequest,
                                            ],
                                        });

                                        // Sync allotment with actual request count
                                        syncAllotmentWithRequestCount(
                                            weekKey,
                                            calendarId,
                                        );
                                    } else {
                                        console.error(
                                            `[VacationCalendarStore] Could not find member data for pin ${newRecord.pin_number} during UPDATE`,
                                        );
                                    }
                                } catch (error) {
                                    console.error(
                                        "[VacationCalendarStore] Error processing UPDATE for new request:",
                                        error,
                                    );
                                }
                            }
                        } else if (eventType === "DELETE") {
                            // Remove request that's been deleted
                            console.log(
                                `[VacationCalendarStore] Removing deleted request ${oldRecord.id}`,
                            );

                            const filteredRequests = currentRequests
                                .filter((req) => req.id !== oldRecord.id)
                                .map((req, index) => ({
                                    ...req,
                                    member: {
                                        ...req.member,
                                        spot_number: index + 1,
                                    },
                                }));
                            store.setRequests({
                                ...store.requests,
                                [weekKey]: filteredRequests,
                            });

                            // Sync allotment with actual request count
                            syncAllotmentWithRequestCount(weekKey, calendarId);
                        }
                    }
                } catch (error) {
                    if (await handleSubscriptionError(error, "requests")) {
                        requestsChannel.subscribe();
                    }
                }
            },
        )
        .subscribe();

    // Return a cleanup function that removes both channels
    return () => {
        console.log(
            "[VacationCalendarStore] Unsubscribing from realtime updates",
        );
        isSubscribed = false;
        allotmentsChannel.unsubscribe();

        try {
            if (allotmentsChannel) {
                console.log(
                    "[VacationCalendarStore] Removing allotments channel",
                );
                supabase.removeChannel(allotmentsChannel).catch((err) =>
                    console.error(
                        "[VacationCalendarStore] Error removing allotments channel:",
                        err,
                    )
                );
            }

            if (requestsChannel) {
                console.log(
                    "[VacationCalendarStore] Removing requests channel",
                );
                supabase.removeChannel(requestsChannel).catch((err) =>
                    console.error(
                        "[VacationCalendarStore] Error removing requests channel:",
                        err,
                    )
                );
            }
        } catch (error) {
            console.error(
                "[VacationCalendarStore] Error during channel cleanup:",
                error,
            );
        }
    };
}

// Add a helper function to sync allotment with actual request counts
function syncAllotmentWithRequestCount(
    weekStartDate: string,
    calendarId: string,
): void {
    const store = useVacationCalendarStore.getState();
    const requests = store.requests[weekStartDate] || [];
    const actualRequestCount = requests.length;
    const allotment = store.allotments[weekStartDate];

    if (allotment && allotment.current_requests !== actualRequestCount) {
        console.log(
            `[VacationCalendarStore] Syncing allotment for ${weekStartDate}:`,
            {
                old: allotment.current_requests,
                new: actualRequestCount,
            },
        );

        // Update the allotment object in state
        store.setAllotments({
            ...store.allotments,
            [weekStartDate]: {
                ...allotment,
                current_requests: actualRequestCount,
            },
        });

        // Optionally update in the database too
        supabase
            .from("vacation_allotments")
            .update({ current_requests: actualRequestCount })
            .eq("id", allotment.id)
            .then(({ error }) => {
                if (error) {
                    console.error(
                        `[VacationCalendarStore] Error syncing allotment in DB:`,
                        error,
                    );
                }
            });
    }
}
