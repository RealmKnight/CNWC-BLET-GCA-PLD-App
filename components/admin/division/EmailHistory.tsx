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

// Enhanced interface to include both email_tracking and email_attempt_log data
interface EmailRecord {
  id: string; // Combine with source identifier
  source: "email_tracking" | "email_attempt_log";
  request_id: string | null;
  email_type: "request" | "cancellation" | "notification";

  // From email_tracking
  recipient?: string;
  subject?: string;
  message_id?: string | null;
  tracking_status?:
    | "queued"
    | "sent"
    | "delivered"
    | "opened"
    | "clicked"
    | "failed"
    | "bounced"
    | "complained"
    | "unsubscribed";
  retry_count?: number;
  next_retry_at?: string | null;
  fallback_notification_sent?: boolean;

  // From email_attempt_log
  attempt_status?:
    | "initiated"
    | "function_invoked"
    | "function_failed"
    | "email_queued"
    | "email_sent"
    | "email_failed"
    | "email_delivered";
  function_name?: string;
  app_component?: string;
  attempt_data?: any;
  response_data?: any;
  email_tracking_id?: number;

  // Common fields
  error_message?: string | null;
  created_at: string;
  last_updated_at?: string;

  // Request details for display
  request?: {
    id: string;
    request_date: string;
    leave_type: "PLD" | "SDV";
    status: string;
    pin_number: number | null;
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
  const [emailRecords, setEmailRecords] = useState<EmailRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedEmailType, setSelectedEmailType] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");

  // Get division info for context (but don't use for filtering)
  const currentDivision = divisions.find((div) => div.name === division);

  // Enhanced filter options to include attempt statuses
  const statusOptions = [
    { value: "all", label: "All Status" },
    // Email tracking statuses
    { value: "queued", label: "Queued" },
    { value: "sent", label: "Sent" },
    { value: "delivered", label: "Delivered" },
    { value: "opened", label: "Opened" },
    { value: "clicked", label: "Clicked" },
    { value: "failed", label: "Failed" },
    { value: "bounced", label: "Bounced" },
    // Email attempt statuses
    { value: "initiated", label: "Initiated" },
    { value: "function_invoked", label: "Function Called" },
    { value: "function_failed", label: "Function Failed" },
    { value: "email_failed", label: "Email Failed" },
  ];

  const emailTypeOptions = [
    { value: "all", label: "All Types" },
    { value: "request", label: "Request" },
    { value: "cancellation", label: "Cancellation" },
    { value: "notification", label: "Notification" },
  ];

  const sourceOptions = [
    { value: "all", label: "All Sources" },
    { value: "email_tracking", label: "Delivered Emails" },
    { value: "email_attempt_log", label: "Attempts & Failures" },
  ];

  // Load divisions if not already loaded
  useEffect(() => {
    if (divisions.length === 0) {
      fetchDivisions();
    }
  }, [divisions.length, fetchDivisions]);

  // Enhanced fetch function to get both email_tracking and email_attempt_log data
  const fetchEmailRecords = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch from email_tracking table
      let trackingQuery = supabase
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
        .limit(300);

      // Fetch from email_attempt_log table
      let attemptQuery = supabase
        .from("email_attempt_log")
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
        .order("attempted_at", { ascending: false })
        .limit(300);

      // Filter by specific request if provided
      if (requestId) {
        trackingQuery = trackingQuery.eq("request_id", requestId);
        attemptQuery = attemptQuery.eq("request_id", requestId);
      }

      const [trackingResult, attemptResult] = await Promise.all([trackingQuery, attemptQuery]);

      if (trackingResult.error) throw trackingResult.error;
      if (attemptResult.error) throw attemptResult.error;

      // Transform and combine both datasets
      const trackingRecords: EmailRecord[] = (trackingResult.data || []).map((record: any) => ({
        id: `tracking_${record.id}`,
        source: "email_tracking" as const,
        request_id: record.request_id,
        email_type: record.email_type,
        recipient: record.recipient,
        subject: record.subject,
        message_id: record.message_id,
        tracking_status: record.status,
        error_message: record.error_message,
        retry_count: record.retry_count,
        next_retry_at: record.next_retry_at,
        fallback_notification_sent: record.fallback_notification_sent,
        created_at: record.created_at,
        last_updated_at: record.last_updated_at,
        request: record.request,
      }));

