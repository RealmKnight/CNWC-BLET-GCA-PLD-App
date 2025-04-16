import { create } from "zustand";
import { supabase } from "@/utils/supabase";
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
        spot_number: number;
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
    loadInitialData: (startDate: string, endDate: string) => Promise<void>;
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

        try {
            const currentYear = new Date().getFullYear();
            const currentYearStartDate = `${currentYear}-01-01`;

            console.log(
                `[VacationCalendarStore] Fetching allotments from ${currentYearStartDate} onwards for calendarId: ${calendarId}`,
            );

            const { data: allotmentsData, error } = await supabase
                .from("vacation_allotments")
                .select("*")
                .eq("calendar_id", calendarId)
                .gte("week_start_date", currentYearStartDate);

            if (error) throw error;

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
                    allotmentsByWeek[weekKey] = allotment as WeekAllotment;

                    // Log specific allotment data for the weeks we're having issues with
                    if (weekKey === "2024-05-12" || weekKey === "2024-05-19") {
                        console.log(
                            `[VacationCalendarStore] Allotment data for ${weekKey}:`,
                            allotment,
                        );
                    }
                } else {
                    console.warn(
                        `[VacationCalendarStore] Invalid week_start_date found: ${weekKey}`,
                    );
                }
            });

            console.log("[VacationCalendarStore] Processed allotments:", {
                weekKeys: Object.keys(allotmentsByWeek),
                sampleWeek: Object.entries(allotmentsByWeek)[0],
            });

            return allotmentsByWeek;
        } catch (error) {
            console.error(
                "[VacationCalendarStore] Error fetching allotments:",
                error,
            );
            throw error;
        }
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
            });

            // Get all approved requests for this calendar regardless of date range first
            // This ensures we don't miss any requests due to date range issues
            const { data: requestsData, error } = await supabase
                .from("vacation_requests")
                .select(`
          *,
          member:members!inner (
            id, first_name, last_name, pin_number
          )
        `)
                .eq("calendar_id", calendarId)
                .eq("status", "approved");

            if (error) throw error;

            const requestsByWeek: Record<string, WeekRequest[]> = {};

            console.log("[VacationCalendarStore] Fetched requests:", {
                count: requestsData?.length || 0,
            });

            if (requestsData) {
                // First filter requests to only include those within our date range
                const startDateObj = new Date(startDate);
                const endDateObj = new Date(endDate);
                const filteredRequests = requestsData.filter((req) => {
                    const reqDate = new Date(req.start_date);
                    return reqDate >= startDateObj && reqDate <= endDateObj;
                });

                console.log("[VacationCalendarStore] Filtered requests:", {
                    total: requestsData.length,
                    inRange: filteredRequests.length,
                });

                // Process the filtered requests
                filteredRequests.forEach((rawRequest, index) => {
                    // Calculate week start date from request date
                    const requestDate = parseISO(rawRequest.start_date);
                    const weekStart = startOfWeek(requestDate, {
                        weekStartsOn: 1,
                    });
                    const weekStartDate = format(weekStart, "yyyy-MM-dd");

                    // For debugging problematic weeks
                    if (
                        weekStartDate === "2024-05-12" ||
                        weekStartDate === "2024-05-19"
                    ) {
                        console.log(
                            `[VacationCalendarStore] Request mapping for ${rawRequest.start_date}:`,
                            {
                                weekStartDate,
                                requestId: rawRequest.id,
                            },
                        );
                    }

                    if (!requestsByWeek[weekStartDate]) {
                        requestsByWeek[weekStartDate] = [];
                    }

                    const memberInfo = (rawRequest as any).member;
                    const weekRequest: WeekRequest = {
                        ...rawRequest,
                        member: {
                            id: memberInfo.id,
                            first_name: memberInfo.first_name,
                            last_name: memberInfo.last_name,
                            pin_number: memberInfo.pin_number,
                            spot_number: requestsByWeek[weekStartDate].length +
                                1,
                        },
                    };

                    requestsByWeek[weekStartDate].push(weekRequest);
                });
            }

            // Count by week for debugging
            Object.keys(requestsByWeek).forEach((week) => {
                console.log(
                    `[VacationCalendarStore] Week ${week} has ${
                        requestsByWeek[week].length
                    } requests`,
                );
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

    loadInitialData: async (startDate, endDate) => {
        const { member } = useUserStore.getState();
        const calendarId = member?.calendar_id;

        if (!member || !calendarId) {
            console.log(
                "[VacationCalendarStore] No member or calendar_id found for initialization",
            );
            set({
                error: "User or assigned calendar not found",
                isLoading: false,
                isInitialized: true,
            });
            return;
        }

        set({ error: null, isLoading: true });

        try {
            console.log(
                `[VacationCalendarStore] Fetching data for calendarId: ${calendarId}`,
            );

            // Calculate the correct date range for vacation year
            const today = new Date();
            const currentYear = today.getFullYear();
            const nextYear = currentYear + 1;

            // If we're in December and looking at next year's vacation schedule
            const isDecember = today.getMonth() === 11;
            const vacationYear = isDecember ? nextYear : currentYear;

            // First Monday of the vacation year
            const firstMonday = startOfWeek(new Date(vacationYear, 0, 1), {
                weekStartsOn: 1,
            });
            if (firstMonday.getDate() === 1) {
                firstMonday.setDate(firstMonday.getDate() + 7);
            }

            // Last Sunday of the vacation year (actually first Sunday of next year)
            const lastSunday = endOfWeek(new Date(vacationYear, 11, 31), {
                weekStartsOn: 1,
            });

            console.log(
                "[VacationCalendarStore] Date range for vacation year:",
                {
                    firstMonday: format(firstMonday, "yyyy-MM-dd"),
                    lastSunday: format(lastSunday, "yyyy-MM-dd"),
                    vacationYear,
                },
            );

            const [allotmentsResult, requestsResult] = await Promise.all([
                get().fetchAllotments(
                    format(firstMonday, "yyyy-MM-dd"),
                    format(lastSunday, "yyyy-MM-dd"),
                    calendarId,
                ),
                get().fetchRequests(
                    format(firstMonday, "yyyy-MM-dd"),
                    format(lastSunday, "yyyy-MM-dd"),
                    calendarId,
                ),
            ]);

            const hasNextYear = await get().checkNextYearAllotments(
                calendarId,
                vacationYear + 1,
            );

            set({
                isLoading: false,
                isInitialized: true,
                error: null,
                allotments: allotmentsResult,
                requests: requestsResult,
                hasNextYearAllotments: hasNextYear,
            });

            console.log(
                "[VacationCalendarStore] Data load complete and state updated.",
            );

            // After loading all data, sync all allotments with their actual request counts
            Object.keys(requestsResult).forEach((weekStartDate) => {
                syncAllotmentWithRequestCount(weekStartDate, calendarId);
            });

            console.log(
                "[VacationCalendarStore] Synced all allotment request counts",
            );
        } catch (error) {
            console.error("[VacationCalendarStore] Error loading data:", error);
            set({
                isLoading: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to load calendar data",
                isInitialized: true,
                allotments: {},
                requests: {},
                hasNextYearAllotments: false,
            });
        }
    },

    checkNextYearAllotments: async (calendarId, year) => {
        try {
            const { count } = await supabase
                .from("vacation_allotments")
                .select("id", { count: "exact", head: true })
                .eq("calendar_id", calendarId)
                .eq("vac_year", year);

            return (count ?? 0) > 0;
        } catch (error) {
            console.error(
                "[VacationCalendarStore] Error checking next year allotments:",
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
        console.log("[VacationCalendarStore] Cleaning up calendar state");
        set({
            allotments: {},
            requests: {},
            selectedWeek: null,
            error: null,
            isInitialized: false,
            hasNextYearAllotments: false,
        });
    },
}));

export function setupVacationCalendarSubscriptions() {
    const { member } = useUserStore.getState();
    const calendarId = member?.calendar_id;

    if (!calendarId) {
        console.log(
            "[VacationCalendarStore] No calendar_id found, skipping subscriptions",
        );
        return { unsubscribe: () => {} };
    }

    console.log(
        "[VacationCalendarStore] Setting up subscriptions for calendar:",
        calendarId,
    );

    let isSubscribed = true;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;
    const RECONNECT_DELAY = 5000;

    const allotmentsChannel = supabase.channel(
        `vacation-allotments-${calendarId}`,
    );
    const requestsChannel = supabase.channel(`vacation-requests-${calendarId}`);

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

                        if (
                            eventType === "INSERT"
                        ) {
                            // Only add approved requests to the calendar view
                            if (newRecord.status === "approved") {
                                try {
                                    const { data: memberData } = await supabase
                                        .from("members")
                                        .select(
                                            "id, first_name, last_name, pin_number",
                                        )
                                        .eq("pin_number", newRecord.pin_number)
                                        .single();

                                    if (memberData) {
                                        const weekRequest: WeekRequest = {
                                            ...newRecord,
                                            member: {
                                                ...memberData,
                                                spot_number:
                                                    currentRequests.length + 1,
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
                                    }
                                } catch (error) {
                                    console.error(
                                        "[VacationCalendarStore] Error processing INSERT:",
                                        error,
                                    );
                                }
                            }
                        } else if (eventType === "UPDATE") {
                            // Handle status transitions - most importantly from pending/other to approved
                            if (newRecord.status === "approved") {
                                // Check if this is a newly approved request
                                const existingRequestIndex = currentRequests
                                    .findIndex(
                                        (req) => req.id === newRecord.id,
                                    );

                                if (existingRequestIndex >= 0) {
                                    // Update existing request
                                    const updatedRequests = [
                                        ...currentRequests,
                                    ];
                                    updatedRequests[existingRequestIndex] = {
                                        ...updatedRequests[
                                            existingRequestIndex
                                        ],
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
                                    // This is a newly approved request that wasn't in the list
                                    try {
                                        const { data: memberData } =
                                            await supabase
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
                                            const weekRequest: WeekRequest = {
                                                ...newRecord,
                                                member: {
                                                    ...memberData,
                                                    spot_number:
                                                        currentRequests.length +
                                                        1,
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
                                        }
                                    } catch (error) {
                                        console.error(
                                            "[VacationCalendarStore] Error processing UPDATE to approved:",
                                            error,
                                        );
                                    }
                                }
                            } else if (oldRecord.status === "approved") {
                                // Remove request that's no longer approved
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
                                syncAllotmentWithRequestCount(
                                    weekKey,
                                    calendarId,
                                );
                            }
                        } else if (
                            eventType === "DELETE" &&
                            oldRecord.status === "approved"
                        ) {
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

    return {
        unsubscribe: () => {
            console.log(
                "[VacationCalendarStore] Unsubscribing from realtime updates for calendar:",
                calendarId,
            );
            isSubscribed = false;
            allotmentsChannel.unsubscribe();
            requestsChannel.unsubscribe();
        },
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
