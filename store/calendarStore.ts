import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
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
  loadInitialData: (startDate: string, endDate: string) => Promise<void>;

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

    // Check if date is beyond six months
    if (isAfter(dateObj, sixMonthsFromNow)) {
      console.log(
        "[CalendarStore] Date not selectable - beyond six months:",
        date,
      );
      return false;
    }

    // Check if today is end of month for six month request handling or exact 6-month date
    const isEndOfMonth = isLastDayOfMonth(now);
    const isSixMonthDate = dateObj.getTime() === sixMonthsFromNow.getTime();
    const isSixMonthRequest = isSixMonthDate || (isEndOfMonth &&
      dateObj.getMonth() === sixMonthsFromNow.getMonth() &&
      dateObj.getFullYear() === sixMonthsFromNow.getFullYear() &&
      !isBefore(dateObj, sixMonthsFromNow));

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
      console.log("[CalendarStore] Date selectable - six month request:", date);
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
    if (
      !isBefore(dateObj, fortyEightHoursFromNow) &&
      !isAfter(dateObj, sixMonthsFromNow)
    ) {
      console.log("[CalendarStore] Date selectable - regular request:", date);
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

    // Basic time constraint check
    if (isBefore(dateObj, fortyEightHoursFromNow)) {
      return "unavailable";
    }

    // Get allotment info
    const year = dateObj.getFullYear();
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[year];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    if (maxAllotment === 0) {
      return "unavailable";
    }

    // Check if date is selectable using our six-month logic
    if (!state.isDateSelectable(date)) {
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

      const { data: allotmentsData, error } = await supabase
        .from("pld_sdv_allotments")
        .select("date, max_allotment, year")
        .eq("calendar_id", calendarId!)
        .or(
          `year.eq.${currentYear},year.eq.${nextYear},date.gte.${startDate},date.lte.${endDate}`,
        );

      if (error) throw error;

      const allotmentsByDate: Record<string, number> = {};
      const yearlyAllotmentsByYear: Record<number, number> = {};

      allotmentsData?.forEach((allotment) => {
        const allotmentYear = allotment.year ??
          new Date(allotment.date).getFullYear();
        const dateKey = allotment.date;
        const yearKey = allotmentYear;

        if (
          allotment.year !== null || allotment.date === `${allotmentYear}-01-01`
        ) {
          yearlyAllotmentsByYear[yearKey] = allotment.max_allotment;
        }
        allotmentsByDate[dateKey] = allotment.max_allotment;
      });

      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      for (
        let date = startDateObj;
        isBefore(date, endDateObj) || date.getTime() === endDateObj.getTime();
        date = addDays(date, 1)
      ) {
        const dateStr = format(date, "yyyy-MM-dd");
        const currentYearLoop = date.getFullYear();
        if (
          allotmentsByDate[dateStr] === undefined &&
          yearlyAllotmentsByYear[currentYearLoop] !== undefined
        ) {
          allotmentsByDate[dateStr] = yearlyAllotmentsByYear[currentYearLoop];
        }
      }

      return {
        allotments: allotmentsByDate,
        yearlyAllotments: yearlyAllotmentsByYear,
      };
    } catch (error) {
      console.error("[CalendarStore] Error fetching allotments:", error);
      throw error;
    }
  },

  fetchRequests: async (
    startDate: string,
    endDate: string,
    calendarId: string,
  ) => {
    if (!calendarId) {
      console.warn("[CalendarStore] fetchRequests: No calendarId provided.");
      return {};
    }

    try {
      // Only fetch regular requests, not six month requests
      // Six month requests are stored in a separate table and should not be
      // displayed on the calendar or count against daily allotments
      const { data: requestsData, error } = await supabase
        .from("pld_sdv_requests")
        .select(`
          id, member_id, calendar_id, request_date, leave_type, status,
          requested_at, waitlist_position, responded_at, responded_by, paid_in_lieu,
          denial_reason_id, denial_comment, actioned_by, actioned_at, created_at, updated_at, metadata,
          member:members!inner ( id, first_name, last_name, pin_number )
        `)
        .eq("calendar_id", calendarId!)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      if (error) {
        console.error("[CalendarStore] Error fetching requests:", error);
        throw error;
      }

      const requestsByDate: Record<string, DayRequest[]> = {};

      if (requestsData) {
        for (const rawRequest of requestsData) {
          const dateKey = rawRequest.request_date;

          if (!requestsByDate[dateKey]) {
            requestsByDate[dateKey] = [];
          }

          const memberInfo = (rawRequest as any).member;
          const memberData = memberInfo && typeof memberInfo === "object"
            ? {
              id: memberInfo.id as string ?? "",
              first_name: memberInfo.first_name as string | null,
              last_name: memberInfo.last_name as string | null,
              pin_number: memberInfo.pin_number as number ?? 0,
            }
            : {
              id: "",
              first_name: "Unknown",
              last_name: "Member",
              pin_number: 0,
            };

          const dayRequest: DayRequest = {
            id: rawRequest.id,
            member_id: rawRequest.member_id,
            calendar_id: rawRequest.calendar_id,
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
          } as DayRequest;
          requestsByDate[dateKey].push(dayRequest);
        }
      }
      return requestsByDate;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      throw error;
    }
  },

  loadInitialData: async (startDate: string, endDate: string) => {
    const { member } = useUserStore.getState();
    const calendarId = member?.calendar_id;

    if (!member || !calendarId) {
      console.log(
        "[CalendarStore] No member or calendar_id found for initialization",
      );
      set({
        error: "User or assigned calendar not found",
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      console.log(
        `[CalendarStore] Fetching data for calendarId: ${calendarId}`,
      );
      const [allotmentsResult, requestsResult] = await Promise.all([
        get().fetchAllotments(startDate, endDate, calendarId),
        get().fetchRequests(startDate, endDate, calendarId),
      ]);

      set({
        isLoading: false,
        isInitialized: true,
        error: null,
        allotments: allotmentsResult.allotments,
        yearlyAllotments: allotmentsResult.yearlyAllotments,
        requests: requestsResult,
      });
      console.log("[CalendarStore] Data load complete and state updated.");
    } catch (error) {
      console.error("[CalendarStore] Error loading data:", error);
      set({
        isLoading: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load calendar data",
        isInitialized: true,
        allotments: {},
        yearlyAllotments: {},
        requests: {},
      });
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

      const newStatus: DayRequest["status"] =
        foundRequest.status === "approved" ||
          foundRequest.status === "cancellation_pending"
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

      const updatedRequests: DayRequest[] = requestsForDate.map((request) =>
        request.id === requestId ? { ...request, status: newStatus } : request
      );

      set((prevState) => ({
        requests: {
          ...prevState.requests,
          [requestDate]: updatedRequests,
        },
      }));

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

      const { data, error } = await supabase
        .from("six_month_requests")
        .insert(insertPayload)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Failed to create six-month request");

      // Create a request object for the UI state
      const request: DayRequest = {
        id: data.id,
        member_id: member.id,
        calendar_id: member.calendar_id,
        request_date: date,
        leave_type: type,
        status: "pending",
        requested_at: data.requested_at || new Date().toISOString(),
        created_at: data.requested_at || new Date().toISOString(),
        updated_at: data.requested_at || new Date().toISOString(),
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
      return false;
    }

    try {
      const { data, error } = await supabase
        .from("six_month_requests")
        .select("id")
        .eq("member_id", member.id)
        .eq("request_date", date)
        .eq("processed", false)
        .maybeSingle();

      if (error) {
        console.error(
          "[CalendarStore] Error checking six month request:",
          error,
        );
        return false;
      }

      return !!data; // Return true if a request exists, false otherwise
    } catch (error) {
      console.error("[CalendarStore] Error checking six month request:", error);
      return false;
    }
  },

  cleanupCalendarState: () => {
    console.log("[CalendarStore] Cleaning up calendar state");
    set({
      allotments: {},
      yearlyAllotments: {},
      requests: {},
      selectedDate: null,
      error: null,
      isInitialized: false,
    });
  },
}));

