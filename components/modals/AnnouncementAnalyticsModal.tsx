import React, { useState, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  View,
  useWindowDimensions,
  Platform,
  FlatList,
  TextInput,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO } from "date-fns";
import type { DetailedAnnouncementAnalytics, MemberReadStatus } from "@/types/announcements";

type ColorScheme = keyof typeof Colors;

interface AnnouncementAnalyticsModalProps {
  analytics: DetailedAnnouncementAnalytics | null;
  visible: boolean;
  onClose: () => void;
  onExport?: (format: "csv" | "pdf") => void;
}

export function AnnouncementAnalyticsModal({ analytics, visible, onClose, onExport }: AnnouncementAnalyticsModalProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<"overview" | "members" | "divisions">("overview");

  // Performance optimization state
  const [isLargeDataset, setIsLargeDataset] = useState(false);
  const [showSearchForLarge, setShowSearchForLarge] = useState(false);
  const [readSearchTerm, setReadSearchTerm] = useState("");
  const [unreadSearchTerm, setUnreadSearchTerm] = useState("");

  // Performance monitoring
  const [performanceMetrics, setPerformanceMetrics] = useState({
    renderTime: 0,
    memberCount: 0,
    showWarning: false,
  });

  // Update performance states when analytics changes
  useEffect(() => {
    if (analytics) {
      const totalMembers = analytics.total_eligible_members;
      setIsLargeDataset(totalMembers > 100);
      setShowSearchForLarge(totalMembers > 20);
    }
  }, [analytics]);

  // Monitor performance for large datasets
  useEffect(() => {
    if (!analytics) return;

    const startTime = performance.now();
    const memberCount = (analytics.members_who_read?.length || 0) + (analytics.members_who_not_read?.length || 0);

    // Show warning for large datasets (>500 members)
    const showWarning = memberCount > 500;

    // Simulate render completion timing
    const timer = setTimeout(() => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      setPerformanceMetrics({
        renderTime,
        memberCount,
        showWarning,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [analytics]);

  if (!analytics) return null;

  // Calculate additional metrics
  const daysSinceCreated = Math.floor(
    (new Date().getTime() - new Date(analytics.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const isExpired = analytics.end_date && new Date(analytics.end_date) < new Date();
  const isActive = analytics.is_active && !isExpired;

  // Filter members for search
  const filteredReadMembers = analytics.members_who_read.filter((member) =>
    `${member.first_name} ${member.last_name} ${member.pin}`.toLowerCase().includes(readSearchTerm.toLowerCase())
  );
  const filteredUnreadMembers = analytics.members_who_not_read.filter((member) =>
    `${member.first_name} ${member.last_name} ${member.pin}`.toLowerCase().includes(unreadSearchTerm.toLowerCase())
  );

  // Render performance warning for very large datasets
  const renderPerformanceWarning = () => {
    if (!performanceMetrics.showWarning) return null;

    return (
      <ThemedView style={[styles.performanceWarning, { backgroundColor: Colors[theme].warning + "20" }]}>
        <Ionicons name="warning" size={16} color={Colors[theme].warning} />
        <ThemedText style={[styles.performanceWarningText, { color: Colors[theme].warning }]}>
          Large dataset ({performanceMetrics.memberCount} members). Performance may be affected.
        </ThemedText>
      </ThemedView>
    );
  };

  // Render header with announcement info
  const renderHeader = () => (
    <ThemedView style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor:
                  analytics.target_type === "GCA"
                    ? Colors[theme].announcementBadgeGCA + "20"
                    : Colors[theme].announcementBadgeDivision + "20",
              },
            ]}
          >
            <Ionicons
              name="analytics"
              size={24}
              color={
                analytics.target_type === "GCA"
                  ? Colors[theme].announcementBadgeGCA
                  : Colors[theme].announcementBadgeDivision
              }
            />
          </View>
          <View style={styles.headerInfo}>
            <ThemedText style={styles.announcementTitle} numberOfLines={2}>
              {analytics.title}
            </ThemedText>
            <View style={styles.metadata}>
              <View style={styles.metadataItem}>
                <Ionicons
                  name={analytics.target_type === "GCA" ? "business" : "people"}
                  size={14}
                  color={Colors[theme].text}
                />
                <ThemedText style={styles.metadataText}>
                  {analytics.target_type === "GCA" ? "GCA" : "Division"}
                </ThemedText>
              </View>
              {analytics.require_acknowledgment && (
                <View style={styles.metadataItem}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors[theme].text} />
                  <ThemedText style={styles.metadataText}>Requires Ack</ThemedText>
                </View>
              )}
              <View style={styles.metadataItem}>
                <Ionicons name="time" size={14} color={Colors[theme].text} />
                <ThemedText style={styles.metadataText}>{daysSinceCreated} days ago</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.authorInfo}>
              By {analytics.author_name} • {format(parseISO(analytics.created_at), "MMM d, yyyy h:mm a")}
            </ThemedText>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isActive
                  ? Colors[theme].tint + "20"
                  : isExpired
                  ? Colors[theme].error + "20"
                  : Colors[theme].text + "20",
              },
            ]}
          >
            <ThemedText
              style={[
                styles.statusText,
                {
                  color: isActive ? Colors[theme].tint : isExpired ? Colors[theme].error : Colors[theme].text,
                },
              ]}
            >
              {isActive ? "Active" : isExpired ? "Expired" : "Inactive"}
            </ThemedText>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors[theme].text} />
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );

  // Render tab navigation
  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === "overview" && styles.activeTab, { borderColor: Colors[theme].border }]}
        onPress={() => setActiveTab("overview")}
      >
        <Ionicons
          name="stats-chart"
          size={16}
          color={activeTab === "overview" ? Colors[theme].background : Colors[theme].text}
        />
        <ThemedText style={[styles.tabText, activeTab === "overview" && { color: Colors[theme].background }]}>
          Overview
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === "members" && styles.activeTab, { borderColor: Colors[theme].border }]}
        onPress={() => setActiveTab("members")}
      >
        <Ionicons
          name="people"
          size={16}
          color={activeTab === "members" ? Colors[theme].background : Colors[theme].text}
        />
        <ThemedText style={[styles.tabText, activeTab === "members" && { color: Colors[theme].background }]}>
          Members ({analytics.total_eligible_members})
        </ThemedText>
      </TouchableOpacity>

      {analytics.division_breakdown.length > 0 && (
        <TouchableOpacity
          style={[styles.tab, activeTab === "divisions" && styles.activeTab, { borderColor: Colors[theme].border }]}
          onPress={() => setActiveTab("divisions")}
        >
          <Ionicons
            name="business"
            size={16}
            color={activeTab === "divisions" ? Colors[theme].background : Colors[theme].text}
          />
          <ThemedText style={[styles.tabText, activeTab === "divisions" && { color: Colors[theme].background }]}>
            Divisions
          </ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );

  // Render overview metrics
  const renderOverview = () => (
    <View style={styles.tabContent}>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="eye" size={20} color="#34C759" />
            <ThemedText style={styles.metricValue}>{analytics.overall_read_percentage}%</ThemedText>
          </View>
          <ThemedText style={styles.metricLabel}>Read Rate</ThemedText>
          <ThemedText style={styles.metricSubtext}>
            {analytics.total_read_count} of {analytics.total_eligible_members} members
          </ThemedText>
        </View>

        {analytics.require_acknowledgment && (
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="checkmark-circle" size={20} color="#FF9500" />
              <ThemedText style={styles.metricValue}>{analytics.overall_acknowledged_percentage}%</ThemedText>
            </View>
            <ThemedText style={styles.metricLabel}>Acknowledgment Rate</ThemedText>
            <ThemedText style={styles.metricSubtext}>
              {analytics.total_acknowledged_count} of {analytics.total_eligible_members} members
            </ThemedText>
          </View>
        )}

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="time" size={20} color="#007AFF" />
            <ThemedText style={styles.metricValue}>{daysSinceCreated}</ThemedText>
          </View>
          <ThemedText style={styles.metricLabel}>Days Active</ThemedText>
          <ThemedText style={styles.metricSubtext}>Since {format(parseISO(analytics.created_at), "MMM d")}</ThemedText>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="people" size={20} color="#8E8E93" />
            <ThemedText style={styles.metricValue}>{analytics.total_eligible_members}</ThemedText>
          </View>
          <ThemedText style={styles.metricLabel}>Eligible Members</ThemedText>
          <ThemedText style={styles.metricSubtext}>
            {analytics.target_type === "GCA" ? "All members" : "Division only"}
          </ThemedText>
        </View>
      </View>
    </View>
  );

  // Render individual member status (optimized for FlatList)
  const renderMemberStatus = ({ item: member, index }: { item: MemberReadStatus; index: number }) => (
    <View style={[styles.memberItem, index === 0 && styles.firstMemberItem]}>
      <View style={styles.memberInfo}>
        <ThemedText style={styles.memberName}>
          {member.first_name} {member.last_name}
        </ThemedText>
        <ThemedText style={styles.memberDetails}>
          PIN: {member.pin} • {member.division_name}
        </ThemedText>
      </View>
      <View style={styles.memberStatus}>
        {member.has_read && (
          <View style={styles.statusItem}>
            <Ionicons name="eye" size={14} color="#34C759" />
            <ThemedText style={styles.statusText}>
              {member.read_at ? format(parseISO(member.read_at), "MMM d, h:mm a") : "Read"}
            </ThemedText>
          </View>
        )}
        {member.has_acknowledged && (
          <View style={styles.statusItem}>
            <Ionicons name="checkmark-circle" size={14} color="#FF9500" />
            <ThemedText style={styles.statusText}>
              {member.acknowledged_at ? format(parseISO(member.acknowledged_at), "MMM d, h:mm a") : "Acknowledged"}
            </ThemedText>
          </View>
        )}
      </View>
    </View>
  );

  // Render members with optimized FlatList for large datasets
  const renderMembers = () => {
    return (
      <View style={styles.tabContent}>
        {renderPerformanceWarning()}

        {/* Read Members Section */}
        <View style={styles.memberSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye" size={16} color="#34C759" />
            <ThemedText style={styles.sectionTitle}>Read ({analytics.members_who_read.length})</ThemedText>
          </View>

          {/* Search for Read Members */}
          {showSearchForLarge && analytics.members_who_read.length > 20 && (
            <TextInput
              style={[
                styles.searchInput,
                {
                  borderColor: Colors[theme].border,
                  color: Colors[theme].text,
                  backgroundColor: Colors[theme].background,
                },
              ]}
              placeholder="Search read members..."
              value={readSearchTerm}
              onChangeText={setReadSearchTerm}
              placeholderTextColor={Colors[theme].textDim}
            />
          )}

          {filteredReadMembers.length > 0 ? (
            <FlatList
              data={filteredReadMembers}
              keyExtractor={(item, index) => `read-${item.user_id}-${index}`}
              renderItem={renderMemberStatus}
              style={styles.memberFlatList}
              nestedScrollEnabled={false}
              scrollEnabled={false}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews={Platform.OS === "android"}
              getItemLayout={(data, index) => ({
                length: 80,
                offset: 80 * index,
                index,
              })}
            />
          ) : (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>
                {readSearchTerm ? "No matching members found" : "No members have read this announcement yet"}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Unread Members Section */}
        <View style={styles.memberSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye-off" size={16} color="#FF3B30" />
            <ThemedText style={styles.sectionTitle}>Not Read ({analytics.members_who_not_read.length})</ThemedText>
          </View>

          {/* Search for Unread Members */}
          {showSearchForLarge && analytics.members_who_not_read.length > 20 && (
            <TextInput
              style={[
                styles.searchInput,
                {
                  borderColor: Colors[theme].border,
                  color: Colors[theme].text,
                  backgroundColor: Colors[theme].background,
                },
              ]}
              placeholder="Search unread members..."
              value={unreadSearchTerm}
              onChangeText={setUnreadSearchTerm}
              placeholderTextColor={Colors[theme].textDim}
            />
          )}

          {filteredUnreadMembers.length > 0 ? (
            <FlatList
              data={filteredUnreadMembers}
              keyExtractor={(item, index) => `unread-${item.user_id}-${index}`}
              renderItem={renderMemberStatus}
              style={styles.memberFlatList}
              nestedScrollEnabled={false}
              scrollEnabled={false}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews={Platform.OS === "android"}
              getItemLayout={(data, index) => ({
                length: 80,
                offset: 80 * index,
                index,
              })}
            />
          ) : (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>
                {unreadSearchTerm ? "No matching members found" : "All eligible members have read this announcement"}
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render divisions tab
  const renderDivisions = () => (
    <View style={styles.tabContent}>
      {analytics.division_breakdown.map((division) => (
        <View key={division.division_id} style={styles.divisionCard}>
          <View style={styles.divisionHeader}>
            <ThemedText style={styles.divisionName}>{division.division_name}</ThemedText>
            <View style={styles.divisionMetrics}>
              <View style={styles.divisionMetric}>
                <ThemedText style={styles.divisionMetricValue}>{division.read_percentage}%</ThemedText>
                <ThemedText style={styles.divisionMetricLabel}>Read</ThemedText>
              </View>
              {analytics.require_acknowledgment && (
                <View style={styles.divisionMetric}>
                  <ThemedText style={styles.divisionMetricValue}>{division.acknowledged_percentage}%</ThemedText>
                  <ThemedText style={styles.divisionMetricLabel}>Ack</ThemedText>
                </View>
              )}
            </View>
          </View>
          <ThemedText style={styles.divisionSubtext}>
            {division.member_count} members • {division.read_count} reads
            {analytics.require_acknowledgment && ` • ${division.acknowledged_count} acknowledgments`}
          </ThemedText>
        </View>
      ))}
    </View>
  );

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return renderOverview();
      case "members":
        return renderMembers();
      case "divisions":
        return renderDivisions();
      default:
        return null;
    }
  };

  // Render footer with export options
  const renderFooter = () => (
    <View style={styles.footer}>
      <View style={styles.lastUpdated}>
        <Ionicons name="refresh" size={14} color={Colors[theme].text} />
        <ThemedText style={styles.lastUpdatedText}>
          Updated: {format(parseISO(analytics.last_updated), "MMM d, h:mm a")}
        </ThemedText>
      </View>
      {onExport && (
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={[styles.exportButton, { borderColor: Colors[theme].border }]}
            onPress={() => onExport("csv")}
          >
            <Ionicons name="document-text" size={16} color={Colors[theme].text} />
            <ThemedText style={styles.exportButtonText}>CSV</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, { borderColor: Colors[theme].border }]}
            onPress={() => onExport("pdf")}
          >
            <Ionicons name="document" size={16} color={Colors[theme].text} />
            <ThemedText style={styles.exportButtonText}>PDF</ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            { backgroundColor: Colors[theme].card },
            Platform.OS === "android" ? styles.androidModal : isMobile ? styles.mobileModal : styles.desktopModal,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {renderHeader()}
          {renderTabs()}
          <ScrollView
            style={[styles.scrollContent, Platform.OS === "android" && styles.androidScrollContent]}
            contentContainerStyle={Platform.OS === "android" ? styles.androidContentContainer : undefined}
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={Platform.OS !== "android"}
            removeClippedSubviews={true}
          >
            {renderContent()}
          </ScrollView>
          {renderFooter()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 16,
    overflow: "hidden",
    ...(Platform.OS === "android"
      ? {
          flex: 1,
          height: "90%",
          maxHeight: "90%",
          minHeight: "80%",
        }
      : {
          maxHeight: "90%",
          minHeight: "60%",
        }),
  },
  androidModal: {
    width: "95%",
    height: "90%",
    maxWidth: 400,
    maxHeight: "90%",
    flex: 1,
  },
  mobileModal: {
    width: "95%",
    maxWidth: 400,
  },
  desktopModal: {
    width: "80%",
    maxWidth: 800,
  },
  androidScrollContent: {
    flex: 1,
    minHeight: 0,
  },
  androidContentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    borderBottomWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
  },
  metadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    fontWeight: "500",
  },
  authorInfo: {
    fontSize: 12,
    opacity: 0.7,
  },
  headerRight: {
    alignItems: "flex-end",
    gap: 8,
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
  closeButton: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: Colors.dark.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: Colors.dark.tint,
    backgroundColor: Colors.dark.tint,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  scrollContent: {
    flex: 1,
    ...(Platform.OS === "android" && {
      minHeight: 0,
    }),
  },
  tabContent: {
    padding: 16,
    ...(Platform.OS === "android" && {
      flex: 1,
      minHeight: 0,
    }),
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    backgroundColor: Colors.dark.background,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.8,
    marginBottom: 2,
  },
  metricSubtext: {
    fontSize: 10,
    opacity: 0.6,
  },
  memberSection: {
    marginBottom: 24,
    ...(Platform.OS === "android" && {
      flex: 1,
      minHeight: 200,
    }),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    fontSize: 14,
  },
  memberFlatList: {
    maxHeight: 400,
    minHeight: 200,
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    minHeight: 80,
  },
  firstMemberItem: {
    borderTopWidth: 0,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  memberDetails: {
    fontSize: 12,
    opacity: 0.7,
  },
  memberStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  emptyState: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },
  performanceWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
    marginBottom: 16,
  },
  performanceWarningText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.dark.warning,
  },
  divisionCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: Colors.dark.background,
  },
  divisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  divisionName: {
    fontSize: 16,
    fontWeight: "600",
  },
  divisionMetrics: {
    flexDirection: "row",
    gap: 16,
  },
  divisionMetric: {
    alignItems: "center",
  },
  divisionMetricValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  divisionMetricLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  divisionSubtext: {
    fontSize: 12,
    opacity: 0.7,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  lastUpdated: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lastUpdatedText: {
    fontSize: 12,
    opacity: 0.7,
  },
  exportButtons: {
    flexDirection: "row",
    gap: 8,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
