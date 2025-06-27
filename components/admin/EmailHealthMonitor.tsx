import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, Alert, Platform } from "react-native";
import { ThemedView } from "../ThemedView";
import { ThemedText } from "../ThemedText";
import { ThemedScrollView } from "../ThemedScrollView";
import { ThemedTouchableOpacity } from "../ThemedTouchableOpacity";
import { Collapsible } from "../Collapsible";
import { supabase } from "../../utils/supabase";
import { useThemeColor } from "../../hooks/useThemeColor";
import Toast from "react-native-toast-message";
import { Colors } from "@/constants/Colors";

interface EmailHealthStatus {
  healthy: boolean;
  recent_failures: number;
  stuck_attempts: number;
  average_response_time_ms: number;
  success_rate_percent: number;
  total_attempts: number;
  last_successful_email: string | null;
  issues: string[];
  checked_at: string;
}

interface EmailHealthHistory {
  id: number;
  checked_at: string;
  healthy: boolean;
  recent_failures: number;
  stuck_attempts: number;
  average_execution_time_ms: number | null;
  issues: string[];
}

interface EmailHealthTrends {
  current_health: EmailHealthStatus;
  health_history: EmailHealthHistory[];
  recent_issues: string[];
  analysis_period_hours: number;
  generated_at: string;
}

