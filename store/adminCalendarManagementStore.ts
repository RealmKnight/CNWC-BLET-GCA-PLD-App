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

    // State from calendarAdminStore
    yearlyAllotments: YearlyAllotment[];
    tempAllotments: Record<number, string>; // Temporary input values for yearly allotments
    selectedType: AllotmentType; // "pld_sdv" or "vacation"

    // New state moved from CalendarManager local state
    usesZoneCalendars: boolean;
    selectedZoneId: number | null;

    // Shared state
    isLoading: boolean;
    error: string | null;

    // New state for tracking loaded settings
    loadedDivisions: Set<string>; // Track loaded divisions

    // New state for vacation allotments
    weeklyVacationAllotments: WeeklyVacationAllotment[];

    // Actions
    setError: (error: string | null) => void;
    setIsLoading: (isLoading: boolean) => void;

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
    setTempAllotments: (
        updater:
            | Record<number, string>
            | ((prev: Record<number, string>) => Record<number, string>),
    ) => void;
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

    // REMOVE Actions for Zone Calendars
    // fetchZoneCalendars: (divisionId: number) => Promise<void>;
    // createZoneCalendar: (calendarData: Omit<ZoneCalendar, 'id' | 'current_requests'>) => Promise<void>;
    // updateZoneCalendar: (calendarData: ZoneCalendar) => Promise<void>;
    // deleteZoneCalendar: (calendarId: number) => Promise<void>;
    // validateCalendarDates: (startDate: string, endDate: string) => boolean;
    // hasOverlappingCalendars: (zoneId, startDate, endDate, excludeCalendarId) => boolean;
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
    tempAllotments: {},
    selectedType: "pld_sdv",
    usesZoneCalendars: false,
    selectedZoneId: null,
    isLoading: false,
    error: null,
    loadedDivisions: new Set<string>(), // Initialize set
    weeklyVacationAllotments: [],

    // Simple Setters
    setError: (error) => set({ error }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setSelectedType: (type) => set({ selectedType: type }),
    setUsesZoneCalendars: (usesZones) => set({ usesZoneCalendars: usesZones }),
    setSelectedZoneId: (zoneId) => {
        console.log(
            "[AdminCalendarManagementStore] Setting selectedZoneId:",
            zoneId,
        );
        set({ selectedZoneId: zoneId });
        get().resetAllotments(); // Reset allotments when zone selection changes
        // Fetch allotments AND zone calendars for the selected zone
        const division = useUserStore.getState().division; // Need division context
        const currentYear = new Date().getFullYear();
        if (zoneId !== null && division) {
            get().fetchAllotments(division, currentYear, zoneId);
            get().fetchAllotments(division, currentYear + 1, zoneId);
            // No need to call fetchZoneCalendars here again, it's fetched at division level
        } else if (zoneId === null && division && !get().usesZoneCalendars) {
            // If zone deselected AND division doesn't use zones, fetch division-wide
            get().fetchAllotments(division, currentYear);
            get().fetchAllotments(division, currentYear + 1);
        }
    },
    setTempAllotments: (updater) => {
        if (typeof updater === "function") {
            set((state) => ({ tempAllotments: updater(state.tempAllotments) }));
        } else {
            set({ tempAllotments: updater });
        }
    },
    resetAllotments: () =>
        set({
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            tempAllotments: {},
        }),

    // Fetch Division Settings (modified to return Promise and update loadedDivisions)
    fetchDivisionSettings: async (division) => {
        if (!division) return Promise.resolve(); // Return resolved promise if no division

        set({ isLoading: true, error: null });
        let divisionId: number | null = null;

        try {
            console.log(
                `[AdminStore] Fetching settings for division ${division}`,
            );
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
                // If not using zones or no zones exist, clear selection and fetch division-wide allotments
                get().setSelectedZoneId(null);
                get().resetAllotments();
                await get().fetchAllotments(division, new Date().getFullYear());
                await get().fetchAllotments(
                    division,
                    new Date().getFullYear() + 1,
                );
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
            set({ isLoading: false });
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

    // Fetch Yearly Allotments (no change needed here for this specific issue)
    fetchAllotments: async (division, year, zoneId = null) => {
        const type = get().selectedType;

        if (type === "vacation") {
            return get().fetchVacationAllotments(division, year, zoneId);
        }

        if (!division) {
            console.warn(
                "[AdminStore] fetchAllotments called without division.",
            );
            return;
        }
        // Avoid fetching if already loading, unless forced? For now, allow concurrent fetches for different years/zones.
        // set({ isLoading: true }); // Consider more granular loading state if needed
        set({ error: null }); // Clear previous errors

        const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

        console.log("[AdminStore] Fetching allotments for:", {
            division,
            year,
            zoneId: effectiveZoneId,
            usesZoneCalendars: get().usesZoneCalendars,
        });

        if (get().usesZoneCalendars && effectiveZoneId === null) {
            console.log(
                "[AdminStore] Zone calendars enabled, but no zone selected. Skipping allotment fetch.",
            );
            // Don't set loading false here, might be loading zones
            get().resetAllotments(); // Clear stale data
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

            const { data, error } = await query.maybeSingle(); // Expect 0 or 1 row

            if (error) throw error;

            const newAllotment: YearlyAllotment = {
                year: year,
                max_allotment: data?.max_allotment ?? 0, // Default to 0 if no record found
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

                // Update tempAllotments only if it doesn't exist or differs
                const currentTemp = state.tempAllotments[year];
                const newMaxValue = newAllotment.max_allotment.toString();
                let updatedTempAllotments = state.tempAllotments;

                if (
                    currentTemp === undefined || currentTemp === null ||
                    currentTemp !== newMaxValue
                ) {
                    updatedTempAllotments = {
                        ...state.tempAllotments,
                        [year]: newMaxValue,
                    };
                }

                return {
                    yearlyAllotments: updatedAllotments,
                    tempAllotments: updatedTempAllotments,
                };
            });
        } catch (error) {
            console.error(
                `[AdminStore] Error fetching allotment for ${year}:`,
                error,
            );
            set({ error: `Failed to fetch allotment for ${year}` });
        } finally {
            // set({ isLoading: false }); // Consider granular loading
        }
    },

    // Fetch Vacation Allotments
    fetchVacationAllotments: async (
        division: string,
        year: number,
        zoneId?: number | null,
    ) => {
        if (!division) {
            console.warn(
                "[AdminStore] fetchVacationAllotments called without division.",
            );
            return;
        }

        set({ isLoading: true, error: null });
        const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

        console.log("[AdminStore] Fetching vacation allotments for:", {
            division,
            year,
            zoneId: effectiveZoneId,
            usesZoneCalendars: get().usesZoneCalendars,
        });

        if (get().usesZoneCalendars && effectiveZoneId === null) {
            console.log(
                "[AdminStore] Zone calendars enabled, but no zone selected. Skipping vacation allotment fetch.",
            );
            get().resetAllotments(); // Clear stale data
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
                // Set tempAllotments to the first week's allotment as a starting point
                tempAllotments: {
                    ...state.tempAllotments,
                    [year]: data?.[0]?.max_allotment?.toString() || "0",
                },
            }));
        } catch (error) {
            console.error("[fetchVacationAllotments] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to fetch vacation allotments";
            set({ error: message });
        } finally {
            set({ isLoading: false });
        }
    },

    // Update/Insert Yearly Allotment (no change needed here for this specific issue)
    updateAllotment: async (
        division: string,
        year: number,
        maxAllotment: number,
        userId: string,
        zoneId?: number | null,
        reason?: string,
    ) => {
        const type = get().selectedType;

        if (type === "vacation") {
            // For vacation type, we'll need a week start date
            const today = new Date();
            const weekStartDate =
                new Date(today.setDate(today.getDate() - today.getDay()))
                    .toISOString().split("T")[0];
            return get().updateVacationAllotment(
                division,
                weekStartDate,
                maxAllotment,
                userId,
                zoneId,
                reason,
            );
        }

        set({ isLoading: true, error: null });
        try {
            const { data, error } = await supabase
                .from("yearly_allotments")
                .upsert({
                    division,
                    year,
                    max_allotment: maxAllotment,
                    zone_id: zoneId,
                    is_override: true,
                    override_by: userId,
                    override_at: new Date().toISOString(),
                    override_reason: reason,
                })
                .select()
                .single();

            if (error) throw error;

            set((state) => ({
                yearlyAllotments: [
                    ...state.yearlyAllotments.filter((a) => a.year !== year),
                    data,
                ],
                tempAllotments: {
                    ...state.tempAllotments,
                    [year]: maxAllotment.toString(),
                },
            }));
        } catch (error) {
            console.error("[updateAllotment] Error:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update allotment";
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
                "Division and User ID are required to update allotment.",
            );
        }

        set({ isLoading: true, error: null });
        try {
            const year = new Date(weekStartDate).getFullYear();
            const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

            // Build the query
            let query = supabase
                .from("vacation_allotments")
                .update({
                    max_allotment: maxAllotment,
                    updated_at: new Date().toISOString(),
                    updated_by: userId,
                    is_override: true,
                    override_at: new Date().toISOString(),
                    override_by: userId,
                    override_reason: reason || null,
                })
                .eq("division", division)
                .eq("vac_year", year);

            // Handle zone_id filtering
            if (effectiveZoneId !== null) {
                query = query.eq("zone_id", effectiveZoneId);
            } else {
                query = query.is("zone_id", null);
            }

            const { data, error } = await query.select();

            if (error) throw error;

            set((state) => ({
                weeklyVacationAllotments: data || [],
                tempAllotments: {
                    ...state.tempAllotments,
                    [year]: maxAllotment.toString(),
                },
            }));

            console.log(
                "[AdminStore] Successfully updated vacation allotments for year:",
                {
                    year,
                    division,
                    zoneId: effectiveZoneId,
                    maxAllotment,
                    updatedCount: data?.length || 0,
                },
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
}));
