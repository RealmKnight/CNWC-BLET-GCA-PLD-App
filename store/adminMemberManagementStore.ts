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

interface Member {
    first_name: string;
    last_name: string;
    pin_number: number;
    division_id: number;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    calendar_name: string | null;
    status: string;
    lastLoadedDivision: string | null;
    prepareDivisionSwitch: (
        currentDivision: string,
        newDivision: string,
    ) => Promise<void>;
    ensureDivisionMembersLoaded: (division: string) => Promise<void>;
    updateMember: () => void;
    setError: (error: Error | null) => void;

    // New state and actions for fetching members by calendar
    membersByCalendar: Record<string, MemberSummary[]>; // Map: calendarId -> members
    isLoadingMembersByCalendar: boolean;
    fetchMembersByCalendarId: (calendarId: string) => Promise<void>;
}

interface SupabaseMember {
    first_name: string | null;
    last_name: string | null;
    pin_number: number;
    division_id: number | null;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    status: string | null;
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

    // New state and actions for fetching members by calendar
    membersByCalendar: Record<string, MemberSummary[]>; // Map: calendarId -> members
    isLoadingMembersByCalendar: boolean;
    fetchMembersByCalendarId: (calendarId: string) => Promise<void>;

    // UI state for MemberList component
    memberListUIState: {
        searchQuery: string;
        showInactive: boolean;
        scrollPosition: number;
        lastEditedMemberPin: string | null;
    };
    updateMemberListUIState: (
        state: Partial<AdminMemberManagementState["memberListUIState"]>,
    ) => void;
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
                ): Member => ({
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
                    lastLoadedDivision: null,
                    prepareDivisionSwitch: async () => {
                        await get().prepareDivisionSwitch(
                            get().lastLoadedDivision || "",
                            newDivision,
                        );
                    },
                    ensureDivisionMembersLoaded: async () => {
                        await get().ensureDivisionMembersLoaded(newDivision);
                    },
                    updateMember: () => {
                        get().updateMember();
                    },
                    setError: (error: Error | null) => {
                        get().setError(error);
                    },
                    membersByCalendar: {},
                    isLoadingMembersByCalendar: false,
                    fetchMembersByCalendarId: async (calendarId: string) => {
                        await get().fetchMembersByCalendarId(calendarId);
                    },
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
                ): Member => ({
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
                    lastLoadedDivision: null,
                    prepareDivisionSwitch: async () => {
                        await get().prepareDivisionSwitch(
                            get().lastLoadedDivision || "",
                            state.lastLoadedDivision || "",
                        );
                    },
                    ensureDivisionMembersLoaded: async () => {
                        await get().ensureDivisionMembersLoaded(
                            state.lastLoadedDivision || "",
                        );
                    },
                    updateMember: () => {
                        get().updateMember();
                    },
                    setError: (error: Error | null) => {
                        get().setError(error);
                    },
                    membersByCalendar: {},
                    isLoadingMembersByCalendar: false,
                    fetchMembersByCalendarId: async (calendarId: string) => {
                        await get().fetchMembersByCalendarId(calendarId);
                    },
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
    }),
);

export type { AdminMemberManagementState, Calendar, Member, MemberSummary };