      const attemptRecords: EmailRecord[] = (attemptResult.data || []).map((record: any) => ({
        id: `attempt_${record.id}`,
        source: "email_attempt_log" as const,
        request_id: record.request_id,
        email_type: record.email_type,
        attempt_status: record.attempt_status,
        function_name: record.function_name,
        app_component: record.app_component,
        attempt_data: record.attempt_data,
        response_data: record.response_data,
        error_message: record.error_message,
        email_tracking_id: record.email_tracking_id,
        created_at: record.attempted_at, // Use attempted_at for created_at
        last_updated_at: record.completed_at || record.attempted_at, // Use completed_at for last_updated_at
        request: record.request,
      }));

      // Combine and sort by creation date
      let allRecords = [...trackingRecords, ...attemptRecords];
      allRecords.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Filter by division if division context is provided and no specific request
      if (division && !requestId) {
        const divisionInfo = divisions.find((div) => div.name === division);

        if (divisionInfo) {
          allRecords = allRecords.filter((record) => {
            // Include records where the request is associated with a member from this division
            if (record.request?.member?.division_id === divisionInfo.id) {
              return true;
            }

            // Include system-wide notifications ONLY if they're related to this division's requests
            if (record.email_type === "notification" && record.recipient === "system") {
              if (record.request?.member?.division_id === divisionInfo.id) {
                return true;
              }
              return false;
            }

            // Include emails sent to division-specific addresses (only for tracking records)
            if (record.source === "email_tracking" && record.recipient) {
              const divisionEmailPatterns = [
                division.toLowerCase(),
                `div${divisionInfo.id}`,
                `division${divisionInfo.id}`,
              ];

              const recipientLower = record.recipient.toLowerCase();
              const includesDivisionPattern = divisionEmailPatterns.some((pattern) => recipientLower.includes(pattern));

              if (includesDivisionPattern) {
                return true;
              }
            }

            return false;
          });
        }
      }