export function EmailHealthMonitor() {
  const [healthData, setHealthData] = useState<EmailHealthTrends | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const cardBackgroundColor = useThemeColor({}, "background");
  const successColor = "#28a745";
  const warningColor = "#ffc107";
  const errorColor = "#dc3545";
  const primaryColor = useThemeColor({}, "tint");

  const fetchHealthData = async () => {
    try {
      const { data, error } = await supabase.rpc("get_email_health_trends", { hours_back: 24 });

      if (error) {
        console.error("Error fetching email health data:", error);
        Toast.show({
          type: "error",
          text1: "Health Check Failed",
          text2: "Unable to fetch email health data",
        });
        return;
      }

      setHealthData(data);
    } catch (error) {
      console.error("Error in fetchHealthData:", error);
      Toast.show({
        type: "error",
        text1: "Health Check Failed",
        text2: "Network error occurred",
      });
    }
  };

  const runManualHealthCheck = async () => {
    try {
      setIsLoading(true);

      const { error } = await supabase.rpc("run_email_health_check");

      if (error) {
        console.error("Error running manual health check:", error);
        Toast.show({
          type: "error",
          text1: "Manual Check Failed",
          text2: "Unable to run health check",
        });
        return;
      }

      await fetchHealthData();

      Toast.show({
        type: "success",
        text1: "Health Check Complete",
        text2: "Email system health updated",
      });
    } catch (error) {
      console.error("Error in runManualHealthCheck:", error);
      Toast.show({
        type: "error",
        text1: "Manual Check Failed",
        text2: "Network error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchHealthData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchHealthData().finally(() => setIsLoading(false));
  }, []);

  const getHealthStatusColor = (healthy: boolean, failures: number) => {
    if (!healthy) return errorColor;
    if (failures > 2) return warningColor;
    return successColor;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "N/A";
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.loadingText}>Loading email health data...</ThemedText>
      </ThemedView>
    );
  }

  if (!healthData) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Unable to load health data</ThemedText>
        <ThemedTouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            setIsLoading(true);
            fetchHealthData().finally(() => setIsLoading(false));
          }}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </ThemedTouchableOpacity>
      </ThemedView>
    );
  }

  const currentHealth = healthData.current_health;
  const healthStatusColor = getHealthStatusColor(currentHealth.healthy, currentHealth.recent_failures);

  return (
    <ThemedScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Email System Health</ThemedText>
        <ThemedTouchableOpacity
          style={[styles.manualCheckButton, { backgroundColor: primaryColor }]}
          onPress={runManualHealthCheck}
          disabled={isLoading}
        >
          <ThemedText style={styles.manualCheckButtonText}>{isLoading ? "Checking..." : "Run Check"}</ThemedText>
        </ThemedTouchableOpacity>
      </View>

      {/* Current Health Status */}
      <ThemedView style={[styles.healthCard, { backgroundColor: cardBackgroundColor }]}>
        <View style={styles.healthHeader}>
          <View style={[styles.healthIndicator, { backgroundColor: healthStatusColor }]} />
          <ThemedText style={styles.healthTitle}>
            {currentHealth.healthy ? "System Healthy" : "Issues Detected"}
          </ThemedText>
        </View>

        <View style={styles.healthStats}>
          <View style={styles.statRow}>
            <ThemedText style={styles.statLabel}>Success Rate:</ThemedText>
            <ThemedText style={[styles.statValue, { color: healthStatusColor }]}>
              {currentHealth.success_rate_percent}%
            </ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText style={styles.statLabel}>Recent Failures:</ThemedText>
            <ThemedText
              style={[styles.statValue, { color: currentHealth.recent_failures > 0 ? errorColor : successColor }]}
            >
              {currentHealth.recent_failures}
            </ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText style={styles.statLabel}>Total Attempts:</ThemedText>
            <ThemedText style={styles.statValue}>{currentHealth.total_attempts}</ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText style={styles.statLabel}>Avg Response Time:</ThemedText>
            <ThemedText style={styles.statValue}>{formatDuration(currentHealth.average_response_time_ms)}</ThemedText>
          </View>

          <View style={styles.statRow}>
            <ThemedText style={styles.statLabel}>Last Check:</ThemedText>
            <ThemedText style={styles.statValue}>{formatTimestamp(currentHealth.checked_at)}</ThemedText>
          </View>
        </View>
      </ThemedView>

      {/* Current Issues */}
      {currentHealth.issues.length > 0 && (
        <Collapsible title={`Current Issues (${currentHealth.issues.length})`}>
          <ThemedView style={[styles.issuesCard, { backgroundColor: cardBackgroundColor }]}>
            {currentHealth.issues.map((issue, index) => (
              <View key={index} style={styles.issueItem}>
                <Text style={[styles.issueText, { color: errorColor }]}>⚠️ {issue}</Text>
              </View>
            ))}
          </ThemedView>
        </Collapsible>
      )}

      {/* Recent Issues */}
      {healthData.recent_issues.length > 0 && (
        <Collapsible title={`Recent Issues (Last 6 Hours)`}>
          <ThemedView style={[styles.issuesCard, { backgroundColor: cardBackgroundColor }]}>
            {healthData.recent_issues.map((issue, index) => (
              <View key={index} style={styles.issueItem}>
                <Text style={[styles.issueText, { color: warningColor }]}>⚠️ {issue}</Text>
              </View>
            ))}
          </ThemedView>
        </Collapsible>
      )}

      {/* Health History */}
      <Collapsible title={`Health History (Last ${healthData.analysis_period_hours} Hours)`}>
        <ThemedView style={[styles.historyCard, { backgroundColor: cardBackgroundColor }]}>
          {healthData.health_history.length === 0 ? (
            <ThemedText style={styles.noDataText}>No health history available</ThemedText>
          ) : (
            healthData.health_history.slice(0, 10).map((record) => (
              <View key={record.id} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <View
                    style={[
                      styles.historyIndicator,
                      { backgroundColor: getHealthStatusColor(record.healthy, record.recent_failures) },
                    ]}
                  />
                  <ThemedText style={styles.historyTime}>{formatTimestamp(record.checked_at)}</ThemedText>
                </View>

                <View style={styles.historyDetails}>
                  <Text style={[styles.historyText, { color: textColor }]}>
                    Failures: {record.recent_failures} | Stuck: {record.stuck_attempts} | Response:{" "}
                    {formatDuration(record.average_execution_time_ms)}
                  </Text>

                  {record.issues.length > 0 && (
                    <Text style={[styles.historyIssues, { color: warningColor }]}>
                      Issues: {record.issues.join(", ")}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </ThemedView>
      </Collapsible>

      {/* Analysis Info */}
      <ThemedView style={[styles.infoCard, { backgroundColor: cardBackgroundColor }]}>
        <ThemedText style={styles.infoTitle}>Analysis Period</ThemedText>
        <ThemedText style={styles.infoText}>
          Showing data from the last {healthData.analysis_period_hours} hours
        </ThemedText>
        <ThemedText style={styles.infoText}>Report generated: {formatTimestamp(healthData.generated_at)}</ThemedText>
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  loadingText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
  },
  errorText: {
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
    color: "#dc3545",
  },
  retryButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    alignSelf: "center",
  },
  retryButtonText: {
    color: "white",
    fontWeight: "bold",
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
  manualCheckButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  manualCheckButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "bold",
  },
  healthCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      },
    }),
  },
  healthHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  healthIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  healthTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  healthStats: {
    gap: 8,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 14,
    opacity: 0.8,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  issuesCard: {
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  issueItem: {
    marginBottom: 8,
  },
  issueText: {
    fontSize: 14,
  },
  historyCard: {
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  noDataText: {
    textAlign: "center",
    opacity: 0.6,
    fontStyle: "italic",
  },
  historyItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  historyIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  historyTime: {
    fontSize: 12,
    fontWeight: "bold",
  },
  historyDetails: {
    marginLeft: 16,
  },
  historyText: {
    fontSize: 12,
    opacity: 0.8,
  },
  historyIssues: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: "italic",
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 4,
  },
});
