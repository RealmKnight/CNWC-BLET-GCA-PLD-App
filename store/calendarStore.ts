import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { useTimeStore } from "@/store/timeStore";
import {
  PldSdvAllotment,
  useAdminCalendarManagementStore,
} from "@/store/adminCalendarManagementStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Database, TablesInsert } from "@/types/supabase";

type Member = Database["public"]["Tables"]["members"]["Row"];
type Request = Database["public"]["Tables"]["pld_sdv_requests"]["Row"];

export interface DayRequest extends Request {
  member: {
    id: string | null;
    first_name: string | null;
    last_name: string | null;
    pin_number: number;
  };
}

export interface DayAllotment {
  id: string;
  calendar_id: string;
  date: string;
  max_allotment: number;
  current_requests: number;
  year?: number;
}

// Add type for member data
interface RequestMember {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  pin_number: number;
}

interface FullRequestData {
  id: string;
  member_id: string | null;
  pin_number: number | null;
  calendar_id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status:
    | "pending"
    | "approved"
    | "denied"
    | "waitlisted"
    | "cancellation_pending"
    | "cancelled";
  requested_at: string;
  waitlist_position?: number;
  import_source?: string | null;
  imported_at?: string | null;
  member: RequestMember;
}

// Add interface for six-month requests if it doesn't exist
export interface SixMonthRequest {
  id: string;
  member_id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  requested_at: string;
  processed: boolean;
  processed_at?: string;
  final_status?: string;
  position?: number;
  calendar_id: string;
}

interface CalendarState {
  selectedDate: string | null;
  allotments: Record<string, number>;
  yearlyAllotments: Record<number, number>;
  requests: Record<string, DayRequest[]>;
  sixMonthRequestDays: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;

