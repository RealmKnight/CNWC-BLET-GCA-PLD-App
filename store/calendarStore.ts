import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isBefore, isAfter, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export interface DayRequest {
  id: string;
  member_id: string;
  division: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied";
  requested_at: string;
  waitlist_position?: number;
  responded_at?: string;
  responded_by?: string;
  paid_in_lieu?: boolean;
  member?: {
    first_name: string;
    last_name: string;
  };
}

export interface DayAllotment {
  id: string;
  division: string;
  date: string;
  max_allotment: number;
  current_requests: number;
  year?: number;
}

interface CalendarState {
  selectedDate: string | null;
  allotments: Record<string, number>;
  yearlyAllotments: Record<number, number>;
  requests: Record<string, DayRequest[]>;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Actions
  setSelectedDate: (date: string | null) => void;
  setAllotments: (date: string, allotment: DayAllotment) => void;
  setRequests: (date: string, requests: DayRequest[]) => void;
  setError: (error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;

  // Computed
  isDateSelectable: (date: string) => boolean;
  getDateAvailability: (date: string) => "available" | "limited" | "full" | "unavailable";

  // Data fetching
  fetchAllotments: (
    startDate: string,
    endDate: string
  ) => Promise<{ allotments: Record<string, number>; yearlyAllotments: Record<number, number> }>;
  fetchRequests: (startDate: string, endDate: string) => Promise<Record<string, DayRequest[]>>;
  submitRequest: (date: string, type: "PLD" | "SDV") => Promise<void>;
  loadInitialData: (startDate: string, endDate: string) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  selectedDate: null,
  allotments: {},
  yearlyAllotments: {},
  requests: {},
  isLoading: false,
  error: null,
  isInitialized: false,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setAllotments: (date, allotment) =>
    set((state) => ({
      allotments: { ...state.allotments, [date]: allotment.max_allotment },
    })),
  setRequests: (date, requests) =>
    set((state) => ({
      requests: { ...state.requests, [date]: requests },
    })),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),

  isDateSelectable: (date: string) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);

    // Calculate 48 hours from now
    const fortyEightHoursFromNow = addDays(now, 2);

    // Calculate exactly 6 months from today (keeping the same date)
    const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

    // Check if date is within the 48-hour window or beyond 6 months
    if (isBefore(dateObj, fortyEightHoursFromNow) || isAfter(dateObj, sixMonthsFromNow)) {
      return false;
    }

    // Get allotment for the date
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[dateObj.getFullYear()];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    // Check if date is already full
    const requests = state.requests[date] || [];
    const approvedRequests = requests.filter((r) => r.status === "approved").length;
    return approvedRequests < maxAllotment;
  },

  getDateAvailability: (date: string) => {
    const state = get();

    // If data isn't loaded yet, return unavailable
    if (state.isLoading || !state.isInitialized) {
      console.log("[Calendar] Data not loaded yet, returning unavailable");
      return "unavailable";
    }

    const now = new Date();
    const dateObj = parseISO(date);

    // Calculate 48 hours from now
    const fortyEightHoursFromNow = addDays(now, 2);

    // Calculate exactly 6 months from today (keeping the same date)
    const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());

    // Check if date is within the 48-hour window or beyond 6 months
    if (isBefore(dateObj, fortyEightHoursFromNow) || isAfter(dateObj, sixMonthsFromNow)) {
      return "unavailable";
    }

    // Get allotment for the date
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[dateObj.getFullYear()];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    if (maxAllotment === 0) {
      return "unavailable";
    }

    const requests = state.requests[date] || [];
    const approvedRequests = requests.filter((r) => r.status === "approved").length;

    if (approvedRequests >= maxAllotment) {
      return "full";
    }

    const availablePercentage = ((maxAllotment - approvedRequests) / maxAllotment) * 100;
    return availablePercentage <= 30 ? "limited" : "available";
  },

  fetchAllotments: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    if (!division) {
      set({ error: "No division found" });
      return { allotments: {}, yearlyAllotments: {} };
    }

    try {
      // Don't set loading here, it's managed by the loadData function in Calendar
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(endDate).getFullYear();
      const { data: yearlyData, error: yearlyError } = await supabase
        .from("pld_sdv_allotments")
        .select("year, max_allotment")
        .eq("division", division)
        .in("year", [startYear, endYear])
        .eq("date", `${startYear}-01-01`);

      if (yearlyError) throw yearlyError;

      // Transform yearly data into a record
      const yearlyAllotments = (yearlyData || []).reduce((acc, curr) => {
        acc[curr.year] = curr.max_allotment;
        return acc;
      }, {} as Record<number, number>);

      // Fetch date-specific overrides
      const { data: overrides, error: overridesError } = await supabase
        .from("pld_sdv_allotments")
        .select("date, max_allotment")
        .eq("division", division)
        .gte("date", startDate)
        .lte("date", endDate)
        .neq("date", `${startYear}-01-01`); // Exclude yearly defaults

      if (overridesError) throw overridesError;

      // Transform overrides into a record
      const allotments = (overrides || []).reduce((acc, curr) => {
        acc[curr.date] = curr.max_allotment;
        return acc;
      }, {} as Record<string, number>);

      set((state) => ({
        allotments,
        yearlyAllotments,
      }));

      return { allotments, yearlyAllotments };
    } catch (error) {
      set({ error: (error as Error).message });
      return { allotments: {}, yearlyAllotments: {} };
    }
  },

  fetchRequests: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    if (!division) {
      set({ error: "No division found" });
      return {};
    }

    try {
      // Don't set loading here, it's managed by the loadData function in Calendar
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .select(
          `
          id,
          member_id,
          division,
          request_date,
          leave_type,
          status,
          requested_at,
          waitlist_position,
          responded_at,
          responded_by,
          paid_in_lieu,
          member:member_id (
            first_name,
            last_name
          )
        `
        )
        .eq("division", division)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      if (error) throw error;

      // Transform the data to match our DayRequest type
      const transformedData = (data || []).map((request: any) => ({
        ...request,
        member: Array.isArray(request.member) ? request.member[0] : request.member,
      }));

      // Group requests by date
      const requests = transformedData.reduce((acc, request) => {
        const dateKey = request.request_date;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(request);
        return acc;
      }, {} as Record<string, DayRequest[]>);

      set((state) => ({
        requests,
      }));

      return requests;
    } catch (error) {
      set({ error: (error as Error).message });
      return {};
    }
  },

  submitRequest: async (date: string, type: "PLD" | "SDV") => {
    const division = useUserStore.getState().division;
    const member = useUserStore.getState().member;

    if (!division || !member) {
      set({ error: "No division or member information found" });
      return;
    }

    try {
      set({ isLoading: true });

      // Check if user already has a request for this date
      const existingRequests = get().requests[date] || [];
      const hasExistingRequest = existingRequests.some((r) => r.member_id === member.id && r.status !== "denied");

      if (hasExistingRequest) {
        throw new Error("You already have a request for this date");
      }

      // Check if date is full
      const availability = get().getDateAvailability(date);
      if (availability === "full" || availability === "unavailable") {
        throw new Error("This date is not available for requests");
      }

      // Check remaining days
      const year = new Date(date).getFullYear();
      const { data: remainingDays, error: remainingDaysError } = await supabase.rpc("get_member_remaining_days", {
        p_member_id: member.id,
        p_year: year,
        p_leave_type: type,
      });

      if (remainingDaysError) throw remainingDaysError;

      if (remainingDays <= 0) {
        throw new Error(`You have no ${type} days remaining for ${year}`);
      }

      // Submit the request
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .insert({
          member_id: member.id,
          division,
          request_date: date,
          leave_type: type,
          status: availability === "limited" ? "pending" : "approved",
          requested_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      const newRequests = [...existingRequests, data];
      set((state) => ({
        requests: {
          ...state.requests,
          [date]: newRequests,
        },
      }));

      return data;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  loadInitialData: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    if (!division) {
      set({ error: "No division found" });
      return;
    }

    try {
      set({ isLoading: true, error: null });
      const [allotmentsResult, requestsResult] = await Promise.all([
        get().fetchAllotments(startDate, endDate),
        get().fetchRequests(startDate, endDate),
      ]);

      // Set initialized if we have either allotments/yearly allotments or requests
      const hasAllotments =
        Object.keys(allotmentsResult.allotments).length > 0 ||
        Object.keys(allotmentsResult.yearlyAllotments).length > 0;
      const hasRequests = Object.keys(requestsResult).length > 0;

      set({
        isLoading: false,
        isInitialized: true, // Always set to true after initial load
        error: null,
      });
    } catch (error) {
      console.error("[Calendar] Error loading data:", error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load calendar data",
        isInitialized: false,
      });
    }
  },
}));

