import React, { useState, useEffect } from "react";
import { View, StyleSheet, RefreshControl, Alert, Platform } from "react-native";
import { ThemedView } from "../ThemedView";
import { ThemedText } from "../ThemedText";
import { ThemedScrollView } from "../ThemedScrollView";
import { ThemedTouchableOpacity } from "../ThemedTouchableOpacity";
import { Collapsible } from "../Collapsible";
import { supabase } from "../../utils/supabase";
import { useThemeColor } from "../../hooks/useThemeColor";
import Toast from "react-native-toast-message";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors } from "@/constants/Colors";

interface ReconciliationSummary {
  missing_cancellation_emails: number;
  failed_email_attempts: number;
  stuck_emails: number;
  total_dlq_items: number;
  unresolved_dlq_items: number;
  requires_attention: boolean;
  health_status: "healthy" | "warning" | "critical";
  generated_at: string;
}

interface EmailIssue {
  id: string;
  request_date: string;
  leave_type: string;
  status: string;
  first_name: string;
  last_name: string;
  pin_number: string;
  division_name: string;
  issue_type: string;
  time_since_action?: string;
  time_since_failure?: string;
  time_since_creation?: string;
  error_message?: string;
  retry_count?: number;
}

interface DLQItem {
  id: number;
  request_id: string;
  email_type: string;
  original_error: string;
  retry_count: number;
  requires_manual_review: boolean;
  created_at: string;
  member_name?: string;
  member_pin?: string;
}

interface ReconciliationDetails {
  missing_cancellation_emails: EmailIssue[];
  failed_email_attempts: EmailIssue[];
  stuck_emails: EmailIssue[];
  dlq_items: DLQItem[];
  generated_at: string;
}

