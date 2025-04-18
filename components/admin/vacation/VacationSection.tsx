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
import { Database } from "@/types/supabase";

type VacationRequest = Database["public"]["Tables"]["vacation_requests"]["Row"] & {
  member: {
    pin_number: number;
    first_name: string | null;
    last_name: string | null;
    division_id: number;
  };
  calendar?: {
    id: string;
    name: string;
  };
  division?: {
    id: number;
    name: string;
  };
};

interface SortConfig {
  key: keyof PendingVacationRequest;
  direction: "asc" | "desc";
  priority: number;
}

interface PendingVacationRequest {
  id: string;
  pin_number: number;
  first_name: string;
  last_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  status: Database["public"]["Enums"]["vacation_request_status"];
  division: string;
  calendar_name: string | null;
}

interface DenialReason {
  id: number;
  reason: string;
}

interface Filters {
  division: number | null;
  calendar: string | null;
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

const Container = Platform.OS === "web" ? View : SafeAreaView;

export function VacationSection() {
  const { user } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const [pendingRequests, setPendingRequests] = useState<PendingVacationRequest[]>([]);
  const [denialReasons, setDenialReasons] = useState<DenialReason[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PendingVacationRequest | null>(null);
  const [isDenialModalVisible, setIsDenialModalVisible] = useState(false);
  const [selectedDenialReason, setSelectedDenialReason] = useState<number | null>(null);
  const [denialComment, setDenialComment] = useState("");
  const [isRequestLoading, setIsRequestLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig[]>([
    { key: "last_name", direction: "asc", priority: 1 },
    { key: "start_date", direction: "asc", priority: 2 },
  ]);
  const [filters, setFilters] = useState<Filters>({
    division: null,
    calendar: null,
    dateRange: {
      start: null,
      end: null,
    },
  });

  // Fetch pending vacation requests
  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;

    try {
      // Step 1: Fetch the vacation requests without trying to join the calendar directly
      const { data: requestData, error: requestError } = await supabase
        .from("vacation_requests")
        .select(
          `
          *,
          member:pin_number (
            pin_number,
            first_name,
            last_name,
            division_id
          )
        `
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (requestError) throw requestError;

      // Step 2: Get all calendar IDs that we need to fetch
      const calendarIds = [
        ...new Set(
          requestData?.map((req) => req.calendar_id).filter((id): id is string => id !== null && id !== undefined)
        ),
      ];

      // Step 3: Fetch calendar data separately if we have any calendar IDs
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
        } else if (calendarError) {
          console.error("Error fetching calendars:", calendarError);
        }
      }

      // Get division names for the division IDs
      const divisionIds = [
        ...new Set(
          requestData
            ?.map((req) => req.member?.division_id)
            .filter((id): id is number => id !== null && id !== undefined)
        ),
      ];

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

      // Transform the data
      const transformedData = (requestData ?? []).map(
        (request: any): PendingVacationRequest => ({
          id: request.id,
          pin_number: request.pin_number,
          first_name: request.member?.first_name ?? "",
          last_name: request.member?.last_name ?? "",
          start_date: request.start_date,
          end_date: request.end_date,
          created_at: request.created_at ?? "",
          status: request.status,
          division: (request.member?.division_id && divisionMap[request.member.division_id]) || "Unknown",
          calendar_name: request.calendar_id ? calendarMap[request.calendar_id] ?? "Unknown" : null,
        })
      );

      // Apply sorting
      const sortedData = applySorting(transformedData);
      setPendingRequests(sortedData);
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      Alert.alert("Error", "Failed to load pending requests");
    }
  }, [user?.id, sortConfig, filters]);

  // Apply sorting to the data
  const applySorting = (data: PendingVacationRequest[]) => {
    return [...data].sort((a, b) => {
      for (const sort of sortConfig) {
        const aValue = a[sort.key];
        const bValue = b[sort.key];

        if (aValue === bValue) continue;

        const compareResult =
          sort.direction === "asc"
            ? String(aValue).localeCompare(String(bValue))
            : String(bValue).localeCompare(String(aValue));

        if (compareResult !== 0) return compareResult;
      }
      return 0;
    });
  };

  // Handle sort change
  const handleSort = (key: keyof PendingVacationRequest) => {
    setSortConfig((prevSort) => {
      const existingSort = prevSort.find((s) => s.key === key);
      if (existingSort) {
        // Toggle direction if exists
        if (existingSort.direction === "asc") {
          existingSort.direction = "desc";
        } else {
          // Remove sort if already desc
          return prevSort.filter((s) => s.key !== key);
        }
        return [...prevSort];
      } else if (prevSort.length < 3) {
        // Add new sort if under limit
        return [...prevSort, { key, direction: "asc", priority: prevSort.length + 1 }];
      }
      return prevSort;
    });
  };

  // Reset sorting to default
  const resetSort = () => {
    setSortConfig([
      { key: "last_name", direction: "asc", priority: 1 },
      { key: "start_date", direction: "asc", priority: 2 },
    ]);
  };

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
      console.log("[VacationSection] Skipping real-time subscription: User is not company admin.");
      return; // Don't subscribe if not admin
    }

    console.log("[VacationSection] Setting up real-time subscription.");
    const subscription = supabase
      .channel("vacation-requests-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vacation_requests",
          filter: "status=eq.pending",
        },
        () => {
          console.log("Real-time update received");
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      console.log("[VacationSection] Unsubscribing from real-time changes.");
      subscription.unsubscribe();
    };
    // Stabilize dependencies: Depend on user ID and the memoized fetch function
  }, [user?.id, fetchPendingRequests]);

  // Initial data fetch
  useEffect(() => {
    // Check if the user object exists and has the correct role.
    const isAdmin = user?.user_metadata?.role === "company_admin";
    if (!isAdmin) {
      console.log("[VacationSection] Skipping initial fetch: User is not company admin.");
      return; // Don't fetch if not admin
    }

    console.log("[VacationSection] Initial data fetch triggered.");
    fetchPendingRequests();
    fetchDenialReasons();
    // Depend only on the memoized fetch functions.
  }, [fetchPendingRequests, fetchDenialReasons]);

  // Handle request approval
  const handleApprove = async (request: PendingVacationRequest) => {
    setIsRequestLoading(true);
    try {
      const { error } = await supabase
        .from("vacation_requests")
        .update({
          status: "approved",
          actioned_by: user?.id,
          actioned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          responded_by: user?.id,
        })
        .eq("id", request.id);

      if (error) throw error;

      await sendMessageWithNotification(
        parseInt(user?.user_metadata?.pin),
        [request.pin_number],
        "Vacation Request Approved",
        `Your vacation request for ${format(parseISO(request.start_date), "MMM d")} - ${format(
          parseISO(request.end_date),
          "MMM d, yyyy"
        )} has been approved.`,
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
        .from("vacation_requests")
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
        [selectedRequest.pin_number],
        "Vacation Request Denied",
        `Your vacation request for ${format(parseISO(selectedRequest.start_date), "MMM d")} - ${format(
          parseISO(selectedRequest.end_date),
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

  const renderItem = ({ item }: { item: PendingVacationRequest }) => {
    return (
      <ThemedView style={[styles.requestItem, { borderBottomColor: colors.border }]}>
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
                {format(parseISO(item.start_date), "MMM d")} - {format(parseISO(item.end_date), "MMM d, yyyy")}
              </Text>
            </Text>
          </View>
          <View style={styles.requestInfo}>
            <Text style={[styles.requestTime, { color: colors.textDim }]}>
              <Text>Request Submitted: {format(parseISO(item.created_at), "MMM d, yyyy h:mm a")}</Text>
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
  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
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
