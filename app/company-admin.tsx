import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, Alert, TextInput, StyleSheet } from "react-native";
import { Text, Button, Modal } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { format, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../constants/Colors";
import { useColorScheme } from "../hooks/useColorScheme";
import { TouchableOpacity } from "react-native-gesture-handler";
import { supabase } from "../utils/supabase";
import { router, useNavigation } from "expo-router";

// Types
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
}

interface DenialReason {
  id: number;
  reason: string;
}

interface RequestItem {
  id: string;
  member_id: string;
  members: {
    pin_number: string;
    first_name: string;
    last_name: string;
  };
  request_date: string;
  leave_type: "PLD" | "SDV";
  created_at: string;
}

export default function CompanyAdminScreen() {
  const { user, isLoading, signOut } = useAuth();
  const navigation = useNavigation();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [denialReasons, setDenialReasons] = useState<DenialReason[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [isDenialModalVisible, setIsDenialModalVisible] = useState(false);
  const [selectedDenialReason, setSelectedDenialReason] = useState<number | null>(null);
  const [denialComment, setDenialComment] = useState("");
  const [isRequestLoading, setIsRequestLoading] = useState(false);

  // Check if user is a company admin
  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        // Instead of immediate navigation, return early and let the root layout handle the redirect
        return;
      }

      const isCompanyAdmin = user.user_metadata?.role === "company_admin";
      if (!isCompanyAdmin) {
        Alert.alert("Access Denied", "You do not have permission to access this page.");
        // Instead of immediate navigation, return early and let the root layout handle the redirect
        return;
      }

      // Only fetch data if we have a valid company admin
      fetchPendingRequests();
      fetchDenialReasons();
    }
  }, [user, isLoading]);

  // If still loading or no user/not admin, show loading state
  if (isLoading || !user || user.user_metadata?.role !== "company_admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text>Loading...</Text>
        </View>
      </View>
    );
  }

  // Fetch pending requests
  const fetchPendingRequests = useCallback(async () => {
    try {
      // First get the requests
      const { data: requestData, error: requestError } = await supabase
        .from("pld_sdv_requests")
        .select("id, member_id, request_date, leave_type, created_at, status, paid_in_lieu")
        .in("status", ["pending", "cancellation_pending"])
        .order("request_date", { ascending: true });

      if (requestError) throw requestError;

      // Then get the member details for each request
      if (requestData) {
        const memberIds = [...new Set(requestData.map((req) => req.member_id))];
        const { data: memberData, error: memberError } = await supabase
          .from("members")
          .select("id, pin_number, first_name, last_name")
          .in("id", memberIds);

        if (memberError) throw memberError;

        // Map member data to requests
        const memberMap = memberData?.reduce((acc, member) => {
          acc[member.id] = member;
          return acc;
        }, {} as Record<string, (typeof memberData)[0]>);

        setPendingRequests(
          requestData.map((request) => ({
            id: request.id,
            member_id: request.member_id,
            pin_number: memberMap[request.member_id]?.pin_number ?? "",
            first_name: memberMap[request.member_id]?.first_name ?? "",
            last_name: memberMap[request.member_id]?.last_name ?? "",
            request_date: request.request_date,
            leave_type: request.leave_type,
            created_at: request.created_at,
            status: request.status,
            paid_in_lieu: request.paid_in_lieu ?? false,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      Alert.alert("Error", "Failed to load pending requests");
    }
  }, []);

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
        })
        .eq("id", request.id);

      if (error) throw error;

      // Send notification to user
      await supabase.from("push_notification_deliveries").insert({
        member_id: request.member_id,
        title: "Leave Request Approved",
        body: `Your ${request.leave_type} request for ${format(
          parseISO(request.request_date),
          "MMM d, yyyy"
        )} has been approved.`,
        data: {
          type: "leave_request",
          request_id: request.id,
          status: "approved",
        },
      });

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
        })
        .eq("id", selectedRequest.id);

      if (error) throw error;

      // Send notification to user
      await supabase.from("push_notification_deliveries").insert({
        member_id: selectedRequest.member_id,
        title: "Leave Request Denied",
        body: `Your ${selectedRequest.leave_type} request for ${format(
          parseISO(selectedRequest.request_date),
          "MMM d, yyyy"
        )} has been denied.`,
        data: {
          type: "leave_request",
          request_id: selectedRequest.id,
          status: "denied",
        },
      });

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
        })
        .eq("id", request.id);

      if (error) throw error;

      // Send notification to user
      await supabase.from("push_notification_deliveries").insert({
        member_id: request.member_id,
        title: "Leave Request Cancellation Approved",
        body: `Your cancellation request for ${request.leave_type} on ${format(
          parseISO(request.request_date),
          "MMM d, yyyy"
        )} has been approved.`,
        data: {
          type: "leave_request",
          request_id: request.id,
          status: "cancelled",
        },
      });

      await fetchPendingRequests();
      Alert.alert("Success", "Cancellation approved successfully");
    } catch (error) {
      console.error("Error approving cancellation:", error);
      Alert.alert("Error", "Failed to approve cancellation");
    } finally {
      setIsRequestLoading(false);
    }
  };

  // Handle logout
  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (error) {
      console.error("Error signing out:", error);
      Alert.alert("Error", "Failed to sign out");
    }
  }, [signOut]);

  // Set up header right button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleLogout}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleLogout, colors.text]);

  const renderItem = ({ item }: { item: PendingRequest }) => (
    <View
      style={[
        styles.requestItem,
        { borderBottomColor: colors.border },
        item.paid_in_lieu && styles.paidInLieuItem,
        item.status === "cancellation_pending" && styles.cancellationPendingItem,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>
          {item.pin_number} - {item.first_name} {item.last_name}
        </Text>
        <View style={styles.requestHeader}>
          <Text style={styles.requestDate}>
            {format(parseISO(item.request_date), "MMM d, yyyy")} - {item.leave_type}
            {item.paid_in_lieu && <Text style={styles.paidInLieuText}> - To Be Paid In Lieu</Text>}
          </Text>
          {item.status === "cancellation_pending" && (
            <View style={[styles.statusBadge, { backgroundColor: colors.error + "20" }]}>
              <Text style={[styles.statusText, { color: colors.error }]}>Cancellation</Text>
            </View>
          )}
        </View>
        <Text dim style={styles.requestTime}>
          {item.status === "cancellation_pending" ? "Cancellation" : "Request"} Submitted:{" "}
          {format(parseISO(item.created_at), "MMM d, yyyy h:mm a")}
        </Text>
      </View>
      <View style={styles.actions}>
        {item.status === "cancellation_pending" ? (
          <TouchableOpacity
            onPress={() => handleCancellationApproval(item)}
            disabled={isRequestLoading}
            style={[styles.actionButton, { backgroundColor: colors.success + "20" }]}
          >
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => handleApprove(item)}
              disabled={isRequestLoading}
              style={[styles.actionButton, { backgroundColor: colors.success + "20" }]}
            >
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSelectedRequest(item);
                setIsDenialModalVisible(true);
              }}
              disabled={isRequestLoading}
              style={[styles.actionButton, { backgroundColor: colors.error + "20" }]}
            >
              <Ionicons name="close-circle" size={24} color={colors.error} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
              <TouchableOpacity
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
              </TouchableOpacity>
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
    </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
});
