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

  // Add state for request editing
  const [editingRequest, setEditingRequest] = useState<PldSdvRequest | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedLeaveType, setSelectedLeaveType] = useState<"PLD" | "SDV">("PLD");

  // Available statuses for admin editing
  const availableStatuses = ["approved", "pending", "waitlisted", "denied", "cancelled"];
  const availableLeaveTypes = ["PLD", "SDV"];

  // Add state for search input layout
  const [searchInputLayout, setSearchInputLayout] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showMobileSearchModal, setShowMobileSearchModal] = useState(false);

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

        // Build query based on available identifiers - WITHOUT trying to join with calendars
        let query = supabase
          .from("pld_sdv_requests")
          .select(
            `
          id,
          request_date,
          leave_type,
          status,
          paid_in_lieu,
          calendar_id
        `
          )
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

        if (!requestsData || requestsData.length === 0) {
          setMemberRequests([]);
          setIsLoadingRequests(false);
          return;
        }

        // Combine the requests with calendar names
        const formattedRequests = requestsData.map((req) => ({
          ...req,
          calendar_name: calendarNames[req.calendar_id] || "Calendar " + req.calendar_id.substring(0, 6) + "...",
        }));

        setMemberRequests(formattedRequests);

        // If member doesn't have a calendar_id but has requests, extract calendar from requests
        if (selectedMember && !selectedMember.calendar_id && requestsData.length > 0) {
          console.log("Member has no calendar_id but has requests. Extracting from first request.");
          const firstRequestCalendarId = requestsData[0].calendar_id;

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
              console.log(`Extracted calendar: ${calendarNames[firstRequestCalendarId]} (${firstRequestCalendarId})`);
            } else {
              setMemberCalendarName(`Calendar ID: ${firstRequestCalendarId}`);
              console.log(`Extracted calendar ID: ${firstRequestCalendarId} (name not found)`);
            }
          }
        }
      } catch (error) {
        console.error("Exception fetching member requests:", error);
      } finally {
        setIsLoadingRequests(false);
      }
    },
    [calendarNames, selectedMember]
  );

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
    },
    [fetchMemberRequests, calendarNames]
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
  }, [editingRequest, selectedStatus, selectedLeaveType, adminUser, selectedMember, fetchMemberRequests]);

  // Function to open the edit modal
  const handleEditRequest = useCallback((request: PldSdvRequest) => {
    setEditingRequest(request);
    setSelectedStatus(request.status);
    setSelectedLeaveType(request.leave_type as "PLD" | "SDV");
    setShowEditModal(true);
  }, []);

  // Function to close the edit modal
  const handleCloseEditModal = useCallback(() => {
    setShowEditModal(false);
    setEditingRequest(null);
    setError(null);
  }, []);

  // Handle date selection
  const handleDateChange = useCallback((date: Date | null) => {
    if (date) {
      setSelectedDate(date);
      setRequestDate(format(date, "yyyy-MM-dd"));
    }
  }, []);

  // Render the member's existing requests
  const renderMemberRequests = () => {
    if (!selectedMember) return null;

    // Render a single row of the requests table
    const renderRequestItem = (request: PldSdvRequest) => {
      // Row content that will be wrapped differently based on platform
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
          {Platform.OS === "web" && (
            <View style={styles.actionCell}>
              <ThemedTouchableOpacity style={styles.editButton} onPress={() => handleEditRequest(request)}>
                <Ionicons name="create-outline" size={18} color={Colors[colorScheme].tint} />
              </ThemedTouchableOpacity>
            </View>
          )}
        </>
      );

      // On mobile, make the entire row clickable
      if (Platform.OS !== "web") {
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
      }

      // On web, only the edit button is clickable
      return (
        <View key={request.id} style={styles.tableRow}>
          {rowContent}
        </View>
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
          <ThemedText style={[styles.tableCell, styles.headerCell]}>Edit</ThemedText>
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

  // Render the member search - modified for platform specifics
  const renderMemberSearch = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>1. Select Member</ThemedText>
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
        <ThemedText style={styles.sectionTitle}>2. Enter Request Details</ThemedText>

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

            <View style={styles.modalBody}>
              <ThemedText style={styles.modalWarning}>**Edit with caution**</ThemedText>
              <ThemedText style={styles.modalInfoText}>
                Member: {selectedMember?.first_name} {selectedMember?.last_name}
              </ThemedText>
              <ThemedText style={styles.modalInfoText}>Date: {formattedDate}</ThemedText>

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
            </View>
          </ThemedView>
        </View>
      </Modal>
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
      // Add visual feedback for touchable rows on mobile
      ...(Platform.OS !== "web" && {
        paddingRight: 36, // Add space for a visual indicator on the right
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
    editButton: {
      padding: 8,
      borderRadius: 4,
      backgroundColor: Colors.dark.card,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      width: Platform.OS === "web" ? "40%" : "90%",
      maxWidth: 500,
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
      maxHeight: Platform.OS === "web" ? 250 : undefined,
      flexGrow: 1,
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      overflow: "hidden",
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
        {renderMemberSearch()}
        {selectedMember && renderMemberRequests()}
        {renderRequestForm()}
        {renderEditModal()}
      </ScrollView>
    </ThemedView>
  );
}
