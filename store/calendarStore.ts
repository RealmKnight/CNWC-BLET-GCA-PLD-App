import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

type Member = Database["public"]["Tables"]["members"]["Row"];
type Request = Database["public"]["Tables"]["pld_sdv_requests"]["Row"];

export interface DayRequest extends Request {
  member: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    pin_number: number;
  };
}

export interface DayAllotment {
  id: string;
  division: string;
  zone_id?: number;
  date: string;
  max_allotment: number;
  current_requests: number;
  year?: number;
}

interface CalendarState {
  selectedDate: string | null;
  allotments: Record<string, number>;
  yearlyAllotments: Record<string | number, number>;
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
  isDateSelectable: (date: string, zoneId?: number) => boolean;
  getDateAvailability: (
    date: string,
    zoneId?: number,
  ) => "available" | "limited" | "full" | "unavailable";

  // Data fetching
  fetchAllotments: (
    startDate: string,
    endDate: string,
  ) => Promise<
    {
      allotments: Record<string, number>;
      yearlyAllotments: Record<number, number>;
    }
  >;
  fetchRequests: (
    startDate: string,
    endDate: string,
  ) => Promise<Record<string, DayRequest[]>>;
  submitRequest: (
    date: string,
    type: "PLD" | "SDV",
    zoneId?: number,
  ) => Promise<void>;
  loadInitialData: (startDate: string, endDate: string) => Promise<void>;

  // Add new function
  cancelRequest: (requestId: string, isApproved: boolean) => Promise<boolean>;

  // Zone-specific functions
  hasZoneSpecificCalendar: (division: string) => boolean;
  getMemberZoneCalendar: (
    division: string,
    zone: string,
  ) => Promise<DayAllotment[]>;
  validateMemberZone: (memberId: string, zoneId: number) => Promise<boolean>;
  submitSixMonthRequest: (
    date: string,
    type: "PLD" | "SDV",
    zoneId?: number,
  ) => Promise<void>;

  // Add new helper function
  getActiveRequests: (date: string, zoneId?: number) => DayRequest[];
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

