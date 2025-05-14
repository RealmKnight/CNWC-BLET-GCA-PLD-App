import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator, Platform, Switch, TextInput, FlatList } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { ImportPreviewItem, MatchedMemberResult } from "@/utils/importPreviewService";
import { insertBatchPldSdvRequests } from "@/utils/databaseApiLayer";
import { findMembersByName, MemberData } from "@/utils/memberLookup";

interface ImportPreviewComponentProps {
  previewData: ImportPreviewItem[];
  onClose: () => void;
  onImportComplete: (result: { success: boolean; count: number }) => void;
}

export function ImportPreviewComponent({ previewData, onClose, onImportComplete }: ImportPreviewComponentProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  // State to track which items are selected for import
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Item-specific search states
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
  const [itemSearchResults, setItemSearchResults] = useState<Record<number, MemberData[]>>({});
  const [searchingItemIndex, setSearchingItemIndex] = useState<number | null>(null);
  const [memberAssignments, setMemberAssignments] = useState<Record<number, MemberData>>({});

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50); // Show 50 items per page

  // Initialize selectedItems with all non-duplicate items
  useEffect(() => {
    const initialSelected = previewData
      .map((item, index) => (!item.isPotentialDuplicate ? index : null))
      .filter((index): index is number => index !== null);

    setSelectedItems(initialSelected);
    // Reset to first page when new data arrives
    setCurrentPage(1);
  }, [previewData]);

  // Pre-process request dates to avoid repeated parsing during sorting
  const itemsWithProcessedDates = useMemo(() => {
    return previewData.map((item, index) => ({
      item,
      originalIndex: index,
      // Pre-parse date once
      requestDateTimestamp: new Date(item.requestDate).getTime(),
    }));
  }, [previewData]);

  // Sort preview data for display - optimized to avoid repeated indexOf operations
  const sortedItemsWithIndices = useMemo(() => {
    // We're using the pre-processed items with date timestamps
    const itemsToSort = [...itemsWithProcessedDates];

    // Sort these objects
    return itemsToSort.sort((a, b) => {
      const itemA = a.item;
      const itemB = b.item;
      const indexA = a.originalIndex;
      const indexB = b.originalIndex;

      const isUnmatchedA = itemA.matchedMember.status === "unmatched" && !memberAssignments[indexA];
      const isUnmatchedB = itemB.matchedMember.status === "unmatched" && !memberAssignments[indexB];
      const isMultipleMatchA = itemA.matchedMember.status === "multiple_matches" && !memberAssignments[indexA];
      const isMultipleMatchB = itemB.matchedMember.status === "multiple_matches" && !memberAssignments[indexB];
      const isDuplicateA = itemA.isPotentialDuplicate;
      const isDuplicateB = itemB.isPotentialDuplicate;

      // 1. Unmatched
      if (isUnmatchedA && !isUnmatchedB) return -1;
      if (!isUnmatchedA && isUnmatchedB) return 1;

      // 2. Multiple Matches
      if (isMultipleMatchA && !isMultipleMatchB) return -1;
      if (!isMultipleMatchA && isMultipleMatchB) return 1;

      // 3. Potential Duplicates
      if (isDuplicateA && !isDuplicateB) return -1;
      if (!isDuplicateA && isDuplicateB) return 1;

      // 4. Sort by request date as fallback - using pre-computed timestamps
      return a.requestDateTimestamp - b.requestDateTimestamp;
    });
  }, [previewData, memberAssignments, itemsWithProcessedDates]);

  // Apply pagination to the sorted items
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedItemsWithIndices.slice(startIndex, endIndex);
  }, [sortedItemsWithIndices, currentPage, itemsPerPage]);

  // Calculate total pages
  const totalPages = Math.ceil(previewData.length / itemsPerPage);

  // Handle page navigation
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Handle item selection toggle
  const toggleItemSelection = (index: number) => {
    setSelectedItems((current) => {
      if (current.includes(index)) {
        return current.filter((i) => i !== index);
      } else {
        return [...current, index];
      }
    });
  };

  // Handle "Select All" / "Deselect All"
  const toggleSelectAll = () => {
    if (selectedItems.length === previewData.length) {
      // Deselect all
      setSelectedItems([]);
    } else {
      // Select all
      setSelectedItems(previewData.map((_, index) => index));
    }
  };

  // Handle member search for unmatched or multiple matches
  const handleSearch = useCallback(async (itemIndex: number, query: string) => {
    setSearchQueries((prev) => ({ ...prev, [itemIndex]: query }));
    if (query.length < 3) {
      setItemSearchResults((prev) => ({ ...prev, [itemIndex]: [] }));
      setSearchingItemIndex(null);
      return;
    }

    try {
      setSearchingItemIndex(itemIndex);
      // Search for members by name
      const [firstName, lastName] = query.split(" ");
      let results: MemberData[] = [];
      if (lastName) {
        const memberMatches = await findMembersByName(firstName, lastName);
        results = memberMatches.map((match) => match.member);
      } else {
        // If only one word is typed, search as both first and last name
        const firstNameResults = await findMembersByName(query, "");
        const lastNameResults = await findMembersByName("", query);

        const combinedResults = [...firstNameResults, ...lastNameResults]
          .map((match) => match.member)
          // Remove duplicates by pin_number
          .filter((member, index, self) => index === self.findIndex((m) => m.pin_number === member.pin_number));
        results = combinedResults;
      }
      setItemSearchResults((prev) => ({ ...prev, [itemIndex]: results }));
    } catch (err) {
      console.error("Error searching members:", err);
      setItemSearchResults((prev) => ({ ...prev, [itemIndex]: [] }));
    } finally {
      setSearchingItemIndex(null);
    }
  }, []);

  // Handle member assignment for unmatched items
  const assignMember = (itemIndex: number, member: MemberData) => {
    setMemberAssignments((current) => ({
      ...current,
      [itemIndex]: member,
    }));
    setSearchQueries((prev) => ({ ...prev, [itemIndex]: "" })); // Clear search query for this item
    setItemSearchResults((prev) => ({ ...prev, [itemIndex]: [] })); // Clear search results for this item
    if (searchingItemIndex === itemIndex) {
      setSearchingItemIndex(null);
    }
  };

  // Handle submit (actual import)
  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      setError("Please select at least one item to import");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Create a copy of previewData with our member assignments
      const updatedPreviewData = [...previewData].map((item, index) => {
        if (memberAssignments[index]) {
          // Override the matched member with our assignment
          return {
            ...item,
            matchedMember: {
              status: "matched" as const,
              member: memberAssignments[index],
            },
          };
        }
        return item;
      });

      // Filter out items that still have unresolved matches
      const validSelectedItems = selectedItems.filter((index) => {
        const item = updatedPreviewData[index];
        return item.matchedMember.status === "matched" || memberAssignments[index];
      });

      if (validSelectedItems.length === 0) {
        setError("No valid items to import. Please resolve unmatched members.");
        setIsSubmitting(false);
        return;
      }

      // Execute the batch import
      const result = await insertBatchPldSdvRequests(updatedPreviewData, validSelectedItems);

      if (result.success) {
        onImportComplete({
          success: true,
          count: result.insertedCount,
        });
      } else {
        setError(`Import failed: ${result.errorMessages.join(", ")}`);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during import");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render a preview item
  const renderPreviewItem = (item: ImportPreviewItem, index: number) => {
    const isSelected = selectedItems.includes(index);
    const hasAssignedMember = !!memberAssignments[index];

    return (
      <View
        key={index}
        style={[
          styles.previewItem,
          item.isPotentialDuplicate && styles.duplicateItem,
          isSelected && styles.selectedItem,
        ]}
      >
        <View style={styles.previewItemHeader}>
          <ThemedTouchableOpacity style={styles.selectButton} onPress={() => toggleItemSelection(index)}>
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Ionicons name="checkmark" size={16} color={Colors[colorScheme].background} />}
            </View>
          </ThemedTouchableOpacity>

          <ThemedText style={styles.previewItemTitle}>
            {item.firstName} {item.lastName} - {item.leaveType} on {format(item.requestDate, "MMM d, yyyy")}
          </ThemedText>
        </View>

        <View style={styles.previewItemDetails}>
          <ThemedText>
            Status:{" "}
            <ThemedText
              style={[styles.highlightText, item.status === "waitlisted" ? styles.waitlistedText : styles.approvedText]}
            >
              {item.status === "waitlisted" ? "Waitlisted" : "Approved"}
            </ThemedText>
          </ThemedText>

          {item.status === "waitlisted" && (
            <ThemedText>
              <ThemedText style={styles.waitlistedLabel}>Original Request Date:</ThemedText>{" "}
              <ThemedText style={styles.highlightText}>{format(item.requestedAt, "MMM d, yyyy")}</ThemedText>{" "}
              <ThemedText style={styles.waitlistedNote}>(Parsed from "denied req" in calendar)</ThemedText>
            </ThemedText>
          )}

          {item.isPotentialDuplicate && (
            <ThemedText style={styles.warningText}>
              Potential database duplicate: This member already has a request on this date in the system
            </ThemedText>
          )}

          {/* Member matching section */}
          <View style={styles.memberMatchSection}>
            <ThemedText style={styles.sectionLabel}>Member Matching:</ThemedText>

            {hasAssignedMember && (
              <View style={styles.matchedMemberInfo}>
                <ThemedText style={styles.successText}>
                  ✓ Manually assigned: {memberAssignments[index].last_name}, {memberAssignments[index].first_name} (PIN:{" "}
                  {memberAssignments[index].pin_number})
                </ThemedText>
                <ThemedTouchableOpacity
                  style={styles.removeButton}
                  onPress={() => {
                    setMemberAssignments((current) => {
                      const updated = { ...current };
                      delete updated[index];
                      return updated;
                    });
                  }}
                >
                  <ThemedText style={styles.buttonText}>Clear</ThemedText>
                </ThemedTouchableOpacity>
              </View>
            )}

            {!hasAssignedMember && renderMatchStatus(item.matchedMember, index)}
          </View>
        </View>
      </View>
    );
  };

  // Render match status and controls
  const renderMatchStatus = (matchResult: MatchedMemberResult, itemIndex: number) => {
    switch (matchResult.status) {
      case "matched":
        return (
          <ThemedText style={styles.successText}>
            ✓ Matched to: {matchResult.member?.last_name}, {matchResult.member?.first_name} (PIN:{" "}
            {matchResult.member?.pin_number})
          </ThemedText>
        );

      case "multiple_matches":
        return (
          <View>
            <ThemedText style={styles.warningText}>Multiple potential matches found:</ThemedText>
            <View style={styles.matchOptionsList}>
              {matchResult.possibleMatches?.map((member, idx) => (
                <ThemedTouchableOpacity
                  key={idx}
                  style={styles.matchOption}
                  onPress={() => assignMember(itemIndex, member)}
                >
                  <ThemedText>
                    {member.last_name}, {member.first_name} (PIN: {member.pin_number})
                  </ThemedText>
                </ThemedTouchableOpacity>
              ))}
            </View>
            <ThemedText style={styles.helperText}>Select one above or search for a different member below</ThemedText>
            {renderMemberSearch(itemIndex)}
          </View>
        );

      case "unmatched":
        return (
          <View>
            <ThemedText style={styles.errorText}>
              No matching member found. Please search and select a member:
            </ThemedText>
            {renderMemberSearch(itemIndex)}
          </View>
        );

      default:
        return null;
    }
  };

  // Render member search for unmatched or multiple matches
  const renderMemberSearch = (itemIndex: number) => (
    <View style={styles.searchContainer}>
      <TextInput
        value={searchQueries[itemIndex] || ""}
        onChangeText={(text) => handleSearch(itemIndex, text)}
        placeholder="Search by name (first last) or PIN"
        style={styles.searchInput}
        placeholderTextColor={Colors[colorScheme].textDim}
      />

      {searchingItemIndex === itemIndex && <ActivityIndicator size="small" color={Colors[colorScheme].tint} />}

      {(itemSearchResults[itemIndex] || []).length > 0 && (
        <View style={styles.searchResultsContainer}>
          <ScrollView style={styles.searchResults} nestedScrollEnabled>
            {(itemSearchResults[itemIndex] || []).map((member, idx) => (
              <ThemedTouchableOpacity
                key={`${itemIndex}-${member.pin_number}-${idx}`} // More unique key
                style={styles.resultItem}
                onPress={() => assignMember(itemIndex, member)}
              >
                <ThemedText>
                  {member.last_name}, {member.first_name} (PIN: {member.pin_number})
                </ThemedText>
              </ThemedTouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // Render pagination controls
  const renderPagination = () => (
    <View style={styles.paginationContainer}>
      <Button onPress={goToPrevPage} disabled={currentPage === 1} variant="secondary" style={styles.paginationButton}>
        Previous
      </Button>
      <ThemedText style={styles.paginationText}>
        Page {currentPage} of {totalPages}
      </ThemedText>
      <Button
        onPress={goToNextPage}
        disabled={currentPage === totalPages}
        variant="secondary"
        style={styles.paginationButton}
      >
        Next
      </Button>
    </View>
  );

  // Render summary
  const renderSummary = () => {
    if (previewData.length === 0) {
      return <ThemedText>No data to preview</ThemedText>;
    }

    // Calculate stats from the full dataset
    const duplicateCount = previewData.filter((item) => item.isPotentialDuplicate).length;

    // Count items needing attention - use filter on previewData with direct index checks
    const unmatchedCount = previewData.filter(
      (item, index) => item.matchedMember.status === "unmatched" && !memberAssignments[index]
    ).length;

    const multipleMatchCount = previewData.filter(
      (item, index) => item.matchedMember.status === "multiple_matches" && !memberAssignments[index]
    ).length;

    const readyToImportCount = selectedItems.filter((index) => {
      const item = previewData[index];
      return item && (item.matchedMember.status === "matched" || memberAssignments[index]);
    }).length;

    return (
      <View style={styles.summaryContainer}>
        <ThemedText style={styles.summaryTitle}>Import Summary</ThemedText>
        <ThemedText>Total entries: {previewData.length}</ThemedText>
        <ThemedText>Selected for import: {selectedItems.length}</ThemedText>
        <ThemedText>Ready to import: {readyToImportCount}</ThemedText>
        {duplicateCount > 0 && (
          <ThemedText style={styles.warningText}>
            Database duplicates: {duplicateCount} (member+date already exists in system)
          </ThemedText>
        )}
        {unmatchedCount > 0 && <ThemedText style={styles.errorText}>Unmatched members: {unmatchedCount}</ThemedText>}
        {multipleMatchCount > 0 && (
          <ThemedText style={styles.warningText}>Ambiguous matches: {multipleMatchCount}</ThemedText>
        )}
      </View>
    );
  };

  // Use a more efficient FlatList instead of ScrollView for virtualization
  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Import Preview</ThemedText>
        <ThemedTouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
        </ThemedTouchableOpacity>
      </View>

      <ThemedText style={styles.description}>
        Review the parsed requests before importing. Resolve any member matching issues and unselect any requests you
        don't want to import.
      </ThemedText>

      {renderSummary()}

      <View style={styles.controlsContainer}>
        <Button onPress={toggleSelectAll} variant="secondary" style={styles.controlButton}>
          {selectedItems.length === previewData.length ? "Deselect All" : "Select All"}
        </Button>

        <Button
          onPress={handleSubmit}
          disabled={isSubmitting || selectedItems.length === 0}
          variant="primary"
          style={styles.controlButton}
        >
          {isSubmitting
            ? "Importing..."
            : `Import ${selectedItems.length} Request${selectedItems.length !== 1 ? "s" : ""}`}
        </Button>
      </View>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {renderPagination()}

      <FlatList
        style={styles.previewList}
        data={paginatedItems}
        renderItem={({ item: { item, originalIndex } }) => renderPreviewItem(item, originalIndex)}
        keyExtractor={(item) => `preview-item-${item.originalIndex}`}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
      />

      {renderPagination()}
    </ThemedView>
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
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 8,
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
    lineHeight: 22,
  },
  previewList: {
    flex: 1,
  },
  previewItem: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  duplicateItem: {
    borderColor: Colors.dark.warning,
    borderLeftWidth: 4,
  },
  selectedItem: {
    borderColor: Colors.dark.tint,
    borderLeftWidth: 4,
  },
  previewItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  selectButton: {
    marginRight: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.dark.tint,
  },
  previewItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  previewItemDetails: {
    marginLeft: 28,
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  controlButton: {
    minWidth: 120,
  },
  memberMatchSection: {
    marginTop: 8,
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.dark.border,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: 4,
  },
  matchedMemberInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryContainer: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  highlightText: {
    fontWeight: "600",
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
  helperText: {
    fontStyle: "italic",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  searchContainer: {
    marginTop: 8,
    position: "relative",
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
  },
  searchResultsContainer: {
    top: 42,
    left: 0,
    right: 0,
    maxHeight: 150,
    zIndex: 100005,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
  },
  searchResults: {
    flex: 1,
    backgroundColor: Colors.dark.card,
  },
  resultItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  matchOptionsList: {
    marginTop: 4,
    marginBottom: 8,
  },
  matchOption: {
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: Colors.dark.tint,
    marginBottom: 4,
  },
  removeButton: {
    padding: 4,
    backgroundColor: Colors.dark.error,
    borderRadius: 4,
  },
  buttonText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: "600",
  },
  error: {
    color: Colors.dark.error,
    marginVertical: 8,
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 8,
    paddingHorizontal: 8,
  },
  paginationButton: {
    minWidth: 100,
  },
  paginationText: {
    fontSize: 14,
    fontWeight: "600",
  },
  waitlistedText: {
    color: Colors.light.warning, // Or another color to indicate waitlisted status
    fontWeight: "600",
  },
  approvedText: {
    color: Colors.light.success, // Or another color to indicate approved status
    fontWeight: "600",
  },
  waitlistedLabel: {
    fontWeight: "600",
  },
  waitlistedNote: {
    fontStyle: "italic",
    fontSize: 12,
  },
});
