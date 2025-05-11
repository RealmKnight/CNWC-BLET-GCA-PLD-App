import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import {
    calculateMeetingOccurrences,
    generateICalendarData,
    validateMeetingPattern,
} from "@/utils/meetingDateCalculator";
import { addMonths, format, parseISO } from "date-fns";
import { RealtimeChannel } from "@supabase/supabase-js";

// Type definitions
export interface MeetingPattern {
    day_of_month?: number;
    day_of_week?: number;
    week_of_month?: number;
    time?: string;
    specific_dates?: { date: string; time: string }[];
    rules?: {
        rule_type: string;
        day_of_week?: number;
        week_of_month?: number;
        day_of_month?: number;
        time?: string;
    }[];
    current_rule_index?: number;
}

export interface DivisionMeeting {
    id: string;
    division_id: number;
    meeting_type: string;
    location_name: string;
    location_address: string;
    meeting_time: string;
    meeting_pattern_type:
        | "day_of_month"
        | "nth_day_of_month"
        | "specific_date"
        | "rotating";
    adjust_for_dst: boolean;
    meeting_pattern: MeetingPattern;
    meeting_frequency?: string;
    meeting_notes?: string;
    default_agenda?: string;
    time_zone: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    created_by: string;
    updated_by: string;
}

export interface MeetingOccurrence {
    id: string;
    meeting_pattern_id: string;
    original_scheduled_datetime_utc: string;
    actual_scheduled_datetime_utc: string;
    time_zone: string;
    location_name?: string;
    location_address?: string;
    agenda?: string;
    notes?: string;
    is_cancelled: boolean;
    override_reason?: string;
    created_at: string;
    updated_at: string;
    created_by: string;
    updated_by: string;
}

export interface MeetingMinute {
    id: string;
    meeting_id: string;
    meeting_date: string;
    content?: string;
    structured_content: any; // Define a more specific type later
    is_approved: boolean;
    is_archived: boolean;
    approval_date?: string;
    approved_by?: string;
    created_at: string;
    updated_at: string;
    created_by: string;
    updated_by: string;
}

// Add these additional interfaces to store form states
interface FormState {
    // Schedule form
    showPatternEditor: boolean;
    editingPattern: any | null;

    // Agenda form
    selectedAgendaType: "pattern" | "occurrence";
    editingAgenda: string;
    isEditingAgenda: boolean;
    currentOccurrenceId: string | null;

    // Minutes form
    showMinutesEditor: boolean;
    editingMinutes: any | null;
    selectedOccurrence: any | null;

    // Meeting Pattern Editor state
    meetingPatternEditorState?: {
        meetingType: string;
        meetingPatternType: DivisionMeeting["meeting_pattern_type"];
        locationName: string;
        locationAddress: string;
        defaultTime: string;
        timeZone: string;
        adjustForDst: boolean;
        notes: string;
        defaultAgenda: string;
        isActive: boolean;

        // Pattern-specific state
        dayOfMonth: string;
        nthDayOfWeek: string;
        nthWeekOfMonth: string;
        specificDates: Array<{ date: string; time: string }>;
        rotatingRules: Array<{
            rule_type: string;
            day_of_week?: number;
            week_of_month?: number;
            day_of_month?: number;
            time?: string;
        }>;

        // Preview state
        previewDate: string;
    };

    // Attendance form state
    attendanceState?: {
        attendees: Array<{
            memberId: string;
            memberName: string;
            isPresent: boolean;
            notes?: string;
        }>;
        meetingNotes: string;
        quorumMet: boolean;
    };

    // Additional states for other sub-components as needed
}

// Store state interface
interface DivisionMeetingState {
    // Data
    meetings: Record<string, DivisionMeeting[]>; // Meetings by division name
    occurrences: Record<string, MeetingOccurrence[]>; // Occurrences by meeting pattern ID
    meetingMinutes: Record<string, MeetingMinute[]>; // Minutes by meeting pattern ID
    selectedMeetingPatternId: string | null;
    selectedOccurrenceId: string | null;
    filteredMinutes: MeetingMinute[];
    searchTerm: string;
    dateRangeFilter: { start: Date | null; end: Date | null };
    currentPage: number;
    itemsPerPage: number;
    totalItems: number;
    isLoading: boolean;
    error: string | null;
    // Realtime subscriptions
    realtimeSubscriptions: {
        meetings: RealtimeChannel | null;
        occurrences: RealtimeChannel | null;
        minutes: RealtimeChannel | null;
    };
    // UI state persistence
    activeTabs: Record<string, string>; // Maps division name to active tab
    formStates: Record<string, FormState>; // Maps division name to form state

