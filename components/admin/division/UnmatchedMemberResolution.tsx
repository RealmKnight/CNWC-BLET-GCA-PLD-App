import React, { useState, useCallback, useMemo } from "react";
import { StyleSheet, View, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { StagedImportPreview, ImportStage, ImportPreviewItem } from "@/utils/importPreviewService";
import { findMembersByName, MemberData } from "@/utils/memberLookup";

interface UnmatchedMemberResolutionProps {
  stagedPreview: StagedImportPreview;
  onStageUpdate: (stage: ImportStage, isComplete: boolean) => void;
  onDataUpdate: (preview: StagedImportPreview) => void;
}

export function UnmatchedMemberResolution({
  stagedPreview,
  onStageUpdate,
  onDataUpdate,
}: UnmatchedMemberResolutionProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [searchResults, setSearchResults] = useState<Record<number, MemberData[]>>({});
  const [searchingIndex, setSearchingIndex] = useState<number | null>(null);

  const { unmatched } = stagedPreview.progressState.stageData;

  // Check if stage is complete
  const isStageComplete = useMemo(() => {
    // Extract the latest unmatched data from stagedPreview
    const unmatched = stagedPreview.progressState.stageData.unmatched;

    console.log(`[UnmatchedMemberResolution] ===== STAGE COMPLETION CHECK =====`);
    console.log(`[UnmatchedMemberResolution] useMemo triggered - stagedPreview changed`);
    console.log(`[UnmatchedMemberResolution] Checking stage completion...`);
    console.log(`[UnmatchedMemberResolution] Total unmatched items: ${unmatched.unmatchedItems.length}`);
    console.log(
      `[UnmatchedMemberResolution] Resolved assignments count: ${Object.keys(unmatched.resolvedAssignments).length}`
    );
    console.log(`[UnmatchedMemberResolution] Skipped items count: ${unmatched.skippedItems.size}`);

    // Simple approach: if we have resolved assignments or skipped items for all unmatched items, we're complete
    const totalUnmatched = unmatched.unmatchedItems.length;
    const totalResolved = Object.keys(unmatched.resolvedAssignments).length;
    const totalSkipped = unmatched.skippedItems.size;
    const totalHandled = totalResolved + totalSkipped;

    console.log(`[UnmatchedMemberResolution] Calculation details:`);
    console.log(`  - totalUnmatched: ${totalUnmatched}`);
    console.log(`  - totalResolved: ${totalResolved}`);
    console.log(`  - totalSkipped: ${totalSkipped}`);
    console.log(`  - totalHandled: ${totalHandled}`);
    console.log(`  - Comparison: ${totalHandled} >= ${totalUnmatched}`);

    const isComplete = totalHandled >= totalUnmatched;
    console.log(`[UnmatchedMemberResolution] Final result: ${isComplete}`);

    // Additional debugging - let's check if the issue is with the data structure
    console.log(`[UnmatchedMemberResolution] Resolved assignments keys:`, Object.keys(unmatched.resolvedAssignments));
    console.log(`[UnmatchedMemberResolution] Skipped items array:`, Array.from(unmatched.skippedItems));
    console.log(`[UnmatchedMemberResolution] ===== END STAGE COMPLETION CHECK =====`);

    return isComplete;
  }, [stagedPreview]);

  // Update stage completion when it changes
  React.useEffect(() => {
    console.log(`[UnmatchedMemberResolution] Updating stage completion: ${isStageComplete}`);
    onStageUpdate("unmatched", isStageComplete);
  }, [isStageComplete, onStageUpdate]);

  // Handle member search
  const handleSearch = useCallback(
    async (itemIndex: number, query: string) => {
      setSearchQueries((prev) => ({ ...prev, [itemIndex]: query }));

      if (query.length < 3) {
        setSearchResults((prev) => ({ ...prev, [itemIndex]: [] }));
        return;
      }

      try {
        setSearchingIndex(itemIndex);

        // Parse query for first/last name
        const [firstName, lastName] = query.split(" ");
        let results: MemberData[] = [];

        if (lastName) {
          const memberMatches = await findMembersByName(firstName, lastName, stagedPreview.divisionId);
          results = memberMatches.map((match) => match.member);
        } else {
          // Search as both first and last name
          const firstNameResults = await findMembersByName(query, "", stagedPreview.divisionId);
          const lastNameResults = await findMembersByName("", query, stagedPreview.divisionId);

          const combinedResults = [...firstNameResults, ...lastNameResults]
            .map((match) => match.member)
            .filter((member, index, self) => index === self.findIndex((m) => m.pin_number === member.pin_number));
          results = combinedResults;
        }

        setSearchResults((prev) => ({ ...prev, [itemIndex]: results }));
      } catch (error) {
        console.error("Error searching members:", error);
        setSearchResults((prev) => ({ ...prev, [itemIndex]: [] }));
      } finally {
        setSearchingIndex(null);
      }
    },
    [stagedPreview.divisionId]
  );

  // Handle member assignment
  const handleAssignMember = useCallback(
    (itemIndex: number, member: MemberData) => {
      const originalIndex = stagedPreview.originalItems.findIndex(
        (item) => item === unmatched.unmatchedItems[itemIndex]
      );

      const updatedPreview = { ...stagedPreview };
      updatedPreview.progressState.stageData.unmatched.resolvedAssignments[originalIndex] = member;
      updatedPreview.lastUpdated = new Date();

      // Clear search state
      setSearchQueries((prev) => ({ ...prev, [itemIndex]: "" }));
      setSearchResults((prev) => ({ ...prev, [itemIndex]: [] }));

      onDataUpdate(updatedPreview);
    },
    [stagedPreview, unmatched.unmatchedItems, onDataUpdate]
  );

  // Handle skipping an item
  const handleSkipItem = useCallback(
    (itemIndex: number) => {
      const originalIndex = stagedPreview.originalItems.findIndex(
        (item) => item === unmatched.unmatchedItems[itemIndex]
      );

      const updatedPreview = { ...stagedPreview };
      updatedPreview.progressState.stageData.unmatched.skippedItems.add(originalIndex);
      updatedPreview.lastUpdated = new Date();

      onDataUpdate(updatedPreview);
    },
    [stagedPreview, unmatched.unmatchedItems, onDataUpdate]
  );

  // Handle clearing an assignment
  const handleClearAssignment = useCallback(
    (itemIndex: number) => {
      const originalIndex = stagedPreview.originalItems.findIndex(
        (item) => item === unmatched.unmatchedItems[itemIndex]
      );

      const updatedPreview = { ...stagedPreview };
      delete updatedPreview.progressState.stageData.unmatched.resolvedAssignments[originalIndex];
      updatedPreview.progressState.stageData.unmatched.skippedItems.delete(originalIndex);
      updatedPreview.lastUpdated = new Date();

      onDataUpdate(updatedPreview);
    },
    [stagedPreview, unmatched.unmatchedItems, onDataUpdate]
  );

  // Render member search interface
  const renderMemberSearch = (itemIndex: number) => (
    <View style={styles.searchContainer}>
      <TextInput
        value={searchQueries[itemIndex] || ""}
        onChangeText={(text) => handleSearch(itemIndex, text)}
        placeholder="Search by name (first last) or PIN"
        style={styles.searchInput}
        placeholderTextColor={Colors[colorScheme].textDim}
      />

      {searchingIndex === itemIndex && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Searching...</ThemedText>
        </View>
      )}

      {(searchResults[itemIndex] || []).length > 0 && (
        <View style={styles.searchResultsContainer}>
          {(searchResults[itemIndex] || []).map((member, idx) => (
            <ThemedTouchableOpacity
              key={`${itemIndex}-${member.pin_number}-${idx}`}
              style={styles.resultItem}
              onPress={() => {
                console.log("Pressed member:", member.last_name, member.first_name);
                handleAssignMember(itemIndex, member);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.resultContent}>
                <ThemedText style={styles.resultName}>
                  {member.last_name}, {member.first_name}
                </ThemedText>
                <ThemedText style={styles.resultPin}>PIN: {member.pin_number}</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors[colorScheme].textDim} />
            </ThemedTouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // Render unmatched item
  const renderUnmatchedItem = (item: ImportPreviewItem, itemIndex: number) => {
    const originalIndex = stagedPreview.originalItems.findIndex((originalItem) => originalItem === item);
    const assignedMember = unmatched.resolvedAssignments[originalIndex];
    const isSkipped = unmatched.skippedItems.has(originalIndex);
    const isResolved = assignedMember || isSkipped;

    return (
      <View key={itemIndex} style={[styles.unmatchedItem, isResolved && styles.resolvedItem]}>
        {/* Item Header */}
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

        {/* Match Status */}
        <View style={styles.matchStatus}>
          <ThemedText style={styles.statusLabel}>Match Status:</ThemedText>
          {item.matchedMember.status === "unmatched" && (
            <ThemedText style={styles.errorText}>No matching member found</ThemedText>
          )}
          {item.matchedMember.status === "multiple_matches" && (
            <View>
              <ThemedText style={styles.warningText}>Multiple potential matches found:</ThemedText>
              <View style={styles.multipleMatches}>
                {item.matchedMember.possibleMatches?.map((member, idx) => (
                  <ThemedTouchableOpacity
                    key={idx}
                    style={styles.matchOption}
                    onPress={() => handleAssignMember(itemIndex, member)}
                  >
                    <ThemedText>
                      {member.last_name}, {member.first_name} (PIN: {member.pin_number})
                    </ThemedText>
                  </ThemedTouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Resolution Status */}
        {assignedMember && (
          <View style={styles.resolutionStatus}>
            <ThemedText style={styles.successText}>
              ✓ Assigned to: {assignedMember.last_name}, {assignedMember.first_name} (PIN: {assignedMember.pin_number})
            </ThemedText>
            <ThemedTouchableOpacity style={styles.clearButton} onPress={() => handleClearAssignment(itemIndex)}>
              <ThemedText style={styles.clearButtonText}>Clear</ThemedText>
            </ThemedTouchableOpacity>
          </View>
        )}

        {isSkipped && (
          <View style={styles.resolutionStatus}>
            <ThemedText style={styles.skippedText}>⊘ Skipped - will not be imported</ThemedText>
            <ThemedTouchableOpacity style={styles.clearButton} onPress={() => handleClearAssignment(itemIndex)}>
              <ThemedText style={styles.clearButtonText}>Undo Skip</ThemedText>
            </ThemedTouchableOpacity>
          </View>
        )}

        {/* Actions */}
        {!isResolved && (
          <View style={styles.actions}>
            <View style={styles.searchSection}>
              <ThemedText style={styles.sectionLabel}>Search for Member:</ThemedText>
              {renderMemberSearch(itemIndex)}
            </View>

            <View style={styles.actionButtons}>
              <Button onPress={() => handleSkipItem(itemIndex)} variant="secondary" style={styles.actionButton}>
                Skip Request
              </Button>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Render summary
  const renderSummary = () => {
    const totalUnmatched = unmatched.unmatchedItems.length;
    const resolvedCount = Object.keys(unmatched.resolvedAssignments).length;
    const skippedCount = unmatched.skippedItems.size;
    const remainingCount = totalUnmatched - resolvedCount - skippedCount;

    // Debug logging
    console.log(
      `[UnmatchedMemberResolution] Summary - Total: ${totalUnmatched}, Resolved: ${resolvedCount}, Skipped: ${skippedCount}, Remaining: ${remainingCount}`
    );
    console.log(`[UnmatchedMemberResolution] Stage complete: ${isStageComplete}`);
    console.log(`[UnmatchedMemberResolution] Resolved assignments:`, unmatched.resolvedAssignments);
    console.log(`[UnmatchedMemberResolution] Skipped items:`, Array.from(unmatched.skippedItems));

    return (
      <View style={styles.summaryContainer}>
        <ThemedText style={styles.summaryTitle}>Unmatched Members Resolution</ThemedText>
        <ThemedText>Total unmatched: {totalUnmatched}</ThemedText>
        <ThemedText style={styles.successText}>Resolved: {resolvedCount}</ThemedText>
        <ThemedText style={styles.skippedText}>Skipped: {skippedCount}</ThemedText>
        <ThemedText style={styles.warningText}>Remaining: {remainingCount}</ThemedText>

        {/* Debug information */}
        <ThemedText style={styles.debugText}>Stage Complete: {isStageComplete ? "YES" : "NO"}</ThemedText>

        {isStageComplete && (
          <View style={styles.completionBanner}>
            <Ionicons name="checkmark-circle" size={20} color={Colors[colorScheme].success} />
            <ThemedText style={styles.completionText}>All unmatched members resolved! Ready to continue.</ThemedText>
          </View>
        )}
      </View>
    );
  };

  if (unmatched.unmatchedItems.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <Ionicons name="checkmark-circle" size={48} color={Colors[colorScheme].success} />
        <ThemedText style={styles.emptyTitle}>No Unmatched Members</ThemedText>
        <ThemedText style={styles.emptyDescription}>
          All members were successfully matched. Ready to proceed to the next stage.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderSummary()}

      <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
        {unmatched.unmatchedItems.map((item, index) => renderUnmatchedItem(item, index))}
      </ScrollView>
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
  itemsList: {
    flex: 1,
  },
  unmatchedItem: {
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
  matchStatus: {
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  multipleMatches: {
    marginTop: 8,
  },
  matchOption: {
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 4,
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.dark.tint,
  },
  resolutionStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  clearButton: {
    padding: 8,
    backgroundColor: Colors.dark.error,
    borderRadius: 4,
  },
  clearButtonText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: "600",
  },
  actions: {
    marginTop: 12,
  },
  searchSection: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  searchContainer: {
    marginBottom: 8,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  searchResultsContainer: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.2)",
    maxHeight: 200,
    overflow: "hidden",
  },
  resultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    backgroundColor: Colors.dark.background,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    minWidth: 100,
  },
  successText: {
    color: Colors.dark.success,
  },
  warningText: {
    color: Colors.dark.warning,
  },
  errorText: {
    color: Colors.dark.error,
  },
  skippedText: {
    color: Colors.dark.textDim,
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resultContent: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  resultName: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  resultPin: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  loadingText: {
    marginTop: 8,
    color: Colors.dark.text,
  },
  debugText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    fontStyle: "italic",
    marginTop: 4,
  },
});
