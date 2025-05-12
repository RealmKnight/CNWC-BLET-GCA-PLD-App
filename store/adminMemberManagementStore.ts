import { create } from "zustand";
import { supabase } from "@/utils/supabase";

interface Calendar {
    id: string;
    name: string;
}

// Simple summary for request entry form
interface MemberSummary {
    id: string;
    pin_number: number;
    first_name: string;
    last_name: string;
}

// Define the data-only Member type
export interface MemberData {
    pin_number: string | number;
    first_name: string;
    last_name: string;
    division_id: number;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    calendar_name: string | null; // This is derived/added client-side
    status: string;
    date_of_birth?: string | null;
    home_zone_id?: number | null;
    current_zone_id?: number | null;
    role?: string | null;
    company_hire_date?: string | null;
    engineer_date?: string | null;
    system_sen_type?: string | null;
    rank?: string | null;
    deleted?: boolean | null;
    curr_vacation_weeks?: number | null;
    curr_vacation_split?: number | null;
    pld_rolled_over?: number | null;
    max_plds?: number | null;
    next_vacation_weeks?: number | null;
    next_vacation_split?: number | null;
    prior_vac_sys?: string | null;
    wc_sen_roster?: number | null;
    dwp_sen_roster?: number | null;
    dmir_sen_roster?: number | null;
    eje_sen_roster?: number | null;
    misc_notes?: string | null;
    user_id?: string | null;
}

interface SupabaseMember {
    first_name: string | null;
    last_name: string | null;
    pin_number: string | number;
    division_id: number | null;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    status: string | null;
    id?: string;
    date_of_birth?: string | null;
    home_zone_id?: number | null;
    current_zone_id?: number | null;
    role?: string | null;
    company_hire_date?: string | null;
    engineer_date?: string | null;
    system_sen_type?: string | null;
    rank?: string | null;
    deleted?: boolean | null;
    curr_vacation_weeks?: number | null;
    curr_vacation_split?: number | null;
    pld_rolled_over?: number | null;
    max_plds?: number | null;
    next_vacation_weeks?: number | null;
    next_vacation_split?: number | null;
    prior_vac_sys?: string | null;
    wc_sen_roster?: number | null;
    dwp_sen_roster?: number | null;
    dmir_sen_roster?: number | null;
    eje_sen_roster?: number | null;
    misc_notes?: string | null;
    user_id?: string | null;
}

interface MemberListUIState {
    searchQuery: string;
    showInactive: boolean;
    scrollPosition: number;
    lastEditedMemberPin: string | null;
}

interface AdminMemberManagementState {
    members: MemberData[]; // Use MemberData here
    isLoading: boolean;
    isDivisionLoading: boolean;
    isSwitchingDivision: boolean;
    error: Error | null;
    availableCalendars: Calendar[];
    currentDivisionId: number | null;
    lastLoadedDivision: string | null;
    membersByCalendar: Record<string, MemberSummary[]>;
    isLoadingMembersByCalendar: boolean;
    memberListUIState: MemberListUIState;

    prepareDivisionSwitch: (
        currentDivision: string,
        newDivision: string,
    ) => Promise<void>;
    ensureDivisionMembersLoaded: (division: string) => Promise<void>;
    updateMember: () => Promise<void>;
    updateSingleMemberInList: (updatedMember: MemberData) => void; // Use MemberData here
    setError: (error: Error | null) => void;
    fetchMembersByCalendarId: (calendarId: string) => Promise<void>;
    updateMemberListUIState: (newState: Partial<MemberListUIState>) => void;
    fetchAllMembers: () => Promise<void>; // New method for Union Admin
}

