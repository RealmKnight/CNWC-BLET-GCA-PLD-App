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
  members: Member[];
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

  // Memoize the fetchPendingRequests callback
  const fetchPendingRequests = useCallback(async () => {
    console.log("Fetching pending requests...");
    if (!user) return;

    try {
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
          members:member_id (
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

      const { data: requestData, error: requestError } = await query;

      if (requestError) {
        console.error("Error details:", requestError);
        throw requestError;
      }

      // Get division names for the division IDs
      const divisionIds = [
        ...new Set(
          (requestData as unknown as RequestData[])
            ?.map((req) => req.members?.[0]?.division_id)
            .filter((id) => id !== null && id !== undefined)
        ),
      ] as number[];

      // Fetch division names if we have division IDs
      let divisionMap: Record<number, string> = {};
      if (divisionIds.length > 0) {
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("id, name")
          .in("id", divisionIds);

        if (!divisionError && divisionData) {
          divisionMap = divisionData.reduce((acc, div) => {
            acc[div.id] = div.name;
            return acc;
          }, {} as Record<number, string>);
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

        if (!calendarError && calendarData) {
          calendarMap = calendarData.reduce((acc, cal) => {
            acc[cal.id] = cal.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Transform and filter the data
      const transformRequests = (data: any[]): PendingRequest[] => {
        if (!data?.length) return [];

        return data.map(
          (request): PendingRequest => ({
            id: request.id,
            member_id: request.member_id,
            pin_number: request.members?.[0]?.pin_number ?? "",
            first_name: request.members?.[0]?.first_name ?? "",
            last_name: request.members?.[0]?.last_name ?? "",
            request_date: request.request_date,
            leave_type: request.leave_type,
            created_at: request.created_at,
            status: request.status,
            paid_in_lieu: request.paid_in_lieu ?? false,
            calendar_id: request.calendar_id,
            calendar_name: request.calendar_id ? calendarMap[request.calendar_id] : null,
            division:
              (request.members?.[0]?.division_id && divisionMap[request.members?.[0]?.division_id]) || "Unknown",
          })
        );
      };

      const transformedData = transformRequests(requestData);
      setPendingRequests(transformedData);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      Alert.alert("Error", "Failed to load pending requests");
    }
  }, [user]);

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
    if (user?.user_metadata?.role !== "company_admin") return;

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
      subscription.unsubscribe();
    };
  }, [user, fetchPendingRequests]);

  // Initial data fetch
  useEffect(() => {
    if (user?.user_metadata?.role !== "company_admin") return;
    console.log("Initial data fetch");
    fetchPendingRequests();
    fetchDenialReasons();
  }, [user, fetchPendingRequests, fetchDenialReasons]);

  // Handle request approval
  const handleApprove = async (request: PendingRequest) => {
    setIsRequestLoading(true);
    try {
      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: "approved",
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", request.id);

      if (error) throw error;

      // Get the sender's PIN number (company admin)
      const senderPin = parseInt(user?.user_metadata?.pin || "0");
      // Get the recipient's PIN number from the request
      const recipientPin = parseInt(request.pin_number);

      // Validate PIN numbers
      if (isNaN(senderPin) || isNaN(recipientPin)) {
        throw new Error("Invalid PIN numbers for notification");
      }

      // Determine notification title and message based on request type and paid_in_lieu status
      const notificationTitle = request.paid_in_lieu
        ? `${request.leave_type} Paid in Lieu Approved`
        : `${request.leave_type} Day Off Approved`;

      const notificationMessage = request.paid_in_lieu
        ? `Your ${request.leave_type} payment request for ${format(
            parseISO(request.request_date),
            "MMM d, yyyy"
          )} has been approved.`
        : `Your ${request.leave_type} day off request for ${format(
            parseISO(request.request_date),
            "MMM d, yyyy"
          )} has been approved.`;

      await sendMessageWithNotification(
        senderPin,
        [recipientPin],
        notificationTitle,
        notificationMessage,
        false,
        "approval"
      );

      await fetchPendingRequests();
      Alert.alert("Success", "Request approved successfully");
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Error", "Failed to approve request");
    } finally {
      setIsRequestLoading(false);
    }
  };

  // Handle request denial
  const handleDeny = async () => {
    if (!selectedRequest || !selectedDenialReason) return;

    setIsRequestLoading(true);
    try {
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

      await sendMessageWithNotification(
        parseInt(user?.user_metadata?.pin),
        [parseInt(selectedRequest.pin_number)],
        "Leave Request Denied",
        `Your ${selectedRequest.leave_type} request for ${format(
          parseISO(selectedRequest.request_date),
          "MMM d, yyyy"
        )} has been denied.`,
        false,
        "denial"
      );

      setIsDenialModalVisible(false);
      setSelectedRequest(null);
      setSelectedDenialReason(null);
      setDenialComment("");
      await fetchPendingRequests();
      Alert.alert("Success", "Request denied successfully");
    } catch (error) {
      console.error("Error denying request:", error);
      Alert.alert("Error", "Failed to deny request");
    } finally {
      setIsRequestLoading(false);
    }
  };

  // Handle cancellation approval
  const handleCancellationApproval = async (request: PendingRequest) => {
    setIsRequestLoading(true);
    try {
      const { error } = await supabase
        .from("pld_sdv_requests")
        .update({
          status: "cancelled",
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", request.id);

      if (error) throw error;

      // Get the sender's PIN number (company admin)
      const senderPin = parseInt(user?.user_metadata?.pin || "0");
      // Get the recipient's PIN number from the request
      const recipientPin = parseInt(request.pin_number);

      // Validate PIN numbers
      if (isNaN(senderPin) || isNaN(recipientPin)) {
        throw new Error("Invalid PIN numbers for notification");
      }

      await sendMessageWithNotification(
        senderPin,
        [recipientPin],
        "Leave Request Cancellation Approved",
        `Your cancellation request for ${request.leave_type} on ${format(
          parseISO(request.request_date),
          "MMM d, yyyy"
        )} has been approved.`,
        false,
        "approval"
      );

      await fetchPendingRequests();
      Alert.alert("Success", "Cancellation approved successfully");
    } catch (error) {
      console.error("Error approving cancellation:", error);
      Alert.alert("Error", "Failed to approve cancellation");
    } finally {
      setIsRequestLoading(false);
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
});
