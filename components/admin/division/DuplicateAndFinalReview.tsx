import React, { useState, useCallback, useMemo } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import {
  StagedImportPreview,
  ImportStage,
  ImportPreviewItem,
  triggerStageReAnalysis,
  executeQueuedDbChanges,
} from "@/utils/importPreviewService";
import { insertBatchPldSdvRequests } from "@/utils/databaseApiLayer";
import { useUserStore } from "@/store/userStore";

interface DuplicateAndFinalReviewProps {
  stagedPreview: StagedImportPreview;
  onStageUpdate: (stage: ImportStage, isComplete: boolean) => void;
  onDataUpdate: (preview: StagedImportPreview) => void;
  onImportComplete: (result: { success: boolean; count: number }) => void;
}

export function DuplicateAndFinalReview({
  stagedPreview,
  onStageUpdate,
  onDataUpdate,
  onImportComplete,
}: DuplicateAndFinalReviewProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { member: adminUser } = useUserStore();
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { currentStage } = stagedPreview.progressState;
  const { duplicates, final_review } = stagedPreview.progressState.stageData;

  // Check if current stage is complete
  const isStageComplete = useMemo(() => {
    // Extract the latest stage data from stagedPreview
    const { currentStage } = stagedPreview.progressState;
    const { duplicates, final_review } = stagedPreview.progressState.stageData;

    console.log(`[DuplicateAndFinalReview] ===== STAGE COMPLETION CHECK =====`);
    console.log(`[DuplicateAndFinalReview] useMemo triggered - stagedPreview changed`);
    console.log(`[DuplicateAndFinalReview] Current stage: ${currentStage}`);

    if (currentStage === "duplicates") {
      const totalDuplicates = duplicates.duplicateItems.length;
      const resolvedCount = duplicates.skipDuplicates.size + duplicates.overrideDuplicates.size;
      const isComplete = duplicates.duplicateItems.every((_, index) => {
        const originalIndex = duplicates.duplicateOriginalIndices?.[index] ?? index;
        return duplicates.skipDuplicates.has(originalIndex) || duplicates.overrideDuplicates.has(originalIndex);
      });

      console.log(
        `[DuplicateAndFinalReview] Duplicates stage - Total: ${totalDuplicates}, Resolved: ${resolvedCount}, Complete: ${isComplete}`
      );
      console.log(
        `[DuplicateAndFinalReview] Skip duplicates (original indices):`,
        Array.from(duplicates.skipDuplicates)
      );
      console.log(
        `[DuplicateAndFinalReview] Override duplicates (original indices):`,
        Array.from(duplicates.overrideDuplicates)
      );
      console.log(`[DuplicateAndFinalReview] Duplicate original indices:`, duplicates.duplicateOriginalIndices);

      return isComplete;
    } else if (currentStage === "final_review") {
      console.log(`[DuplicateAndFinalReview] Final review stage - Complete: ${final_review.isComplete}`);
      return final_review.isComplete;
    }

    console.log(`[DuplicateAndFinalReview] Unknown stage: ${currentStage}`);
    console.log(`[DuplicateAndFinalReview] ===== END STAGE COMPLETION CHECK =====`);
    return false;
  }, [stagedPreview]); // Changed dependency from [currentStage, duplicates, final_review] to [stagedPreview]

  // Update stage completion when it changes
  React.useEffect(() => {
    onStageUpdate(currentStage, isStageComplete);
  }, [isStageComplete, onStageUpdate, currentStage]);

  // Handle duplicate resolution
  const handleDuplicateAction = useCallback(
    async (itemIndex: number, action: "skip" | "override") => {
      const updatedPreview = { ...stagedPreview };
      const { duplicates } = updatedPreview.progressState.stageData;

      // Get the original index from the duplicateOriginalIndices array
      const originalIndex = duplicates.duplicateOriginalIndices?.[itemIndex] ?? itemIndex;

      // Clear previous actions for this original index
      duplicates.skipDuplicates.delete(originalIndex);
      duplicates.overrideDuplicates.delete(originalIndex);

      // Set new action using original index
      if (action === "skip") {
        duplicates.skipDuplicates.add(originalIndex);
      } else {
        duplicates.overrideDuplicates.add(originalIndex);
      }

      updatedPreview.lastUpdated = new Date();
      onDataUpdate(updatedPreview);

      // Trigger re-analysis of subsequent stages to filter out skipped duplicates
      try {
        console.log(
          `[DuplicateAndFinalReview] Triggering re-analysis after duplicate action: ${action} for original index ${originalIndex} (item index ${itemIndex})`
        );
        await triggerStageReAnalysis(updatedPreview, "over_allotment");
      } catch (error) {
        console.error("Error triggering re-analysis:", error);
      }
    },
    [stagedPreview, onDataUpdate]
  );

  // Handle skipping all duplicates at once
  const handleSkipAllDuplicates = useCallback(async () => {
    const updatedPreview = { ...stagedPreview };
    const { duplicates } = updatedPreview.progressState.stageData;

    // Clear all previous actions
    duplicates.skipDuplicates.clear();
    duplicates.overrideDuplicates.clear();

    // Skip all duplicate items using their original indices
    duplicates.duplicateItems.forEach((_, index) => {
      const originalIndex = duplicates.duplicateOriginalIndices?.[index] ?? index;
      duplicates.skipDuplicates.add(originalIndex);
    });

    updatedPreview.lastUpdated = new Date();
    onDataUpdate(updatedPreview);

    // Trigger re-analysis of subsequent stages to filter out skipped duplicates
    try {
      console.log(
        `[DuplicateAndFinalReview] Triggering re-analysis after skipping all ${
          duplicates.duplicateItems.length
        } duplicates with original indices: [${Array.from(duplicates.skipDuplicates).join(", ")}]`
      );
      await triggerStageReAnalysis(updatedPreview, "over_allotment");
    } catch (error) {
      console.error("Error triggering re-analysis:", error);
    }
  }, [stagedPreview, onDataUpdate]);

  // Handle clearing all duplicate actions (reset to unresolved)
  const handleClearAllDuplicateActions = useCallback(async () => {
    const updatedPreview = { ...stagedPreview };
    const { duplicates } = updatedPreview.progressState.stageData;

    // Clear all actions
    duplicates.skipDuplicates.clear();
    duplicates.overrideDuplicates.clear();

    updatedPreview.lastUpdated = new Date();
    onDataUpdate(updatedPreview);

    // Trigger re-analysis of subsequent stages to include previously skipped duplicates
    try {
      console.log(`[DuplicateAndFinalReview] Triggering re-analysis after clearing all duplicate actions`);
      await triggerStageReAnalysis(updatedPreview, "over_allotment");
    } catch (error) {
      console.error("Error triggering re-analysis:", error);
    }
  }, [stagedPreview, onDataUpdate]);

  // Handle final import execution
  const handleExecuteImport = useCallback(async () => {
    try {
      setIsImporting(true);
      setImportError(null);

      const { db_reconciliation } = stagedPreview.progressState.stageData;
      const { approvedItems, waitlistedItems } = final_review;
      const allItemsToImport = [...approvedItems, ...waitlistedItems];

      let totalProcessed = 0;
      let dbChangesResult = null;

      // STEP 1: Execute queued database changes first (if any)
      if (db_reconciliation.queuedChanges.length > 0) {
        console.log(`[FinalReview] Executing ${db_reconciliation.queuedChanges.length} database changes...`);

        // Get admin user ID from auth context
        const adminUserId = adminUser?.id;

        if (!adminUserId) {
          setImportError("Admin user not authenticated. Please log in again.");
          return;
        }

        dbChangesResult = await executeQueuedDbChanges(db_reconciliation.queuedChanges, adminUserId);

        if (!dbChangesResult.success) {
          setImportError(`Database changes failed: ${dbChangesResult.errors.join(", ")}`);
          return;
        }

        totalProcessed += dbChangesResult.executedCount;
        console.log(`[FinalReview] Successfully executed ${dbChangesResult.executedCount} database changes`);
      }

      // STEP 2: Execute new imports (if any)
      let importResult = null;
      if (allItemsToImport.length > 0) {
        console.log(`[FinalReview] Importing ${allItemsToImport.length} new requests...`);

        // Create import preview items with resolved member assignments
        const importPreviewItems = allItemsToImport.map((item) => {
          const originalIndex = stagedPreview.originalItems.findIndex((orig) => orig === item);
          const resolvedMember = stagedPreview.progressState.stageData.unmatched.resolvedAssignments[originalIndex];

          if (resolvedMember) {
            return {
              ...item,
              matchedMember: {
                status: "matched" as const,
                member: resolvedMember,
              },
            };
          }
          return item;
        });

        // Get indices for import
        const selectedIndices = allItemsToImport.map((_, index) => index);

        // Execute the batch import
        importResult = await insertBatchPldSdvRequests(importPreviewItems, selectedIndices);

        if (!importResult.success) {
          setImportError(`Import failed: ${importResult.errorMessages.join(", ")}`);
          return;
        }

        totalProcessed += importResult.insertedCount;
        console.log(`[FinalReview] Successfully imported ${importResult.insertedCount} new requests`);
      }

      // STEP 3: Report overall success
      onImportComplete({
        success: true,
        count: totalProcessed,
      });
    } catch (err: any) {
      console.error("[FinalReview] Error during execution:", err);
      setImportError(err.message || "An error occurred during processing");
    } finally {
      setIsImporting(false);
    }
  }, [final_review, stagedPreview, onImportComplete]);

  // Render duplicate item
  const renderDuplicateItem = (item: ImportPreviewItem, itemIndex: number) => {
    const originalIndex = duplicates.duplicateOriginalIndices?.[itemIndex] ?? itemIndex;
    const isSkipped = duplicates.skipDuplicates.has(originalIndex);
    const isOverridden = duplicates.overrideDuplicates.has(originalIndex);
    const isResolved = isSkipped || isOverridden;

    return (
      <View key={itemIndex} style={[styles.duplicateItem, isResolved && styles.resolvedItem]}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <ThemedText style={styles.itemTitle}>
              {item.firstName} {item.lastName} - {item.leaveType}
            </ThemedText>
            <ThemedText style={styles.itemDate}>{format(item.requestDate, "MMM d, yyyy")}</ThemedText>
          </View>

          <View style={styles.statusIndicator}>
            {isResolved ? (
              <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].success} />
            ) : (
              <Ionicons name="warning" size={24} color={Colors[colorScheme].warning} />
            )}
          </View>
        </View>

        <View style={styles.duplicateWarning}>
          <Ionicons name="copy" size={16} color={Colors[colorScheme].warning} />
          <ThemedText style={styles.warningText}>
            Potential duplicate: This member already has a request on this date
          </ThemedText>
        </View>

        {/* Resolution Status */}
        {isSkipped && (
          <View style={styles.resolutionStatus}>
            <ThemedText style={styles.skippedText}>⊘ Skipped - will not be imported</ThemedText>
          </View>
        )}

        {isOverridden && (
          <View style={styles.resolutionStatus}>
            <ThemedText style={styles.overrideText}>✓ Override - will be imported despite duplicate</ThemedText>
          </View>
        )}

        {/* Actions */}
        {!isResolved && (
          <View style={styles.actions}>
            <Button
              onPress={() => handleDuplicateAction(itemIndex, "skip")}
              variant="secondary"
              style={styles.actionButton}
            >
              Skip Duplicate
            </Button>
            <Button
              onPress={() => handleDuplicateAction(itemIndex, "override")}
              variant="primary"
              style={styles.actionButton}
            >
              Import Anyway
            </Button>
          </View>
        )}
      </View>
    );
  };

  // Render final review summary
  const renderFinalReviewSummary = () => {
    const { summary, approvedItems, waitlistedItems, skippedItems, allotmentChanges } = final_review;
    const { db_reconciliation } = stagedPreview.progressState.stageData;
    const hasDbChanges = db_reconciliation.queuedChanges.length > 0;

    return (
      <View style={styles.finalSummaryContainer}>
        <ThemedText style={styles.finalSummaryTitle}>Final Import Summary</ThemedText>

        <View style={styles.summaryStats}>
          <View style={styles.statItem}>
            <ThemedText style={styles.statNumber}>{summary.totalToImport}</ThemedText>
            <ThemedText style={styles.statLabel}>Total to Import</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText style={[styles.statNumber, styles.approvedText]}>{summary.approvedCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Approved</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText style={[styles.statNumber, styles.waitlistedText]}>{summary.waitlistedCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Waitlisted</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText style={[styles.statNumber, styles.skippedText]}>{summary.skippedCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Skipped</ThemedText>
          </View>
        </View>

        {allotmentChanges.length > 0 && (
          <View style={styles.allotmentChangesSection}>
            <ThemedText style={styles.sectionTitle}>Allotment Changes</ThemedText>
            {allotmentChanges.map((change, index) => (
              <View key={index} style={styles.allotmentChange}>
                <ThemedText>
                  {format(new Date(change.date), "MMM d, yyyy")}: {change.oldAllotment} → {change.newAllotment}
                </ThemedText>
              </View>
            ))}
          </View>
        )}

        {hasDbChanges && (
          <View style={styles.allotmentChangesSection}>
            <ThemedText style={styles.sectionTitle}>Database Changes</ThemedText>
            <ThemedText style={styles.dbChangesSubtitle}>
              {db_reconciliation.queuedChanges.length} existing request(s) will be updated:
            </ThemedText>
            {db_reconciliation.queuedChanges.slice(0, 5).map((change, index) => (
              <View key={index} style={styles.dbChangeItem}>
                <ThemedText style={styles.dbChangeText}>
                  • {change.currentStatus} → {change.newStatus} ({format(new Date(change.requestDate), "MMM d")})
                </ThemedText>
              </View>
            ))}
            {db_reconciliation.queuedChanges.length > 5 && (
              <ThemedText style={styles.moreItems}>
                ... and {db_reconciliation.queuedChanges.length - 5} more
              </ThemedText>
            )}
          </View>
        )}

        <View style={styles.detailsSection}>
          <ThemedText style={styles.sectionTitle}>Import Details</ThemedText>

          {approvedItems.length > 0 && (
            <View style={styles.detailGroup}>
              <ThemedText style={[styles.detailGroupTitle, styles.approvedText]}>
                Approved Requests ({approvedItems.length})
              </ThemedText>
              {approvedItems.slice(0, 5).map((item, index) => (
                <ThemedText key={index} style={styles.detailItem}>
                  • {item.firstName} {item.lastName} - {item.leaveType} on {format(item.requestDate, "MMM d")}
                </ThemedText>
              ))}
              {approvedItems.length > 5 && (
                <ThemedText style={styles.moreItems}>... and {approvedItems.length - 5} more</ThemedText>
              )}
            </View>
          )}

          {waitlistedItems.length > 0 && (
            <View style={styles.detailGroup}>
              <ThemedText style={[styles.detailGroupTitle, styles.waitlistedText]}>
                Waitlisted Requests ({waitlistedItems.length})
              </ThemedText>
              {waitlistedItems.slice(0, 5).map((item, index) => (
                <ThemedText key={index} style={styles.detailItem}>
                  • {item.firstName} {item.lastName} - {item.leaveType} on {format(item.requestDate, "MMM d")} (Position
                  #{item.waitlistPosition})
                </ThemedText>
              ))}
              {waitlistedItems.length > 5 && (
                <ThemedText style={styles.moreItems}>... and {waitlistedItems.length - 5} more</ThemedText>
              )}
            </View>
          )}
        </View>

        {/* Import Button */}
        <View style={styles.importButtonContainer}>
          <Button
            onPress={handleExecuteImport}
            disabled={isImporting || (summary.totalToImport === 0 && !hasDbChanges)}
            variant="primary"
            style={styles.importButton}
          >
            {isImporting
              ? "Processing..."
              : hasDbChanges && summary.totalToImport === 0
              ? `Apply ${db_reconciliation.queuedChanges.length} Database Changes`
              : `Import ${summary.totalToImport} Requests${
                  hasDbChanges ? ` + ${db_reconciliation.queuedChanges.length} DB Changes` : ""
                }`}
          </Button>
        </View>

        {importError && (
          <View style={styles.importErrorContainer}>
            <Ionicons name="warning" size={20} color={Colors[colorScheme].error} />
            <ThemedText style={styles.errorText}>{importError}</ThemedText>
          </View>
        )}
      </View>
    );
  };

  // Render duplicates stage
  if (currentStage === "duplicates") {
    if (duplicates.duplicateItems.length === 0) {
      return (
        <ThemedView style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={48} color={Colors[colorScheme].success} />
          <ThemedText style={styles.emptyTitle}>No Duplicates Found</ThemedText>
          <ThemedText style={styles.emptyDescription}>
            No duplicate requests detected. Ready to proceed to final review.
          </ThemedText>
        </ThemedView>
      );
    }

    const totalDuplicates = duplicates.duplicateItems.length;
    const resolvedCount = duplicates.skipDuplicates.size + duplicates.overrideDuplicates.size;

    return (
      <ThemedView style={styles.container}>
        <View style={styles.summaryContainer}>
          <ThemedText style={styles.summaryTitle}>Duplicate Detection</ThemedText>
          <ThemedText>Total duplicates: {totalDuplicates}</ThemedText>
          <ThemedText style={styles.successText}>Resolved: {resolvedCount}</ThemedText>
          <ThemedText style={styles.warningText}>Remaining: {totalDuplicates - resolvedCount}</ThemedText>

          {/* Bulk Actions */}
          {totalDuplicates > 0 && (
            <View style={styles.bulkActionsContainer}>
              <ThemedText style={styles.bulkActionsTitle}>Bulk Actions:</ThemedText>
              <View style={styles.bulkActionsButtons}>
                <Button
                  onPress={handleSkipAllDuplicates}
                  variant="secondary"
                  style={styles.bulkActionButton}
                  disabled={isStageComplete}
                >
                  <Ionicons name="close-circle" size={16} color={Colors[colorScheme].text} />
                  <ThemedText style={styles.bulkActionButtonText}>Skip All Duplicates</ThemedText>
                </Button>

                {resolvedCount > 0 && (
                  <Button onPress={handleClearAllDuplicateActions} variant="secondary" style={styles.bulkActionButton}>
                    <Ionicons name="refresh" size={16} color={Colors[colorScheme].text} />
                    <ThemedText style={styles.bulkActionButtonText}>Reset All</ThemedText>
                  </Button>
                )}
              </View>
            </View>
          )}

          {isStageComplete && (
            <View style={styles.completionBanner}>
              <Ionicons name="checkmark-circle" size={20} color={Colors[colorScheme].success} />
              <ThemedText style={styles.completionText}>All duplicates resolved! Ready to continue.</ThemedText>
            </View>
          )}
        </View>

        <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
          {duplicates.duplicateItems.map((item, index) => renderDuplicateItem(item, index))}
        </ScrollView>
      </ThemedView>
    );
  }

  // Render final review stage
  if (currentStage === "final_review") {
    return (
      <ThemedView style={styles.container}>
        {renderFinalReviewSummary()}

        {isImporting && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
              <ThemedText style={styles.loadingText}>Importing requests...</ThemedText>
            </View>
          </View>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.errorContainer}>
      <ThemedText style={styles.errorText}>Unknown stage: {currentStage}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  completionBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.dark.success + "20",
    borderRadius: 8,
  },
  completionText: {
    marginLeft: 8,
    color: Colors.dark.success,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 16,
  },
  itemsList: {
    flex: 1,
  },
  duplicateItem: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.warning,
  },
  resolvedItem: {
    borderLeftColor: Colors.dark.success,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
  statusIndicator: {
    marginLeft: 12,
  },
  duplicateWarning: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    padding: 8,
    backgroundColor: Colors.dark.warning + "20",
    borderRadius: 4,
  },
  warningText: {
    marginLeft: 8,
    color: Colors.dark.warning,
    fontSize: 14,
  },
  resolutionStatus: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    marginBottom: 12,
  },
  skippedText: {
    color: Colors.dark.textDim,
  },
  overrideText: {
    color: Colors.dark.success,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  finalSummaryContainer: {
    flex: 1,
  },
  finalSummaryTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  summaryStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  allotmentChangesSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  allotmentChange: {
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 4,
    marginBottom: 4,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailGroup: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  detailGroupTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  detailItem: {
    fontSize: 14,
    marginBottom: 4,
    color: Colors.dark.textDim,
  },
  moreItems: {
    fontSize: 14,
    fontStyle: "italic",
    color: Colors.dark.textDim,
    marginTop: 4,
  },
  importButtonContainer: {
    marginBottom: 16,
  },
  importButton: {
    paddingVertical: 16,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.dark.background + "CC",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingContent: {
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "500",
  },
  successText: {
    color: Colors.dark.success,
  },
  waitlistedText: {
    color: Colors.dark.warning,
  },
  approvedText: {
    color: Colors.dark.success,
  },
  importErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.dark.error + "20",
    borderRadius: 8,
  },
  bulkActionsContainer: {
    marginBottom: 16,
  },
  bulkActionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  bulkActionsButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  bulkActionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  bulkActionButtonText: {
    marginLeft: 8,
    color: Colors.dark.text,
    fontWeight: "500",
  },
  dbChangesSubtitle: {
    fontSize: 14,
    color: Colors.dark.textDim,
    marginBottom: 8,
  },
  dbChangeItem: {
    padding: 4,
    marginLeft: 8,
  },
  dbChangeText: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
});