export function EmailReconciliationDashboard() {
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [details, setDetails] = useState<ReconciliationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Collapsible component manages its own state, no need for individual state variables

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardBackgroundColor = useThemeColor({}, "background");
  const successColor = "#28a745";
  const warningColor = "#ffc107";
  const errorColor = "#dc3545";
  const primaryColor = useThemeColor({}, "tint");

  const fetchReconciliationData = async () => {
    try {
      // Fetch summary
      const { data: summaryData, error: summaryError } = await supabase.rpc("generate_email_reconciliation_report");

      if (summaryError) {
        console.error("Error fetching reconciliation summary:", summaryError);
        Toast.show({
          type: "error",
          text1: "Reconciliation Failed",
          text2: "Unable to fetch reconciliation summary",
        });
        return;
      }

      setSummary(summaryData);

      // Fetch detailed data
      const { data: detailsData, error: detailsError } = await supabase.rpc("get_reconciliation_details", {
        limit_per_category: 25,
      });

      if (detailsError) {
        console.error("Error fetching reconciliation details:", detailsError);
        Toast.show({
          type: "error",
          text1: "Details Failed",
          text2: "Unable to fetch reconciliation details",
        });
        return;
      }

      setDetails(detailsData);
    } catch (error) {
      console.error("Error in fetchReconciliationData:", error);
      Toast.show({
        type: "error",
        text1: "Reconciliation Failed",
        text2: "Network error occurred",
      });
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchReconciliationData();
    setIsRefreshing(false);
  };

  const resolveDLQItem = async (dlqId: number, resolutionNotes?: string) => {
    try {
      const { error } = await supabase.rpc("resolve_dlq_item", {
        p_dlq_id: dlqId,
        p_resolved_by: "admin_user", // In real app, use actual user ID
        p_resolution_notes: resolutionNotes || "Resolved via dashboard",
      });

      if (error) {
        console.error("Error resolving DLQ item:", error);
        Toast.show({
          type: "error",
          text1: "Resolution Failed",
          text2: "Unable to resolve DLQ item",
        });
        return;
      }

      Toast.show({
        type: "success",
        text1: "Item Resolved",
        text2: "DLQ item marked as resolved",
      });

      // Refresh data
      await fetchReconciliationData();
    } catch (error) {
      console.error("Error in resolveDLQItem:", error);
      Toast.show({
        type: "error",
        text1: "Resolution Failed",
        text2: "Network error occurred",
      });
    }
  };

  const retryFailedEmail = async (requestId: string, emailType: string) => {
    Alert.alert("Retry Email", `Retry sending ${emailType} email for request ${requestId}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Retry",
        onPress: async () => {
          try {
            const functionName = emailType.includes("cancellation") ? "send-cancellation-email" : "send-request-email";

            const { error } = await supabase.functions.invoke(functionName, {
              body: { requestId },
            });

            if (error) {
              console.error("Error retrying email:", error);
              Toast.show({
                type: "error",
                text1: "Retry Failed",
                text2: "Unable to retry email sending",
              });
              return;
            }

            Toast.show({
              type: "success",
              text1: "Email Retry Initiated",
              text2: "Email sending has been retried",
            });

            // Refresh data
            await fetchReconciliationData();
          } catch (error) {
            console.error("Error in retryFailedEmail:", error);
            Toast.show({
              type: "error",
              text1: "Retry Failed",
              text2: "Network error occurred",
            });
          }
        },
      },
    ]);
  };

  useEffect(() => {
    fetchReconciliationData().finally(() => setIsLoading(false));
  }, []);

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return successColor;
      case "warning":
        return warningColor;
      case "critical":
        return errorColor;
      default:
        return textColor;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatInterval = (interval: string) => {
    // Parse PostgreSQL interval format and make it human readable
    const match = interval.match(/(\d+):(\d+):(\d+)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      if (hours > 0) {
        return `${hours}h ${minutes}m ago`;
      }
      return `${minutes}m ago`;
    }
    return interval;
  };

  const renderEmailIssue = (issue: EmailIssue, index: number) => (
    <View key={`${issue.id}-${index}`} style={styles.issueCard}>
      <View style={styles.issueHeader}>
        <ThemedText style={styles.issueName}>
          {issue.first_name} {issue.last_name} (PIN: {issue.pin_number})
        </ThemedText>
        <ThemedText style={styles.issueTime}>
          {issue.time_since_action && formatInterval(issue.time_since_action)}
          {issue.time_since_failure && formatInterval(issue.time_since_failure)}
          {issue.time_since_creation && formatInterval(issue.time_since_creation)}
        </ThemedText>
      </View>
      <ThemedText style={styles.issueDetails}>
        {issue.leave_type} on {new Date(issue.request_date).toLocaleDateString()}
      </ThemedText>
      <ThemedText style={styles.issueDivision}>Division: {issue.division_name}</ThemedText>
      {issue.error_message && <ThemedText style={styles.errorMessage}>{issue.error_message}</ThemedText>}
      {issue.retry_count !== undefined && (
        <ThemedText style={styles.retryCount}>Retries: {issue.retry_count}</ThemedText>
      )}
      <View style={styles.issueActions}>
        <ThemedTouchableOpacity
          style={[styles.actionButton, { backgroundColor: primaryColor }]}
          onPress={() => retryFailedEmail(issue.id, issue.issue_type)}
        >
          <ThemedText style={styles.actionButtonText}>Retry Email</ThemedText>
        </ThemedTouchableOpacity>
      </View>
    </View>
  );

  const renderDLQItem = (item: DLQItem, index: number) => (
    <View key={`dlq-${item.id}-${index}`} style={styles.issueCard}>
      <View style={styles.issueHeader}>
        <ThemedText style={styles.issueName}>
          {item.member_name} (PIN: {item.member_pin})
        </ThemedText>
        <ThemedText style={styles.issueTime}>{formatTimestamp(item.created_at)}</ThemedText>
      </View>
      <ThemedText style={styles.issueDetails}>
        Email Type: {item.email_type} | Retries: {item.retry_count}
      </ThemedText>
      <ThemedText style={styles.errorMessage}>{item.original_error}</ThemedText>
      <View style={styles.issueActions}>
        <ThemedTouchableOpacity
          style={[styles.actionButton, { backgroundColor: successColor }]}
          onPress={() => resolveDLQItem(item.id, "Manually resolved")}
        >
          <ThemedText style={styles.actionButtonText}>Mark Resolved</ThemedText>
        </ThemedTouchableOpacity>
        <ThemedTouchableOpacity
          style={[styles.actionButton, { backgroundColor: primaryColor }]}
          onPress={() => retryFailedEmail(item.request_id, item.email_type)}
        >
          <ThemedText style={styles.actionButtonText}>Retry</ThemedText>
        </ThemedTouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.loadingText}>Loading reconciliation data...</ThemedText>
      </ThemedView>
    );
  }

  if (!summary || !details) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Unable to load reconciliation data</ThemedText>
        <ThemedTouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setIsLoading(true);
            fetchReconciliationData().finally(() => setIsLoading(false));
          }}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </ThemedTouchableOpacity>
      </ThemedView>
    );
  }

  const healthStatusColor = getHealthStatusColor(summary.health_status);

  return (
    <ThemedScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Email Reconciliation</ThemedText>
        <View style={[styles.healthBadge, { backgroundColor: healthStatusColor }]}>
          <ThemedText style={styles.healthBadgeText}>{summary.health_status.toUpperCase()}</ThemedText>
        </View>
      </View>

      {/* Summary Card */}
      <ThemedView style={[styles.summaryCard, { backgroundColor: cardBackgroundColor }]}>
        <ThemedText style={styles.summaryTitle}>Reconciliation Summary</ThemedText>
        <View style={styles.summaryStats}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{summary.missing_cancellation_emails}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Missing Cancellations</ThemedText>
            </View>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{summary.failed_email_attempts}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Failed Attempts</ThemedText>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{summary.stuck_emails}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Stuck Emails</ThemedText>
            </View>
            <View style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{summary.unresolved_dlq_items}</ThemedText>
              <ThemedText style={styles.summaryLabel}>DLQ Items</ThemedText>
            </View>
          </View>
        </View>
        <ThemedText style={styles.lastUpdated}>Last updated: {formatTimestamp(summary.generated_at)}</ThemedText>
      </ThemedView>

      {/* Missing Cancellation Emails */}
      <Collapsible title={`Missing Cancellation Emails (${details.missing_cancellation_emails.length})`}>
        {details.missing_cancellation_emails.length > 0 ? (
          details.missing_cancellation_emails.map(renderEmailIssue)
        ) : (
          <ThemedText style={styles.noIssuesText}>No missing cancellation emails found</ThemedText>
        )}
      </Collapsible>

      {/* Failed Email Attempts */}
      <Collapsible title={`Failed Email Attempts (${details.failed_email_attempts.length})`}>
        {details.failed_email_attempts.length > 0 ? (
          details.failed_email_attempts.map(renderEmailIssue)
        ) : (
          <ThemedText style={styles.noIssuesText}>No failed email attempts found</ThemedText>
        )}
      </Collapsible>

      {/* Stuck Email Records */}
      <Collapsible title={`Stuck Email Records (${details.stuck_emails.length})`}>
        {details.stuck_emails.length > 0 ? (
          details.stuck_emails.map(renderEmailIssue)
        ) : (
          <ThemedText style={styles.noIssuesText}>No stuck email records found</ThemedText>
        )}
      </Collapsible>

      {/* Dead Letter Queue Items */}
      <Collapsible title={`Dead Letter Queue (${details.dlq_items.length})`}>
        {details.dlq_items.length > 0 ? (
          details.dlq_items.map(renderDLQItem)
        ) : (
          <ThemedText style={styles.noIssuesText}>No dead letter queue items found</ThemedText>
        )}
      </Collapsible>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  healthBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  healthBadgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
  },
  summaryCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 2px 2px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  summaryStats: {
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#007AFF",
  },
  summaryLabel: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  lastUpdated: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: "center",
  },
  issueCard: {
    backgroundColor: Colors.dark.card,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ffc107",
  },
  issueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  issueName: {
    fontSize: 16,
    fontWeight: "bold",
    flex: 1,
  },
  issueTime: {
    fontSize: 12,
    opacity: 0.7,
  },
  issueDetails: {
    fontSize: 14,
    marginBottom: 2,
  },
  issueDivision: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: "#dc3545",
    fontStyle: "italic",
    marginBottom: 8,
  },
  retryCount: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  issueActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 12,
    fontWeight: "bold",
  },
  noIssuesText: {
    textAlign: "center",
    padding: 16,
    opacity: 0.7,
    fontStyle: "italic",
  },
  loadingText: {
    textAlign: "center",
    padding: 32,
    fontSize: 16,
  },
  errorText: {
    textAlign: "center",
    padding: 32,
    fontSize: 16,
    color: "#dc3545",
  },
  retryButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: "center",
    marginTop: 16,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
