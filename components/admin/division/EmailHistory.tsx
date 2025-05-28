import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, View, ActivityIndicator, TouchableOpacity, TextInput } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";
import Toast from "react-native-toast-message";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface EmailTrackingRecord {
  id: number;
  request_id: string;
  email_type: "request" | "cancellation" | "notification";
  recipient: string;
  subject: string;
  message_id: string | null;
  status: "queued" | "sent" | "delivered" | "opened" | "clicked" | "failed" | "bounced" | "complained" | "unsubscribed";
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  fallback_notification_sent: boolean;
  last_updated_at: string;
  created_at: string;
  // Request details for display
  request?: {
    id: string;
    request_date: string;
    leave_type: "PLD" | "SDV";
    status: string;
    pin_number: number | null; // Pin number from request table
    member?: {
      first_name: string | null;
      last_name: string | null;
      pin_number: number;
      division_id: number;
    };
  };
}

interface EmailHistoryProps {
  division?: string;
  requestId?: string; // Optional filter by specific request
}

export function EmailHistory({ division, requestId }: EmailHistoryProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  // Store state for division info
  const { divisions, fetchDivisions } = useDivisionManagementStore();

  // State
  const [emailRecords, setEmailRecords] = useState<EmailTrackingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedEmailType, setSelectedEmailType] = useState<string>("all");

  // Get division info for context (but don't use for filtering)
  const currentDivision = divisions.find((div) => div.name === division);

  // Filter options
  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "queued", label: "Queued" },
    { value: "sent", label: "Sent" },
    { value: "delivered", label: "Delivered" },
    { value: "opened", label: "Opened" },
    { value: "clicked", label: "Clicked" },
    { value: "failed", label: "Failed" },
    { value: "bounced", label: "Bounced" },
  ];

  const emailTypeOptions = [
    { value: "all", label: "All Types" },
    { value: "request", label: "Request" },
    { value: "cancellation", label: "Cancellation" },
    { value: "notification", label: "Notification" },
  ];

  // Load divisions if not already loaded
  useEffect(() => {
    if (divisions.length === 0) {
      fetchDivisions();
    }
  }, [divisions.length, fetchDivisions]);

  // Fetch email tracking records
  const fetchEmailRecords = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("email_tracking")
        .select(
          `
          *,
          request:pld_sdv_requests (
            id,
            request_date,
            leave_type,
            status,
            pin_number,
            member:members (
              first_name,
              last_name,
              pin_number,
              division_id
            )
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(500); // Increased limit since we're not pre-filtering

      // Filter by specific request if provided
      if (requestId) {
        query = query.eq("request_id", requestId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      // For division admin context, show ALL emails
      // Division filtering will be handled in the UI if needed
      let filteredData = data as EmailTrackingRecord[];

      // If we have a specific division context and no specific request,
      // we could optionally filter by division-related patterns here
      // For now, show all emails in division admin context
      if (division && !requestId) {
        // Show all emails - division context is for display purposes
        // The admin can see all email activity for their oversight
        console.log(`Showing all email records for division admin context: ${division}`);
      }

      setEmailRecords(filteredData);
    } catch (err) {
      console.error("Error fetching email records:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch email records");
    } finally {
      setIsLoading(false);
    }
  };

  // Resend email
  const handleResendEmail = async (record: EmailTrackingRecord) => {
    if (!record.request_id) return;

    try {
      setIsLoading(true);

      let functionName = "";
      switch (record.email_type) {
        case "request":
          functionName = "send-request-email";
          break;
        case "cancellation":
          functionName = "send-cancellation-email";
          break;
        case "notification":
          // Notification emails are triggered by status changes, not directly resendable
          Toast.show({
            type: "info",
            text1: "Cannot Resend",
            text2: "Notification emails are triggered automatically by status changes",
            position: "bottom",
          });
          return;
        default:
          Toast.show({
            type: "error",
            text1: "Cannot Resend",
            text2: "Unknown email type",
            position: "bottom",
          });
          return;
      }

      const { error } = await supabase.functions.invoke(functionName, {
        body: {
          requestId: record.request_id,
        },
      });

      if (error) {
        throw error;
      }

      Toast.show({
        type: "success",
        text1: "Email Resent",
        text2: `${record.email_type} email has been resent successfully`,
        position: "bottom",
      });

      // Refresh the records to show the new attempt
      await fetchEmailRecords();
    } catch (err) {
      console.error("Error resending email:", err);
      Toast.show({
        type: "error",
        text1: "Resend Failed",
        text2: err instanceof Error ? err.message : "Failed to resend email",
        position: "bottom",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter records based on search and filters
  const filteredRecords = emailRecords.filter((record) => {
    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        record.recipient.toLowerCase().includes(searchLower) ||
        record.subject.toLowerCase().includes(searchLower) ||
        (record.request?.member?.first_name || "").toLowerCase().includes(searchLower) ||
        (record.request?.member?.last_name || "").toLowerCase().includes(searchLower) ||
        record.request?.member?.pin_number?.toString().includes(searchQuery) ||
        record.request?.pin_number?.toString().includes(searchQuery);

      if (!matchesSearch) return false;
    }

    // Status filter
    if (selectedStatus !== "all" && record.status !== selectedStatus) {
      return false;
    }

    // Email type filter
    if (selectedEmailType !== "all" && record.email_type !== selectedEmailType) {
      return false;
    }

    return true;
  });

  // Load data on mount and when division changes
  useEffect(() => {
    fetchEmailRecords();
  }, [requestId, division]);

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case "delivered":
      case "opened":
      case "clicked":
        return Colors.light.success || "#10b981";
      case "sent":
        return Colors.light.tint;
      case "queued":
        return Colors.light.warning || "#f59e0b";
      case "failed":
      case "bounced":
      case "complained":
        return Colors.light.error;
      default:
        return Colors[colorScheme].text;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case "delivered":
        return "checkmark-circle";
      case "opened":
        return "mail-open";
      case "clicked":
        return "link";
      case "sent":
        return "paper-plane";
      case "queued":
        return "time";
      case "failed":
      case "bounced":
        return "warning";
      case "complained":
        return "ban";
      default:
        return "mail";
    }
  };

  if (isLoading && emailRecords.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading email history...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Information Section */}
      {division && (
        <View
          style={[
            styles.infoContainer,
            { backgroundColor: Colors[colorScheme].tint + "10", borderColor: Colors[colorScheme].tint + "30" },
          ]}
        >
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={[styles.infoTitle, { color: Colors[colorScheme].tint }]}>
              Notification System Info
            </ThemedText>
          </View>
          <ThemedText style={styles.infoText}>
            This system only sends notifications to members who have:
            {"\n"}• Registered in the app with their PIN number
            {"\n"}• Set up their notification preferences
            {"\n\n"}Members who haven't registered yet will not receive email notifications to prevent spam.
          </ThemedText>
        </View>
      )}

      {/* Search and Filters */}
      <View style={styles.filtersContainer}>
        <TextInput
          style={[
            styles.searchInput,
            {
              color: Colors[colorScheme].text,
              borderColor: Colors[colorScheme].border,
              backgroundColor: Colors[colorScheme].background,
            },
          ]}
          placeholder="Search by recipient, subject, or member..."
          placeholderTextColor={Colors[colorScheme].text + "60"}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.filtersRow}>
          {/* Status Filter */}
          <View style={styles.filterGroup}>
            <ThemedText style={styles.filterLabel}>Status:</ThemedText>
            <View style={styles.filterChipContainer}>
              {statusOptions.map((option) => (
                <TouchableOpacityComponent
                  key={option.value}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        selectedStatus === option.value ? Colors[colorScheme].tint : Colors[colorScheme].border,
                    },
                  ]}
                  onPress={() => setSelectedStatus(option.value)}
                >
                  <ThemedText
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          selectedStatus === option.value ? Colors[colorScheme].background : Colors[colorScheme].text,
                      },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </TouchableOpacityComponent>
              ))}
            </View>
          </View>

          {/* Email Type Filter */}
          <View style={styles.filterGroup}>
            <ThemedText style={styles.filterLabel}>Type:</ThemedText>
            <View style={styles.filterChipContainer}>
              {emailTypeOptions.map((option) => (
                <TouchableOpacityComponent
                  key={option.value}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        selectedEmailType === option.value ? Colors[colorScheme].tint : Colors[colorScheme].border,
                    },
                  ]}
                  onPress={() => setSelectedEmailType(option.value)}
                >
                  <ThemedText
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          selectedEmailType === option.value
                            ? Colors[colorScheme].background
                            : Colors[colorScheme].text,
                      },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </TouchableOpacityComponent>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Results Summary */}
      <View style={styles.summaryContainer}>
        <ThemedText style={styles.summaryText}>
          Showing {filteredRecords.length} of {emailRecords.length} email records
          {division && ` (Division ${division} Admin View)`}
        </ThemedText>
      </View>

      {/* Error State */}
      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacityComponent style={styles.retryButton} onPress={fetchEmailRecords}>
            <ThemedText style={[styles.retryButtonText, { color: Colors[colorScheme].tint }]}>Retry</ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>
      )}

      {/* Email Records List */}
      <View style={styles.listContainer}>
        {filteredRecords.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <Ionicons name="mail-outline" size={48} color={Colors[colorScheme].text + "40"} />
            <ThemedText style={styles.emptyText}>
              {emailRecords.length === 0
                ? `No email records found${division ? ` (Division ${division} Admin View)` : ""}`
                : "No records match your filters"}
            </ThemedText>
            {division && emailRecords.length === 0 && (
              <ThemedText style={styles.emptySubtext}>
                Email records will appear here when email notifications are sent from the system.
                {"\n\n"}Note: Notifications are only sent to members who have registered in the app and set up their
                notification preferences.
              </ThemedText>
            )}
          </ThemedView>
        ) : (
          <View style={styles.listContent}>
            {filteredRecords.map((record) => (
              <AnimatedThemedView
                key={record.id}
                style={[styles.recordCard, { borderColor: Colors[colorScheme].border }]}
                entering={FadeIn}
                exiting={FadeOut}
                layout={Layout.springify()}
              >
                {/* Header Row */}
                <View style={styles.recordHeader}>
                  <View style={styles.recordInfo}>
                    <View style={styles.statusContainer}>
                      <Ionicons name={getStatusIcon(record.status)} size={16} color={getStatusColor(record.status)} />
                      <ThemedText style={[styles.statusText, { color: getStatusColor(record.status) }]}>
                        {record.status.toUpperCase()}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.emailTypeText}>{record.email_type.toUpperCase()}</ThemedText>
                  </View>

                  {/* Resend Button */}
                  {(record.status === "failed" || record.status === "bounced") && (
                    <TouchableOpacityComponent
                      style={[styles.resendButton, { borderColor: Colors[colorScheme].tint }]}
                      onPress={() => handleResendEmail(record)}
                    >
                      <Ionicons name="refresh" size={16} color={Colors[colorScheme].tint} />
                      <ThemedText style={[styles.resendButtonText, { color: Colors[colorScheme].tint }]}>
                        Resend
                      </ThemedText>
                    </TouchableOpacityComponent>
                  )}
                </View>

                {/* Request Details */}
                {record.request && (
                  <View style={styles.requestDetails}>
                    <ThemedText style={styles.requestText}>
                      <ThemedText style={styles.requestLabel}>Request:</ThemedText>{" "}
                      {record.request.member?.first_name && record.request.member?.last_name
                        ? `${record.request.member.first_name} ${record.request.member.last_name} (${record.request.member.pin_number})`
                        : record.request.pin_number
                        ? `PIN ${record.request.pin_number}`
                        : "Unknown Member"}{" "}
                      - {record.request.leave_type} on {new Date(record.request.request_date).toLocaleDateString()}
                    </ThemedText>
                  </View>
                )}

                {/* Email Details */}
                <View style={styles.emailDetails}>
                  <ThemedText style={styles.detailText}>
                    <ThemedText style={styles.detailLabel}>To:</ThemedText> {record.recipient}
                  </ThemedText>
                  <ThemedText style={styles.detailText}>
                    <ThemedText style={styles.detailLabel}>Subject:</ThemedText> {record.subject}
                  </ThemedText>
                  <ThemedText style={styles.detailText}>
                    <ThemedText style={styles.detailLabel}>Sent:</ThemedText>{" "}
                    {new Date(record.created_at).toLocaleString()}
                  </ThemedText>
                  {record.last_updated_at !== record.created_at && (
                    <ThemedText style={styles.detailText}>
                      <ThemedText style={styles.detailLabel}>Last Updated:</ThemedText>{" "}
                      {new Date(record.last_updated_at).toLocaleString()}
                    </ThemedText>
                  )}
                </View>

                {/* Additional Info */}
                <View style={styles.additionalInfo}>
                  {record.retry_count > 0 && (
                    <ThemedText style={styles.retryText}>Retries: {record.retry_count}</ThemedText>
                  )}
                  {record.fallback_notification_sent && (
                    <ThemedText style={styles.fallbackText}>Fallback notification sent</ThemedText>
                  )}
                  {record.error_message && (
                    <ThemedText style={styles.errorText}>Error: {record.error_message}</ThemedText>
                  )}
                </View>
              </AnimatedThemedView>
            ))}
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  filtersContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
    }),
  },
  filtersRow: {
    gap: 16,
  },
  filterGroup: {
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  filterChipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  summaryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.dark.background + "80",
  },
  summaryText: {
    fontSize: 14,
    opacity: 0.7,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: Colors.dark.error + "20",
    borderColor: Colors.dark.error,
    borderWidth: 1,
    borderRadius: 8,
    margin: 16,
    alignItems: "center",
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  recordCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: Colors.dark.background,
  },
  recordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  recordInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  emailTypeText: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
  },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  resendButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  requestDetails: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.border + "40",
    borderRadius: 8,
  },
  requestText: {
    fontSize: 14,
  },
  requestLabel: {
    fontWeight: "600",
  },
  emailDetails: {
    marginBottom: 12,
    gap: 4,
  },
  detailText: {
    fontSize: 14,
  },
  detailLabel: {
    fontWeight: "500",
  },
  additionalInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  retryText: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
  },
  fallbackText: {
    fontSize: 12,
    color: Colors.dark.warning,
    fontWeight: "500",
  },
  infoContainer: {
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  infoText: {
    fontSize: 14,
    opacity: 0.7,
  },
});
