import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Switch,
  ViewStyle,
  TextStyle,
  Modal,
  FlatList,
  Dimensions,
  TouchableWithoutFeedback,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAdminMemberManagementStore } from "@/store/adminMemberManagementStore";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { useUserStore } from "@/store/userStore";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO, addHours } from "date-fns";
import { insertSinglePldSdvRequest } from "@/utils/databaseApiLayer";
import { supabase } from "@/utils/supabase";
import Toast from "react-native-toast-message";
import { ClientOnlyDatePicker } from "@/components/ClientOnlyDatePicker";
import { Picker } from "@react-native-picker/picker";
import { calculatePLDs } from "@/store/adminCalendarManagementStore";

interface ManualPldSdvRequestEntryProps {
  selectedDivision: string;
  selectedCalendarId?: string | null | undefined; // Keep for compatibility but won't use it
  onCalendarChange?: (calendarId: string | null) => void; // Keep for compatibility but won't use it
}

// Interface for PLD/SDV requests
interface PldSdvRequest {
  id: string;
  request_date: string;
  leave_type: string;
  status: string;
  paid_in_lieu: boolean;
  calendar_id: string;
  calendar_name?: string;
}

// Add interface for available days
interface AvailableDays {
  totalPld: number;
  totalSdv: number;
  availablePld: number;
  availableSdv: number;
  approvedPld: number;
  approvedSdv: number;
  requestedPld: number;
  requestedSdv: number;
  waitlistedPld: number;
  waitlistedSdv: number;
  paidInLieuPld: number;
  paidInLieuSdv: number;
  rolledOverPld: number;
}

// Function to check if a request date should be auto-approved
function shouldAutoApprove(requestDateStr: string): boolean {
  const currentDate = new Date();
  const requestDate = new Date(requestDateStr);

  // Add 48 hours to current date for future threshold
  const futureThreshold = addHours(currentDate, 48);

  // Auto-approve if the request date is today, in the past, or within 48 hours
  return requestDate <= futureThreshold;
}

// Function to update a request to approved status
async function updateRequestToApproved(requestId: string, adminUserId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("pld_sdv_requests")
      .update({
        status: "approved",
        responded_at: new Date().toISOString(),
        responded_by: adminUserId,
      })
      .eq("id", requestId);

    return !error;
  } catch (err) {
    console.error("Error updating request status:", err);
    return false;
  }
}

// Function to update a request with any status
async function updateRequestStatus(
  requestId: string,
  newStatus: string,
  newLeaveType: string,
  adminUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("pld_sdv_requests")
      .update({
        status: newStatus,
        leave_type: newLeaveType,
        responded_at: new Date().toISOString(),
        responded_by: adminUserId,
      })
      .eq("id", requestId);

    if (error) {
      console.error("Error updating request status:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Exception updating request status:", err);
    return { success: false, error: err.message || "Unknown error occurred" };
  }
}

