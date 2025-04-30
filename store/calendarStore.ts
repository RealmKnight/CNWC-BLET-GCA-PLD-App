import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
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
    id: string;
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
  id: string;
  first_name: string | null;
  last_name: string | null;
  pin_number: number;
}

interface FullRequestData {
  id: string;
  member_id: string;
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
  member: RequestMember;
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
  setAllotments: (allotments: Record<string, number>) => void;
  setYearlyAllotments: (yearlyAllotments: Record<number, number>) => void;
  setRequests: (requests: Record<string, DayRequest[]>) => void;
  setError: (error: string | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsInitialized: (isInitialized: boolean) => void;

  // Computed
  isDateSelectable: (date: string) => boolean;
  getDateAvailability: (
    date: string,
  ) => "available" | "limited" | "full" | "unavailable";

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
  loadInitialData: (
    startDate: string,
    endDate: string,
    calendarId: string,
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

  checkSixMonthRequest: (date: string) => Promise<boolean>;

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
  isLoading: false,
  error: null,
  isInitialized: false,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setAllotments: (allotments) => set({ allotments }),
  setYearlyAllotments: (yearlyAllotments) => set({ yearlyAllotments }),
  setRequests: (requests) => set({ requests }),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),

  isDateSelectable: (date: string) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);
    const fortyEightHoursFromNow = addDays(now, 2);
    const sixMonthsFromNow = getSixMonthDate();

    // First check basic time constraints
    if (isBefore(dateObj, fortyEightHoursFromNow)) {
      console.log("[CalendarStore] Date not selectable - before 48h:", date);
      return false;
    }

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

    // Check if the date is a normal request (less than 6 months away)
    // For end-of-month cases, dates in the target month but BEFORE the exact six-month date
    // should be treated as normal requests
    const isNormalRequest = !isAfter(dateObj, sixMonthsFromNow) || (
      isEndOfMonth &&
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
      dateObj.getDate() < sixMonthsFromNow.getDate()
    );

    // Special check for the problematic dates at end of target month
    if (isEndOfMonth) {
      // Check if the date is in the same month and year as six-month date
      const isSameMonthAndYear =
        dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
        dateObj.getFullYear() === sixMonthsFromNow.getFullYear();

      if (isSameMonthAndYear) {
        // Get the maximum day of the target month
        const lastDayOfMonth = new Date(
          dateObj.getFullYear(),
          dateObj.getMonth() + 1,
          0,
        ).getDate();

        // If it's a valid day in the target month, it should be selectable
        if (dateObj.getDate() <= lastDayOfMonth) {
          // Only log once per day for performance - moved to debug level
          // console.log(`[CalendarStore] Special month-end case: ${date} is selectable`);

          // Still need to check allotments
          const year = dateObj.getFullYear();
          const dateAllotment = state.allotments[date];
          const yearlyAllotment = state.yearlyAllotments[year];
          const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

          if (maxAllotment === 0) {
            console.log(
              "[CalendarStore] Date not selectable - no allotment:",
              date,
            );
            return false;
          }

          return true;
        }
      }
    }

    // Standard check - if date is beyond six months and not a special six-month request
    if (isAfter(dateObj, sixMonthsFromNow) && !isSixMonthRequest) {
      console.log(
        "[CalendarStore] Date not selectable - beyond six months:",
        date,
      );
      return false;
    }

    // Check allotments
    const year = dateObj.getFullYear();
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[year];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    if (maxAllotment === 0) {
      console.log("[CalendarStore] Date not selectable - no allotment:", date);
      return false;
    }

    // For six-month requests, we allow selection even if the date is full
    // because they are processed by seniority and waitlisted if needed
    if (isSixMonthRequest) {
      // console.log("[CalendarStore] Date selectable - six month request:", date);
      return true;
    }

    // For regular requests, we allow selection even if the date is full
    // so users can join the waitlist if needed
    const dateRequests = state.requests[date] || [];
    const activeRequests = dateRequests.filter((r) =>
      r.status === "approved" || r.status === "pending" ||
      r.status === "waitlisted"
    );

    // Don't check if the date is full here - allow selection of full dates for waitlisting
    // Regular requests - anything between 48 hours and six months
    if (isNormalRequest) {
      // console.log("[CalendarStore] Date selectable - regular request:", date);
      return true;
    }

