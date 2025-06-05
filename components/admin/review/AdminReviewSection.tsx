import React, { useState } from "react";
import { StyleSheet, View, Platform, useWindowDimensions, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { format } from "date-fns";

// Types for review items
interface AdminReview {
  id: string;
  submitted_by: string;
  submitted_at: string;
  request_type: string;
  request_id: string;
  description: string;
  status: "submitted" | "in_review" | "resolved";
  submitted_by_name?: string;
}

// Sample data for the UI preview (will be replaced with actual API calls)
const SAMPLE_REVIEWS: AdminReview[] = [
  {
    id: "1",
    submitted_by: "user1",
    submitted_at: new Date().toISOString(),
    request_type: "PLD",
    request_id: "pld-123",
    description: "Issue with PLD approval workflow",
    status: "submitted",
    submitted_by_name: "John Smith",
  },
  {
    id: "2",
    submitted_by: "user2",
    submitted_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    request_type: "Vacation",
    request_id: "vac-456",
    description: "Calendar conflict for vacation request",
    status: "in_review",
    submitted_by_name: "Jane Doe",
  },
  {
    id: "3",
    submitted_by: "user3",
    submitted_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    request_type: "SDV",
    request_id: "sdv-789",
    description: "Need to check eligibility for SDV",
    status: "resolved",
    submitted_by_name: "Alice Johnson",
  },
];

export function AdminReviewSection() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  // Status badge colors (keep these specific colors for status indication)
  const getStatusColor = (status: AdminReview["status"]) => {
    switch (status) {
      case "submitted":
        return colors.warning || "#f0ad4e"; // warning
      case "in_review":
        return colors.primary || "#0275d8"; // info/primary
      case "resolved":
        return colors.success || "#5cb85c"; // success
      default:
        return colors.textDim || "#777777"; // default
    }
  };

  // Format status for display
  const formatStatus = (status: AdminReview["status"]) => {
    switch (status) {
      case "in_review":
        return "In Review";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  // Render a review item
  const renderReviewItem = ({ item }: { item: AdminReview }) => {
    const statusColor = getStatusColor(item.status);
    const formattedDate = format(new Date(item.submitted_at), "MMM d, yyyy");

    return (
      <ThemedView style={[styles.reviewItem, { backgroundColor: colors.card }]}>
        <View style={styles.reviewHeader}>
          <ThemedText style={styles.reviewType}>{item.request_type}</ThemedText>
          <View
            style={{
              ...styles.statusBadge,
              backgroundColor: statusColor + "20",
              borderColor: statusColor,
            }}
          >
            <ThemedText style={{ ...styles.statusText, color: statusColor }}>{formatStatus(item.status)}</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.reviewDescription}>{item.description}</ThemedText>

        <View style={styles.reviewFooter}>
          <View style={styles.submittedInfo}>
            <Ionicons name="person-outline" size={16} color={colors.textDim} />
            <ThemedText style={{ ...styles.submittedByText, color: colors.textDim }}>
              {item.submitted_by_name}
            </ThemedText>
          </View>
          <View style={styles.dateInfo}>
            <Ionicons name="calendar-outline" size={16} color={colors.textDim} />
            <ThemedText style={{ ...styles.dateText, color: colors.textDim }}>{formattedDate}</ThemedText>
          </View>
        </View>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={{ ...styles.featureNotice, backgroundColor: colors.tint + "10" }}>
        <Ionicons name="information-circle-outline" size={24} color={colors.tint} />
        <ThemedText style={styles.noticeText}>
          This feature is coming soon. The review system will allow admins to track and resolve issues.
        </ThemedText>
      </ThemedView>

      <ThemedText style={styles.sectionTitle}>Review Items</ThemedText>

      {isMobile ? (
        <FlatList
          data={SAMPLE_REVIEWS}
          renderItem={renderReviewItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.reviewList}
          ItemSeparatorComponent={() => <View style={{ ...styles.separator, backgroundColor: colors.border }} />}
        />
      ) : (
        <View style={{ ...styles.tableContainer, borderColor: colors.border }}>
          <View
            style={{ ...styles.tableHeader, backgroundColor: colors.tint + "10", borderBottomColor: colors.border }}
          >
            <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Type</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, { flex: 3 }]}>Description</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Submitted By</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Date</ThemedText>
            <ThemedText style={[styles.tableHeaderCell, { flex: 1 }]}>Status</ThemedText>
          </View>

          {SAMPLE_REVIEWS.map((review) => {
            const statusColor = getStatusColor(review.status);
            const formattedDate = format(new Date(review.submitted_at), "MMM d, yyyy");

            return (
              <View key={review.id} style={{ ...styles.tableRow, borderBottomColor: colors.border }}>
                <ThemedText style={[styles.tableCell, { flex: 1 }]}>{review.request_type}</ThemedText>
                <ThemedText style={[styles.tableCell, { flex: 3 }]} numberOfLines={2} ellipsizeMode="tail">
                  {review.description}
                </ThemedText>
                <ThemedText style={[styles.tableCell, { flex: 1 }]}>{review.submitted_by_name}</ThemedText>
                <ThemedText style={[styles.tableCell, { flex: 1 }]}>{formattedDate}</ThemedText>
                <View style={[styles.tableCell, { flex: 1 }]}>
                  <View
                    style={{
                      ...styles.statusBadge,
                      backgroundColor: statusColor + "20",
                      borderColor: statusColor,
                    }}
                  >
                    <ThemedText style={{ ...styles.statusText, color: statusColor }}>
                      {formatStatus(review.status)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 24,
  },
  featureNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  reviewList: {
    gap: 12,
  },
  reviewItem: {
    padding: 16,
    borderRadius: 8,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 2,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  reviewType: {
    fontSize: 16,
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reviewDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  reviewFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  submittedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  submittedByText: {
    fontSize: 12,
  },
  dateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
  },
  separator: {
    height: 1,
    marginVertical: 8,
  },
  tableContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
  },
  tableHeader: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    fontWeight: "600",
    fontSize: 14,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    padding: 12,
  },
  tableCell: {
    fontSize: 14,
    paddingHorizontal: 4,
  },
});
