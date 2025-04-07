import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { format, isValid, parseISO } from "date-fns";

interface ZoneCalendar {
    id: number;
    zone_id: string;
    division_id: string;
    start_date: string;
    end_date: string;
    max_requests: number;
    current_requests?: number;
}

interface ZoneCalendarState {
    zoneCalendars: ZoneCalendar[];
    isLoading: boolean;
    error: string | null;
    fetchZoneCalendars: () => Promise<void>;
    setZoneCalendars: (calendars: ZoneCalendar[]) => void;
    updateZoneCalendar: (calendar: ZoneCalendar) => Promise<void>;
    getCalendarsByZone: (zoneId: string) => ZoneCalendar[];
    getCalendarsByDateRange: (
        startDate: string,
        endDate: string,
    ) => ZoneCalendar[];
    validateCalendarDates: (startDate: string, endDate: string) => boolean;
    hasOverlappingCalendars: (
        zoneId: string,
        startDate: string,
        endDate: string,
    ) => boolean;
    isRequestAvailable: (zoneId: string, requestDate: string) => boolean;
    getRemainingRequests: (zoneId: string, requestDate: string) => number;
    reset: () => void;
}

export const useZoneCalendarStore = create<ZoneCalendarState>((set, get) => ({
    zoneCalendars: [],
    isLoading: false,
    error: null,

    fetchZoneCalendars: async () => {
        set({ isLoading: true, error: null });

        try {
            const { data, error } = await supabase
                .from("zone_calendars")
                .select("*");

            if (error) throw error;

            set({ zoneCalendars: data || [], isLoading: false });
        } catch (error) {
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to fetch zone calendars",
                isLoading: false,
            });
        }
    },

    setZoneCalendars: (calendars) => {
        set({ zoneCalendars: calendars });
    },

    updateZoneCalendar: async (calendar) => {
        set({ isLoading: true, error: null });

        try {
            const { data, error } = await supabase
                .from("zone_calendars")
                .update(calendar)
                .eq("id", calendar.id);

            if (error) throw error;

            if (data) {
                const updatedCalendars = get().zoneCalendars.map((cal) =>
                    cal.id === calendar.id ? calendar : cal
                );
                set({ zoneCalendars: updatedCalendars });
            }

            set({ isLoading: false });
        } catch (error) {
            set({
                error: error instanceof Error
                    ? error.message
                    : "Failed to update zone calendar",
                isLoading: false,
            });
        }
    },

    getCalendarsByZone: (zoneId) => {
        return get().zoneCalendars.filter((calendar) =>
            calendar.zone_id === zoneId
        );
    },

    getCalendarsByDateRange: (startDate, endDate) => {
        return get().zoneCalendars.filter((calendar) => {
            const calendarStart = parseISO(calendar.start_date);
            const calendarEnd = parseISO(calendar.end_date);
            const rangeStart = parseISO(startDate);
            const rangeEnd = parseISO(endDate);

            return (
                calendarStart <= rangeEnd &&
                calendarEnd >= rangeStart
            );
        });
    },

    validateCalendarDates: (startDate, endDate) => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);

        return isValid(start) && isValid(end) && start <= end;
    },

    hasOverlappingCalendars: (zoneId, startDate, endDate) => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);

        return get().zoneCalendars.some((calendar) => {
            if (calendar.zone_id !== zoneId) return false;

            const calendarStart = parseISO(calendar.start_date);
            const calendarEnd = parseISO(calendar.end_date);

            return (
                calendarStart <= end &&
                calendarEnd >= start
            );
        });
    },

    isRequestAvailable: (zoneId, requestDate) => {
        const date = parseISO(requestDate);
        const formattedDate = format(date, "yyyy-MM-dd");

        const calendar = get().zoneCalendars.find((cal) => {
            const start = parseISO(cal.start_date);
            const end = parseISO(cal.end_date);
            return (
                cal.zone_id === zoneId &&
                start <= date &&
                end >= date
            );
        });

        if (!calendar) return false;

        return (calendar.current_requests || 0) < calendar.max_requests;
    },

    getRemainingRequests: (zoneId, requestDate) => {
        const date = parseISO(requestDate);
        const formattedDate = format(date, "yyyy-MM-dd");

        const calendar = get().zoneCalendars.find((cal) => {
            const start = parseISO(cal.start_date);
            const end = parseISO(cal.end_date);
            return (
                cal.zone_id === zoneId &&
                start <= date &&
                end >= date
            );
        });

        if (!calendar) return 0;

        return calendar.max_requests - (calendar.current_requests || 0);
    },

    reset: () => {
        set({
            zoneCalendars: [],
            isLoading: false,
            error: null,
        });
    },
}));
