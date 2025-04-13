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

    // Add new properties for caching allotments per division
    allotmentCache: Record<string, {
        yearlyAllotments: YearlyAllotment[];
        weeklyVacationAllotments: WeeklyVacationAllotment[];
        pldSdvTempAllotments: Record<number, string>;
        vacationTempAllotments: Record<number, string>;
    }>;

    // New properties
    currentFetchingDivision: string | null;
    isSwitchingDivision: boolean;
    isDivisionReadyMap: Record<string, boolean>; // NEW: Track readiness per division

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
const allotmentFetchPromises = new Map<string, Promise<void>>();

// Helper function to generate allotment fetch key
function getAllotmentFetchKey(
    division: string,
    year: number,
    zoneId: number | null,
    type: "pld_sdv" | "vacation",
): string {
    return `${division}-${year}-${zoneId}-${type}`;
}

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

    // New properties
    currentFetchingDivision: null,
    isSwitchingDivision: false,
    allotmentCache: {},
    isDivisionReadyMap: {}, // NEW: Initialize

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
        // Use the currently loaded division from this store's state
        const currentViewedDivision = get().lastLoadedDivision;

        // Only reset and refetch if actually changing zones
        if (prevZoneId !== zoneId) {
            // Get the currently viewed division from the store's state
            // const currentViewedDivision = get().lastLoadedDivision || division; // Already defined above
            set((state) => ({
                selectedZoneId: zoneId,
                // Mark division as not ready during zone change within it
                isDivisionReadyMap: {
                    ...state.isDivisionReadyMap,
                    [String(currentViewedDivision)]: false,
                },
            }));
            get().resetAllotments(); // Reset allotments when zone selection changes

            // Fetch allotments for the new zone if we have a division
            if (currentViewedDivision) {
                const currentYear = new Date().getFullYear();
                const fetchAndMarkReady = async () => {
                    try {
                        // Set loading/not ready state
                        set((state) => ({
                            isAllotmentsLoading: true,
                            isDivisionReadyMap: {
                                ...state.isDivisionReadyMap,
                                [String(currentViewedDivision)]: false,
                            },
                        }));

                        if (zoneId !== null && get().usesZoneCalendars) {
                            await get().fetchAllotments(
                                currentViewedDivision,
                                currentYear,
                                zoneId,
                            );
                            await get().fetchAllotments(
                                currentViewedDivision,
                                currentYear + 1,
                                zoneId,
                            );
                        } else if (
                            zoneId === null && !get().usesZoneCalendars
                        ) {
                            await get().fetchAllotments(
                                currentViewedDivision,
                                currentYear,
                            );
                            await get().fetchAllotments(
                                currentViewedDivision,
                                currentYear + 1,
                            );
                        }
                        // Mark as ready ONLY after fetches complete
                        set((state) => ({
                            isAllotmentsLoading: false,
                            isDivisionReadyMap: {
                                ...state.isDivisionReadyMap,
                                [String(currentViewedDivision)]: true,
                            },
                        }));
                        console.log(
                            `[AdminStore] Marked division ${currentViewedDivision} as ready after zone change to ${zoneId}`,
                        );
                    } catch (error) {
                        console.error(
                            `[AdminStore] Error fetching allotments after zone change for ${currentViewedDivision}:`,
                            error,
                        );
                        set((state) => ({
                            isAllotmentsLoading: false,
                            error:
                                `Failed to load allotments for zone ${zoneId}`,
                            // Leave readiness as false on error?
                            // isDivisionReadyMap: { ...state.isDivisionReadyMap, [String(currentViewedDivision)]: false },
                        }));
                    }
                };
                fetchAndMarkReady();
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
        const currentState = get();
        const currentDivision = useUserStore.getState().division;

        if (!currentDivision) return;

        // Clear current division's cache
        set((state) => {
            const { [currentDivision]: _, ...restCache } = state.allotmentCache;
            return {
                yearlyAllotments: [],
                weeklyVacationAllotments: [],
                pldSdvTempAllotments: {},
                vacationTempAllotments: {},
                allotmentCache: restCache,
                selectedZoneId: currentState.selectedZoneId, // Maintain zone ID during reset
            };
        });
    },

    // Fetch Division Settings (modified to handle state better)
    fetchDivisionSettings: async (division) => {
        if (!division) return Promise.resolve();

        const currentFetching = get().currentFetchingDivision;
        if (currentFetching && currentFetching !== division) {
            console.log(
                `[AdminStore] Skipping fetch for ${division}, currently fetching ${currentFetching}`,
            );
            return;
        }

        set((state) => ({
            isDivisionLoading: true,
            isZonesLoading: true,
            error: null,
            currentFetchingDivision: division,
            isDivisionReadyMap: {
                ...state.isDivisionReadyMap,
                [division]: false,
            }, // Mark as not ready
        }));
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
                currentFetchingDivision: null,
            });
        }
    },

    // Ensure Division Settings are Loaded (New Action)
    ensureDivisionSettingsLoaded: async (division) => {
        if (!division) return Promise.resolve();

        const currentState = get();
        // Also check readiness map
        if (
            currentState.loadedDivisions.has(division) &&
            currentState.isDivisionReadyMap[division]
        ) {
            return Promise.resolve();
        }

        if (divisionLoadPromises.has(division)) {
            return divisionLoadPromises.get(division);
        }

        // Mark as not ready before starting fetch
        set((state) => ({
            isDivisionReadyMap: {
                ...state.isDivisionReadyMap,
                [division]: false,
            },
        }));

        const fetchPromise = get().fetchDivisionSettings(division)
            .then(() => {
                // After fetch succeeds, mark as ready ONLY if not currently switching
                // (prepareDivisionSwitch handles readiness in its own flow)
                if (!get().isSwitchingDivision) {
                    set((state) => ({
                        isDivisionReadyMap: {
                            ...state.isDivisionReadyMap,
                            [division]: true,
                        },
                    }));
                    console.log(
                        `[AdminStore] Marked division ${division} as ready via ensureDivisionSettingsLoaded`,
                    );
                }
            })
            .finally(() => {
                divisionLoadPromises.delete(division);
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

    // Update fetchPldSdvAllotments to use cache
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
                // Get or initialize cache for this division
                const divisionCache = state.allotmentCache[division] || {
                    yearlyAllotments: [],
                    weeklyVacationAllotments: [],
                    pldSdvTempAllotments: {},
                    vacationTempAllotments: {},
                };

                // Update the cache
                const existingIndex = divisionCache.yearlyAllotments.findIndex((
                    a,
                ) => a.year === year);
                let updatedYearlyAllotments = [
                    ...divisionCache.yearlyAllotments,
                ];
                if (existingIndex > -1) {
                    updatedYearlyAllotments[existingIndex] = newAllotment;
                } else {
                    updatedYearlyAllotments.push(newAllotment);
                }

                const updatedCache = {
                    ...divisionCache,
                    yearlyAllotments: updatedYearlyAllotments,
                    pldSdvTempAllotments: {
                        ...divisionCache.pldSdvTempAllotments,
                        [year]: newAllotment.max_allotment.toString(),
                    },
                };

                return {
                    yearlyAllotments: updatedYearlyAllotments,
                    pldSdvTempAllotments: {
                        ...state.pldSdvTempAllotments,
                        [year]: newAllotment.max_allotment.toString(),
                    },
                    allotmentCache: {
                        ...state.allotmentCache,
                        [division]: updatedCache,
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

    // Update fetchAllotments to handle concurrent fetches
    fetchAllotments: async (division: string, year: number, zoneId = null) => {
        const currentState = get();

        // Don't skip fetches during division switch anymore - we want the data
        // Instead, ensure we're fetching for the right division
        if (
            currentState.currentFetchingDivision &&
            currentState.currentFetchingDivision !== division
        ) {
            console.log("[AdminStore] Deferring allotment fetch:", {
                requestedDivision: division,
                currentFetching: currentState.currentFetchingDivision,
            });
            return;
        }

        // Determine the effective zone ID based on division settings
        const divisionZones = currentState.zones[division] || [];
        const divisionUsesZones = currentState.usesZoneCalendars &&
            divisionZones.length > 0;
        const effectiveZoneId = divisionUsesZones ? zoneId : null;

        console.log("[AdminStore] Preparing allotment fetch:", {
            division,
            year,
            requestedZoneId: zoneId,
            effectiveZoneId,
            usesZones: divisionUsesZones,
        });

        // Create promises for both types of allotments
        const pldKey = getAllotmentFetchKey(
            division,
            year,
            effectiveZoneId,
            "pld_sdv",
        );
        const vacKey = getAllotmentFetchKey(
            division,
            year,
            effectiveZoneId,
            "vacation",
        );

        // If either fetch is already in progress, wait for it
        const existingPldFetch = allotmentFetchPromises.get(pldKey);
        const existingVacFetch = allotmentFetchPromises.get(vacKey);

        if (existingPldFetch || existingVacFetch) {
            console.log(
                "[AdminStore] Waiting for existing allotment fetches to complete",
            );
            await Promise.all(
                [existingPldFetch, existingVacFetch].filter(Boolean),
            );
            return;
        }

        // Create new fetch promises
        const pldPromise = get().fetchPldSdvAllotments(
            division,
            year,
            effectiveZoneId,
        )
            .finally(() => allotmentFetchPromises.delete(pldKey));
        const vacPromise = get().fetchVacationAllotments(
            division,
            year,
            effectiveZoneId,
        )
            .finally(() => allotmentFetchPromises.delete(vacKey));

        // Store the promises
        allotmentFetchPromises.set(pldKey, pldPromise);
        allotmentFetchPromises.set(vacKey, vacPromise);

        // Wait for both to complete
        await Promise.all([pldPromise, vacPromise]);
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

    // Update prepareDivisionSwitch to use cache
    prepareDivisionSwitch: async (fromDivision: string, toDivision: string) => {
        if (fromDivision === toDivision) {
            if (
                get().loadedDivisions.has(toDivision) &&
                !get().isDivisionReadyMap[toDivision]
            ) {
                set((state) => ({
                    isDivisionReadyMap: {
                        ...state.isDivisionReadyMap,
                        [toDivision]: true,
                    },
                }));
            }
            return get().ensureDivisionSettingsLoaded(toDivision);
        }

        console.log("[AdminStore] Prepare Switch START:", {
            from: fromDivision,
            to: toDivision,
        });

        // Step 1: Set Loading/Switching State & Clear Old Data
        set((state) => ({
            isDivisionLoading: true,
            isSwitchingDivision: true,
            currentFetchingDivision: toDivision,
            currentLoadingDivision: toDivision,
            error: null,
            isDivisionReadyMap: {
                ...state.isDivisionReadyMap,
                [toDivision]: false,
            },
            usesZoneCalendars: false, // Default to false until settings load
            selectedZoneId: null,
            yearlyAllotments: [],
            weeklyVacationAllotments: [],
            pldSdvTempAllotments: {},
            vacationTempAllotments: {},
        }));

        try {
            // Step 2: Fetch Settings (this updates usesZoneCalendars/zones internally)
            await get().ensureDivisionSettingsLoaded(toDivision);

            // Step 3: Determine New State (read state *after* settings load)
            const newDivisionState = get();
            const newDivisionZones = newDivisionState.zones[toDivision] || [];
            const newDivisionUsesZones = newDivisionState.usesZoneCalendars; // Read the definitive value

            // Need previous state *before* the switch started to check if zone should be preserved
            // This is tricky as state is mutable. We might need a snapshot, or rely on props passed initially.
            // For now, let's assume if the new division uses zones, we select the first one or null.
            const targetZoneId = newDivisionUsesZones
                ? (newDivisionZones[0]?.id ?? null)
                : null;

            console.log("[AdminStore] Prepare Switch - Settings Loaded:", {
                division: toDivision,
                usesZones: newDivisionUsesZones,
                zonesFound: newDivisionZones.length,
                calculatedTargetZoneId: targetZoneId,
            });

            // Step 4: Apply Core State Update
            const cachedData = newDivisionState.allotmentCache[toDivision]; // Check cache using latest state
            set((state) => ({
                lastLoadedDivision: toDivision,
                selectedZoneId: targetZoneId, // Apply the calculated zone ID
                // Restore cached data if available
                ...(cachedData
                    ? {
                        yearlyAllotments: cachedData.yearlyAllotments,
                        weeklyVacationAllotments:
                            cachedData.weeklyVacationAllotments,
                        pldSdvTempAllotments: cachedData.pldSdvTempAllotments,
                        vacationTempAllotments:
                            cachedData.vacationTempAllotments,
                    }
                    : {}),
                // isDivisionReadyMap is still false
            }));

            console.log("[AdminStore] Prepare Switch - Core State Updated:", {
                selectedZoneId: get().selectedZoneId,
            });

            // Step 5: Fetch Allotments (if needed)
            if (!cachedData) {
                console.log(
                    "[AdminStore] Prepare Switch - Fetching allotments for",
                    toDivision,
                    "Zone:",
                    targetZoneId,
                );
                const currentYear = new Date().getFullYear();
                await get().fetchAllotments(
                    toDivision,
                    currentYear,
                    targetZoneId,
                );
                await get().fetchAllotments(
                    toDivision,
                    currentYear + 1,
                    targetZoneId,
                );
                console.log(
                    "[AdminStore] Prepare Switch - Allotment fetch complete",
                );
            } else {
                console.log(
                    "[AdminStore] Prepare Switch - Using cached allotments for",
                    toDivision,
                );
            }

            // Step 6: Mark Ready (Last Step)
            set({ isSwitchingDivision: false }); // Set switching false first
            set((state) => ({
                isDivisionReadyMap: {
                    ...state.isDivisionReadyMap,
                    [toDivision]: true,
                },
            }));
            console.log(
                "[AdminStore] Prepare Switch END - Marked Ready:",
                toDivision,
            );
        } catch (error) {
            // ... (error handling remains similar, ensure reset) ...
            console.error("[AdminStore] Prepare Switch ERROR:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to switch divisions";
            set((state) => ({
                error: message,
                isSwitchingDivision: false,
                isDivisionLoading: false,
                currentFetchingDivision: null,
                currentLoadingDivision: null,
                usesZoneCalendars: false,
                selectedZoneId: null,
                isDivisionReadyMap: {
                    ...state.isDivisionReadyMap,
                    [toDivision]: false,
                },
            }));
            // Potentially re-throw or handle differently depending on requirements
            // throw error;
        } finally {
            // Minimal cleanup in finally, most flags are reset within try/catch
            set((state) => ({
                isDivisionLoading: false,
                currentLoadingDivision: null,
                currentFetchingDivision: null,
            }));
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