    console.log("[CalendarStore] Date not selectable - general case:", date);
    return false;
  },

  getDateAvailability: (date: string) => {
    const state = get();
    const now = new Date();
    const dateObj = parseISO(date);
    const fortyEightHoursFromNow = addDays(now, 2);

    // CRITICAL FIX: Always call getSixMonthDate() to get the current calculation
    // This ensures we always have the most up-to-date six-month reference point
    const sixMonthsFromNow = getSixMonthDate();

    // Basic time constraint check
    if (isBefore(dateObj, fortyEightHoursFromNow)) {
      return "unavailable";
    }

    // Check if this is a six-month request date - FUNDAMENTAL ALGORITHM
    const isEndOfMonth = isLastDayOfMonth(now);

    // Calculate six-month request eligibility using the same logic as isDateSelectable
    // This ensures consistency between date selection and visual appearance
    const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();

    // Six-month requests are ONLY dates exactly 6 months away OR dates AFTER
    // the exact 6-month point when it's the end of month
    const isSixMonthRequest = isSixMonthDate || (
      isEndOfMonth &&
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
      dateObj.getDate() >= sixMonthsFromNow.getDate()
    );

    // For six-month requests, always indicate availability
    // regardless of whether the date has an allotment
    if (isSixMonthRequest) {
      return "available";
    }

    // Get allotment info for normal requests
    const year = dateObj.getFullYear();
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[year];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    if (maxAllotment === 0) {
      return "unavailable";
    }

    // Standard check for dates beyond six months
    if (isAfter(dateObj, sixMonthsFromNow) && !isSixMonthRequest) {
      return "unavailable";
    }

    // If we get here, the date is selectable, check capacity
    const dateRequests = state.requests[date] || [];
    const activeRequests = dateRequests.filter((r) =>
      r.status === "approved" || r.status === "pending" ||
      r.status === "waitlisted"
    );

    if (activeRequests.length >= maxAllotment) return "full";
    if (activeRequests.length >= maxAllotment * 0.7) return "limited";
    return "available";
  },

  fetchAllotments: async (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => {
    if (!calendarId) {
      console.warn("[CalendarStore] fetchAllotments: No calendarId provided.");
      return { allotments: {}, yearlyAllotments: {} };
    }

    try {
      const currentYear = new Date(startDate).getFullYear();
      const nextYear = currentYear + 1;

      // Fetch specific date allotments within range OR yearly allotments for current/next year
      const { data: allotmentsData, error } = await supabase
        .from("pld_sdv_allotments") // Correct table name
        .select("date, max_allotment, year")
        .eq("calendar_id", calendarId)
        .or(
          `year.eq.${currentYear},year.eq.${nextYear},date.gte.${startDate},date.lte.${endDate}`,
        );

      if (error) throw error;

      const allotmentsByDate: Record<string, number> = {};
      const yearlyAllotmentsByYear: Record<number, number> = {};

      // Process fetched data: Separate yearly defaults from specific dates
      allotmentsData?.forEach((allotment) => {
        const allotmentYear = allotment.year ??
          (allotment.date ? new Date(allotment.date).getFullYear() : null);
        const dateKey = allotment.date;
        const yearKey = allotmentYear;

        // Store yearly defaults (identified by having a year OR being Jan 1st of a year)
        if (
          yearKey &&
          (allotment.year !== null ||
            allotment.date === `${allotmentYear}-01-01`)
        ) {
          if (allotment.max_allotment !== null) {
            yearlyAllotmentsByYear[yearKey] = allotment.max_allotment;
          }
        }
        // Store specific date allotments
        if (dateKey && allotment.max_allotment !== null) {
          allotmentsByDate[dateKey] = allotment.max_allotment;
        }
      });

      // Backfill: Apply yearly defaults to dates without specific entries within the requested range
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      for (
        let date = startDateObj;
        isBefore(date, endDateObj) || date.getTime() === endDateObj.getTime();
        date = addDays(date, 1)
      ) {
        const dateStr = format(date, "yyyy-MM-dd");
        const currentYearLoop = date.getFullYear();
        // If no specific allotment exists for this date, apply the yearly default if available
        if (
          allotmentsByDate[dateStr] === undefined &&
          yearlyAllotmentsByYear[currentYearLoop] !== undefined
        ) {
          allotmentsByDate[dateStr] = yearlyAllotmentsByYear[currentYearLoop];
        }
      }
      console.log("[CalendarStore] Processed allotments data:", {
        dateCount: Object.keys(allotmentsByDate).length,
        yearCount: Object.keys(yearlyAllotmentsByYear).length,
      });

      return {
        allotments: allotmentsByDate,
        yearlyAllotments: yearlyAllotmentsByYear,
      };
    } catch (error) {
      console.error("[CalendarStore] Error fetching allotments:", error);
      throw error;
    }
  },

  fetchRequests: async (startDate, endDate, calendarId) => {
    console.log(
      `[CalendarStore] Fetching requests for calendar ${calendarId} from ${startDate} to ${endDate}`,
    );
    if (!calendarId) {
      console.error("[CalendarStore] fetchRequests called without calendarId.");
      return {};
    }

    try {
      const { data: requestsData, error } = await supabase
        .from("pld_sdv_requests")
        .select(`
          id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position,
          member:members!inner (
            id, first_name, last_name, pin_number
          )
        `)
        .eq("calendar_id", calendarId)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      if (error) throw error;

      const requestsByDate: Record<string, DayRequest[]> = {};
      requestsData?.forEach((request) => {
        const dateKey = request.request_date;
        if (!requestsByDate[dateKey]) {
          requestsByDate[dateKey] = [];
        }
        // Type assertion needed because the join result might not perfectly match DayRequest initially
        requestsByDate[dateKey].push(request as unknown as DayRequest);
      });

      console.log("[CalendarStore] Fetched requests data:", {
        dateCount: Object.keys(requestsByDate).length,
      });
      return requestsByDate;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      throw error;
    }
  },

  loadInitialData: async (startDate, endDate, calendarId) => {
    if (!calendarId) {
      console.error(
        "[CalendarStore] loadInitialData called without calendarId.",
      );
      set({ isLoading: false, error: "User or assigned calendar not found" });
      return;
    }
    set({ isLoading: true, error: null }); // Clear previous data? Maybe not needed if stores overwrite
    console.log(
      `[CalendarStore] Loading initial data for calendar ${calendarId}...`,
    );
    try {
      const [allotmentData, requestData] = await Promise.all([
        get().fetchAllotments(startDate, endDate, calendarId),
        get().fetchRequests(startDate, endDate, calendarId),
      ]);

      set({
        allotments: allotmentData.allotments,
        yearlyAllotments: allotmentData.yearlyAllotments,
        requests: requestData,
        isLoading: false,
        error: null,
        // DO NOT set isInitialized here - let the caller (useAuth) handle it
      });
      console.log("[CalendarStore] Initial data loaded successfully.");
    } catch (error) {
      console.error("[CalendarStore] Failed to load initial data:", error);
      set({
        isLoading: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load calendar data",
        // DO NOT set isInitialized here
      });
      // Propagate the error if needed
      // throw error;
    }
  },

  // Implement the new refresh action
  refreshRequestsForDate: async (date, calendarId) => {
    if (!calendarId || !date) {
      console.warn(
        "[CalendarStore] refreshRequestsForDate called without calendarId or date.",
      );
      return;
    }
    console.log(
      `[CalendarStore] Refreshing requests specifically for date: ${date}, calendar: ${calendarId}`,
    );
    try {
      // Fetch requests just for this date
      const { data: requestsData, error } = await supabase
        .from("pld_sdv_requests")
        .select(`
          id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position,
          member:members!inner (
            id, first_name, last_name, pin_number
          )
        `)
        .eq("calendar_id", calendarId)
        .eq("request_date", date);

      if (error) throw error;

      // Update the store state for this specific date
      set((state) => ({
        requests: {
          ...state.requests,
          [date]: (requestsData || []) as unknown as DayRequest[], // Use type assertion
        },
      }));
      console.log(
        `[CalendarStore] Refreshed requests for ${date}:`,
        requestsData?.length || 0,
      );
    } catch (error) {
      console.error(
        `[CalendarStore] Error refreshing requests for date ${date}:`,
        error,
      );
      // Optionally set an error state specific to this action if needed
    }
  },

  cancelRequest: async (requestId: string, requestDate: string) => {
    const state = get();
    const member = useUserStore.getState().member;

    if (!member) {
      set({ error: "No member information found" });
      return false;
    }

    try {
      set({ isLoading: true });

      const requestsForDate = state.requests[requestDate] || [];
      const foundRequest = requestsForDate.find((r) => r.id === requestId);

      if (!foundRequest) {
        throw new Error("Request not found for the specified date");
      }

      // Always use the database function which properly handles all types of requests
      console.log(
        `[CalendarStore] Cancelling request using database function: ${requestId}, status: ${foundRequest.status}`,
      );

      // Call the database function to handle cancellation logic consistently
      const { data, error } = await supabase.rpc("cancel_leave_request", {
        p_request_id: requestId,
        p_member_id: member.id,
      });

      if (error) throw error;

      // Determine the new status based on the result and current status
      let newStatus: DayRequest["status"];

      if (foundRequest.status === "waitlisted") {
        // Waitlisted requests are immediately cancelled
        newStatus = "cancelled";
      } else if (foundRequest.status === "approved") {
        // Approved requests go to cancellation_pending
        newStatus = "cancellation_pending";
      } else {
        // All other statuses go to cancelled
        newStatus = "cancelled";
      }

      // Update local state
      const updatedRequests: DayRequest[] = requestsForDate.map((request) =>
        request.id === requestId
          ? {
            ...request,
            status: newStatus,
            waitlist_position: foundRequest.status === "waitlisted"
              ? null
              : request.waitlist_position,
          }
          : request
      );

      set((prevState) => ({
        requests: {
          ...prevState.requests,
          [requestDate]: updatedRequests,
        },
      }));

      // Ensure we have the latest data after cancellation
      setTimeout(() => {
        if (member.calendar_id) {
          get().refreshRequestsForDate(requestDate, member.calendar_id);
        }
      }, 1000);

      return true;
    } catch (error) {
      console.error("[CalendarStore] Error cancelling request:", error);
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

  submitSixMonthRequest: async (
    date: string,
    type: "PLD" | "SDV",
  ): Promise<DayRequest | null> => {
    const member = useUserStore.getState().member;

    if (!member) {
      throw new Error("Member information not found");
    }

    if (!member.id) {
      throw new Error("Member ID is missing");
    }

    if (!member.calendar_id) {
      throw new Error("No calendar assigned to member");
    }

    try {
      console.log("[CalendarStore] Submitting six-month request:", {
        date,
        type,
        memberId: member.id,
        calendarId: member.calendar_id,
      });

      // Check if user has available days for the requested type
      const currentYear = new Date().getFullYear();
      const { data: memberEntitlements, error: memberError } = await supabase
        .from("members")
        .select("max_plds, sdv_entitlement, pld_rolled_over")
        .eq("id", member.id)
        .single();

      if (memberError) {
        throw new Error(
          "Unable to determine available days. Please try again.",
        );
      }

      // Get existing requests to determine how many days are already used
      const { data: existingRequests, error: requestsError } = await supabase
        .from("pld_sdv_requests")
        .select("leave_type, status, paid_in_lieu")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      if (requestsError) {
        throw new Error("Unable to check existing requests. Please try again.");
      }

      // Get existing six-month requests to also count against available days
      const { data: existingSixMonthRequests, error: sixMonthRequestsError } =
        await supabase
          .from("six_month_requests")
          .select("leave_type")
          .eq("member_id", member.id)
          .eq("processed", false)
          .gte("request_date", `${currentYear}-01-01`)
          .lte("request_date", `${currentYear}-12-31`);

      if (sixMonthRequestsError) {
        throw new Error(
          "Unable to check six-month requests. Please try again.",
        );
      }

      // Calculate used days
      let usedPlds = 0;
      let usedSdvs = 0;

      existingRequests?.forEach((request) => {
        // Only count requests that are consuming days (approved, pending, or waitlisted but not paid in lieu)
        if (
          (request.status === "approved" ||
            request.status === "pending" ||
            request.status === "waitlisted" ||
            request.status === "cancellation_pending") &&
          !request.paid_in_lieu
        ) {
          if (request.leave_type === "PLD") {
            usedPlds++;
          } else if (request.leave_type === "SDV") {
            usedSdvs++;
          }
        }
      });

      // Count pending six-month requests against available days
      existingSixMonthRequests?.forEach((request) => {
        if (request.leave_type === "PLD") {
          usedPlds++;
        } else if (request.leave_type === "SDV") {
          usedSdvs++;
        }
      });

      // Calculate available days
      const totalPlds = (memberEntitlements?.max_plds || 0) +
        (memberEntitlements?.pld_rolled_over || 0);
      const totalSdvs = memberEntitlements?.sdv_entitlement || 0;

      const availablePlds = totalPlds - usedPlds;
      const availableSdvs = totalSdvs - usedSdvs;

      console.log("[CalendarStore] Available days for six-month request:", {
        pld: availablePlds,
        sdv: availableSdvs,
      });

      // Check if user has available days for the requested type
      const availableDays = type === "PLD" ? availablePlds : availableSdvs;

      if (availableDays <= 0) {
        throw new Error(
          `No available ${type} days left. Cannot submit six-month request.`,
        );
      }

      // Create the six-month request
      const insertPayload = {
        member_id: member.id,
        calendar_id: member.calendar_id,
        request_date: date,
        leave_type: type,
        processed: false,
        requested_at: new Date().toISOString(),
      };

      // Insert the request without using .select() to avoid metadata field error
      const { data: insertedData, error: insertError } = await supabase
        .from("six_month_requests")
        .insert(insertPayload)
        .select("id")
        .single();

      if (insertError) throw insertError;
      if (!insertedData) throw new Error("Failed to create six-month request");

      // Create a request object for the UI state
      const request: DayRequest = {
        id: insertedData.id,
        member_id: member.id,
        calendar_id: member.calendar_id,
        request_date: date,
        leave_type: type,
        status: "pending",
        requested_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        responded_at: null,
        responded_by: null,
        paid_in_lieu: false,
        denial_reason_id: null,
        denial_comment: null,
        actioned_by: null,
        actioned_at: null,
        metadata: null,
        waitlist_position: null,
        is_rollover_pld: false,
        override_by: null,
        member: {
          id: member.id,
          first_name: member.first_name || null,
          last_name: member.last_name || null,
          pin_number: member.pin_number || 0,
        },
      };

      // Add the request to the local state
      const currentRequests = get().requests[date] || [];
      set((state) => ({
        requests: {
          ...state.requests,
          [date]: [...currentRequests, request],
        },
      }));

      return request;
    } catch (error) {
      console.error(
        "[CalendarStore] Error submitting six-month request:",
        error,
      );
      throw error;
    }
  },

  getActiveRequests: (date: string) => {
    const state = get();
    const dateRequests = state.requests[date] || [];
    return dateRequests.filter((r) =>
      r.status === "approved" || r.status === "pending" ||
      r.status === "waitlisted"
    );
  },

  userSubmitRequest: async (
    date: string,
    type: "PLD" | "SDV",
  ): Promise<DayRequest> => {
    const member = useUserStore.getState().member;
    const calendarId = member?.calendar_id;

    if (!member || !calendarId) {
      throw new Error("Member or assigned calendar not found");
    }

    if (!member.id) {
      throw new Error("Member ID is missing");
    }

    try {
      console.log("[CalendarStore] User submitting request:", {
        date,
        type,
        calendarId,
      });

      // Get member's PLD and SDV entitlements and current requests from the database
      const currentYear = new Date().getFullYear();
      const { data: memberEntitlements, error: memberError } = await supabase
        .from("members")
        .select("max_plds, sdv_entitlement, pld_rolled_over")
        .eq("id", member.id)
        .single();

      if (memberError) {
        throw new Error(
          "Unable to determine available days. Please try again.",
        );
      }

      // Get existing requests to determine how many days are already used
      const { data: existingRequests, error: requestsError } = await supabase
        .from("pld_sdv_requests")
        .select("leave_type, status, paid_in_lieu")
        .eq("member_id", member.id)
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      if (requestsError) {
        throw new Error("Unable to check existing requests. Please try again.");
      }

      // Get existing six-month requests to also count against available days
      const { data: sixMonthRequests, error: sixMonthRequestsError } =
        await supabase
          .from("six_month_requests")
          .select("leave_type")
          .eq("member_id", member.id)
          .eq("processed", false)
          .gte("request_date", `${currentYear}-01-01`)
          .lte("request_date", `${currentYear}-12-31`);

      if (sixMonthRequestsError) {
        throw new Error(
          "Unable to check six-month requests. Please try again.",
        );
      }

      // Calculate used days
      let usedPlds = 0;
      let usedSdvs = 0;

      existingRequests?.forEach((request) => {
        // Only count requests that are consuming days (approved, pending, or waitlisted but not paid in lieu)
        if (
          (request.status === "approved" ||
            request.status === "pending" ||
            request.status === "waitlisted" ||
            request.status === "cancellation_pending") &&
          !request.paid_in_lieu
        ) {
          if (request.leave_type === "PLD") {
            usedPlds++;
          } else if (request.leave_type === "SDV") {
            usedSdvs++;
          }
        }
      });

      // Count pending six-month requests against available days
      sixMonthRequests?.forEach((request) => {
        if (request.leave_type === "PLD") {
          usedPlds++;
        } else if (request.leave_type === "SDV") {
          usedSdvs++;
        }
      });

      // Calculate available days
      const totalPlds = (memberEntitlements?.max_plds || 0) +
        (memberEntitlements?.pld_rolled_over || 0);
      const totalSdvs = memberEntitlements?.sdv_entitlement || 0;

      const availablePlds = totalPlds - usedPlds;
      const availableSdvs = totalSdvs - usedSdvs;

      console.log("[CalendarStore] Available days:", {
        pld: availablePlds,
        sdv: availableSdvs,
      });

      // Check if user has available days for the requested type
      const availableDays = type === "PLD" ? availablePlds : availableSdvs;

      if (availableDays <= 0) {
        throw new Error(
          `No available ${type} days left. Cannot submit request.`,
        );
      }

      const year = new Date(date).getFullYear();
      const maxAllotment = get().allotments[date] ??
        get().yearlyAllotments[year] ?? 0;

      if (maxAllotment === 0) {
        throw new Error("No allotments available for this date");
      }

      // Check if the day is full and determine status
      const dateRequests = get().requests[date] || [];
      const activeRequests = dateRequests.filter((r: DayRequest) =>
        r.status === "approved" || r.status === "pending"
      );
      const waitlistedRequests = dateRequests.filter((r: DayRequest) =>
        r.status === "waitlisted"
      );

      // Use explicit string literal type
      let status:
        | "pending"
        | "waitlisted"
        | "approved"
        | "denied"
        | "cancelled"
        | "cancellation_pending" = "pending";
      let waitlist_position: number | null = null;

      // If the allotment is already full, add to waitlist
      if (activeRequests.length >= maxAllotment) {
        status = "waitlisted";
        // Calculate waitlist position (next position after current waitlisted requests)
        const currentMaxPosition = waitlistedRequests.length > 0
          ? Math.max(
            ...waitlistedRequests.map((r: DayRequest) =>
              r.waitlist_position || 0
            ),
          )
          : 0;
        waitlist_position = currentMaxPosition + 1;
        console.log(
          "[CalendarStore] Adding to waitlist with position:",
          waitlist_position,
        );
      }

      const insertPayload: TablesInsert<"pld_sdv_requests"> = {
        member_id: member.id,
        calendar_id: calendarId,
        request_date: date,
        leave_type: type,
        status,
        waitlist_position,
      };

      const { data: insertedRequest, error: insertError } = await supabase
        .from("pld_sdv_requests")
        .insert(insertPayload)
        .select(
          `*, member:members!inner(id, first_name, last_name, pin_number)`,
        )
        .single();

      if (insertError) throw insertError;
      if (!insertedRequest) throw new Error("Request insertion failed");

      const memberInfo = (insertedRequest as any).member;
      const memberData = {
        id: memberInfo.id as string ?? "",
        first_name: memberInfo.first_name as string | null,
        last_name: memberInfo.last_name as string | null,
        pin_number: memberInfo.pin_number as number ?? 0,
      };
      const request: DayRequest = {
        ...insertedRequest,
        member: memberData,
      } as DayRequest;

      const currentRequests = get().requests[date] || [];
      set((state: CalendarState) => ({
        requests: {
          ...state.requests,
          [date]: [...currentRequests, request],
        },
      }));

      return request;
    } catch (error) {
      console.error("[CalendarStore] Error submitting request:", error);
      throw error;
    }
  },

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
    console.log("[CalendarStore] Cleaning up calendar state...");
    set({
      selectedDate: null,
      allotments: {},
      yearlyAllotments: {},
      requests: {},
      isLoading: false,
      error: null,
      isInitialized: false, // Reset initialized flag on cleanup
    });
  },
}));