export function setupCalendarSubscriptions() {
  const { member } = useUserStore.getState();
  const calendarId = member?.calendar_id;

  if (!calendarId) {
    console.log("[CalendarStore] No calendar_id found, skipping subscriptions");
    return { unsubscribe: () => {} };
  }

  console.log(
    "[CalendarStore] Setting up subscriptions for calendar:",
    calendarId,
  );

  let isSubscribed = true;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 5000;

  const allotmentsChannel = supabase.channel(`allotments-${calendarId}`);
  const requestsChannel = supabase.channel(`requests-${calendarId}`);

  const handleSubscriptionError = async (error: any, channelName: string) => {
    console.error(`[CalendarStore] ${channelName} subscription error:`, error);
    reconnectAttempts++;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isSubscribed) {
      console.log(
        `[CalendarStore] Attempting to reconnect ${channelName} (attempt ${reconnectAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));
      return true;
    }

    console.log(
      `[CalendarStore] Max reconnection attempts reached for ${channelName}`,
    );
    return false;
  };

  allotmentsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_allotments",
        filter: `calendar_id=eq.${calendarId!}`,
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
              store.setAllotments({
                ...newRecord,
                current_requests: newRecord.current_requests || 0,
              });
            } else {
              store.setAllotments({
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

  requestsChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pld_sdv_requests",
        filter: `calendar_id=eq.${calendarId!}`,
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
                  store.setRequests({
                    ...store.requests,
                    [requestDate]: [...currentRequests, requestWithMember],
                  });
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
              store.setRequests({
                ...store.requests,
                [requestDate]: updatedRequests,
              });
            } else if (eventType === "DELETE" && oldRecord) {
              const filteredRequests = currentRequests.filter((req) =>
                req.id !== oldRecord.id
              );
              store.setRequests({
                ...store.requests,
                [requestDate]: filteredRequests,
              });
            }

            try {
              const dateRange = {
                start: requestDate,
                end: requestDate,
              };
              await store.fetchAllotments(
                dateRange.start,
                dateRange.end,
                calendarId,
              );
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
