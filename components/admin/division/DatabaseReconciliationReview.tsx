import React, { useState, useEffect } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import {
  DbConflict,
  QueuedDbChange,
  DbReconciliationStageData,
  StagedImportPreview,
  updateStageCompletion,
  analyzeQueuedDbChangesImpact,
  createDbChangesWarningMessage,
  applyDbChangesImpactToOverAllotment,
  AllotmentImpactAnalysis,
} from "@/utils/importPreviewService";

interface DatabaseReconciliationReviewProps {
  stagedPreview: StagedImportPreview;
  onStagedPreviewUpdate: (updated: StagedImportPreview) => void;
  onAdvanceStage: () => void;
}

interface GroupedConflicts {
  [memberKey: string]: {
    memberName: string;
    memberId?: string;
    conflicts: DbConflict[];
  };
}

export function DatabaseReconciliationReview({
  stagedPreview,
  onStagedPreviewUpdate,
  onAdvanceStage,
}: DatabaseReconciliationReviewProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAllConflicts, setShowAllConflicts] = useState(false);
  const dbReconciliationData = stagedPreview.progressState.stageData.db_reconciliation;

  // Auto-advance if no conflicts
  useEffect(() => {
    if (dbReconciliationData.conflicts.length === 0 && !isProcessing) {
      console.log("[DbReconciliation] No conflicts detected, auto-advancing");
      onAdvanceStage();
    }
  }, [dbReconciliationData.conflicts.length, isProcessing, onAdvanceStage]);

  // Group conflicts by Member > Date
  const groupedConflicts: GroupedConflicts = React.useMemo(() => {
    const groups: GroupedConflicts = {};

    dbReconciliationData.conflicts.forEach((conflict) => {
      const memberKey = `${conflict.memberName}_${conflict.requestDate}`;

      if (!groups[memberKey]) {
        groups[memberKey] = {
          memberName: conflict.memberName,
          memberId: conflict.memberId,
          conflicts: [],
        };
      }

      groups[memberKey].conflicts.push(conflict);
    });

    return groups;
  }, [dbReconciliationData.conflicts]);

  const handleConflictAction = async (
    conflict: DbConflict,
    action: "keep" | "cancel" | "approve" | "waitlist" | "transfer",
    adminReason?: string
  ) => {
    setIsProcessing(true);

    try {
      const updatedPreview = { ...stagedPreview };
      const { db_reconciliation } = updatedPreview.progressState.stageData;

      if (action === "keep") {
        // Just mark as reviewed, no change needed
        db_reconciliation.reviewedConflicts.add(conflict.dbRequest.id);
      } else {
        // Queue the change - convert action names to proper status values
        let newStatus: string;
        switch (action) {
          case "cancel":
            newStatus = "cancelled";
            break;
          case "transfer":
            newStatus = "transferred";
            break;
          case "approve":
            newStatus = "approved";
            break;
          case "waitlist":
            newStatus = "waitlisted";
            break;
          default:
            newStatus = action;
        }

        const queuedChange: QueuedDbChange = {
          requestId: conflict.dbRequest.id,
          currentStatus: conflict.dbRequest.status,
          newStatus,
          memberId: conflict.dbRequest.member_id,
          pinNumber: conflict.dbRequest.pin_number,
          requestDate: conflict.requestDate,
          leaveType: conflict.dbRequest.leave_type,
          adminReason,
          timestamp: new Date(),
        };

        db_reconciliation.queuedChanges.push(queuedChange);
        db_reconciliation.reviewedConflicts.add(conflict.dbRequest.id);
      }

      // Check if all conflicts are resolved
      const allResolved = db_reconciliation.conflicts.every((c) =>
        db_reconciliation.reviewedConflicts.has(c.dbRequest.id)
      );

      if (allResolved) {
        db_reconciliation.isComplete = true;

        // PHASE 8.4: Check if queued changes affect over-allotment calculations
        if (db_reconciliation.queuedChanges.length > 0) {
          const impactAnalysis = await analyzeQueuedDbChangesImpact(updatedPreview);

          if (impactAnalysis.requiresOverAllotmentReturn) {
            // Show warning and ask admin if they want to return to over-allotment
            const warningMessage = createDbChangesWarningMessage(impactAnalysis);

            Alert.alert(warningMessage.title, warningMessage.summary + "\n\n" + warningMessage.details.join("\n"), [
              {
                text: "Return to Over-Allotment",
                onPress: () => handleReturnToOverAllotment(updatedPreview, impactAnalysis),
              },
              {
                text: "Continue to Final Review",
                onPress: () => proceedToFinalReview(updatedPreview),
              },
            ]);
            return;
          }
        }
      }

      const completedPreview = updateStageCompletion(updatedPreview, "db_reconciliation", allResolved);

      onStagedPreviewUpdate(completedPreview);

      if (allResolved) {
        onAdvanceStage();
      }
    } catch (error) {
      console.error("[DbReconciliation] Error handling conflict action:", error);
      Alert.alert("Error", "Failed to process conflict action. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturnToOverAllotment = async (
    updatedPreview: StagedImportPreview,
    impactAnalysis: AllotmentImpactAnalysis
  ) => {
    try {
      // Apply the database changes impact to over-allotment calculations
      await applyDbChangesImpactToOverAllotment(updatedPreview, impactAnalysis);

      // Update progress state to return to over-allotment stage
      updatedPreview.progressState.currentStage = "over_allotment";
      updatedPreview.progressState.stageData.over_allotment.isComplete = false;
      updatedPreview.progressState.canProgress = false;

      // Remove db_reconciliation and final_review from completed stages
      updatedPreview.progressState.completedStages = updatedPreview.progressState.completedStages.filter(
        (stage) => stage !== "db_reconciliation" && stage !== "final_review"
      );

      updatedPreview.lastUpdated = new Date();

      onStagedPreviewUpdate(updatedPreview);
    } catch (error) {
      console.error("[DbReconciliation] Error returning to over-allotment:", error);
      Alert.alert("Error", "Failed to return to over-allotment stage. Please try again.");
    }
  };

  const proceedToFinalReview = (updatedPreview: StagedImportPreview) => {
    const completedPreview = updateStageCompletion(updatedPreview, "db_reconciliation", true);

    onStagedPreviewUpdate(completedPreview);
    onAdvanceStage();
  };

  const getSeverityColor = (severity: "low" | "medium" | "high") => {
    switch (severity) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return Colors[colorScheme].text;
      default:
        return Colors[colorScheme].text;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "approved":
        return styles.approvedStatus;
      case "waitlisted":
        return styles.waitlistedStatus;
      case "denied":
        return styles.deniedStatus;
      case "pending":
        return styles.pendingStatus;
      default:
        return styles.defaultStatus;
    }
  };

  // Helper function to get contextual action button text
  const getActionButtonText = (action: string, conflict: DbConflict) => {
    const currentStatus = conflict.dbRequest.status;
    switch (action) {
      case "keep":
        return `Keep ${currentStatus.toUpperCase()}`;
      case "cancel":
        return "Cancel Request";
      case "approve":
        return currentStatus === "approved" ? "Keep Approved" : "Change to Approved";
      case "waitlist":
        return currentStatus === "waitlisted" ? "Keep Waitlisted" : "Change to Waitlisted";
      case "transfer":
        return "Transfer Request";
      default:
        return action;
    }
  };

  const renderConflictActions = (conflict: DbConflict) => {
    const isReviewed = dbReconciliationData.reviewedConflicts.has(conflict.dbRequest.id);
    const queuedChange = dbReconciliationData.queuedChanges.find(
      (change) => change.requestId === conflict.dbRequest.id
    );

    if (isReviewed) {
      return (
        <ThemedView
          style={[styles.reviewedContainer, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
        >
          <ThemedText style={styles.reviewedText}>
            ✓ Reviewed -{" "}
            {queuedChange ? `Will change to ${queuedChange.newStatus.toUpperCase()}` : "Keeping current status"}
          </ThemedText>
        </ThemedView>
      );
    }

    return (
      <View style={styles.actionsContainer}>
        <ThemedText style={styles.actionsLabel}>
          Choose action for this {conflict.dbRequest.leave_type} request:
        </ThemedText>
        <View style={styles.buttonRow}>
          <ThemedTouchableOpacity
            style={[styles.actionButton, styles.keepButton]}
            onPress={() => handleConflictAction(conflict, "keep")}
            disabled={isProcessing}
          >
            <ThemedText style={styles.keepButtonText}>{getActionButtonText("keep", conflict)}</ThemedText>
          </ThemedTouchableOpacity>
          <ThemedTouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={() => handleConflictAction(conflict, "cancel", "Cancelled via import reconciliation")}
            disabled={isProcessing}
          >
            <ThemedText style={styles.cancelButtonText}>{getActionButtonText("cancel", conflict)}</ThemedText>
          </ThemedTouchableOpacity>
          <ThemedTouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={() => handleConflictAction(conflict, "approve", "Approved via import reconciliation")}
            disabled={isProcessing}
          >
            <ThemedText style={styles.approveButtonText}>{getActionButtonText("approve", conflict)}</ThemedText>
          </ThemedTouchableOpacity>
          <ThemedTouchableOpacity
            style={[styles.actionButton, styles.waitlistButton]}
            onPress={() => handleConflictAction(conflict, "waitlist", "Waitlisted via import reconciliation")}
            disabled={isProcessing}
          >
            <ThemedText style={styles.waitlistButtonText}>{getActionButtonText("waitlist", conflict)}</ThemedText>
          </ThemedTouchableOpacity>
          <ThemedTouchableOpacity
            style={[styles.actionButton, styles.transferButton]}
            onPress={() => handleConflictAction(conflict, "transfer", "Transferred via import reconciliation")}
            disabled={isProcessing}
          >
            <ThemedText style={styles.transferButtonText}>{getActionButtonText("transfer", conflict)}</ThemedText>
          </ThemedTouchableOpacity>
        </View>
      </View>
    );
  };

  // Helper function to format dates consistently
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return "N/A";
    const date = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return "Invalid Date";
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Helper component for detail rows
  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.detailRow}>
      <ThemedText style={styles.detailLabel}>{label}:</ThemedText>
      <ThemedText style={styles.detailValue}>{value}</ThemedText>
    </View>
  );

  // Enhanced database request details display
  const renderDatabaseRequestDetails = (conflict: DbConflict) => (
    <ThemedView style={[styles.dbRequestDetails, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}>
      <ThemedText style={styles.dbRequestHeader}>Database Request Details</ThemedText>
      <View style={styles.dbRequestFields}>
        <DetailRow label="Member Name" value={conflict.memberName} />
        <DetailRow label="Member ID" value={conflict.dbRequest.member_id || "N/A"} />
        <DetailRow label="PIN Number" value={conflict.dbRequest.pin_number?.toString() || "N/A"} />
        <DetailRow label="Leave Type" value={conflict.dbRequest.leave_type} />
        <DetailRow label="Request Date" value={new Date(conflict.dbRequest.request_date).toLocaleDateString()} />
        <DetailRow label="Current Status" value={conflict.dbRequest.status.toUpperCase()} />
        <DetailRow label="Submitted On" value={formatDate(conflict.dbRequest.created_at)} />
        <DetailRow label="Last Updated" value={formatDate(conflict.dbRequest.updated_at)} />
        {conflict.dbRequest.actioned_by && <DetailRow label="Actioned By" value={conflict.dbRequest.actioned_by} />}
        {conflict.dbRequest.actioned_at && (
          <DetailRow label="Actioned At" value={formatDate(conflict.dbRequest.actioned_at)} />
        )}
      </View>
    </ThemedView>
  );

  // Enhanced comparison view for status mismatches
  const renderComparisonView = (conflict: DbConflict) => (
    <View style={styles.comparisonContainer}>
      <View style={[styles.comparisonColumn, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}>
        <ThemedText style={styles.comparisonHeader}>Database Request</ThemedText>
        <DetailRow label="Status" value={conflict.dbRequest.status.toUpperCase()} />
        <DetailRow label="Leave Type" value={conflict.dbRequest.leave_type} />
        <DetailRow label="Date" value={new Date(conflict.dbRequest.request_date).toLocaleDateString()} />
        <DetailRow label="Submitted" value={formatDate(conflict.dbRequest.created_at)} />
      </View>

      {conflict.icalRequest && (
        <View style={[styles.comparisonColumn, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}>
          <ThemedText style={styles.comparisonHeader}>iCal Import</ThemedText>
          <DetailRow label="Status" value={conflict.icalRequest.isWaitlisted ? "WAITLISTED" : "APPROVED"} />
          <DetailRow label="Leave Type" value={conflict.icalRequest.leaveType} />
          <DetailRow label="Date" value={new Date(conflict.icalRequest.requestDate).toLocaleDateString()} />
          <DetailRow label="Created" value={formatDate(conflict.icalRequest.createdAt)} />
        </View>
      )}
    </View>
  );

  const renderConflictCard = (conflict: DbConflict) => {
    return (
      <ThemedView key={conflict.id} style={[styles.conflictCard, { borderColor: Colors[colorScheme].border }]}>
        <View style={styles.conflictHeader}>
          <View style={styles.conflictInfo}>
            <ThemedText style={styles.conflictType}>
              {conflict.type === "missing_from_ical"
                ? "Missing from Calendar"
                : conflict.type === "status_mismatch"
                ? "Status Mismatch"
                : conflict.type === "leave_type_conflict"
                ? "Leave Type Conflict"
                : "Unknown Conflict"}
            </ThemedText>
            <ThemedText style={styles.conflictDescription}>{conflict.description}</ThemedText>
          </View>
          <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(conflict.severity) }]}>
            <ThemedText style={styles.severityText}>{conflict.severity.toUpperCase()}</ThemedText>
          </View>
        </View>

        {/* Enhanced Database Request Details */}
        {renderDatabaseRequestDetails(conflict)}

        {/* Conflict-specific details */}
        <View style={styles.conflictDetails}>
          {conflict.type === "status_mismatch" && renderComparisonView(conflict)}

          {conflict.type === "missing_from_ical" && (
            <ThemedView
              style={[styles.warningContainer, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
            >
              <ThemedText style={styles.warningText}>
                ⚠️ This request exists in the database but was not found in the iCal import. It may have been manually
                added or removed from the calendar.
              </ThemedText>
            </ThemedView>
          )}

          {conflict.type === "leave_type_conflict" && (
            <ThemedView
              style={[styles.warningContainer, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
            >
              <ThemedText style={styles.warningText}>
                ⚠️ Same member has different leave types on the same date. This may indicate a data entry error or
                legitimate change.
              </ThemedText>
            </ThemedView>
          )}

          {conflict.suggestedAction && (
            <ThemedView
              style={[styles.suggestionContainer, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
            >
              <ThemedText style={styles.suggestionText}>
                <ThemedText style={styles.suggestionLabel}>💡 Suggestion: </ThemedText>
                {conflict.suggestedAction}
              </ThemedText>
            </ThemedView>
          )}
        </View>

        {renderConflictActions(conflict)}
      </ThemedView>
    );
  };

  const renderMemberGroup = (memberKey: string, group: GroupedConflicts[string]) => {
    return (
      <View key={memberKey} style={styles.memberGroup}>
        <ThemedView style={[styles.memberHeader, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}>
          <ThemedText style={styles.memberName}>{group.memberName}</ThemedText>
          <ThemedText style={styles.conflictCount}>
            {group.conflicts.length} conflict{group.conflicts.length !== 1 ? "s" : ""}
          </ThemedText>
        </ThemedView>
        {group.conflicts.map(renderConflictCard)}
      </View>
    );
  };

  const renderSummary = () => {
    const totalConflicts = dbReconciliationData.conflicts.length;
    const reviewedCount = dbReconciliationData.reviewedConflicts.size;
    const queuedChanges = dbReconciliationData.queuedChanges.length;

    return (
      <ThemedView style={[styles.summaryCard, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}>
        <ThemedText style={styles.summaryTitle}>Database Reconciliation Summary</ThemedText>
        <View style={styles.summaryContent}>
          <ThemedText style={styles.summaryItem}>
            • {totalConflicts} conflict{totalConflicts !== 1 ? "s" : ""} found
          </ThemedText>
          <ThemedText style={styles.summaryItem}>
            • {reviewedCount} reviewed ({Math.round((reviewedCount / Math.max(totalConflicts, 1)) * 100)}%)
          </ThemedText>
          <ThemedText style={styles.summaryItem}>
            • {queuedChanges} database change{queuedChanges !== 1 ? "s" : ""} queued
          </ThemedText>
        </View>
      </ThemedView>
    );
  };

  const canAdvance = dbReconciliationData.isComplete;

  if (dbReconciliationData.conflicts.length === 0) {
    return (
      <ThemedView style={styles.noConflictsContainer}>
        <ThemedView style={styles.noConflictsCard}>
          <ThemedText style={styles.noConflictsTitle}>✓ No Database Conflicts Found</ThemedText>
          <ThemedText style={styles.noConflictsDescription}>
            All import data is consistent with existing database records. Proceeding to final review...
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  const totalConflictGroups = Object.entries(groupedConflicts).length;
  const displayConflicts = showAllConflicts
    ? Object.entries(groupedConflicts)
    : Object.entries(groupedConflicts).slice(0, 3);

  const hasMoreConflicts = totalConflictGroups > 3;

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderSummary()}

        <ThemedText style={styles.sectionTitle}>Conflicts Requiring Review</ThemedText>

        {displayConflicts.map(([memberKey, group]) => renderMemberGroup(memberKey, group))}

        {/* Show All Conflicts Button */}
        {hasMoreConflicts && !showAllConflicts && (
          <ThemedView style={styles.showAllContainer}>
            <Button
              onPress={() => setShowAllConflicts(true)}
              style={[styles.showAllButton, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
            >
              Show All {totalConflictGroups} Member Groups ({dbReconciliationData.conflicts.length} total conflicts)
            </Button>
          </ThemedView>
        )}

        {showAllConflicts && hasMoreConflicts && (
          <ThemedView style={styles.showAllContainer}>
            <Button
              onPress={() => setShowAllConflicts(false)}
              style={[styles.showAllButton, { backgroundColor: Colors[colorScheme].buttonBackgroundSecondary }]}
            >
              Show Only First 3 Groups
            </Button>
          </ThemedView>
        )}
      </ScrollView>

      {/* Footer with advance button */}
      <ThemedView style={[styles.footer, { borderTopColor: Colors[colorScheme].border }]}>
        <Button
          onPress={onAdvanceStage}
          disabled={!canAdvance || isProcessing}
          style={[
            styles.advanceButton,
            { backgroundColor: canAdvance ? Colors[colorScheme].tint : Colors[colorScheme].tabIconDefault },
          ]}
        >
          {isProcessing
            ? "Processing..."
            : canAdvance
            ? "Continue to Final Review"
            : `Review ${
                dbReconciliationData.conflicts.length - dbReconciliationData.reviewedConflicts.size
              } Remaining Conflicts`}
        </Button>
        {isProcessing && (
          <View style={styles.processingIndicator}>
            <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
          </View>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  summaryContent: {
    gap: 4,
  },
  summaryItem: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  memberGroup: {
    marginBottom: 24,
  },
  memberHeader: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
  },
  conflictCount: {
    fontSize: 14,
    opacity: 0.7,
  },
  conflictCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  conflictHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  conflictInfo: {
    flex: 1,
    marginRight: 12,
  },
  conflictType: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
    opacity: 0.8,
  },
  conflictDescription: {
    fontSize: 14,
    fontWeight: "400",
    marginBottom: 4,
    opacity: 0.9,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  conflictDetails: {
    gap: 12,
  },
  statusComparison: {
    flexDirection: "row",
    gap: 16,
  },
  statusColumn: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
    opacity: 0.7,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  approvedStatus: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#22c55e",
  },
  waitlistedStatus: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#f59e0b",
  },
  deniedStatus: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#ef4444",
  },
  pendingStatus: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#3b82f6",
  },
  defaultStatus: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#6b7280",
  },
  warningContainer: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: "#f59e0b",
    borderColor: Colors.dark.border,
  },
  warningText: {
    fontSize: 14,
    opacity: 0.9,
  },
  suggestionContainer: {
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
    borderColor: Colors.dark.border,
  },
  suggestionText: {
    fontSize: 14,
    color: "#425EB7",
  },
  suggestionLabel: {
    fontWeight: "500",
  },
  reviewedContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  reviewedText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#166534",
  },
  actionsContainer: {
    marginTop: 12,
    gap: 8,
  },
  actionsLabel: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  keepButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#6b7280",
  },
  keepButtonText: {
    fontSize: 14,
    color: "#ABAEB3",
  },
  cancelButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#ef4444",
  },
  cancelButtonText: {
    fontSize: 14,
    color: "#dc2626",
  },
  approveButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#22c55e",
  },
  approveButtonText: {
    fontSize: 14,
    color: "#166534",
  },
  waitlistButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#f59e0b",
  },
  waitlistButtonText: {
    fontSize: 14,
    color: "#d97706",
  },
  transferButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderColor: "#3b82f6",
  },
  transferButtonText: {
    fontSize: 14,
    color: "#2563eb",
  },
  noConflictsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  noConflictsCard: {
    backgroundColor: Colors.dark.card,
    padding: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
    maxWidth: 400,
  },
  noConflictsTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#166534",
    textAlign: "center",
    marginBottom: 8,
  },
  noConflictsDescription: {
    fontSize: 14,
    color: "#16a34a",
    textAlign: "center",
  },
  footer: {
    borderTopWidth: 1,
    padding: 16,
  },
  advanceButton: {
    width: "100%",
  },
  processingIndicator: {
    position: "absolute",
    right: 24,
    top: "50%",
    transform: [{ translateY: -12 }],
  },
  // New styles for enhanced database request details
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  dbRequestDetails: {
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#3B82F6",
  },
  dbRequestHeader: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    opacity: 0.9,
  },
  dbRequestFields: {
    gap: 6,
  },
  comparisonContainer: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 8,
  },
  comparisonColumn: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  comparisonHeader: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
    opacity: 0.8,
  },
  showAllContainer: {
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  showAllButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
});
