import { create } from "zustand";
import { supabase } from "@/utils/supabase";

export interface Division {
    id: number;
    name: string;
    location: string;
    created_at: string;
    updated_at: string;
    member_count?: number; // Added during fetch operation
}

export interface Zone {
    id: number;
    name: string;
    division_id: number;
    created_at: string;
    updated_at: string;
    member_count?: number; // Added during fetch operation
}

export interface Officer {
    id: string;
    member_pin: number;
    first_name: string;
    last_name: string;
    position: string;
    division: string;
    start_date: string;
    end_date: string | null;
    phone_number?: string;
}

// Types
export type DivisionView =
    | "meetings"
    | "announcements"
    | "documents"
    | "officers";

interface DivisionManagementState {
    // Data
    divisions: Division[];
    zones: Record<number, Zone[]>; // Zones grouped by division_id
    officers: Officer[];

    // UI State
    isLoadingDivisions: boolean;
    isLoadingZones: boolean;
    isLoadingOfficers: boolean;
    selectedDivisionId: number | null;
    error: string | null;

    // Actions
    fetchDivisions: () => Promise<void>;
    fetchZonesForDivision: (divisionId: number) => Promise<void>;
    fetchOfficersForDivision: (divisionId: number) => Promise<void>;
    fetchAllData: () => Promise<void>;

    // Division CRUD
    createDivision: (
        division: Omit<Division, "id" | "created_at" | "updated_at">,
    ) => Promise<Division>;
    updateDivision: (
        id: number,
        data: Partial<Omit<Division, "id" | "created_at" | "updated_at">>,
    ) => Promise<void>;
    deleteDivision: (id: number) => Promise<void>;

    // Zone CRUD
    createZone: (
        zone: Omit<Zone, "id" | "created_at" | "updated_at">,
    ) => Promise<Zone>;
    updateZone: (
        id: number,
        data: Partial<Omit<Zone, "id" | "created_at" | "updated_at">>,
    ) => Promise<void>;
    deleteZone: (id: number) => Promise<void>;

    // Officer CRUD
    assignOfficer: (
        officerData: Omit<Officer, "id" | "created_at" | "updated_at">,
    ) => Promise<Officer>;
    updateOfficer: (
        id: string,
        data: Partial<Omit<Officer, "id" | "created_at" | "updated_at">>,
    ) => Promise<void>;
    removeOfficer: (id: string) => Promise<void>;

    // State management
    setSelectedDivisionId: (id: number | null) => void;
    clearError: () => void;

    // New state
    currentView: Record<string, DivisionView>; // Maps division name to selected view

    // New actions
    setCurrentView: (division: string, view: DivisionView) => void;
}