  isDateSelectable: (date: string, zoneId?: number) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);

    // Calculate 48 hours from now
    const fortyEightHoursFromNow = addDays(now, 2);

    // Calculate exactly 6 months from today (keeping the same date)
    const sixMonthsFromNow = new Date(
      now.getFullYear(),
      now.getMonth() + 6,
      now.getDate(),
    );

    // Check if date is within the 48-hour window or beyond 6 months
    if (
      isBefore(dateObj, fortyEightHoursFromNow) ||
      isAfter(dateObj, sixMonthsFromNow)
    ) {
      return false;
    }

    // Get allotment for the date
    const dateKey = zoneId ? `${date}_${zoneId}` : date;
    const yearKey = zoneId
      ? `${dateObj.getFullYear()}_${zoneId}`
      : dateObj.getFullYear();
    const dateAllotment = state.allotments[dateKey];
    const yearlyAllotment = state.yearlyAllotments[yearKey];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    // Check if date is already full - only count approved, pending, and waitlisted requests
    const requests = state.requests[dateKey] || [];
    const activeRequests = requests.filter((r) =>
      (r.status === "approved" || r.status === "pending" ||
        r.status === "waitlisted") &&
      (zoneId ? r.zone_id === zoneId : !r.zone_id)
    );
    return activeRequests.length < maxAllotment;
  },

  getDateAvailability: (date: string, zoneId?: number) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);

    // Add detailed logging
    const dateKey = zoneId ? `${date}_${zoneId}` : date;
    const yearKey = zoneId
      ? `${dateObj.getFullYear()}_${zoneId}`
      : dateObj.getFullYear();

    console.log("[CalendarStore] getDateAvailability called for date:", date, {
      isLoading: state.isLoading,
      isInitialized: state.isInitialized,
      hasAllotments: Object.keys(state.allotments).length,
      hasYearlyAllotments: Object.keys(state.yearlyAllotments).length,
      yearlyAllotment: state.yearlyAllotments[yearKey],
      dateAllotment: state.allotments[dateKey],
      requests: state.requests[dateKey]?.length ?? 0,
      zoneId,
    });

    // Calculate 48 hours from now
    const fortyEightHoursFromNow = addDays(now, 2);

    // Calculate exactly 6 months from today (keeping the same date)
    const sixMonthsFromNow = new Date(
      now.getFullYear(),
      now.getMonth() + 6,
      now.getDate(),
    );

    // Check if date is within the 48-hour window or beyond 6 months
    if (
      isBefore(dateObj, fortyEightHoursFromNow) ||
      isAfter(dateObj, sixMonthsFromNow)
    ) {
      return "unavailable";
    }

    // Get allotment for the date
    const dateAllotment = state.allotments[dateKey];
    const yearlyAllotment = state.yearlyAllotments[yearKey];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    // Get requests for the date, excluding cancelled and cancellation_pending
    const requests = state.requests[dateKey] || [];
    const activeRequests = requests.filter((r) =>
      (r.status === "approved" || r.status === "pending" ||
        r.status === "waitlisted") &&
      (zoneId ? r.zone_id === zoneId : !r.zone_id)
    );

    // Calculate availability
    if (maxAllotment === 0) return "unavailable";
    if (activeRequests.length >= maxAllotment) return "full";
    if (activeRequests.length >= maxAllotment * 0.7) return "limited";
    return "available";
  },

  fetchAllotments: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    const member = useUserStore.getState().member;
    const memberZone = member?.zone;

    try {
      // First, get the yearly allotment
      const currentYear = new Date().getFullYear();
      const yearlyDate = `${currentYear}-01-01`;

      let query = supabase
        .from("pld_sdv_allotments")
        .select("*")
        .eq("division", division)
        .or(
          `date.eq.${yearlyDate},date.gte.${startDate},date.lte.${endDate}`,
        );

      // Add zone filter if applicable
      if (memberZone) {
        // Get zone ID from zone name
        const { data: zoneData, error: zoneError } = await supabase
          .from("zones")
          .select("id")
          .eq("name", memberZone);

        if (zoneError) throw zoneError;
        if (!zoneData || zoneData.length === 0) {
          console.warn(
            "[CalendarStore] No zone found for member zone:",
            memberZone,
          );
        } else {
          query = query.eq("zone_id", zoneData[0].id);
        }
      }

      const { data: allotments, error } = await query;

      if (error) throw error;

      const allotmentsByDate: Record<string, number> = {};
      const yearlyAllotments: Record<number, number> = {};

      // First, process yearly allotments
      allotments?.forEach((allotment) => {
        if (allotment.date === yearlyDate) {
          yearlyAllotments[currentYear] = allotment.max_allotment;
        } else {
          allotmentsByDate[allotment.date] = allotment.max_allotment;
        }
      });

      // If we have a yearly allotment but no specific date allotment,
      // we should apply the yearly allotment to all valid dates
      if (
        yearlyAllotments[currentYear] &&
        Object.keys(allotmentsByDate).length === 0
      ) {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const defaultAllotment = yearlyAllotments[currentYear];

        // Iterate through the date range and set the yearly allotment
        for (
          let date = startDateObj;
          date <= endDateObj;
          date.setDate(date.getDate() + 1)
        ) {
          const dateStr = format(date, "yyyy-MM-dd");
          // Only set if there's no specific allotment for this date
          if (!allotmentsByDate[dateStr]) {
            allotmentsByDate[dateStr] = defaultAllotment;
          }
        }
      }

      console.log("[CalendarStore] Allotments fetched:", {
        yearlyAllotments,
        allotmentsByDateCount: Object.keys(allotmentsByDate).length,
        startDate,
        endDate,
        hasYearlyAllotment: !!yearlyAllotments[currentYear],
      });

      return {
        allotments: allotmentsByDate,
        yearlyAllotments,
      };
    } catch (error) {
      console.error("[CalendarStore] Error fetching allotments:", error);
      throw error;
    }
  },

  fetchRequests: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    const member = useUserStore.getState().member;
    const memberZone = member?.zone;

    try {
      let query = supabase
        .from("pld_sdv_requests")
        .select(`
          id,
          member_id,
          division,
          zone_id,
          request_date,
          leave_type,
          status,
          requested_at,
          waitlist_position,
          responded_at,
          responded_by,
          paid_in_lieu,
          denial_reason_id,
          denial_comment,
          actioned_by,
          actioned_at,
          created_at,
          updated_at,
          metadata,
          member:members!inner (
            id,
            first_name,
            last_name,
            pin_number
          )
        `)
        .eq("division", division)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      // Add zone filter if applicable
      if (memberZone) {
        // Get zone ID from zone name
        const { data: zoneData, error: zoneError } = await supabase
          .from("zones")
          .select("id")
          .eq("name", memberZone);

        if (zoneError) throw zoneError;
        if (!zoneData || zoneData.length === 0) {
          console.warn(
            "[CalendarStore] No zone found for member zone:",
            memberZone,
          );
        } else {
          query = query.eq("zone_id", zoneData[0].id);
        }
      }

      const { data: requests, error } = await query;

      if (error) {
        console.error("[CalendarStore] Error fetching requests:", error);
        throw error;
      }

      // Log the first request to understand its structure
      if (requests && requests.length > 0) {
        console.log(
          "[CalendarStore] First request structure:",
          JSON.stringify(requests[0], null, 2),
        );
      }

      const requestsByDate: Record<string, DayRequest[]> = {};

      if (requests) {
        for (const rawRequest of requests) {
          const dateKey = rawRequest.zone_id
            ? `${rawRequest.request_date}_${rawRequest.zone_id}`
            : rawRequest.request_date;

          if (!requestsByDate[dateKey]) {
            requestsByDate[dateKey] = [];
          }

          // Extract the member data from the join result
          const memberData = {
            id: (rawRequest as any).member.id as string,
            first_name: (rawRequest as any).member.first_name as string | null,
            last_name: (rawRequest as any).member.last_name as string | null,
            pin_number: (rawRequest as any).member.pin_number as number,
          };

          // Create a properly typed DayRequest
          const dayRequest: DayRequest = {
            id: rawRequest.id,
            member_id: rawRequest.member_id,
            division: rawRequest.division,
            zone_id: rawRequest.zone_id,
            request_date: rawRequest.request_date,
            leave_type: rawRequest.leave_type,
            status: rawRequest.status,
            requested_at: rawRequest.requested_at,
            waitlist_position: rawRequest.waitlist_position,
            responded_at: rawRequest.responded_at,
            responded_by: rawRequest.responded_by,
            paid_in_lieu: rawRequest.paid_in_lieu,
            denial_reason_id: rawRequest.denial_reason_id,
            denial_comment: rawRequest.denial_comment,
            actioned_by: rawRequest.actioned_by,
            actioned_at: rawRequest.actioned_at,
            created_at: rawRequest.created_at,
            updated_at: rawRequest.updated_at,
            metadata: rawRequest.metadata,
            member: memberData,
          };

          requestsByDate[dateKey].push(dayRequest);
        }
      }

      return requestsByDate;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      throw error;
    }
  },

  submitRequest: async (date: string, type: "PLD" | "SDV", zoneId?: number) => {
    const member = useUserStore.getState().member;
    const division = useUserStore.getState().division;

    if (!member) throw new Error("No member found");

    try {
      // Get zone ID from zone name if not provided
      if (!zoneId && member.zone) {
        const { data: zoneData, error: zoneError } = await supabase
          .from("zones")
          .select("id")
          .eq("name", member.zone);

        if (zoneError) throw zoneError;
        if (!zoneData || zoneData.length === 0) {
          console.warn(
            "[CalendarStore] No zone found for member zone:",
            member.zone,
          );
        } else {
          zoneId = zoneData[0].id;
        }
      }

      const { data: requestData, error } = await supabase
        .from("pld_sdv_requests")
        .insert({
          member_id: member.id,
          division,
          zone_id: zoneId,
          request_date: date,
          leave_type: type,
          status: "pending",
          requested_at: new Date().toISOString(),
        })
        .select(`
          *,
          member:members!inner (
            id,
            first_name,
            last_name,
            pin_number
          )
        `)
        .single();

      if (error) throw error;
      if (!requestData) throw new Error("No request data returned");

      // Cast the request data to match our DayRequest type
      const request: DayRequest = {
        ...requestData,
        member: {
          id: requestData.member.id,
          first_name: requestData.member.first_name,
          last_name: requestData.member.last_name,
          pin_number: requestData.member.pin_number,
        },
      };

      // Update local state
      const dateKey = zoneId ? `${date}_${zoneId}` : date;
      const currentRequests = get().requests[dateKey] || [];
      set((state) => ({
        requests: {
          ...state.requests,
          [dateKey]: [...currentRequests, request],
        },
      }));
    } catch (error) {
      console.error("[CalendarStore] Error submitting request:", error);
      throw error;
    }
  },

  loadInitialData: async (startDate: string, endDate: string) => {
    const division = useUserStore.getState().division;
    if (!division) {
      console.log("[CalendarStore] No division found during initialization");
      set({
        error: "No division found",
        isLoading: false,
        isInitialized: false,
      });
      return;
    }

    // Get current state
    const currentState = get();
    console.log("[CalendarStore] Starting initial data load:", {
      startDate,
      endDate,
      division,
      currentState: {
        isLoading: currentState.isLoading,
        isInitialized: currentState.isInitialized,
        hasRequests: Object.keys(currentState.requests).length,
        hasAllotments: Object.keys(currentState.allotments).length,
      },
    });

    // Reset error state and set loading
    set({ error: null, isLoading: true });

    try {
      const [allotmentsResult, requestsResult] = await Promise.all([
        get().fetchAllotments(startDate, endDate),
        get().fetchRequests(startDate, endDate),
      ]);

      // Check if we got any data
      const hasAllotments =
        Object.keys(allotmentsResult.allotments).length > 0 ||
        Object.keys(allotmentsResult.yearlyAllotments).length > 0;
      const hasRequests = Object.keys(requestsResult).length > 0;

      console.log("[CalendarStore] Data load complete:", {
        hasAllotments,
        hasRequests,
        allotmentsCount: Object.keys(allotmentsResult.allotments).length,
        yearlyAllotmentsCount:
          Object.keys(allotmentsResult.yearlyAllotments).length,
        requestsCount: Object.keys(requestsResult).length,
      });

      // Always update state with what we have
      set({
        isLoading: false,
        isInitialized: true,
        error: null,
        allotments: allotmentsResult.allotments,
        yearlyAllotments: allotmentsResult.yearlyAllotments,
        requests: requestsResult,
      });
    } catch (error) {
      console.error("[CalendarStore] Error loading data:", error);
      set({
        isLoading: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load calendar data",
        // Keep initialized state if we were already initialized
        isInitialized: currentState.isInitialized,
      });
    }
  },

  cancelRequest: async (requestId: string, isApproved: boolean) => {
    const state = get();
    const member = useUserStore.getState().member;

    if (!member) {
      set({ error: "No member information found" });
      return false;
    }

    try {
      set({ isLoading: true });

      // Find the request in our state
      let foundRequest: DayRequest | null = null;
      let requestDate: string | null = null;

      Object.entries(state.requests).forEach(([date, requests]) => {
        const request = requests.find((r) => r.id === requestId);
        if (request) {
          foundRequest = request;
          requestDate = date;
        }
      });

      if (!foundRequest || !requestDate) {
        throw new Error("Request not found");
      }

      // If the request is approved, set it to cancellation_pending
      // If it's pending, set it to cancelled directly
      const newStatus: DayRequest["status"] = isApproved
        ? "cancellation_pending"
        : "cancelled";

      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      // Update local state
      if (requestDate) {
        const updatedRequests: DayRequest[] = state.requests[requestDate].map((
          request,
        ) =>
          request.id === requestId ? { ...request, status: newStatus } : request
        );

        const updatedState: Partial<CalendarState> = {
          requests: {
            ...state.requests,
            [requestDate]: updatedRequests,
          },
        };

        set(updatedState);
      }

      return true;
    } catch (error) {
      console.error("Error cancelling request:", error);
      set({
        error: error instanceof Error
          ? error.message
          : "Failed to cancel request",
      });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  hasZoneSpecificCalendar: (division: string) => {
    // Get zoneCalendars directly from the ADMIN calendar store state
    const { zoneCalendars } = useAdminCalendarManagementStore.getState();
    // Parse division string to number for comparison
    const divisionIdNumber = parseInt(division, 10);
    if (isNaN(divisionIdNumber)) {
      console.error("[CalendarStore] Invalid division ID format:", division);
      return false; // Cannot determine if division ID is not a number
    }
    // Check if any calendar belongs to the specified division ID (number comparison)
    return zoneCalendars.some((cal) => cal.division_id === divisionIdNumber);
  },

  getMemberZoneCalendar: async (division: string, zone: string) => {
    const { data, error } = await supabase
      .from("pld_sdv_allotments")
      .select("*")
      .eq("division", division)
      .eq("zone_id", zone);

    if (error) throw error;
    return data;
  },

  validateMemberZone: async (memberId: string, zoneId: number) => {
    // Get member's zone
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("zone")
      .eq("id", memberId)
      .single();

    if (memberError) throw memberError;

    // Get zone name from zones table
    const { data: zoneData, error: zoneError } = await supabase
      .from("zones")
      .select("name")
      .eq("id", zoneId)
      .single();

    if (zoneError) throw zoneError;
    return memberData.zone === zoneData.name;
  },

  submitSixMonthRequest: async (
    date: string,
    type: "PLD" | "SDV",
    zoneId?: number,
  ) => {
    const state = get();
    const member = useUserStore.getState().member;
    const division = useUserStore.getState().division;

    if (!member || !division) {
      throw new Error("User not properly initialized");
    }

    // Validate member's zone if specified
    if (zoneId && !(await state.validateMemberZone(member.id, zoneId))) {
      throw new Error("Invalid zone for member");
    }

    const { data: existingRequest, error: checkError } = await supabase
      .from("pld_sdv_requests")
      .select("*")
      .eq("member_id", member.id)
      .eq("request_date", date)
      .eq("division", division)
      .eq("leave_type", type)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingRequest) {
      throw new Error("Request already exists for this date");
    }

    const { data: result, error: insertError } = await supabase
      .from("pld_sdv_requests")
      .insert({
        member_id: member.id,
        division,
        zone_id: zoneId,
        request_date: date,
        leave_type: type,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Update local state
    const dateRequests = state.requests[date] || [];
    set((state) => ({
      requests: {
        ...state.requests,
        [date]: [...dateRequests, result],
      },
    }));
  },

  getActiveRequests: (date: string, zoneId?: number) => {
    const state = get();
    const dateKey = zoneId ? `${date}_${zoneId}` : date;
    const requests = state.requests[dateKey] || [];

    // Return only active requests (approved, pending, waitlisted)
    return requests.filter((r) =>
      (r.status === "approved" || r.status === "pending" ||
        r.status === "waitlisted") &&
      (zoneId ? r.zone_id === zoneId : !r.zone_id)
    );
  },
}));

