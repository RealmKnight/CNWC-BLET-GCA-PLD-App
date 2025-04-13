import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { Alert, Platform } from "react-native";
import { isValid, parseISO } from "date-fns";
import { useUserStore } from "@/store/userStore";
import { Zone } from "@/types/calendar";

interface YearlyAllotment {
    year: number;
    max_allotment: number;
    is_override?: boolean | null;
    override_by?: string | null;
    override_at?: string | null;
    override_reason?: string | null;
}

interface WeeklyVacationAllotment {
    id: string;
    division: string;
    week_start_date: string;
    max_allotment: number;
    current_requests: number;
    vac_year: number;
    zone_id?: number | null;
    updated_at?: string;
    updated_by?: string;
}

type AllotmentType = "pld_sdv" | "vacation";

interface AdminCalendarManagementState {
    // State from zoneCalendarStore
    divisionsWithZones: Record<string, number[]>;
    zones: Record<string, Zone[]>; // Store zones per division

    // Enhanced loading states
    isDivisionLoading: boolean;
    isAllotmentsLoading: boolean;
    isZonesLoading: boolean;
    currentLoadingDivision: string | null;
    lastLoadedDivision: string | null;

    // State for PLD/SDV allotments
    yearlyAllotments: YearlyAllotment[];
    pldSdvTempAllotments: Record<number, string>;

    // State for vacation allotments
    weeklyVacationAllotments: WeeklyVacationAllotment[];
    vacationTempAllotments: Record<number, string>;

    selectedType: AllotmentType;

    // New state moved from CalendarManager local state
    usesZoneCalendars: boolean;
    selectedZoneId: number | null;

    // Shared state
    isLoading: boolean;
    error: string | null;

    // New state for tracking loaded settings
    loadedDivisions: Set<string>;

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
    setTempAllotments: (
        updater:
            | Record<number, string>
            | ((prev: Record<number, string>) => Record<number, string>),
    ) => void;

    // Actions related to zones and division settings
    fetchDivisionSettings: (division: string) => Promise<void>;
    fetchZones: (division: string) => Promise<void>;
    setUsesZoneCalendars: (usesZones: boolean) => void; // Primarily for local updates after toggle
    setSelectedZoneId: (zoneId: number | null) => void;
    toggleZoneCalendars: (
        division: string,
        currentStatus: boolean,
    ) => Promise<void>;
    ensureDivisionSettingsLoaded: (division: string) => Promise<void>; // New action to ensure settings are loaded

    // Actions related to allotments (from calendarAdminStore)
    setSelectedType: (type: AllotmentType) => void;
    fetchAllotments: (
        division: string,
        year: number,
        zoneId?: number | null,
    ) => Promise<void>;
    updateAllotment: (
        division: string,
        year: number,
        maxAllotment: number,
        userId: string,
        zoneId?: number | null,
        reason?: string,
    ) => Promise<void>;
    fetchPldSdvAllotments: (
        division: string,
        year: number,
        zoneId?: number | null,
    ) => Promise<void>;
    fetchVacationAllotments: (
        division: string,
        year: number,
        zoneId?: number | null,
    ) => Promise<void>;
    updateVacationAllotment: (
        division: string,
        weekStartDate: string,
        maxAllotment: number,
        userId: string,
        zoneId?: number | null,
        reason?: string,
    ) => Promise<void>;
    resetAllotments: () => void; // Reset allotments when scope changes

    // New actions
    cleanupDivisionState: (
        division: string,
        preserveZoneId?: number | null,
    ) => void;
    prepareDivisionSwitch: (
        fromDivision: string,
        toDivision: string,
    ) => Promise<void>;
    validateDivisionState: (division: string) => boolean;
}

// Keep track of ongoing fetches outside the store state
const divisionLoadPromises = new Map<string, Promise<void>>();

export const useAdminCalendarManagementStore = create<
    AdminCalendarManagementState