    // Actions
    fetchDivisionMeetings: (divisionName: string) => Promise<void>;
    fetchMeetingOccurrences: (
        patternId: string,
        dateRange?: { start: Date; end: Date },
    ) => Promise<void>;
    createMeetingPattern: (pattern: Partial<DivisionMeeting>) => Promise<void>;
    updateMeetingPattern: (
        id: string,
        pattern: Partial<DivisionMeeting>,
    ) => Promise<void>;
    overrideMeetingOccurrence: (
        id: string,
        occurrenceDetails: Partial<MeetingOccurrence>,
    ) => Promise<void>;
    cancelMeetingOccurrence: (id: string, reason: string) => Promise<void>;
    fetchMeetingMinutes: (occurrenceId: string, page?: number) => Promise<void>;
    searchMeetingMinutes: (
        searchTerm: string,
        dateRange?: { start: Date; end: Date },
        page?: number,
    ) => void;
    createMeetingMinutes: (minutes: Partial<MeetingMinute>) => Promise<void>;
    updateMeetingMinutes: (
        id: string,
        minutes: Partial<MeetingMinute>,
    ) => Promise<void>;
    approveMeetingMinutes: (id: string) => Promise<void>;
    archiveMeetingMinutes: (id: string) => Promise<void>;
    exportCalendar: (patternId: string) => Promise<string>;
    exportMinutesPdf: (minuteId: string) => Promise<void>;
    exportSchedulePdf: (
        patternId: string,
        dateRange: { start: Date; end: Date },
    ) => Promise<void>;
    setPage: (page: number) => void;
    setSearchTerm: (term: string) => void;
    setDateRangeFilter: (
        range: { start: Date | null; end: Date | null },
    ) => void;
    clearFilters: () => void;
    subscribeToRealtime: (divisionId?: number) => void;
    unsubscribeFromRealtime: () => void;
    setSelectedMeetingPatternId: (id: string | null) => void;
    setSelectedOccurrenceId: (id: string | null) => void;
    // UI state actions
    setActiveTab: (division: string, tab: string) => void;

    // Form state actions
    updateFormState: (division: string, updates: Partial<FormState>) => void;
    clearFormState: (division: string) => void;
}