export const useAdminMemberManagementStore = create<AdminMemberManagementState>(
    (set, get) => ({
        members: [], // Initial state uses MemberData[]
        isLoading: false,
        isDivisionLoading: false,
        isSwitchingDivision: false,
        error: null,
        availableCalendars: [],
        currentDivisionId: null,
        lastLoadedDivision: null,

        // Initialize new state
        membersByCalendar: {},
        isLoadingMembersByCalendar: false,

        // Initialize MemberList UI state
        memberListUIState: {
            searchQuery: "",
            showInactive: false,
            scrollPosition: 0,
            lastEditedMemberPin: null,
        },

        updateMemberListUIState: (newState) => {
            set((state) => ({
                memberListUIState: {
                    ...state.memberListUIState,
                    ...newState,
                },
            }));
        },

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
                            calendar_id,
                            status
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
                ): MemberData => ({
                    first_name: member.first_name || "",
                    last_name: member.last_name || "",
                    pin_number: member.pin_number,
                    division_id: member.division_id || divisionId,
                    sdv_entitlement: member.sdv_entitlement,
                    sdv_election: member.sdv_election,
                    calendar_id: member.calendar_id,
                    calendar_name: member.calendar_id
                        ? calendarMap.get(member.calendar_id) || null
                        : null,
                    status: member.status || "IN-ACTIVE",
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

        updateMember: async () => {
            const state = get();
            if (!state.lastLoadedDivision || !state.currentDivisionId) return;

            try {
                set({ isLoading: true, error: null });

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
                        calendar_id,
                        status
                    `)
                        .eq("division_id", state.currentDivisionId)
                        .order("last_name", { ascending: true });

                if (membersError) throw membersError;

                // Create a map of calendar IDs to names using existing availableCalendars
                const calendarMap = new Map(
                    state.availableCalendars?.map((
                        cal: Calendar,
                    ) => [cal.id, cal.name]) || [],
                );

                const formattedMembers = (membersData || []).map((
                    member: SupabaseMember,
                ): MemberData => ({
                    first_name: member.first_name || "",
                    last_name: member.last_name || "",
                    pin_number: member.pin_number,
                    division_id: member.division_id ||
                        state.currentDivisionId || 0,
                    sdv_entitlement: member.sdv_entitlement,
                    sdv_election: member.sdv_election,
                    calendar_id: member.calendar_id,
                    calendar_name: member.calendar_id
                        ? calendarMap.get(member.calendar_id) || null
                        : null,
                    status: member.status || "IN-ACTIVE",
                }));

                set({
                    members: formattedMembers,
                    error: null,
                });
            } catch (error) {
                set({ error: error as Error });
            } finally {
                set({ isLoading: false });
            }
        },

        updateSingleMemberInList: (updatedMember: MemberData) => {
            const calendarMap = new Map(
                get().availableCalendars?.map((
                    cal: Calendar,
                ) => [cal.id, cal.name]) ||
                    [],
            );
            const updatedMemberWithName: MemberData = {
                ...updatedMember,
                calendar_name: updatedMember.calendar_id
                    ? calendarMap.get(updatedMember.calendar_id) || null
                    : null,
            };

            set((state) => ({
                members: state.members.map((member) =>
                    member.pin_number === updatedMember.pin_number
                        ? { ...member, ...updatedMemberWithName }
                        : member
                ),
            }));
        },

        setError: (error: Error | null) => set({ error }),

        // Implementation for new action
        fetchMembersByCalendarId: async (calendarId: string) => {
            if (!calendarId) {
                set((state) => ({
                    membersByCalendar: {
                        ...state.membersByCalendar,
                        [calendarId]: [],
                    },
                }));
                return;
            }

            set((state) => ({
                isLoadingMembersByCalendar: true,
                error: null,
            }));
            try {
                const { data, error } = await supabase
                    .from("members")
                    .select("id, pin_number, first_name, last_name")
                    .eq("calendar_id", calendarId)
                    .eq("status", "ACTIVE") // Only fetch active members for requests
                    .order("last_name", { ascending: true });

                if (error) throw error;

                const summaries: MemberSummary[] = (data || []).map((
                    member,
                ) => ({
                    id: member.id || "", // Handle potential null ID, though unlikely
                    pin_number: member.pin_number,
                    first_name: member.first_name || "",
                    last_name: member.last_name || "",
                }));

                set((state) => ({
                    membersByCalendar: {
                        ...state.membersByCalendar,
                        [calendarId]: summaries,
                    },
                    isLoadingMembersByCalendar: false,
                }));
            } catch (error) {
                console.error(
                    "[AdminMemberStore] Error fetching members by calendar:",
                    error,
                );
                set({
                    error: error as Error,
                    isLoadingMembersByCalendar: false,
                });
            }
        },

        // Implementation for new action to fetch all members regardless of division
        fetchAllMembers: async () => {
            try {
                set({ isLoading: true, error: null });

                // Get all calendars first if not already loaded
                if (get().availableCalendars.length === 0) {
                    const { data: calendarsData, error: calendarsError } =
                        await supabase
                            .from("calendars")
                            .select("id, name")
                            .order("name");

                    if (calendarsError) throw calendarsError;
                    set({ availableCalendars: calendarsData || [] });
                }

                // Get all members
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
                        calendar_id,
                        status
                    `)
                        .order("last_name", { ascending: true });

                if (membersError) throw membersError;

                // Create a map of calendar IDs to names
                const calendarMap = new Map(
                    get().availableCalendars?.map((
                        cal: Calendar,
                    ) => [cal.id, cal.name]) || [],
                );

                const formattedMembers = (membersData || []).map((
                    member: SupabaseMember,
                ): MemberData => ({
                    first_name: member.first_name || "",
                    last_name: member.last_name || "",
                    pin_number: member.pin_number,
                    division_id: member.division_id || 0,
                    sdv_entitlement: member.sdv_entitlement,
                    sdv_election: member.sdv_election,
                    calendar_id: member.calendar_id,
                    calendar_name: member.calendar_id
                        ? calendarMap.get(member.calendar_id) || null
                        : null,
                    status: member.status || "IN-ACTIVE",
                }));

                set({
                    members: formattedMembers,
                    error: null,
                    currentDivisionId: null, // Clear division ID since we're showing all members
                    lastLoadedDivision: null,
                });
            } catch (error) {
                set({ error: error as Error });
            } finally {
                set({ isLoading: false });
            }
        },
    }),
);

export type { AdminMemberManagementState, Calendar, MemberSummary };
