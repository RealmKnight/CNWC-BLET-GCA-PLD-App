import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, View, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";
import Toast from "react-native-toast-message";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface EmailAlert {
  id: number;
  type: "email_failure" | "email_settings_change" | "delivery_status";
  severity: "high" | "medium" | "low";
  title: string;
  message: string;
  requestId?: string;
  divisionId?: number;
  divisionName?: string;
  timestamp: string;
  acknowledged: boolean;
  metadata?: any;
}

interface EmailNotificationAlertsProps {
  divisionFilter?: string; // Optional division filter for division admins
  initialShowOnlyUnacknowledged?: boolean;
  maxAlerts?: number;
}

export function EmailNotificationAlerts({
  divisionFilter,
  initialShowOnlyUnacknowledged = true,
  maxAlerts = 10,
}: EmailNotificationAlertsProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { member } = useUserStore();
  const { session } = useAuth();

  // State
  const [alerts, setAlerts] = useState<EmailAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [showOnlyUnacknowledged, setShowOnlyUnacknowledged] = useState(initialShowOnlyUnacknowledged);

  // Fetch email-related alerts
  const fetchEmailAlerts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const alerts: EmailAlert[] = [];

      // Fetch email delivery failures
      let failureQuery = supabase
        .from("email_tracking")
        .select(
          `
          id,
          request_id,
          email_type,
          recipient,
          subject,
          status,
          error_message,
          retry_count,
          fallback_notification_sent,
          created_at,
          last_updated_at,
          request:pld_sdv_requests (
            id,
            request_date,
            leave_type,
            member:members (
              first_name,
              last_name,
              pin_number,
              division_id
            )
          )
        `
        )
        .in("status", ["failed", "bounced", "complained"])
        .gte("retry_count", 3) // Only show alerts for emails that have failed multiple times
        .order("last_updated_at", { ascending: false })
        .limit(maxAlerts);

      const { data: failures, error: failuresError } = await failureQuery;
      if (failuresError) throw failuresError;

      // Get all unique division IDs from the failures to fetch division names
      const divisionIds = new Set<number>();
      failures?.forEach((failure: any) => {
        if (failure.request?.member?.division_id) {
          divisionIds.add(failure.request.member.division_id);
        }
      });

      // Fetch division names for all unique division IDs
      const divisionsMap = new Map<number, string>();
      if (divisionIds.size > 0) {
        const { data: divisionsData, error: divisionsError } = await supabase
          .from("divisions")
          .select("id, name")
          .in("id", Array.from(divisionIds));

        if (divisionsError) throw divisionsError;

        divisionsData?.forEach((division: any) => {
          divisionsMap.set(division.id, division.name);
        });
      }

      // Convert email failures to alerts
      failures?.forEach((failure: any) => {
        const divisionName = failure.request?.member?.division_id
          ? divisionsMap.get(failure.request.member.division_id)
          : undefined;

        // Filter by division if specified
        if (divisionFilter && divisionName !== divisionFilter) {
          return;
        }

        alerts.push({
          id: failure.id,
          type: "email_failure",
          severity: failure.retry_count >= 5 ? "high" : "medium",
          title: "Email Delivery Failed",
          message: `Failed to deliver ${failure.email_type} email to ${failure.recipient}. ${
            failure.error_message || "Unknown error"
          }`,
          requestId: failure.request_id,
          divisionId: failure.request?.member?.division_id,
          divisionName: divisionName,
          timestamp: failure.last_updated_at,
          acknowledged: failure.fallback_notification_sent,
          metadata: {
            emailType: failure.email_type,
            retryCount: failure.retry_count,
            recipient: failure.recipient,
            memberName: failure.request?.member
              ? `${failure.request.member.first_name} ${failure.request.member.last_name}`
              : "Unknown",
          },
        });
      });

      // Fetch recent email settings changes (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let auditQuery = supabase
        .from("division_email_audit_log")
        .select("*")
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(maxAlerts);

      if (divisionFilter) {
        const { data: divisionData } = await supabase
          .from("divisions")
          .select("id")
          .eq("name", divisionFilter)
          .single();

        if (divisionData) {
          auditQuery = auditQuery.eq("division_id", divisionData.id);
        }
      }

      const { data: auditLogs, error: auditError } = await auditQuery;
      if (auditError) throw auditError;

      // Get division names for audit logs
      const auditDivisionIds = new Set<number>();
      auditLogs?.forEach((log: any) => {
        if (log.division_id) {
          auditDivisionIds.add(log.division_id);
        }
      });

      const auditDivisionsMap = new Map<number, string>();
      if (auditDivisionIds.size > 0) {
        const { data: auditDivisionsData, error: auditDivisionsError } = await supabase
          .from("divisions")
          .select("id, name")
          .in("id", Array.from(auditDivisionIds));

        if (auditDivisionsError) throw auditDivisionsError;

        auditDivisionsData?.forEach((division: any) => {
          auditDivisionsMap.set(division.id, division.name);
        });
      }

      // Convert audit logs to alerts
      auditLogs?.forEach((log: any) => {
        const divisionName = log.division_id ? auditDivisionsMap.get(log.division_id) : undefined;

        alerts.push({
          id: log.id,
          type: "email_settings_change",
          severity: "low",
          title: "Email Settings Changed",
          message: `Email settings ${log.change_type}d for ${divisionName || "Unknown"} division`,
          divisionId: log.division_id,
          divisionName: divisionName,
          timestamp: log.created_at,
          acknowledged: log.acknowledged || false, // Use actual acknowledged status
          metadata: {
            changeType: log.change_type,
            adminId: log.admin_id,
            previousValue: log.previous_value,
            newValue: log.new_value,
          },
        });
      });

      // Sort alerts by timestamp (newest first)
      alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Filter acknowledged alerts if requested
      let filteredAlerts = alerts;
      if (showOnlyUnacknowledged) {
        filteredAlerts = alerts.filter((alert) => !alert.acknowledged);
      }

      setAlerts(filteredAlerts.slice(0, maxAlerts));
    } catch (err) {
      console.error("Error fetching email alerts:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch email alerts");
    } finally {
      setIsLoading(false);
    }
  };

  // Acknowledge an alert
  const acknowledgeAlert = async (alert: EmailAlert) => {
    if (!session?.user?.id) {
      Toast.show({
        type: "error",
        text1: "Authentication Required",
        text2: "You must be logged in to acknowledge alerts",
        position: "bottom",
      });
      return;
    }

    try {
      setIsAcknowledging(true);

      if (alert.type === "email_failure") {
        // Mark fallback notification as sent for email tracking
        await supabase.from("email_tracking").update({ fallback_notification_sent: true }).eq("id", alert.id);

        Toast.show({
          type: "success",
          text1: "Alert Acknowledged",
          text2: "Email failure has been acknowledged",
          position: "bottom",
        });
      } else if (alert.type === "email_settings_change") {
        // Mark audit log as acknowledged
        await supabase
          .from("division_email_audit_log")
          .update({
            acknowledged: true,
            acknowledged_by: session.user.id,
            acknowledged_at: new Date().toISOString(),
          })
          .eq("id", alert.id);

        Toast.show({
          type: "success",
          text1: "Change Acknowledged",
          text2: "Email settings change has been acknowledged",
          position: "bottom",
        });
      }

      // Refresh alerts
      await fetchEmailAlerts();
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      Toast.show({
        type: "error",
        text1: "Acknowledgment Failed",
        text2: "Failed to acknowledge the alert",
        position: "bottom",
      });
    } finally {
      setIsAcknowledging(false);
    }
  };

  // Acknowledge all alerts
  const acknowledgeAllAlerts = async () => {
    if (!session?.user?.id) {
      Toast.show({
        type: "error",
        text1: "Authentication Required",
        text2: "You must be logged in to acknowledge alerts",
        position: "bottom",
      });
      return;
    }

    const unacknowledgedAlerts = alerts.filter((alert) => !alert.acknowledged);

    if (unacknowledgedAlerts.length === 0) {
      Toast.show({
        type: "info",
        text1: "No Alerts",
        text2: "There are no unacknowledged alerts to acknowledge",
        position: "bottom",
      });
      return;
    }

    Alert.alert(
      "Acknowledge All Alerts",
      `Are you sure you want to acknowledge all ${unacknowledgedAlerts.length} unacknowledged alerts?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Acknowledge All",
          onPress: async () => {
            try {
              setIsAcknowledging(true);

              // Group alerts by type for batch processing
              const emailFailures = unacknowledgedAlerts.filter((alert) => alert.type === "email_failure");
              const settingsChanges = unacknowledgedAlerts.filter((alert) => alert.type === "email_settings_change");

              // Batch acknowledge email failures
              if (emailFailures.length > 0) {
                const failureIds = emailFailures.map((alert) => alert.id);
                await supabase.from("email_tracking").update({ fallback_notification_sent: true }).in("id", failureIds);
              }

              // Batch acknowledge settings changes
              if (settingsChanges.length > 0) {
                const settingsIds = settingsChanges.map((alert) => alert.id);
                await supabase
                  .from("division_email_audit_log")
                  .update({
                    acknowledged: true,
                    acknowledged_by: session.user.id,
                    acknowledged_at: new Date().toISOString(),
                  })
                  .in("id", settingsIds);
              }

              Toast.show({
                type: "success",
                text1: "All Alerts Acknowledged",
                text2: `Successfully acknowledged ${unacknowledgedAlerts.length} alerts`,
                position: "bottom",
              });

              // Refresh alerts
              await fetchEmailAlerts();
            } catch (error) {
              console.error("Error acknowledging all alerts:", error);
              Toast.show({
                type: "error",
                text1: "Bulk Acknowledgment Failed",
                text2: "Failed to acknowledge all alerts",
                position: "bottom",
              });
            } finally {
              setIsAcknowledging(false);
            }
          },
        },
      ]
    );
  };

  // Resend failed email
  const resendFailedEmail = async (alert: EmailAlert) => {
    if (!alert.requestId || alert.type !== "email_failure") return;

    try {
      setIsLoading(true);

      let functionName = "";
      switch (alert.metadata?.emailType) {
        case "request":
          functionName = "send-request-email";
          break;
        case "cancellation":
          functionName = "send-cancellation-email";
          break;
        default:
          Toast.show({
            type: "error",
            text1: "Cannot Resend",
            text2: "This email type cannot be resent manually",
            position: "bottom",
          });
          return;
      }

      const { error } = await supabase.functions.invoke(functionName, {
        body: { requestId: alert.requestId },
      });

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Email Resent",
        text2: "The email has been queued for delivery",
        position: "bottom",
      });

      // Refresh alerts
      await fetchEmailAlerts();
    } catch (error) {
      console.error("Error resending email:", error);
      Toast.show({
        type: "error",
        text1: "Resend Failed",
        text2: error instanceof Error ? error.message : "Failed to resend email",
        position: "bottom",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Clean up old acknowledged alerts (older than 30 days)
  const cleanupOldAlerts = async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Clean up old acknowledged email settings changes
      await supabase
        .from("division_email_audit_log")
        .delete()
        .eq("acknowledged", true)
        .lt("acknowledged_at", thirtyDaysAgo.toISOString());

      console.log("Old acknowledged email alerts cleaned up");
    } catch (error) {
      console.error("Error cleaning up old alerts:", error);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchEmailAlerts();

    // Clean up old alerts on mount (only for company admins to avoid multiple cleanup calls)
    if (!divisionFilter) {
      cleanupOldAlerts();
    }
  }, [divisionFilter, showOnlyUnacknowledged]);

  // Get alert icon
  const getAlertIcon = (alert: EmailAlert): keyof typeof Ionicons.glyphMap => {
    switch (alert.type) {
      case "email_failure":
        return "mail-unread";
      case "email_settings_change":
        return "settings";
      case "delivery_status":
        return "checkmark-circle";
      default:
        return "alert-circle";
    }
  };

  // Get alert color
  const getAlertColor = (alert: EmailAlert): string => {
    switch (alert.severity) {
      case "high":
        return Colors.light.error;
      case "medium":
        return Colors.light.warning || "#f59e0b";
      case "low":
        return Colors[colorScheme].tint;
      default:
        return Colors[colorScheme].text;
    }
  };

  if (isLoading && alerts.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
        <ThemedText style={styles.loadingText}>Loading email alerts...</ThemedText>
      </ThemedView>
    );
  }

  const displayedAlerts = showAll ? alerts : alerts.slice(0, 3);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="mail-outline" size={20} color={Colors[colorScheme].tint} />
          <ThemedText style={styles.title}>Email System Alerts</ThemedText>
          {alerts.length > 0 && (
            <View style={[styles.badge, { backgroundColor: Colors.light.error }]}>
              <ThemedText style={styles.badgeText}>{alerts.length}</ThemedText>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {/* Toggle for showing all vs unacknowledged */}
          <TouchableOpacityComponent
            style={[styles.toggleButton, { borderColor: Colors[colorScheme].tint }]}
            onPress={() => setShowOnlyUnacknowledged(!showOnlyUnacknowledged)}
          >
            <Ionicons name={showOnlyUnacknowledged ? "eye-off" : "eye"} size={16} color={Colors[colorScheme].tint} />
            <ThemedText style={[styles.toggleText, { color: Colors[colorScheme].tint }]}>
              {showOnlyUnacknowledged ? "Show All" : "Hide Ack'd"}
            </ThemedText>
          </TouchableOpacityComponent>

          {/* Acknowledge All Button */}
          {alerts.filter((alert) => !alert.acknowledged).length > 0 && (
            <TouchableOpacityComponent
              style={[styles.acknowledgeAllButton, { borderColor: Colors[colorScheme].tint }]}
              onPress={acknowledgeAllAlerts}
              disabled={isAcknowledging}
            >
              {isAcknowledging ? (
                <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
              ) : (
                <Ionicons name="checkmark-done" size={16} color={Colors[colorScheme].tint} />
              )}
              <ThemedText style={[styles.acknowledgeAllText, { color: Colors[colorScheme].tint }]}>
                {isAcknowledging ? "Processing..." : "Acknowledge All"}
              </ThemedText>
            </TouchableOpacityComponent>
          )}
          <TouchableOpacityComponent style={styles.refreshButton} onPress={fetchEmailAlerts}>
            <Ionicons name="refresh" size={20} color={Colors[colorScheme].tint} />
          </TouchableOpacityComponent>
        </View>
      </View>

      {/* Error State */}
      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacityComponent style={styles.retryButton} onPress={fetchEmailAlerts}>
            <ThemedText style={[styles.retryButtonText, { color: Colors[colorScheme].tint }]}>Retry</ThemedText>
          </TouchableOpacityComponent>
        </ThemedView>
      )}

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <ThemedView style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={48} color={Colors[colorScheme].text + "40"} />
          <ThemedText style={styles.emptyText}>No email alerts</ThemedText>
          <ThemedText style={styles.emptySubtext}>All email systems are functioning normally</ThemedText>
        </ThemedView>
      ) : (
        <View style={styles.alertsList}>
          {displayedAlerts.map((alert) => (
            <AnimatedThemedView
              key={alert.id}
              style={[styles.alertCard, { borderLeftColor: getAlertColor(alert) }]}
              entering={FadeIn}
              exiting={FadeOut}
              layout={Layout.springify()}
            >
              <View style={styles.alertHeader}>
                <View style={styles.alertInfo}>
                  <Ionicons name={getAlertIcon(alert)} size={20} color={getAlertColor(alert)} />
                  <ThemedText style={styles.alertTitle}>{alert.title}</ThemedText>
                  <View style={[styles.severityBadge, { backgroundColor: getAlertColor(alert) + "20" }]}>
                    <ThemedText style={[styles.severityText, { color: getAlertColor(alert) }]}>
                      {alert.severity.toUpperCase()}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.alertTime}>{new Date(alert.timestamp).toLocaleString()}</ThemedText>
              </View>

              <ThemedText style={styles.alertMessage}>{alert.message}</ThemedText>

              {alert.divisionName && (
                <ThemedText style={styles.alertDivision}>Division: {alert.divisionName}</ThemedText>
              )}

              {/* Action Buttons */}
              <View style={styles.alertActions}>
                {alert.type === "email_failure" && !alert.acknowledged && (
                  <>
                    <TouchableOpacityComponent
                      style={[styles.actionButton, { borderColor: Colors[colorScheme].tint }]}
                      onPress={() => resendFailedEmail(alert)}
                    >
                      <Ionicons name="refresh" size={16} color={Colors[colorScheme].tint} />
                      <ThemedText style={[styles.actionButtonText, { color: Colors[colorScheme].tint }]}>
                        Resend
                      </ThemedText>
                    </TouchableOpacityComponent>
                    <TouchableOpacityComponent
                      style={[styles.actionButton, { borderColor: Colors.light.success }]}
                      onPress={() => acknowledgeAlert(alert)}
                      disabled={isAcknowledging}
                    >
                      <Ionicons name="checkmark" size={16} color={Colors.light.success} />
                      <ThemedText style={[styles.actionButtonText, { color: Colors.light.success }]}>
                        Acknowledge
                      </ThemedText>
                    </TouchableOpacityComponent>
                  </>
                )}
                {alert.type === "email_settings_change" && !alert.acknowledged && (
                  <TouchableOpacityComponent
                    style={[styles.actionButton, { borderColor: Colors.light.success }]}
                    onPress={() => acknowledgeAlert(alert)}
                    disabled={isAcknowledging}
                  >
                    <Ionicons name="checkmark" size={16} color={Colors.light.success} />
                    <ThemedText style={[styles.actionButtonText, { color: Colors.light.success }]}>
                      Acknowledge
                    </ThemedText>
                  </TouchableOpacityComponent>
                )}
              </View>
            </AnimatedThemedView>
          ))}

          {/* Show More Button */}
          {alerts.length > 3 && (
            <TouchableOpacityComponent style={styles.showMoreButton} onPress={() => setShowAll(!showAll)}>
              <ThemedText style={[styles.showMoreText, { color: Colors[colorScheme].tint }]}>
                {showAll ? "Show Less" : `Show ${alerts.length - 3} More`}
              </ThemedText>
              <Ionicons name={showAll ? "chevron-up" : "chevron-down"} size={16} color={Colors[colorScheme].tint} />
            </TouchableOpacityComponent>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "500",
  },
  acknowledgeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  acknowledgeAllText: {
    fontSize: 12,
    fontWeight: "500",
  },
  refreshButton: {
    padding: 8,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: Colors.light.error + "20",
    borderColor: Colors.light.error,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  errorText: {
    color: Colors.light.error,
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
  emptyContainer: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 16,
    opacity: 0.7,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.5,
    textAlign: "center",
    marginTop: 8,
  },
  alertsList: {
    // Removed maxHeight and flex: 1 to allow natural expansion
  },
  alertCard: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    backgroundColor: Colors.light.background,
  },
  alertHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  alertInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  alertTitle: {
    fontWeight: "600",
    fontSize: 16,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: "600",
  },
  alertTime: {
    fontSize: 12,
    opacity: 0.6,
  },
  alertMessage: {
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  alertDivision: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
    marginBottom: 12,
  },
  alertActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  showMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    marginTop: 8,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
