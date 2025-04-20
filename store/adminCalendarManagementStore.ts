import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { Alert, Platform } from "react-native";
import { isValid, parseISO } from "date-fns";
import { useUserStore } from "@/store/userStore";
import { Zone } from "@/types/calendar";
import { Database } from "@/types/supabase";

// Define Calendar type (based on refactor plan)
interface Calendar {
    id: string; // uuid
    division_id: number;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface YearlyAllotment {
    id?: string;
    calendar_id?: string;
    year: number;
    max_allotment: number;
    current_requests?: number;
    is_override?: boolean | null;
    override_reason?: string | null;
    override_by?: string | null;
    override_at?: string | null;
    updated_at?: string;
    updated_by?: string;
}

interface PldSdvAllotment extends YearlyAllotment {
    date?: string;
}

interface VacationAllotment extends YearlyAllotment {
    week_start_date?: string;
    vac_year?: number;
}

interface WeeklyVacationAllotment {
    id: number;
    calendar_id: string | null;
    week_start_date: string;
    max_allotment: number;
    current_requests: number | null;
    vac_year: number;
    is_override: boolean;
    override_by: string | null;
    override_at: string | null;
    override_reason: string | null;
}

type AllotmentType = "pld_sdv" | "vacation";

// Add these interfaces to the top of the file, near the other interface definitions
interface Member {
    pin_number: number;
    first_name: string;
    last_name: string;
    company_hire_date: string;
    curr_vacation_weeks: number;
    next_vacation_weeks: number;
    curr_vacation_split: number;
    next_vacation_split: number;
    sdv_entitlement: number;
    sdv_election: number;
    max_plds: number;
    division_id: number;
    wc_sen_roster: number;
}

type TimeOffYearType = "current" | "next";

interface AdminCalendarManagementState {
    // Renamed state
    divisionZones: Record<string, Zone[]>; // Renamed from zones

    // Calendars state (New)
    calendars: Record<string, Calendar[]>; // Stores calendars per division name
    selectedCalendarId: string | null; // New, replaces selectedZoneId

    // Enhanced loading states
    isDivisionLoading: boolean;
    isAllotmentsLoading: boolean;
    isZonesLoading: boolean;
    isCalendarsLoading: boolean;
    currentLoadingDivision: string | null;
    lastLoadedDivision: string | null;

    // State for PLD/SDV allotments
    yearlyAllotments: YearlyAllotment[];
    pldSdvTempAllotments: Record<number, string>;

    // State for vacation allotments
    weeklyVacationAllotments: WeeklyVacationAllotment[];
    vacationTempAllotments: Record<number, string>;

    selectedType: AllotmentType;

    // Shared state
    isLoading: boolean;
    error: string | null;

    loadedDivisions: Set<string>;

    // Updated cache keying
    allotmentCache: Record<string, { // Keyed by calendarId
        yearlyAllotments: YearlyAllotment[];
        weeklyVacationAllotments: WeeklyVacationAllotment[];
        pldSdvTempAllotments: Record<number, string>;
        vacationTempAllotments: Record<number, string>;
    }>;

    currentFetchingDivision: string | null;
    isSwitchingDivision: boolean;
    isDivisionReadyMap: Record<string, boolean>;

    // New allotment management fields
    pldSdvYearlyDefaults: Record<string, Record<number, PldSdvAllotment>>;
    pldSdvDailyOverrides: Record<string, Record<string, PldSdvAllotment>>;
    vacationYearlyDefaults: Record<string, Record<number, VacationAllotment>>;
    vacationWeeklyOverrides: Record<string, Record<string, VacationAllotment>>;

    // State for vacation allotment weeks (for request entry form)
    vacationAllotmentWeeks: Record<
        string,
        Record<number, { week_start_date: string }[]>
    >; // Map: calendarId -> year -> [{week_start_date}]
    isLoadingVacationAllotmentWeeks: boolean;

    // Date range editing fields
    isEditingRange: boolean;
    rangeStartDate: string | undefined;
    rangeEndDate: string | undefined;
    rangeAllotmentValue: string;

    // New state for time off management
    selectedTimeOffYear: TimeOffYearType;
    memberTimeOffData: Record<number, Member>;
    memberTimeOffDataArray: Member[]; // Added to preserve original order
    timeOffChanges: Record<
        number,
        Partial<{
            curr_vacation_split: number;
            next_vacation_split: number;
            curr_vacation_weeks: number;
            next_vacation_weeks: number;
            sdv_election: number;
            sdv_entitlement: number;
        }>
    >;
    isTimeOffLoading: boolean;
    timeOffError: string | null;

    // Actions
    setError: (error: string | null) => void;
    setIsLoading: (isLoading: boolean) => void;
    setPldSdvTempAllotments: (
        updater:
            | Record<number, string>
            | ((prev: Record<number, string>) => Record<number, string>),
    ) => void;
    setVacationTempAllotments: (
        updater:
            | Record<number, string>
            | ((prev: Record<number, string>) => Record<number, string>),
    ) => void;
    setSelectedCalendarId: (calendarId: string | null) => void; // Replaces setSelectedZoneId
    resetAllotments: (calendarId?: string | null) => void;

    // Actions related to zones and division settings
    fetchDivisionZones: (divisionId: number) => Promise<Zone[]>;
    fetchDivisionCalendars: (divisionId: number) => Promise<Calendar[]>; // New fetch function
    fetchDivisionSettings: (divisionName: string) => Promise<void>;

    // Actions related to allotments (updated signatures)
    setSelectedType: (type: AllotmentType) => void;
    fetchAllotments: (calendarId: string, year: number) => Promise<void>; // Uses calendarId
    updateAllotment: ( // Uses calendarId
        calendarId: string,
        year: number,
        maxAllotment: number,
        userId: string,
        reason?: string,
    ) => Promise<void>;
    fetchPldSdvAllotments: (calendarId: string, year: number) => Promise<void>; // Uses calendarId
    fetchVacationAllotments: ( // Uses calendarId
        calendarId: string,
        year: number,
    ) => Promise<void>;
    updateVacationAllotment: ( // Uses calendarId
        calendarId: string,
        weekStartDate: string,
        maxAllotment: number,
        userId: string,
        reason?: string,
    ) => Promise<void>;

    // New actions for Calendar CRUD (placeholders)
    createCalendar: (
        divisionId: number,
        name: string,
        description?: string,
    ) => Promise<Calendar | null>;
    updateCalendar: (
        calendarId: string,
        updates: Partial<Pick<Calendar, "name" | "description" | "is_active">>,
    ) => Promise<boolean>;

    // New action for fetching vacation weeks
    fetchVacationAllotmentWeeks: (
        calendarId: string,
        year: number,
    ) => Promise<void>;

    cleanupDivisionState: (divisionId: string, divisionName: string) => void;
    prepareDivisionSwitch: (
        fromDivision: string,
        toDivision: string,
    ) => Promise<void>;
    validateDivisionState: (divisionName: string) => boolean;

    // Division state management
    ensureDivisionSettingsLoaded: (divisionName: string) => Promise<boolean>;

    // Add these new functions to the interface
    updatePldSdvRangeOverride: (
        calendarId: string,
        startDate: string,
        endDate: string,
        maxAllotment: number,
        userId: string,
        reason?: string,
    ) => Promise<
        { affectedCount: number; startDate: string; endDate: string } | null
    >;

    updateVacationRangeOverride: (
        calendarId: string,
        startDate: string,
        endDate: string,
        maxAllotment: number,
        userId: string,
        reason?: string,
    ) => Promise<
        { affectedCount: number; startDate: string; endDate: string } | null
    >;