export function setupCalendarSubscriptions() {
  const division = useUserStore.getState().division;
  if (!division) return { unsubscribe: () => {} };

  type AllotmentPayload = {
    date: string;
    year: number;
    max_allotment: number;
    division: string;
    current_requests: number;
    id: string;
  };

  // Subscribe to allotment changes
  const allotmentsSubscription = supabase
    .channel("allotments")
    .on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_allotments",
        filter: `division=eq.${division}`,
      },
      async (payload: RealtimePostgresChangesPayload<AllotmentPayload>) => {
        const newRecord = payload.new as AllotmentPayload | null;
        if (newRecord && typeof newRecord === "object" && "date" in newRecord) {
          const store = useCalendarStore.getState();
          if (newRecord.date === `${newRecord.year}-01-01`) {
            // Update yearly allotment
            store.setAllotments(newRecord.date, {
              ...newRecord,
              current_requests: newRecord.current_requests || 0,
            });
          } else {
            // Update specific date allotment
            store.setAllotments(newRecord.date, {
              ...newRecord,
              current_requests: newRecord.current_requests || 0,
            });
          }
        }
      }
    )
    .subscribe();

  // Subscribe to request changes
  const requestsSubscription = supabase
    .channel("requests")
    .on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_requests",
        filter: `division=eq.${division}`,
      },
      async (payload: RealtimePostgresChangesPayload<DayRequest>) => {
        const newRecord = payload.new as DayRequest | null;
        const eventType = payload.eventType;

        if (newRecord && typeof newRecord === "object" && "request_date" in newRecord) {
          const store = useCalendarStore.getState();
          const currentRequests = store.requests[newRecord.request_date] || [];

          if (eventType === "INSERT") {
            store.setRequests(newRecord.request_date, [...currentRequests, newRecord]);
          } else if (eventType === "UPDATE") {
            const updatedRequests = currentRequests.map((req: DayRequest) =>
              req.id === newRecord.id ? newRecord : req
            );
            store.setRequests(newRecord.request_date, updatedRequests);
          } else if (eventType === "DELETE") {
            const filteredRequests = currentRequests.filter((req: DayRequest) => req.id !== newRecord.id);
            store.setRequests(newRecord.request_date, filteredRequests);
          }
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      allotmentsSubscription.unsubscribe();
      requestsSubscription.unsubscribe();
    },
  };
}