export const useDivisionMeetingStore = create<DivisionMeetingState>((
    set,
    get,
) => ({
    // Initial state
    meetings: {},
    occurrences: {},
    meetingMinutes: {},
    selectedMeetingPatternId: null,
    selectedOccurrenceId: null,
    filteredMinutes: [],
    searchTerm: "",
    dateRangeFilter: { start: null, end: null },
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0,
    isLoading: false,
    error: null,
    realtimeSubscriptions: {
        meetings: null,
        occurrences: null,
        minutes: null,
    },
    // UI state persistence
    activeTabs: {},
    formStates: {},

    // Set selected IDs
    setSelectedMeetingPatternId: (id: string | null) => {
        set({ selectedMeetingPatternId: id });
    },

    setSelectedOccurrenceId: (id: string | null) => {
        set({ selectedOccurrenceId: id });
    },

    // Realtime subscription setup
    subscribeToRealtime: (divisionId?: number) => {
        const { unsubscribeFromRealtime } = get();

        // Clean up any existing subscriptions first
        unsubscribeFromRealtime();

        // Subscribe to division_meetings changes
        const meetingsChannel = supabase
            .channel("division-meetings-changes")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "division_meetings",
                ...(divisionId
                    ? { filter: `division_id=eq.${divisionId}` }
                    : {}),
            }, (payload) => {
                console.log("Division meetings change received:", payload);

                // Refresh all meetings for the affected division
                const state = get();
                const divisionName = Object.keys(state.meetings).find(
                    (division) =>
                        state.meetings[division].some(
                            (meeting) => meeting.division_id === divisionId,
                        ),
                );

                if (divisionName) {
                    get().fetchDivisionMeetings(divisionName);
                }
            })
            .subscribe();

        // Subscribe to meeting_occurrences changes for the selected pattern
        const occurrencesChannel = supabase
            .channel("meeting-occurrences-changes")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "meeting_occurrences",
            }, (payload) => {
                console.log("Meeting occurrences change received:", payload);

                const { selectedMeetingPatternId } = get();

                // If the change is for the currently selected pattern, refresh
                if (
                    selectedMeetingPatternId &&
                    payload.new &&
                    typeof payload.new === "object" &&
                    "meeting_pattern_id" in payload.new &&
                    payload.new.meeting_pattern_id === selectedMeetingPatternId
                ) {
                    get().fetchMeetingOccurrences(selectedMeetingPatternId);
                }
            })
            .subscribe();

        // Subscribe to meeting_minutes changes for the selected occurrence
        const minutesChannel = supabase
            .channel("meeting-minutes-changes")
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "meeting_minutes",
            }, (payload) => {
                console.log("Meeting minutes change received:", payload);

                const { selectedOccurrenceId } = get();

                // Refresh minutes if we're looking at the affected occurrence
                if (selectedOccurrenceId) {
                    get().fetchMeetingMinutes(selectedOccurrenceId);
                }
            })
            .subscribe();

        // Store the subscription channels
        set({
            realtimeSubscriptions: {
                meetings: meetingsChannel,
                occurrences: occurrencesChannel,
                minutes: minutesChannel,
            },
        });
    },

    // Unsubscribe from all realtime channels
    unsubscribeFromRealtime: () => {
        const { realtimeSubscriptions } = get();

        if (realtimeSubscriptions.meetings) {
            supabase.removeChannel(realtimeSubscriptions.meetings);
        }

        if (realtimeSubscriptions.occurrences) {
            supabase.removeChannel(realtimeSubscriptions.occurrences);
        }

        if (realtimeSubscriptions.minutes) {
            supabase.removeChannel(realtimeSubscriptions.minutes);
        }

        set({
            realtimeSubscriptions: {
                meetings: null,
                occurrences: null,
                minutes: null,
            },
        });
    },

    // Actions with actual Supabase calls
    fetchDivisionMeetings: async (divisionName: string) => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Fetching meetings for division: ${divisionName}`);

            // First, get the division_id from the divisions table
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("id")
                .eq("name", divisionName)
                .single();

            if (divisionError) throw divisionError;
            if (!divisionData) {
                throw new Error(`Division not found: ${divisionName}`);
            }

            const divisionId = divisionData.id;

            // Now fetch the meeting patterns for this division
            const { data, error } = await supabase
                .from("division_meetings")
                .select("*")
                .eq("division_id", divisionId);

            if (error) throw error;

            // Store the meetings in state
            set((state) => ({
                meetings: {
                    ...state.meetings,
                    [divisionName]: data || [],
                },
                isLoading: false,
            }));

            // If there are meetings, select the first one and fetch its occurrences
            if (data && data.length > 0) {
                const firstPattern = data[0];
                set({ selectedMeetingPatternId: firstPattern.id });

                // Fetch occurrences for the first pattern
                await get().fetchMeetingOccurrences(firstPattern.id);
            }

            // Set up realtime subscriptions for this division
            get().subscribeToRealtime(divisionId);
        } catch (error) {
            console.error("Error fetching division meetings:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    fetchMeetingOccurrences: async (
        patternId: string,
        dateRange?: { start: Date; end: Date },
    ) => {
        set({ isLoading: true, error: null });
        try {
            // Use provided date range or default to next 12 months
            const start = dateRange?.start || new Date();
            const end = dateRange?.end || addMonths(new Date(), 12);

            console.log(
                `Fetching occurrences for pattern: ${patternId} from ${
                    format(start, "yyyy-MM-dd")
                } to ${format(end, "yyyy-MM-dd")}`,
            );

            // Query occurrences within the date range
            const { data, error } = await supabase
                .from("meeting_occurrences")
                .select("*")
                .eq("meeting_pattern_id", patternId)
                .gte(
                    "actual_scheduled_datetime_utc",
                    format(start, "yyyy-MM-dd"),
                )
                .lte("actual_scheduled_datetime_utc", format(end, "yyyy-MM-dd"))
                .order("actual_scheduled_datetime_utc", { ascending: true });

            if (error) throw error;

            // Store the occurrences in state
            set((state) => ({
                occurrences: {
                    ...state.occurrences,
                    [patternId]: data || [],
                },
                isLoading: false,
            }));
        } catch (error) {
            console.error("Error fetching meeting occurrences:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    createMeetingPattern: async (pattern: Partial<DivisionMeeting>) => {
        set({ isLoading: true, error: null });
        try {
            console.log("Creating meeting pattern:", pattern);

            // Get current user for UUID fields
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error(
                    "You must be logged in to create meeting patterns",
                );
            }

            // Create a copy of the pattern with proper UUID values
            const patternWithUser = {
                ...pattern,
                created_by: user.id,
                updated_by: user.id,
            };

            // Validate the pattern
            if (
                !patternWithUser.division_id ||
                !patternWithUser.meeting_pattern_type ||
                !patternWithUser.time_zone
            ) {
                throw new Error(
                    "Invalid meeting pattern: Missing required fields",
                );
            }

            // Remove empty string IDs that should be generated by the database
            if (!patternWithUser.id || patternWithUser.id === "") {
                delete patternWithUser.id;
            }

            // Insert the pattern
            const { data, error } = await supabase
                .from("division_meetings")
                .insert([patternWithUser])
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to create meeting pattern");

            // Generate occurrences for the next 12 months
            const occurrencesPartial = calculateMeetingOccurrences(
                data as DivisionMeeting,
                new Date(),
                addMonths(new Date(), 12),
            );

            // Insert the new occurrences
            if (occurrencesPartial.length > 0) {
                // Complete the occurrences with proper user IDs and without database-generated fields
                const occurrences = occurrencesPartial.map((occ) => {
                    // Create a new object without the id field
                    const { id: occId, ...newOcc } = occ;

                    // Override meeting_pattern_id with the newly created pattern ID
                    newOcc.meeting_pattern_id = data.id;

                    // Set user IDs for created_by and updated_by
                    newOcc.created_by = user.id;
                    newOcc.updated_by = user.id;

                    return newOcc;
                });

                const { error: occurrencesError } = await supabase
                    .from("meeting_occurrences")
                    .insert(occurrences);

                if (occurrencesError) throw occurrencesError;
            }

            // Update the state
            set((state) => {
                // Find the division this pattern belongs to
                const divisionName = Object.keys(state.meetings).find(
                    (division) =>
                        state.meetings[division].some((meeting) =>
                            meeting.division_id === pattern.division_id
                        ),
                );

                if (!divisionName) return state; // Division not found

                return {
                    meetings: {
                        ...state.meetings,
                        [divisionName]: [
                            ...(state.meetings[divisionName] || []),
                            data as DivisionMeeting,
                        ],
                    },
                    selectedMeetingPatternId: data.id,
                    isLoading: false,
                };
            });

            // Fetch the newly created occurrences
            await get().fetchMeetingOccurrences(data.id);
        } catch (error) {
            console.error("Error creating meeting pattern:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    updateMeetingPattern: async (
        id: string,
        pattern: Partial<DivisionMeeting>,
    ) => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Updating meeting pattern ${id}:`, pattern);

            // Get current user for UUID fields
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                throw new Error(
                    "You must be logged in to update meeting patterns",
                );
            }

            // Create a copy of the pattern with proper UUID values
            const patternWithUser = {
                ...pattern,
                updated_by: user.id,
            };

            // Make sure no empty string UUIDs are being passed
            if (
                !patternWithUser.created_by || patternWithUser.created_by === ""
            ) {
                patternWithUser.created_by = user.id;
            }

            // Update the pattern
            const { data, error } = await supabase
                .from("division_meetings")
                .update(patternWithUser)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to update meeting pattern");

            // Handle regeneration of future occurrences
            // This is a more complex operation that will delete and replace future occurrences
            const now = new Date();

            // First, delete future occurrences that haven't been overridden
            const { error: deleteError } = await supabase.rpc(
                "delete_future_non_overridden_occurrences",
                {
                    pattern_id: id,
                    from_date: format(now, "yyyy-MM-dd"),
                },
            );

            if (deleteError) {
                // If RPC function doesn't exist yet, try direct approach
                console.warn(
                    "RPC function failed, trying direct delete:",
                    deleteError,
                );

                // Try simpler approach - delete all future occurrences
                const { error: fallbackError } = await supabase
                    .from("meeting_occurrences")
                    .delete()
                    .eq("meeting_pattern_id", id)
                    .gte(
                        "actual_scheduled_datetime_utc",
                        format(now, "yyyy-MM-dd"),
                    );

                if (fallbackError) throw fallbackError;
            }

            // Generate new occurrences for the next 12 months
            const occurrencesPartial = calculateMeetingOccurrences(
                data as DivisionMeeting,
                now,
                addMonths(now, 12),
            );

            // Insert the new occurrences
            if (occurrencesPartial.length > 0) {
                // Complete the occurrences with proper user IDs and without database-generated fields
                const occurrences = occurrencesPartial.map((occ) => {
                    // Create a new object without the id field
                    const { id: occId, ...newOcc } = occ;

                    // Override meeting_pattern_id with the pattern ID parameter
                    newOcc.meeting_pattern_id = id; // This is the pattern ID passed to the function

                    // Set user IDs for created_by and updated_by
                    newOcc.created_by = user.id;
                    newOcc.updated_by = user.id;

                    return newOcc;
                });

                const { error: occurrencesError } = await supabase
                    .from("meeting_occurrences")
                    .insert(occurrences);

                if (occurrencesError) throw occurrencesError;
            }

            // Update the state
            set((state) => {
                // Find the division this pattern belongs to
                const divisionName = Object.keys(state.meetings).find(
                    (division) =>
                        state.meetings[division].some((meeting) =>
                            meeting.id === id
                        ),
                );

                if (!divisionName) return state; // Division not found

                return {
                    meetings: {
                        ...state.meetings,
                        [divisionName]: state.meetings[divisionName].map(
                            (meeting) =>
                                meeting.id === id
                                    ? { ...meeting, ...data }
                                    : meeting,
                        ),
                    },
                    isLoading: false,
                };
            });

            // Fetch the updated occurrences
            await get().fetchMeetingOccurrences(id);
        } catch (error) {
            console.error("Error updating meeting pattern:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    overrideMeetingOccurrence: async (
        id: string,
        occurrenceDetails: Partial<MeetingOccurrence>,
    ) => {
        set({ isLoading: true, error: null });
        try {
            console.log(
                `Overriding meeting occurrence ${id}:`,
                occurrenceDetails,
            );

            // Update the occurrence
            const { data, error } = await supabase
                .from("meeting_occurrences")
                .update(occurrenceDetails)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to override meeting occurrence");

            // Update the state
            set((state) => {
                const patternId = data.meeting_pattern_id;

                return {
                    occurrences: {
                        ...state.occurrences,
                        [patternId]: (state.occurrences[patternId] || []).map(
                            (occurrence) =>
                                occurrence.id === id
                                    ? { ...occurrence, ...data }
                                    : occurrence,
                        ),
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error overriding meeting occurrence:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    cancelMeetingOccurrence: async (id: string, reason: string) => {
        set({ isLoading: true, error: null });
        try {
            console.log(
                `Cancelling meeting occurrence ${id} with reason: ${reason}`,
            );

            // Update the occurrence to mark it as cancelled
            const { data, error } = await supabase
                .from("meeting_occurrences")
                .update({
                    is_cancelled: true,
                    override_reason: reason,
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to cancel meeting occurrence");

            // Update the state
            set((state) => {
                const patternId = data.meeting_pattern_id;

                return {
                    occurrences: {
                        ...state.occurrences,
                        [patternId]: (state.occurrences[patternId] || []).map(
                            (occurrence) =>
                                occurrence.id === id
                                    ? { ...occurrence, ...data }
                                    : occurrence,
                        ),
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error cancelling meeting occurrence:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    fetchMeetingMinutes: async (occurrenceId: string, page = 1) => {
        set({ isLoading: true, error: null, currentPage: page });
        try {
            console.log(
                `Fetching minutes for occurrence ${occurrenceId}, page ${page}`,
            );

            // First, get the meeting pattern ID for this occurrence
            const { data: occurrenceData, error: occurrenceError } =
                await supabase
                    .from("meeting_occurrences")
                    .select("meeting_pattern_id, actual_scheduled_datetime_utc")
                    .eq("id", occurrenceId)
                    .single();

            if (occurrenceError) throw occurrenceError;
            if (!occurrenceData) {
                throw new Error(`Occurrence not found: ${occurrenceId}`);
            }

            const patternId = occurrenceData.meeting_pattern_id;
            const meetingDate =
                occurrenceData.actual_scheduled_datetime_utc.split("T")[0]; // Extract date part

            // Calculate pagination
            const from = (page - 1) * get().itemsPerPage;
            const to = from + get().itemsPerPage - 1;

            // Query minutes for this meeting date
            const { data, error, count } = await supabase
                .from("meeting_minutes")
                .select("*", { count: "exact" })
                .eq("meeting_id", patternId)
                .eq("meeting_date", meetingDate)
                .order("created_at", { ascending: false })
                .range(from, to);

            if (error) throw error;

            // Store the minutes in state
            set((state) => ({
                meetingMinutes: {
                    ...state.meetingMinutes,
                    [occurrenceId]: data || [],
                },
                totalItems: count || 0,
                isLoading: false,
            }));
        } catch (error) {
            console.error("Error fetching meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    searchMeetingMinutes: async (
        searchTerm: string,
        dateRange?: { start: Date; end: Date },
        page = 1,
    ) => {
        set({
            isLoading: true,
            error: null,
            searchTerm,
            currentPage: page,
            dateRangeFilter: dateRange
                ? {
                    start: dateRange.start,
                    end: dateRange.end,
                }
                : get().dateRangeFilter,
        });

        try {
            console.log(`Searching minutes with term: ${searchTerm}`);

            // Calculate pagination
            const from = (page - 1) * get().itemsPerPage;
            const to = from + get().itemsPerPage - 1;

            // Build the query
            let query = supabase
                .from("meeting_minutes")
                .select("*", { count: "exact" });

            // Add text search if provided
            if (searchTerm) {
                query = query.textSearch("content", searchTerm);
            }

            // Add date range filter if provided
            if (dateRange?.start) {
                query = query.gte(
                    "meeting_date",
                    format(dateRange.start, "yyyy-MM-dd"),
                );
            }
            if (dateRange?.end) {
                query = query.lte(
                    "meeting_date",
                    format(dateRange.end, "yyyy-MM-dd"),
                );
            }

            // Add pagination and order
            query = query
                .order("meeting_date", { ascending: false })
                .range(from, to);

            // Execute the query
            const { data, error, count } = await query;

            if (error) throw error;

            // Store the filtered minutes in state
            set({
                filteredMinutes: data || [],
                totalItems: count || 0,
                isLoading: false,
            });
        } catch (error) {
            console.error("Error searching meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    createMeetingMinutes: async (minutes: Partial<MeetingMinute>) => {
        set({ isLoading: true, error: null });
        try {
            console.log("Creating meeting minutes:", minutes);

            // Insert the minutes
            const { data, error } = await supabase
                .from("meeting_minutes")
                .insert([minutes])
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to create meeting minutes");

            // Update the state
            set((state) => {
                const occurrenceId = get().selectedOccurrenceId;
                if (!occurrenceId) return state; // No selected occurrence

                return {
                    meetingMinutes: {
                        ...state.meetingMinutes,
                        [occurrenceId]: [
                            data as MeetingMinute,
                            ...(state.meetingMinutes[occurrenceId] || []),
                        ],
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error creating meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    updateMeetingMinutes: async (
        id: string,
        minutes: Partial<MeetingMinute>,
    ) => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Updating meeting minutes ${id}:`, minutes);

            // Update the minutes
            const { data, error } = await supabase
                .from("meeting_minutes")
                .update(minutes)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to update meeting minutes");

            // Update the state
            set((state) => {
                const occurrenceId = get().selectedOccurrenceId;
                if (!occurrenceId) return state; // No selected occurrence

                return {
                    meetingMinutes: {
                        ...state.meetingMinutes,
                        [occurrenceId]:
                            (state.meetingMinutes[occurrenceId] || []).map(
                                (minute) =>
                                    minute.id === id
                                        ? { ...minute, ...data }
                                        : minute,
                            ),
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error updating meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    approveMeetingMinutes: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Approving meeting minutes ${id}`);

            // Get current user ID (assuming it's available from auth)
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            // Update the minutes to mark as approved
            const { data, error } = await supabase
                .from("meeting_minutes")
                .update({
                    is_approved: true,
                    approval_date: new Date().toISOString(),
                    approved_by: user.id,
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to approve meeting minutes");

            // Update the state
            set((state) => {
                const occurrenceId = get().selectedOccurrenceId;
                if (!occurrenceId) return state; // No selected occurrence

                return {
                    meetingMinutes: {
                        ...state.meetingMinutes,
                        [occurrenceId]:
                            (state.meetingMinutes[occurrenceId] || []).map(
                                (minute) =>
                                    minute.id === id
                                        ? { ...minute, ...data }
                                        : minute,
                            ),
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error approving meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    archiveMeetingMinutes: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Archiving meeting minutes ${id}`);

            // Update the minutes to mark as archived
            const { data, error } = await supabase
                .from("meeting_minutes")
                .update({
                    is_archived: true,
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to archive meeting minutes");

            // Update the state
            set((state) => {
                const occurrenceId = get().selectedOccurrenceId;
                if (!occurrenceId) return state; // No selected occurrence

                return {
                    meetingMinutes: {
                        ...state.meetingMinutes,
                        [occurrenceId]:
                            (state.meetingMinutes[occurrenceId] || []).map(
                                (minute) =>
                                    minute.id === id
                                        ? { ...minute, ...data }
                                        : minute,
                            ),
                    },
                    isLoading: false,
                };
            });
        } catch (error) {
            console.error("Error archiving meeting minutes:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    exportCalendar: async (patternId: string): Promise<string> => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Exporting calendar for pattern: ${patternId}`);

            // Fetch the meeting pattern
            const { data: patternData, error: patternError } = await supabase
                .from("division_meetings")
                .select("*")
                .eq("id", patternId)
                .single();

            if (patternError) throw patternError;
            if (!patternData) {
                throw new Error(`Meeting pattern not found: ${patternId}`);
            }

            // Fetch upcoming occurrences
            const { data: occurrencesData, error: occurrencesError } =
                await supabase
                    .from("meeting_occurrences")
                    .select("*")
                    .eq("meeting_pattern_id", patternId)
                    .gte(
                        "actual_scheduled_datetime_utc",
                        format(new Date(), "yyyy-MM-dd"),
                    )
                    .order("actual_scheduled_datetime_utc", {
                        ascending: true,
                    });

            if (occurrencesError) throw occurrencesError;

            // Generate iCalendar data
            const icalData = generateICalendarData(
                occurrencesData || [],
                patternData as DivisionMeeting,
            );

            set({ isLoading: false });
            return icalData;
        } catch (error) {
            console.error("Error exporting calendar:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
            return "";
        }
    },

    exportMinutesPdf: async (minuteId: string): Promise<void> => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Exporting PDF for minutes: ${minuteId}`);

            // Get the minutes data
            const { data: minutesData, error: minutesError } = await supabase
                .from("meeting_minutes")
                .select("*")
                .eq("id", minuteId)
                .single();

            if (minutesError) throw minutesError;
            if (!minutesData) {
                throw new Error(`Meeting minutes not found: ${minuteId}`);
            }

            // Get the division name for the PDF title
            const { data: patternData, error: patternError } = await supabase
                .from("division_meetings")
                .select("division_id")
                .eq("id", minutesData.meeting_id)
                .single();

            if (patternError) throw patternError;
            if (!patternData) {
                throw new Error(
                    `Meeting pattern not found for minutes: ${minuteId}`,
                );
            }

            // Get the division name from division_id
            const { data: divisionData, error: divisionError } = await supabase
                .from("divisions")
                .select("name")
                .eq("id", patternData.division_id)
                .single();

            if (divisionError) throw divisionError;
            if (!divisionData) {
                throw new Error(
                    `Division not found for pattern: ${minutesData.meeting_id}`,
                );
            }

            // Import and use the platform-appropriate PDF generator
            const { generateMinutesPdf } = await import(
                "@/components/admin/division/minutesPdfGenerator"
            );
            await generateMinutesPdf(
                minutesData as MeetingMinute,
                divisionData.name,
            );

            set({ isLoading: false });
        } catch (error) {
            console.error("Error exporting minutes PDF:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    exportSchedulePdf: async (
        patternId: string,
        dateRange: { start: Date; end: Date },
    ): Promise<void> => {
        set({ isLoading: true, error: null });
        try {
            console.log(`Exporting schedule PDF for pattern: ${patternId}`);

            // In a real implementation, this would call a PDF generation utility
            // and trigger a download or sharing action

            // We'll mark as not implemented for now
            console.log("Schedule PDF export not yet implemented");

            set({ isLoading: false });
        } catch (error) {
            console.error("Error exporting schedule PDF:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
                isLoading: false,
            });
        }
    },

    setPage: (page: number) => {
        set({ currentPage: page });

        // If we're searching, refresh the search with the new page
        const { searchTerm, dateRangeFilter } = get();
        const selectedOccurrenceId = get().selectedOccurrenceId;

        if (searchTerm || (dateRangeFilter.start && dateRangeFilter.end)) {
            // Only pass date range if both start and end are non-null
            const validDateRange = dateRangeFilter.start && dateRangeFilter.end
                ? {
                    start: dateRangeFilter.start as Date,
                    end: dateRangeFilter.end as Date,
                }
                : undefined;

            get().searchMeetingMinutes(
                searchTerm,
                validDateRange,
                page,
            );
        } else if (selectedOccurrenceId) {
            // Otherwise refresh the current minutes view
            get().fetchMeetingMinutes(selectedOccurrenceId, page);
        }
    },

    setSearchTerm: (term: string) => {
        set({ searchTerm: term });

        const { dateRangeFilter } = get();
        // Only pass date range if both start and end are non-null
        const validDateRange = dateRangeFilter.start && dateRangeFilter.end
            ? {
                start: dateRangeFilter.start as Date,
                end: dateRangeFilter.end as Date,
            }
            : undefined;

        get().searchMeetingMinutes(
            term,
            validDateRange,
            1, // Reset to first page
        );
    },

    setDateRangeFilter: (range: { start: Date | null; end: Date | null }) => {
        set({ dateRangeFilter: range });

        // Only apply filter if both dates are set
        if (range.start && range.end) {
            get().searchMeetingMinutes(
                get().searchTerm,
                {
                    start: range.start as Date,
                    end: range.end as Date,
                },
                1, // Reset to first page
            );
        }
    },

    clearFilters: () => {
        set({
            searchTerm: "",
            dateRangeFilter: { start: null, end: null },
            currentPage: 1,
            filteredMinutes: [],
        });

        // If there's a selected occurrence, refresh its minutes
        const selectedOccurrenceId = get().selectedOccurrenceId;
        if (selectedOccurrenceId) {
            get().fetchMeetingMinutes(selectedOccurrenceId, 1);
        }
    },

    // UI state actions
    setActiveTab: (division: string, tab: string) => {
        set((state) => ({
            activeTabs: {
                ...state.activeTabs,
                [division]: tab,
            },
        }));
    },

    // Form state actions
    updateFormState: (division: string, updates: Partial<FormState>) => {
        set((state) => ({
            formStates: {
                ...state.formStates,
                [division]: {
                    ...((state.formStates[division] || {
                        // Default values for form state
                        showPatternEditor: false,
                        editingPattern: null,
                        selectedAgendaType: "pattern",
                        editingAgenda: "",
                        isEditingAgenda: false,
                        currentOccurrenceId: null,
                        showMinutesEditor: false,
                        editingMinutes: null,
                        selectedOccurrence: null,
                    }) as FormState),
                    ...updates,
                },
            },
        }));
    },

    clearFormState: (division: string) => {
        set((state) => {
            const { [division]: _, ...restFormStates } = state.formStates;
            return {
                formStates: restFormStates,
            };
        });
    },
}));