    // New actions for time off management
    setSelectedTimeOffYear: (year: TimeOffYearType) => void;
    fetchMemberTimeOffData: (divisionId: number) => Promise<void>;
    setTimeOffChange: (pinNumber: number, field: string, value: any) => void;
    resetTimeOffChanges: () => void;
    calculateAndUpdateSDVs: (
        pinNumber: number,
        vacationSplit: number,
        year: TimeOffYearType,
    ) => void;
    updateMemberTimeOff: (
        changes: Array<{
            pin_number: number;
            [key: string]: any;
        }>,
        year: TimeOffYearType,
    ) => Promise<boolean>;
    updateSingleMemberTimeOff: (
        pinNumber: number,
        fields: Record<string, any>,
        year: TimeOffYearType,
    ) => Promise<boolean>;
}

// Keep track of ongoing fetches outside the store state
const divisionLoadPromises = new Map<string, Promise<void>>();
const allotmentFetchPromises = new Map<string, Promise<void>>();

function getAllotmentFetchKey(
    calendarId: string,
    year: number,
    type: "pld_sdv" | "vacation",
): string {
    return `${calendarId}-${year}-${type}`;
}

// Helper function to convert Supabase response to Calendar type
function convertToCalendar(data: any): Calendar {
    return {
        id: data.id,
        division_id: data.division_id,
        name: data.name,
        description: data.description || undefined,
        is_active: data.is_active,
        created_at: data.created_at,
        updated_at: data.updated_at,
    };
}

// Helper function to convert Supabase response to WeeklyVacationAllotment type
function convertToWeeklyVacationAllotment(data: any): WeeklyVacationAllotment {
    return {
        id: data.id,
        calendar_id: data.calendar_id,
        week_start_date: data.week_start_date,
        max_allotment: data.max_allotment,
        current_requests: data.current_requests,
        vac_year: data.vac_year,
        is_override: data.is_override ?? false,
        override_by: data.override_by,
        override_at: data.override_at,
        override_reason: data.override_reason,
    };
}

// Define the RPC response type
type BulkUpdateResult = {
    affected_count: number;
    start_date: string;
    end_date: string;
};

export const useAdminCalendarManagementStore = create<
    AdminCalendarManagementState
>((set, get) => ({
    // Initial state
    divisionZones: {}, // Renamed
    calendars: {}, // New
    selectedCalendarId: null, // New
    yearlyAllotments: [],
    pldSdvTempAllotments: {},
    selectedType: "pld_sdv" as AllotmentType,
    isLoading: false,
    error: null,
    loadedDivisions: new Set<string>(),
    weeklyVacationAllotments: [],
    vacationTempAllotments: {},
    isDivisionLoading: false,
    isAllotmentsLoading: false,
    isZonesLoading: false,
    isCalendarsLoading: false, // New
    currentLoadingDivision: null,
    lastLoadedDivision: null,
    currentFetchingDivision: null,
    isSwitchingDivision: false,
    allotmentCache: {}, // Keyed by calendarId
    isDivisionReadyMap: {},

    // New allotment management fields
    pldSdvYearlyDefaults: {},
    pldSdvDailyOverrides: {},
    vacationYearlyDefaults: {},
    vacationWeeklyOverrides: {},

    // State for vacation allotment weeks (for request entry form)
    vacationAllotmentWeeks: {},
    isLoadingVacationAllotmentWeeks: false,

    // Date range editing fields
    isEditingRange: false,
    rangeStartDate: undefined,
    rangeEndDate: undefined,
    rangeAllotmentValue: "",

    // New state for time off management
    selectedTimeOffYear: "current",
    memberTimeOffData: {},
    memberTimeOffDataArray: [],
    timeOffChanges: {},
    isTimeOffLoading: false,
    timeOffError: null,

    // Simple Setters
    setError: (error) => set({ error }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setSelectedType: (type) => set({ selectedType: type }),
    setSelectedCalendarId: (calendarId) => { // Replaced setSelectedZoneId
        console.log("[AdminStore] Setting selectedCalendarId:", calendarId);
        const previousCalendarId = get().selectedCalendarId;
        const currentDivision = get().lastLoadedDivision;

        if (previousCalendarId !== calendarId) {
            // Reset ready state for the current division when calendar changes
            set((state) => ({
                selectedCalendarId: calendarId,
                ...(currentDivision &&
                    {
                        isDivisionReadyMap: {
                            ...state.isDivisionReadyMap,
                            [currentDivision]: false, // Mark as not ready until allotments load
                        },
                    }),
            }));

            // Reset currently displayed allotments (will be reloaded or retrieved from cache)
            get().resetAllotments(); // Resets the displayed allotments

            if (calendarId) {
                const cachedData = get().allotmentCache[calendarId];
                if (cachedData) {
                    console.log(
                        `[AdminStore] Using cached allotments for calendar ${calendarId}`,
                    );
                    set({
                        yearlyAllotments: cachedData.yearlyAllotments,
                        weeklyVacationAllotments:
                            cachedData.weeklyVacationAllotments,
                        pldSdvTempAllotments: cachedData.pldSdvTempAllotments,
                        vacationTempAllotments:
                            cachedData.vacationTempAllotments,
                    });
                    // Mark as ready immediately if using cache
                    if (currentDivision) {
                        set((state) => ({
                            isDivisionReadyMap: {
                                ...state.isDivisionReadyMap,
                                [currentDivision]: true,
                            },
                        }));
                        console.log(
                            `[AdminStore] Marked division ${currentDivision} as ready (used cache for calendar ${calendarId})`,
                        );
                    }
                } else {
                    // Fetch allotments if not cached
                    const currentYear = new Date().getFullYear();
                    const fetchAndMarkReady = async () => {
                        try {
                            set({ isAllotmentsLoading: true });
                            await get().fetchAllotments(
                                calendarId,
                                currentYear,
                            );
                            await get().fetchAllotments(
                                calendarId,
                                currentYear + 1,
                            );
                            // Mark as ready after fetching
                            if (currentDivision) {
                                set((state) => ({
                                    isDivisionReadyMap: {
                                        ...state.isDivisionReadyMap,
                                        [currentDivision]: true,
                                    },
                                }));
                                console.log(
                                    `[AdminStore] Marked division ${currentDivision} as ready after fetching for calendar ${calendarId}`,
                                );
                            }
                        } catch (error) {
                            console.error(
                                `[AdminStore] Error fetching allotments after calendar change:`,
                                error,
                            );
                            set({
                                error:
                                    `Failed to load allotments for calendar ${calendarId}`,
                            });
                        } finally {
                            set({ isAllotmentsLoading: false });
                        }
                    };
                    fetchAndMarkReady();
                }
            } else {
                // If calendarId is null, mark the division as ready (no specific calendar selected)
                if (currentDivision) {
                    set((state) => ({
                        isDivisionReadyMap: {
                            ...state.isDivisionReadyMap,
                            [currentDivision]: true,
                        },
                    }));
                }
            }
        }
    },
    setPldSdvTempAllotments: (updater) => {
        set((state) => ({
            pldSdvTempAllotments: typeof updater === "function"
                ? updater(state.pldSdvTempAllotments)
                : updater,
        }));
    },
    setVacationTempAllotments: (updater) => {
        set((state) => ({
            vacationTempAllotments: typeof updater === "function"
                ? updater(state.vacationTempAllotments)
                : updater,
        }));
    },
    resetAllotments: (calendarId = null) => { // Optional specific calendar cache reset
        const currentCalendarId = calendarId ?? get().selectedCalendarId;
        console.log(
            `[AdminStore] Resetting allotments state (display) and potentially cache for calendar: ${
                currentCalendarId ?? "current display"
            }`,
        );
        // Reset the currently displayed allotments regardless
        set({
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            pldSdvTempAllotments: {},
            vacationTempAllotments: {},
        });
        // If a specific calendarId is provided, clear its cache entry
        if (currentCalendarId) {
            set((state) => {
                const { [currentCalendarId]: _, ...restCache } =
                    state.allotmentCache;
                return { allotmentCache: restCache };
            });
        }
    },

    // --- Data Fetching Actions ---
    fetchDivisionZones: async (divisionId) => {
        set({ isZonesLoading: true });
        try {
            const { data: zonesData, error: zonesError } = await supabase
                .from("zones")
                .select("id, name, division_id, created_at, updated_at")
                .eq("division_id", divisionId)
                .order("name");
            if (zonesError) throw zonesError;
            return zonesData || [];
        } finally {
            set({ isZonesLoading: false });
        }
    },

    fetchDivisionCalendars: async (divisionId) => { // New fetch function
        set({ isCalendarsLoading: true });
        try {
            const { data: calendarsData, error: calendarsError } =
                await supabase
                    .from("calendars")
                    .select("*") // Selects all columns from the Calendar interface
                    .eq("division_id", divisionId)
                    .order("name");
            if (calendarsError) throw calendarsError;
            return calendarsData || [];
        } finally {
            set({ isCalendarsLoading: false });
        }
    },

    fetchDivisionSettings: async (divisionName) => { // Updated logic
        if (!divisionName) return Promise.resolve();

        const currentFetching = get().currentFetchingDivision;
        if (currentFetching && currentFetching !== divisionName) {
            console.log(
                `[AdminStore] Skipping fetch for ${divisionName}, currently fetching ${currentFetching}`,
            );
            return; // Already fetching another division
        }

        // Prevent duplicate fetches if already loading this specific division
        if (currentFetching === divisionName) {
            console.log(
                `[AdminStore] Already fetching settings for division ${divisionName}, returning existing promise.`,
            );
            const promise = divisionLoadPromises.get(divisionName);
            if (promise) return promise; // Should exist if currentFetching === divisionName
        }

        set((state) => ({
            isDivisionLoading: true, // Combined loading state
            isZonesLoading: true,
            isCalendarsLoading: true,
            error: null,
            currentFetchingDivision: divisionName, // Mark this division as being fetched
            isDivisionReadyMap: {
                ...state.isDivisionReadyMap,
                [divisionName]: false,
            }, // Mark as not ready
        }));

        let divisionId: number | null = null;

        try {
            console.log(
                `[AdminStore] Fetching settings for division ${divisionName}`,
            );
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("id, name")
                .eq("name", divisionName)
                .single();

            if (divisionError) {
                console.error(
                    "[AdminStore] Error fetching division:",
                    divisionError,
                );
                throw divisionError;
            }
            if (!divisionData) {
                console.error(
                    `[AdminStore] Division "${divisionName}" not found`,
                );
                throw new Error(`Division "${divisionName}" not found`);
            }

            divisionId = divisionData.id;
            console.log(
                `[AdminStore] Found division ID ${divisionId} for name ${divisionName}`,
            );

            // Fetch zones and calendars in parallel
            const [fetchedZones, fetchedCalendars] = await Promise.all([
                get().fetchDivisionZones(divisionId),
                get().fetchDivisionCalendars(divisionId), // Fetch calendars
            ]);

            console.log(
                `[AdminStore] Fetched data for division ${divisionName}:`,
                {
                    zonesCount: fetchedZones.length,
                    calendarsCount: fetchedCalendars.length,
                    calendars: fetchedCalendars.map((c) => ({
                        id: c.id,
                        name: c.name,
                    })),
                },
            );

            // Update state with fetched data
            set((state) => ({
                divisionZones: {
                    ...state.divisionZones,
                    [divisionName]: fetchedZones,
                },
                calendars: {
                    ...state.calendars,
                    [divisionName]: fetchedCalendars,
                }, // Store calendars
            }));

            // Determine the selectedCalendarId based on fetched calendars
            const currentSelection = get().selectedCalendarId;
            const currentSelectionIsValid = currentSelection &&
                fetchedCalendars.some((c) => c.id === currentSelection);

            if (!currentSelectionIsValid) {
                const firstActiveCalendar = fetchedCalendars.find((c) =>
                    c.is_active
                );
                const newCalendarId = firstActiveCalendar
                    ? firstActiveCalendar.id
                    : (fetchedCalendars.length > 0
                        ? fetchedCalendars[0].id
                        : null);
                // Use setSelectedCalendarId which handles fetching allotments for the new calendar
                get().setSelectedCalendarId(newCalendarId);
                console.log(
                    `[AdminStore] Setting initial/fallback calendar for ${divisionName} to: ${newCalendarId}`,
                );
            } else {
                // If the current selection is still valid, trigger allotment load/cache check for it
                console.log(
                    `[AdminStore] Keeping existing calendar selection ${currentSelection} for ${divisionName}`,
                );
                get().setSelectedCalendarId(currentSelection); // Re-trigger to ensure readiness/loading
            }

            set((state) => ({
                loadedDivisions: new Set(state.loadedDivisions).add(
                    divisionName,
                ),
                lastLoadedDivision: divisionName, // Track the most recently fully loaded division
            }));
            console.log(
                `[AdminStore] Successfully loaded settings for division ${divisionName}`,
            );
        } catch (error) {
            console.error(
                `[AdminStore] Error fetching division settings for ${divisionName}:`,
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to load division settings";
            set({ error: message });
            // Ensure calendar selection is nullified on error
            get().setSelectedCalendarId(null);
        } finally {
            set({
                isDivisionLoading: false,
                isZonesLoading: false,
                isCalendarsLoading: false,
                currentFetchingDivision: null, // Clear fetching marker
            });
            // The readiness is set within setSelectedCalendarId after allotments are handled
        }
    },

    ensureDivisionSettingsLoaded: async (
        divisionName: string,
    ): Promise<boolean> => {
        if (!divisionName) {
            console.warn(
                "[AdminStore] ensureDivisionSettingsLoaded called without a division name",
            );
            return false;
        }

        try {
            console.log(
                `[AdminStore] Ensuring division settings loaded for ${divisionName}`,
            );

            // Check if division settings are already loaded
            if (
                get().loadedDivisions.has(divisionName) &&
                get().calendars[divisionName]
            ) {
                console.log(
                    `[AdminStore] Division ${divisionName} already loaded`,
                );

                // Check if we need to select a calendar
                const currentSelectedCalendar = get().selectedCalendarId;
                const divisionCalendars = get().calendars[divisionName] || [];

                if (!currentSelectedCalendar && divisionCalendars.length > 0) {
                    // Auto-select first active calendar or first calendar
                    const firstActiveCalendar = divisionCalendars.find((c) =>
                        c.is_active
                    );
                    const calendarToSelect = firstActiveCalendar ||
                        divisionCalendars[0];

                    console.log(
                        `[AdminStore] Auto-selecting calendar ${calendarToSelect.id} for loaded division ${divisionName}`,
                    );
                    get().setSelectedCalendarId(calendarToSelect.id);
                }

                return true;
            }

            // Division settings not loaded, fetch them
            console.log(
                `[AdminStore] Fetching settings for division ${divisionName}`,
            );
            await get().fetchDivisionSettings(divisionName);

            // Verify settings were loaded successfully
            return get().validateDivisionState(divisionName);
        } catch (error) {
            console.error(
                `[AdminStore] Error ensuring division settings for ${divisionName}:`,
                error,
            );
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to load division settings",
            });
            return false;
        }
    },

    handleError: (error: Error) => {
        set({
            error: error.message,
            isLoading: false,
            isDivisionLoading: false,
            // Removing properties that don't exist in the interface
            // override_by: undefined,
            // override_at: undefined,
            // override_reason: undefined,
        });
    },

    // --- Allotment Fetching (using calendarId) ---
    fetchPldSdvAllotments: async (calendarId, year) => { // Accepts calendarId
        if (!calendarId) {
            console.warn(
                "[AdminStore] fetchPldSdvAllotments called without calendarId.",
            );
            return;
        }
        set({ isAllotmentsLoading: true, error: null });
        console.log("[AdminStore] Fetching PLD/SDV allotments for calendar:", {
            calendarId,
            year,
        });

        try {
            // Fetch only the single yearly record based on calendar_id and year
            const { data, error } = await supabase
                .from("pld_sdv_allotments")
                .select(
                    "year, max_allotment, is_override, override_by, override_at, override_reason",
                )
                .eq("calendar_id", calendarId)
                .eq("year", year)
                .maybeSingle(); // Expect 0 or 1 row

            if (error) throw error;

            const allotmentData: YearlyAllotment = {
                year: year,
                max_allotment: data?.max_allotment ?? 0, // Default to 0 if no record found
                is_override: data?.is_override ?? null,
                override_by: data?.override_by ?? null,
                override_at: data?.override_at ?? null,
                override_reason: data?.override_reason ?? null,
            };

            set((state) => {
                // Update yearlyAllotments in the main state (for display)
                const updatedYearlyAllotments = [
                    ...state.yearlyAllotments.filter((a) => a.year !== year), // Remove existing year entry if present
                    allotmentData,
                ].sort((a, b) => a.year - b.year); // Keep sorted

                // Update the temp input state
                const updatedPldSdvTemp = {
                    ...state.pldSdvTempAllotments,
                    [year]: allotmentData.max_allotment.toString(),
                };

                // Update the cache for this calendarId
                const calendarCache = state.allotmentCache[calendarId] || {
                    yearlyAllotments: [],
                    weeklyVacationAllotments: [],
                    pldSdvTempAllotments: {},
                    vacationTempAllotments: {},
                };
                const updatedCache = {
                    ...calendarCache,
                    yearlyAllotments: calendarCache.yearlyAllotments.filter(
                        (a) => a.year !== year,
                    ).concat(allotmentData).sort((a, b) => a.year - b.year),
                    pldSdvTempAllotments: {
                        ...calendarCache.pldSdvTempAllotments,
                        [year]: allotmentData.max_allotment.toString(),
                    },
                };

                return {
                    yearlyAllotments: updatedYearlyAllotments, // Update displayed data
                    pldSdvTempAllotments: updatedPldSdvTemp, // Update temp input data
                    allotmentCache: {
                        ...state.allotmentCache,
                        [calendarId]: updatedCache,
                    }, // Update cache
                };
            });
        } catch (error) {
            console.error(
                "[AdminStore] Error fetching PLD/SDV allotment:",
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to fetch PLD/SDV allotment";
            set({ error: message });
        } finally {
            set({ isAllotmentsLoading: false });
        }
    },

    fetchVacationAllotments: async (calendarId, year) => { // Accepts calendarId
        if (!calendarId) {
            console.warn(
                "[AdminStore] fetchVacationAllotments called without calendarId.",
            );
            return;
        }
        set({ isAllotmentsLoading: true, error: null });
        console.log("[AdminStore] Fetching vacation allotments for calendar:", {
            calendarId,
            year,
        });

        try {
            const { data, error } = await supabase
                .from("vacation_allotments")
                .select("*") // Fetches all columns, matching WeeklyVacationAllotment
                .eq("calendar_id", calendarId)
                .eq("vac_year", year)
                .order("week_start_date"); // Order by week start date

            if (error) throw error;

            // Ensure data conforms to WeeklyVacationAllotment interface
            const weeklyData: WeeklyVacationAllotment[] = (data || []).map(
                (d) => ({
                    id: parseInt(d.id, 10), // Parse id to number
                    calendar_id: d.calendar_id,
                    week_start_date: d.week_start_date,
                    max_allotment: d.max_allotment,
                    current_requests: d.current_requests,
                    vac_year: d.vac_year,
                    is_override: d.is_override ?? false, // Default to false if null
                    override_by: d.override_by,
                    override_at: d.override_at,
                    override_reason: d.override_reason,
                    // is_active property has been removed
                }),
            );

            set((state) => {
                // Update the temp input state (use the first week's allotment or 0)
                const updatedVacTemp = {
                    ...state.vacationTempAllotments,
                    [year]: weeklyData[0]?.max_allotment?.toString() ?? "0",
                };

                // Update the cache for this calendarId
                const calendarCache = state.allotmentCache[calendarId] || {
                    yearlyAllotments: [],
                    weeklyVacationAllotments: [],
                    pldSdvTempAllotments: {},
                    vacationTempAllotments: {},
                };
                const updatedCache = {
                    ...calendarCache,
                    weeklyVacationAllotments: weeklyData, // Store fetched weekly data in cache
                    vacationTempAllotments: {
                        ...calendarCache.vacationTempAllotments,
                        [year]: weeklyData[0]?.max_allotment?.toString() ?? "0",
                    },
                };

                return {
                    weeklyVacationAllotments: weeklyData, // Update displayed data
                    vacationTempAllotments: updatedVacTemp, // Update temp input data
                    allotmentCache: {
                        ...state.allotmentCache,
                        [calendarId]: updatedCache,
                    }, // Update cache
                };
            });
        } catch (error) {
            console.error(
                "[AdminStore] Error fetching vacation allotments:",
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to fetch vacation allotments";
        } finally {
            set({ isAllotmentsLoading: false });
        }
    },

    fetchAllotments: async (calendarId, year) => { // Uses calendarId
        if (!calendarId) {
            console.warn(
                "[AdminStore] fetchAllotments called without calendarId.",
            );
            return;
        }
        const pldKey = getAllotmentFetchKey(calendarId, year, "pld_sdv");
        const vacKey = getAllotmentFetchKey(calendarId, year, "vacation");

        const existingPldFetch = allotmentFetchPromises.get(pldKey);
        const existingVacFetch = allotmentFetchPromises.get(vacKey);

        if (existingPldFetch || existingVacFetch) {
            console.log(
                `[AdminStore] Waiting for existing allotment fetches for calendar ${calendarId}, year ${year}`,
            );
            await Promise.all(
                [existingPldFetch, existingVacFetch].filter(Boolean),
            );
            return;
        }

        console.log(
            `[AdminStore] Starting allotment fetch for calendar ${calendarId}, year ${year}`,
        );
        const pldPromise = get().fetchPldSdvAllotments(calendarId, year)
            .finally(() => allotmentFetchPromises.delete(pldKey));
        const vacPromise = get().fetchVacationAllotments(calendarId, year)
            .finally(() => allotmentFetchPromises.delete(vacKey));

        allotmentFetchPromises.set(pldKey, pldPromise);
        allotmentFetchPromises.set(vacKey, vacPromise);

        await Promise.all([pldPromise, vacPromise]);
        console.log(
            `[AdminStore] Completed allotment fetch for calendar ${calendarId}, year ${year}`,
        );
    },

    // --- Allotment Update Actions (using calendarId) ---
    updateAllotment: async (calendarId, year, maxAllotment, userId, reason) => { // Accepts calendarId
        const state = get();
        console.log("[AdminStore] Attempting allotment update:", {
            type: state.selectedType,
            calendarId,
            year,
            maxAllotment,
        });

        if (state.selectedType === "vacation") {
            // Delegate to vacation update function if type is vacation
            return state.updateVacationAllotment(
                calendarId,
                `${year}-01-01`,
                maxAllotment,
                userId,
                reason,
            );
        }

        // Proceed with PLD/SDV update
        set({ isLoading: true, error: null });
        try {
            const yearDate = `${year}-01-01`; // Convention for yearly PLD/SDV records
            console.log("[AdminStore] Updating PLD/SDV allotment:", {
                calendarId,
                year,
                maxAllotment,
            });

            const { data, error } = await supabase
                .from("pld_sdv_allotments")
                .upsert(
                    {
                        calendar_id: calendarId,
                        year: year, // Store the year explicitly
                        date: yearDate, // Store the conventional date key
                        max_allotment: maxAllotment,
                        is_override: true, // Marking as override since it's an admin action
                        override_by: userId,
                        override_at: new Date().toISOString(),
                        override_reason: reason,
                        updated_at: new Date().toISOString(), // Track update time
                        // created_at and created_by are handled by db defaults/triggers potentially
                    },
                    {
                        onConflict: "calendar_id,year", // Use year for conflict resolution
                        ignoreDuplicates: false,
                    },
                )
                .select()
                .single();

            if (error) throw error;

            // Refetch the updated data to refresh state and cache
            await get().fetchPldSdvAllotments(calendarId, year);

            console.log("[AdminStore] Successfully updated PLD/SDV allotment");
        } catch (error) {
            console.error("[updateAllotment - PLD/SDV] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update PLD/SDV allotment";
            set({ error: message });
            throw error; // Rethrow to signal failure to caller
        } finally {
            set({ isLoading: false });
        }
    },

    updateVacationAllotment: async (
        calendarId,
        weekStartDate,
        maxAllotment,
        userId,
        reason,
    ) => { // Accepts calendarId
        if (!calendarId || !userId) {
            throw new Error("Calendar ID and User ID are required.");
        }
        set({ isLoading: true, error: null });
        try {
            const year = parseInt(weekStartDate.split("-")[0], 10); // Ensure year is extracted correctly
            console.log(
                "[AdminStore] Updating vacation allotment for all weeks:",
                { calendarId, year, maxAllotment },
            );

            // Generate all week start dates for the given year
            const weekStartDates: string[] = [];
            const startOfYear = new Date(Date.UTC(year, 0, 1)); // Use UTC to avoid timezone issues
            const endOfYear = new Date(Date.UTC(year, 11, 31));
            let currentDate = new Date(startOfYear);

            while (currentDate <= endOfYear) {
                // Find the previous Monday (ISO week start)
                const dayOfWeek = currentDate.getUTCDay(); // 0=Sun, 1=Mon,.. 6=Sat
                const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Calculate diff to Monday
                const weekStart = new Date(
                    Date.UTC(
                        currentDate.getUTCFullYear(),
                        currentDate.getUTCMonth(),
                        currentDate.getUTCDate() + diff,
                    ),
                );

                // Only add if the week start date is within the target year
                if (weekStart.getUTCFullYear() === year) {
                    weekStartDates.push(weekStart.toISOString().split("T")[0]);
                }
                // Move to the next week
                currentDate.setUTCDate(currentDate.getUTCDate() + 7);
            }
            // Ensure uniqueness
            const uniqueWeekStartDates = [...new Set(weekStartDates)];

            // Prepare records for upsert
            const records = uniqueWeekStartDates.map((date) => ({
                calendar_id: calendarId,
                week_start_date: date,
                max_allotment: maxAllotment,
                vac_year: year,
                is_override: true, // Mark as override
                override_by: userId,
                override_at: new Date().toISOString(),
                override_reason: reason || null,
                // Let DB handle created_at/updated_at/updated_by potentially
            }));

            if (records.length === 0) {
                console.warn(
                    "[AdminStore] No week start dates generated for updateVacationAllotment, skipping upsert.",
                    { year },
                );
                return;
            }

            console.log(
                `[AdminStore] Upserting ${records.length} vacation allotment records for year ${year}`,
            );

            // Perform the bulk upsert
            const { data, error } = await supabase
                .from("vacation_allotments")
                .upsert(records, {
                    onConflict: "calendar_id,week_start_date", // Conflict based on calendar and week start
                    ignoreDuplicates: false, // Update existing records
                })
                .select(); // Select the results

            if (error) throw error;

            // Refetch the updated data for the year to refresh state and cache
            await get().fetchVacationAllotments(calendarId, year);

            console.log(
                "[AdminStore] Successfully updated vacation allotments",
            );
        } catch (error) {
            console.error("[updateVacationAllotment] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update vacation allotment";
            set({ error: message });
            throw error; // Rethrow to signal failure
        } finally {
            set({ isLoading: false });
        }
    },

    // --- Calendar CRUD (Placeholders/Basic Implementation) ---
    createCalendar: async (
        divisionId: number,
        name: string,
        description?: string,
    ): Promise<Calendar | null> => {
        try {
            const { data, error } = await supabase
                .from("calendars")
                .insert({
                    division_id: divisionId,
                    name,
                    description: description ?? null,
                    is_active: true,
                })
                .select()
                .single();

            if (error) {
                console.error("Error creating calendar:", error);
                return null;
            }

            return convertToCalendar(data);
        } catch (error) {
            console.error("Error in createCalendar:", error);
            return null;
        }
    },

    updateCalendar: async (calendarId, updates) => {
        set({ isLoading: true, error: null });
        try {
            const { error } = await supabase
                .from("calendars")
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq("id", calendarId);
            if (error) throw error;

            // Optionally refetch calendars for the division
            const calendar = Object.values(get().calendars).flat().find((c) =>
                c.id === calendarId
            );
            if (calendar) {
                const divisionName = Object.entries(get().divisionZones).find((
                    [_, zones],
                ) => zones[0]?.division_id === calendar.division_id)?.[0];
                if (divisionName) {
                    await get().fetchDivisionSettings(divisionName);
                }
            }

            return true;
        } catch (error) {
            console.error("[AdminStore] Error updating calendar:", error);
            set({ error: "Failed to update calendar" });
            return false;
        } finally {
            set({ isLoading: false });
        }
    },

    // --- State Management Logic ---
    cleanupDivisionState: (divisionId: string, divisionName: string) => { // Assuming divisionId is not directly used, but keeping signature
        console.log("[AdminStore] Cleaning up division state:", divisionName);

        // Basic cleanup: remove division-specific data
        // More sophisticated cleanup might involve checking if it's the 'lastLoadedDivision' etc.
        set((state) => {
            const { [divisionName]: _, ...restZones } = state.divisionZones;
            const { [divisionName]: __, ...restCalendars } = state.calendars;
            const newLoaded = new Set(state.loadedDivisions);
            newLoaded.delete(divisionName);
            const { [divisionName]: ___, ...restReadyMap } =
                state.isDivisionReadyMap;

            // Clear cache entries related to calendars of this division
            const calendarsToClear = state.calendars[divisionName]?.map((c) =>
                c.id
            ) || [];
            const cleanedCache = { ...state.allotmentCache };
            calendarsToClear.forEach((calId) => {
                delete cleanedCache[calId];
            });

            return {
                divisionZones: restZones,
                calendars: restCalendars,
                loadedDivisions: newLoaded,
                isDivisionReadyMap: restReadyMap,
                allotmentCache: cleanedCache,
                // Reset display state if the cleaned division was the last loaded one
                ...(state.lastLoadedDivision === divisionName && {
                    yearlyAllotments: [],
                    weeklyVacationAllotments: [],
                    pldSdvTempAllotments: {},
                    vacationTempAllotments: {},
                    selectedCalendarId: null,
                    lastLoadedDivision: null,
                }),
            };
        });

        console.log(
            "[AdminStore] Division state cleanup complete for",
            divisionName,
        );
    },

    prepareDivisionSwitch: async (fromDivision, toDivision) => {
        if (fromDivision === toDivision) {
            // If switching to the same division, just ensure it's marked as ready
            if (
                get().loadedDivisions.has(toDivision) &&
                !get().isDivisionReadyMap[toDivision]
            ) {
                console.log(
                    `[AdminStore] Re-selecting ${toDivision}, ensuring readiness.`,
                );
                // Trigger ready state potentially by re-setting calendar
                const currentCalId = get().selectedCalendarId;
                get().setSelectedCalendarId(currentCalId); // This will check cache/fetch and set ready state
            }
            return;
        }

        console.log("[AdminStore] Prepare Switch START:", {
            from: fromDivision,
            to: toDivision,
        });
        set((state) => ({
            isSwitchingDivision: true, // Mark as switching
            error: null,
            isDivisionReadyMap: {
                ...state.isDivisionReadyMap,
                [toDivision]: false,
            }, // Mark target as not ready
            selectedCalendarId: null, // Reset calendar selection immediately
            // Reset display allotments immediately
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            pldSdvTempAllotments: {},
            vacationTempAllotments: {},
        }));

        try {
            // Ensure the target division's settings (including calendars) are loaded
            const success = await get().ensureDivisionSettingsLoaded(
                toDivision,
            );

            if (!success) {
                console.error(
                    `[AdminStore] Failed to ensure division ${toDivision} settings loaded`,
                );
                throw new Error(
                    `Failed to load division ${toDivision} settings`,
                );
            }

            console.log(
                "[AdminStore] Prepare Switch - Settings Load/Ensure Complete for",
                toDivision,
                "- Ready status:",
                get().isDivisionReadyMap[toDivision],
            );

            if (!get().isDivisionReadyMap[toDivision]) {
                console.warn(
                    `[AdminStore] Prepare Switch - Division ${toDivision} still not marked as ready after ensure.`,
                );
                // Attempt to re-trigger readiness check via setSelectedCalendarId
                const finalSelectedCalId = get().selectedCalendarId;
                if (finalSelectedCalId) {
                    get().setSelectedCalendarId(finalSelectedCalId);
                } else {
                    // If still no calendar, mark as ready
                    set((state) => ({
                        isDivisionReadyMap: {
                            ...state.isDivisionReadyMap,
                            [toDivision]: true,
                        },
                    }));
                }
            }

            set({ isSwitchingDivision: false }); // Mark switch as complete
            console.log("[AdminStore] Prepare Switch END - Ready:", toDivision);
        } catch (error) {
            console.error("[AdminStore] Prepare Switch ERROR:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to switch divisions";
            set((state) => ({
                error: message,
                isSwitchingDivision: false, // Ensure switching is false on error
                isZonesLoading: false,
                isCalendarsLoading: false,
                selectedCalendarId: null, // Ensure calendar is null on error
                isDivisionReadyMap: {
                    ...state.isDivisionReadyMap,
                    [toDivision]: false,
                }, // Ensure target is marked not ready
            }));
        }
    },

    validateDivisionState: (divisionName: string) => {
        const state = get();
        if (!state.loadedDivisions.has(divisionName)) {
            console.error(
                "[AdminStore] Validation Fail: Division settings not loaded:",
                divisionName,
            );
            return false;
        }
        if (!state.calendars[divisionName]) {
            console.error(
                "[AdminStore] Validation Fail: Calendars not loaded for division:",
                divisionName,
            );
            return false;
        }
        // Add more checks if needed (e.g., ensure a calendar is selected if calendars exist)
        return true;
    },

    loading(state: { calendarId?: string | null }) {
        const { isAllotmentsLoading, isDivisionLoading, isLoading } = get();
        if (!state || !state.calendarId) {
            return { isLoading: false };
        }
        return {
            isLoading: false,
            isDivisionLoading: false,
        };
    },

    // New function for PLD/SDV range updates
    updatePldSdvRangeOverride: async (
        calendarId,
        startDate,
        endDate,
        maxAllotment,
        userId,
        reason,
    ) => {
        if (!calendarId || !startDate || !endDate || !userId) {
            console.error(
                "[AdminStore] Missing required parameters for updatePldSdvRangeOverride",
            );
            throw new Error(
                "Calendar ID, start date, end date, and user ID are required.",
            );
        }

        set({ isLoading: true, error: null });
        try {
            console.log("[AdminStore] Updating PLD/SDV range:", {
                calendarId,
                startDate,
                endDate,
                maxAllotment,
            });

            // Call the bulk update RPC function properly typed
            const { data, error } = await supabase.rpc(
                "bulk_update_pld_sdv_range",
                {
                    p_calendar_id: calendarId,
                    p_start_date: startDate,
                    p_end_date: endDate,
                    p_max_allotment: maxAllotment,
                    p_user_id: userId,
                    p_reason: reason || undefined,
                },
            );

            if (error) throw error;

            console.log("[AdminStore] PLD/SDV range update result:", data);

            if (!data || !Array.isArray(data) || data.length === 0) {
                return null;
            }

            // Extract the first row which contains our results
            const result = data[0] as {
                affected_count: number;
                start_date: string;
                end_date: string;
            };

            // Determine which years were affected by the update
            const startYear = new Date(startDate).getFullYear();
            const endYear = new Date(endDate).getFullYear();

            // Refetch allotments for each affected year
            for (let year = startYear; year <= endYear; year++) {
                await get().fetchPldSdvAllotments(calendarId, year);
            }

            return {
                affectedCount: result.affected_count,
                startDate: result.start_date,
                endDate: result.end_date,
            };
        } catch (error) {
            console.error("[updatePldSdvRangeOverride] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update date range for PLD/SDV allotments";
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    // New function for Vacation range updates
    updateVacationRangeOverride: async (
        calendarId,
        startDate,
        endDate,
        maxAllotment,
        userId,
        reason,
    ) => {
        if (!calendarId || !startDate || !endDate || !userId) {
            console.error(
                "[AdminStore] Missing required parameters for updateVacationRangeOverride",
            );
            throw new Error(
                "Calendar ID, start date, end date, and user ID are required.",
            );
        }

        set({ isLoading: true, error: null });
        try {
            console.log("[AdminStore] Updating Vacation range:", {
                calendarId,
                startDate,
                endDate,
                maxAllotment,
            });

            // Call the bulk update RPC function properly typed
            const { data, error } = await supabase.rpc(
                "bulk_update_vacation_range",
                {
                    p_calendar_id: calendarId,
                    p_start_date: startDate,
                    p_end_date: endDate,
                    p_max_allotment: maxAllotment,
                    p_user_id: userId,
                    p_reason: reason || undefined,
                },
            );

            if (error) throw error;

            console.log("[AdminStore] Vacation range update result:", data);

            if (!data || !Array.isArray(data) || data.length === 0) {
                return null;
            }

            // Extract the first row which contains our results
            const result = data[0] as {
                affected_count: number;
                start_date: string;
                end_date: string;
            };

            // Determine which years were affected by the update
            const startYear = new Date(startDate).getFullYear();
            const endYear = new Date(endDate).getFullYear();

            // Refetch allotments for each affected year
            for (let year = startYear; year <= endYear; year++) {
                await get().fetchVacationAllotments(calendarId, year);
            }

            return {
                affectedCount: result.affected_count,
                startDate: result.start_date,
                endDate: result.end_date,
            };
        } catch (error) {
            console.error("[updateVacationRangeOverride] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update date range for vacation allotments";
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    // New action for fetching vacation weeks
    fetchVacationAllotmentWeeks: async (calendarId: string, year: number) => {
        if (!calendarId || !year) {
            console.warn(
                "[AdminCalendarStore] Missing calendarId or year for fetching vacation weeks.",
            );
            return;
        }

        set({ isLoadingVacationAllotmentWeeks: true, error: null });

        try {
            const { data, error } = await supabase
                .from("vacation_allotments")
                .select("week_start_date")
                .eq("calendar_id", calendarId)
                .eq("vac_year", year)
                .order("week_start_date", { ascending: true });

            if (error) throw error;

            // Ensure data is an array of objects with week_start_date
            const weeks = (data || [])
                .filter((item) =>
                    item && typeof item.week_start_date === "string"
                )
                .map((item) => ({ week_start_date: item.week_start_date }));

            set((state) => ({
                vacationAllotmentWeeks: {
                    ...state.vacationAllotmentWeeks,
                    [calendarId]: {
                        ...state.vacationAllotmentWeeks[calendarId],
                        [year]: weeks,
                    },
                },
                isLoadingVacationAllotmentWeeks: false,
            }));
        } catch (error) {
            console.error(
                "[AdminCalendarStore] Error fetching vacation allotment weeks:",
                error,
            );
            set({
                isLoadingVacationAllotmentWeeks: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch vacation weeks",
            });
        }
    },

    // New actions for time off management
    setSelectedTimeOffYear: (year: TimeOffYearType) => {
        set({ selectedTimeOffYear: year });
    },

    fetchMemberTimeOffData: async (divisionId: number) => {
        set({ isTimeOffLoading: true, timeOffError: null });
        try {
            // Reset any existing changes first
            get().resetTimeOffChanges();

            // Fetch members for the division with status="ACTIVE" (case sensitive)
            // Sort by wc_sen_roster primarily, and then by last_name as a fallback
            const { data: members, error } = await supabase
                .from("members")
                .select("*")
                .eq("division_id", divisionId)
                .eq("status", "ACTIVE")
                .order("wc_sen_roster", { ascending: true, nullsFirst: false }) // Sort by seniority, null values last
                .order("last_name", { ascending: true }); // Fallback to last_name if wc_sen_roster is null or equal

            if (error) {
                throw new Error(
                    `Error fetching member time off data: ${error.message}`,
                );
            }

            console.log(
                "Fetched members with ordering:",
                members.map((m) => ({
                    pin: m.pin_number,
                    name: `${m.first_name} ${m.last_name}`,
                    seniority: m.wc_sen_roster,
                })),
            );

            // Calculate derived fields and format data
            const membersWithTimeOff: Record<number, Member> = {};
            const membersDataArray: Member[] = []; // Array to preserve original order

            // Current and next year dates for calculations
            const currentDate = new Date();
            const nextYearDate = new Date();
            nextYearDate.setFullYear(currentDate.getFullYear() + 1);

            for (const member of members) {
                if (!member.company_hire_date) {
                    // Skip member if no company hire date
                    continue;
                }

                // Calculate vacation weeks based on company hire date if not already set
                const currVacationWeeks = member.curr_vacation_weeks !== null &&
                        member.curr_vacation_weeks !== undefined
                    ? member.curr_vacation_weeks
                    : calculateVacationWeeks(
                        member.company_hire_date,
                        currentDate,
                    );

                const nextVacationWeeks = member.next_vacation_weeks !== null &&
                        member.next_vacation_weeks !== undefined
                    ? member.next_vacation_weeks
                    : calculateVacationWeeks(
                        member.company_hire_date,
                        nextYearDate,
                    );

                // Calculate max_plds if not already set
                const maxPlds =
                    member.max_plds !== null && member.max_plds !== undefined
                        ? member.max_plds
                        : calculatePLDs(member.company_hire_date, currentDate);

                // Format member data
                const formattedMember: Member = {
                    pin_number: member.pin_number,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    company_hire_date: member.company_hire_date,
                    curr_vacation_weeks: currVacationWeeks,
                    next_vacation_weeks: nextVacationWeeks,
                    curr_vacation_split: member.curr_vacation_split ?? 0,
                    next_vacation_split: member.next_vacation_split ?? 0,
                    sdv_entitlement: member.sdv_entitlement ?? 0,
                    sdv_election: member.sdv_election ?? 0,
                    max_plds: maxPlds,
                    division_id: member.division_id,
                    wc_sen_roster: member.wc_sen_roster,
                };

                // Add to both record and array
                membersWithTimeOff[member.pin_number] = formattedMember;
                membersDataArray.push(formattedMember);
            }

            // Set both the record (for lookup by PIN) and array (for preserving order)
            set({
                memberTimeOffData: membersWithTimeOff,
                memberTimeOffDataArray: membersDataArray,
            });
        } catch (error) {
            console.error("Error fetching member time off data:", error);
            set({
                timeOffError: "Failed to load member data. Please try again.",
            });
        } finally {
            set({ isTimeOffLoading: false });
        }
    },

    setTimeOffChange: (pinNumber: number, field: string, value: any) => {
        set((state) => {
            const currentChanges = state.timeOffChanges[pinNumber] || {};

            return {
                timeOffChanges: {
                    ...state.timeOffChanges,
                    [pinNumber]: {
                        ...currentChanges,
                        [field]: value,
                    },
                },
            };
        });
    },

    resetTimeOffChanges: () => {
        set({ timeOffChanges: {} });
    },

    calculateAndUpdateSDVs: (
        pinNumber: number,
        vacationSplit: number,
        year: TimeOffYearType,
    ) => {
        const { setTimeOffChange } = get();

        // Each split week provides 6 SDVs
        const sdvs = vacationSplit * 6;

        // Update the corresponding SDV field based on the year
        if (year === "current") {
            setTimeOffChange(pinNumber, "sdv_entitlement", sdvs);
        } else {
            setTimeOffChange(pinNumber, "sdv_election", sdvs);
        }
    },

    updateMemberTimeOff: async (
        changes: Array<{
            pin_number: number;
            [key: string]: any;
        }>,
        year: TimeOffYearType,
    ) => {
        try {
            set({ isTimeOffLoading: true, timeOffError: null });
            const { memberTimeOffData } = get();

            // Process changes for each member
            for (const change of changes) {
                const { pin_number, ...fields } = change;
                const memberData = memberTimeOffData[pin_number];

                if (!memberData) {
                    console.error(
                        `Member with PIN ${pin_number} not found in state`,
                    );
                    continue;
                }

                // Prepare all fields that need to be saved
                const fieldsToUpdate: Record<string, any> = { ...fields };

                // Ensure we're storing the vacation weeks values
                if (year === "current") {
                    // Always save current year values when we're working on current year
                    if (fieldsToUpdate.curr_vacation_split !== undefined) {
                        // Calculate weeks to bid and ensure it's stored
                        const vacationWeeks =
                            fieldsToUpdate.curr_vacation_weeks !== undefined
                                ? fieldsToUpdate.curr_vacation_weeks
                                : memberData.curr_vacation_weeks;

                        // Make sure curr_vacation_weeks is included in the update
                        if (fieldsToUpdate.curr_vacation_weeks === undefined) {
                            fieldsToUpdate.curr_vacation_weeks = vacationWeeks;
                        }
                    }
                } else {
                    // Always save next year values when we're working on next year
                    if (fieldsToUpdate.next_vacation_split !== undefined) {
                        // Calculate weeks to bid and ensure it's stored
                        const vacationWeeks =
                            fieldsToUpdate.next_vacation_weeks !== undefined
                                ? fieldsToUpdate.next_vacation_weeks
                                : memberData.next_vacation_weeks;

                        // Make sure next_vacation_weeks is included in the update
                        if (fieldsToUpdate.next_vacation_weeks === undefined) {
                            fieldsToUpdate.next_vacation_weeks = vacationWeeks;
                        }
                    }
                }

                console.log(
                    `Updating member ${pin_number} with fields:`,
                    fieldsToUpdate,
                );

                // Update the member record
                const { error: updateError } = await supabase
                    .from("members")
                    .update(fieldsToUpdate)
                    .eq("pin_number", pin_number);

                if (updateError) {
                    throw updateError;
                }
            }

            // Reset changes and refresh data
            set((state) => {
                // Create updated memberTimeOffData
                const updatedMemberData = {
                    ...state.memberTimeOffData,
                    ...changes.reduce((acc, change) => {
                        const member =
                            state.memberTimeOffData[change.pin_number];
                        if (member) {
                            acc[change.pin_number] = { ...member, ...change };
                        }
                        return acc;
                    }, {} as Record<number, Member>),
                };

                // Update the array to maintain the same order
                const updatedMemberArray = state.memberTimeOffDataArray.map(
                    (member) => {
                        const change = changes.find((c) =>
                            c.pin_number === member.pin_number
                        );
                        if (change) {
                            return { ...member, ...change };
                        }
                        return member;
                    },
                );

                return {
                    timeOffChanges: {},
                    memberTimeOffData: updatedMemberData,
                    memberTimeOffDataArray: updatedMemberArray,
                };
            });

            return true;
        } catch (error) {
            console.error("Error updating member time off data:", error);
            set({ timeOffError: "Failed to save changes. Please try again." });
            return false;
        } finally {
            set({ isTimeOffLoading: false });
        }
    },

    updateSingleMemberTimeOff: async (
        pinNumber: number,
        fields: Record<string, any>,
        year: TimeOffYearType,
    ) => {
        try {
            const { memberTimeOffData, timeOffChanges } = get();

            // Check if the member exists
            const memberData = memberTimeOffData[pinNumber];
            if (!memberData) {
                console.error(
                    `Member with PIN ${pinNumber} not found in state`,
                );
                return false;
            }

            // Prepare fields to update
            const fieldsToUpdate: Record<string, any> = { ...fields };

            // Ensure we're storing the vacation weeks values
            if (year === "current") {
                // Always save current year values when we're working on current year
                if (fieldsToUpdate.curr_vacation_split !== undefined) {
                    // Calculate weeks to bid and ensure it's stored
                    const vacationWeeks =
                        fieldsToUpdate.curr_vacation_weeks !== undefined
                            ? fieldsToUpdate.curr_vacation_weeks
                            : memberData.curr_vacation_weeks;

                    // Make sure curr_vacation_weeks is included in the update
                    if (fieldsToUpdate.curr_vacation_weeks === undefined) {
                        fieldsToUpdate.curr_vacation_weeks = vacationWeeks;
                    }
                }
            } else {
                // Always save next year values when we're working on next year
                if (fieldsToUpdate.next_vacation_split !== undefined) {
                    // Calculate weeks to bid and ensure it's stored
                    const vacationWeeks =
                        fieldsToUpdate.next_vacation_weeks !== undefined
                            ? fieldsToUpdate.next_vacation_weeks
                            : memberData.next_vacation_weeks;

                    // Make sure next_vacation_weeks is included in the update
                    if (fieldsToUpdate.next_vacation_weeks === undefined) {
                        fieldsToUpdate.next_vacation_weeks = vacationWeeks;
                    }
                }
            }

            console.log(
                `Updating single member ${pinNumber} with fields:`,
                fieldsToUpdate,
            );

            // Update the member record in the database
            const { error: updateError } = await supabase
                .from("members")
                .update(fieldsToUpdate)
                .eq("pin_number", pinNumber);

            if (updateError) {
                throw updateError;
            }

            // Update only this member in the state without resetting all changes
            set((state) => {
                // Update the member in the lookup object
                const updatedMemberData = {
                    ...state.memberTimeOffData,
                    [pinNumber]: {
                        ...state.memberTimeOffData[pinNumber],
                        ...fieldsToUpdate,
                    },
                };

                // Update the member in the array
                const updatedMemberArray = state.memberTimeOffDataArray.map(
                    (member) => {
                        if (member.pin_number === pinNumber) {
                            return { ...member, ...fieldsToUpdate };
                        }
                        return member;
                    },
                );

                // Create a new timeOffChanges object without this member's changes
                const newTimeOffChanges = { ...state.timeOffChanges };
                delete newTimeOffChanges[pinNumber];

                return {
                    memberTimeOffData: updatedMemberData,
                    memberTimeOffDataArray: updatedMemberArray,
                    timeOffChanges: newTimeOffChanges,
                };
            });

            return true;
        } catch (error) {
            console.error(`Error updating member ${pinNumber}:`, error);
            set({
                timeOffError:
                    `Failed to save changes for member ${pinNumber}. Please try again.`,
            });
            return false;
        }
    },
}));

// Ensure existing exports remain
export type {
    AdminCalendarManagementState,
    AllotmentType,
    BulkUpdateResult,
    Calendar,
    Member,
    PldSdvAllotment,
    VacationAllotment,
    WeeklyVacationAllotment,
    YearlyAllotment,
};

// Export the PLD calculation function so it can be used in other components
export { calculatePLDs };

// Add this function to calculate vacation weeks based on company hire date
function calculateVacationWeeks(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) {
        return 0; // Default value if no hire date is provided
    }

    const hireDate = new Date(companyHireDate);

    // Create a date for the end of the reference year
    const endOfYear = new Date(referenceDate.getFullYear(), 11, 31);

    // Calculate years of service as of the end of the reference year
    // This ensures the employee gets the higher entitlement for the entire calendar year
    // if their anniversary falls within that year
    let yearsOfService = endOfYear.getFullYear() - hireDate.getFullYear();

    // Adjust if hire date's month & day is after Dec 31
    if (
        hireDate.getMonth() > 11 ||
        (hireDate.getMonth() === 11 && hireDate.getDate() > 31)
    ) {
        yearsOfService--;
    }

    // Apply vacation week rules
    if (yearsOfService < 2) return 1;
    if (yearsOfService < 5) return 2;
    if (yearsOfService < 14) return 3;
    if (yearsOfService < 23) return 4;
    return 5;
}

// Add this function to calculate PLDs based on years of service
function calculatePLDs(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) {
        return 0; // Default value if no hire date is provided
    }

    const hireDate = new Date(companyHireDate);

    // Create a date for the end of the reference year
    const endOfYear = new Date(referenceDate.getFullYear(), 11, 31);

    // Calculate years of service as of the end of the reference year
    // This ensures the employee gets the higher entitlement for the entire calendar year
    // if their anniversary falls within that year
    let yearsOfService = endOfYear.getFullYear() - hireDate.getFullYear();

    // Adjust if hire date's month & day is after Dec 31
    if (
        hireDate.getMonth() > 11 ||
        (hireDate.getMonth() === 11 && hireDate.getDate() > 31)
    ) {
        yearsOfService--;
    }

    // Apply PLD rules
    if (yearsOfService < 3) return 5;
    if (yearsOfService < 6) return 8;
    if (yearsOfService < 10) return 11;
    return 13;
}
