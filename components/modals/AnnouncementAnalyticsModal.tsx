import React, { useState } from "react";
import { Modal, StyleSheet, TouchableOpacity, ScrollView, Pressable, View, useWindowDimensions } from "react-native";
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

  if (!analytics) return null;

  // Calculate additional metrics
  const daysSinceCreated = Math.floor(
    (new Date().getTime() - new Date(analytics.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  const isExpired = analytics.end_date && new Date(analytics.end_date) < new Date();
  const isActive = analytics.is_active && !isExpired;

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
            <Ionicons name="people" size={20} color="#007AFF" />
            <ThemedText style={styles.metricValue}>{analytics.total_eligible_members}</ThemedText>
          </View>
          <ThemedText style={styles.metricLabel}>Total Members</ThemedText>
          <ThemedText style={styles.metricSubtext}>Eligible to view</ThemedText>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Ionicons name="calendar" size={20} color="#8E8E93" />
            <ThemedText style={styles.metricValue}>{daysSinceCreated}</ThemedText>
          </View>
          <ThemedText style={styles.metricLabel}>Days Active</ThemedText>
          <ThemedText style={styles.metricSubtext}>Since creation</ThemedText>
        </View>
      </View>

      {analytics.end_date && (
        <View style={styles.expirationInfo}>
          <Ionicons
            name={isExpired ? "warning" : "time"}
            size={16}
            color={isExpired ? Colors[theme].error : Colors[theme].text}
          />
          <ThemedText style={[styles.expirationText, isExpired && { color: Colors[theme].error }]}>
            {isExpired
              ? `Expired on ${format(parseISO(analytics.end_date), "MMM d, yyyy")}`
              : `Expires on ${format(parseISO(analytics.end_date), "MMM d, yyyy")}`}
          </ThemedText>
        </View>
      )}
    </View>
  );

  // Render member status
  const renderMemberStatus = (member: MemberReadStatus, index: number) => (
    <View key={`${member.user_id}-${index}`} style={styles.memberItem}>
      <View style={styles.memberInfo}>
        <ThemedText style={styles.memberName}>
          {member.first_name} {member.last_name}
        </ThemedText>
        <ThemedText style={styles.memberDetails}>
          PIN: {member.pin} • {member.division_name}
        </ThemedText>
      </View>
      <View style={styles.memberStatus}>
        <View style={[styles.statusIndicator, { backgroundColor: member.has_read ? "#34C759" : "#FF3B30" }]}>
          <Ionicons name={member.has_read ? "eye" : "eye-off"} size={12} color="#fff" />
        </View>
        {analytics.require_acknowledgment && (
          <View style={[styles.statusIndicator, { backgroundColor: member.has_acknowledged ? "#FF9500" : "#8E8E93" }]}>
            <Ionicons name={member.has_acknowledged ? "checkmark" : "close"} size={12} color="#fff" />
          </View>
        )}
      </View>
      {member.read_at && (
        <ThemedText style={styles.memberTimestamp}>
          Read: {format(parseISO(member.read_at), "MMM d, h:mm a")}
        </ThemedText>
      )}
      {member.acknowledged_at && (
        <ThemedText style={styles.memberTimestamp}>
          Ack: {format(parseISO(member.acknowledged_at), "MMM d, h:mm a")}
        </ThemedText>
      )}
    </View>
  );

  // Render members tab
  const renderMembers = () => {
    const readMembers = analytics.members_who_read;
    const unreadMembers = analytics.members_who_not_read;

    return (
      <View style={styles.tabContent}>
        <View style={styles.memberSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye" size={16} color="#34C759" />
            <ThemedText style={styles.sectionTitle}>Read ({readMembers.length})</ThemedText>
          </View>
          {readMembers.length > 0 ? (
            readMembers.map((member, index) => renderMemberStatus(member, index))
          ) : (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>No members have read this announcement yet</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.memberSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="eye-off" size={16} color="#FF3B30" />
            <ThemedText style={styles.sectionTitle}>Not Read ({unreadMembers.length})</ThemedText>
          </View>
          {unreadMembers.length > 0 ? (
            unreadMembers.map((member, index) => renderMemberStatus(member, index))
          ) : (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>All eligible members have read this announcement</ThemedText>
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
            isMobile ? styles.mobileModal : styles.desktopModal,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {renderHeader()}
          {renderTabs()}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
    maxHeight: "90%",
  },
  mobileModal: {
    width: "95%",
    maxWidth: 400,
  },
  desktopModal: {
    width: "80%",
    maxWidth: 800,
  },
  header: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "row",
    flex: 1,
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
  },
  announcementTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  metadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 4,
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    opacity: 0.7,
  },
  authorInfo: {
    fontSize: 12,
    opacity: 0.6,
    fontStyle: "italic",
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
    fontWeight: "500",
  },
  closeButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: "transparent",
  },
  activeTab: {
    backgroundColor: Colors.dark.tint,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
  },
  scrollContent: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 140,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
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
    fontWeight: "bold",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 2,
  },
  metricSubtext: {
    fontSize: 10,
    opacity: 0.7,
  },
  expirationInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
  },
  expirationText: {
    fontSize: 14,
    fontWeight: "500",
  },
  memberSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  memberItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 8,
  },
  memberInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "500",
  },
  memberDetails: {
    fontSize: 12,
    opacity: 0.7,
  },
  memberStatus: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  statusIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  memberTimestamp: {
    fontSize: 10,
    opacity: 0.6,
    marginTop: 2,
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  lastUpdated: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
});
