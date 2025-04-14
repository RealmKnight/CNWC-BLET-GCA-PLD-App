import { create } from "zustand";
import { supabase } from "@/utils/supabase";

interface Calendar {
    id: string;
    name: string;
}

interface Member {
    first_name: string;
    last_name: string;
    pin_number: number;
    division_id: number;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    calendar_name: string | null;
}

interface SupabaseMember {
    first_name: string | null;
    last_name: string | null;
    pin_number: number;
    division_id: number | null;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
}

interface AdminMemberManagementState {
    members: Member[];
    isLoading: boolean;
    isDivisionLoading: boolean;
    isSwitchingDivision: boolean;
    error: Error | null;
    availableCalendars: Calendar[];
    currentDivisionId: number | null;
    lastLoadedDivision: string | null;
    prepareDivisionSwitch: (
        currentDivision: string,
        newDivision: string,
    ) => Promise<void>;
    ensureDivisionMembersLoaded: (division: string) => Promise<void>;
    updateMember: () => void;
    setError: (error: Error | null) => void;
}

export const useAdminMemberManagementStore = create<AdminMemberManagementState>(
    (set, get) => ({
        members: [],
        isLoading: false,
        isDivisionLoading: false,
        isSwitchingDivision: false,
        error: null,
        availableCalendars: [],
        currentDivisionId: null,
        lastLoadedDivision: null,

        prepareDivisionSwitch: async (
            currentDivision: string,
            newDivision: string,
        ) => {
            set({
                isDivisionLoading: true,
                isSwitchingDivision: true,
                error: null,
            });
            try {
                // Get division ID first
                const { data: divisionData, error: divisionError } =
                    await supabase
                        .from("divisions")
                        .select("id")
                        .eq("name", newDivision)
                        .single();

                if (divisionError) throw divisionError;
                if (!divisionData) {
                    throw new Error(`Division "${newDivision}" not found`);
                }

                const divisionId = divisionData.id;

                // Get all calendars
                const { data: calendarsData, error: calendarsError } =
                    await supabase
                        .from("calendars")
                        .select("id, name")
                        .order("name");

                if (calendarsError) throw calendarsError;

                set({ availableCalendars: calendarsData || [] });

                // Get members for the division
                const { data: membersData, error: membersError } =
                    await supabase
                        .from("members")
                        .select(`
                            first_name,
                            last_name,
                            pin_number,
                            division_id,
                            sdv_entitlement,
                            sdv_election,
                            calendar_id
                        `)
                        .eq("division_id", divisionId)
                        .order("last_name", { ascending: true });

                if (membersError) throw membersError;

                // Create a map of calendar IDs to names
                const calendarMap = new Map(
                    calendarsData?.map((cal: Calendar) => [cal.id, cal.name]) ||
                        [],
                );

                const formattedMembers = (membersData || []).map((
                    member: SupabaseMember,
                ) => ({
                    ...member,
                    calendar_name: member.calendar_id
                        ? calendarMap.get(member.calendar_id) || null
                        : null,
                    first_name: member.first_name || "",
                    last_name: member.last_name || "",
                    division_id: member.division_id || divisionId,
                }));

                set({
                    members: formattedMembers,
                    currentDivisionId: divisionId,
                    lastLoadedDivision: newDivision,
                    error: null,
                });
            } catch (error) {
                set({ error: error as Error });
            } finally {
                set({ isDivisionLoading: false, isSwitchingDivision: false });
            }
        },

        ensureDivisionMembersLoaded: async (division: string) => {
            const state = get();
            if (
                state.lastLoadedDivision !== division ||
                state.members.length === 0
            ) {
                await state.prepareDivisionSwitch(
                    state.lastLoadedDivision || "",
                    division,
                );
            }
        },

        updateMember: () => {
            const state = get();
            if (state.lastLoadedDivision) {
                state.prepareDivisionSwitch(
                    state.lastLoadedDivision,
                    state.lastLoadedDivision,
                );
            }
        },

        setError: (error: Error | null) => set({ error }),
    }),
);

export type { AdminMemberManagementState, Calendar, Member };
