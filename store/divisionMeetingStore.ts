import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import {
    calculateMeetingOccurrences,
    generateICalendarData,
    validateMeetingPattern,
} from "@/utils/meetingDateCalculator";
import { addMonths, format, parseISO } from "date-fns";
import { RealtimeChannel } from "@supabase/supabase-js";
import { createRealtimeCallback } from "@/utils/realtimeErrorHandler";

// Division context validation helper
const validateDivisionContext = async (
    meetingId: string,
    expectedDivisionName?: string,
): Promise<boolean> => {
    if (!expectedDivisionName) return true;

    try {
        const { data } = await supabase
            .from("division_meetings")
            .select("division_id, divisions(name)")
            .eq("id", meetingId)
            .single();

        return (data?.divisions as any)?.name === expectedDivisionName;
    } catch (error) {
        console.error("Error validating division context:", error);
        return false;
    }
};

// Enhanced error handling with division context
const handleDivisionError = (
    error: Error,
    divisionName?: string,
    operation?: string,
): string => {
    const contextualMessage = divisionName
        ? `Error in ${divisionName} ${operation}: ${error.message}`
        : `Error in ${operation}: ${error.message}`;

    console.error(contextualMessage, error);
    return contextualMessage;
};

// Validate that occurrence belongs to the same division as the pattern
const validateOccurrenceConsistency = async (
    occurrenceId: string,
    patternId: string,
): Promise<boolean> => {
    try {
        const { data } = await supabase
            .from("meeting_occurrences")
            .select("meeting_pattern_id")
            .eq("id", occurrenceId)
            .single();

        if (data?.meeting_pattern_id !== patternId) {
            console.error(
                `Occurrence consistency validation failed: occurrence ${occurrenceId} belongs to pattern ${data?.meeting_pattern_id}, expected ${patternId}`,
            );
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error validating occurrence consistency:", error);
        return false;
    }
};

// Validate that minutes belong to the correct meeting pattern
const validateMinutesConsistency = async (
    minutesId: string,
    expectedPatternId: string,
): Promise<boolean> => {
    try {
        const { data } = await supabase
            .from("meeting_minutes")
            .select("meeting_id")
            .eq("id", minutesId)
            .single();

        if (data?.meeting_id !== expectedPatternId) {
            console.error(
                `Minutes consistency validation failed: minutes ${minutesId} belongs to pattern ${data?.meeting_id}, expected ${expectedPatternId}`,
            );
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error validating minutes consistency:", error);
        return false;
    }
};

// Validate division data integrity
const validateDivisionDataIntegrity = async (
    divisionName: string,
): Promise<{
    isValid: boolean;
    issues: string[];
}> => {
    const issues: string[] = [];

    try {
        // Get division ID
        const { data: divisionData } = await supabase
            .from("divisions")
            .select("id")
            .eq("name", divisionName)
            .single();

        if (!divisionData) {
            issues.push(`Division '${divisionName}' not found`);
            return { isValid: false, issues };
        }

        const divisionId = divisionData.id;

        // Check for orphaned meeting occurrences
        const { data: orphanedOccurrences } = await supabase
            .from("meeting_occurrences")
            .select("id, meeting_pattern_id")
            .not(
                "meeting_pattern_id",
                "in",
                `(SELECT id FROM division_meetings WHERE division_id = ${divisionId})`,
            );

        if (orphanedOccurrences && orphanedOccurrences.length > 0) {
            issues.push(
                `Found ${orphanedOccurrences.length} orphaned meeting occurrences for division ${divisionName}`,
            );
        }

        // Check for orphaned meeting minutes
        const { data: orphanedMinutes } = await supabase
            .from("meeting_minutes")
            .select("id, meeting_id")
            .not(
                "meeting_id",
                "in",
                `(SELECT id FROM division_meetings WHERE division_id = ${divisionId})`,
            );

        if (orphanedMinutes && orphanedMinutes.length > 0) {
            issues.push(
                `Found ${orphanedMinutes.length} orphaned meeting minutes for division ${divisionName}`,
            );
        }

        return {
            isValid: issues.length === 0,
            issues,
        };
    } catch (error) {
        console.error("Error validating division data integrity:", error);
        issues.push(`Error validating division data integrity: ${error}`);
        return { isValid: false, issues };
    }
};

// Add these new interfaces for change preview
export interface MeetingChangePreview {
    currentOccurrences: MeetingOccurrence[];
    newOccurrences: MeetingOccurrence[];
    changedOccurrences: Array<{
        existing: MeetingOccurrence;
        updated: MeetingOccurrence;
        changes: string[];
    }>;
    removedOccurrences: MeetingOccurrence[];
    addedOccurrences: MeetingOccurrence[];
    duplicateWarnings: Array<{
        date: string;
        time: string;
        conflictsWith: string[];
    }>;
    summary: {
        totalChanges: number;
        affectedDates: number;
        hasConflicts: boolean;
        hasRemovals: boolean;
    };
}

export interface DuplicateCheckResult {
    hasDuplicates: boolean;
    duplicates: Array<{
        date: string;
        time: string;
        existingPatternId: string;
        existingPatternName: string;
        conflictType: "exact_time" | "overlapping_time" | "same_day";
    }>;
    warnings: string[];
}

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
    currentDivisionContext: string | null; // NEW: Track current division context
    loadingOperation: string | null; // Track what operation is currently loading
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
        divisionName?: string,
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
    subscribeToRealtime: (divisionName?: string) => Promise<void>;
    unsubscribeFromRealtime: () => void;
    setSelectedMeetingPatternId: (id: string | null) => void;
    setSelectedOccurrenceId: (id: string | null) => void;
    // Division context actions
    setDivisionContext: (divisionName: string | null) => void;
    // Data integrity validation
    validateDivisionDataIntegrity: (divisionName: string) => Promise<{
        isValid: boolean;
        issues: string[];
    }>;
    // UI state actions
    setActiveTab: (division: string, tab: string) => void;

    // Form state actions
    updateFormState: (division: string, updates: Partial<FormState>) => void;
    clearFormState: (division: string) => void;
    // Loading state management
    setLoadingState: (isLoading: boolean, operation?: string) => void;

    // NEW: Preview and duplicate checking functions
    previewMeetingPatternChanges: (
        patternId: string,
        newPattern: Partial<DivisionMeeting>,
    ) => Promise<MeetingChangePreview>;
    checkForDuplicates: (
        divisionId: number,
        newPattern: Partial<DivisionMeeting>,
        excludePatternId?: string,
    ) => Promise<DuplicateCheckResult>;
    validatePatternUpdate: (
        patternId: string,
        newPattern: Partial<DivisionMeeting>,
    ) => Promise<{
        isValid: boolean;
        preview: MeetingChangePreview;
        duplicateCheck: DuplicateCheckResult;
        warnings: string[];
        errors: string[];
    }>;
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
    currentDivisionContext: null,
    loadingOperation: null,
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

    // Division context actions
    setDivisionContext: (divisionName: string | null) => {
        set({ currentDivisionContext: divisionName });
    },

    // Data integrity validation
    validateDivisionDataIntegrity: async (divisionName: string) => {
        return await validateDivisionDataIntegrity(divisionName);
    },

    // Enhanced realtime subscription setup with improved division filtering
    subscribeToRealtime: async (divisionName?: string) => {
        const { unsubscribeFromRealtime } = get();

        // Clean up any existing subscriptions first
        unsubscribeFromRealtime();

        console.log(
            `[Realtime] Setting up subscriptions for division: ${
                divisionName || "ALL"
            }`,
        );

        // Get division ID for filtering if division name is provided
        let divisionId: number | undefined;
        let divisionMeetingPatternIds: string[] = [];

        if (divisionName) {
            try {
                // Fetch division ID from database to ensure accuracy
                const { data: divisionData, error: divisionError } =
                    await supabase
                        .from("divisions")
                        .select("id")
                        .eq("name", divisionName)
                        .single();

                if (divisionError) {
                    console.error(
                        `[Realtime] Error fetching division ID for ${divisionName}:`,
                        divisionError,
                    );
                } else if (divisionData) {
                    divisionId = divisionData.id;

                    // Get all meeting pattern IDs for this division for more precise filtering
                    const divisionMeetings = get().meetings[divisionName] || [];
                    divisionMeetingPatternIds = divisionMeetings.map(
                        (meeting) => meeting.id,
                    );

                    console.log(
                        `[Realtime] Division ${divisionName} (ID: ${divisionId}) has ${divisionMeetingPatternIds.length} meeting patterns`,
                    );
                }
            } catch (error) {
                console.error(
                    `[Realtime] Exception getting division data for ${divisionName}:`,
                    error,
                );
            }
        }

        // Create unique channel names to avoid conflicts
        const channelSuffix = divisionName
            ? `-${divisionName.toLowerCase().replace(/\s+/g, "-")}`
            : "-global";

        // Subscribe to division_meetings changes with enhanced filtering
        const meetingsChannel = supabase
            .channel(`division-meetings-changes${channelSuffix}`)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "division_meetings",
                ...(divisionId
                    ? { filter: `division_id=eq.${divisionId}` }
                    : {}),
            }, (payload) => {
                console.log(
                    `[Realtime] Division meetings change received for ${
                        divisionName || "ALL"
                    }:`,
                    {
                        event: payload.eventType,
                        table: payload.table,
                        recordId: (payload.new as any)?.id ||
                            (payload.old as any)?.id,
                        divisionId: (payload.new as any)?.division_id ||
                            (payload.old as any)?.division_id,
                    },
                );

                // Validate that this change is relevant to our division context
                const changeDivisionId = (payload.new as any)?.division_id ||
                    (payload.old as any)?.division_id;
                if (
                    divisionId && changeDivisionId &&
                    changeDivisionId !== divisionId
                ) {
                    console.log(
                        `[Realtime] Ignoring change for different division (expected: ${divisionId}, got: ${changeDivisionId})`,
                    );
                    return;
                }

                // Refresh the appropriate division's data
                if (divisionName) {
                    console.log(
                        `[Realtime] Refreshing meetings for division: ${divisionName}`,
                    );
                    get().fetchDivisionMeetings(divisionName);
                } else {
                    // Find the affected division and refresh it
                    const state = get();
                    const affectedDivisionName = Object.keys(state.meetings)
                        .find((division) =>
                            state.meetings[division].some((meeting) =>
                                meeting.division_id === changeDivisionId
                            )
                        );

                    if (affectedDivisionName) {
                        console.log(
                            `[Realtime] Refreshing meetings for affected division: ${affectedDivisionName}`,
                        );
                        get().fetchDivisionMeetings(affectedDivisionName);
                    }
                }
            })
            .subscribe(createRealtimeCallback(
                "DivisionMeetings",
                // onError callback
                (status, err) => {
                    console.error(
                        `[Realtime] Division meetings subscription error: ${status}`,
                        err,
                    );
                },
                // onSuccess callback
                (status) => {
                    console.log(
                        `[Realtime] Division meetings subscription status: ${status}`,
                    );
                },
            ));

        // Subscribe to meeting_occurrences changes with enhanced division filtering
        const occurrencesChannel = supabase
            .channel(`meeting-occurrences-changes${channelSuffix}`)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "meeting_occurrences",
                // Filter by meeting pattern IDs if we have them for more precise filtering
                ...(divisionMeetingPatternIds.length > 0
                    ? {
                        filter: `meeting_pattern_id=in.(${
                            divisionMeetingPatternIds.join(",")
                        })`,
                    }
                    : {}),
            }, async (payload) => {
                console.log(
                    `[Realtime] Meeting occurrences change received for ${
                        divisionName || "ALL"
                    }:`,
                    {
                        event: payload.eventType,
                        table: payload.table,
                        recordId: (payload.new as any)?.id ||
                            (payload.old as any)?.id,
                        patternId: (payload.new as any)?.meeting_pattern_id ||
                            (payload.old as any)?.meeting_pattern_id,
                    },
                );

                const { selectedMeetingPatternId, currentDivisionContext } =
                    get();
                const changePatternId =
                    (payload.new as any)?.meeting_pattern_id ||
                    (payload.old as any)?.meeting_pattern_id;

                // Validate that this change is relevant to our division context
                if (
                    divisionMeetingPatternIds.length > 0 && changePatternId &&
                    !divisionMeetingPatternIds.includes(changePatternId)
                ) {
                    console.log(
                        `[Realtime] Ignoring occurrence change for different division pattern`,
                    );
                    return;
                }

                // If the change is for the currently selected pattern, refresh occurrences
                if (
                    selectedMeetingPatternId &&
                    changePatternId === selectedMeetingPatternId
                ) {
                    console.log(
                        `[Realtime] Refreshing occurrences for selected pattern: ${selectedMeetingPatternId}`,
                    );
                    get().fetchMeetingOccurrences(selectedMeetingPatternId);
                }

                // Refresh search results if we're in the relevant division context
                const contextToRefresh = currentDivisionContext || divisionName;
                if (contextToRefresh) {
                    const { searchTerm, dateRangeFilter } = get();
                    if (
                        searchTerm ||
                        (dateRangeFilter.start && dateRangeFilter.end)
                    ) {
                        console.log(
                            `[Realtime] Refreshing search results for division: ${contextToRefresh}`,
                        );
                        const validDateRange =
                            dateRangeFilter.start && dateRangeFilter.end
                                ? {
                                    start: dateRangeFilter.start as Date,
                                    end: dateRangeFilter.end as Date,
                                }
                                : undefined;

                        get().searchMeetingMinutes(
                            searchTerm,
                            contextToRefresh,
                            validDateRange,
                            get().currentPage,
                        );
                    }
                }
            })
            .subscribe(createRealtimeCallback(
                "MeetingOccurrences",
                // onError callback
                (status, err) => {
                    console.error(
                        `[Realtime] Meeting occurrences subscription error: ${status}`,
                        err,
                    );
                },
                // onSuccess callback
                (status) => {
                    console.log(
                        `[Realtime] Meeting occurrences subscription status: ${status}`,
                    );
                },
            ));

        // Subscribe to meeting_minutes changes with enhanced division filtering
        const minutesChannel = supabase
            .channel(`meeting-minutes-changes${channelSuffix}`)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "meeting_minutes",
                // Filter by meeting pattern IDs if we have them
                ...(divisionMeetingPatternIds.length > 0
                    ? {
                        filter: `meeting_id=in.(${
                            divisionMeetingPatternIds.join(",")
                        })`,
                    }
                    : {}),
            }, async (payload) => {
                console.log(
                    `[Realtime] Meeting minutes change received for ${
                        divisionName || "ALL"
                    }:`,
                    {
                        event: payload.eventType,
                        table: payload.table,
                        recordId: (payload.new as any)?.id ||
                            (payload.old as any)?.id,
                        meetingId: (payload.new as any)?.meeting_id ||
                            (payload.old as any)?.meeting_id,
                    },
                );

                const { selectedOccurrenceId, currentDivisionContext } = get();
                const changeMeetingId = (payload.new as any)?.meeting_id ||
                    (payload.old as any)?.meeting_id;

                // Validate that this change is relevant to our division context
                if (
                    divisionMeetingPatternIds.length > 0 && changeMeetingId &&
                    !divisionMeetingPatternIds.includes(changeMeetingId)
                ) {
                    console.log(
                        `[Realtime] Ignoring minutes change for different division meeting`,
                    );
                    return;
                }

                // Refresh minutes if we're looking at the affected occurrence
                if (selectedOccurrenceId) {
                    console.log(
                        `[Realtime] Refreshing minutes for selected occurrence: ${selectedOccurrenceId}`,
                    );
                    get().fetchMeetingMinutes(selectedOccurrenceId);
                }

                // Refresh search results if we're in the relevant division context
                const contextToRefresh = currentDivisionContext || divisionName;
                if (contextToRefresh) {
                    const { searchTerm, dateRangeFilter } = get();
                    if (
                        searchTerm ||
                        (dateRangeFilter.start && dateRangeFilter.end)
                    ) {
                        console.log(
                            `[Realtime] Refreshing search results for division: ${contextToRefresh}`,
                        );
                        const validDateRange =
                            dateRangeFilter.start && dateRangeFilter.end
                                ? {
                                    start: dateRangeFilter.start as Date,
                                    end: dateRangeFilter.end as Date,
                                }
                                : undefined;

                        get().searchMeetingMinutes(
                            searchTerm,
                            contextToRefresh,
                            validDateRange,
                            get().currentPage,
                        );
                    }
                }
            })
            .subscribe(createRealtimeCallback(
                "MeetingMinutes",
                // onError callback
                (status, err) => {
                    console.error(
                        `[Realtime] Meeting minutes subscription error: ${status}`,
                        err,
                    );
                },
                // onSuccess callback
                (status) => {
                    console.log(
                        `[Realtime] Meeting minutes subscription status: ${status}`,
                    );
                },
            ));

        // Store the subscription channels
        set({
            realtimeSubscriptions: {
                meetings: meetingsChannel,
                occurrences: occurrencesChannel,
                minutes: minutesChannel,
            },
        });

        console.log(
            `[Realtime] Successfully set up ${
                divisionName ? "division-specific" : "global"
            } subscriptions`,
        );
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
        get().setLoadingState(
            true,
            `Loading meetings for Division ${divisionName}`,
        );
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
            }));
            get().setLoadingState(false);

            // If there are meetings, select the first one and fetch its occurrences
            if (data && data.length > 0) {
                const firstPattern = data[0];
                set({ selectedMeetingPatternId: firstPattern.id });

                // Fetch occurrences for the first pattern (both past and future)
                await get().fetchMeetingOccurrences(firstPattern.id, {
                    start: addMonths(new Date(), -12),
                    end: addMonths(new Date(), 12),
                });
            }

            // Set up realtime subscriptions for this division
            get().subscribeToRealtime(divisionName);
        } catch (error) {
            const errorMessage = handleDivisionError(
                error instanceof Error ? error : new Error(String(error)),
                divisionName,
                "fetching meetings",
            );
            set({
                error: errorMessage,
            });
            get().setLoadingState(false);
        }
    },

    fetchMeetingOccurrences: async (
        patternId: string,
        dateRange?: { start: Date; end: Date },
        includePastMeetings: boolean = true,
    ) => {
        get().setLoadingState(true, "Loading meeting occurrences");
        try {
            // Default end date is always 12 months in the future
            const end = dateRange?.end || addMonths(new Date(), 12);

            // For start date:
            // - If includePastMeetings is true, default to 12 months in the past
            // - Otherwise use provided date or current date
            const start = dateRange?.start ||
                (includePastMeetings ? addMonths(new Date(), -12) : new Date());

            console.log(
                `Fetching occurrences for pattern: ${patternId} from ${
                    format(start, "yyyy-MM-dd")
                } to ${format(end, "yyyy-MM-dd")}`,
            );

            // Build the query
            let query = supabase
                .from("meeting_occurrences")
                .select("*")
                .eq("meeting_pattern_id", patternId)
                .order("actual_scheduled_datetime_utc", { ascending: true });

            // Apply date filters if specified
            if (start) {
                query = query.gte(
                    "actual_scheduled_datetime_utc",
                    format(start, "yyyy-MM-dd"),
                );
            }

            if (end) {
                query = query.lte(
                    "actual_scheduled_datetime_utc",
                    format(end, "yyyy-MM-dd"),
                );
            }

            const { data, error } = await query;

            if (error) throw error;

            // Store the occurrences in state
            set((state) => ({
                occurrences: {
                    ...state.occurrences,
                    [patternId]: data || [],
                },
            }));
            get().setLoadingState(false);
        } catch (error) {
            console.error("Error fetching meeting occurrences:", error);
            set({
                error: error instanceof Error ? error.message : String(error),
            });
            get().setLoadingState(false);
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

            // Validate division context if available
            const { currentDivisionContext } = get();
            if (currentDivisionContext && pattern.division_id) {
                // Verify the division_id matches the current context
                const { data: divisionData } = await supabase
                    .from("divisions")
                    .select("name")
                    .eq("id", pattern.division_id)
                    .single();

                if (divisionData?.name !== currentDivisionContext) {
                    throw new Error(
                        `Cannot create meeting pattern: division mismatch. Expected ${currentDivisionContext}, got ${divisionData?.name}`,
                    );
                }
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
                user.id,
            );

            // Insert the new occurrences
            if (occurrencesPartial.length > 0) {
                // Complete the occurrences with proper meeting_pattern_id and without database-generated fields
                const occurrences = occurrencesPartial.map((occ) => {
                    // Create a new object without the id field
                    const { id: occId, ...newOcc } = occ;

                    // Override meeting_pattern_id with the newly created pattern ID
                    newOcc.meeting_pattern_id = data.id;

                    return newOcc;
                });

                console.log(
                    "divisionMeetingStore: Occurrences to be inserted:",
                    JSON.stringify(occurrences.slice(0, 3), null, 2),
                ); // Log first 3 occurrences

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
            const { currentDivisionContext } = get();
            const errorMessage = handleDivisionError(
                error instanceof Error ? error : new Error(String(error)),
                currentDivisionContext || undefined,
                "creating meeting pattern",
            );
            set({
                error: errorMessage,
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

            // Validate division context before updating
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                const isValidContext = await validateDivisionContext(
                    id,
                    currentDivisionContext,
                );

                if (!isValidContext) {
                    throw new Error(
                        `Cannot update meeting pattern: pattern does not belong to division ${currentDivisionContext}`,
                    );
                }
            }

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

            // First update the pattern
            const { data, error } = await supabase
                .from("division_meetings")
                .update(patternWithUser)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            if (!data) throw new Error("Failed to update meeting pattern");

            // Calculate next 12 months of occurrences based on updated pattern
            const now = new Date();
            const occurrencesFromPattern = calculateMeetingOccurrences(
                data as DivisionMeeting,
                now,
                addMonths(now, 12),
                user.id,
            );

            // Fetch existing occurrences for this pattern
            const { data: existingOccurrences, error: fetchError } =
                await supabase
                    .from("meeting_occurrences")
                    .select("*")
                    .eq("meeting_pattern_id", id)
                    .gte(
                        "actual_scheduled_datetime_utc",
                        format(now, "yyyy-MM-dd"),
                    );

            if (fetchError) throw fetchError;

            // Map existing occurrences by their scheduled date for easy lookup
            const existingOccurrenceMap = new Map<string, any>();
            (existingOccurrences || []).forEach((occurrence) => {
                // Create a date-only key for comparison
                const dateKey =
                    occurrence.actual_scheduled_datetime_utc.split("T")[0];
                existingOccurrenceMap.set(dateKey, occurrence);
            });

            // Separate occurrences to update and insert
            const occurrencesToUpdate: any[] = [];
            const occurrencesToInsert: any[] = [];

            occurrencesFromPattern.forEach((newOccurrence) => {
                // Create a date-only key to match with existing occurrences
                const dateKey =
                    newOccurrence.actual_scheduled_datetime_utc.split("T")[0];
                const existingOccurrence = existingOccurrenceMap.get(dateKey);

                if (existingOccurrence) {
                    // Only update if the existing occurrence hasn't been modified
                    if (
                        existingOccurrence.original_scheduled_datetime_utc ===
                            existingOccurrence.actual_scheduled_datetime_utc
                    ) {
                        // Update with new values but keep the existing ID
                        occurrencesToUpdate.push({
                            id: existingOccurrence.id,
                            meeting_pattern_id: id,
                            original_scheduled_datetime_utc:
                                newOccurrence.original_scheduled_datetime_utc,
                            actual_scheduled_datetime_utc:
                                newOccurrence.actual_scheduled_datetime_utc,
                            time_zone: newOccurrence.time_zone,
                            location_name: newOccurrence.location_name,
                            location_address: newOccurrence.location_address,
                            agenda: newOccurrence.agenda,
                            notes: existingOccurrence.notes, // Keep existing notes
                            is_cancelled: existingOccurrence.is_cancelled, // Keep cancelled status
                            override_reason: existingOccurrence.override_reason, // Keep override reason
                            created_by: existingOccurrence.created_by, // Keep existing created_by
                            updated_by: user.id,
                        });
                    }
                    // Remove this date from the map to track occurrences that need to be processed
                    existingOccurrenceMap.delete(dateKey);
                } else {
                    // This is a new occurrence, prepare for insertion
                    occurrencesToInsert.push(newOccurrence);
                }
            });

            // Process updates in batches if needed
            if (occurrencesToUpdate.length > 0) {
                console.log(
                    `Updating ${occurrencesToUpdate.length} existing occurrences`,
                );

                // Update in batches of 50 to avoid potential issues with large updates
                for (let i = 0; i < occurrencesToUpdate.length; i += 50) {
                    const batch = occurrencesToUpdate.slice(i, i + 50);

                    // Update each record individually to avoid created_by issues
                    for (const occurrence of batch) {
                        const { id: occurrenceId, ...updateData } = occurrence;
                        const { error: updateError } = await supabase
                            .from("meeting_occurrences")
                            .update(updateData)
                            .eq("id", occurrenceId);

                        if (updateError) throw updateError;
                    }
                }
            }

            // Process inserts
            if (occurrencesToInsert.length > 0) {
                console.log(
                    `Inserting ${occurrencesToInsert.length} new occurrences`,
                );

                // Insert in batches of 50
                for (let i = 0; i < occurrencesToInsert.length; i += 50) {
                    const batch = occurrencesToInsert.slice(i, i + 50);
                    const { error: insertError } = await supabase
                        .from("meeting_occurrences")
                        .insert(batch);

                    if (insertError) throw insertError;
                }
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

            // Validate division context for the occurrence
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                // Get the meeting pattern ID for this occurrence
                const { data: occurrenceData } = await supabase
                    .from("meeting_occurrences")
                    .select("meeting_pattern_id")
                    .eq("id", id)
                    .single();

                if (occurrenceData?.meeting_pattern_id) {
                    const isValidContext = await validateDivisionContext(
                        occurrenceData.meeting_pattern_id,
                        currentDivisionContext,
                    );

                    if (!isValidContext) {
                        throw new Error(
                            `Cannot override occurrence: meeting does not belong to division ${currentDivisionContext}`,
                        );
                    }
                }
            }

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

            // Validate division context for the occurrence
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                // Get the meeting pattern ID for this occurrence
                const { data: occurrenceData } = await supabase
                    .from("meeting_occurrences")
                    .select("meeting_pattern_id")
                    .eq("id", id)
                    .single();

                if (occurrenceData?.meeting_pattern_id) {
                    const isValidContext = await validateDivisionContext(
                        occurrenceData.meeting_pattern_id,
                        currentDivisionContext,
                    );

                    if (!isValidContext) {
                        throw new Error(
                            `Cannot cancel occurrence: meeting does not belong to division ${currentDivisionContext}`,
                        );
                    }
                }
            }

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
        divisionName?: string,
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
            console.log(
                `Searching minutes with term: ${searchTerm}${
                    divisionName ? ` for division: ${divisionName}` : ""
                }`,
            );

            // Get division's meeting pattern IDs first if division is specified
            if (divisionName) {
                const divisionMeetings = get().meetings[divisionName] || [];
                const patternIds = divisionMeetings.map((m) => m.id);

                if (patternIds.length === 0) {
                    // No meetings for this division, return empty
                    set({
                        filteredMinutes: [],
                        totalItems: 0,
                        isLoading: false,
                    });
                    return;
                }

                // Calculate pagination
                const from = (page - 1) * get().itemsPerPage;
                const to = from + get().itemsPerPage - 1;

                // Build the query with division filtering
                let query = supabase
                    .from("meeting_minutes")
                    .select("*", { count: "exact" })
                    .in("meeting_id", patternIds);

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
            } else {
                // Original behavior for global search (when no division specified)
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
            }
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

            // Validate division context if available
            const { currentDivisionContext } = get();
            if (currentDivisionContext && minutes.meeting_id) {
                const isValidContext = await validateDivisionContext(
                    minutes.meeting_id,
                    currentDivisionContext,
                );

                if (!isValidContext) {
                    throw new Error(
                        `Meeting minutes cannot be created: meeting does not belong to division ${currentDivisionContext}`,
                    );
                }
            }

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

            // Validate division context for the minutes
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                // Get the meeting ID for these minutes
                const { data: minutesData } = await supabase
                    .from("meeting_minutes")
                    .select("meeting_id")
                    .eq("id", id)
                    .single();

                if (minutesData?.meeting_id) {
                    const isValidContext = await validateDivisionContext(
                        minutesData.meeting_id,
                        currentDivisionContext,
                    );

                    if (!isValidContext) {
                        throw new Error(
                            `Cannot update minutes: meeting does not belong to division ${currentDivisionContext}`,
                        );
                    }
                }
            }

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

            // Validate division context for the minutes
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                // Get the meeting ID for these minutes
                const { data: minutesData } = await supabase
                    .from("meeting_minutes")
                    .select("meeting_id")
                    .eq("id", id)
                    .single();

                if (minutesData?.meeting_id) {
                    const isValidContext = await validateDivisionContext(
                        minutesData.meeting_id,
                        currentDivisionContext,
                    );

                    if (!isValidContext) {
                        throw new Error(
                            `Cannot approve minutes: meeting does not belong to division ${currentDivisionContext}`,
                        );
                    }
                }
            }

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

            // Validate division context for the minutes
            const { currentDivisionContext } = get();
            if (currentDivisionContext) {
                // Get the meeting ID for these minutes
                const { data: minutesData } = await supabase
                    .from("meeting_minutes")
                    .select("meeting_id")
                    .eq("id", id)
                    .single();

                if (minutesData?.meeting_id) {
                    const isValidContext = await validateDivisionContext(
                        minutesData.meeting_id,
                        currentDivisionContext,
                    );

                    if (!isValidContext) {
                        throw new Error(
                            `Cannot archive minutes: meeting does not belong to division ${currentDivisionContext}`,
                        );
                    }
                }
            }

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
                get().currentDivisionContext || undefined,
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
            get().currentDivisionContext || undefined,
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
                get().currentDivisionContext || undefined,
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

    // Loading state management
    setLoadingState: (isLoading: boolean, operation?: string) => {
        set({
            isLoading,
            loadingOperation: isLoading ? operation || null : null,
        });
    },

    // NEW: Preview and duplicate checking functions
    previewMeetingPatternChanges: async (
        patternId: string,
        newPattern: Partial<DivisionMeeting>,
    ): Promise<MeetingChangePreview> => {
        try {
            // Get current pattern
            const { data: currentPattern, error: fetchError } = await supabase
                .from("division_meetings")
                .select("*")
                .eq("id", patternId)
                .single();

            if (fetchError) throw fetchError;
            if (!currentPattern) throw new Error("Meeting pattern not found");

            // Get current occurrences
            const { data: currentOccurrences, error: occurrencesError } =
                await supabase
                    .from("meeting_occurrences")
                    .select("*")
                    .eq("meeting_pattern_id", patternId)
                    .gte(
                        "actual_scheduled_datetime_utc",
                        format(new Date(), "yyyy-MM-dd"),
                    );

            if (occurrencesError) throw occurrencesError;

            // Create merged pattern for calculation
            const mergedPattern = {
                ...currentPattern,
                ...newPattern,
            } as DivisionMeeting;

            // Calculate new occurrences
            const now = new Date();
            const endDate = addMonths(now, 12);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const newOccurrences = calculateMeetingOccurrences(
                mergedPattern,
                now,
                endDate,
                user.id,
            );

            // Compare occurrences
            const currentOccurrenceMap = new Map<string, MeetingOccurrence>();
            (currentOccurrences || []).forEach((occ) => {
                const dateKey = occ.actual_scheduled_datetime_utc.split("T")[0];
                currentOccurrenceMap.set(dateKey, occ);
            });

            const newOccurrenceMap = new Map<string, MeetingOccurrence>();
            newOccurrences.forEach((occ) => {
                const dateKey = occ.actual_scheduled_datetime_utc.split("T")[0];
                newOccurrenceMap.set(dateKey, occ);
            });

            const changedOccurrences: Array<{
                existing: MeetingOccurrence;
                updated: MeetingOccurrence;
                changes: string[];
            }> = [];

            const addedOccurrences: MeetingOccurrence[] = [];
            const removedOccurrences: MeetingOccurrence[] = [];

            // Find changes and additions
            newOccurrenceMap.forEach((newOcc, dateKey) => {
                const existing = currentOccurrenceMap.get(dateKey);
                if (existing) {
                    const changes: string[] = [];
                    if (
                        existing.actual_scheduled_datetime_utc !==
                            newOcc.actual_scheduled_datetime_utc
                    ) {
                        changes.push("Time changed");
                    }
                    if (existing.location_name !== newOcc.location_name) {
                        changes.push("Location changed");
                    }
                    if (existing.time_zone !== newOcc.time_zone) {
                        changes.push("Timezone changed");
                    }
                    if (changes.length > 0) {
                        changedOccurrences.push({
                            existing,
                            updated: newOcc,
                            changes,
                        });
                    }
                } else {
                    addedOccurrences.push(newOcc);
                }
            });

            // Find removals
            currentOccurrenceMap.forEach((existing, dateKey) => {
                if (!newOccurrenceMap.has(dateKey)) {
                    removedOccurrences.push(existing);
                }
            });

            // Check for duplicates with other patterns
            const duplicateWarnings: Array<{
                date: string;
                time: string;
                conflictsWith: string[];
            }> = [];

            // Get all other patterns in the same division
            const { data: otherPatterns, error: otherPatternsError } =
                await supabase
                    .from("division_meetings")
                    .select("*")
                    .eq("division_id", mergedPattern.division_id)
                    .neq("id", patternId)
                    .eq("is_active", true);

            if (otherPatternsError) throw otherPatternsError;

            if (otherPatterns) {
                for (const otherPattern of otherPatterns) {
                    const otherOccurrences = calculateMeetingOccurrences(
                        otherPattern as DivisionMeeting,
                        now,
                        endDate,
                        user.id,
                    );

                    newOccurrences.forEach((newOcc) => {
                        const newDate =
                            newOcc.actual_scheduled_datetime_utc.split("T")[0];
                        const newTime =
                            newOcc.actual_scheduled_datetime_utc.split("T")[1];

                        otherOccurrences.forEach((otherOcc) => {
                            const otherDate =
                                otherOcc.actual_scheduled_datetime_utc.split(
                                    "T",
                                )[0];
                            const otherTime =
                                otherOcc.actual_scheduled_datetime_utc.split(
                                    "T",
                                )[1];

                            if (
                                newDate === otherDate && newTime === otherTime
                            ) {
                                const existing = duplicateWarnings.find((w) =>
                                    w.date === newDate && w.time === newTime
                                );
                                if (existing) {
                                    existing.conflictsWith.push(
                                        otherPattern.meeting_type || "Unknown",
                                    );
                                } else {
                                    duplicateWarnings.push({
                                        date: newDate,
                                        time: newTime,
                                        conflictsWith: [
                                            otherPattern.meeting_type ||
                                            "Unknown",
                                        ],
                                    });
                                }
                            }
                        });
                    });
                }
            }

            return {
                currentOccurrences: currentOccurrences || [],
                newOccurrences,
                changedOccurrences,
                removedOccurrences,
                addedOccurrences,
                duplicateWarnings,
                summary: {
                    totalChanges: changedOccurrences.length +
                        addedOccurrences.length + removedOccurrences.length,
                    affectedDates: new Set([
                        ...changedOccurrences.map((c) =>
                            c.existing.actual_scheduled_datetime_utc.split(
                                "T",
                            )[0]
                        ),
                        ...addedOccurrences.map((a) =>
                            a.actual_scheduled_datetime_utc.split("T")[0]
                        ),
                        ...removedOccurrences.map((r) =>
                            r.actual_scheduled_datetime_utc.split("T")[0]
                        ),
                    ]).size,
                    hasConflicts: duplicateWarnings.length > 0,
                    hasRemovals: removedOccurrences.length > 0,
                },
            };
        } catch (error) {
            console.error("Error previewing meeting pattern changes:", error);
            throw error;
        }
    },

    checkForDuplicates: async (
        divisionId: number,
        newPattern: Partial<DivisionMeeting>,
        excludePatternId?: string,
    ): Promise<DuplicateCheckResult> => {
        try {
            // Get all active patterns in the division
            let query = supabase
                .from("division_meetings")
                .select("*")
                .eq("division_id", divisionId)
                .eq("is_active", true);

            if (excludePatternId) {
                query = query.neq("id", excludePatternId);
            }

            const { data: existingPatterns, error } = await query;
            if (error) throw error;

            if (!existingPatterns || existingPatterns.length === 0) {
                return {
                    hasDuplicates: false,
                    duplicates: [],
                    warnings: [],
                };
            }

            // Calculate occurrences for the new pattern
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const now = new Date();
            const endDate = addMonths(now, 12);

            // Create a temporary pattern object for calculation
            const tempPattern = {
                id: "temp",
                division_id: divisionId,
                meeting_type: newPattern.meeting_type || "regular",
                location_name: newPattern.location_name || "",
                location_address: newPattern.location_address || "",
                meeting_time: newPattern.meeting_time || "19:00:00",
                meeting_pattern_type: newPattern.meeting_pattern_type ||
                    "nth_day_of_month",
                adjust_for_dst: newPattern.adjust_for_dst || false,
                meeting_pattern: newPattern.meeting_pattern || {},
                time_zone: newPattern.time_zone || "America/Chicago",
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_by: user.id,
                updated_by: user.id,
            } as DivisionMeeting;

            const newOccurrences = calculateMeetingOccurrences(
                tempPattern,
                now,
                endDate,
                user.id,
            );

            const duplicates: Array<{
                date: string;
                time: string;
                existingPatternId: string;
                existingPatternName: string;
                conflictType: "exact_time" | "overlapping_time" | "same_day";
            }> = [];

            const warnings: string[] = [];

            // Check against each existing pattern
            for (const existingPattern of existingPatterns) {
                const existingOccurrences = calculateMeetingOccurrences(
                    existingPattern as DivisionMeeting,
                    now,
                    endDate,
                    user.id,
                );

                newOccurrences.forEach((newOcc) => {
                    const newDateTime = new Date(
                        newOcc.actual_scheduled_datetime_utc,
                    );
                    const newDate = format(newDateTime, "yyyy-MM-dd");
                    const newTime = format(newDateTime, "HH:mm");

                    existingOccurrences.forEach((existingOcc) => {
                        const existingDateTime = new Date(
                            existingOcc.actual_scheduled_datetime_utc,
                        );
                        const existingDate = format(
                            existingDateTime,
                            "yyyy-MM-dd",
                        );
                        const existingTime = format(existingDateTime, "HH:mm");

                        if (newDate === existingDate) {
                            if (newTime === existingTime) {
                                duplicates.push({
                                    date: newDate,
                                    time: newTime,
                                    existingPatternId: existingPattern.id,
                                    existingPatternName:
                                        existingPattern.meeting_type ||
                                        "Unknown",
                                    conflictType: "exact_time",
                                });
                            } else {
                                // Check for overlapping times (within 1 hour)
                                const timeDiff = Math.abs(
                                    newDateTime.getTime() -
                                        existingDateTime.getTime(),
                                );
                                const hourInMs = 60 * 60 * 1000;

                                if (timeDiff < hourInMs) {
                                    duplicates.push({
                                        date: newDate,
                                        time: newTime,
                                        existingPatternId: existingPattern.id,
                                        existingPatternName:
                                            existingPattern.meeting_type ||
                                            "Unknown",
                                        conflictType: "overlapping_time",
                                    });
                                } else {
                                    duplicates.push({
                                        date: newDate,
                                        time: newTime,
                                        existingPatternId: existingPattern.id,
                                        existingPatternName:
                                            existingPattern.meeting_type ||
                                            "Unknown",
                                        conflictType: "same_day",
                                    });
                                }
                            }
                        }
                    });
                });
            }

            // Generate warnings
            if (duplicates.length > 0) {
                const exactTimeConflicts = duplicates.filter((d) =>
                    d.conflictType === "exact_time"
                ).length;
                const overlappingTimeConflicts = duplicates.filter((d) =>
                    d.conflictType === "overlapping_time"
                ).length;
                const sameDayConflicts = duplicates.filter((d) =>
                    d.conflictType === "same_day"
                ).length;

                if (exactTimeConflicts > 0) {
                    warnings.push(
                        `${exactTimeConflicts} meeting(s) scheduled at exactly the same time as existing meetings`,
                    );
                }
                if (overlappingTimeConflicts > 0) {
                    warnings.push(
                        `${overlappingTimeConflicts} meeting(s) scheduled within 1 hour of existing meetings`,
                    );
                }
                if (sameDayConflicts > 0) {
                    warnings.push(
                        `${sameDayConflicts} meeting(s) scheduled on the same day as existing meetings`,
                    );
                }
            }

            return {
                hasDuplicates: duplicates.length > 0,
                duplicates,
                warnings,
            };
        } catch (error) {
            console.error("Error checking for duplicates:", error);
            throw error;
        }
    },

    validatePatternUpdate: async (
        patternId: string,
        newPattern: Partial<DivisionMeeting>,
    ): Promise<{
        isValid: boolean;
        preview: MeetingChangePreview;
        duplicateCheck: DuplicateCheckResult;
        warnings: string[];
        errors: string[];
    }> => {
        try {
            const errors: string[] = [];
            const warnings: string[] = [];

            // Get current pattern to determine division
            const { data: currentPattern, error: fetchError } = await supabase
                .from("division_meetings")
                .select("division_id")
                .eq("id", patternId)
                .single();

            if (fetchError) {
                errors.push("Could not fetch current meeting pattern");
                throw fetchError;
            }

            // Run preview and duplicate check in parallel
            const [preview, duplicateCheck] = await Promise.all([
                get().previewMeetingPatternChanges(patternId, newPattern),
                get().checkForDuplicates(
                    currentPattern.division_id,
                    newPattern,
                    patternId,
                ),
            ]);

            // Validate the changes
            if (
                preview.summary.hasRemovals &&
                preview.removedOccurrences.length > 5
            ) {
                warnings.push(
                    `This change will remove ${preview.removedOccurrences.length} scheduled meetings`,
                );
            }

            if (preview.summary.totalChanges > 10) {
                warnings.push(
                    `This change will affect ${preview.summary.totalChanges} meetings`,
                );
            }

            if (duplicateCheck.hasDuplicates) {
                const exactConflicts = duplicateCheck.duplicates.filter((d) =>
                    d.conflictType === "exact_time"
                );
                if (exactConflicts.length > 0) {
                    errors.push(
                        `${exactConflicts.length} meetings would conflict with existing meetings at the exact same time`,
                    );
                }
                warnings.push(...duplicateCheck.warnings);
            }

            // Additional validation rules
            if (newPattern.meeting_pattern_type === "specific_date") {
                const specificDates = newPattern.meeting_pattern
                    ?.specific_dates;
                if (!specificDates || specificDates.length === 0) {
                    errors.push(
                        "Specific date pattern requires at least one date",
                    );
                }
            }

            if (newPattern.meeting_pattern_type === "day_of_month") {
                const dayOfMonth = newPattern.meeting_pattern?.day_of_month;
                if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31) {
                    errors.push("Day of month must be between 1 and 31");
                }
            }

            if (newPattern.meeting_pattern_type === "nth_day_of_month") {
                const dayOfWeek = newPattern.meeting_pattern?.day_of_week;
                const weekOfMonth = newPattern.meeting_pattern?.week_of_month;
                if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
                    errors.push(
                        "Day of week must be between 0 (Sunday) and 6 (Saturday)",
                    );
                }
                if (
                    weekOfMonth === undefined || weekOfMonth < 1 ||
                    weekOfMonth > 5
                ) {
                    errors.push("Week of month must be between 1 and 5");
                }
            }

            return {
                isValid: errors.length === 0,
                preview,
                duplicateCheck,
                warnings,
                errors,
            };
        } catch (error) {
            console.error("Error validating pattern update:", error);
            return {
                isValid: false,
                preview: {
                    currentOccurrences: [],
                    newOccurrences: [],
                    changedOccurrences: [],
                    removedOccurrences: [],
                    addedOccurrences: [],
                    duplicateWarnings: [],
                    summary: {
                        totalChanges: 0,
                        affectedDates: 0,
                        hasConflicts: false,
                        hasRemovals: false,
                    },
                },
                duplicateCheck: {
                    hasDuplicates: false,
                    duplicates: [],
                    warnings: [],
                },
                warnings: [],
                errors: [
                    error instanceof Error
                        ? error.message
                        : "Unknown error occurred",
                ],
            };
        }
    },
}));