export const useDivisionManagementStore = create<DivisionManagementState>((
    set,
    get,
) => ({
    // Initial state
    divisions: [],
    zones: {},
    officers: [],
    isLoadingDivisions: false,
    isLoadingZones: false,
    isLoadingOfficers: false,
    selectedDivisionId: null,
    error: null,
    currentView: {},

    // Fetch operations
    fetchDivisions: async () => {
        set({ isLoadingDivisions: true, error: null });
        try {
            // Fetch divisions
            const { data: divisions, error: divisionsError } = await supabase
                .from("divisions")
                .select("*")
                .order("name");

            if (divisionsError) throw divisionsError;

            // Get member counts for each division using a SQL query with count function
            const { data: membersCount, error: membersError } = await supabase
                .rpc("get_division_member_counts");

            if (membersError) throw membersError;

            // Create a map of division_id to member count
            const memberCountMap: Record<number, number> = {};
            membersCount?.forEach((item: any) => {
                memberCountMap[item.division_id] = parseInt(item.count, 10);
            });

            // Add member_count to each division
            const divisionsWithCounts = divisions?.map((div: Division) => ({
                ...div,
                member_count: memberCountMap[div.id] || 0,
            }));

            set({ divisions: divisionsWithCounts || [] });
        } catch (error) {
            console.error("Error fetching divisions:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            set({ isLoadingDivisions: false });
        }
    },

    fetchZonesForDivision: async (divisionId: number) => {
        set({ isLoadingZones: true, error: null });
        try {
            // Fetch zones for the division
            const { data: zones, error: zonesError } = await supabase
                .from("zones")
                .select("*")
                .eq("division_id", divisionId)
                .order("name");

            if (zonesError) throw zonesError;

            // Get member counts for each zone using a SQL stored procedure
            const { data: membersCount, error: membersError } = await supabase
                .rpc("get_zone_member_counts", { division_id: divisionId });

            if (membersError) throw membersError;

            // Create a map of zone_id to member count
            const memberCountMap: Record<number, number> = {};
            membersCount?.forEach((item: any) => {
                memberCountMap[item.zone_id] = parseInt(item.count, 10);
            });

            // Add member_count to each zone
            const zonesWithCounts = zones?.map((zone: Zone) => ({
                ...zone,
                member_count: memberCountMap[zone.id] || 0,
            }));

            set((state) => ({
                zones: {
                    ...state.zones,
                    [divisionId]: zonesWithCounts || [],
                },
            }));
        } catch (error) {
            console.error(
                `Error fetching zones for division ${divisionId}:`,
                error,
            );
            set({
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            set({ isLoadingZones: false });
        }
    },

    fetchOfficersForDivision: async (divisionId: number) => {
        set({ isLoadingOfficers: true, error: null });
        try {
            // First, get the division name
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("name")
                .eq("id", divisionId)
                .single();

            if (divisionError) throw divisionError;

            const divisionName = divisionData?.name;

            // Fetch officers for the division
            const { data: officers, error: officersError } = await supabase
                .from("current_officers")
                .select("*")
                .eq("division", divisionName)
                .order("position");

            if (officersError) throw officersError;

            set({ officers: officers || [] });
        } catch (error) {
            console.error(
                `Error fetching officers for division ${divisionId}:`,
                error,
            );
            set({
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            set({ isLoadingOfficers: false });
        }
    },

    fetchAllData: async () => {
        await get().fetchDivisions();
        const divisionId = get().selectedDivisionId;
        if (divisionId) {
            await Promise.all([
                get().fetchZonesForDivision(divisionId),
                get().fetchOfficersForDivision(divisionId),
            ]);
        }
    },

    // Division CRUD operations
    createDivision: async (division) => {
        set({ error: null });
        try {
            const { data, error } = await supabase
                .from("divisions")
                .insert([division])
                .select()
                .single();

            if (error) throw error;

            // Refresh the divisions list
            get().fetchDivisions();

            return data;
        } catch (error) {
            console.error("Error creating division:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    updateDivision: async (id, data) => {
        set({ error: null });
        try {
            const { error } = await supabase
                .from("divisions")
                .update(data)
                .eq("id", id);

            if (error) throw error;

            // Refresh the divisions list
            get().fetchDivisions();
        } catch (error) {
            console.error(`Error updating division ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    deleteDivision: async (id) => {
        set({ error: null });
        try {
            // First check if this division has zones
            const { data: zones, error: zonesCheckError } = await supabase
                .from("zones")
                .select("id")
                .eq("division_id", id);

            if (zonesCheckError) throw zonesCheckError;

            if (zones && zones.length > 0) {
                throw new Error(
                    "Cannot delete division with associated zones. Please delete all zones first.",
                );
            }

            // Check if there are members assigned to this division
            const { data: members, error: membersCheckError } = await supabase
                .from("members")
                .select("pin_number")
                .eq("division_id", id)
                .limit(1);

            if (membersCheckError) throw membersCheckError;

            if (members && members.length > 0) {
                throw new Error(
                    "Cannot delete division with assigned members. Please reassign all members first.",
                );
            }

            // Now safe to delete
            const { error } = await supabase
                .from("divisions")
                .delete()
                .eq("id", id);

            if (error) throw error;

            // Refresh the divisions list
            get().fetchDivisions();

            // Clear selected division if it was deleted
            if (get().selectedDivisionId === id) {
                set({ selectedDivisionId: null });
            }
        } catch (error) {
            console.error(`Error deleting division ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    // Zone CRUD operations
    createZone: async (zone) => {
        set({ error: null });
        try {
            const { data, error } = await supabase
                .from("zones")
                .insert([zone])
                .select()
                .single();

            if (error) throw error;

            // Refresh the zones list for this division
            get().fetchZonesForDivision(zone.division_id);

            return data;
        } catch (error) {
            console.error("Error creating zone:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    updateZone: async (id, data) => {
        set({ error: null });
        try {
            // First get the current zone to know which division to refresh
            const { data: zone, error: getError } = await supabase
                .from("zones")
                .select("division_id")
                .eq("id", id)
                .single();

            if (getError) throw getError;

            const { error } = await supabase
                .from("zones")
                .update(data)
                .eq("id", id);

            if (error) throw error;

            // Refresh the zones list for this division
            if (zone) {
                get().fetchZonesForDivision(zone.division_id);

                // If division_id changed, also refresh the new division's zones
                if (data.division_id && data.division_id !== zone.division_id) {
                    get().fetchZonesForDivision(data.division_id);
                }
            }
        } catch (error) {
            console.error(`Error updating zone ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    deleteZone: async (id) => {
        set({ error: null });
        try {
            // First get the current zone to know which division to refresh
            const { data: zone, error: getError } = await supabase
                .from("zones")
                .select("division_id")
                .eq("id", id)
                .single();

            if (getError) throw getError;

            // Check if there are members assigned to this zone
            const { data: members, error: membersCheckError } = await supabase
                .from("members")
                .select("pin_number")
                .or(`current_zone_id.eq.${id},home_zone_id.eq.${id}`)
                .limit(1);

            if (membersCheckError) throw membersCheckError;

            if (members && members.length > 0) {
                throw new Error(
                    "Cannot delete zone with assigned members. Please reassign all members first.",
                );
            }

            const { error } = await supabase
                .from("zones")
                .delete()
                .eq("id", id);

            if (error) throw error;

            // Refresh the zones list for this division
            if (zone) {
                get().fetchZonesForDivision(zone.division_id);
            }
        } catch (error) {
            console.error(`Error deleting zone ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    // Officer management operations
    assignOfficer: async (officerData) => {
        set({ error: null });
        try {
            const { data, error } = await supabase
                .from("officer_positions")
                .insert([{
                    member_pin: officerData.member_pin,
                    position: officerData.position,
                    division: officerData.division,
                    start_date: officerData.start_date,
                    end_date: officerData.end_date || null,
                }])
                .select()
                .single();

            if (error) throw error;

            // Refresh officers if a division is selected
            const divisionId = get().selectedDivisionId;
            if (divisionId) {
                get().fetchOfficersForDivision(divisionId);
            }

            return data;
        } catch (error) {
            console.error("Error assigning officer:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    updateOfficer: async (id, data) => {
        set({ error: null });
        try {
            const { error } = await supabase
                .from("officer_positions")
                .update(data)
                .eq("id", id);

            if (error) throw error;

            // Refresh officers if a division is selected
            const divisionId = get().selectedDivisionId;
            if (divisionId) {
                get().fetchOfficersForDivision(divisionId);
            }
        } catch (error) {
            console.error(`Error updating officer ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    removeOfficer: async (id) => {
        set({ error: null });
        try {
            // Instead of deleting, we set an end date
            const { error } = await supabase
                .from("officer_positions")
                .update({ end_date: new Date().toISOString() })
                .eq("id", id);

            if (error) throw error;

            // Refresh officers if a division is selected
            const divisionId = get().selectedDivisionId;
            if (divisionId) {
                get().fetchOfficersForDivision(divisionId);
            }
        } catch (error) {
            console.error(`Error removing officer ${id}:`, error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    },

    // State management
    setSelectedDivisionId: (id) => {
        set({ selectedDivisionId: id });

        // If a new division is selected, fetch its data
        if (id !== null) {
            get().fetchZonesForDivision(id);
            get().fetchOfficersForDivision(id);
        }
    },

    clearError: () => set({ error: null }),

    // New actions
    setCurrentView: (division: string, view: DivisionView) => {
        set((state) => ({
            currentView: {
                ...state.currentView,
                [division]: view,
            },
        }));
    },
}));