  // Actions
  setSelectedDate: (date: string | null) => void;
  setAllotments: (allotments: Record<string, number>) => void;
  setYearlyAllotments: (yearlyAllotments: Record<number, number>) => void;
  setRequests: (requests: Record<string, DayRequest[]>) => void;
  setSixMonthRequestDays: (days: Record<string, boolean>) => void;
  setError: (error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;

  // Computed
  isDateSelectable: (date: string) => boolean;
  getDateAvailability: (
    date: string,
  ) => "available" | "limited" | "full" | "unavailable" | "userRequested";

  // Data fetching
  fetchAllotments: (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => Promise<
    {
      allotments: Record<string, number>;
      yearlyAllotments: Record<number, number>;
    }
  >;
  fetchRequests: (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => Promise<Record<string, DayRequest[]>>;

  // New function for fetching user's six-month requests
  fetchUserSixMonthRequests: (memberId: string) => Promise<SixMonthRequest[]>;

  loadInitialData: (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => Promise<void>;

  // Refresh logic
  refreshData: (
    startDate: string,
    endDate: string,
    calendarId: string,
    force?: boolean,
  ) => Promise<void>;

  // New action to refresh requests for a specific date
  refreshRequestsForDate: (date: string, calendarId: string) => Promise<void>;

  cancelRequest: (requestId: string, requestDate: string) => Promise<boolean>;

  submitSixMonthRequest: (
    date: string,
    type: "PLD" | "SDV",
  ) => Promise<DayRequest | null>;

  getActiveRequests: (date: string) => DayRequest[];

  userSubmitRequest: (
    date: string,
    type: "PLD" | "SDV",
  ) => Promise<DayRequest>;

  // Expose the six-month request check functionality from the store
  checkSixMonthRequest: (date: string) => Promise<boolean>;

  // Mark previously exposed function as deprecated
  // checkSixMonthRequest: (date: string) => Promise<boolean>;

  cleanupCalendarState: () => void;
}

// Add helper function at the top of the file, after imports
const isLastDayOfMonth = (date: Date): boolean => {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getDate() === 1;
};

// Add getSixMonthDate function to calculate date exactly six months from now
export const getSixMonthDate = (): Date => {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth() + 6,
    now.getDate(),
  );
};

export const useCalendarStore = create<CalendarState>((set, get) => ({
  selectedDate: null,
  allotments: {},
  yearlyAllotments: {},
  requests: {},
  sixMonthRequestDays: {},
  isLoading: false,
  error: null,
  isInitialized: false,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setAllotments: (allotments) => set({ allotments }),
  setYearlyAllotments: (yearlyAllotments) => set({ yearlyAllotments }),
  setRequests: (requests) => set({ requests }),
  setSixMonthRequestDays: (days) => set({ sixMonthRequestDays: days }),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),

  isDateSelectable: (date: string) => {
    const state = get();
    const now = new Date();
    const currentYear = now.getFullYear();
    let dateObj: Date;
    try {
      dateObj = parseISO(date);
      // Ensure the date is valid and within the current year
      if (isNaN(dateObj.getTime()) || dateObj.getFullYear() !== currentYear) {
        // console.log("[CalendarStore] Date not selectable - invalid or outside current year:", date);
        return false;
      }
    } catch (e) {
      // console.log("[CalendarStore] Date not selectable - parsing error:", date, e);
      return false; // Invalid date format
    }

    const sixMonthsFromNow = getSixMonthDate();

    // Check if today is end of month for six month request handling or exact 6-month date
    const isEndOfMonth = isLastDayOfMonth(now);
    const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();

    // CORRECTED: Six month requests are ONLY dates exactly 6 months away OR dates AFTER
    // the exact 6-month point when it's the end of month and the target month has more days
    const isSixMonthRequest = isSixMonthDate || (
      isEndOfMonth &&
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
      dateObj.getDate() >= sixMonthsFromNow.getDate() // Only dates at or beyond the exact 6-month point
    );

    // Check if date is beyond six months AND not a special six-month request date
    if (isAfter(dateObj, sixMonthsFromNow) && !isSixMonthRequest) {
      // console.log("[CalendarStore] Date not selectable - beyond six months:", date);
      return false;
    }

    // If the date is within the current year and up to 6 months out (or a six-month date),
    // it is selectable for viewing or requesting.
    return true;
  },

  getDateAvailability: (date: string) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);
    const fortyEightHoursFromNow = addDays(now, 2);
    const sixMonthsFromNow = getSixMonthDate();

    // Check if user has any type of request first
    const member = useUserStore.getState().member;
    const hasSixMonthRequest = state.sixMonthRequestDays[date] === true;

    // Add debug logging for PIL requests in this date
    if (member?.id && state.requests[date]) {
      const pilRequests = state.requests[date].filter(
        (req) =>
          req.member_id === member.id &&
          ["approved", "pending", "waitlisted", "cancellation_pending"]
            .includes(req.status) &&
          req.paid_in_lieu === true,
      );

      if (pilRequests.length > 0) {
        console.log(
          `[CalendarStore] Found PIL requests for date ${date}:`,
          pilRequests,
        );
      }
    }

    const hasRegularRequest = member?.id && state.requests[date]?.some(
      (req) =>
        req.member_id === member.id &&
        ["approved", "pending", "waitlisted", "cancellation_pending"].includes(
          req.status,
        ),
    );

    // If user has any type of request, mark as userRequested (overrides other statuses)
    if (hasSixMonthRequest || hasRegularRequest) {
      return "userRequested";
    }

    // Past/Near-Past Check: Mark as unavailable if before 48 hours
    if (isBefore(dateObj, fortyEightHoursFromNow)) {
      return "unavailable";
    }

    // Six-month check
    const isEndOfMonth = isLastDayOfMonth(now);
    const isAfterSixMonths = isAfter(dateObj, sixMonthsFromNow);
    const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();

    const isSameMonthYear =
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear();

    const isSixMonthRequest = isSixMonthDate || (
      isEndOfMonth && isSameMonthYear &&
      dateObj.getDate() >= sixMonthsFromNow.getDate()
    );

    // CRITICAL: If it's a six-month request date, always mark as available regardless of allotment
    if (isSixMonthRequest) {
      return "available";
    }

    if (isAfterSixMonths && !isSixMonthRequest) {
      return "unavailable";
    }

    // Get allotment info for normal requests
    const year = dateObj.getFullYear();
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[year];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    // For display purposes, if there's no allotment set, still show as available
    // This matches the behavior in isDateSelectable
    if (maxAllotment === 0) {
      // We're within 6 months, so treat as available even with no allotment
      return "available";
    }

    // Check current requests against allotment
    const currentRequests = state.requests[date] || [];
    const approvedOrPendingCount = currentRequests.filter(
      (req) =>
        req.status === "approved" ||
        req.status === "pending" ||
        req.status === "waitlisted" ||
        req.status === "cancellation_pending",
    ).length;

    const ratio = approvedOrPendingCount / maxAllotment;
    if (ratio >= 1) {
      return "full";
    } else if (ratio >= 0.7) {
      return "limited";
    } else {
      return "available";
    }
  },

  fetchAllotments: async (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => {
    console.log("[CalendarStore] Fetching allotments", {
      startDate,
      endDate,
      calendarId,
    });

    try {
      // Determine the years we need to query for
      const startYear = new Date(startDate).getFullYear();
      const endYear = new Date(endDate).getFullYear();

      // Create an array of years to query
      const yearsToQuery = [];
      for (let year = startYear; year <= endYear; year++) {
        yearsToQuery.push(year);
      }

      console.log(
        "[CalendarStore] Years to query for allotments:",
        yearsToQuery,
      );

      // Fetch day-specific allotments AND yearly allotments
      // Note: We specifically query for both date-specific and year records
      const { data: allotmentsData, error } = await supabase
        .from("pld_sdv_allotments")
        .select("id, date, max_allotment, current_requests, year, calendar_id")
        .eq("calendar_id", calendarId)
        .or(
          `date.gte.${startDate},date.lte.${endDate},year.in.(${
            yearsToQuery.join(",")
          })`,
        );

      if (error) {
        console.error(
          "[CalendarStore] Error fetching allotments:",
          error,
        );
        throw error;
      }

      // Transform allotments into maps
      const allotments: Record<string, number> = {};
      const yearlyAllotments: Record<number, number> = {};

      // First pass: Extract yearly defaults
      allotmentsData?.forEach((allotment) => {
        // Store yearly defaults
        if (allotment.year !== null) {
          yearlyAllotments[allotment.year] = allotment.max_allotment;
        }
        // Store date-specific allotments
        if (allotment.date) {
          allotments[allotment.date] = allotment.max_allotment;
        }
      });

      console.log("[CalendarStore] Fetched allotments:", {
        dateCount: Object.keys(allotments).length,
        yearCount: Object.keys(yearlyAllotments).length,
        years: Object.keys(yearlyAllotments),
      });

      // Apply yearly defaults to all dates in the range
      // where specific allotments don't already exist
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);

      // Iterate through each day in the date range
      for (
        let date = startDateObj;
        date <= endDateObj;
        date = addDays(date, 1)
      ) {
        const dateStr = format(date, "yyyy-MM-dd");
        const year = date.getFullYear();

        // If no specific allotment exists for this date and we have a yearly default,
        // apply the yearly default
        if (
          allotments[dateStr] === undefined &&
          yearlyAllotments[year] !== undefined
        ) {
          allotments[dateStr] = yearlyAllotments[year];
        }
      }

      return { allotments, yearlyAllotments };
    } catch (error) {
      console.error("[CalendarStore] Error fetching allotments:", error);
      // Return empty data instead of throwing
      return { allotments: {}, yearlyAllotments: {} };
    }
  },

  fetchRequests: async (startDate, endDate, calendarId) => {
    console.log("[CalendarStore] Fetching requests", {
      startDate,
      endDate,
      calendarId,
    });
    try {
      // Query with join to members table using the member_id foreign key OR pin_number
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .select(`
          id, member_id, pin_number, calendar_id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, import_source, imported_at,
          member:members(id, first_name, last_name, pin_number)
        `)
        .eq("calendar_id", calendarId)
        .not("status", "in", '("cancelled","denied")')
        .gte("request_date", startDate)
        .lte("request_date", endDate)
        .order("request_date");

      if (error) {
        console.error("[CalendarStore] Error fetching requests:", error);
        return {};
      }

      // Check for PIL requests in the fetched data
      const pilRequests = data?.filter((req) => req.paid_in_lieu === true) ||
        [];
      if (pilRequests.length > 0) {
        console.log(
          `[CalendarStore] Found ${pilRequests.length} PIL requests in fetch:`,
          pilRequests.map((r) => ({
            date: r.request_date,
            status: r.status,
            member_id: r.member_id,
            pin_number: r.pin_number,
          })),
        );
      }

      // Group requests by date
      const requestsByDate: Record<string, DayRequest[]> = {};
      data?.forEach((request: any) => {
        if (!requestsByDate[request.request_date]) {
          requestsByDate[request.request_date] = [];
        }

        // Special handling for null member data (pin_number only cases)
        if (request.pin_number && (!request.member || !request.member.id)) {
          // Create a default member object using the pin_number for display
          request.member = {
            id: null,
            pin_number: request.pin_number,
            first_name: `PIN: ${request.pin_number}`,
            last_name: "",
          };
        }

        requestsByDate[request.request_date].push(request as DayRequest);
      });

      return requestsByDate;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      // Return empty data instead of throwing
      return {};
    }
  },

  // Function to fetch user's six-month requests
  fetchUserSixMonthRequests: async (memberId) => {
    console.log(
      "[CalendarStore] Fetching user's six-month requests for member:",
      memberId,
    );

    try {
      const { data, error } = await supabase
        .from("six_month_requests")
        .select("*")
        .eq("member_id", memberId)
        .order("request_date");

      if (error) {
        console.error(
          "[CalendarStore] Error fetching six-month requests:",
          error,
        );
        return [];
      }

      console.log(
        `[CalendarStore] Found ${
          data?.length || 0
        } six-month requests for member`,
      );
      return data || [];
    } catch (error) {
      console.error(
        "[CalendarStore] Error fetching user six-month requests:",
        error,
      );
      return [];
    }
  },

  loadInitialData: async (startDate, endDate, calendarId) => {
    console.log("[CalendarStore] Loading initial data", {
      startDate,
      endDate,
      calendarId,
    });
    const state = get();

    try {
      state.setIsLoading(true);
      state.setError(null);

      // Fetch allotments and requests concurrently
      const [{ allotments, yearlyAllotments }, requests] = await Promise.all([
        state.fetchAllotments(startDate, endDate, calendarId),
        state.fetchRequests(startDate, endDate, calendarId),
      ]);

      // Set state
      state.setAllotments(allotments);
      state.setYearlyAllotments(yearlyAllotments);
      state.setRequests(requests);

      // Fetch user's six-month requests if we have a member ID
      const member = useUserStore.getState().member;
      if (member?.id) {
        const sixMonthRequests = await state.fetchUserSixMonthRequests(
          member.id,
        );

        // Create a Record<string, boolean> from the six-month requests
        const sixMonthDays: Record<string, boolean> = {};
        sixMonthRequests.forEach((req) => {
          sixMonthDays[req.request_date] = true;
        });

        state.setSixMonthRequestDays(sixMonthDays);
      }

      state.setIsInitialized(true);
      console.log("[CalendarStore] Initial data loaded successfully");
    } catch (error) {
      console.error("[CalendarStore] Error loading initial data:", error);
      state.setError("Failed to load calendar data");
    } finally {
      state.setIsLoading(false);
    }
  },

  // Add a refresh function that can be called to update the calendar data
  refreshData: async (startDate, endDate, calendarId, force = false) => {
    console.log("[CalendarStore] Refreshing data", {
      startDate,
      endDate,
      calendarId,
      force,
    });

    const state = get();

    // If not forcing and already initialized, use realtime updates instead
    if (!force && state.isInitialized) {
      console.log(
        "[CalendarStore] Already initialized and not forcing, relying on realtime updates",
      );
      return;
    }

    try {
      // Only set loading if forcing a refresh
      if (force) {
        state.setIsLoading(true);
      }

      state.setError(null);

      // Fetch allotments and requests concurrently
      const [{ allotments, yearlyAllotments }, requests] = await Promise.all([
        state.fetchAllotments(startDate, endDate, calendarId),
        state.fetchRequests(startDate, endDate, calendarId),
      ]);

      // Set state
      state.setAllotments(allotments);
      state.setYearlyAllotments(yearlyAllotments);
      state.setRequests(requests);

      // Fetch user's six-month requests if we have a member ID
      const member = useUserStore.getState().member;
      if (member?.id) {
        const sixMonthRequests = await state.fetchUserSixMonthRequests(
          member.id,
        );

        // Create a Record<string, boolean> from the six-month requests
        const sixMonthDays: Record<string, boolean> = {};
        sixMonthRequests.forEach((req) => {
          sixMonthDays[req.request_date] = true;
        });

        state.setSixMonthRequestDays(sixMonthDays);
      }

      console.log("[CalendarStore] Data refreshed successfully");
    } catch (error) {
      console.error("[CalendarStore] Error refreshing data:", error);
      state.setError("Failed to refresh calendar data");
    } finally {
      if (force) {
        state.setIsLoading(false);
      }
    }
  },

  refreshRequestsForDate: async (date, calendarId) => {
    console.log("[CalendarStore] Refreshing requests for date", date);
    const state = get();
    try {
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .select(`
          id, member_id, pin_number, calendar_id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu, import_source, imported_at,
          member:members(id, first_name, last_name, pin_number)
        `)
        .eq("calendar_id", calendarId)
        .eq("request_date", date)
        .not("status", "in", '("cancelled","denied")')
        .order("request_date");

      if (error) {
        console.error(
          "[CalendarStore] Error refreshing requests for date:",
          date,
          error,
        );
        return;
      }

      // Process the data and create a new requests object
      const processedData = data?.map((request: any) => {
        // Handle PIN-only entries
        if (request.pin_number && (!request.member || !request.member.id)) {
          // Create a default member object using the pin_number for display
          request.member = {
            id: null,
            pin_number: request.pin_number,
            first_name: `PIN: ${request.pin_number}`,
            last_name: "",
          };
        }
        return request as DayRequest;
      }) || [];

      const newRequests = { ...state.requests };
      newRequests[date] = processedData;
      state.setRequests(newRequests);
    } catch (error) {
      console.error(
        "[CalendarStore] Error refreshing requests for date:",
        date,
        error,
      );
      state.setError(`Failed to refresh requests for ${date}`);
    }
  },

  getActiveRequests: (date: string) => {
    const state = get();
    return (
      state.requests[date]?.filter(
        (request) =>
          // Status filter - must be active status
          (request.status === "approved" ||
            request.status === "pending" ||
            request.status === "waitlisted" ||
            request.status === "cancellation_pending") &&
          // Exclude paid in lieu requests
          request.paid_in_lieu !== true,
      ) || []
    );
  },

  cancelRequest: async (requestId, requestDate) => {
    const member = useUserStore.getState().member;
    if (!member?.id) {
      console.error("[CalendarStore] No member ID found");
      return false;
    }

    console.log("[CalendarStore] Cancelling request", requestId);
    const state = get();
    try {
      // Optimistically update the UI by updating the status
      const newRequests = { ...state.requests };
      if (newRequests[requestDate]) {
        newRequests[requestDate] = newRequests[requestDate].map((req) =>
          req.id === requestId
            ? { ...req, status: "cancellation_pending" as const }
            : req
        );
        state.setRequests(newRequests);
      }

      // Call the database function to handle cancellation logic
      const { data, error } = await supabase.rpc("cancel_leave_request", {
        p_request_id: requestId,
        p_member_id: member.id,
      });

      if (error) throw error;

      // If immediate cancellation (data is true), update the UI again
      if (data && member.calendar_id) {
        await state.refreshRequestsForDate(requestDate, member.calendar_id);
      }
      return true;
    } catch (error) {
      console.error("[CalendarStore] Error cancelling request:", error);
      // Revert optimistic update
      if (member.calendar_id) {
        await state.refreshRequestsForDate(requestDate, member.calendar_id);
      }
      return false;
    }
  },

  userSubmitRequest: async (date, type) => {
    // Get the member ID from the user store
    const member = useUserStore.getState().member;
    if (!member) {
      throw new Error("No member found");
    }

    console.log("[CalendarStore] Submitting request", {
      date,
      type,
      memberId: member.id,
      calendarId: member.calendar_id,
    });

    const state = get();
    try {
      // Check if date is selectable
      if (!state.isDateSelectable(date)) {
        throw new Error("Date is not available for selection");
      }

      // Submit request
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .insert({
          member_id: member.id,
          calendar_id: member.calendar_id,
          request_date: date,
          leave_type: type,
          status: "pending",
        })
        .select(
          "*, member:members(id, first_name, last_name, pin_number)",
        )
        .single();

      if (error) throw error;

      // Update local state optimistically
      const newRequests = { ...state.requests };
      if (!newRequests[date]) {
        newRequests[date] = [];
      }
      newRequests[date].push(data as DayRequest);
      state.setRequests(newRequests);

      return data as DayRequest;
    } catch (error) {
      console.error("[CalendarStore] Error submitting request:", error);
      throw error;
    }
  },

  submitSixMonthRequest: async (
    date: string,
    type: "PLD" | "SDV",
  ): Promise<DayRequest | null> => {
    // Get the member ID from the user store
    const member = useUserStore.getState().member;
    if (!member) {
      console.error("[CalendarStore] submitSixMonthRequest: No member found");
      return null;
    }

    console.log("[CalendarStore] Submitting six-month request", {
      date,
      type,
      memberId: member.id,
      calendarId: member.calendar_id,
    });

    const state = get();
    try {
      // Check if date is selectable for six-month request
      // First, validate date is in the six-month range
      const now = new Date();
      const dateObj = parseISO(date);
      const sixMonthsFromNow = getSixMonthDate();
      const isEndOfMonth = isLastDayOfMonth(now);
      const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();

      const isSixMonthRequestValid = isSixMonthDate || (
        isEndOfMonth &&
        dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
        dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
        dateObj.getDate() >= sixMonthsFromNow.getDate()
      );

      if (!isSixMonthRequestValid) {
        console.error(
          "[CalendarStore] submitSixMonthRequest: Selected date is not valid for a six-month request.",
        );
        return null;
      }

      // Check if we already have a six-month request for this date
      if (state.sixMonthRequestDays[date] === true) {
        console.error(
          "[CalendarStore] submitSixMonthRequest: You already have a six-month request for this date.",
        );
        return null;
      }

      // Submit six-month request
      const { data, error } = await supabase
        .from("six_month_requests")
        .insert({
          member_id: member.id,
          calendar_id: member.calendar_id,
          request_date: date,
          leave_type: type,
        })
        .select()
        .single();

      if (error) throw error;

      // Update the sixMonthRequestDays object
      const newSixMonthDays = { ...state.sixMonthRequestDays, [date]: true };
      state.setSixMonthRequestDays(newSixMonthDays);

      // Format the response to match DayRequest interface for compatibility
      // This is a temporary representation for the UI
      const formattedRequest = {
        id: data.id,
        member_id: data.member_id,
        calendar_id: data.calendar_id,
        request_date: data.request_date,
        leave_type: data.leave_type,
        status: "pending",
        requested_at: data.requested_at,
        member: {
          id: member.id ?? "",
          first_name: member.first_name,
          last_name: member.last_name,
          pin_number: member.pin_number,
        },
        actioned_at: null,
        actioned_by: null,
        created_at: data.requested_at,
        denial_comment: null,
        paid_in_lieu: false,
        updated_at: data.requested_at,
        waitlist_position: null,
        cancellation_reason: null,
        is_absence: false,
        absence_type: null,
        notes: null,
      };

      return formattedRequest as unknown as DayRequest;
    } catch (error) {
      console.error(
        "[CalendarStore] Error submitting six-month request:",
        error,
      );
      return null;
    }
  },

  // Replace the synchronous checkSixMonthRequest with the asynchronous version
  checkSixMonthRequest: async (date: string) => {
    const member = useUserStore.getState().member;

    if (!member?.id) {
      console.log(
        "[CalendarStore] checkSixMonthRequest: No member ID available",
      );
      return false;
    }

    try {
      console.log(`[CalendarStore] Checking for six-month request for ${date}`);

      // CRITICAL FIX: Explicitly query the six_month_requests table for the given date and member
      const { data, error } = await supabase
        .from("six_month_requests")
        .select("id, request_date, leave_type, processed")
        .eq("member_id", member.id)
        .eq("request_date", date)
        .eq("processed", false)
        .maybeSingle();

      if (error) {
        console.error(
          `[CalendarStore] Error checking six month request for ${date}:`,
          error,
        );
        return false;
      }

      const exists = !!data;

      if (exists) {
        console.log(
          `[CalendarStore] Found existing six-month request for ${date}:`,
          data,
        );
      }

      return exists;
    } catch (error) {
      console.error("[CalendarStore] Error checking six month request:", error);
      return false;
    }
  },

  cleanupCalendarState: () => {
    console.log("[CalendarStore] Cleaning up calendar state");
    const state = get();
    state.setAllotments({});
    state.setYearlyAllotments({});
    state.setRequests({});
    state.setSixMonthRequestDays({});
    state.setSelectedDate(null);
    state.setIsInitialized(false);
    state.setIsLoading(false);
    state.setError(null);
  },
}));