export function ManualPldSdvRequestEntry({ selectedDivision }: ManualPldSdvRequestEntryProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { membersByCalendar, fetchMembersByCalendarId } = useAdminMemberManagementStore();
  const { calendars } = useAdminCalendarManagementStore();
  const { member: adminUser } = useUserStore();

  // Get all calendars for the division
  const currentDivisionCalendars = calendars[selectedDivision] || [];
  const [calendarNames, setCalendarNames] = useState<Record<string, string>>({});

  // Local state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [requestDate, setRequestDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [leaveType, setLeaveType] = useState<"PLD" | "SDV">("PLD");
  const [isPaidInLieu, setIsPaidInLieu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add state for member's existing requests
  const [memberRequests, setMemberRequests] = useState<PldSdvRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [memberCalendarName, setMemberCalendarName] = useState<string | null>(null);

  // Add state for available days
  const [availableDays, setAvailableDays] = useState<AvailableDays | null>(null);
  const [isLoadingAvailableDays, setIsLoadingAvailableDays] = useState(false);

  // Add state for request editing
  const [editingRequest, setEditingRequest] = useState<PldSdvRequest | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedLeaveType, setSelectedLeaveType] = useState<"PLD" | "SDV">("PLD");

  // Add state for email history
  const [emailHistory, setEmailHistory] = useState<any[]>([]);
  const [isLoadingEmailHistory, setIsLoadingEmailHistory] = useState(false);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  // Add state for missing email detection
  const [missingEmails, setMissingEmails] = useState<
    {
      type: "request" | "cancellation" | "payment_request";
      priority: "critical" | "high" | "medium";
      message: string;
    }[]
  >([]);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Add state for request ID lookup
  const [lookupRequestId, setLookupRequestId] = useState("");
  const [lookupResult, setLookupResult] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupDivisionWarning, setLookupDivisionWarning] = useState<string | null>(null);

  // Available statuses for admin editing
  const availableStatuses = ["approved", "pending", "waitlisted", "denied", "cancelled"];
  const availableLeaveTypes = ["PLD", "SDV"];

  // Add state for search input layout
  const [searchInputLayout, setSearchInputLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showMobileSearchModal, setShowMobileSearchModal] = useState(false);

  // Add state for year filtering
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return new Date().getFullYear();
  });
  const [showFutureRequests, setShowFutureRequests] = useState<boolean>(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth(); // 0-based, so July = 6
    // After July 1st, default to showing future requests
    return currentMonth >= 6;
  });

  // Fetch calendar names when the component loads
  useEffect(() => {
    async function fetchCalendarNames() {
      try {
        const { data, error } = await supabase.from("calendars").select("id, name");

        if (error) {
          console.error("Error fetching calendar names:", error);
          return;
        }

        if (data) {
          const nameMap: Record<string, string> = {};
          data.forEach((calendar) => {
            nameMap[calendar.id] = calendar.name;
          });
          setCalendarNames(nameMap);
        }
      } catch (error) {
        console.error("Exception fetching calendar names:", error);
      }
    }

    fetchCalendarNames();
  }, []);

  // Fetch division members when the component loads
  useEffect(() => {
    // Fetch members for all calendars in this division
    currentDivisionCalendars.forEach((calendar) => {
      if (calendar.id) {
        fetchMembersByCalendarId(calendar.id);
      }
    });
  }, [currentDivisionCalendars, fetchMembersByCalendarId]);

  // Fetch member's existing requests when a member is selected
  const fetchMemberRequests = useCallback(
    async (memberId: string | null, pinNumber: number) => {
      try {
        setIsLoadingRequests(true);

        // Determine date range based on selected year and future requests setting
        let startDate: string;
        let endDate: string;

        if (showFutureRequests) {
          // Show selected year + future requests
          startDate = `${selectedYear}-01-01`;
          endDate = `${selectedYear + 1}-12-31`;
        } else {
          // Show only selected year
          startDate = `${selectedYear}-01-01`;
          endDate = `${selectedYear}-12-31`;
        }

        // Build query to get requests for the specified date range
        let query = supabase
          .from("pld_sdv_requests")
          .select(
            `
          id,
          request_date,
          leave_type,
          status,
          paid_in_lieu,
          calendar_id,
          member_id,
          pin_number
        `
          )
          .gte("request_date", startDate)
          .lte("request_date", endDate)
          .order("request_date", { ascending: false });

        // We need to check both member_id and pin_number to catch all requests
        if (memberId) {
          // If we have a member_id, query by either member_id OR pin_number
          query = query.or(`member_id.eq.${memberId},pin_number.eq.${pinNumber}`);
        } else {
          // If no member_id, just query by pin_number
          query = query.eq("pin_number", pinNumber);
        }

        const { data: requestsData, error: requestsError } = await query;

        if (requestsError) {
          console.error("Error fetching member requests:", requestsError);
          return;
        }

        // Variable to hold the final requests data after potential deduplication
        let finalRequestsData: any[] = requestsData || [];

        // If we have both member_id and pin_number but got fewer results than expected,
        // let's also try separate queries to make sure we're not missing anything
        let additionalRequests: any[] = [];
        if (memberId && requestsData && requestsData.length < 10) {
          // Arbitrary threshold

          // Query by member_id only
          const { data: memberIdRequests, error: memberIdError } = await supabase
            .from("pld_sdv_requests")
            .select(
              `
              id,
              request_date,
              leave_type,
              status,
              paid_in_lieu,
              calendar_id,
              member_id,
              pin_number
            `
            )
            .eq("member_id", memberId)
            .gte("request_date", startDate)
            .lte("request_date", endDate)
            .order("request_date", { ascending: false });

          // Query by pin_number only
          const { data: pinNumberRequests, error: pinNumberError } = await supabase
            .from("pld_sdv_requests")
            .select(
              `
              id,
              request_date,
              leave_type,
              status,
              paid_in_lieu,
              calendar_id,
              member_id,
              pin_number
            `
            )
            .eq("pin_number", pinNumber)
            .gte("request_date", startDate)
            .lte("request_date", endDate)
            .order("request_date", { ascending: false });

          if (!memberIdError && memberIdRequests) {
            additionalRequests = [...additionalRequests, ...memberIdRequests];
          }

          if (!pinNumberError && pinNumberRequests) {
            additionalRequests = [...additionalRequests, ...pinNumberRequests];
          }

          // Combine and deduplicate all requests
          const allRequests = [...(requestsData || []), ...additionalRequests];
          const uniqueRequests = allRequests.filter(
            (request, index, self) => index === self.findIndex((r) => r.id === request.id)
          );

          // Use the deduplicated list if we found more requests
          if (uniqueRequests.length > (requestsData?.length || 0)) {
            finalRequestsData = uniqueRequests.sort(
              (a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime()
            );
          } else {
            finalRequestsData = requestsData;
          }
        } else {
          finalRequestsData = requestsData;
        }

        if (!finalRequestsData || finalRequestsData.length === 0) {
          setMemberRequests([]);
          setIsLoadingRequests(false);
          return;
        }

        // Combine the requests with calendar names
        const formattedRequests = finalRequestsData.map((req: any) => ({
          ...req,
          calendar_name: calendarNames[req.calendar_id] || "Calendar " + req.calendar_id.substring(0, 6) + "...",
        }));

        setMemberRequests(formattedRequests);

        // If member doesn't have a calendar_id but has requests, extract calendar from requests
        if (selectedMember && !selectedMember.calendar_id && finalRequestsData.length > 0) {
          const firstRequestCalendarId = finalRequestsData[0].calendar_id;

          if (firstRequestCalendarId) {
            // Update selected member with calendar information
            const updatedMember = {
              ...selectedMember,
              calendar_id: firstRequestCalendarId,
            };
            setSelectedMember(updatedMember);

            // Update calendar name display
            if (calendarNames[firstRequestCalendarId]) {
              setMemberCalendarName(calendarNames[firstRequestCalendarId]);
            } else {
              setMemberCalendarName(`Calendar ID: ${firstRequestCalendarId}`);
            }
          }
        }
      } catch (error) {
        console.error("Exception fetching member requests:", error);
      } finally {
        setIsLoadingRequests(false);
      }
    },
    [calendarNames, selectedMember, selectedYear, showFutureRequests]
  );

  // Function to fetch member's available days
  const fetchMemberAvailableDays = useCallback(async (memberId: string | null, pinNumber: number, memberData: any) => {
    try {
      setIsLoadingAvailableDays(true);
      const currentYear = new Date().getFullYear();

      // Fetch complete member data from database to get accurate entitlements
      let memberQuery = supabase
        .from("members")
        .select("max_plds, sdv_entitlement, pld_rolled_over, company_hire_date");

      if (memberId) {
        memberQuery = memberQuery.eq("id", memberId);
      } else {
        memberQuery = memberQuery.eq("pin_number", pinNumber);
      }

      const { data: fullMemberData, error: memberError } = await memberQuery.single();

      if (memberError) {
        console.error("Error fetching member data for available days:", memberError);
        return;
      }

      if (!fullMemberData) {
        console.error("Member data not found");
        return;
      }

      // Use RPC function to get accurate max PLDs if we have a member_id
      let totalPld = fullMemberData.max_plds || 0;
      if (memberId) {
        try {
          const { data: rpcPldResult, error: rpcError } = await supabase.rpc("update_member_max_plds", {
            p_member_id: memberId,
          });

          if (!rpcError && rpcPldResult !== null) {
            totalPld = rpcPldResult;
            console.log("Used RPC for accurate PLD calculation:", totalPld);
          } else {
            console.warn("RPC failed, falling back to calculated PLDs:", rpcError);
            totalPld = fullMemberData.max_plds || calculatePLDs(fullMemberData.company_hire_date);
          }
        } catch (rpcException) {
          console.warn("RPC exception, falling back to calculated PLDs:", rpcException);
          totalPld = fullMemberData.max_plds || calculatePLDs(fullMemberData.company_hire_date);
        }
      } else {
        // No member_id, use calculated value
        totalPld = fullMemberData.max_plds || calculatePLDs(fullMemberData.company_hire_date);
      }

      const totalSdv = fullMemberData.sdv_entitlement || 0;
      const rolledOverPld = fullMemberData.pld_rolled_over || 0;

      console.log("Member entitlements:", {
        totalPld,
        totalSdv,
        rolledOverPld,
        max_plds_from_db: fullMemberData.max_plds,
        sdv_entitlement_from_db: fullMemberData.sdv_entitlement,
        pld_rolled_over_from_db: fullMemberData.pld_rolled_over,
      });

      // Fetch current year requests for this member
      let query = supabase
        .from("pld_sdv_requests")
        .select("leave_type, status, paid_in_lieu")
        .gte("request_date", `${currentYear}-01-01`)
        .lte("request_date", `${currentYear}-12-31`);

      // Query by member_id or pin_number
      if (memberId) {
        query = query.or(`member_id.eq.${memberId},pin_number.eq.${pinNumber}`);
      } else {
        query = query.eq("pin_number", pinNumber);
      }

      const { data: requests, error } = await query;

      if (error) {
        console.error("Error fetching member requests for available days:", error);
        return;
      }

      // Calculate counts by status and type
      let approvedPld = 0,
        approvedSdv = 0;
      let requestedPld = 0,
        requestedSdv = 0;
      let waitlistedPld = 0,
        waitlistedSdv = 0;
      let paidInLieuPld = 0,
        paidInLieuSdv = 0;

      requests?.forEach((req) => {
        const isPld = req.leave_type === "PLD";
        const isSdv = req.leave_type === "SDV";

        if (req.status === "approved") {
          if (req.paid_in_lieu) {
            if (isPld) paidInLieuPld++;
            if (isSdv) paidInLieuSdv++;
          } else {
            if (isPld) approvedPld++;
            if (isSdv) approvedSdv++;
          }
        } else if (req.status === "pending") {
          if (isPld) requestedPld++;
          if (isSdv) requestedSdv++;
        } else if (req.status === "waitlisted") {
          if (isPld) waitlistedPld++;
          if (isSdv) waitlistedSdv++;
        }
      });

      console.log("Request counts:", {
        approvedPld,
        approvedSdv,
        requestedPld,
        requestedSdv,
        waitlistedPld,
        waitlistedSdv,
        paidInLieuPld,
        paidInLieuSdv,
      });

      // Calculate available days
      const availablePld = Math.max(
        0,
        totalPld + rolledOverPld - (approvedPld + requestedPld + waitlistedPld + paidInLieuPld)
      );
      const availableSdv = Math.max(0, totalSdv - (approvedSdv + requestedSdv + waitlistedSdv + paidInLieuSdv));

      const availableDaysData: AvailableDays = {
        totalPld,
        totalSdv,
        availablePld,
        availableSdv,
        approvedPld,
        approvedSdv,
        requestedPld,
        requestedSdv,
        waitlistedPld,
        waitlistedSdv,
        paidInLieuPld,
        paidInLieuSdv,
        rolledOverPld,
      };

      console.log("Final available days calculation:", availableDaysData);
      setAvailableDays(availableDaysData);
    } catch (error) {
      console.error("Exception fetching member available days:", error);
    } finally {
      setIsLoadingAvailableDays(false);
    }
  }, []);

  // Handle member search - now searches across all division calendars
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query.length < 3) {
        setSearchResults([]);
        // Don't close the modal on mobile when clearing search results
        return;
      }

      // Get all members from all division calendars
      const allDivisionMembers = Object.values(membersByCalendar).flat();
      const lowerQuery = query.toLowerCase();

      const results = allDivisionMembers.filter(
        (member) =>
          member.pin_number.toString().includes(lowerQuery) ||
          member.first_name.toLowerCase().includes(lowerQuery) ||
          member.last_name.toLowerCase().includes(lowerQuery)
      );

      setSearchResults(results);
      // No need to set modal visibility here as it's already shown when input is focused
    },
    [membersByCalendar]
  );

  // Handle member selection
  const handleSelectMember = useCallback(
    (member: any) => {
      console.log("Selected member:", member);
      setSelectedMember(member);
      setSearchQuery(`${member.last_name}, ${member.first_name} (${member.pin_number})`);
      setSearchResults([]);

      // Clear lookup result when selecting a member
      setLookupResult(null);
      setLookupError(null);
      setLookupDivisionWarning(null);

      // Close mobile search modal if open
      if (Platform.OS !== "web") {
        setShowMobileSearchModal(false);
      }

      // Get calendar name for UI display
      if (member.calendar_id && calendarNames[member.calendar_id]) {
        setMemberCalendarName(calendarNames[member.calendar_id]);
        console.log(`Member has assigned calendar: ${calendarNames[member.calendar_id]}`);
      } else {
        setMemberCalendarName(null);
        console.log("Member has no assigned calendar initially. Will check requests.");
      }

      // Fetch the member's existing requests
      fetchMemberRequests(member.id, member.pin_number);

      // Fetch the member's available days
      fetchMemberAvailableDays(member.id, member.pin_number, member);
    },
    [fetchMemberRequests, fetchMemberAvailableDays, calendarNames]
  );

  // Update search input layout when it renders
  const handleSearchInputLayout = (event: any) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setSearchInputLayout({ x, y, width, height });
  };

  // Add a function to check for duplicate requests
  const checkForDuplicateRequest = useCallback(
    async (memberId: string | null, pinNumber: number, requestDate: string, calendarId: string) => {
      try {
        // Format date properly for query
        const formattedDate = requestDate;

        // Build query based on available identifiers
        let query = supabase
          .from("pld_sdv_requests")
          .select("id")
          .eq("calendar_id", calendarId)
          .eq("request_date", formattedDate);

        if (memberId) {
          query = query.eq("member_id", memberId);
        } else {
          query = query.eq("pin_number", pinNumber);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error checking for duplicate request:", error);
          return false;
        }

        // Duplicate exists if data has any elements
        return data !== null && data.length > 0;
      } catch (error) {
        console.error("Error checking for duplicate:", error);
        return false;
      }
    },
    []
  );

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    if (!selectedMember) {
      setError("No member selected. Please select a member.");
      return;
    }

    // Get calendar ID either from member or from their first request
    const memberCalendarId =
      selectedMember.calendar_id || (memberRequests.length > 0 ? memberRequests[0].calendar_id : null);

    if (!memberCalendarId) {
      setError("Selected member does not have an assigned calendar. Cannot submit request.");
      return;
    }

    if (!requestDate) {
      setError("Please select a date for the request.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      // Check for duplicate request before submitting
      const isDuplicate = await checkForDuplicateRequest(
        selectedMember.id,
        selectedMember.pin_number,
        requestDate,
        memberCalendarId
      );

      if (isDuplicate) {
        setError(
          `A ${leaveType} request already exists for this member on ${requestDate}. Please choose a different date.`
        );
        setIsSubmitting(false);
        return;
      }

      // Log admin user for debugging RLS issues
      console.log("Admin user submitting request:", adminUser?.id);

      // Create request object for the database - NOTE: status will be overridden by DB trigger
      const requestData = {
        member_id: selectedMember.id,
        pin_number: selectedMember.pin_number,
        calendar_id: memberCalendarId,
        request_date: requestDate,
        leave_type: leaveType,
        status: "approved" as const, // This will be set to pending/waitlisted by DB trigger
        paid_in_lieu: isPaidInLieu,
        requested_at: new Date().toISOString(),
      };

      console.log("Submitting request:", requestData);

      // Step 1: Insert the request (DB trigger will set status to pending/waitlisted)
      const insertedId = await insertSinglePldSdvRequest(requestData);

      if (!insertedId) {
        setError("Failed to insert request. Check console for details.");
        setIsSubmitting(false);
        return;
      }

      // Step 2: Check if we should auto-approve based on date
      if (shouldAutoApprove(requestDate) && adminUser?.id) {
        console.log(`Auto-approving request ${insertedId} (within 48-hour window)`);

        // Update the request to approved
        const updateSuccess = await updateRequestToApproved(insertedId, adminUser.id);

        if (!updateSuccess) {
          console.warn(`Request ${insertedId} was inserted but could not be auto-approved`);
          // Continue without showing error, as the request was still created
        }
      } else {
        console.log(`Request ${insertedId} created as pending (beyond 48-hour window)`);
      }

      setIsSubmitting(false);

      // Success message
      setSuccessMessage(
        `Successfully added ${leaveType} request for ${selectedMember.first_name} ${selectedMember.last_name} on ${requestDate} (ID: ${insertedId})`
      );

      // Refresh the member's requests list
      fetchMemberRequests(selectedMember.id, selectedMember.pin_number);

      // Refresh the member's available days
      fetchMemberAvailableDays(selectedMember.id, selectedMember.pin_number, selectedMember);

      // Reset form for next entry
      setIsPaidInLieu(false);
      // Don't reset member or date to make multiple entries easier
    } catch (err: any) {
      console.error("Error inserting PLD/SDV request:", err);
      setIsSubmitting(false);
      setError(err.message || "Failed to submit request");
    }
  }, [
    selectedMember,
    memberRequests,
    requestDate,
    leaveType,
    isPaidInLieu,
    adminUser,
    checkForDuplicateRequest,
    fetchMemberRequests,
    fetchMemberAvailableDays,
  ]);

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case "approved":
        return Colors[colorScheme].success;
      case "pending":
        return Colors[colorScheme].warning;
      case "waitlisted":
        return Colors[colorScheme].tint;
      case "cancelled":
      case "denied":
        return Colors[colorScheme].error;
      default:
        return Colors[colorScheme].text;
    }
  };

  // Function to handle request status update
  const handleUpdateRequestStatus = useCallback(async () => {
    if (!editingRequest || !selectedStatus || !adminUser?.id) {
      setError("Cannot update request: Missing required information");
      return;
    }

    try {
      setIsUpdating(true);

      const result = await updateRequestStatus(editingRequest.id, selectedStatus, selectedLeaveType, adminUser.id);

      if (result.success) {
        // Close modal and refresh requests
        setShowEditModal(false);
        setEditingRequest(null);

        // Show success toast
        Toast.show({
          type: "success",
          text1: "Request Updated",
          text2: `Request for ${selectedMember.first_name} ${selectedMember.last_name} updated to ${selectedStatus} (${selectedLeaveType})`,
        });

        // Refresh member requests
        if (selectedMember) {
          fetchMemberRequests(selectedMember.id, selectedMember.pin_number);
          fetchMemberAvailableDays(selectedMember.id, selectedMember.pin_number, selectedMember);
        }
      } else {
        // Show error toast
        Toast.show({
          type: "error",
          text1: "Update Failed",
          text2: result.error || "Unknown error occurred",
        });
      }
    } catch (err: any) {
      console.error("Error in handleUpdateRequestStatus:", err);
      Toast.show({
        type: "error",
        text1: "Update Error",
        text2: err.message || "An error occurred while updating the request",
      });
    } finally {
      setIsUpdating(false);
    }
  }, [
    editingRequest,
    selectedStatus,
    selectedLeaveType,
    adminUser,
    selectedMember,
    fetchMemberRequests,
    fetchMemberAvailableDays,
  ]);

  // Function to analyze missing emails for a request
  const analyzeMissingEmails = useCallback((request: PldSdvRequest, emailHistoryData: any[]) => {
    console.log("Running analyzeMissingEmails for request:", request.id, "Status:", request.status);
    console.log("Email history data:", emailHistoryData);

    const missing: {
      type: "request" | "cancellation" | "payment_request";
      priority: "critical" | "high" | "medium";
      message: string;
    }[] = [];

    // Check for missing cancellation email
    if (request.status === "cancellation_pending") {
      console.log("Checking for cancellation email...");
      const hasCancellationEmail = emailHistoryData.some(
        (email) => email.type === "outgoing" && email.email_type === "cancellation"
      );
      console.log("Has cancellation email:", hasCancellationEmail);
      if (!hasCancellationEmail) {
        missing.push({
          type: "cancellation",
          priority: "critical",
          message: "Cancellation email never sent - Company unaware of cancellation request",
        });
        console.log("Added missing cancellation email alert");
      }
    }

    // Check for missing request email
    if (request.status === "pending") {
      console.log("Checking for request email...");
      const hasRequestEmail = emailHistoryData.some(
        (email) => email.type === "outgoing" && email.email_type === "request"
      );
      console.log("Has request email:", hasRequestEmail);
      if (!hasRequestEmail) {
        missing.push({
          type: "request",
          priority: "high",
          message: "Initial request email never sent - Company unaware of request",
        });
        console.log("Added missing request email alert");
      }
    }

    // Check for missing payment request email (future only - skip legacy)
    if (request.status === "approved" && request.paid_in_lieu) {
      console.log("Checking for payment request email...");
      // Only check for requests created after a certain date to skip legacy entries
      const requestDate = new Date(request.request_date);
      const cutoffDate = new Date("2025-01-01"); // Adjust this date as needed

      if (requestDate >= cutoffDate) {
        const hasPaymentEmail = emailHistoryData.some(
          (email) => email.type === "outgoing" && email.email_type === "payment_request"
        );
        console.log("Has payment email:", hasPaymentEmail);
        if (!hasPaymentEmail) {
          missing.push({
            type: "payment_request",
            priority: "medium",
            message: "Payment request email not sent - Company needs payment notification",
          });
          console.log("Added missing payment email alert");
        }
      }
    }

    console.log("Setting missing emails:", missing);
    setMissingEmails(missing);
  }, []);

  // Function to fetch email history for a request
  const fetchEmailHistory = useCallback(
    async (requestId: string, requestForAnalysis?: PldSdvRequest) => {
      try {
        setIsLoadingEmailHistory(true);

        // Fetch email tracking data (outgoing emails)
        const { data: emailTrackingData, error: trackingError } = await supabase
          .from("email_tracking")
          .select(
            `
          id,
          email_type,
          recipient,
          subject,
          status,
          error_message,
          retry_count,
          fallback_notification_sent,
          created_at,
          last_updated_at
        `
          )
          .eq("request_id", requestId)
          .order("created_at", { ascending: false });

        // Fetch email responses data (incoming emails)
        const { data: emailResponsesData, error: responsesError } = await supabase
          .from("email_responses")
          .select(
            `
          id,
          sender_email,
          subject,
          content,
          processed,
          processed_at,
          resulting_status,
          denial_reason,
          created_at
        `
          )
          .eq("request_id", requestId)
          .order("created_at", { ascending: false });

        if (trackingError) {
          console.error("Error fetching email tracking data:", trackingError);
        }

        if (responsesError) {
          console.error("Error fetching email responses data:", responsesError);
        }

        // Combine and format the data
        const combinedHistory: any[] = [];

        // Add email tracking data (outgoing)
        if (emailTrackingData) {
          emailTrackingData.forEach((email) => {
            combinedHistory.push({
              ...email,
              type: "outgoing",
              timestamp: email.created_at,
              display_title: `${email.email_type} Email`,
              display_subtitle: `To: ${email.recipient}`,
              display_status: email.status,
              display_icon: "mail-outline",
            });
          });
        }

        // Add email responses data (incoming)
        if (emailResponsesData) {
          emailResponsesData.forEach((response) => {
            combinedHistory.push({
              ...response,
              type: "incoming",
              timestamp: response.created_at,
              display_title: "Company Response",
              display_subtitle: `From: ${response.sender_email}`,
              display_status: response.processed ? "processed" : "pending",
              display_icon: "mail-open-outline",
            });
          });
        }

        // Sort by timestamp (newest first)
        combinedHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        setEmailHistory(combinedHistory);

        // Analyze missing emails using the passed request or the current editing request
        const requestToAnalyze = requestForAnalysis || editingRequest;
        if (requestToAnalyze) {
          console.log("Analyzing missing emails for request:", requestToAnalyze.id, requestToAnalyze.status);
          analyzeMissingEmails(requestToAnalyze, combinedHistory);
        }
      } catch (error) {
        console.error("Error fetching email history:", error);
      } finally {
        setIsLoadingEmailHistory(false);
      }
    },
    [editingRequest, analyzeMissingEmails]
  );

  // Function to open the edit modal
  const handleEditRequest = useCallback(
    (request: PldSdvRequest) => {
      setEditingRequest(request);
      setSelectedStatus(request.status);
      setSelectedLeaveType(request.leave_type as "PLD" | "SDV");
      setShowEditModal(true);
      setShowEmailHistory(false); // Reset email history visibility

      // Fetch email history for this request and pass the request for analysis
      fetchEmailHistory(request.id, request);
    },
    [fetchEmailHistory]
  );

  // Function to send missing emails
  const handleSendMissingEmail = useCallback(
    async (emailType: "request" | "cancellation" | "payment_request") => {
      if (!editingRequest || !selectedMember) {
        setError("Cannot send email: Missing request or member information");
        return;
      }

      try {
        setIsSendingEmail(true);
        setError(null);

        let edgeFunctionName = "";
        let requestBody: any = {};

        // Determine which edge function to call based on email type
        switch (emailType) {
          case "request":
            edgeFunctionName = "send-request-email";
            requestBody = {
              requestId: editingRequest.id,
            };
            break;
          case "cancellation":
            edgeFunctionName = "send-cancellation-email";
            requestBody = {
              requestId: editingRequest.id,
            };
            break;
          case "payment_request":
            edgeFunctionName = "send-payment-request";
            requestBody = {
              requestId: editingRequest.id,
            };
            break;
          default:
            throw new Error(`Unknown email type: ${emailType}`);
        }

        console.log(`Sending ${emailType} email for request ${editingRequest.id}`);

        // Call the appropriate edge function
        const { data, error: functionError } = await supabase.functions.invoke(edgeFunctionName, {
          body: requestBody,
        });

        if (functionError) {
          throw new Error(`Failed to send ${emailType} email: ${functionError.message}`);
        }

        if (data?.error) {
          throw new Error(`Edge function error: ${data.error}`);
        }

        // Show success message
        Toast.show({
          type: "success",
          text1: "Email Sent Successfully",
          text2: `${emailType.charAt(0).toUpperCase() + emailType.slice(1)} email sent to company`,
        });

        // Refresh email history to show the new email
        await fetchEmailHistory(editingRequest.id, editingRequest);
      } catch (err: any) {
        console.error(`Error sending ${emailType} email:`, err);
        setError(err.message || `Failed to send ${emailType} email`);

        Toast.show({
          type: "error",
          text1: "Email Send Failed",
          text2: err.message || `Failed to send ${emailType} email`,
        });
      } finally {
        setIsSendingEmail(false);
      }
    },
    [editingRequest, selectedMember, fetchEmailHistory]
  );

  // Function to close the edit modal
  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingRequest(null);
    setError(null);
    setEmailHistory([]);
    setShowEmailHistory(false);
    setIsLoadingEmailHistory(false);
    setMissingEmails([]);
    setIsSendingEmail(false);
  }, []);

  // Function to lookup request by ID
  const handleRequestLookup = useCallback(async () => {
    if (!lookupRequestId.trim()) {
      setLookupError("Please enter a request ID");
      return;
    }

    try {
      setIsLookingUp(true);
      setLookupError(null);
      setLookupDivisionWarning(null);

      // Clear member selection when doing request lookup
      setSelectedMember(null);
      setSearchQuery("");
      setMemberRequests([]);
      setMemberCalendarName(null);
      setAvailableDays(null);
      setSuccessMessage(null);

      // Fetch request by ID globally
      const { data: requestData, error: requestError } = await supabase
        .from("pld_sdv_requests")
        .select(
          `
          id,
          request_date,
          leave_type,
          status,
          paid_in_lieu,
          calendar_id,
          member_id,
          pin_number,
          requested_at,
          responded_at,
          responded_by
        `
        )
        .eq("id", lookupRequestId.trim())
        .single();

      if (requestError) {
        if (requestError.code === "PGRST116") {
          setLookupError("Request ID not found");
        } else {
          setLookupError(`Error: ${requestError.message}`);
        }
        setIsLookingUp(false);
        return;
      }

      if (!requestData) {
        setLookupError("Request ID not found");
        setIsLookingUp(false);
        return;
      }

      // Check if this request's calendar belongs to the current division
      const requestCalendar = currentDivisionCalendars.find((cal) => cal.id === requestData.calendar_id);
      const isInCurrentDivision = !!requestCalendar;

      // Fetch member data based on member_id or pin_number
      let memberData = null;
      if (requestData.member_id) {
        const { data: memberByIdData, error: memberByIdError } = await supabase
          .from("members")
          .select("id, first_name, last_name, pin_number, calendar_id")
          .eq("id", requestData.member_id)
          .single();

        if (!memberByIdError && memberByIdData) {
          memberData = memberByIdData;
        }
      }

      // If no member found by ID, try pin_number
      if (!memberData && requestData.pin_number) {
        const { data: memberByPinData, error: memberByPinError } = await supabase
          .from("members")
          .select("id, first_name, last_name, pin_number, calendar_id")
          .eq("pin_number", requestData.pin_number)
          .single();

        if (!memberByPinError && memberByPinData) {
          memberData = memberByPinData;
        }
      }

      // Combine request and member data
      const lookupData = {
        ...requestData,
        calendar_name: calendarNames[requestData.calendar_id] || "Unknown Calendar",
        member_name: memberData
          ? `${memberData.last_name}, ${memberData.first_name}`
          : `Unknown Member (PIN: ${requestData.pin_number})`,
        member_data: memberData,
        is_in_current_division: isInCurrentDivision,
      };

      setLookupResult(lookupData);

      // Set division warning if request is outside current division
      if (!isInCurrentDivision) {
        setLookupDivisionWarning(
          `⚠️ This request belongs to a different division. You may need to switch to the appropriate division to manage this member's full history.`
        );
      }
    } catch (err: any) {
      console.error("Error looking up request:", err);
      setLookupError(`Error: ${err.message || "Unknown error occurred"}`);
    } finally {
      setIsLookingUp(false);
    }
  }, [lookupRequestId, currentDivisionCalendars, calendarNames]);

  // Function to load member history from lookup result
  const handleLoadMemberFromLookup = useCallback(() => {
    if (!lookupResult?.member_data || !lookupResult.is_in_current_division) {
      return;
    }

    const member = lookupResult.member_data;
    handleSelectMember(member);
  }, [lookupResult, handleSelectMember]);

  // Handle date selection
  const handleDateChange = useCallback((date: Date | null) => {
    if (date) {
      setSelectedDate(date);
      setRequestDate(format(date, "yyyy-MM-dd"));
    }
  }, []);

  // Function to get available years for the dropdown
  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    // Show previous 2 years, current year, and next 2 years
    for (let i = currentYear - 2; i <= currentYear + 2; i++) {
      years.push(i);
    }
    return years;
  };

  // Render the member's existing requests
  const renderMemberRequests = () => {
    if (!selectedMember) return null;

    // Render a single row of the requests table
    const renderRequestItem = (request: PldSdvRequest) => {
      // Row content that will be wrapped in a touchable component
      const rowContent = (
        <>
          <View style={styles.dateCell}>
            <ThemedText style={styles.tableCell}>{format(parseISO(request.request_date), "MMM dd, yyyy")}</ThemedText>
          </View>
          <View style={styles.typeCell}>
            <ThemedText style={styles.tableCell}>{request.leave_type}</ThemedText>
          </View>
          <View style={styles.statusCell}>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(request.status) }]} />
              <ThemedText style={styles.tableCell}>{request.status}</ThemedText>
            </View>
          </View>
          <View style={styles.paidCell}>
            <ThemedText style={styles.tableCell}>{request.paid_in_lieu ? "Yes" : "No"}</ThemedText>
          </View>
          <View style={styles.calendarCell}>
            <ThemedText style={styles.tableCell}>{request.calendar_name}</ThemedText>
          </View>
          <View style={styles.actionCell}>
            <Ionicons name="create-outline" size={18} color={Colors[colorScheme].tint} />
          </View>
        </>
      );

      // Make the entire row clickable on all platforms
      return (
        <ThemedTouchableOpacity
          key={request.id}
          style={[styles.tableRow, styles.clickableRow]}
          onPress={() => handleEditRequest(request)}
          activeOpacity={0.7}
        >
          {rowContent}
        </ThemedTouchableOpacity>
      );
    };

    // Table header component
    const TableHeader = () => (
      <View style={[styles.tableRow, styles.tableHeader]}>
        <View style={styles.dateCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Date</ThemedText>
        </View>
        <View style={styles.typeCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Type</ThemedText>
        </View>
        <View style={styles.statusCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Status</ThemedText>
        </View>
        <View style={styles.paidCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Paid In Lieu</ThemedText>
        </View>
        <View style={styles.calendarCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Calendar</ThemedText>
        </View>
        <View style={styles.actionCell}>
          <ThemedText style={[styles.tableCell, styles.headerCell]}>
            <Ionicons name="hand-left-outline" size={16} color={Colors[colorScheme].text} />
          </ThemedText>
        </View>
      </View>
    );

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Existing Requests</ThemedText>
          {isLoadingRequests && (
            <ActivityIndicator size="small" color={Colors[colorScheme].tint} style={styles.loadingIndicator} />
          )}
        </View>

        {/* Year Filter Controls */}
        <View style={styles.filterContainer}>
          <View style={styles.filterRow}>
            <ThemedText style={styles.filterLabel}>Year:</ThemedText>
            <View style={styles.yearPickerContainer}>
              <Picker
                selectedValue={selectedYear}
                onValueChange={(itemValue) => {
                  setSelectedYear(itemValue);
                  if (selectedMember) {
                    fetchMemberRequests(selectedMember.id, selectedMember.pin_number);
                  }
                }}
                style={styles.yearPicker}
                dropdownIconColor={Colors[colorScheme].text}
              >
                {getAvailableYears().map((year) => (
                  <Picker.Item key={year} label={year.toString()} value={year} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.filterRow}>
            <ThemedText style={styles.filterLabel}>Include Future:</ThemedText>
            <Switch
              value={showFutureRequests}
              onValueChange={(value) => {
                setShowFutureRequests(value);
                if (selectedMember) {
                  fetchMemberRequests(selectedMember.id, selectedMember.pin_number);
                }
              }}
              trackColor={{ false: Colors[colorScheme].border, true: Colors[colorScheme].tint }}
              thumbColor={Colors[colorScheme].buttonBackground}
            />
            <ThemedText style={styles.filterHelpText}>
              {showFutureRequests
                ? `(Showing ${selectedYear} + ${selectedYear + 1})`
                : `(Showing ${selectedYear} only)`}
            </ThemedText>
          </View>
        </View>

        {memberRequests.length > 0 ? (
          <View style={styles.requestsContainer}>
            <TableHeader />
            {Platform.OS === "web" ? (
              // For web use ScrollView
              <ScrollView
                nestedScrollEnabled={true}
                style={styles.requestsList}
                contentContainerStyle={styles.requestsListContent}
              >
                {memberRequests.map(renderRequestItem)}
              </ScrollView>
            ) : (
              // For mobile platforms use FlatList (both Android and iOS)
              <FlatList
                data={memberRequests}
                renderItem={({ item }) => renderRequestItem(item)}
                keyExtractor={(item) => item.id}
                style={styles.requestsList}
                contentContainerStyle={styles.requestsListContent}
                initialNumToRender={memberRequests.length}
                scrollEnabled={false}
                nestedScrollEnabled={false}
              />
            )}
          </View>
        ) : (
          <ThemedText style={styles.noRequestsText}>No existing requests found for this member.</ThemedText>
        )}
      </View>
    );
  };

  // Render the member's selected info with calendar
  const renderMemberInfo = () => {
    // Get calendar ID from member or first request as fallback
    const calendarId =
      selectedMember?.calendar_id || (memberRequests.length > 0 ? memberRequests[0].calendar_id : null);

    // Get calendar name from the ID
    const calendarName = calendarId ? calendarNames[calendarId] || `Calendar ID: ${calendarId}` : null;

    return (
      <View style={styles.selectedMemberContainer}>
        <ThemedText style={styles.selectedMemberTitle}>Selected Member:</ThemedText>
        <ThemedText style={styles.selectedMemberInfo}>
          {selectedMember.last_name}, {selectedMember.first_name} ({selectedMember.pin_number})
        </ThemedText>
        {calendarName ? (
          <ThemedText style={styles.calendarInfo}>
            <Ionicons name="calendar" size={16} color={Colors[colorScheme].text} />
            Assigned Calendar: {calendarName}
            {!selectedMember.calendar_id}
          </ThemedText>
        ) : (
          <ThemedText style={styles.calendarWarning}>
            <Ionicons name="warning" size={16} color={Colors[colorScheme].warning} />
            No calendar assigned to this member
          </ThemedText>
        )}
        <Button
          onPress={() => {
            setSelectedMember(null);
            setSearchQuery("");
            setMemberRequests([]);
            setMemberCalendarName(null);
            setSuccessMessage(null);
            setAvailableDays(null);
          }}
          variant="secondary"
          style={styles.clearMemberButton}
        >
          Clear Selection
        </Button>
      </View>
    );
  };

  // Render mobile search modal for Android and iOS
  const renderMobileSearchModal = () => {
    // Don't render on web
    if (Platform.OS === "web") return null;

    return (
      <Modal
        visible={showMobileSearchModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMobileSearchModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMobileSearchModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.mobileSearchModalContent}>
                <View style={styles.mobileSearchHeader}>
                  <ThemedText style={styles.mobileSearchTitle}>Select Member</ThemedText>
                  <ThemedTouchableOpacity
                    style={styles.closeModalButton}
                    onPress={() => setShowMobileSearchModal(false)}
                  >
                    <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
                  </ThemedTouchableOpacity>
                </View>

                <View style={styles.searchInputWrapper}>
                  <TextInput
                    value={searchQuery}
                    onChangeText={handleSearch}
                    placeholder="Search by name or PIN number (min. 3 characters)"
                    style={[styles.searchInput, { color: Colors[colorScheme].text }]}
                    placeholderTextColor={Colors[colorScheme].secondary}
                    autoFocus={true}
                  />
                  {searchQuery !== "" && (
                    <ThemedTouchableOpacity
                      style={styles.clearButton}
                      onPress={() => handleSearch("")}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
                    </ThemedTouchableOpacity>
                  )}
                </View>

                <View style={styles.mobileSearchResults}>
                  {searchResults.length > 0 ? (
                    <FlatList
                      data={searchResults}
                      keyExtractor={(item) => item.id}
                      style={{ flex: 1 }}
                      contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
                      renderItem={({ item }) => (
                        <ThemedTouchableOpacity
                          style={styles.resultItem}
                          onPress={() => handleSelectMember(item)}
                          activeOpacity={0.7}
                        >
                          <ThemedText>
                            {item.last_name}, {item.first_name} ({item.pin_number})
                            {item.calendar_id && calendarNames[item.calendar_id]
                              ? ` - ${calendarNames[item.calendar_id]}`
                              : " - Calendar will be checked"}
                          </ThemedText>
                        </ThemedTouchableOpacity>
                      )}
                    />
                  ) : (
                    <ThemedText style={styles.noResultsText}>
                      {searchQuery.length < 3
                        ? "Type at least 3 characters to search"
                        : "No members found matching your search"}
                    </ThemedText>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  // Render request ID lookup section
  const renderRequestLookup = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Quick Request Lookup</ThemedText>
      <View style={styles.lookupContainer}>
        <View style={styles.lookupInputWrapper}>
          <TextInput
            value={lookupRequestId}
            onChangeText={setLookupRequestId}
            placeholder="Enter Request ID (UUID)"
            style={[styles.lookupInput, { color: Colors[colorScheme].text }]}
            placeholderTextColor={Colors[colorScheme].secondary}
          />
          <Button
            onPress={handleRequestLookup}
            disabled={isLookingUp || !lookupRequestId.trim()}
            variant="primary"
            style={styles.lookupButton}
          >
            {isLookingUp ? "Looking up..." : "Lookup"}
          </Button>
        </View>

        {lookupError && <ThemedText style={styles.lookupError}>{lookupError}</ThemedText>}

        {lookupResult && (
          <View style={styles.lookupResultContainer}>
            <ThemedText style={styles.lookupResultTitle}>Request Found</ThemedText>

            <View style={styles.lookupResultGrid}>
              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Request ID:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>{lookupResult.id}</ThemedText>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Member:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>
                  {lookupResult.member_name} ({lookupResult.pin_number})
                </ThemedText>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Date:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>
                  {format(parseISO(lookupResult.request_date), "MMM dd, yyyy")}
                </ThemedText>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Type:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>{lookupResult.leave_type}</ThemedText>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Status:</ThemedText>
                <View style={styles.statusContainer}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(lookupResult.status) }]} />
                  <ThemedText style={styles.lookupResultValue}>{lookupResult.status}</ThemedText>
                </View>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Paid In Lieu:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>{lookupResult.paid_in_lieu ? "Yes" : "No"}</ThemedText>
              </View>

              <View style={styles.lookupResultRow}>
                <ThemedText style={styles.lookupResultLabel}>Calendar:</ThemedText>
                <ThemedText style={styles.lookupResultValue}>{lookupResult.calendar_name}</ThemedText>
              </View>
            </View>

            {lookupDivisionWarning && (
              <ThemedText style={styles.lookupDivisionWarning}>{lookupDivisionWarning}</ThemedText>
            )}

            <View style={styles.lookupActions}>
              <Button
                onPress={() => handleEditRequest(lookupResult)}
                variant="secondary"
                style={styles.lookupActionButton}
              >
                <Ionicons name="create-outline" size={16} color={Colors[colorScheme].text} /> Edit Request
              </Button>

              {lookupResult.is_in_current_division && lookupResult.member_data && (
                <Button onPress={handleLoadMemberFromLookup} variant="primary" style={styles.lookupActionButton}>
                  <Ionicons name="person-outline" size={16} color={Colors[colorScheme].buttonText} /> Load Member
                  History
                </Button>
              )}
            </View>

            <Button
              onPress={() => {
                setLookupResult(null);
                setLookupRequestId("");
                setLookupError(null);
                setLookupDivisionWarning(null);
              }}
              variant="secondary"
              style={styles.clearLookupButton}
            >
              Clear Lookup
            </Button>
          </View>
        )}
      </View>
    </View>
  );

  // Render the member search - modified for platform specifics
  const renderMemberSearch = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Select Member by Search</ThemedText>
      <View style={styles.searchContainer} onLayout={Platform.OS !== "web" ? handleSearchInputLayout : undefined}>
        <View style={styles.searchInputWrapper}>
          <TextInput
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search by name or PIN number (min. 3 characters)"
            style={[styles.searchInput, { color: Colors[colorScheme].text }]}
            placeholderTextColor={Colors[colorScheme].secondary}
            onFocus={() => {
              // For mobile, open the modal immediately when the search input is focused
              if (Platform.OS !== "web") {
                setShowMobileSearchModal(true);
              }
            }}
          />
          {searchQuery !== "" && (
            <ThemedTouchableOpacity style={styles.clearButton} onPress={() => handleSearch("")} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
            </ThemedTouchableOpacity>
          )}
        </View>

        {/* Only show inline results on web */}
        {Platform.OS === "web" && searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            <ScrollView style={styles.searchResults} nestedScrollEnabled={true}>
              {searchResults.map((member) => (
                <ThemedTouchableOpacity
                  key={member.id}
                  style={styles.resultItem}
                  onPress={() => handleSelectMember(member)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <ThemedText>
                    {member.last_name}, {member.first_name} ({member.pin_number})
                    {member.calendar_id && calendarNames[member.calendar_id]
                      ? ` - ${calendarNames[member.calendar_id]}`
                      : " - Calendar will be checked"}
                  </ThemedText>
                </ThemedTouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {selectedMember && renderMemberInfo()}
      {renderMobileSearchModal()}
    </View>
  );

  // Render the request details form
  const renderRequestForm = () => {
    // Get calendar ID from member or first request as fallback
    const calendarId =
      selectedMember?.calendar_id || (memberRequests.length > 0 ? memberRequests[0].calendar_id : null);

    return (
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Enter Request Details</ThemedText>

        <View style={styles.formRow}>
          <ThemedText style={styles.label}>Request Date:</ThemedText>
          <ClientOnlyDatePicker
            date={selectedDate}
            onDateChange={handleDateChange}
            mode="date"
            placeholder="Select Date"
            style={styles.datePicker}
          />
        </View>

        <View style={styles.formRow}>
          <ThemedText style={styles.label}>Leave Type:</ThemedText>
          <View style={styles.radioGroup}>
            <View style={styles.radioOption}>
              <ThemedTouchableOpacity
                style={[styles.radio, leaveType === "PLD" && styles.radioSelected]}
                onPress={() => setLeaveType("PLD")}
              >
                {leaveType === "PLD" && <View style={styles.radioInner} />}
              </ThemedTouchableOpacity>
              <ThemedText style={styles.radioLabel}>PLD</ThemedText>
            </View>

            <View style={styles.radioOption}>
              <ThemedTouchableOpacity
                style={[styles.radio, leaveType === "SDV" && styles.radioSelected]}
                onPress={() => setLeaveType("SDV")}
              >
                {leaveType === "SDV" && <View style={styles.radioInner} />}
              </ThemedTouchableOpacity>
              <ThemedText style={styles.radioLabel}>SDV</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <ThemedText style={styles.label}>Paid In Lieu:</ThemedText>
          <Switch
            value={isPaidInLieu}
            onValueChange={setIsPaidInLieu}
            trackColor={{ false: Colors[colorScheme].border, true: Colors[colorScheme].tint }}
            thumbColor={Colors[colorScheme].buttonBackground}
          />
        </View>

        <Button
          onPress={handleSubmit}
          disabled={!selectedMember || !calendarId || !requestDate || isSubmitting}
          variant="primary"
          style={styles.submitButton}
        >
          {isSubmitting ? "Submitting..." : "Add Request"}
        </Button>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {successMessage && <ThemedText style={styles.success}>{successMessage}</ThemedText>}
      </View>
    );
  };

  // Function to get email status color
  const getEmailStatusColor = (status: string, type: string): string => {
    if (type === "outgoing") {
      switch (status.toLowerCase()) {
        case "sent":
        case "delivered":
          return Colors[colorScheme].success;
        case "failed":
        case "error":
          return Colors[colorScheme].error;
        case "queued":
        case "pending":
          return Colors[colorScheme].warning;
        default:
          return Colors[colorScheme].text;
      }
    } else {
      // incoming
      switch (status.toLowerCase()) {
        case "processed":
          return Colors[colorScheme].success;
        case "pending":
          return Colors[colorScheme].warning;
        default:
          return Colors[colorScheme].text;
      }
    }
  };

  // Function to get priority color and icon
  const getPriorityStyle = (priority: "critical" | "high" | "medium") => {
    switch (priority) {
      case "critical":
        return {
          color: Colors[colorScheme].error,
          backgroundColor: Colors[colorScheme].error + "20",
          borderColor: Colors[colorScheme].error + "50",
          icon: "alert-circle" as const,
        };
      case "high":
        return {
          color: Colors[colorScheme].warning,
          backgroundColor: Colors[colorScheme].warning + "20",
          borderColor: Colors[colorScheme].warning + "50",
          icon: "warning" as const,
        };
      case "medium":
        return {
          color: Colors[colorScheme].tint,
          backgroundColor: Colors[colorScheme].tint + "20",
          borderColor: Colors[colorScheme].tint + "50",
          icon: "information-circle" as const,
        };
    }
  };

  // Render missing email alerts
  const renderMissingEmailAlerts = () => {
    if (!editingRequest || missingEmails.length === 0) return null;

    return (
      <View style={styles.missingEmailAlertsContainer}>
        <ThemedText style={styles.missingEmailAlertsTitle}>⚠️ Missing Company Communication</ThemedText>

        {missingEmails.map((missingEmail, index) => {
          const priorityStyle = getPriorityStyle(missingEmail.priority);

          return (
            <View
              key={`${missingEmail.type}-${index}`}
              style={[
                styles.missingEmailAlert,
                {
                  backgroundColor: priorityStyle.backgroundColor,
                  borderColor: priorityStyle.borderColor,
                },
              ]}
            >
              <View style={styles.missingEmailAlertContent}>
                <Ionicons
                  name={priorityStyle.icon}
                  size={20}
                  color={priorityStyle.color}
                  style={styles.missingEmailAlertIcon}
                />
                <ThemedText style={[styles.missingEmailAlertText, { color: priorityStyle.color }]}>
                  {missingEmail.message}
                </ThemedText>
              </View>

              <ThemedTouchableOpacity
                style={[
                  styles.sendEmailButton,
                  {
                    backgroundColor: priorityStyle.color,
                    opacity: isSendingEmail ? 0.6 : 1,
                  },
                ]}
                onPress={() => handleSendMissingEmail(missingEmail.type)}
                disabled={isSendingEmail}
                activeOpacity={0.7}
              >
                {isSendingEmail ? (
                  <ActivityIndicator size="small" color={Colors[colorScheme].buttonText} />
                ) : (
                  <>
                    <Ionicons
                      name="mail-outline"
                      size={16}
                      color={Colors[colorScheme].buttonText}
                      style={styles.sendEmailButtonIcon}
                    />
                    <ThemedText style={styles.sendEmailButtonText}>
                      Send{" "}
                      {missingEmail.type === "payment_request"
                        ? "Payment"
                        : missingEmail.type === "cancellation"
                        ? "Cancellation"
                        : "Request"}{" "}
                      Email
                    </ThemedText>
                  </>
                )}
              </ThemedTouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  // Render email history section
  const renderEmailHistory = () => {
    if (!editingRequest) return null;

    return (
      <View style={styles.emailHistorySection}>
        <ThemedTouchableOpacity
          style={styles.emailHistoryHeader}
          onPress={() => setShowEmailHistory(!showEmailHistory)}
          activeOpacity={0.7}
        >
          <View style={styles.emailHistoryHeaderContent}>
            <Ionicons name="mail" size={20} color={Colors[colorScheme].tint} style={styles.emailHistoryIcon} />
            <ThemedText style={styles.emailHistoryTitle}>Email History ({emailHistory.length})</ThemedText>
            {isLoadingEmailHistory && (
              <ActivityIndicator size="small" color={Colors[colorScheme].tint} style={styles.emailHistoryLoader} />
            )}
          </View>
          <Ionicons
            name={showEmailHistory ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors[colorScheme].text}
          />
        </ThemedTouchableOpacity>

        {showEmailHistory && (
          <View style={styles.emailHistoryContent}>
            {emailHistory.length > 0 ? (
              <View style={styles.emailHistoryList}>
                {emailHistory.map((email, index) => (
                  <View key={`${email.type}-${email.id}`} style={styles.emailHistoryItem}>
                    <View style={styles.emailHistoryItemHeader}>
                      <View style={styles.emailHistoryItemLeft}>
                        <Ionicons
                          name={email.display_icon}
                          size={18}
                          color={email.type === "outgoing" ? Colors[colorScheme].tint : Colors[colorScheme].success}
                          style={styles.emailHistoryItemIcon}
                        />
                        <View style={styles.emailHistoryItemInfo}>
                          <ThemedText style={styles.emailHistoryItemTitle}>{email.display_title}</ThemedText>
                          <ThemedText style={styles.emailHistoryItemSubtitle}>{email.display_subtitle}</ThemedText>
                        </View>
                      </View>
                      <View style={styles.emailHistoryItemRight}>
                        <View
                          style={[
                            styles.emailStatusBadge,
                            { backgroundColor: getEmailStatusColor(email.display_status, email.type) + "20" },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.emailStatusText,
                              { color: getEmailStatusColor(email.display_status, email.type) },
                            ]}
                          >
                            {email.display_status}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.emailHistoryItemTime}>
                          {format(parseISO(email.timestamp), "MMM dd, HH:mm")}
                        </ThemedText>
                      </View>
                    </View>

                    {/* Additional details for outgoing emails */}
                    {email.type === "outgoing" && (
                      <View style={styles.emailHistoryItemDetails}>
                        <ThemedText style={styles.emailHistoryItemDetailText}>Subject: {email.subject}</ThemedText>
                        {email.error_message && (
                          <ThemedText style={[styles.emailHistoryItemDetailText, { color: Colors[colorScheme].error }]}>
                            Error: {email.error_message}
                          </ThemedText>
                        )}
                        {email.retry_count > 0 && (
                          <ThemedText style={styles.emailHistoryItemDetailText}>
                            Retries: {email.retry_count}
                          </ThemedText>
                        )}
                        {email.fallback_notification_sent && (
                          <ThemedText
                            style={[styles.emailHistoryItemDetailText, { color: Colors[colorScheme].warning }]}
                          >
                            ⚠️ Fallback notification sent
                          </ThemedText>
                        )}
                      </View>
                    )}

                    {/* Additional details for incoming emails */}
                    {email.type === "incoming" && (
                      <View style={styles.emailHistoryItemDetails}>
                        <ThemedText style={styles.emailHistoryItemDetailText}>Subject: {email.subject}</ThemedText>
                        {email.resulting_status && (
                          <ThemedText style={styles.emailHistoryItemDetailText}>
                            Resulting Status: {email.resulting_status}
                          </ThemedText>
                        )}
                        {email.denial_reason && (
                          <ThemedText style={[styles.emailHistoryItemDetailText, { color: Colors[colorScheme].error }]}>
                            Denial Reason: {email.denial_reason}
                          </ThemedText>
                        )}
                        {email.processed_at && (
                          <ThemedText style={styles.emailHistoryItemDetailText}>
                            Processed: {format(parseISO(email.processed_at), "MMM dd, HH:mm")}
                          </ThemedText>
                        )}
                        {email.content && email.content.length > 0 && (
                          <View style={styles.emailContentPreview}>
                            <ThemedText style={styles.emailContentLabel}>Content Preview:</ThemedText>
                            <ThemedText style={styles.emailContentText} numberOfLines={3}>
                              {email.content.substring(0, 200)}
                              {email.content.length > 200 ? "..." : ""}
                            </ThemedText>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Separator line between emails (except last one) */}
                    {index < emailHistory.length - 1 && <View style={styles.emailHistoryItemSeparator} />}
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText style={styles.noEmailHistoryText}>
                {isLoadingEmailHistory ? "Loading email history..." : "No email history found for this request."}
              </ThemedText>
            )}
          </View>
        )}
      </View>
    );
  };

  // Render edit confirmation modal
  const renderEditModal = () => {
    if (!editingRequest) return null;

    const formattedDate = format(parseISO(editingRequest.request_date), "MMMM dd, yyyy");

    return (
      <Modal visible={showEditModal} transparent={true} animationType="fade" onRequestClose={handleCloseEditModal}>
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Update Request</ThemedText>
              <ThemedTouchableOpacity onPress={handleCloseEditModal} style={styles.closeModalButton}>
                <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
              </ThemedTouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={true}>
              <ThemedText style={styles.modalWarning}>**Edit with caution**</ThemedText>
              <ThemedText style={styles.modalInfoText}>
                Member: {selectedMember?.first_name} {selectedMember?.last_name}
              </ThemedText>
              <ThemedText style={styles.modalInfoText}>Date: {formattedDate}</ThemedText>
              <ThemedText style={styles.modalInfoText}>Request ID: {editingRequest.id}</ThemedText>

              {/* Leave Type Selector */}
              <View style={styles.selectorContainer}>
                <ThemedText style={styles.label}>Leave Type:</ThemedText>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedLeaveType}
                    onValueChange={(itemValue) => setSelectedLeaveType(itemValue as "PLD" | "SDV")}
                    style={styles.picker}
                    dropdownIconColor={Colors[colorScheme].text}
                    enabled={!isUpdating}
                  >
                    {availableLeaveTypes.map((type) => (
                      <Picker.Item key={type} label={type} value={type} />
                    ))}
                  </Picker>
                </View>
              </View>

              <ThemedText style={styles.modalInfoText}>
                Current Status:{" "}
                <ThemedText style={{ color: getStatusColor(editingRequest.status) }}>
                  {editingRequest.status}
                </ThemedText>
              </ThemedText>

              <View style={styles.statusSelector}>
                <ThemedText style={styles.label}>New Status:</ThemedText>
                <View style={styles.statusOptions}>
                  {availableStatuses.map((status) => (
                    <ThemedTouchableOpacity
                      key={status}
                      style={[
                        styles.statusOption,
                        selectedStatus === status && {
                          backgroundColor: Colors[colorScheme].tint + "30",
                          borderColor: Colors[colorScheme].tint,
                        },
                      ]}
                      onPress={() => setSelectedStatus(status)}
                    >
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
                      <ThemedText style={[styles.statusText, selectedStatus === status && { fontWeight: "bold" }]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </ThemedText>
                    </ThemedTouchableOpacity>
                  ))}
                </View>
              </View>

              {(selectedStatus !== editingRequest.status || selectedLeaveType !== editingRequest.leave_type) && (
                <ThemedText style={styles.updateWarning}>
                  <Ionicons name="warning-outline" size={16} color={Colors[colorScheme].warning} />
                  This will update the request and may trigger database calculations.
                </ThemedText>
              )}

              {/* Missing Email Alerts */}
              {renderMissingEmailAlerts()}

              {/* Email History Section */}
              {renderEmailHistory()}

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}

              <View style={styles.modalActions}>
                <Button onPress={handleCloseEditModal} variant="secondary" style={styles.modalButton}>
                  Cancel
                </Button>

                <Button
                  onPress={handleUpdateRequestStatus}
                  variant="primary"
                  style={styles.modalButton}
                  disabled={
                    isUpdating ||
                    (selectedStatus === editingRequest.status && selectedLeaveType === editingRequest.leave_type) ||
                    !selectedStatus
                  }
                >
                  {isUpdating ? "Updating..." : "Update Request"}
                </Button>
              </View>
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>
    );
  };

  // Render the member's available days
  const renderAvailableDays = () => {
    if (!selectedMember) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Available Days</ThemedText>
          {isLoadingAvailableDays && (
            <ActivityIndicator size="small" color={Colors[colorScheme].tint} style={styles.loadingIndicator} />
          )}
        </View>

        {availableDays ? (
          <View style={styles.availableDaysContainer}>
            {/* Summary Cards */}
            <View style={styles.summaryCards}>
              <View style={[styles.summaryCard, styles.pldCard]}>
                <ThemedText style={styles.summaryCardTitle}>PLD Days</ThemedText>
                <ThemedText style={styles.availableNumber}>{availableDays.availablePld}</ThemedText>
                <ThemedText style={styles.summaryCardSubtitle}>Available</ThemedText>
              </View>

              <View style={[styles.summaryCard, styles.sdvCard]}>
                <ThemedText style={styles.summaryCardTitle}>SDV Days</ThemedText>
                <ThemedText style={styles.availableNumber}>{availableDays.availableSdv}</ThemedText>
                <ThemedText style={styles.summaryCardSubtitle}>Available</ThemedText>
              </View>
            </View>

            {/* Detailed Breakdown */}
            <View style={styles.breakdownContainer}>
              <ThemedText style={styles.breakdownTitle}>Breakdown for {new Date().getFullYear()}</ThemedText>

              {/* Responsive Breakdown Layout */}
              <View style={styles.breakdownColumns}>
                {/* PLD Breakdown */}
                <View style={[styles.breakdownColumn, styles.pldBreakdownColumn]}>
                  <View style={styles.breakdownSection}>
                    <ThemedText style={styles.breakdownSectionTitle}>
                      <Ionicons name="calendar" size={16} color={Colors[colorScheme].tint} /> PLD Details
                    </ThemedText>
                    <View style={styles.breakdownGrid}>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Total Entitlement:</ThemedText>
                        <ThemedText style={styles.breakdownValue}>{availableDays.totalPld}</ThemedText>
                      </View>
                      {availableDays.rolledOverPld > 0 && (
                        <View style={styles.breakdownItem}>
                          <ThemedText style={styles.breakdownLabel}>Rolled Over:</ThemedText>
                          <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].success }]}>
                            +{availableDays.rolledOverPld}
                          </ThemedText>
                        </View>
                      )}
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Approved:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].error }]}>
                          -{availableDays.approvedPld}
                        </ThemedText>
                      </View>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Pending:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].warning }]}>
                          -{availableDays.requestedPld}
                        </ThemedText>
                      </View>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Waitlisted:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].warning }]}>
                          -{availableDays.waitlistedPld}
                        </ThemedText>
                      </View>
                      {availableDays.paidInLieuPld > 0 && (
                        <View style={styles.breakdownItem}>
                          <ThemedText style={styles.breakdownLabel}>Paid in Lieu:</ThemedText>
                          <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].tint }]}>
                            -{availableDays.paidInLieuPld}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* SDV Breakdown */}
                <View style={[styles.breakdownColumn, styles.sdvBreakdownColumn]}>
                  <View style={styles.breakdownSection}>
                    <ThemedText style={styles.breakdownSectionTitle}>
                      <Ionicons name="time" size={16} color={Colors[colorScheme].tint} /> SDV Details
                    </ThemedText>
                    <View style={styles.breakdownGrid}>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Total Entitlement:</ThemedText>
                        <ThemedText style={styles.breakdownValue}>{availableDays.totalSdv}</ThemedText>
                      </View>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Approved:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].error }]}>
                          -{availableDays.approvedSdv}
                        </ThemedText>
                      </View>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Pending:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].warning }]}>
                          -{availableDays.requestedSdv}
                        </ThemedText>
                      </View>
                      <View style={styles.breakdownItem}>
                        <ThemedText style={styles.breakdownLabel}>Waitlisted:</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].warning }]}>
                          -{availableDays.waitlistedSdv}
                        </ThemedText>
                      </View>
                      {availableDays.paidInLieuSdv > 0 && (
                        <View style={styles.breakdownItem}>
                          <ThemedText style={styles.breakdownLabel}>Paid in Lieu:</ThemedText>
                          <ThemedText style={[styles.breakdownValue, { color: Colors[colorScheme].tint }]}>
                            -{availableDays.paidInLieuSdv}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <ThemedText style={styles.noDataText}>
            {isLoadingAvailableDays ? "Loading available days..." : "No data available"}
          </ThemedText>
        )}
      </View>
    );
  };

  // Fix for the requestsList style error
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      marginLeft: 8,
    },
    description: {
      fontSize: 16,
      lineHeight: 22,
      padding: 8,
      textAlign: "center",
    },
    descriptionWarning: {
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
      color: Colors.dark.warning,
    },
    descriptionError: {
      fontSize: 16,
      lineHeight: 22,
      textAlign: "center",
      color: Colors.dark.error,
    },
    warning: {
      color: Colors.dark.warning,
      fontSize: 16,
      fontWeight: "600",
      marginVertical: 16,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    section: {
      marginBottom: 48,
      position: "relative",
      zIndex: 10,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 12,
    },
    loadingIndicator: {
      marginLeft: 12,
    },
    searchContainer: {
      position: "relative",
      marginBottom: 8,
      width: "100%",
      maxWidth: Platform.OS === "web" ? "80%" : "100%",
      zIndex: 1000,
    },
    searchInputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      position: "relative",
      width: "100%",
    },
    searchInput: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingRight: 40,
      ...(Platform.OS === "web" && {
        outlineColor: Colors.dark.border,
        outlineWidth: 0,
      }),
    },
    clearButton: {
      position: "absolute",
      right: 8,
      top: 10,
      padding: 4,
      zIndex: 1,
      ...(Platform.OS === "web" && {
        cursor: "pointer",
        minWidth: 30,
        minHeight: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }),
    },
    clearMemberButton: {
      marginTop: 8,
      alignSelf: "flex-start",
    },
    datePicker: {
      flex: 1,
      maxWidth: 200,
      height: Platform.OS === "android" ? 48 : 40,
      borderRadius: 4,
      overflow: "hidden",
    },
    searchResultsContainer: {
      position: "relative",
      marginTop: 4,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 4,
      maxHeight: 200,
      backgroundColor: Colors.dark.card,
    },
    searchResults: {
      flex: 1,
      backgroundColor: Colors.dark.card,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
      paddingVertical: 8,
      width: "100%",
    },
    clickableRow: {
      backgroundColor: Colors.dark.card,
      // Add visual feedback for touchable rows on all platforms
      ...(Platform.OS === "web" && {
        cursor: "pointer",
      }),
    },
    tableHeader: {
      backgroundColor: Colors.dark.card,
      borderBottomWidth: 2,
    },
    tableCell: {
      paddingHorizontal: 4,
    },
    headerCell: {
      fontWeight: "600",
    },
    dateCell: {
      width: 140,
      paddingHorizontal: 4,
    },
    typeCell: {
      width: 60,
      alignItems: "center",
      paddingHorizontal: 4,
    },
    statusCell: {
      width: 120,
      paddingHorizontal: 4,
    },
    statusContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    paidCell: {
      width: 90,
      alignItems: "center",
      paddingHorizontal: 4,
    },
    calendarCell: {
      flex: 1,
      minWidth: 120,
      paddingHorizontal: 4,
    },
    noRequestsText: {
      fontStyle: "italic",
      padding: 12,
    },
    formRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    label: {
      width: 120,
      fontSize: 16,
    },
    radioGroup: {
      flexDirection: "row",
      alignItems: "center",
    },
    radioOption: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: 16,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: Colors.dark.tint,
      alignItems: "center",
      justifyContent: "center",
    },
    radioSelected: {
      borderColor: Colors.dark.tint,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: Colors.dark.tint,
    },
    radioLabel: {
      marginLeft: 8,
      fontSize: 16,
    },
    submitButton: {
      marginTop: 16,
      alignSelf: "flex-start",
    },
    error: {
      color: Colors.dark.error,
      marginTop: 16,
    },
    success: {
      color: Colors.dark.success,
      marginTop: 16,
    },
    actionCell: {
      width: 60,
      alignItems: "center",
      justifyContent: "center",
      paddingRight: 20,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      width: Platform.OS === "web" ? "75%" : "90%",
      maxWidth: 500,
      maxHeight: "90%",
      borderRadius: 8,
      padding: 16,
      backgroundColor: Colors.dark.card,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
      paddingBottom: 8,
      marginBottom: 16,
      backgroundColor: Colors.dark.card,
      padding: 4,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "bold",
    },
    closeModalButton: {
      padding: 4,
    },
    modalBody: {
      padding: 8,
      flex: 1,
    },
    modalWarning: {
      fontSize: 16,
      color: Colors.dark.error,
      textAlign: "center",
    },
    modalInfoText: {
      fontSize: 16,
      marginBottom: 8,
    },
    statusSelector: {
      marginTop: 16,
      marginBottom: 16,
    },
    statusOptions: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 8,
    },
    statusOption: {
      flexDirection: "row",
      alignItems: "center",
      padding: 8,
      marginRight: 8,
      marginBottom: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: Colors.light.border,
    },
    statusText: {
      marginLeft: 4,
    },
    updateWarning: {
      color: Colors.light.warning,
      marginBottom: 16,
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 16,
    },
    modalButton: {
      marginLeft: 8,
      minWidth: 100,
    },
    pickerContainer: {
      flexDirection: "row",
      overflow: "hidden",
      marginBottom: 10,
      backgroundColor: Colors.dark.card,
      ...Platform.select({
        ios: {
          height: 120,
        },
        android: {
          height: 50,
        },
        web: {
          height: 40,
        },
      }),
    },
    picker: {
      color: Colors.dark.text,
      backgroundColor: Colors.dark.card,
      borderColor: Colors.dark.border,
      ...Platform.select({
        android: {
          height: 50,
        },
        ios: {
          height: 120,
        },
        web: {
          height: 40,
        },
      }),
    },
    selectorContainer: {
      marginBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-evenly",
    },
    requestsContainer: {
      minHeight: Platform.OS === "web" ? 250 : 340,
      maxHeight: Platform.OS === "web" ? undefined : undefined,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 5,
    },
    requestsList: {
      flex: 1,
      minHeight: Platform.OS === "web" ? 250 : 340,
      flexGrow: 1,
    },
    requestsListContent: {
      flexGrow: 1,
    },
    requestsTable: {
      width: "100%",
    },
    selectedMemberContainer: {
      marginTop: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      backgroundColor: Colors.dark.card,
      zIndex: 1,
    },
    selectedMemberTitle: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 4,
    },
    selectedMemberInfo: {
      fontSize: 16,
      marginBottom: 8,
    },
    calendarInfo: {
      fontSize: 14,
      marginBottom: 8,
      color: Colors.dark.success,
    },
    calendarWarning: {
      fontSize: 14,
      marginBottom: 8,
      color: Colors.dark.warning,
    },
    mobileSearchModalContent: {
      width: "90%",
      height: "80%", // Fixed height instead of maxHeight
      backgroundColor: Colors.dark.card,
      borderRadius: 8,
      padding: 16,
      elevation: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      flexDirection: "column", // Explicitly set direction
    },
    mobileSearchHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
      paddingBottom: 8,
    },
    mobileSearchTitle: {
      fontSize: 18,
      fontWeight: "bold",
    },
    mobileSearchResults: {
      flex: 1,
      marginTop: 8,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 4,
    },
    noResultsText: {
      textAlign: "center",
      marginTop: 20,
      fontStyle: "italic",
      padding: 20,
    },
    resultItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
      backgroundColor: Colors.dark.card,
    },
    availableDaysContainer: {
      padding: 16,
    },
    summaryCards: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    summaryCard: {
      flex: 1,
      padding: 12,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 4,
      backgroundColor: Colors.dark.card,
    },
    pldCard: {
      marginRight: 8,
    },
    sdvCard: {
      marginLeft: 8,
    },
    summaryCardTitle: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 8,
    },
    availableNumber: {
      fontSize: 24,
      fontWeight: "bold",
    },
    summaryCardSubtitle: {
      fontSize: 14,
      color: Colors.dark.text,
    },
    breakdownContainer: {
      marginTop: 16,
    },
    breakdownTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 12,
    },
    breakdownColumns: {
      flexDirection: "row",
      justifyContent: "space-between",
      ...(Platform.OS !== "web" && {
        flexDirection: "column",
      }),
    },
    breakdownColumn: {
      flex: 1,
      ...(Platform.OS !== "web" && {
        flex: 0,
        width: "100%",
      }),
    },
    breakdownSection: {
      marginBottom: 16,
    },
    breakdownSectionTitle: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 8,
    },
    breakdownGrid: {
      flexDirection: "column",
      justifyContent: "space-between",
    },
    breakdownItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border + "30",
    },
    breakdownLabel: {
      fontSize: 14,
      color: Colors.dark.text,
      flex: 1,
    },
    breakdownValue: {
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "right",
    },
    pldBreakdownColumn: {
      ...(Platform.OS === "web" && {
        marginRight: 8,
      }),
      ...(Platform.OS !== "web" && {
        marginBottom: 16,
      }),
    },
    sdvBreakdownColumn: {
      ...(Platform.OS === "web" && {
        marginLeft: 8,
      }),
    },
    noDataText: {
      textAlign: "center",
      marginTop: 20,
      fontStyle: "italic",
      padding: 20,
    },
    filterContainer: {
      flexDirection: Platform.OS === "web" ? "row" : "column",
      alignItems: Platform.OS === "web" ? "center" : "stretch",
      marginBottom: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      backgroundColor: Colors.dark.card,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      marginRight: Platform.OS === "web" ? 16 : 0,
      marginBottom: Platform.OS === "web" ? 0 : 8,
    },
    filterLabel: {
      fontSize: 16,
      fontWeight: "bold",
      marginRight: 8,
      minWidth: 80,
    },
    yearPickerContainer: {
      flexDirection: "row",
      overflow: "hidden",
      backgroundColor: Colors.dark.card,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 4,
      minWidth: 100,
      ...Platform.select({
        ios: {
          height: 40,
        },
        android: {
          height: 40,
        },
        web: {
          height: 40,
        },
      }),
    },
    yearPicker: {
      color: Colors.dark.text,
      backgroundColor: Colors.dark.card,
      borderColor: Colors.dark.border,
      flex: 1,
      ...Platform.select({
        android: {
          height: 40,
        },
        ios: {
          height: 40,
        },
        web: {
          height: 40,
        },
      }),
    },
    filterHelpText: {
      marginLeft: 8,
      fontSize: 14,
      color: Colors.dark.secondary,
      fontStyle: "italic",
    },
    // Lookup styles
    lookupContainer: {
      marginBottom: 16,
    },
    lookupInputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    lookupInput: {
      flex: 1,
      height: 40,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      marginRight: 12,
      ...(Platform.OS === "web" && {
        outlineColor: Colors.dark.border,
        outlineWidth: 0,
      }),
    },
    lookupButton: {
      minWidth: 100,
    },
    lookupError: {
      color: Colors.dark.error,
      fontSize: 14,
      marginBottom: 12,
    },
    lookupResultContainer: {
      marginTop: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      backgroundColor: Colors.dark.card,
    },
    lookupResultTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 16,
      color: Colors.dark.success,
    },
    lookupResultGrid: {
      marginBottom: 16,
    },
    lookupResultRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border + "30",
    },
    lookupResultLabel: {
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
      color: Colors.dark.text,
    },
    lookupResultValue: {
      fontSize: 14,
      flex: 2,
      textAlign: "right",
      color: Colors.dark.text,
    },
    lookupDivisionWarning: {
      color: Colors.dark.warning,
      fontSize: 14,
      marginBottom: 16,
      padding: 12,
      backgroundColor: Colors.dark.warning + "20",
      borderRadius: 6,
      borderWidth: 1,
      borderColor: Colors.dark.warning + "50",
    },
    lookupActions: {
      flexDirection: Platform.OS === "web" ? "row" : "column",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    lookupActionButton: {
      marginBottom: Platform.OS === "web" ? 0 : 8,
      marginRight: Platform.OS === "web" ? 8 : 0,
      minWidth: Platform.OS === "web" ? 160 : undefined,
    },
    clearLookupButton: {
      alignSelf: "flex-start",
    },
    // Email History Styles
    emailHistorySection: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      backgroundColor: Colors.dark.card,
    },
    emailHistoryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border + "30",
    },
    emailHistoryHeaderContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    emailHistoryIcon: {
      marginRight: 8,
    },
    emailHistoryTitle: {
      fontSize: 16,
      fontWeight: "600",
      flex: 1,
    },
    emailHistoryLoader: {
      marginLeft: 8,
    },
    emailHistoryContent: {
      padding: 12,
    },
    emailHistoryList: {
      maxHeight: 300,
      backgroundColor: Colors.dark.card,
    },
    emailHistoryItem: {
      paddingVertical: 8,
    },
    emailHistoryItemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8,
    },
    emailHistoryItemLeft: {
      flexDirection: "row",
      alignItems: "flex-start",
      flex: 1,
    },
    emailHistoryItemIcon: {
      marginRight: 8,
      marginTop: 2,
    },
    emailHistoryItemInfo: {
      flex: 1,
    },
    emailHistoryItemTitle: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 2,
    },
    emailHistoryItemSubtitle: {
      fontSize: 12,
      color: Colors.dark.secondary,
    },
    emailHistoryItemRight: {
      alignItems: "flex-end",
      marginLeft: 12,
    },
    emailStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
      marginBottom: 4,
    },
    emailStatusText: {
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    emailHistoryItemTime: {
      fontSize: 11,
      color: Colors.dark.secondary,
    },
    emailHistoryItemDetails: {
      marginLeft: 26,
      paddingTop: 4,
    },
    emailHistoryItemDetailText: {
      fontSize: 12,
      color: Colors.dark.text,
      marginBottom: 2,
    },
    emailContentPreview: {
      marginTop: 8,
      padding: 8,
      backgroundColor: Colors.dark.border + "20",
      borderRadius: 4,
    },
    emailContentLabel: {
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 4,
      color: Colors.dark.secondary,
    },
    emailContentText: {
      fontSize: 11,
      lineHeight: 16,
      color: Colors.dark.text,
    },
    emailHistoryItemSeparator: {
      height: 1,
      backgroundColor: Colors.dark.border + "30",
      marginVertical: 8,
      marginLeft: 26,
    },
    noEmailHistoryText: {
      textAlign: "center",
      fontStyle: "italic",
      color: Colors.dark.secondary,
      paddingVertical: 20,
    },
    // Missing Email Alert Styles
    missingEmailAlertsContainer: {
      marginVertical: 16,
    },
    missingEmailAlertsTitle: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 12,
      color: Colors.dark.warning,
    },
    missingEmailAlert: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    missingEmailAlertContent: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    missingEmailAlertIcon: {
      marginRight: 8,
      marginTop: 2,
    },
    missingEmailAlertText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    },
    sendEmailButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      borderRadius: 6,
      alignSelf: "flex-start",
      minWidth: 180,
    },
    sendEmailButtonIcon: {
      marginRight: 6,
    },
    sendEmailButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: Colors.dark.buttonText,
    },
  });

  // Fix the outer container and remove platform-specific conditions
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="create-outline" size={24} color={Colors[colorScheme].text} />
        <ThemedText style={styles.title}>Manual PLD/SDV Request Entry</ThemedText>
      </View>

      <ThemedText style={styles.description}>
        Create PLD/SDV requests for members. Requests will be submitted to the member's assigned calendar.
      </ThemedText>
      <ThemedText style={styles.description}>
        Requests for past dates, today, or within 48 hours are automatically approved, remaing requests are
        automatically set to "pending" and processed through the app normally.
      </ThemedText>
      <ThemedText style={styles.descriptionError}>
        ***Make sure you update the request to "approved" after submitting it, if needed***
      </ThemedText>
      <ThemedText style={styles.descriptionWarning}>
        (ie if you are entering already approved requests, etc).
      </ThemedText>

      <ScrollView style={styles.content} key={`scroll-${selectedMember?.id || "none"}`}>
        {renderRequestLookup()}
        {renderMemberSearch()}
        {selectedMember && renderMemberRequests()}
        {selectedMember && renderAvailableDays()}
        {renderRequestForm()}
        {renderEditModal()}
      </ScrollView>
    </ThemedView>
  );
}
