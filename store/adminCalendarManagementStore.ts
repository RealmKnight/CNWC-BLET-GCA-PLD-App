import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { Alert, Platform } from "react-native";
import { isValid, parseISO } from "date-fns";
import { useUserStore } from "@/store/userStore";

interface Zone {
    id: number;
    name: string;
}

interface YearlyAllotment {
    year: number;
    max_allotment: number;
    is_override?: boolean | null;
    override_by?: string | null;
    override_at?: string | null;
    override_reason?: string | null;
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
        reason?: string, // Optional reason for override
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
    resetAllotments: () => set({ yearlyAllotments: [], tempAllotments: {} }),

    // Fetch Division Settings (includes usesZoneCalendars)
    fetchDivisionSettings: async (division) => {
        if (!division) return;
        set({ isLoading: true, error: null });
        let divisionId: number | null = null; // Variable to store division ID
        try {
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("id, uses_zone_calendars") // Fetch ID as well
                .eq("name", division)
                .single();

            if (divisionError) throw divisionError;
            if (!divisionData) throw new Error("Division not found");

            divisionId = divisionData.id; // Store the ID
            const usesZones = divisionData.uses_zone_calendars || false;
            set({ usesZoneCalendars: usesZones });

            // If using zones, fetch them, then fetch zone calendars
            if (usesZones) {
                await get().fetchZones(division); // Fetch zones first
                // Ensure divisionId is not null before fetching calendars
                if (divisionId !== null) {
                    // REMOVE call to fetchZoneCalendars
                    // await get().fetchZoneCalendars(divisionId);
                } else {
                    // Handle case where divisionId is unexpectedly null (shouldn't happen due to earlier check)
                    console.error(
                        "[AdminStore] Division ID is null unexpectedly after fetching division data.",
                    );
                    set({
                        error:
                            "Internal error: Division ID not found after fetch.",
                        isLoading: false,
                    });
                    return;
                }
            } else {
                set({
                    selectedZoneId: null,
                    zones: { ...get().zones, [division]: [] },
                    // REMOVE zoneCalendars clear
                    // zoneCalendars: [], // Clear zone calendars too
                });
                get().resetAllotments();
                await get().fetchAllotments(division, new Date().getFullYear());
                await get().fetchAllotments(
                    division,
                    new Date().getFullYear() + 1,
                );
            }
        } catch (error) {
            console.error(
                "[AdminStore] Error fetching division settings:",
                error,
            );
            const message = error instanceof Error
                ? error.message
                : "Failed to load division settings";
            set({ error: message });
        } finally {
            // Loading state managed within fetchZones/fetchAllotments or set here if not using zones
            if (!get().usesZoneCalendars && !get().isLoading) {
                set({ isLoading: false });
            }
        }
    },

    // Fetch Zones for a specific division
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
                .select("id, name")
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
            set({ error: message });
        } finally {
            set({ isLoading: false }); // Final loading state update
        }
    },

    // Toggle Zone Calendar Usage
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
                // If enabling, fetch zones and auto-select
                await get().fetchZones(division);
            } else {
                // If disabling, clear zone selection and zones list for this division
                get().setSelectedZoneId(null);
                set((state) => ({ zones: { ...state.zones, [division]: [] } }));
                // Fetch division-wide allotments after disabling zones
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
            // Loading state should be handled by fetchZones if called, otherwise set here
            if (!newStatus || get().zones[division]?.length === 0) {
                set({ isLoading: false });
            }
        }
    },

    // Fetch Yearly Allotments for division/year/(optional zone)
    fetchAllotments: async (division, year, zoneId = null) => {
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

    // Update/Insert Yearly Allotment
    updateAllotment: async (
        division,
        year,
        maxAllotment,
        userId,
        zoneId = null,
        reason = "",
    ) => {
        if (!division || !userId) {
            throw new Error(
                "Division and User ID are required to update allotment.",
            );
        }
        set({ isLoading: true, error: null });

        const effectiveZoneId = get().usesZoneCalendars ? zoneId : null;

        try {
            // Check current allotment to see if it's an override
            const currentData = get().yearlyAllotments.find((a) =>
                a.year === year
            );
            const isOverride = currentData?.max_allotment !== maxAllotment;

            const updateData: any = {
                division,
                year,
                max_allotment: maxAllotment,
                date: `${year}-01-01`, // Add the date field
                // Keep updated_at and updated_by
                updated_at: new Date().toISOString(),
                updated_by: userId,
                // Only include zone_id if it's not null
                ...(effectiveZoneId !== null && { zone_id: effectiveZoneId }),
            };

            if (isOverride) {
                updateData.is_override = true;
                updateData.override_at = new Date().toISOString();
                updateData.override_by = userId;
                updateData.override_reason = reason || null; // Allow empty string turning into null
            }
            // No need to explicitly clear override fields if not overriding,
            // rely on existing values or defaults unless schema requires it.
            // else {
            //     updateData.is_override = false;
            //     updateData.override_at = null;
            //     updateData.override_by = null;
            //     updateData.override_reason = null;
            // }

            // Perform upsert operation
            const { error: upsertError } = await supabase
                .from("pld_sdv_allotments")
                .upsert(
                    updateData,
                    {
                        onConflict: effectiveZoneId
                            ? "division, year, zone_id"
                            : "division, year, zone_id",
                    }, // Handle potential null zone_id conflict separately? Need to test. For now assume zone_id constraint works.
                );

            if (upsertError) {
                console.error("[AdminStore] Upsert Error:", upsertError);
                // Check for unique constraint violation (e.g., duplicate for year+division without zone)
                if (
                    upsertError.message.includes(
                        "duplicate key value violates unique constraint",
                    )
                ) {
                    // Handle potential conflict when zone_id is null.
                    // Maybe try update first, then insert? Or adjust constraint.
                    // For now, rethrow a more specific error.
                    throw new Error(
                        "Potential conflict updating allotment. Check if a division-wide allotment exists.",
                    );
                }
                throw upsertError;
            }

            // Refetch the updated allotment to update local state correctly
            await get().fetchAllotments(division, year, effectiveZoneId);
        } catch (error) {
            console.error("[AdminStore] Error updating allotment:", error);
            const message = error instanceof Error
                ? error.message
                : "Failed to update allotment";
            set({ error: message });
            throw error; // Rethrow to be caught in the component
        } finally {
            set({ isLoading: false });
        }
    },
}));