export function setupCalendarSubscriptions() {
  const division = useUserStore.getState().division;
  if (!division) {
    console.log("[CalendarStore] No division found, skipping subscriptions");
    return { unsubscribe: () => {} };
  }

  console.log(
    "[CalendarStore] Setting up subscriptions for division:",
    division,
  );

  // Track subscription status
  let isSubscribed = true;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 5000;

  // Create channels with automatic reconnection
  const allotmentsChannel = supabase.channel("allotments-auto");
  const requestsChannel = supabase.channel("requests-auto");

  // Helper function to handle subscription errors
  const handleSubscriptionError = async (error: any, channelName: string) => {
    console.error(`[CalendarStore] ${channelName} subscription error:`, error);
    reconnectAttempts++;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isSubscribed) {
      console.log(
        `[CalendarStore] Attempting to reconnect ${channelName} (attempt ${reconnectAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));
      return true; // Try to reconnect
    }

    console.log(
      `[CalendarStore] Max reconnection attempts reached for ${channelName}`,
    );
    return false; // Stop trying to reconnect
  };

  // Subscribe to allotment changes
  allotmentsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_allotments",
        filter: `division=eq.${division}`,
      },
      async (payload) => {
        try {
          const newRecord = payload.new as any;
          if (
            newRecord && typeof newRecord === "object" && "date" in newRecord
          ) {
            console.log("[CalendarStore] Processing allotment change:", {
              date: newRecord.date,
              max_allotment: newRecord.max_allotment,
            });

            const store = useCalendarStore.getState();
            if (newRecord.date === `${newRecord.year}-01-01`) {
              store.setAllotments(newRecord.date, {
                ...newRecord,
                current_requests: newRecord.current_requests || 0,
              });
            } else {
              store.setAllotments(newRecord.date, {
                ...newRecord,
                current_requests: newRecord.current_requests || 0,
              });
            }
          }
        } catch (error) {
          if (await handleSubscriptionError(error, "allotments")) {
            allotmentsChannel.subscribe();
          }
        }
      },
    )
    .subscribe();

  // Subscribe to request changes
  requestsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_requests",
        filter: `division=eq.${division}`,
      },
      async (payload) => {
        try {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          const eventType = payload.eventType;

          const requestDate = newRecord?.request_date ||
            oldRecord?.request_date;

          if (requestDate) {
            console.log("[CalendarStore] Processing request change:", {
              eventType,
              requestDate,
              newStatus: newRecord?.status,
              oldStatus: oldRecord?.status,
              requestId: newRecord?.id || oldRecord?.id,
            });

            const store = useCalendarStore.getState();
            const currentRequests = store.requests[requestDate] || [];

            if (eventType === "INSERT" && newRecord) {
              try {
                const { data: memberData, error: memberError } = await supabase
                  .from("members")
                  .select("id, first_name, last_name, pin_number")
                  .eq("id", newRecord.member_id)
                  .single();

                if (!memberError && memberData) {
                  const requestWithMember = {
                    ...newRecord,
                    member: {
                      id: memberData.id,
                      first_name: memberData.first_name || null,
                      last_name: memberData.last_name || null,
                      pin_number: memberData.pin_number,
                    },
                  };
                  store.setRequests(requestDate, [
                    ...currentRequests,
                    requestWithMember,
                  ]);
                }
              } catch (error) {
                console.error(
                  "[CalendarStore] Error processing INSERT:",
                  error,
                );
              }
            } else if (eventType === "UPDATE" && newRecord) {
              const updatedRequests = currentRequests.map((req) =>
                req.id === newRecord.id
                  ? { ...newRecord, member: req.member }
                  : req
              );
              store.setRequests(requestDate, updatedRequests);
            } else if (eventType === "DELETE" && oldRecord) {
              const filteredRequests = currentRequests.filter((req) =>
                req.id !== oldRecord.id
              );
              store.setRequests(requestDate, filteredRequests);
            }

            // Refresh allotments for the affected date
            try {
              const dateRange = {
                start: requestDate,
                end: requestDate,
              };
              await store.fetchAllotments(dateRange.start, dateRange.end);
            } catch (error) {
              console.error(
                "[CalendarStore] Error refreshing allotments:",
                error,
              );
            }
          }
        } catch (error) {
          if (await handleSubscriptionError(error, "requests")) {
            requestsChannel.subscribe();
          }
        }
      },
    )
    .subscribe();

  return {
    unsubscribe: () => {
      console.log("[CalendarStore] Unsubscribing from realtime updates");
      isSubscribed = false;
      allotmentsChannel.unsubscribe();
      requestsChannel.unsubscribe();
    },
  };
}
