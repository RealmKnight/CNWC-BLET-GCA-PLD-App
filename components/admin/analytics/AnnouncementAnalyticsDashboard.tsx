import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  View,
  Alert,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
import { AnnouncementAnalyticsModal } from "@/components/modals/AnnouncementAnalyticsModal";
import { Select } from "@/components/ui/Select";
import type {
  AnnouncementsDashboardAnalytics,
  DetailedAnnouncementAnalytics,
  AnalyticsExportRequest,
} from "@/types/announcements";

interface AnnouncementAnalyticsDashboardProps {
  divisionContext?: string;
  onViewAnnouncementDetails?: (announcementId: string) => void;
  showExportOptions?: boolean;
}

interface DivisionOption {
  value: string;
  label: string;
}

export function AnnouncementAnalyticsDashboard({
  divisionContext,
  onViewAnnouncementDetails,
  showExportOptions = true,
}: AnnouncementAnalyticsDashboardProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Store selectors
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const announcements = useAnnouncementStore((state) => state.announcements);
  const getDashboardAnalytics = useAnnouncementStore((state) => state.getDashboardAnalytics);
  const getDetailedAnnouncementAnalytics = useAnnouncementStore((state) => state.getDetailedAnnouncementAnalytics);
  const getLowEngagementAnnouncements = useAnnouncementStore((state) => state.getLowEngagementAnnouncements);
  const exportAnalytics = useAnnouncementStore((state) => state.exportAnalytics);

  // User info
  const userRole = useUserStore((state) => state.userRole);
  const userDivision = useUserStore((state) => state.division);

  // Local state
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<
    | {
        start_date: string;
        end_date: string;
      }
    | undefined
  >();
  const [lowEngagementThreshold, setLowEngagementThreshold] = useState(50);
  const [lowEngagementDays, setLowEngagementDays] = useState(3);
  const [analytics, setAnalytics] = useState<AnnouncementsDashboardAnalytics | null>(null);
  const [selectedAnnouncementDetails, setSelectedAnnouncementDetails] = useState<DetailedAnnouncementAnalytics | null>(
    null
  );
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);

  // Union admin specific state
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<"gca" | "division" | "total">("gca");
  const [selectedDivisionForAnalytics, setSelectedDivisionForAnalytics] = useState<string>("");
  const [divisions, setDivisions] = useState<DivisionOption[]>([]);

  // Permission check
  const canViewAnalytics = useCallback(() => {
    if (userRole === "application_admin" || userRole === "union_admin") {
      return true; // Can view all analytics
    }
    if (userRole === "division_admin" && divisionContext === userDivision) {
      return true; // Can only view own division analytics
    }
    return false;
  }, [userRole, divisionContext, userDivision]);

  // Check if user is union admin (has access to multiple views)
  const isUnionAdmin = useCallback(() => {
    return userRole === "application_admin" || userRole === "union_admin";
  }, [userRole]);

  // Determine if this should show union admin tabs (no specific division context provided for union admin)
  const shouldShowUnionAdminTabs = useCallback(() => {
    return isUnionAdmin() && !divisionContext;
  }, [isUnionAdmin, divisionContext]);

  // Load divisions for division selector (union admin only)
  useEffect(() => {
    const loadDivisions = async () => {
      if (!shouldShowUnionAdminTabs()) return;

      try {
        const { supabase } = await import("@/utils/supabase");
        const { data, error } = await supabase.from("divisions").select("id, name").order("name");

        if (error) throw error;

        const divisionOptions: DivisionOption[] = data.map((div) => ({
          value: div.name,
          label: div.name,
        }));

        setDivisions(divisionOptions);

        // Set first division as default if none selected
        if (divisionOptions.length > 0 && !selectedDivisionForAnalytics) {
          setSelectedDivisionForAnalytics(divisionOptions[0].value);
        }
      } catch (error) {
        console.error("Error loading divisions:", error);
      }
    };

    loadDivisions();
  }, [shouldShowUnionAdminTabs, selectedDivisionForAnalytics]);

  // Determine the effective analytics context based on user role and selections
  const getEffectiveAnalyticsContext = useCallback(() => {
    if (!shouldShowUnionAdminTabs()) {
      // Division admin or union admin with specific division context: use the provided divisionContext
      return divisionContext;
    }

    // Union admin with tabs: use tab selection
    if (activeAnalyticsTab === "gca") {
      return "GCA";
    } else if (activeAnalyticsTab === "division") {
      return selectedDivisionForAnalytics;
    } else if (activeAnalyticsTab === "total") {
      return "total";
    }

    return divisionContext;
  }, [shouldShowUnionAdminTabs, activeAnalyticsTab, selectedDivisionForAnalytics, divisionContext]);

  // Load analytics data
  const loadAnalytics = useCallback(
    async (forceRefresh = false) => {
      if (!canViewAnalytics()) return;

      try {
        setRefreshing(true);
        const effectiveContext = getEffectiveAnalyticsContext();
        const data = await getDashboardAnalytics(effectiveContext, selectedDateRange, forceRefresh);
        setAnalytics(data);
      } catch (error) {
        console.error("Error loading analytics:", error);
        Alert.alert("Error", "Failed to load analytics data");
      } finally {
        setRefreshing(false);
      }
    },
    [canViewAnalytics, getDashboardAnalytics, getEffectiveAnalyticsContext, selectedDateRange]
  );

  // Initial load and reload when context changes
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Force refresh when tab or division selection changes
  useEffect(() => {
    loadAnalytics(true); // Force refresh for context changes
  }, [activeAnalyticsTab, selectedDivisionForAnalytics]);

  // Handle refresh
  const onRefresh = useCallback(() => {
    loadAnalytics(true);
  }, [loadAnalytics]);

  // Handle export
  const handleExport = useCallback(
    async (format: "csv" | "pdf") => {
      if (!analytics) return;

      try {
        const effectiveContext = getEffectiveAnalyticsContext();
        const exportRequest: AnalyticsExportRequest = {
          date_range: selectedDateRange,
          include_member_details: userRole === "application_admin" || userRole === "union_admin",
          format,
          division_filter:
            effectiveContext && effectiveContext !== "GCA" && effectiveContext !== "total"
              ? [effectiveContext]
              : undefined,
        };

        const result = await exportAnalytics(exportRequest);
        if (result) {
          Alert.alert("Export Complete", `Analytics exported successfully: ${result.filename}`);
        } else {
          Alert.alert("Export Feature", "Export functionality will be available soon");
        }
      } catch (error) {
        Alert.alert("Export Failed", "Failed to export analytics data");
      }
    },
    [analytics, selectedDateRange, userRole, getEffectiveAnalyticsContext, exportAnalytics]
  );

  // Handle view announcement details
  const handleViewAnnouncementDetails = useCallback(
    (announcementId: string) => {
      if (onViewAnnouncementDetails) {
        onViewAnnouncementDetails(announcementId);
      }
    },
    [onViewAnnouncementDetails]
  );

  // Handle view detailed analytics
  const handleViewDetailedAnalytics = useCallback(
    async (announcementId: string) => {
      try {
        const details = await getDetailedAnnouncementAnalytics(announcementId);

        if (details) {
          setSelectedAnnouncementDetails(details);
          setIsDetailsModalVisible(true);
        } else {
          Alert.alert("No Data", "No detailed analytics available for this announcement");
        }
      } catch (error) {
        console.error("Error loading detailed analytics:", error);
        Alert.alert(
          "Error",
          `Failed to load detailed analytics: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    [getDetailedAnnouncementAnalytics]
  );

  // Set date range presets
  const setDateRangePreset = (preset: "7d" | "30d" | "90d" | "all") => {
    const now = new Date();
    let startDate: Date;

    switch (preset) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "all":
        setSelectedDateRange(undefined);
        return;
    }

    setSelectedDateRange({
      start_date: startDate.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    });
  };

  // Render analytics tabs for union admin
  const renderAnalyticsTabs = () => {
    if (!shouldShowUnionAdminTabs()) return null;

    return (
      <View style={styles.analyticsTabContainer}>
        <TouchableOpacity
          style={[
            styles.analyticsTab,
            activeAnalyticsTab === "gca" && styles.activeAnalyticsTab,
            { borderColor: Colors[colorScheme].border },
          ]}
          onPress={() => setActiveAnalyticsTab("gca")}
        >
          <Ionicons
            name="business"
            size={16}
            color={activeAnalyticsTab === "gca" ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText
            style={[styles.analyticsTabText, activeAnalyticsTab === "gca" && { color: Colors[colorScheme].background }]}
          >
            GCA Only
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.analyticsTab,
            activeAnalyticsTab === "division" && styles.activeAnalyticsTab,
            { borderColor: Colors[colorScheme].border },
          ]}
          onPress={() => setActiveAnalyticsTab("division")}
        >
          <Ionicons
            name="people"
            size={16}
            color={activeAnalyticsTab === "division" ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText
            style={[
              styles.analyticsTabText,
              activeAnalyticsTab === "division" && { color: Colors[colorScheme].background },
            ]}
          >
            Division
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.analyticsTab,
            activeAnalyticsTab === "total" && styles.activeAnalyticsTab,
            { borderColor: Colors[colorScheme].border },
          ]}
          onPress={() => setActiveAnalyticsTab("total")}
        >
          <Ionicons
            name="analytics"
            size={16}
            color={activeAnalyticsTab === "total" ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText
            style={[
              styles.analyticsTabText,
              activeAnalyticsTab === "total" && { color: Colors[colorScheme].background },
            ]}
          >
            Total
          </ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  // Render division selector for division analytics tab
  const renderDivisionSelector = () => {
    if (!shouldShowUnionAdminTabs() || activeAnalyticsTab !== "division" || divisions.length === 0) return null;

    return (
      <View style={styles.divisionSelectorContainer}>
        <ThemedText style={styles.divisionSelectorLabel}>Select Division:</ThemedText>
        <Select
          value={selectedDivisionForAnalytics}
          onValueChange={(value) => setSelectedDivisionForAnalytics(value as string)}
          options={divisions}
          placeholder="Select a division"
          style={styles.divisionSelectorSelect}
        />
      </View>
    );
  };

  // Get analytics context title
  const getAnalyticsTitle = () => {
    if (!shouldShowUnionAdminTabs()) {
      return divisionContext && divisionContext !== "GCA" ? `${divisionContext} Analytics` : "Division Analytics";
    }

    switch (activeAnalyticsTab) {
      case "gca":
        return "GCA Announcements Analytics";
      case "division":
        return selectedDivisionForAnalytics
          ? `${selectedDivisionForAnalytics} Division Analytics`
          : "Division Analytics";
      case "total":
        return "Total Announcements Analytics";
      default:
        return "Announcements Analytics";
    }
  };

  // Render header with controls
  const renderHeader = () => (
    <ThemedView style={styles.header}>
      <View style={styles.headerTop}>
        <ThemedText type="subtitle">{getAnalyticsTitle()}</ThemedText>
        {showExportOptions && (
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={[styles.exportButton, { borderColor: Colors[colorScheme].border }]}
              onPress={() => handleExport("csv")}
            >
              <Ionicons name="document-text" size={16} color={Colors[colorScheme].text} />
              <ThemedText style={styles.exportButtonText}>CSV</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportButton, { borderColor: Colors[colorScheme].border }]}
              onPress={() => handleExport("pdf")}
            >
              <Ionicons name="document" size={16} color={Colors[colorScheme].text} />
              <ThemedText style={styles.exportButtonText}>PDF</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Analytics Tabs for Union Admin */}
      {renderAnalyticsTabs()}

      {/* Division Selector for Division Tab */}
      {renderDivisionSelector()}

      {/* Date Range Filters */}
      <View style={styles.filterSection}>
        <ThemedText style={styles.filterLabel}>Time Period:</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {[
            { key: "7d", label: "Last 7 Days" },
            { key: "30d", label: "Last 30 Days" },
            { key: "90d", label: "Last 90 Days" },
            { key: "all", label: "All Time" },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterButton,
                {
                  backgroundColor:
                    (filter.key === "all" && !selectedDateRange) || (filter.key !== "all" && selectedDateRange)
                      ? Colors[colorScheme].tint
                      : "transparent",
                  borderColor: Colors[colorScheme].border,
                },
              ]}
              onPress={() => setDateRangePreset(filter.key as any)}
            >
              <ThemedText
                style={[
                  styles.filterButtonText,
                  {
                    color:
                      (filter.key === "all" && !selectedDateRange) || (filter.key !== "all" && selectedDateRange)
                        ? Colors[colorScheme].background
                        : Colors[colorScheme].text,
                  },
                ]}
              >
                {filter.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {analytics && (
        <ThemedText style={styles.lastUpdated}>
          Last updated: {new Date(analytics.last_updated).toLocaleString()}
        </ThemedText>
      )}
    </ThemedView>
  );

  // Render overview metrics
  const renderOverviewMetrics = () => {
    if (!analytics) return null;

    return (
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Overview
        </ThemedText>
        <View style={[styles.metricsGrid, { flexDirection: isMobile ? "column" : "row" }]}>
          <View style={[styles.metricCard, { backgroundColor: Colors[colorScheme].background }]}>
            <View style={styles.metricHeader}>
              <Ionicons name="megaphone" size={24} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.metricValue}>{analytics.total_announcements}</ThemedText>
            </View>
            <ThemedText style={styles.metricLabel}>Total Announcements</ThemedText>
            <ThemedText style={styles.metricSubtext}>
              {analytics.active_announcements} active, {analytics.expired_announcements} expired
            </ThemedText>
          </View>

          <View style={[styles.metricCard, { backgroundColor: Colors[colorScheme].background }]}>
            <View style={styles.metricHeader}>
              <Ionicons name="eye" size={24} color="#34C759" />
              <ThemedText style={styles.metricValue}>{analytics.overall_read_rate}%</ThemedText>
            </View>
            <ThemedText style={styles.metricLabel}>Overall Read Rate</ThemedText>
            <ThemedText style={styles.metricSubtext}>{analytics.recent_average_read_rate}% recent average</ThemedText>
          </View>

          <View style={[styles.metricCard, { backgroundColor: Colors[colorScheme].background }]}>
            <View style={styles.metricHeader}>
              <Ionicons name="checkmark-circle" size={24} color="#FF9500" />
              <ThemedText style={styles.metricValue}>{analytics.overall_acknowledgment_rate}%</ThemedText>
            </View>
            <ThemedText style={styles.metricLabel}>Acknowledgment Rate</ThemedText>
            <ThemedText style={styles.metricSubtext}>
              {analytics.require_acknowledgment_count} require acknowledgment
            </ThemedText>
          </View>

          <View style={[styles.metricCard, { backgroundColor: Colors[colorScheme].background }]}>
            <View style={styles.metricHeader}>
              <Ionicons name="time" size={24} color="#007AFF" />
              <ThemedText style={styles.metricValue}>{analytics.recent_announcements}</ThemedText>
            </View>
            <ThemedText style={styles.metricLabel}>Recent (30 days)</ThemedText>
            <ThemedText style={styles.metricSubtext}>New announcements</ThemedText>
          </View>
        </View>
      </ThemedView>
    );
  };

  // Render individual announcement analytics
  const renderIndividualAnnouncementAnalytics = () => {
    const currentAnnouncements = getCurrentAnnouncements();

    if (currentAnnouncements.length === 0) {
      return (
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Individual Announcement Analytics
          </ThemedText>
          <View style={styles.emptyAnnouncementsContainer}>
            <Ionicons name="megaphone-outline" size={48} color={Colors[colorScheme].text} style={styles.emptyIcon} />
            <ThemedText style={styles.emptyText}>No announcements to analyze</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Create announcements to see their individual analytics here
            </ThemedText>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Individual Announcement Analytics
        </ThemedText>
        <ThemedText style={styles.sectionSubtitle}>
          {currentAnnouncements.length} announcement{currentAnnouncements.length !== 1 ? "s" : ""} in current context
        </ThemedText>

        {currentAnnouncements.map((announcement) => {
          // Calculate basic metrics from the announcement data
          const readCount = announcement.read_by?.length || 0;
          const acknowledgedCount = announcement.acknowledged_by?.length || 0;

          // Calculate days since created
          const daysSinceCreated = Math.floor(
            (new Date().getTime() - new Date(announcement.created_at).getTime()) / (1000 * 60 * 60 * 24)
          );

          // Determine status
          const isExpired = announcement.end_date && new Date(announcement.end_date) < new Date();
          const isActive = announcement.is_active && !isExpired;

          return (
            <View key={announcement.id} style={styles.announcementAnalyticsCard}>
              <View style={styles.announcementHeader}>
                <View style={styles.announcementInfo}>
                  <ThemedText style={styles.announcementTitle} numberOfLines={1}>
                    {announcement.title}
                  </ThemedText>
                  <View style={styles.announcementMeta}>
                    <Ionicons
                      name={announcement.target_type === "GCA" ? "business" : "people"}
                      size={12}
                      color={Colors[colorScheme].text}
                    />
                    <ThemedText style={styles.announcementMetaText}>
                      {announcement.target_type === "GCA" ? "GCA" : "Division"}
                    </ThemedText>
                    {announcement.require_acknowledgment && (
                      <>
                        <Ionicons name="checkmark-circle" size={12} color={Colors[colorScheme].text} />
                        <ThemedText style={styles.announcementMetaText}>Requires Ack</ThemedText>
                      </>
                    )}
                    <ThemedText style={styles.announcementMetaText}>
                      {daysSinceCreated} day{daysSinceCreated !== 1 ? "s" : ""} ago
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.announcementStatus}>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: isActive
                          ? Colors[colorScheme].tint + "20"
                          : isExpired
                          ? Colors[colorScheme].error + "20"
                          : Colors[colorScheme].text + "20",
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.statusText,
                        {
                          color: isActive
                            ? Colors[colorScheme].tint
                            : isExpired
                            ? Colors[colorScheme].error
                            : Colors[colorScheme].text,
                        },
                      ]}
                    >
                      {isActive ? "Active" : isExpired ? "Expired" : "Inactive"}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.announcementMetrics}>
                <View style={styles.metricItem}>
                  <ThemedText style={styles.metricItemValue}>{readCount}</ThemedText>
                  <ThemedText style={styles.metricItemLabel}>Reads</ThemedText>
                </View>

                {announcement.require_acknowledgment && (
                  <View style={styles.metricItem}>
                    <ThemedText style={styles.metricItemValue}>{acknowledgedCount}</ThemedText>
                    <ThemedText style={styles.metricItemLabel}>Acknowledged</ThemedText>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => handleViewDetailedAnalytics(announcement.id)}
                >
                  <Ionicons name="analytics" size={16} color={Colors[colorScheme].tint} />
                  <ThemedText style={[styles.detailsButtonText, { color: Colors[colorScheme].tint }]}>
                    View Details
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ThemedView>
    );
  };

  // Render division breakdown (for union admins)
  const renderDivisionBreakdown = () => {
    if (!analytics || !analytics.division_summaries) return null;

    // Only show division breakdown for union admin total view or non-union admin with division summaries
    if (isUnionAdmin() && activeAnalyticsTab !== "total") return null;

    return (
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Division Breakdown
        </ThemedText>
        {analytics.division_summaries.map((division) => (
          <View key={division.division_id} style={styles.divisionCard}>
            <View style={styles.divisionHeader}>
              <ThemedText style={styles.divisionName}>{division.division_name}</ThemedText>
              <View style={styles.divisionMetrics}>
                <View style={styles.divisionMetric}>
                  <ThemedText style={styles.divisionMetricValue}>{division.read_percentage}%</ThemedText>
                  <ThemedText style={styles.divisionMetricLabel}>Read</ThemedText>
                </View>
                <View style={styles.divisionMetric}>
                  <ThemedText style={styles.divisionMetricValue}>{division.acknowledged_percentage}%</ThemedText>
                  <ThemedText style={styles.divisionMetricLabel}>Ack</ThemedText>
                </View>
              </View>
            </View>
            <ThemedText style={styles.divisionSubtext}>
              {division.member_count} members • {division.read_count} reads • {division.acknowledged_count}{" "}
              acknowledgments
            </ThemedText>
          </View>
        ))}
      </ThemedView>
    );
  };

  // Render low engagement alerts
  const renderLowEngagementAlerts = () => {
    if (!analytics || analytics.low_engagement_announcements.length === 0) return null;

    return (
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Low Engagement Alerts
        </ThemedText>
        <ThemedText style={styles.sectionSubtitle}>
          Announcements with less than {lowEngagementThreshold}% read rate after {lowEngagementDays} days
        </ThemedText>
        {analytics.low_engagement_announcements.map((announcement) => (
          <TouchableOpacity
            key={announcement.announcement_id}
            style={styles.alertCard}
            onPress={() => handleViewAnnouncementDetails(announcement.announcement_id)}
          >
            <View style={styles.alertHeader}>
              <Ionicons name="warning" size={20} color={Colors[colorScheme].error} />
              <ThemedText style={styles.alertTitle} numberOfLines={1}>
                {announcement.title}
              </ThemedText>
            </View>
            <View style={styles.alertMetrics}>
              <ThemedText style={[styles.alertMetric, { color: Colors[colorScheme].error }]}>
                {announcement.read_percentage}% read
              </ThemedText>
              <ThemedText style={styles.alertMetric}>{announcement.days_since_created} days old</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  // Get current announcements based on context
  const getCurrentAnnouncements = useCallback(() => {
    const effectiveContext = getEffectiveAnalyticsContext();

    if (!effectiveContext) {
      return [];
    }

    if (effectiveContext === "total") {
      // For total view, combine all announcements
      return Object.values(announcements).flat();
    } else if (effectiveContext === "GCA") {
      // For GCA view, get GCA announcements
      return announcements["GCA"] || [];
    } else {
      // For specific division, get that division's announcements
      return announcements[effectiveContext] || [];
    }
  }, [announcements, getEffectiveAnalyticsContext]);

  // Show permission error if user can't view analytics
  if (!canViewAnalytics()) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors[colorScheme].error} />
          <ThemedText style={[styles.errorText, { color: Colors[colorScheme].error }]}>
            You don't have permission to view analytics for this context.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  if (isLoading && !analytics) {
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.loadingContainer}>
          <Ionicons name="analytics" size={48} color={Colors[colorScheme].text} style={styles.loadingIcon} />
          <ThemedText>Loading analytics...</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderHeader()}
      <ScrollView
        style={styles.scrollContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {renderOverviewMetrics()}
        {renderIndividualAnnouncementAnalytics()}
        {renderDivisionBreakdown()}
        {renderLowEngagementAlerts()}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Detailed Analytics Modal */}
      <AnnouncementAnalyticsModal
        analytics={selectedAnnouncementDetails}
        visible={isDetailsModalVisible}
        onClose={() => {
          setIsDetailsModalVisible(false);
          setSelectedAnnouncementDetails(null);
        }}
        onExport={handleExport}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  exportButtons: {
    flexDirection: "row",
    gap: 8,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: "row",
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  lastUpdated: {
    fontSize: 12,
    opacity: 0.7,
    fontStyle: "italic",
  },
  scrollContainer: {
    flex: 1,
  },
  section: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.dark.card,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
  },
  metricsGrid: {
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  metricSubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  divisionCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 8,
  },
  divisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  divisionName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  divisionMetrics: {
    flexDirection: "row",
    gap: 16,
  },
  divisionMetric: {
    alignItems: "center",
  },
  divisionMetricValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  divisionMetricLabel: {
    fontSize: 10,
    opacity: 0.7,
  },
  divisionSubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  alertCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(231, 76, 60, 0.1)",
    marginBottom: 8,
  },
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  alertMetrics: {
    flexDirection: "row",
    gap: 16,
  },
  alertMetric: {
    fontSize: 12,
    fontWeight: "500",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingIcon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  bottomPadding: {
    height: 32,
  },
  analyticsTabContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  analyticsTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    gap: 4,
  },
  activeAnalyticsTab: {
    backgroundColor: Colors.dark.tint,
  },
  analyticsTabText: {
    fontSize: 12,
    fontWeight: "500",
  },
  divisionSelectorContainer: {
    marginBottom: 12,
  },
  divisionSelectorLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  divisionSelectorSelect: {
    height: 40,
  },
  announcementAnalyticsCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 8,
  },
  announcementHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  announcementInfo: {
    flex: 1,
    marginRight: 8,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 4,
  },
  announcementMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  announcementMetaText: {
    fontSize: 12,
    opacity: 0.7,
  },
  announcementStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  announcementMetrics: {
    flexDirection: "row",
    gap: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricItemValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  metricItemLabel: {
    fontSize: 10,
    opacity: 0.7,
  },
  detailsButton: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  detailsButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyAnnouncementsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 12,
    textAlign: "center",
    opacity: 0.7,
  },
});
