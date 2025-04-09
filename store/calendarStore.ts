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
  division: string;
  zone_id?: number;
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
    zoneId: number | null,
  ) => Promise<
    {
      allotments: Record<string, number>;
      yearlyAllotments: Record<number, number>;
    }
  >;
  fetchRequests: (
    startDate: string,
    endDate: string,
    zoneId: number | null,
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

  // New function specifically for user requests
  userSubmitRequest: (
    date: string,
    type: "PLD" | "SDV",
    zoneId?: number,
  ) => Promise<DayRequest>;
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

    // console.log("[CalendarStore] getDateAvailability called for date:", date, {
    //   isLoading: state.isLoading,
    //   isInitialized: state.isInitialized,
    //   hasAllotments: Object.keys(state.allotments).length,
    //   hasYearlyAllotments: Object.keys(state.yearlyAllotments).length,
    //   yearlyAllotment: state.yearlyAllotments[yearKey],
    //   dateAllotment: state.allotments[dateKey],
    //   requests: state.requests[dateKey]?.length ?? 0,
    //   zoneId,
    // });

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

  fetchAllotments: async (
    startDate: string,
    endDate: string,
    zoneId: number | null = null,
  ) => {
    const division = useUserStore.getState().division;
    if (!division) {
      console.warn("[CalendarStore] fetchAllotments: No division found.");
      return { allotments: {}, yearlyAllotments: {} };
    }

    // console.log("[CalendarStore] Fetching allotments with params:", { startDate, endDate, division, zoneId }); // DEBUG

    try {
      const currentYear = new Date(startDate).getFullYear(); // Use startDate's year
      const nextYear = currentYear + 1;
      const yearlyDateCurrent = `${currentYear}-01-01`;
      const yearlyDateNext = `${nextYear}-01-01`;

      let query = supabase
        .from("pld_sdv_allotments")
        .select("date, max_allotment, zone_id, year") // Select year as well
        .eq("division", division)
        .or(
          `year.eq.${currentYear},year.eq.${nextYear},date.gte.${startDate},date.lte.${endDate}`,
          // `date.in.(${yearlyDateCurrent},${yearlyDateNext}),date.gte.${startDate},date.lte.${endDate}` // Fetch yearly + range
        );

      // Apply zone filter based on passed parameter
      if (zoneId !== null) {
        query = query.eq("zone_id", zoneId);
      } else {
        query = query.is("zone_id", null);
      }

      const { data: allotmentsData, error } = await query;

      if (error) throw error;

      const allotmentsByDate: Record<string, number> = {};
      const yearlyAllotmentsByYear: Record<string | number, number> = {}; // Key might be year or year_zoneId

      // Process all fetched data
      allotmentsData?.forEach((allotment) => {
        const allotmentYear = allotment.year ??
          new Date(allotment.date).getFullYear(); // Fallback to date's year if year column is null
        const effectiveZoneId = allotment.zone_id; // Use zone_id from the record
        const yearKey = effectiveZoneId
          ? `${allotmentYear}_${effectiveZoneId}`
          : allotmentYear.toString();
        const dateKey = effectiveZoneId
          ? `${allotment.date}_${effectiveZoneId}`
          : allotment.date;

        // Check if it's a yearly allotment record (often date is Jan 1st, but rely on year column if available)
        // A simple check if date is Jan 1st might suffice if 'year' column isn't reliable
        if (allotment.date === `${allotmentYear}-01-01`) {
          yearlyAllotmentsByYear[yearKey] = allotment.max_allotment;
        }
        // Store specific date allotments, potentially overriding yearly if both exist
        allotmentsByDate[dateKey] = allotment.max_allotment;
      });

      // Apply yearly defaults to dates within range that don't have specific overrides
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);

      for (
        let date = startDateObj;
        isBefore(date, endDateObj) || date.getTime() === endDateObj.getTime();
        date = addDays(date, 1)
      ) {
        const dateStr = format(date, "yyyy-MM-dd");
        const currentYearLoop = date.getFullYear();
        const dateKey = zoneId ? `${dateStr}_${zoneId}` : dateStr;
        const yearKey = zoneId
          ? `${currentYearLoop}_${zoneId}`
          : currentYearLoop.toString();

        // If the specific date doesn't have an allotment, try applying the yearly one
        if (
          allotmentsByDate[dateKey] === undefined &&
          yearlyAllotmentsByYear[yearKey] !== undefined
        ) {
          allotmentsByDate[dateKey] = yearlyAllotmentsByYear[yearKey];
        }
        // Ensure a 0 value if no specific or yearly allotment exists for selectable dates
        // else if (allotmentsByDate[dateKey] === undefined) {
        //    allotmentsByDate[dateKey] = 0;
        // }
      }

      console.log("[CalendarStore] Allotments processed:", {
        yearlyAllotments: yearlyAllotmentsByYear,
        allotmentsByDateCount: Object.keys(allotmentsByDate).length,
        zoneId,
      });

      return {
        allotments: allotmentsByDate,
        yearlyAllotments: yearlyAllotmentsByYear,
      };
    } catch (error) {
      console.error("[CalendarStore] Error fetching allotments:", error);
      throw error; // Rethrow to be handled by loadInitialData
    }
  },

  fetchRequests: async (
    startDate: string,
    endDate: string,
    zoneId: number | null = null,
  ) => {
    const division = useUserStore.getState().division;
    if (!division) {
      console.warn("[CalendarStore] fetchRequests: No division found.");
      return {};
    }
    // console.log("[CalendarStore] Fetching requests with params:", { startDate, endDate, division, zoneId }); // DEBUG

    try {
      let query = supabase
        .from("pld_sdv_requests")
        .select(`
                id, member_id, division, zone_id, request_date, leave_type, status,
                requested_at, waitlist_position, responded_at, responded_by, paid_in_lieu,
                denial_reason_id, denial_comment, actioned_by, actioned_at, created_at, updated_at, metadata,
                member:members!inner ( id, first_name, last_name, pin_number )
            `)
        .eq("division", division)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      // Apply zone filter based on passed parameter
      if (zoneId !== null) {
        query = query.eq("zone_id", zoneId);
      } else {
        query = query.is("zone_id", null);
      }

      const { data: requestsData, error } = await query;

      if (error) {
        console.error("[CalendarStore] Error fetching requests:", error);
        throw error;
      }

      const requestsByDate: Record<string, DayRequest[]> = {};

      if (requestsData) {
        for (const rawRequest of requestsData) {
          // Use the zone_id from the request record for keying
          const effectiveZoneId = rawRequest.zone_id;
          const dateKey = effectiveZoneId
            ? `${rawRequest.request_date}_${effectiveZoneId}`
            : rawRequest.request_date;

          if (!requestsByDate[dateKey]) {
            requestsByDate[dateKey] = [];
          }

          // Ensure member data structure is correct even if join returns unexpected structure
          const memberInfo = (rawRequest as any).member;
          const memberData = memberInfo && typeof memberInfo === "object"
            ? {
              id: memberInfo.id as string ?? "", // Provide default empty string
              first_name: memberInfo.first_name as string | null,
              last_name: memberInfo.last_name as string | null,
              pin_number: memberInfo.pin_number as number ?? 0, // Provide default 0
            }
            : { // Default structure if member is null/undefined
              id: "",
              first_name: "Unknown",
              last_name: "Member",
              pin_number: 0,
            };

          const dayRequest: DayRequest = {
            // Map all fields from rawRequest to DayRequest type
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
      // console.log(`[CalendarStore] Requests processed for zone ${zoneId}:`, Object.keys(requestsByDate).length); // DEBUG
      return requestsByDate;
    } catch (error) {
      console.error("[CalendarStore] Error fetching requests:", error);
      throw error; // Rethrow
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
    const { division, member } = useUserStore.getState();
    // Get the ensure function directly
    const ensureAdminSettingsLoaded =
      useAdminCalendarManagementStore.getState().ensureDivisionSettingsLoaded;

    if (!division) {
      console.log("[CalendarStore] No division found during initialization");
      set({
        error: "No division found",
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    const currentState = get();
    console.log("[CalendarStore] Starting initial data load:", {
      startDate,
      endDate,
      division,
      memberZone: member?.zone,
    });

    set({ error: null, isLoading: true });

    try {
      // ******** WAIT FOR ADMIN SETTINGS ********
      console.log(
        `[CalendarStore] Ensuring admin settings are loaded for division ${division}...`,
      );
      await ensureAdminSettingsLoaded(division);
      console.log(
        `[CalendarStore] Admin settings loaded for division ${division}.`,
      );
      // *****************************************

      // Now get the potentially updated admin state
      const adminStoreState = useAdminCalendarManagementStore.getState();

      // Determine the target zone ID
      let targetZoneId: number | null = null;
      const divisionUsesZones = adminStoreState.usesZoneCalendars;
      const divisionZones = adminStoreState.zones[division] || [];

      console.log("[CalendarStore] Determining targetZoneId:", {
        divisionUsesZones,
        memberZoneRaw: member?.zone,
        numDivisionZones: divisionZones.length,
        availableZoneNames: divisionZones.map((z) => z.name), // Log the actual zone names
      });

      if (divisionUsesZones && member?.zone && divisionZones.length > 0) {
        const memberZoneClean = member.zone.trim().toLowerCase();
        console.log(
          `[CalendarStore] Searching for cleaned member zone: '${memberZoneClean}'`,
        ); // Log cleaned name

        const matchedZone = divisionZones.find((z) => {
          const adminZoneClean = z.name.trim().toLowerCase();
          // console.log(`[CalendarStore] Comparing: '${adminZoneClean}' === '${memberZoneClean}'`); // DEBUG Comparison
          return adminZoneClean === memberZoneClean;
        });

        if (matchedZone) {
          targetZoneId = matchedZone.id;
          console.log(
            `[CalendarStore] Target zone ID set to: ${targetZoneId} (for zone ${member.zone})`,
          ); // Log the result
        } else {
          console.warn(
            `[CalendarStore] Member zone "${member.zone}" not found in division "${division}" zones list.`,
          );
          // Decide behavior: error out, or default to division-wide (null)? Let's default.
          targetZoneId = null;
          console.log(
            "[CalendarStore] Proceeding with division-wide view (targetZoneId = null).",
          );
        }
      } else {
        console.log(
          "[CalendarStore] Not using zones or member has no zone/no zones defined. Using division-wide view (targetZoneId = null).",
        );
        targetZoneId = null; // Explicitly set to null for division-wide
      }

      // Fetch data using the determined targetZoneId
      console.log(
        `[CalendarStore] Fetching data with targetZoneId: ${targetZoneId}`,
      );
      const [allotmentsResult, requestsResult] = await Promise.all([
        get().fetchAllotments(startDate, endDate, targetZoneId),
        get().fetchRequests(startDate, endDate, targetZoneId),
      ]);

      console.log("[CalendarStore] Data fetched:", {
        allotmentsCount: Object.keys(allotmentsResult.allotments).length,
        requestsCount: Object.keys(requestsResult).length,
      });

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
    // Get usesZoneCalendars directly from the ADMIN calendar store state
    const { usesZoneCalendars } = useAdminCalendarManagementStore.getState();
    // No need to parse division ID here, just return the flag for the user's division
    // This function might need rethinking - perhaps it should check the admin store for the specific division?
    // Assuming the flag in admin store corresponds to the current user's division context
    return usesZoneCalendars;

    // --- Old logic using zoneCalendars (which doesn't exist here) ---
    // const { zoneCalendars } = useAdminCalendarManagementStore.getState();
    // Parse division string to number for comparison
    // const divisionIdNumber = parseInt(division, 10);
    // if (isNaN(divisionIdNumber)) {
    //  console.error("[CalendarStore] Invalid division ID format:", division);
    //  return false; // Cannot determine if division ID is not a number
    // }
    // Check if any calendar belongs to the specified division ID (number comparison)
    // return zoneCalendars.some((cal: any) => cal.division_id === divisionIdNumber); // Added 'any' temporarily, but zoneCalendars is removed
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
    console.log("[CalendarStore] Validating member zone access:", {
      memberId,
      zoneId,
    });

    // Get member's zone
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("zone")
      .eq("id", memberId)
      .single();

    if (memberError) {
      console.error("[CalendarStore] Error fetching member zone:", memberError);
      throw memberError;
    }

    // Get zone name from zones table
    const { data: zoneData, error: zoneError } = await supabase
      .from("zones")
      .select("name")
      .eq("id", zoneId)
      .single();

    if (zoneError) {
      console.error("[CalendarStore] Error fetching zone data:", zoneError);
      throw zoneError;
    }

    // Clean and compare zone names
    const memberZoneClean = memberData.zone?.trim().toLowerCase() || "";
    const zoneNameClean = zoneData.name?.trim().toLowerCase() || "";

    console.log("[CalendarStore] Comparing zones:", {
      memberZone: memberData.zone,
      zoneName: zoneData.name,
      memberZoneClean,
      zoneNameClean,
      matches: memberZoneClean === zoneNameClean,
    });

    return memberZoneClean === zoneNameClean;
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

  // New function specifically for user requests
  userSubmitRequest: async (
    date: string,
    type: "PLD" | "SDV",
    zoneId?: number,
  ) => {
    const member = useUserStore.getState().member;
    const division = useUserStore.getState().division;

    if (!member) throw new Error("No member found");
    if (!division) throw new Error("No division found");

    try {
      console.log("[CalendarStore] User submitting request:", {
        date,
        type,
        zoneId,
        memberId: member.id,
        division,
      });

      // First check if we can get the allotment for this date
      const dateKey = zoneId ? `${date}_${zoneId}` : date;
      const yearKey = zoneId
        ? `${new Date(date).getFullYear()}_${zoneId}`
        : new Date(date).getFullYear().toString();
      const maxAllotment = get().allotments[dateKey] ??
        get().yearlyAllotments[yearKey] ?? 0;

      if (maxAllotment === 0) {
        throw new Error("No allotments available for this date");
      }

      // Submit the request using the RPC function
      const { data: requestData, error: submitError } = await supabase.rpc(
        "submit_user_request",
        {
          p_member_id: member.id,
          p_division: division,
          p_zone_id: zoneId,
          p_request_date: date,
          p_leave_type: type,
        },
      );

      if (submitError) {
        console.error("[CalendarStore] Error submitting request:", submitError);
        throw submitError;
      }

      if (!requestData) {
        throw new Error("No request data returned");
      }

      // Fetch the created request with member data
      const { data: rawRequest, error: fetchError } = await supabase
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
          members!inner (
            id,
            first_name,
            last_name,
            pin_number
          )
        `)
        .eq("id", requestData)
        .single();

      if (fetchError || !rawRequest || !rawRequest.members) {
        console.error(
          "[CalendarStore] Error fetching created request:",
          fetchError,
        );
        throw fetchError || new Error("Failed to fetch created request");
      }

      // Cast the raw data to our expected type
      const fullRequest = {
        ...rawRequest,
        member: rawRequest.members as unknown as RequestMember,
        status: rawRequest.status as
          | "pending"
          | "approved"
          | "denied"
          | "waitlisted"
          | "cancellation_pending"
          | "cancelled",
      } as FullRequestData;

      // Cast the request data to match our DayRequest type
      const request: DayRequest = {
        ...fullRequest,
        member: {
          id: fullRequest.member.id,
          first_name: fullRequest.member.first_name,
          last_name: fullRequest.member.last_name,
          pin_number: fullRequest.member.pin_number,
        },
      };

      // Update local state
      const currentRequests = get().requests[dateKey] || [];
      set((state) => ({
        requests: {
          ...state.requests,
          [dateKey]: [...currentRequests, request],
        },
      }));

      return request;
    } catch (error) {
      console.error("[CalendarStore] Error submitting request:", error);
      throw error;
    }
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
          // *** Determine zoneId for refreshing allotments ***
          const relevantZoneId = newRecord?.zone_id ?? oldRecord?.zone_id ??
            null;

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

            // Refresh allotments for the affected date, passing the zoneId
            try {
              const dateRange = {
                start: requestDate,
                end: requestDate,
              };
              // *** Pass relevantZoneId ***
              await store.fetchAllotments(
                dateRange.start,
                dateRange.end,
                relevantZoneId,
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
      console.log("[CalendarStore] Unsubscribing from realtime updates");
      isSubscribed = false;
      allotmentsChannel.unsubscribe();
      requestsChannel.unsubscribe();
    },
  };
}