      setEmailRecords(allRecords);
    } catch (err) {
      console.error("Error fetching email records:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch email records");
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced resend email function
  const handleResendEmail = async (record: EmailRecord) => {
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

  // Enhanced filter function
  const filteredRecords = emailRecords.filter((record) => {
    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        (record.recipient || "").toLowerCase().includes(searchLower) ||
        (record.subject || "").toLowerCase().includes(searchLower) ||
        (record.request?.member?.first_name || "").toLowerCase().includes(searchLower) ||
        (record.request?.member?.last_name || "").toLowerCase().includes(searchLower) ||
        (record.app_component || "").toLowerCase().includes(searchLower) ||
        (record.function_name || "").toLowerCase().includes(searchLower) ||
        record.request?.member?.pin_number?.toString().includes(searchQuery) ||
        record.request?.pin_number?.toString().includes(searchQuery);

      if (!matchesSearch) return false;
    }

    // Status filter - check both tracking and attempt statuses
    if (selectedStatus !== "all") {
      const matchesStatus = record.tracking_status === selectedStatus || record.attempt_status === selectedStatus;
      if (!matchesStatus) return false;
    }

    // Email type filter
    if (selectedEmailType !== "all" && record.email_type !== selectedEmailType) {
      return false;
    }

    // Source filter
    if (selectedSource !== "all" && record.source !== selectedSource) {
      return false;
    }

    return true;
  });

  // Load data on mount and when division changes
  useEffect(() => {
    fetchEmailRecords();
  }, [requestId, division, divisions.length]);

  // Enhanced status color function
  const getStatusColor = (record: EmailRecord): string => {
    const status = record.tracking_status || record.attempt_status;

    switch (status) {
      case "delivered":
      case "opened":
      case "clicked":
      case "email_sent":
      case "email_delivered":
        return Colors.light.success || "#10b981";
      case "sent":
      case "function_invoked":
      case "email_queued":
        return Colors.light.tint;
      case "queued":
      case "initiated":
        return Colors.light.warning || "#f59e0b";
      case "failed":
      case "bounced":
      case "complained":
      case "function_failed":
      case "email_failed":
        return Colors.light.error;
      default:
        return Colors[colorScheme].text;
    }
  };

  // Enhanced status icon function
  const getStatusIcon = (record: EmailRecord): keyof typeof Ionicons.glyphMap => {
    const status = record.tracking_status || record.attempt_status;

    switch (status) {
      case "delivered":
      case "email_delivered":
        return "checkmark-circle";
      case "opened":
        return "mail-open";
      case "clicked":
        return "link";
      case "sent":
      case "email_sent":
        return "paper-plane";
      case "queued":
      case "email_queued":
        return "time";
      case "failed":
      case "bounced":
      case "function_failed":
      case "email_failed":
        return "warning";
      case "complained":
        return "ban";
      case "initiated":
        return "play";
      case "function_invoked":
        return "code";
      default:
        return "mail";
    }
  };

  // Helper function to get display status
  const getDisplayStatus = (record: EmailRecord): string => {
    if (record.source === "email_tracking") {
      return record.tracking_status?.toUpperCase() || "UNKNOWN";
    } else {
      switch (record.attempt_status) {
        case "initiated":
          return "INITIATED";
        case "function_invoked":
          return "FUNCTION CALLED";
        case "function_failed":
          return "FUNCTION FAILED";
        case "email_queued":
          return "EMAIL QUEUED";
        case "email_sent":
          return "EMAIL SENT";
        case "email_failed":
          return "EMAIL FAILED";
        case "email_delivered":
          return "EMAIL DELIVERED";
        default:
          return (record.attempt_status || "unknown").toUpperCase();
      }
    }
  };

  if (isLoading && emailRecords.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading comprehensive email history...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Enhanced Information Section */}
      {division && currentDivision && (
        <View
          style={[
            styles.infoContainer,
            { backgroundColor: Colors[colorScheme].tint + "10", borderColor: Colors[colorScheme].tint + "30" },
          ]}
        >
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={20} color={Colors[colorScheme].tint} />
            <ThemedText style={[styles.infoTitle, { color: Colors[colorScheme].tint }]}>
              {division} Division - Complete Email History
            </ThemedText>
          </View>
          <ThemedText style={styles.infoText}>
            Showing ALL email activity for {division} division including:
            {"\n"}• ✅ Successfully delivered emails (green status)
            {"\n"}• ⚠️ Failed attempts and errors (red status)
            {"\n"}• 🔄 Retry attempts and function calls (blue/yellow status)
            {"\n"}• 📧 Email notifications for registered members only
            {"\n\n"}This comprehensive view helps diagnose email delivery issues and track all communication attempts.
          </ThemedText>
        </View>
      )}

      {/* Enhanced Search and Filters */}
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
          placeholder="Search by recipient, subject, member, or component..."
          placeholderTextColor={Colors[colorScheme].text + "60"}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <View style={styles.filtersRow}>
          {/* Source Filter */}
          <View style={styles.filterGroup}>
            <ThemedText style={styles.filterLabel}>Source:</ThemedText>
            <View style={styles.filterChipContainer}>
              {sourceOptions.map((option) => (
                <TouchableOpacityComponent
                  key={option.value}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        selectedSource === option.value ? Colors[colorScheme].tint : Colors[colorScheme].border,
                    },
                  ]}
                  onPress={() => setSelectedSource(option.value)}
                >
                  <ThemedText
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          selectedSource === option.value
                            ? Colors[colorScheme].background
                            : Colors[colorScheme].textDim,
                      },
                    ]}
                  >
                    {option.label}
                  </ThemedText>
                </TouchableOpacityComponent>
              ))}
            </View>
          </View>

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
                          selectedStatus === option.value
                            ? Colors[colorScheme].background
                            : Colors[colorScheme].textDim,
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
                            : Colors[colorScheme].textDim,
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

      {/* Enhanced Results Summary */}
      <View style={styles.summaryContainer}>
        <ThemedText style={styles.summaryText}>
          Showing {filteredRecords.length} of {emailRecords.length} records
          {division && currentDivision && ` for ${division} division`}
        </ThemedText>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.light.success }]} />
            <ThemedText style={styles.legendText}>Success</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.light.error }]} />
            <ThemedText style={styles.legendText}>Failed</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.light.warning }]} />
            <ThemedText style={styles.legendText}>Pending</ThemedText>
          </View>
        </View>
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

      {/* Enhanced Email Records List */}
      <View style={styles.listContainer}>
        {filteredRecords.length === 0 ? (
          <ThemedView style={styles.emptyContainer}>
            <Ionicons name="mail-outline" size={48} color={Colors[colorScheme].text + "40"} />
            <ThemedText style={styles.emptyText}>
              {emailRecords.length === 0
                ? `No email records found${division && currentDivision ? ` for ${division} division` : ""}`
                : "No records match your filters"}
            </ThemedText>
            {division && currentDivision && emailRecords.length === 0 && (
              <ThemedText style={styles.emptySubtext}>
                Email records will appear here when email attempts are made for members in the {division} division.
                {"\n\n"}This includes both successful deliveries and failed attempts, providing complete visibility into
                email system activity.
              </ThemedText>
            )}
          </ThemedView>
        ) : (
          <View style={styles.listContent}>
            {filteredRecords.map((record) => (
              <AnimatedThemedView
                key={record.id}
                style={[
                  styles.recordCard,
                  {
                    borderColor: Colors[colorScheme].border,
                    borderLeftWidth: 4,
                    borderLeftColor: getStatusColor(record),
                  },
                ]}
                entering={FadeIn}
                exiting={FadeOut}
                layout={Layout.springify()}
              >
                {/* Enhanced Header Row */}
                <View style={styles.recordHeader}>
                  <View style={styles.recordInfo}>
                    <View style={styles.statusContainer}>
                      <Ionicons name={getStatusIcon(record)} size={16} color={getStatusColor(record)} />
                      <ThemedText style={[styles.statusText, { color: getStatusColor(record) }]}>
                        {getDisplayStatus(record)}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.emailTypeText}>{record.email_type.toUpperCase()}</ThemedText>
                    <ThemedText style={styles.sourceText}>
                      {record.source === "email_tracking" ? "📧 DELIVERED" : "🔍 ATTEMPT"}
                    </ThemedText>
                  </View>

                  {/* Enhanced Resend Button */}
                  {(record.tracking_status === "failed" ||
                    record.tracking_status === "bounced" ||
                    record.attempt_status === "function_failed" ||
                    record.attempt_status === "email_failed") && (
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
                      - {record.request.leave_type} on{" "}
                      {new Date(record.request.request_date + "T12:00:00").toLocaleDateString()}
                    </ThemedText>
                  </View>
                )}

                {/* Enhanced Email Details */}
                <View style={styles.emailDetails}>
                  {record.source === "email_tracking" ? (
                    <>
                      <ThemedText style={styles.detailText}>
                        <ThemedText style={styles.detailLabel}>To:</ThemedText> {record.recipient}
                      </ThemedText>
                      <ThemedText style={styles.detailText}>
                        <ThemedText style={styles.detailLabel}>Subject:</ThemedText> {record.subject}
                      </ThemedText>
                      {record.message_id && (
                        <ThemedText style={styles.detailText}>
                          <ThemedText style={styles.detailLabel}>Message ID:</ThemedText> {record.message_id}
                        </ThemedText>
                      )}
                    </>
                  ) : (
                    <>
                      <ThemedText style={styles.detailText}>
                        <ThemedText style={styles.detailLabel}>Function:</ThemedText> {record.function_name || "N/A"}
                      </ThemedText>
                      <ThemedText style={styles.detailText}>
                        <ThemedText style={styles.detailLabel}>Component:</ThemedText> {record.app_component || "N/A"}
                      </ThemedText>
                      {record.email_tracking_id && (
                        <ThemedText style={styles.detailText}>
                          <ThemedText style={styles.detailLabel}>Linked Email ID:</ThemedText>{" "}
                          {record.email_tracking_id}
                        </ThemedText>
                      )}
                    </>
                  )}

                  <ThemedText style={styles.detailText}>
                    <ThemedText style={styles.detailLabel}>Created:</ThemedText>{" "}
                    {new Date(record.created_at).toLocaleString()}
                  </ThemedText>
                  {record.last_updated_at && record.last_updated_at !== record.created_at && (
                    <ThemedText style={styles.detailText}>
                      <ThemedText style={styles.detailLabel}>Updated:</ThemedText>{" "}
                      {new Date(record.last_updated_at).toLocaleString()}
                    </ThemedText>
                  )}
                </View>

                {/* Enhanced Additional Info */}
                <View style={styles.additionalInfo}>
                  {record.retry_count && record.retry_count > 0 && (
                    <ThemedText style={styles.retryText}>Retries: {record.retry_count}</ThemedText>
                  )}
                  {record.fallback_notification_sent && (
                    <ThemedText style={styles.fallbackText}>Fallback notification sent</ThemedText>
                  )}
                  {record.error_message && (
                    <View style={styles.errorSection}>
                      <ThemedText style={styles.errorLabel}>Error:</ThemedText>
                      <ThemedText style={styles.errorText}>{record.error_message}</ThemedText>
                    </View>
                  )}
                  {record.attempt_data && (
                    <TouchableOpacityComponent
                      style={styles.debugButton}
                      onPress={() => {
                        Toast.show({
                          type: "info",
                          text1: "Debug Data",
                          text2: JSON.stringify(record.attempt_data, null, 2),
                          position: "bottom",
                        });
                      }}
                    >
                      <Ionicons name="bug" size={12} color={Colors[colorScheme].textDim} />
                      <ThemedText style={styles.debugText}>Debug Info</ThemedText>
                    </TouchableOpacityComponent>
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
  legendContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    fontWeight: "500",
  },
  errorSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  errorLabel: {
    fontWeight: "500",
  },
  debugButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  debugText: {
    fontSize: 12,
    fontWeight: "500",
  },
  sourceText: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
    fontStyle: "italic",
  },
});
