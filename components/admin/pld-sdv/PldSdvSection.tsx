import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, Alert, TextInput, StyleSheet, Platform } from "react-native";
import { Text, Button, Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { supabase } from "@/utils/supabase";
import { sendMessageWithNotification } from "@/utils/notificationService";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ThemedView";

interface Member {
  pin_number: string;
  first_name: string;
  last_name: string;
  division_id: number;
}

interface RequestData {
  id: string;
  member_id: string;
  request_date: string;
  leave_type: string;
  created_at: string;
  status: string;
  paid_in_lieu: boolean;
  calendar_id: string;
  members: Member;
}

interface PendingRequest {
  id: string;
  member_id: string;
  pin_number: string;
  first_name: string;
  last_name: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  created_at: string;
  status: string;
  paid_in_lieu: boolean;
  calendar_id: string | null;
  calendar_name: string | null;
  division: string;
}

interface DenialReason {
  id: number;
  reason: string;
}

const Container = Platform.OS === "web" ? View : SafeAreaView;

export function PldSdvSection() {
  const { user } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [denialReasons, setDenialReasons] = useState<DenialReason[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [isDenialModalVisible, setIsDenialModalVisible] = useState(false);
  const [selectedDenialReason, setSelectedDenialReason] = useState<number | null>(null);
  const [denialComment, setDenialComment] = useState("");
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [isConfirmationModalVisible, setIsConfirmationModalVisible] = useState(false);
  const [confirmationType, setConfirmationType] = useState<"approve" | "cancellation">("approve");

  // Memoize the fetchPendingRequests callback
  const fetchPendingRequests = useCallback(async () => {
    console.log("Fetching pending requests...");
    if (!user) return;

    try {
      // First, try getting the requests with member information
      const query = supabase
        .from("pld_sdv_requests")
        .select(
          `
          id,
          member_id,
          request_date,
          leave_type,
          created_at,
          status,
          paid_in_lieu,
          calendar_id,
          members!inner (
            pin_number,
            first_name,
            last_name,
            division_id
          )
        `
        )
        .in("status", ["pending", "cancellation_pending"])
        .not("status", "eq", "waitlisted")
        .order("request_date", { ascending: true });

      // Explicitly type the data returned from the query
      const { data: requestData, error: requestError } = (await query) as {
        data: RequestData[] | null;
        error: any;
      };

      if (requestError) {
        console.error("Error details:", requestError);
        throw requestError;
      }

      // Ensure requestData is not null before proceeding
      if (!requestData) {
        console.log("No request data found.");
        setPendingRequests([]);
        return;
      }

      // Debug: Log the raw request data to check member information
      console.log(
        "Raw request data (first few items):",
        requestData.slice(0, 2).map((req) => ({
          id: req.id,
          member_id: req.member_id,
          members: req.members, // This should now be correctly typed as Member object
          pin: req.members?.pin_number,
          firstName: req.members?.first_name,
          lastName: req.members?.last_name,
          divisionId: req.members?.division_id,
        }))
      );

      // Get division names for the division IDs
      const divisionIds = [
        ...new Set(
          requestData
            .map((req) => req.members?.division_id) // Access directly now
            .filter((id): id is number => id !== null && id !== undefined) // Type guard
        ),
      ];

      // Debug: Log division IDs being queried
      console.log("Division IDs found:", divisionIds);

      // Fetch division names if we have division IDs
      let divisionMap: Record<number, string> = {};
      if (divisionIds.length > 0) {
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("id, name")
          .in("id", divisionIds);

        if (divisionError) {
          console.error("Error fetching divisions:", divisionError);
        }

        if (divisionData) {
          // Debug: Log division data
          console.log("Division data:", divisionData);

          divisionMap = divisionData.reduce((acc, div) => {
            acc[div.id] = div.name;
            return acc;
          }, {} as Record<number, string>);

          // Debug: Log division mapping
          console.log("Division mapping:", divisionMap);
        }
      }

      // Fetch calendar names for requests that have calendar_ids
      const calendarIds = [
        ...new Set(requestData?.map((req) => req.calendar_id).filter((id) => id !== null && id !== undefined)),
      ];

      let calendarMap: Record<string, string> = {};
      if (calendarIds.length > 0) {
        const { data: calendarData, error: calendarError } = await supabase
          .from("calendars")
          .select("id, name")
          .in("id", calendarIds);

        if (calendarError) {
          console.error("Error fetching calendars:", calendarError);
        }

        if (calendarData) {
          calendarMap = calendarData.reduce((acc, cal) => {
            acc[cal.id] = cal.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Transform and filter the data
      const transformRequests = (data: any[]): PendingRequest[] => {
        if (!data?.length) return [];

        return data.map((request): PendingRequest => {
          // Handle the updated join structure
          const members = request.members;

          const transformedRequest = {
            id: request.id,
            member_id: request.member_id,
            pin_number: members?.pin_number ?? "",
            first_name: members?.first_name ?? "",
            last_name: members?.last_name ?? "",
            request_date: request.request_date,
            leave_type: request.leave_type,
            created_at: request.created_at,
            status: request.status,
            paid_in_lieu: request.paid_in_lieu ?? false,
            calendar_id: request.calendar_id,
            calendar_name: request.calendar_id ? calendarMap[request.calendar_id] : null,
            division: (members?.division_id && divisionMap[members.division_id]) || "Unknown",
          };

          // Debug: Log individual transformed request
          if (
            !transformedRequest.pin_number ||
            !transformedRequest.first_name ||
            transformedRequest.division === "Unknown"
          ) {
            console.log("Missing data in transformed request:", {
              id: transformedRequest.id,
              pin: transformedRequest.pin_number,
              firstName: transformedRequest.first_name,
              lastName: transformedRequest.last_name,
              divisionId: members?.division_id,
              mappedDivision: transformedRequest.division,
              rawDivisionId: members?.division_id,
              hasDivisionMap: members?.division_id ? !!divisionMap[members.division_id] : false,
            });
          }

          return transformedRequest;
        });
      };

      const transformedData = transformRequests(requestData);

      // Debug: Log count and first transformed item
      console.log(
        `Transformed ${transformedData.length} requests. First item:`,
        transformedData.length > 0 ? transformedData[0] : "No requests"
      );

      setPendingRequests(transformedData);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      Alert.alert("Error", "Failed to load pending requests");
    }
  }, [user?.id]);

  // Fetch denial reasons
  const fetchDenialReasons = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("pld_sdv_denial_reasons")
        .select("*")
        .eq("is_active", true)
        .order("id");

      if (error) throw error;
      setDenialReasons(data);
    } catch (error) {
      console.error("Error fetching denial reasons:", error);
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    // Perform admin check inside the effect
    const isAdmin = user?.user_metadata?.role === "company_admin";
    if (!isAdmin) {
      console.log("[PldSdvSection] Skipping real-time subscription: User is not company admin.");
      return; // Don't subscribe if not admin
    }

    console.log("[PldSdvSection] Setting up real-time subscription.");
    const subscription = supabase
      .channel("pld-sdv-requests-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `status=in.(pending,cancellation_pending)`,
        },
        () => {
          console.log("Real-time update received");
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      console.log("[PldSdvSection] Unsubscribing from real-time changes.");
      subscription.unsubscribe();
    };
    // Stabilize dependencies: Depend on user ID and the memoized fetch function
  }, [user?.id, fetchPendingRequests]);

  // Initial data fetch
  useEffect(() => {
    // Check if the user object exists and has the correct role.
    // This check is more stable than depending on the user object reference directly.
    const isAdmin = user?.user_metadata?.role === "company_admin";
    if (!isAdmin) {
      console.log("[PldSdvSection] Skipping initial fetch: User is not company admin.");
      return; // Don't fetch if not admin
    }

    console.log("[PldSdvSection] Initial data fetch triggered.");
    // Call fetch functions directly. Since they are memoized with useCallback,
    // their references should be stable unless their own dependencies change.
    fetchPendingRequests();
    fetchDenialReasons();
    // Depend only on the memoized fetch functions. The isAdmin check handles the user state.
  }, [fetchPendingRequests, fetchDenialReasons]);

  // Get the user's PIN number safely - for company admins, returns 0 as default
  const getSenderPinNumber = (): number => {
    // Company admins typically use 0 as their sender PIN number
    // This matches the existing pattern in the database for admin messages
    if (!user?.user_metadata?.pin) {
      console.log("Company admin PIN not found in metadata, using default admin PIN (0)");
      return 0; // Default PIN for company admin
    }

    const pinNumber = parseInt(user.user_metadata.pin);
    if (isNaN(pinNumber)) {
      console.log("Invalid PIN number format in metadata, using default admin PIN (0)");
      return 0; // Default PIN for company admin if parsing fails
    }

    return pinNumber;
  };

  // Get a valid recipient PIN number or throw a descriptive error
  const getRecipientPinNumber = (pinValue: string | number): number => {
    // If pinValue is null or undefined
    if (pinValue == null) {
      console.error("Recipient PIN is null or undefined");
      throw new Error("Recipient PIN number is missing");
    }

    // Convert to string for validation if it's not already a string
    const pinString = String(pinValue);

    // Now we can safely use string methods
    if (pinString.trim() === "") {
      console.error("Recipient PIN is an empty string");
      throw new Error("Recipient PIN number is missing");
    }

    const pinNumber = parseInt(pinString);
    if (isNaN(pinNumber)) {
      console.error("Invalid recipient PIN format:", pinString);
      throw new Error(`Invalid recipient PIN number: ${pinString}`);
    }

    return pinNumber;
  };

  // Handle request approval
  const handleApprove = async (request: PendingRequest) => {
    setSelectedRequest(request);
    setConfirmationType("approve");
    setIsConfirmationModalVisible(true);
  };

  // Create a new function to handle the actual approval after confirmation
  const confirmApprove = async () => {
    if (!selectedRequest) return;

    setIsConfirmationModalVisible(false);
    setIsRequestLoading(true);
    try {
      // Log the request data for debugging
      console.log("Processing approval request:", {
        id: selectedRequest.id,
        pin: selectedRequest.pin_number,
        date: selectedRequest.request_date,
        type: selectedRequest.leave_type,
        paid_in_lieu: selectedRequest.paid_in_lieu,
      });

      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: "approved",
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      // Get the sender's PIN number (company admin)
      const senderPin = getSenderPinNumber();

      // Get and validate the recipient's PIN number from the request
      try {
        const recipientPin = getRecipientPinNumber(selectedRequest.pin_number);

        // Determine notification title and message based on request type and paid_in_lieu status
        const notificationTitle = selectedRequest.paid_in_lieu
          ? `${selectedRequest.leave_type} Paid in Lieu Approved`
          : `${selectedRequest.leave_type} Day Off Approved`;

        const notificationMessage = selectedRequest.paid_in_lieu
          ? `Your ${selectedRequest.leave_type} payment request for ${format(
              parseISO(selectedRequest.request_date),
              "MMM d, yyyy"
            )} has been approved. Please verify in CATS.`
          : `Your ${selectedRequest.leave_type} day off request for ${format(
              parseISO(selectedRequest.request_date),
              "MMM d, yyyy"
            )} has been approved. Please verify in CATS.`;

        // Send notification
        await sendMessageWithNotification(
          senderPin,
          [recipientPin],
          notificationTitle,
          notificationMessage,
          false,
          "approval"
        );
      } catch (pinError) {
        console.error("Error with recipient PIN:", pinError);
        Alert.alert(
          "Partial Success",
          "Request was approved, but notification could not be sent due to invalid recipient data."
        );
      }

      // Refresh the list regardless of notification success
      await fetchPendingRequests();
      Alert.alert("Success", "Request approved successfully");
    } catch (error) {
      console.error("Error approving request:", error);

      // If the error is related to PIN validation but the database update succeeded
      if ((error as Error)?.message?.includes("PIN")) {
        console.log("Request approved but notification failed due to PIN issue");
        Alert.alert(
          "Partial Success",
          "Request was approved, but notification could not be sent due to invalid recipient data."
        );
        await fetchPendingRequests();
      } else {
        Alert.alert("Error", "Failed to approve request");
      }
    } finally {
      setIsRequestLoading(false);
      setSelectedRequest(null);
    }
  };

  // Handle request denial
  const handleDeny = async () => {
    if (!selectedRequest || !selectedDenialReason) return;

    setIsRequestLoading(true);
    try {
      // Log the request data for debugging
      console.log("Processing denial request:", {
        id: selectedRequest.id,
        pin: selectedRequest.pin_number,
        date: selectedRequest.request_date,
        type: selectedRequest.leave_type,
        reason_id: selectedDenialReason,
      });

      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: "denied",
          denial_reason_id: selectedDenialReason,
          denial_comment: denialComment,
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      // Get the sender's PIN number (company admin)
      const senderPin = getSenderPinNumber();

      // Get and validate the recipient's PIN number from the request
      try {
        const recipientPin = getRecipientPinNumber(selectedRequest.pin_number);

        // Send notification
        await sendMessageWithNotification(
          senderPin,
          [recipientPin],
          "Leave Request Denied",
          `Your ${selectedRequest.leave_type} request for ${format(
            parseISO(selectedRequest.request_date),
            "MMM d, yyyy"
          )} has been denied. Please verify in CATS.`,
          false,
          "denial"
        );
      } catch (pinError) {
        console.error("Error with recipient PIN:", pinError);
        Alert.alert(
          "Partial Success",
          "Request was denied, but notification could not be sent due to invalid recipient data."
        );
      }

      setIsDenialModalVisible(false);
      setSelectedRequest(null);
      setSelectedDenialReason(null);
      setDenialComment("");
      await fetchPendingRequests();
      Alert.alert("Success", "Request denied successfully");
    } catch (error) {
      console.error("Error denying request:", error);

      // If the error is related to PIN validation but the database update succeeded
      if ((error as Error)?.message?.includes("PIN")) {
        console.log("Request denied but notification failed due to PIN issue");

        setIsDenialModalVisible(false);
        setSelectedRequest(null);
        setSelectedDenialReason(null);
        setDenialComment("");

        Alert.alert(
          "Partial Success",
          "Request was denied, but notification could not be sent due to invalid recipient data."
        );
        await fetchPendingRequests();
      } else {
        Alert.alert("Error", "Failed to deny request");
      }
    } finally {
      setIsRequestLoading(false);
    }
  };

  // Handle cancellation approval
  const handleCancellationApproval = async (request: PendingRequest) => {
    setSelectedRequest(request);
    setConfirmationType("cancellation");
    setIsConfirmationModalVisible(true);
  };

  // Create a new function to handle the actual cancellation approval after confirmation
  const confirmCancellationApproval = async () => {
    if (!selectedRequest) return;

    setIsConfirmationModalVisible(false);
    setIsRequestLoading(true);
    try {
      // Log the request data for debugging
      console.log("Processing cancellation request:", {
        id: selectedRequest.id,
        pin: selectedRequest.pin_number,
        date: selectedRequest.request_date,
        type: selectedRequest.leave_type,
      });

      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: "cancelled",
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      // Get the sender's PIN number (company admin)
      const senderPin = getSenderPinNumber();

      // Get and validate the recipient's PIN number from the request
      try {
        const recipientPin = getRecipientPinNumber(selectedRequest.pin_number);

        // Send notification
        await sendMessageWithNotification(
          senderPin,
          [recipientPin],
          "Leave Request Cancellation Approved",
          `Your cancellation request for ${selectedRequest.leave_type} on ${format(
            parseISO(selectedRequest.request_date),
            "MMM d, yyyy"
          )} has been approved. Please verify in CATS.`,
          false,
          "approval"
        );
      } catch (pinError) {
        console.error("Error with recipient PIN:", pinError);
        Alert.alert(
          "Partial Success",
          "Request was cancelled, but notification could not be sent due to invalid recipient data."
        );
      }

      await fetchPendingRequests();
      Alert.alert("Success", "Cancellation approved successfully");
    } catch (error) {
      console.error("Error approving cancellation:", error);

      // Update the database entry even if notification fails
      if ((error as Error)?.message?.includes("PIN")) {
        console.log("Attempting to update request status despite notification error...");
        try {
          await supabase
            .from("pld_sdv_requests")
            .update({
              status: "cancelled",
              actioned_by: user?.id,
              actioned_at: new Date().toISOString(),
              responded_at: new Date().toISOString(),
              responded_by: user?.id,
            })
            .eq("id", selectedRequest.id);

          Alert.alert(
            "Partial Success",
            "Request was cancelled, but notification could not be sent due to invalid recipient data."
          );
          await fetchPendingRequests();
        } catch (dbError) {
          console.error("Failed to update request status:", dbError);
          Alert.alert("Error", "Failed to approve cancellation");
        }
      } else {
        Alert.alert("Error", "Failed to approve cancellation");
      }
    } finally {
      setIsRequestLoading(false);
      setSelectedRequest(null);
    }
  };

  const renderItem = ({ item }: { item: PendingRequest }) => {
    return (
      <ThemedView
        style={[
          styles.requestItem,
          { borderBottomColor: colors.border },
          item.paid_in_lieu && styles.paidInLieuItem,
          item.status === "cancellation_pending" && styles.cancellationPendingItem,
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.memberName}>
            <Text>{item.pin_number || ""}</Text>
            {item.pin_number ? <Text> - </Text> : null}
            <Text>{item.first_name || ""}</Text>
            {item.first_name && item.last_name ? <Text> </Text> : null}
            <Text>{item.last_name || ""}</Text>
          </Text>
          <View style={styles.requestHeader}>
            <Text style={styles.requestDate}>
              <Text>
                {format(parseISO(item.request_date), "MMM d, yyyy")}
                <Text> - </Text>
                {item.leave_type}
              </Text>
              {item.paid_in_lieu ? <Text style={styles.paidInLieuText}> - To Be Paid In Lieu</Text> : null}
            </Text>
            {item.status === "cancellation_pending" ? (
              <View style={[styles.statusBadge, { backgroundColor: colors.error + "20" }]}>
                <Text style={[styles.statusText, { color: colors.error }]}>Cancellation</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.requestInfo}>
            <Text style={[styles.requestTime, { color: colors.textDim }]}>
              <Text>
                {item.status === "cancellation_pending" ? "Cancellation" : "Request"}
                <Text> Submitted: </Text>
                {format(parseISO(item.created_at), "MMM d, yyyy h:mm a")}
              </Text>
            </Text>
            <View style={styles.locationInfo}>
              {item.division ? <Text style={styles.divisionText}>Division {item.division}</Text> : null}
              {item.calendar_name ? (
                <>
                  <Text style={styles.separator}>•</Text>
                  <Text style={styles.calendarText}>Calendar: {item.calendar_name}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          {item.status === "cancellation_pending" ? (
            <TouchableOpacityComponent
              onPress={() => handleCancellationApproval(item)}
              disabled={isRequestLoading}
              style={[styles.actionButton, { backgroundColor: colors.success + "20" }]}
            >
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </TouchableOpacityComponent>
          ) : (
            <>
              <TouchableOpacityComponent
                onPress={() => handleApprove(item)}
                disabled={isRequestLoading}
                style={[styles.actionButton, { backgroundColor: colors.success + "20" }]}
              >
                <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              </TouchableOpacityComponent>
              <TouchableOpacityComponent
                onPress={() => {
                  setSelectedRequest(item);
                  setIsDenialModalVisible(true);
                }}
                disabled={isRequestLoading}
                style={[styles.actionButton, { backgroundColor: colors.error + "20" }]}
              >
                <Ionicons name="close-circle" size={24} color={colors.error} />
              </TouchableOpacityComponent>
            </>
          )}
        </View>
      </ThemedView>
    );
  };

  return (
    <Container style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={pendingRequests}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No pending requests</Text>
          </View>
        }
      />

      <Modal
        visible={isDenialModalVisible}
        onClose={() => {
          setIsDenialModalVisible(false);
          setSelectedRequest(null);
          setSelectedDenialReason(null);
          setDenialComment("");
        }}
        title="Deny Request"
      >
        <View style={styles.modalContent}>
          <Text>Select Reason:</Text>
          <View style={styles.reasonsList}>
            {denialReasons.map((reason) => (
              <TouchableOpacityComponent
                key={reason.id}
                onPress={() => setSelectedDenialReason(reason.id)}
                style={[
                  styles.reasonButton,
                  {
                    backgroundColor: selectedDenialReason === reason.id ? colors.primary + "20" : colors.card,
                    borderColor: selectedDenialReason === reason.id ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: selectedDenialReason === reason.id ? colors.primary : colors.text,
                  }}
                >
                  {reason.reason}
                </Text>
              </TouchableOpacityComponent>
            ))}
          </View>

          <Text style={styles.label}>Additional Comments (Optional):</Text>
          <TextInput
            value={denialComment}
            onChangeText={setDenialComment}
            placeholder="Enter any additional comments..."
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            style={[
              styles.commentInput,
              {
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Button
            onPress={handleDeny}
            disabled={!selectedDenialReason || isRequestLoading}
            style={styles.confirmButton}
          >
            Confirm Denial
          </Button>
        </View>
      </Modal>

      <Modal
        visible={isConfirmationModalVisible}
        onClose={() => {
          setIsConfirmationModalVisible(false);
          setSelectedRequest(null);
        }}
        title={confirmationType === "approve" ? "Confirm Approval" : "Confirm Cancellation"}
      >
        <View style={styles.modalContent}>
          {selectedRequest && (
            <>
              <View style={styles.requestDetail}>
                <Text style={styles.detailLabel}>Member:</Text>
                <Text style={styles.detailValue}>
                  {selectedRequest.pin_number} - {selectedRequest.first_name} {selectedRequest.last_name}
                </Text>
              </View>

              <View style={styles.requestDetail}>
                <Text style={styles.detailLabel}>Date:</Text>
                <Text style={styles.detailValue}>{format(parseISO(selectedRequest.request_date), "MMM d, yyyy")}</Text>
              </View>

              <View style={styles.requestDetail}>
                <Text style={styles.detailLabel}>Type:</Text>
                <Text style={styles.detailValue}>
                  {selectedRequest.leave_type}
                  {selectedRequest.paid_in_lieu && " - To Be Paid In Lieu"}
                </Text>
              </View>

              {selectedRequest.division && (
                <View style={styles.requestDetail}>
                  <Text style={styles.detailLabel}>Division:</Text>
                  <Text style={styles.detailValue}>{selectedRequest.division}</Text>
                </View>
              )}

              {selectedRequest.calendar_name && (
                <View style={styles.requestDetail}>
                  <Text style={styles.detailLabel}>Calendar:</Text>
                  <Text style={styles.detailValue}>{selectedRequest.calendar_name}</Text>
                </View>
              )}

              <Text style={styles.confirmationWarning}>
                {confirmationType === "approve"
                  ? "Are you sure you want to approve this request?"
                  : "Are you sure you want to approve this cancellation request?"}
              </Text>

              <View style={styles.confirmButtons}>
                <Button
                  variant="secondary"
                  onPress={() => setIsConfirmationModalVisible(false)}
                  style={styles.cancelButton}
                >
                  Cancel
                </Button>
                <Button
                  onPress={confirmationType === "approve" ? confirmApprove : confirmCancellationApproval}
                  style={styles.confirmButton}
                >
                  Confirm
                </Button>
              </View>
            </>
          )}
        </View>
      </Modal>
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  requestItem: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  memberName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  requestDate: {
    marginTop: 4,
  },
  requestTime: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    textAlign: "center",
  },
  modalContent: {
    gap: 16,
  },
  reasonsList: {
    gap: 8,
  },
  reasonButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: {
    marginTop: 8,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    textAlignVertical: "top",
  },
  confirmButton: {
    marginTop: 8,
  },
  paidInLieuItem: {
    backgroundColor: "rgba(255, 215, 0, 0.1)", // Light gold background
  },
  paidInLieuText: {
    color: "#B8860B", // Dark golden rod color
    fontWeight: "500",
  },
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cancellationPendingItem: {
    backgroundColor: Colors.dark.error + "10",
  },
  requestInfo: {
    marginTop: 4,
    gap: 2,
  },
  locationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  divisionText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textDim,
  },
  calendarText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textDim,
  },
  separator: {
    fontSize: 12,
    color: Colors.light.textDim,
    marginHorizontal: 4,
  },
  requestDetail: {
    marginBottom: 8,
    flexDirection: "row",
  },
  detailLabel: {
    fontWeight: "bold",
    width: 80,
  },
  detailValue: {
    flex: 1,
  },
  confirmationWarning: {
    marginTop: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  confirmButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
  },
});