export function setupCalendarSubscriptions() {
  // **** ADDED DEBUG LOG ****
  console.log(
    "[setupCalendarSubscriptions] Attempting to set up subscriptions...",
  );
  const { member } = useUserStore.getState();
  const calendarId = member?.calendar_id;

  // **** ADDED DEBUG LOG ****
  console.log(
    `[setupCalendarSubscriptions] Retrieved member/calendarId: ${calendarId}`,
  );

  if (!calendarId) {
    console.log(
      "[CalendarStore] No calendar_id found, skipping subscriptions setup.",
    );
    return { unsubscribe: () => {} };
  }

  console.log(
    `[CalendarStore] Setting up subscriptions for calendar: ${calendarId}`,
  );

  let isSubscribed = true;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 5000;

  const allotmentsChannel = supabase.channel(`allotments-${calendarId}`);
  const requestsChannel = supabase.channel(`requests-${calendarId}`);

  // **** ADDED DEBUG LOG ****
  console.log(
    `[setupCalendarSubscriptions] Created channels: allotments-${calendarId}, requests-${calendarId}`,
  );

  const handleSubscriptionError = async (error: any, channelName: string) => {
    console.error(`[CalendarStore] ${channelName} subscription error:`, error);
    reconnectAttempts++;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isSubscribed) {
      console.log(
        `[CalendarStore] Attempting to reconnect ${channelName} (attempt ${reconnectAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));
      // Return true to indicate a retry should happen
      return true;
    }

    console.log(
      `[CalendarStore] Max reconnection attempts reached for ${channelName}`,
    );
    return false;
  };

  // --- Allotments Subscription ---
  allotmentsChannel
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to all events
        schema: "public",
        table: "pld_sdv_allotments",
        filter: `calendar_id=eq.${calendarId}`,
      },
      (payload: RealtimePostgresChangesPayload<PldSdvAllotment>) => {
        console.log(
          "[CalendarStore Sub Entry Point] Allotment change handler triggered.",
        );
        console.log(
          "[CalendarStore Sub] === Received ALLOTMENT change ===",
          payload.eventType,
          (payload.new as Partial<PldSdvAllotment>)?.date ||
            (payload.old as Partial<PldSdvAllotment>)?.date,
        );
        const { eventType, new: newRecordPartial, old: oldRecordPartial } =
          payload;
        // Explicitly type as Partial and get store state
        const newRecord = newRecordPartial as Partial<PldSdvAllotment>;
        const oldRecord = oldRecordPartial as Partial<PldSdvAllotment>;
        const store = useCalendarStore.getState();

        // Determine the key (date or year) and value
        let dateKey: string | null = null;
        let yearKey: number | null = null;
        let newAllotmentValue: number | undefined = undefined;
        let recordToProcess: Partial<PldSdvAllotment> | null = null; // Use Partial here too

        if (eventType === "INSERT" || eventType === "UPDATE") {
          recordToProcess = newRecord;
          newAllotmentValue = newRecord.max_allotment;
        } else if (eventType === "DELETE") {
          recordToProcess = oldRecord;
        } else {
          return;
        }

        if (!recordToProcess) return;

        // Check for necessary fields before processing
        const processYear = recordToProcess.year;
        const processDate = recordToProcess.date;
        const processMaxAllotment = recordToProcess.max_allotment;

        // Distinguish between yearly default and daily override
        // Use type guards
        if (
          processDate && processYear && processDate === `${processYear}-01-01`
        ) {
          yearKey = processYear;
          dateKey = null;
        } else if (processDate) {
          dateKey = processDate;
          yearKey = new Date(dateKey).getFullYear();
        } else if (processYear) {
          yearKey = processYear;
          dateKey = null;
        }

        // Update state based on event type and key
        if (dateKey && yearKey) { // Daily override change (ensure yearKey is derived)
          const currentAllotments = store.allotments;
          const updatedAllotments = { ...currentAllotments };
          if (eventType === "DELETE") {
            delete updatedAllotments[dateKey];
            console.log(
              `[CalendarStore] Removed daily allotment override for ${dateKey}`,
            );
            // Re-apply yearly default if it exists
            const yearlyDefault = store.yearlyAllotments[yearKey];
            if (yearlyDefault !== undefined) {
              updatedAllotments[dateKey] = yearlyDefault;
              console.log(
                `[CalendarStore] Re-applied yearly default (${yearlyDefault}) to ${dateKey}`,
              );
            }
          } else if (newAllotmentValue !== undefined) {
            updatedAllotments[dateKey] = newAllotmentValue;
            console.log(
              `[CalendarStore] Updated daily allotment for ${dateKey} to ${newAllotmentValue}`,
            );
          }

          // Update allotments state immediately
          store.setAllotments(updatedAllotments);

          // ENHANCEMENT: Fetch the latest requests for this date to reflect waitlist changes
          // This ensures the Calendar correctly shows any requests that were promoted from waitlist
          if (dateKey) {
            (async () => {
              try {
                console.log(
                  `[CalendarStore] Fetching latest requests for date ${dateKey} after allocation change`,
                );

                const { data: requestsData, error } = await supabase
                  .from("pld_sdv_requests")
                  .select(`
                    id, member_id, calendar_id, request_date, leave_type, status, requested_at, waitlist_position,
                    member:members!inner (
                      id, first_name, last_name, pin_number
                    )
                  `)
                  .eq("calendar_id", calendarId)
                  .eq("request_date", dateKey);

                if (error) {
                  console.error(
                    `[CalendarStore] Error fetching requests for date ${dateKey}:`,
                    error,
                  );
                  return;
                }

                if (requestsData) {
                  // Update the specific date in the requests state
                  const storeState = useCalendarStore.getState();
                  const updatedRequests = {
                    ...storeState.requests,
                    [dateKey]: requestsData as unknown as DayRequest[],
                  };

                  storeState.setRequests(updatedRequests);
                  console.log(
                    `[CalendarStore] Updated requests for date ${dateKey} after allocation change: ${requestsData.length} requests`,
                  );
                }
              } catch (error) {
                console.error(
                  `[CalendarStore] Error in async fetch after allocation change:`,
                  error,
                );
              }
            })();
          }
        }

        if (yearKey && !dateKey) { // Yearly default change (only if dateKey is null)
          const currentYearly = store.yearlyAllotments;
          const updatedYearly = { ...currentYearly };
          if (eventType === "DELETE") {
            delete updatedYearly[yearKey];
            console.log(
              `[CalendarStore] Removed yearly allotment default for ${yearKey}`,
            );
            // Trigger a refetch for the affected year
            console.log(
              `[CalendarStore] Yearly default ${yearKey} deleted, triggering refetch for year's daily data.`,
            );
            setTimeout(
              () =>
                store.fetchAllotments(
                  store.selectedDate || format(new Date(), "yyyy-MM-dd"),
                  store.selectedDate || format(new Date(), "yyyy-MM-dd"),
                  calendarId,
                ),
              0,
            );
          } else if (newAllotmentValue !== undefined) {
            updatedYearly[yearKey] = newAllotmentValue;
            console.log(
              `[CalendarStore] Updated yearly allotment default for ${yearKey} to ${newAllotmentValue}`,
            );
            // Trigger a refetch for the affected year
            console.log(
              `[CalendarStore] Yearly default ${yearKey} updated, triggering refetch for year's daily data.`,
            );
            setTimeout(
              () =>
                store.fetchAllotments(
                  store.selectedDate || format(new Date(), "yyyy-MM-dd"),
                  store.selectedDate || format(new Date(), "yyyy-MM-dd"),
                  calendarId,
                ),
              0,
            );
          }
          store.setYearlyAllotments(updatedYearly); // Directly set the updated object
        }
      },
    )
    .subscribe(async (status) => {
      console.log(
        "[CalendarStore Sub] === Allotments Subscription Status ===",
        status,
      );
      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0; // Reset on successful connection
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Attempt reconnect on specific error statuses
        if (await handleSubscriptionError(status, "allotments")) {
          allotmentsChannel.subscribe();
        }
      }
    });

  // --- Requests Subscription (Corrected Types) ---
  requestsChannel
    .on(
      "postgres_changes",
      {
        event: "*", // Listen to all events
        schema: "public",
        table: "pld_sdv_requests",
        filter: `calendar_id=eq.${calendarId}`,
      },
      async (payload: RealtimePostgresChangesPayload<DayRequest>) => {
        const { eventType, new: newRecordPartial, old: oldRecordPartial } =
          payload;
        const newRecord = newRecordPartial as Partial<DayRequest>;
        const oldRecord = oldRecordPartial as Partial<DayRequest>;
        console.log(
          "[CalendarStore Sub] === Received REQUEST change ===",
          eventType,
          newRecord?.id || oldRecord?.id,
          "Status:",
          newRecord?.status,
        );
        const requestDate = newRecord?.request_date || oldRecord?.request_date;

        if (!requestDate) {
          console.warn(
            "[CalendarStore] Request change received without date info:",
            payload,
          );
          return; // Skip if no date context
        }

        // --- Helper to fetch member details ---
        const fetchMemberDetails = async (
          memberId: string | undefined,
        ): Promise<RequestMember | null> => { // Handle undefined memberId
          if (!memberId) return null;
          try {
            const { data: memberData, error } = await supabase
              .from("members")
              .select("id, first_name, last_name, pin_number")
              .eq("id", memberId)
              .single();
            if (error) throw error;
            return {
              id: memberData.id,
              first_name: memberData.first_name,
              last_name: memberData.last_name,
              pin_number: memberData.pin_number ?? 0,
            };
          } catch (error) {
            console.error(
              "[CalendarStore] Error fetching member details:",
              error,
            );
            return null;
          }
        };

        // Update state based on event type
        const processRecord = async () => {
          const store = useCalendarStore.getState(); // Get current state inside async function
          const currentRequests = store.requests[requestDate] || [];
          let updatedDateRequests = [...currentRequests];
          let memberInfo: RequestMember | null = null;
          let requestModified = false;

          // Helper to ensure object conforms to DayRequest structure
          const ensureDayRequest = (
            record: Partial<DayRequest>,
            member: RequestMember | null,
          ): DayRequest => {
            return {
              id: record.id || "", // Provide default
              member_id: record.member_id || "", // Provide default
              calendar_id: record.calendar_id || null,
              request_date: record.request_date || "", // Provide default
              leave_type: record.leave_type || "PLD", // Provide default
              status: record.status || "pending", // Provide default
              requested_at: record.requested_at || new Date().toISOString(), // Provide default
              created_at: record.created_at || new Date().toISOString(), // Provide default
              updated_at: record.updated_at || new Date().toISOString(), // Provide default
              responded_at: record.responded_at || null,
              responded_by: record.responded_by || null,
              paid_in_lieu: record.paid_in_lieu || false, // Provide default
              denial_reason_id: record.denial_reason_id || null,
              denial_comment: record.denial_comment || null,
              actioned_by: record.actioned_by || null,
              actioned_at: record.actioned_at || null,
              metadata: record.metadata || null,
              waitlist_position: record.waitlist_position === undefined
                ? null
                : record.waitlist_position, // Handle undefined
              is_rollover_pld: record.is_rollover_pld || false, // Provide default
              override_by: record.override_by || null,
              member: member ||
                { id: "", first_name: null, last_name: null, pin_number: 0 }, // Provide default member
              ...record, // Spread the partial record last to override defaults
            };
          };

          if (
            eventType === "INSERT" && newRecord && newRecord.id &&
            newRecord.member_id
          ) {
            memberInfo = await fetchMemberDetails(newRecord.member_id);
            // Ensure memberInfo is not null before proceeding
            if (memberInfo) {
              const completeRecord = ensureDayRequest(newRecord, memberInfo);
              if (
                !updatedDateRequests.some((req) => req.id === completeRecord.id)
              ) {
                updatedDateRequests.push(completeRecord);
                requestModified = true;
              }
            }
          } else if (eventType === "UPDATE" && newRecord && newRecord.id) {
            const index = updatedDateRequests.findIndex((req) =>
              req.id === newRecord.id
            );
            if (index !== -1) {
              const existingRequest = updatedDateRequests[index];
              memberInfo = existingRequest.member ||
                await fetchMemberDetails(
                  newRecord.member_id || existingRequest.member_id,
                );
              // Ensure memberInfo is not null before proceeding
              if (memberInfo) {
                const mergedRecord = ensureDayRequest({
                  ...existingRequest,
                  ...newRecord, // Spread newRecord over existing
                }, memberInfo); // Pass memberInfo separately
                updatedDateRequests[index] = mergedRecord;
                requestModified = true;
              }
            } else { // Treat as INSERT if not found
              if (newRecord.member_id) {
                memberInfo = await fetchMemberDetails(newRecord.member_id);
                // Ensure memberInfo is not null before proceeding
                if (memberInfo) {
                  const completeRecord = ensureDayRequest(
                    newRecord,
                    memberInfo,
                  );
                  updatedDateRequests.push(completeRecord);
                  requestModified = true;
                }
              } else {
                console.warn(
                  "[CalendarStore] UPDATE as INSERT: Missing member_id in newRecord:",
                  newRecord,
                );
              }
            }
          } else if (eventType === "DELETE" && oldRecord && oldRecord.id) {
            const initialLength = updatedDateRequests.length;
            updatedDateRequests = updatedDateRequests.filter((req) =>
              req.id !== oldRecord.id
            );
            if (updatedDateRequests.length < initialLength) {
              requestModified = true;
            }
          }

          if (requestModified) {
            console.log(
              `[CalendarStore] Updating requests state for date: ${requestDate}`,
            );
            useCalendarStore.setState((prevState) => ({
              requests: {
                ...prevState.requests,
                [requestDate]: updatedDateRequests,
              },
            }));
          }
        };

        processRecord(); // Fire and forget async processing
      },
    )
    .subscribe(async (status) => {
      console.log(
        "[CalendarStore Sub] === Requests Subscription Status ===",
        status,
      );
      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0; // Reset on successful connection
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Attempt reconnect
        if (await handleSubscriptionError(status, "requests")) {
          requestsChannel.subscribe();
        }
      }
    });

  return {
    unsubscribe: () => {
      console.log(
        "[CalendarStore] Unsubscribing from realtime updates for calendar:",
        calendarId,
      );
      isSubscribed = false;
      allotmentsChannel.unsubscribe();
      requestsChannel.unsubscribe();
    },
  };
}
