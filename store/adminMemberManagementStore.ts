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
    calendar_id: string | null;
}

// Vacation week transfer interfaces
export interface ApprovedVacationWeek {
    id: string;
    start_date: string;
    end_date: string;
    requested_at: string | null;
    actioned_at: string | null;
}

export interface AvailableTransferWeek {
    week_start_date: string;
    max_allotment: number;
    current_requests: number;
    available_slots: number;
    vac_year: number;
}

export interface TransferVacationParams {
    pin_number: number;
    old_start_date: string;
    new_start_date: string;
    calendar_id: string;
    admin_user_id: string;
    reason?: string;
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

    // Vacation week transfer state
    memberApprovedWeeks: Record<string, ApprovedVacationWeek[]>;
    availableTransferWeeks: Record<string, AvailableTransferWeek[]>;
    isLoadingApprovedWeeks: boolean;
    isLoadingAvailableWeeks: boolean;
    transferError: string | null;

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

    // Vacation week transfer methods
    fetchMemberApprovedWeeks: (
        calendarId: string,
        pinNumber: number,
        year: number,
    ) => Promise<void>;
    fetchAvailableTransferWeeks: (
        calendarId: string,
        year: number,
        excludeDate?: string,
    ) => Promise<void>;
    transferVacationWeek: (params: TransferVacationParams) => Promise<boolean>;
    clearTransferData: () => void;
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

        // Vacation week transfer state
        memberApprovedWeeks: {},
        availableTransferWeeks: {},
        isLoadingApprovedWeeks: false,
        isLoadingAvailableWeeks: false,
        transferError: null,

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
                    .select(
                        "id, pin_number, first_name, last_name, calendar_id",
                    )
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
                    calendar_id: member.calendar_id,
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

