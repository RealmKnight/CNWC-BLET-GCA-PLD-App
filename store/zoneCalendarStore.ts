import { create } from "zustand";
import { supabase } from "@/utils/supabase";

interface Zone {
    id: number;
    name: string;
}

interface ZoneCalendarState {
    divisionsWithZones: Record<string, number[]>;
    zones: Record<string, Zone[]>;
    isLoading: boolean;
    error: string | null;

    // Actions
    setDivisionsWithZones: (divisions: Record<string, number[]>) => void;
    setError: (error: string | null) => void;
    setIsLoading: (isLoading: boolean) => void;
    setZones: (division: string, zones: Zone[]) => void;

    // Data fetching
    fetchDivisionsWithZones: () => Promise<void>;
    fetchZones: (division: string) => Promise<void>;
    setDivisionZoneCalendars: (
        division: string,
        zoneIds: number[],
    ) => Promise<void>;
    removeDivisionZoneCalendars: (
        division: string,
        zoneIds: number[],
    ) => Promise<void>;
}

interface ZoneAllotment {
    zone_id: number;
}

export const useZoneCalendarStore = create<ZoneCalendarState>((set, get) => ({
    divisionsWithZones: {},
    zones: {},
    isLoading: false,
    error: null,

    setDivisionsWithZones: (divisions) =>
        set({ divisionsWithZones: divisions }),
    setError: (error) => set({ error }),
    setIsLoading: (isLoading) => {
        console.log("[ZoneCalendarStore] Setting loading state:", isLoading);
        set({ isLoading });
    },
    setZones: (division, zones) =>
        set((state) => ({
            zones: {
                ...state.zones,
                [division]: zones,
            },
        })),

    fetchZones: async (division: string) => {
        const state = get();
        // If we already have the zones and they're not empty, use cached data
        if (state.zones[division]?.length > 0) {
            console.log(
                "[ZoneCalendarStore] Using cached zones for division:",
                division,
            );
            return;
        }

        get().setIsLoading(true);
        get().setError(null);

        try {
            console.log(
                "[ZoneCalendarStore] Fetching zones for division:",
                division,
            );

            // Get division ID
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("id")
                .eq("name", division)
                .single();

            if (divisionError) throw divisionError;
            if (!divisionData) throw new Error("Division not found");

            console.log(
                "[ZoneCalendarStore] Found division ID:",
                divisionData.id,
            );

            // Get zones for this division
            const { data: zonesData, error: zonesError } = await supabase
                .from("zones")
                .select("id, name")
                .eq("division_id", divisionData.id)
                .order("name");

            if (zonesError) throw zonesError;

            console.log(
                "[ZoneCalendarStore] Fetched zones:",
                zonesData?.length || 0,
            );

            set((state) => ({
                zones: {
                    ...state.zones,
                    [division]: zonesData || [],
                },
            }));
        } catch (error) {
            console.error("[ZoneCalendarStore] Error fetching zones:", error);
            get().setError((error as Error).message);
        } finally {
            console.log(
                "[ZoneCalendarStore] Fetch complete, resetting loading state",
            );
            get().setIsLoading(false);
        }
    },

    fetchDivisionsWithZones: async () => {
        set({ isLoading: true, error: null });
        try {
            const { data: divisions, error: divisionError } = await supabase
                .from("divisions")
                .select("name, uses_zone_calendars")
                .eq("uses_zone_calendars", true);

            if (divisionError) throw divisionError;

            const divisionsWithZones: Record<string, number[]> = {};

            for (const division of divisions) {
                // Get all zone IDs for this division and remove duplicates
                const { data: zones, error: zoneError } = await supabase
                    .from("pld_sdv_allotments")
                    .select("zone_id")
                    .eq("division", division.name)
                    .not("zone_id", "is", null);

                if (zoneError) throw zoneError;

                // Use Set to get unique zone IDs
                const uniqueZoneIds = [
                    ...new Set((zones || []).map((z) => z.zone_id)),
                ];
                divisionsWithZones[division.name] = uniqueZoneIds;
            }

            set({ divisionsWithZones });
        } catch (error) {
            set({ error: (error as Error).message });
        } finally {
            set({ isLoading: false });
        }
    },

    setDivisionZoneCalendars: async (division: string, zoneIds: number[]) => {
        set({ isLoading: true, error: null });
        try {
            // Enable zone calendars for division
            const { error: divisionError } = await supabase
                .from("divisions")
                .update({ uses_zone_calendars: true })
                .eq("name", division);

            if (divisionError) throw divisionError;

            // Update state
            set((state) => ({
                divisionsWithZones: {
                    ...state.divisionsWithZones,
                    [division]: zoneIds,
                },
            }));
        } catch (error) {
            set({ error: (error as Error).message });
        } finally {
            set({ isLoading: false });
        }
    },

    removeDivisionZoneCalendars: async (
        division: string,
        zoneIds: number[],
    ) => {
        set({ isLoading: true, error: null });
        try {
            // If removing all zones, disable zone calendars for division
            const { error: divisionError } = await supabase
                .from("divisions")
                .update({ uses_zone_calendars: false })
                .eq("name", division);

            if (divisionError) throw divisionError;

            // Update state
            set((state) => {
                const newDivisionsWithZones = { ...state.divisionsWithZones };
                delete newDivisionsWithZones[division];
                return { divisionsWithZones: newDivisionsWithZones };
            });
        } catch (error) {
            set({ error: (error as Error).message });
        } finally {
            set({ isLoading: false });
        }
    },
}));