>((set, get) => ({
    // Initial state
    divisionsWithZones: {},
    zones: {},
    yearlyAllotments: [],
    pldSdvTempAllotments: {},
    selectedType: "pld_sdv" as AllotmentType,
    usesZoneCalendars: false,
    selectedZoneId: null,
    isLoading: false,
    error: null,
    loadedDivisions: new Set<string>(),
    weeklyVacationAllotments: [],
    vacationTempAllotments: {},

    // New loading states
    isDivisionLoading: false,
    isAllotmentsLoading: false,
    isZonesLoading: false,
    currentLoadingDivision: null,
    lastLoadedDivision: null,

    // Simple Setters
    setError: (error) => set({ error }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setSelectedType: (type) => {
        console.log("[AdminStore] Setting selected type:", type);
        set({ selectedType: type });
    },
    setUsesZoneCalendars: (usesZones) => set({ usesZoneCalendars: usesZones }),
    setSelectedZoneId: (zoneId) => {
        console.log(
            "[AdminCalendarManagementStore] Setting selectedZoneId:",
            zoneId,
        );
        const prevZoneId = get().selectedZoneId;
        const division = useUserStore.getState().division;

        // Only reset and refetch if actually changing zones
        if (prevZoneId !== zoneId) {
            set({ selectedZoneId: zoneId });
            get().resetAllotments(); // Reset allotments when zone selection changes

            // Fetch allotments for the new zone if we have a division
            if (division) {
                const currentYear = new Date().getFullYear();
                if (zoneId !== null && get().usesZoneCalendars) {
                    get().fetchAllotments(division, currentYear, zoneId);
                    get().fetchAllotments(division, currentYear + 1, zoneId);
                } else if (zoneId === null && !get().usesZoneCalendars) {
                    get().fetchAllotments(division, currentYear);
                    get().fetchAllotments(division, currentYear + 1);
                }
            }
        }
    },
    setPldSdvTempAllotments: (updater) => {
        if (typeof updater === "function") {
            set((state) => ({
                pldSdvTempAllotments: updater(state.pldSdvTempAllotments),
            }));
        } else {
            set({ pldSdvTempAllotments: updater });
        }
    },
    setVacationTempAllotments: (updater) => {
        if (typeof updater === "function") {
            set((state) => ({
                vacationTempAllotments: updater(state.vacationTempAllotments),
            }));
        } else {
            set({ vacationTempAllotments: updater });
        }
    },
    setTempAllotments: (updater) => {
        const type = get().selectedType;
        if (type === "vacation") {
            get().setVacationTempAllotments(updater);
        } else {
            get().setPldSdvTempAllotments(updater);
        }
    },
    resetAllotments: () => {
        console.log("[AdminStore] Resetting allotments state");
        const currentZoneId = get().selectedZoneId;
        set((state) => ({
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            pldSdvTempAllotments: {},
            vacationTempAllotments: {},
            // Maintain zone ID during reset unless explicitly clearing it
            selectedZoneId: currentZoneId,
        }));
    },

    // Fetch Division Settings (modified to handle state better)
    fetchDivisionSettings: async (division) => {
        if (!division) return Promise.resolve();

        set({
            isDivisionLoading: true,
            isZonesLoading: true,
            error: null,
        });
        let divisionId: number | null = null;

        try {
            console.log(
                `[AdminStore] Fetching settings for division ${division}`,
            );

            // Check if we already have settings for this division
            if (get().loadedDivisions.has(division)) {
                console.log(
                    `[AdminStore] Using cached settings for division ${division}`,
                );
                return;
            }

            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("id, uses_zone_calendars")
                .eq("name", division)
                .single();

            if (divisionError) throw divisionError;
            if (!divisionData) {
                throw new Error(`Division "${division}" not found`);
            }

            divisionId = divisionData.id;

            // Always fetch zones first, regardless of uses_zone_calendars setting
            const { data: zonesData, error: zonesError } = await supabase
                .from("zones")
                .select("id, name, division_id, created_at, updated_at")
                .eq("division_id", divisionId)
                .order("name");

            if (zonesError) throw zonesError;

            const fetchedZones = zonesData || [];
            set((state) => ({
                zones: { ...state.zones, [division]: fetchedZones },
            }));

            // Now set usesZoneCalendars based on both the division setting and zone count
            const hasSingleZone = fetchedZones.length === 1;
            const usesZones = hasSingleZone
                ? false
                : (divisionData.uses_zone_calendars || false);
            set({ usesZoneCalendars: usesZones });

            console.log(
                `[AdminStore] Division ${division} uses zones: ${usesZones}, has ${fetchedZones.length} zones`,
            );

            if (usesZones && fetchedZones.length > 0) {
                // Auto-select first zone if using zones and none selected
                if (get().selectedZoneId === null) {
                    get().setSelectedZoneId(fetchedZones[0].id);
                }
            } else {
                // If not using zones or no zones exist, clear selection
                get().setSelectedZoneId(null);
            }

            // Mark as loaded after all dependent fetches are complete
            set((state) => ({
                loadedDivisions: new Set(state.loadedDivisions).add(division),
            }));
            console.log(
                `[AdminStore] Successfully loaded settings for division ${division}`,
            );
        } catch (error) {
            console.error(
                `[AdminStore] Error fetching division settings for ${division}:`,
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to load division settings";
            set({ error: message });
        } finally {
            set({
                isDivisionLoading: false,
                isZonesLoading: false,
            });
        }
    },

    // Ensure Division Settings are Loaded (New Action)
    ensureDivisionSettingsLoaded: async (division) => {
        if (!division) return Promise.resolve();
        if (get().loadedDivisions.has(division)) {
            // console.log(`[AdminStore] ensureDivisionSettingsLoaded: Already loaded for ${division}`); // DEBUG
            return Promise.resolve();
        }

        // Check if a fetch is already in progress
        if (divisionLoadPromises.has(division)) {
            // console.log(`[AdminStore] ensureDivisionSettingsLoaded: Awaiting existing fetch for ${division}`); // DEBUG
            return divisionLoadPromises.get(division);
        }

        // Start a new fetch
        // console.log(`[AdminStore] ensureDivisionSettingsLoaded: Starting fetch for ${division}`); // DEBUG
        const fetchPromise = get().fetchDivisionSettings(division)
            .finally(() => {
                // Remove the promise from the map once it's settled (succeeded or failed)
                divisionLoadPromises.delete(division);
                // console.log(`[AdminStore] ensureDivisionSettingsLoaded: Fetch settled for ${division}`); // DEBUG
            });

        divisionLoadPromises.set(division, fetchPromise);
        return fetchPromise;
    },

    // Fetch Zones (ensure it sets isLoading false)
    fetchZones: async (division) => {
        if (!division) return;
        // Don't reset loading if fetchDivisionSettings already set it
        if (!get().isLoading) set({ isLoading: true });
        set({ error: null }); // Clear previous errors

        try {
            // Need division ID first
            const { data: divisionData, error: divisionIdError } =
                await supabase
                    .from("divisions")
                    .select("id")
                    .eq("name", division)
                    .single();

            if (divisionIdError) throw divisionIdError;
            if (!divisionData) throw new Error("Division not found");

            const { data: zonesData, error: zonesError } = await supabase
                .from("zones")
                .select("id, name, division_id, created_at, updated_at")
                .eq("division_id", divisionData.id)
                .order("name");

            if (zonesError) throw zonesError;

            const fetchedZones = zonesData || [];
            set((state) => ({
                zones: { ...state.zones, [division]: fetchedZones },
            }));

            // Auto-select the first zone if zone calendars are enabled and no zone is selected yet
            const currentSelectedZone = get().selectedZoneId;
            if (
                get().usesZoneCalendars && fetchedZones.length > 0 &&
                currentSelectedZone === null
            ) {
                console.log(
                    "[AdminCalendarManagementStore] Auto-selecting first zone:",
                    fetchedZones[0].id,
                );
                get().setSelectedZoneId(fetchedZones[0].id); // This will trigger fetchAllotments for the zone
            } else if (get().usesZoneCalendars && fetchedZones.length === 0) {
                // If zone calendars are enabled but no zones exist, clear selection
                get().setSelectedZoneId(null);
                get().resetAllotments();
            } else if (!get().usesZoneCalendars) {
                // Ensure selection is null if zone calendars are off
                get().setSelectedZoneId(null);
            }
        } catch (error) {
            console.error("[AdminStore] Error fetching zones:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to fetch zones";
            set({ error: message }); // Keep error state
        } finally {
            set({ isLoading: false }); // Ensure loading is set to false here
        }
    },

    // Toggle Zone Calendars (ensure it calls ensureDivisionSettingsLoaded if needed)
    toggleZoneCalendars: async (division, currentStatus) => {
        if (!division) return;
        set({ isLoading: true, error: null });
        const newStatus = !currentStatus;
        try {
            const { error } = await supabase
                .from("divisions")
                .update({ uses_zone_calendars: newStatus })
                .eq("name", division);

            if (error) throw error;

            set({ usesZoneCalendars: newStatus });

            if (newStatus) {
                // If enabling, fetch zones (fetchDivisionSettings might be better here)
                // Let's use ensureDivisionSettingsLoaded to handle fetching if needed
                await get().ensureDivisionSettingsLoaded(division);
            } else {
                // If disabling, clear zone selection and zones list for this division
                get().setSelectedZoneId(null);
                set((state) => ({ zones: { ...state.zones, [division]: [] } }));
                // Ensure division-wide allotments are fetched correctly
                get().resetAllotments();
                await get().fetchAllotments(division, new Date().getFullYear());
                await get().fetchAllotments(
                    division,
                    new Date().getFullYear() + 1,
                );
            }
            if (Platform.OS !== "web") {
                Alert.alert(
                    "Success",
                    `Zone-based calendars ${
                        newStatus ? "enabled" : "disabled"
                    } for ${division}`,
                );
            } else {
                alert(
                    `Zone-based calendars ${
                        newStatus ? "enabled" : "disabled"
                    } for ${division}`,
                );
            }
        } catch (error) {
            console.error("[AdminStore] Error toggling zone calendars:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update division settings";
            set({ error: message, usesZoneCalendars: currentStatus }); // Revert optimistic update on error
            if (Platform.OS !== "web") {
                Alert.alert("Error", message);
            } else {
                alert(message);
            }
        } finally {
            // Loading state depends on whether ensureDivisionSettingsLoaded was called and finished
            // We might need to re-evaluate this, but ensureDivisionSettingsLoaded handles its own loading.
            if (!divisionLoadPromises.has(division)) {
                set({ isLoading: false });
            }
        }
    },

    // Split fetchAllotments into two separate functions
    fetchPldSdvAllotments: async (
        division: string,
        year: number,
        zoneId = null,
    ) => {
        if (!division) {
            console.warn(
                "[AdminStore] fetchPldSdvAllotments called without division.",
            );
            return;
        }

        set({ isAllotmentsLoading: true, error: null });
        const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

        console.log("[AdminStore] Fetching PLD/SDV allotments:", {
            division,
            year,
            zoneId: effectiveZoneId,
        });

        if (get().usesZoneCalendars && effectiveZoneId === null) {
            console.log(
                "[AdminStore] Zone calendars enabled, but no zone selected. Skipping PLD/SDV allotment fetch.",
            );
            return;
        }

        try {
            let query = supabase
                .from("pld_sdv_allotments")
                .select(
                    "year, max_allotment, is_override, override_by, override_at, override_reason",
                )
                .eq("division", division)
                .eq("year", year);

            if (effectiveZoneId !== null) {
                query = query.eq("zone_id", effectiveZoneId);
            } else {
                query = query.is("zone_id", null);
            }

            const { data, error } = await query.maybeSingle();
            if (error) throw error;

            console.log("[AdminStore] PLD/SDV allotment result:", data);

            const newAllotment: YearlyAllotment = {
                year: year,
                max_allotment: data?.max_allotment ?? 0,
                is_override: data?.is_override ?? null,
                override_by: data?.override_by ?? null,
                override_at: data?.override_at ?? null,
                override_reason: data?.override_reason ?? null,
            };

            set((state) => {
                const existingIndex = state.yearlyAllotments.findIndex((a) =>
                    a.year === year
                );
                let updatedAllotments = [...state.yearlyAllotments];
                if (existingIndex > -1) {
                    updatedAllotments[existingIndex] = newAllotment;
                } else {
                    updatedAllotments.push(newAllotment);
                }

                return {
                    yearlyAllotments: updatedAllotments,
                    pldSdvTempAllotments: {
                        ...state.pldSdvTempAllotments,
                        [year]: newAllotment.max_allotment.toString(),
                    },
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

    fetchVacationAllotments: async (
        division: string,
        year: number,
        zoneId = null,
    ) => {
        if (!division) {
            console.warn(
                "[AdminStore] fetchVacationAllotments called without division.",
            );
            return;
        }

        set({ isAllotmentsLoading: true, error: null });
        const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

        console.log("[AdminStore] Fetching vacation allotments:", {
            division,
            year,
            zoneId: effectiveZoneId,
        });

        if (get().usesZoneCalendars && effectiveZoneId === null) {
            console.log(
                "[AdminStore] Zone calendars enabled, but no zone selected. Skipping vacation allotment fetch.",
            );
            return;
        }

        try {
            let query = supabase
                .from("vacation_allotments")
                .select("*")
                .eq("division", division)
                .eq("vac_year", year);

            if (effectiveZoneId !== null) {
                query = query.eq("zone_id", effectiveZoneId);
            } else {
                query = query.is("zone_id", null);
            }

            query = query.order("week_start_date");
            const { data, error } = await query;

            if (error) throw error;

            set((state) => ({
                weeklyVacationAllotments: data || [],
                vacationTempAllotments: {
                    ...state.vacationTempAllotments,
                    [year]: data?.[0]?.max_allotment?.toString() || "0",
                },
            }));
        } catch (error) {
            console.error(
                "[AdminStore] Error fetching vacation allotments:",
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to fetch vacation allotments";
            set({ error: message });
        } finally {
            set({ isAllotmentsLoading: false });
        }
    },

    // Keep fetchAllotments as a convenience method that calls both
    fetchAllotments: async (division: string, year: number, zoneId = null) => {
        await Promise.all([
            get().fetchPldSdvAllotments(division, year, zoneId),
            get().fetchVacationAllotments(division, year, zoneId),
        ]);
    },

    // Update/Insert Yearly Allotment for PLD/SDV only
    updateAllotment: async (
        division: string,
        year: number,
        maxAllotment: number,
        userId: string,
        zoneId?: number | null,
        reason?: string,
    ) => {
        const state = get();
        console.log("[AdminStore] Attempting allotment update:", {
            type: state.selectedType,
            division,
            year,
            maxAllotment,
            zoneId,
        });

        // Handle based on selected type
        if (state.selectedType === "vacation") {
            return state.updateVacationAllotment(
                division,
                `${year}-01-01`,
                maxAllotment,
                userId,
                zoneId,
                reason,
            );
        }

        set({ isLoading: true, error: null });
        try {
            const yearDate = `${year}-01-01`;
            const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

            console.log("[AdminStore] Updating PLD/SDV allotment:", {
                division,
                year,
                maxAllotment,
                zoneId: effectiveZoneId,
            });

            const { data, error } = await supabase
                .from("pld_sdv_allotments")
                .upsert(
                    {
                        division,
                        year,
                        date: yearDate,
                        max_allotment: maxAllotment,
                        zone_id: effectiveZoneId,
                        is_override: true,
                        override_by: userId,
                        override_at: new Date().toISOString(),
                        override_reason: reason,
                        updated_at: new Date().toISOString(),
                        updated_by: userId,
                    },
                    {
                        onConflict: "division,year,zone_id",
                        ignoreDuplicates: false,
                    },
                )
                .select()
                .single();

            if (error) throw error;

            set((state) => ({
                yearlyAllotments: [
                    ...state.yearlyAllotments.filter((a) => a.year !== year),
                    {
                        year,
                        max_allotment: maxAllotment,
                        is_override: true,
                        override_by: userId,
                        override_at: new Date().toISOString(),
                        override_reason: reason,
                    },
                ],
                pldSdvTempAllotments: {
                    ...state.pldSdvTempAllotments,
                    [year]: maxAllotment.toString(),
                },
            }));

            console.log("[AdminStore] Successfully updated PLD/SDV allotment");
        } catch (error) {
            console.error("[updateAllotment] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update PLD/SDV allotment";
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    // Update Vacation Allotment
    updateVacationAllotment: async (
        division: string,
        weekStartDate: string,
        maxAllotment: number,
        userId: string,
        zoneId?: number | null,
        reason?: string,
    ) => {
        if (!division || !userId) {
            throw new Error(
                "Division and User ID are required to update vacation allotment.",
            );
        }

        set({ isLoading: true, error: null });
        try {
            const year = parseInt(weekStartDate.split("-")[0], 10);
            const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

            console.log("[AdminStore] Updating vacation allotment:", {
                division,
                year,
                maxAllotment,
                zoneId: effectiveZoneId,
            });

            // Generate all week start dates for the year
            const weekStartDates: string[] = [];
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year, 11, 31);
            let currentDate = startOfYear;

            while (currentDate <= endOfYear) {
                const dayOfWeek = currentDate.getDay();
                const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const weekStart = new Date(currentDate);
                weekStart.setDate(weekStart.getDate() - diff);

                if (weekStart.getFullYear() === year) {
                    weekStartDates.push(weekStart.toISOString().split("T")[0]);
                }
                currentDate.setDate(currentDate.getDate() + 7);
            }

            // Create or update records for each week
            const records = weekStartDates.map((date) => ({
                division,
                week_start_date: date,
                max_allotment: maxAllotment,
                vac_year: year,
                zone_id: effectiveZoneId,
                is_override: true,
                override_by: userId,
                override_at: new Date().toISOString(),
                override_reason: reason || null,
                updated_at: new Date().toISOString(),
                updated_by: userId,
            }));

            const { data, error } = await supabase
                .from("vacation_allotments")
                .upsert(records, {
                    onConflict: "division,week_start_date,zone_id",
                    ignoreDuplicates: false,
                })
                .select();

            if (error) throw error;

            set((state) => ({
                weeklyVacationAllotments: data || [],
                vacationTempAllotments: {
                    ...state.vacationTempAllotments,
                    [year]: maxAllotment.toString(),
                },
            }));

            console.log(
                "[AdminStore] Successfully updated vacation allotments",
            );
        } catch (error) {
            console.error("[updateVacationAllotment] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update vacation allotment";
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    // New cleanup function
    cleanupDivisionState: (
        division: string,
        preserveZoneId?: number | null,
    ) => {
        console.log("[AdminStore] Cleaning up division state:", division);

        // Don't reset state if we're just switching divisions temporarily
        if (get().loadedDivisions.has(division)) {
            console.log(
                "[AdminStore] Skipping cleanup for previously loaded division:",
                division,
            );
            return;
        }

        // Only reset zone ID if we're not preserving it
        if (!preserveZoneId) {
            set({ selectedZoneId: null });
        }

        // Reset other division-specific state
        set({
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            pldSdvTempAllotments: {},
            vacationTempAllotments: {},
        });

        console.log("[AdminStore] Division state cleanup complete");
    },

    // New division switch preparation
    prepareDivisionSwitch: async (fromDivision: string, toDivision: string) => {
        if (fromDivision === toDivision) {
            // If switching to the same division, just ensure it's loaded
            // and maintain the current zone ID
            return get().ensureDivisionSettingsLoaded(toDivision);
        }

        console.log("[AdminStore] Preparing division switch:", {
            from: fromDivision,
            to: toDivision,
        });

        // Store current state before reset
        const currentState = get();
        const shouldPreserveZoneId = currentState.usesZoneCalendars &&
            currentState.selectedZoneId !== null &&
            currentState.zones[toDivision]?.some((z) =>
                z.id === currentState.selectedZoneId
            );

        set({
            isDivisionLoading: true,
            currentLoadingDivision: toDivision,
            error: null,
            // Only reset zone ID if it's not valid in the new division
            selectedZoneId: shouldPreserveZoneId
                ? currentState.selectedZoneId
                : null,
        });

        try {
            // Don't clean up old division state, just load new division settings
            await get().ensureDivisionSettingsLoaded(toDivision);

            // Validate new state
            if (!get().validateDivisionState(toDivision)) {
                throw new Error("Division state validation failed");
            }

            set({ lastLoadedDivision: toDivision });
            console.log(
                "[AdminStore] Successfully switched to division:",
                toDivision,
                shouldPreserveZoneId ? "preserving zone ID" : "zone ID reset",
            );
        } catch (error) {
            console.error("[AdminStore] Error during division switch:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to switch divisions";
            set({ error: message });
            throw error;
        } finally {
            set({
                isDivisionLoading: false,
                currentLoadingDivision: null,
            });
        }
    },

    // New state validation
    validateDivisionState: (division: string) => {
        const state = get();

        // Check if division settings are loaded
        if (!state.loadedDivisions.has(division)) {
            console.error(
                "[AdminStore] Division settings not loaded:",
                division,
            );
            return false;
        }

        // Check if zones are loaded when needed
        if (
            state.usesZoneCalendars &&
            (!state.zones[division] || state.zones[division].length === 0)
        ) {
            console.error(
                "[AdminStore] Zones not loaded for division:",
                division,
            );
            return false;
        }

        return true;
    },
}));