// Setup the realtime subscriptions
export function setupCalendarSubscriptions() {
  console.log("[CalendarStore] Setting up calendar subscriptions");

  const member = useUserStore.getState().member;
  if (!member?.id || !member.calendar_id) {
    console.log(
      "[CalendarStore] No member ID or calendar ID found, returning empty cleanup function",
    );
    return () => {
      console.log(
        "[CalendarStore] Empty cleanup function called - no subscriptions were set up",
      );
    }; // Return empty function with log
  }

  // Setup subscriptions
  const calendarId = member.calendar_id;
  const memberId = member.id;

  console.log(
    "[CalendarStore] Setting up subscriptions for memberId:",
    memberId,
    "calendarId:",
    calendarId,
  );

  // Create channels for different tables
  const pldSdvAllotmentsChannel = supabase.channel(
    "pld-sdv-allotments-changes",
  );
  const requestsChannel = supabase.channel("requests-changes");
  const sixMonthRequestsChannel = supabase.channel(
    "six-month-requests-changes",
  );

  // Subscribe to PLD/SDV allotments changes
  pldSdvAllotmentsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_allotments",
        filter: `calendar_id=eq.${calendarId}`,
      },
      async (payload: RealtimePostgresChangesPayload<any>) => {
        console.log(
          "[CalendarStore Realtime] PLD/SDV allotment change:",
          payload,
        );

        try {
          // Get the current state
          const state = useCalendarStore.getState();
          const newAllotments = { ...state.allotments };
          const newYearlyAllotments = { ...state.yearlyAllotments };

          // Handle different event types
          if (
            payload.eventType === "INSERT" || payload.eventType === "UPDATE"
          ) {
            // Update the allotment for the specific date
            newAllotments[payload.new.date] = payload.new.max_allotment;

            // If it has a year, update yearly allotments too
            if (payload.new.year) {
              newYearlyAllotments[payload.new.year] = payload.new.max_allotment;
            }

            state.setAllotments(newAllotments);
            state.setYearlyAllotments(newYearlyAllotments);
          } else if (payload.eventType === "DELETE") {
            // Remove the allotment for the specific date
            delete newAllotments[payload.old.date];
            state.setAllotments(newAllotments);

            // We don't delete from yearly allotments as there might be other dates with the same year
          }
        } catch (error) {
          console.error(
            "[CalendarStore Realtime] Error handling PLD/SDV allotment change:",
            error,
          );
        }
      },
    )
    .subscribe((status) => {
      console.log(
        "[CalendarStore Realtime] PLD/SDV allotments subscription status:",
        status,
      );
    });

  // Subscribe to requests changes
  requestsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_requests",
        filter: `calendar_id=eq.${calendarId}`,
      },
      async (payload: RealtimePostgresChangesPayload<any>) => {
        console.log("[CalendarStore Realtime] Request change:", payload);

        try {
          // Get the current state and refresh the requests for the affected date
          const state = useCalendarStore.getState();
          const member = useUserStore.getState().member;

          let date: string;
          if (
            payload.eventType === "INSERT" || payload.eventType === "UPDATE"
          ) {
            date = payload.new.request_date;
          } else {
            date = payload.old.request_date;
          }

          if (member?.calendar_id) {
            await state.refreshRequestsForDate(date, member.calendar_id);
          } else {
            console.warn(
              "[CalendarStore Realtime] Cannot refreshRequestsForDate, missing member.calendar_id",
            );
          }

          // !!! DIAGNOSTIC HACK !!!
          console.log(
            "[CalendarStore Realtime] Attempting to trigger TimeStore refresh for PLD/SDV change.",
          );
          const { triggerPldSdvRefresh } = useTimeStore.getState();
          if (triggerPldSdvRefresh) {
            triggerPldSdvRefresh().catch((error) => {
              console.error(
                "[CalendarStore Realtime] Error calling triggerPldSdvRefresh from TimeStore:",
                error,
              );
            });
          }
          // !!! END DIAGNOSTIC HACK !!!
        } catch (error) {
          console.error(
            "[CalendarStore Realtime] Error handling request change:",
            error,
          );
        }
      },
    )
    .subscribe((status) => {
      console.log(
        "[CalendarStore Realtime] Requests subscription status:",
        status,
      );
    });

  // Subscribe to six-month requests changes for the current member
  sixMonthRequestsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "six_month_requests",
        filter: `member_id=eq.${memberId}`,
      },
      async (payload: RealtimePostgresChangesPayload<any>) => {
        console.log(
          "[CalendarStore Realtime] Six-month request change detected:",
          {
            eventType: payload.eventType,
            table: payload.table,
            schema: payload.schema,
            memberId: memberId,
            requestDate: payload.eventType === "INSERT"
              ? payload.new.request_date
              : payload.old?.request_date,
          },
        );

        try {
          // Get the current state and update sixMonthRequestDays
          const state = useCalendarStore.getState();

          // Handle different event types
          if (payload.eventType === "INSERT") {
            // Add the date to sixMonthRequestDays
            const updatedDays = {
              ...state.sixMonthRequestDays,
              [payload.new.request_date]: true,
            };
            console.log(
              "[CalendarStore Realtime] Adding six-month request date to state:",
              payload.new.request_date,
              "Updated days:",
              Object.keys(updatedDays),
            );
            state.setSixMonthRequestDays(updatedDays);
          } else if (payload.eventType === "DELETE") {
            // Remove the date from sixMonthRequestDays
            const newSixMonthRequestDays = { ...state.sixMonthRequestDays };
            delete newSixMonthRequestDays[payload.old.request_date];
            console.log(
              "[CalendarStore Realtime] Removing six-month request date from state:",
              payload.old.request_date,
              "Updated days:",
              Object.keys(newSixMonthRequestDays),
            );
            state.setSixMonthRequestDays(newSixMonthRequestDays);
          } else if (payload.eventType === "UPDATE") {
            console.log(
              "[CalendarStore Realtime] Detected UPDATE for six-month request:",
              payload.old.request_date,
              "->",
              payload.new.request_date,
            );
            // Handle updates if needed
            if (payload.old.request_date !== payload.new.request_date) {
              const updatedDays = { ...state.sixMonthRequestDays };
              delete updatedDays[payload.old.request_date];
              updatedDays[payload.new.request_date] = true;
              state.setSixMonthRequestDays(updatedDays);
            }
          }

          // Verify state update was successful
          console.log(
            "[CalendarStore Realtime] Six-month days after update:",
            Object.keys(useCalendarStore.getState().sixMonthRequestDays),
          );
        } catch (error) {
          console.error(
            "[CalendarStore Realtime] Error handling six-month request change:",
            error,
          );
        }
      },
    )
    .subscribe((status) => {
      console.log(
        "[CalendarStore Realtime] Six-month subscription status:",
        status,
      );

      // Log detailed subscription info
      if (status === "SUBSCRIBED") {
        console.log(
          "[CalendarStore Realtime] Six-month subscription active. Channel details:",
          {
            channelName: "six-month-requests-changes",
            topic: "six-month-requests",
            isJoined: true,
          },
        );
      } else if (
        status === "CHANNEL_ERROR" || status === "CLOSED" ||
        status === "TIMED_OUT"
      ) {
        console.warn(
          "[CalendarStore Realtime] Six-month subscription issue detected:",
          status,
          "This may prevent six-month request updates from being received.",
        );
      }
    });

  console.log("[CalendarStore] All subscriptions setup complete");

  // Return a cleanup function directly
  return () => {
    console.log("[CalendarStore] Cleaning up calendar subscriptions");
    pldSdvAllotmentsChannel.unsubscribe();
    requestsChannel.unsubscribe();
    sixMonthRequestsChannel.unsubscribe();
    console.log("[CalendarStore] All subscriptions unsubscribed");
  };
}
