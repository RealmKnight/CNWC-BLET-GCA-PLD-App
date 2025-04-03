import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import { addDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";
import { format } from "date-fns-tz";
import { useUserStore } from "@/store/userStore";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface MemberDetails {
  first_name: string;
  last_name: string;
  pin_number: string;
}

export interface DayRequest {
  id: string;
  member_id: string;
  division: string;
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
  responded_at?: string;
  responded_by?: string;
  paid_in_lieu?: boolean;
  members?: MemberDetails;
  member?: {
    first_name: string;
    last_name: string;
    pin_number: string;
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

interface RequestWithMember extends Omit<DayRequest, "member"> {
  member: {
    first_name: string;
    last_name: string;
  };
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
  getDateAvailability: (
    date: string,
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
  submitRequest: (date: string, type: "PLD" | "SDV") => Promise<void>;
  loadInitialData: (startDate: string, endDate: string) => Promise<void>;

  // Add new function
  cancelRequest: (requestId: string, isApproved: boolean) => Promise<boolean>;
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
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[dateObj.getFullYear()];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 0;

    // Check if date is already full - only count approved requests
    const requests = state.requests[date] || [];
    const activeRequests = requests.filter((r) =>
      r.status === "approved" || r.status === "pending"
    );
    return activeRequests.length < maxAllotment;
  },

  getDateAvailability: (date: string) => {
    const state = get();

    // Add detailed logging
    // console.log("[CalendarStore] getDateAvailability called for date:", date, {
    //   isLoading: state.isLoading,
    //   isInitialized: state.isInitialized,
    //   hasAllotments: Object.keys(state.allotments).length,
    //   hasYearlyAllotments: Object.keys(state.yearlyAllotments).length,
    //   yearlyAllotment: state.yearlyAllotments[new Date(date).getFullYear()],
    //   dateAllotment: state.allotments[date],
    //   requests: state.requests[date]?.length ?? 0,
    // });

    // If data isn't loaded yet, return unavailable
    if (state.isLoading || !state.isInitialized) {
      console.log(
        "[CalendarStore] Data not loaded yet, returning unavailable",
        {
          isLoading: state.isLoading,
          isInitialized: state.isInitialized,
        },
      );
      return "unavailable";
    }

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
      // console.log("[CalendarStore] Date outside valid range:", {
      //   date,
      //   fortyEightHoursFromNow,
      //   sixMonthsFromNow,
      // });
      return "unavailable";
    }

    // Get allotment for the date
    const dateAllotment = state.allotments[date];
    const yearlyAllotment = state.yearlyAllotments[dateObj.getFullYear()];
    const maxAllotment = dateAllotment ?? yearlyAllotment ?? 6; // Default to 6 if no allotment is set

    // console.log("[CalendarStore] Allotment calculation:", {
    //   date,
    //   dateAllotment,
    //   yearlyAllotment,
    //   maxAllotment,
    // });

    const requests = state.requests[date] || [];
    // Only count approved and pending requests when calculating availability
    const activeRequests = requests.filter((r) =>
      r.status === "approved" || r.status === "pending"
    );
    const approvedRequests = activeRequests.length;

    if (approvedRequests >= maxAllotment) {
      console.log("[CalendarStore] Date is full:", {
        approvedRequests,
        maxAllotment,
      });
      return "full";
    }

    const availablePercentage =
      ((maxAllotment - approvedRequests) / maxAllotment) * 100;
    const availability = availablePercentage <= 30 ? "limited" : "available";
    // console.log("[CalendarStore] Final availability:", {
    //   availability,
    //   availablePercentage,
    //   approvedRequests,
    //   maxAllotment,
    // });
    return availability;
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
      // Get requests for the date range with member details
      const { data: requestData, error: requestError } = await supabase
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
          paid_in_lieu
        `,
        )
        .eq("division", division)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      if (requestError) throw requestError;

      if (!requestData || requestData.length === 0) {
        return {};
      }

      // Get unique member IDs
      const memberIds = [...new Set(requestData.map((r) => r.member_id))];

      // Get member details from the safe view
      const { data: memberData, error: memberError } = await supabase
        .from("member_profiles")
        .select("id, first_name, last_name, pin_number")
        .in("id", memberIds);

      if (memberError) throw memberError;

      // Create member lookup map
      const memberMap = (memberData || []).reduce(
        (acc, member) => {
          acc[member.id] = member;
          return acc;
        },
        {} as Record<
          string,
          { first_name: string; last_name: string; pin_number: string }
        >,
      );

      // Transform and group the requests by date
      const requests = requestData.reduce((acc, request) => {
        const dateKey = request.request_date;
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }

        const memberDetails = memberMap[request.member_id];

        acc[dateKey].push({
          ...request,
          member: memberDetails
            ? {
              first_name: memberDetails.first_name,
              last_name: memberDetails.last_name,
              pin_number: memberDetails.pin_number,
            }
            : undefined,
        });

        return acc;
      }, {} as Record<string, DayRequest[]>);

      set({ requests });
      return requests;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      set({
        error: error instanceof Error
          ? error.message
          : "Failed to load calendar data",
      });
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

      // Add auth context logging
      const { data: authData, error: authError } = await supabase.auth
        .getSession();
      console.log("[CalendarStore] Auth context:", {
        userId: authData?.session?.user?.id,
        memberId: member.id,
        userRole: authData?.session?.user?.user_metadata?.role,
      });

      console.log("[CalendarStore] Submitting request:", {
        date,
        type,
        memberId: member.id,
      });

      // Check if user already has a request for this date
      const existingRequests = get().requests[date] || [];
      const hasExistingRequest = existingRequests.some(
        (r) =>
          r.member_id === member.id &&
          !["denied", "cancelled"].includes(r.status),
      );

      if (hasExistingRequest) {
        throw new Error("You already have a request for this date");
      }

      // Check remaining days first
      const year = new Date(date).getFullYear();
      const { data: remainingDays, error: remainingDaysError } = await supabase
        .rpc("get_member_remaining_days", {
          p_member_id: member.id,
          p_year: year,
          p_leave_type: type,
        });

      if (remainingDaysError) throw remainingDaysError;
      console.log("[CalendarStore] Remaining days check:", {
        remainingDays,
        type,
        year,
      });

      if (remainingDays <= 0) {
        throw new Error(`You have no ${type} days remaining for ${year}`);
      }

      // Check if this is a 6-month request
      const { data: isSixMonthsOut, error: checkError } = await supabase.rpc(
        "is_six_months_out",
        {
          check_date: date,
        },
      );

      if (checkError) throw checkError;

      if (isSixMonthsOut) {
        // For 6-month requests, only insert into six_month_requests table
        const { data: sixMonthRequest, error: sixMonthError } = await supabase
          .from("six_month_requests")
          .insert({
            member_id: member.id,
            division,
            request_date: date,
            leave_type: type,
          })
          .select()
          .single();

        if (sixMonthError) {
          // Check if this is a duplicate request error
          if (
            sixMonthError.message?.includes(
              "A six-month request already exists for this date",
            )
          ) {
            throw new Error(
              "You have already submitted a request for this date. Six-month requests are limited to one request per member per day, regardless of type (PLD/SDV).",
            );
          }
          throw sixMonthError;
        }

        // Get member details for the UI
        const { data: memberData, error: memberError } = await supabase
          .from("members")
          .select("first_name, last_name")
          .eq("id", member.id)
          .single();

        if (memberError) throw memberError;

        // Create a temporary request object to show in the UI
        const tempRequest: DayRequest = {
          id: sixMonthRequest.id,
          member_id: member.id,
          division,
          request_date: date,
          leave_type: type,
          status: "pending",
          requested_at: new Date().toISOString(),
          member: {
            first_name: memberData.first_name,
            last_name: memberData.last_name,
            pin_number: member.pin_number.toString(),
          },
        };

        // Update local state to show the pending request
        const existingRequests = get().requests[date] || [];
        const newRequests = [...existingRequests, tempRequest];
        set((state) => ({
          requests: {
            ...state.requests,
            [date]: newRequests,
          },
        }));

        // Show message to user about 6-month request
        set({
          error:
            "Your request has been submitted and will be processed at 00:01 CST tomorrow in seniority order.",
        });
        return;
      }

      // For non-6-month requests, proceed with normal flow
      const dateObj = new Date(date);
      const dateAllotment = get().allotments[date];
      const yearlyAllotment = get().yearlyAllotments[dateObj.getFullYear()];
      const maxAllotment = dateAllotment ?? yearlyAllotment ?? 6;
      const approvedRequests = existingRequests.filter((r) =>
        r.status === "approved"
      ).length;

      console.log("[CalendarStore] Request validation:", {
        dateAllotment,
        yearlyAllotment,
        maxAllotment,
        approvedRequests,
        existingRequests: existingRequests.length,
      });

      // Check if date is full (only for non-waitlist requests)
      const shouldWaitlist = approvedRequests >= maxAllotment;
      if (shouldWaitlist) {
        console.log(
          "[CalendarStore] Date is full, setting request as waitlisted",
        );
      }

      // Submit the request
      const { data, error } = await supabase
        .from("pld_sdv_requests")
        .insert({
          member_id: member.id,
          division,
          request_date: date,
          leave_type: type,
          status: shouldWaitlist ? "waitlisted" : "pending",
          requested_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Get member details
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("first_name, last_name")
        .eq("id", member.id)
        .single();

      if (memberError) throw memberError;

      // Update local state with properly formatted data
      const newRequest = {
        ...data,
        member: {
          first_name: memberData.first_name,
          last_name: memberData.last_name,
          pin_number: member.pin_number.toString(),
        },
      };

      const newRequests = [...existingRequests, newRequest];
      set((state) => ({
        requests: {
          ...state.requests,
          [date]: newRequests,
        },
      }));

      console.log("[CalendarStore] Request submitted successfully:", data);

      return newRequest;
    } catch (error) {
      console.error("[CalendarStore] Error submitting request:", error);
      set({
        error: error instanceof Error
          ? error.message
          : "Failed to submit request",
      });
      throw error;
    } finally {
      set({ isLoading: false });
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

  type MemberDetails = {
    first_name: string;
    last_name: string;
    pin_number: string;
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
        try {
          const newRecord = payload.new as AllotmentPayload | null;
          if (
            newRecord && typeof newRecord === "object" && "date" in newRecord
          ) {
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
        } catch (error) {
          console.error(
            "[CalendarStore] Error processing allotment change:",
            error,
          );
        }
      },
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
        try {
          const newRecord = payload.new as DayRequest | null;
          const oldRecord = payload.old as DayRequest | null;
          const eventType = payload.eventType;

          // Get the relevant date from either new or old record
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

            // Handle the request update
            if (eventType === "INSERT" && newRecord) {
              console.log("[CalendarStore] Handling INSERT");
              // Get member details for the new request
              const { data: memberData, error: memberError } = await supabase
                .from("member_profiles")
                .select("first_name, last_name, pin_number")
                .eq("id", newRecord.member_id)
                .single();

              if (!memberError && memberData) {
                // Add new request with member details
                const requestWithMember = {
                  ...newRecord,
                  member: {
                    first_name: memberData.first_name,
                    last_name: memberData.last_name,
                    pin_number: memberData.pin_number,
                  },
                };
                store.setRequests(requestDate, [
                  ...currentRequests,
                  requestWithMember,
                ]);
              } else {
                console.error(
                  "[CalendarStore] Error fetching member details:",
                  memberError,
                );
                store.setRequests(requestDate, [...currentRequests, newRecord]);
              }
            } else if (eventType === "UPDATE" && newRecord) {
              console.log("[CalendarStore] Handling UPDATE");
              // Preserve existing member details when updating
              const updatedRequests = currentRequests.map((req) =>
                req.id === newRecord.id
                  ? { ...newRecord, member: req.member }
                  : req
              );
              store.setRequests(requestDate, updatedRequests);
            } else if (eventType === "DELETE" && oldRecord) {
              console.log("[CalendarStore] Handling DELETE");
              // Remove request
              const filteredRequests = currentRequests.filter(
                (req) => req.id !== oldRecord.id,
              );
              store.setRequests(requestDate, filteredRequests);
            }

            // Refresh allotments for the affected date to ensure legend is accurate
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
          console.error(
            "[CalendarStore] Error processing request change:",
            error,
          );
          // Try to recover by fetching fresh data
          try {
            const store = useCalendarStore.getState();
            const now = new Date();
            const dateRange = {
              start: format(now, "yyyy-MM-dd"),
              end: format(
                new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()),
                "yyyy-MM-dd",
              ),
            };
            await store.loadInitialData(dateRange.start, dateRange.end);
          } catch (recoveryError) {
            console.error(
              "[CalendarStore] Error during recovery:",
              recoveryError,
            );
          }
        }
      },
    )
    .subscribe();

  return {
    unsubscribe: () => {
      allotmentsSubscription.unsubscribe();
      requestsSubscription.unsubscribe();
    },
  };
}