        // Vacation week transfer methods
        fetchMemberApprovedWeeks: async (
            calendarId: string,
            pinNumber: number,
            year: number,
        ) => {
            if (!calendarId || !pinNumber || !year) {
                console.warn(
                    "[AdminMemberStore] fetchMemberApprovedWeeks: Missing required parameters",
                );
                return;
            }

            const cacheKey = `${calendarId}-${pinNumber}-${year}`;

            set((state) => ({
                isLoadingApprovedWeeks: true,
                transferError: null,
            }));

            try {
                console.log(
                    "[AdminMemberStore] Fetching member approved weeks:",
                    {
                        calendarId,
                        pinNumber,
                        year,
                    },
                );

                const { data, error } = await supabase.rpc(
                    "get_member_approved_weeks",
                    {
                        p_pin_number: pinNumber,
                        p_calendar_id: calendarId,
                        p_year: year,
                    },
                );

                if (error) throw error;

                const approvedWeeks: ApprovedVacationWeek[] = (data || []).map((
                    row: any,
                ) => ({
                    id: row.id,
                    start_date: row.start_date,
                    end_date: row.end_date,
                    requested_at: row.requested_at,
                    actioned_at: row.actioned_at,
                }));

                console.log("[AdminMemberStore] Fetched approved weeks:", {
                    count: approvedWeeks.length,
                    cacheKey,
                });

                set((state) => ({
                    memberApprovedWeeks: {
                        ...state.memberApprovedWeeks,
                        [cacheKey]: approvedWeeks,
                    },
                    isLoadingApprovedWeeks: false,
                }));
            } catch (error) {
                console.error(
                    "[AdminMemberStore] Error fetching member approved weeks:",
                    error,
                );
                set({
                    transferError: error instanceof Error
                        ? error.message
                        : "Failed to fetch approved weeks",
                    isLoadingApprovedWeeks: false,
                });
            }
        },
        fetchAvailableTransferWeeks: async (
            calendarId: string,
            year: number,
            excludeDate?: string,
        ) => {
            if (!calendarId || !year) {
                console.warn(
                    "[AdminMemberStore] fetchAvailableTransferWeeks: Missing required parameters",
                );
                return;
            }

            const cacheKey = `${calendarId}-${year}`;

            set((state) => ({
                isLoadingAvailableWeeks: true,
                transferError: null,
            }));

            try {
                console.log(
                    "[AdminMemberStore] Fetching available transfer weeks:",
                    {
                        calendarId,
                        year,
                        excludeDate,
                    },
                );

                const { data, error } = await supabase.rpc(
                    "get_available_weeks_for_transfer",
                    {
                        p_calendar_id: calendarId,
                        p_year: year,
                        p_exclude_start_date: excludeDate || null,
                    },
                );

                if (error) throw error;

                const availableWeeks: AvailableTransferWeek[] = (data || [])
                    .map((row: any) => ({
                        week_start_date: row.week_start_date,
                        max_allotment: row.max_allotment,
                        current_requests: row.current_requests,
                        available_slots: row.available_slots,
                        vac_year: row.vac_year,
                    }));

                console.log("[AdminMemberStore] Fetched available weeks:", {
                    count: availableWeeks.length,
                    cacheKey,
                });

                set((state) => ({
                    availableTransferWeeks: {
                        ...state.availableTransferWeeks,
                        [cacheKey]: availableWeeks,
                    },
                    isLoadingAvailableWeeks: false,
                }));
            } catch (error) {
                console.error(
                    "[AdminMemberStore] Error fetching available transfer weeks:",
                    error,
                );
                set({
                    transferError: error instanceof Error
                        ? error.message
                        : "Failed to fetch available weeks",
                    isLoadingAvailableWeeks: false,
                });
            }
        },
        transferVacationWeek: async (params: TransferVacationParams) => {
            if (
                !params.pin_number || !params.old_start_date ||
                !params.new_start_date ||
                !params.calendar_id || !params.admin_user_id
            ) {
                console.warn(
                    "[AdminMemberStore] transferVacationWeek: Missing required parameters",
                );
                set({
                    transferError: "Missing required parameters for transfer",
                });
                return false;
            }

            set({ transferError: null });

            try {
                console.log(
                    "[AdminMemberStore] Transferring vacation week:",
                    params,
                );

                const { data, error } = await supabase.rpc(
                    "transfer_vacation_week",
                    {
                        p_pin_number: params.pin_number,
                        p_old_start_date: params.old_start_date,
                        p_new_start_date: params.new_start_date,
                        p_calendar_id: params.calendar_id,
                        p_admin_user_id: params.admin_user_id,
                        p_reason: params.reason || "Admin transfer",
                    },
                );

                if (error) throw error;

                // Parse the JSON response from the RPC function
                const result = data;

                if (!result.success) {
                    console.error(
                        "[AdminMemberStore] Transfer failed:",
                        result.error,
                    );
                    set({ transferError: result.error });
                    return false;
                }

                console.log("[AdminMemberStore] Transfer successful:", result);

                // Refresh the data after successful transfer
                const state = get();

                // Refresh member approved weeks if we have them cached
                const approvedWeeksKey =
                    `${params.calendar_id}-${params.pin_number}-${
                        new Date().getFullYear()
                    }`;
                if (state.memberApprovedWeeks[approvedWeeksKey]) {
                    await state.fetchMemberApprovedWeeks(
                        params.calendar_id,
                        params.pin_number,
                        new Date().getFullYear(),
                    );
                }

                // Refresh available weeks if we have them cached
                const availableWeeksKey = `${params.calendar_id}-${
                    new Date().getFullYear()
                }`;
                if (state.availableTransferWeeks[availableWeeksKey]) {
                    await state.fetchAvailableTransferWeeks(
                        params.calendar_id,
                        new Date().getFullYear(),
                    );
                }

                return true;
            } catch (error) {
                console.error(
                    "[AdminMemberStore] Error transferring vacation week:",
                    error,
                );
                const errorMessage = error instanceof Error
                    ? error.message
                    : "Failed to transfer vacation week";
                set({ transferError: errorMessage });
                return false;
            }
        },
        clearTransferData: () => {
            console.log("[AdminMemberStore] Clearing transfer data");
            set({
                memberApprovedWeeks: {},
                availableTransferWeeks: {},
                isLoadingApprovedWeeks: false,
                isLoadingAvailableWeeks: false,
                transferError: null,
            });
        },
    }),
);

export type { AdminMemberManagementState, Calendar, MemberSummary };
