import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, TextInput, FlatList, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MeetingMinute } from "@/store/divisionMeetingStore";
import { format, parseISO } from "date-fns";

type ColorSchemeName = keyof typeof Colors;

interface MinutesBrowserProps {
  minutes: MeetingMinute[];
  onSelectMinutes: (minute: MeetingMinute) => void;
  onExportPdf?: (minuteId: string) => void;
  onSearch?: (term: string) => void;
  onFilterChange?: (filters: { approved?: boolean; archived?: boolean }) => void;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  totalPages?: number;
  isLoading?: boolean;
}

export function MinutesBrowser({
  minutes,
  onSelectMinutes,
  onExportPdf,
  onSearch,
  onFilterChange,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
  isLoading = false,
}: MinutesBrowserProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    approved: false,
    archived: false,
  });

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      return format(parseISO(dateString), "MMMM d, yyyy");
    } catch (error) {
      return dateString;
    }
  };

  // Handle search input
  const handleSearch = () => {
    if (onSearch) {
      onSearch(searchTerm);
    }
  };

  // Toggle filter and notify parent
  const toggleFilter = (filterName: "approved" | "archived") => {
    const newFilters = {
      ...filters,
      [filterName]: !filters[filterName],
    };
    setFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  // Render pagination controls
  const renderPagination = () => {
    return (
      <ThemedView style={styles.paginationContainer}>
        <TouchableOpacity
          style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
          onPress={() => onPageChange && currentPage > 1 && onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={currentPage === 1 ? Colors[colorScheme].textDim : Colors[colorScheme].tint}
          />
          <ThemedText
            style={[styles.paginationButtonText, currentPage === 1 && { color: Colors[colorScheme].textDim }]}
          >
            Previous
          </ThemedText>
        </TouchableOpacity>

        <ThemedText style={styles.paginationText}>
          Page {currentPage} of {totalPages}
        </ThemedText>

        <TouchableOpacity
          style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
          onPress={() => onPageChange && currentPage < totalPages && onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ThemedText
            style={[styles.paginationButtonText, currentPage === totalPages && { color: Colors[colorScheme].textDim }]}
          >
            Next
          </ThemedText>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={currentPage === totalPages ? Colors[colorScheme].textDim : Colors[colorScheme].tint}
          />
        </TouchableOpacity>
      </ThemedView>
    );
  };

  // Render each meeting minutes card
  const renderMinutesItem = ({ item }: { item: MeetingMinute }) => {
    return (
      <TouchableOpacity style={styles.minutesCard} onPress={() => onSelectMinutes(item)}>
        <ThemedView style={styles.minutesCardHeader}>
          <ThemedText style={styles.minutesDate}>{formatDate(item.meeting_date)}</ThemedText>
          <ThemedView style={styles.badgesContainer}>
            {item.is_approved && (
              <ThemedView style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={12} color={Colors[colorScheme].success} />
                <ThemedText style={[styles.badgeText, { color: Colors[colorScheme].success }]}>Approved</ThemedText>
              </ThemedView>
            )}
            {item.is_archived && (
              <ThemedView style={styles.archivedBadge}>
                <Ionicons name="archive" size={12} color={Colors[colorScheme].textDim} />
                <ThemedText style={[styles.badgeText, { color: Colors[colorScheme].textDim }]}>Archived</ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        </ThemedView>

        {item.content && (
          <ThemedText style={styles.minutesContent} numberOfLines={2}>
            {item.content}
          </ThemedText>
        )}

        <ThemedView style={styles.minutesCardFooter}>
          <TouchableOpacity style={styles.viewDetailsButton} onPress={() => onSelectMinutes(item)}>
            <ThemedText style={styles.viewDetailsText}>View Details</ThemedText>
          </TouchableOpacity>

          {onExportPdf && (
            <TouchableOpacity style={styles.exportButton} onPress={() => onExportPdf && onExportPdf(item.id)}>
              <Ionicons name="document-text-outline" size={16} color={Colors[colorScheme].buttonText} />
              <ThemedText style={styles.exportButtonText}>Export</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Search and Filter Controls */}
      <ThemedView style={styles.searchContainer}>
        <ThemedView style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search minutes..."
            placeholderTextColor={Colors[colorScheme].textDim}
            value={searchTerm}
            onChangeText={setSearchTerm}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Ionicons name="search" size={20} color={Colors[colorScheme].buttonText} />
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.filtersContainer}>
          <TouchableOpacity
            style={[styles.filterButton, filters.approved && styles.filterButtonActive]}
            onPress={() => toggleFilter("approved")}
          >
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={filters.approved ? Colors[colorScheme].success : Colors[colorScheme].textDim}
            />
            <ThemedText style={[styles.filterButtonText, filters.approved && { color: Colors[colorScheme].success }]}>
              Approved
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterButton, filters.archived && styles.filterButtonActive]}
            onPress={() => toggleFilter("archived")}
          >
            <Ionicons
              name="archive"
              size={16}
              color={filters.archived ? Colors[colorScheme].text : Colors[colorScheme].textDim}
            />
            <ThemedText style={[styles.filterButtonText, filters.archived && { color: Colors[colorScheme].text }]}>
              Archived
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>

      {/* Minutes List */}
      {isLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading minutes...</ThemedText>
        </ThemedView>
      ) : minutes.length > 0 ? (
        <FlatList
          data={minutes}
          renderItem={renderMinutesItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.minutesList}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ThemedView style={styles.emptyStateContainer}>
          <Ionicons name="document-text" size={48} color={Colors[colorScheme].textDim} />
          <ThemedText style={styles.emptyStateText}>No meeting minutes found</ThemedText>
          <ThemedText style={styles.emptyStateSubtext}>Try adjusting your search or filters</ThemedText>
        </ThemedView>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && renderPagination()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: "#B4975A",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#B4975A",
    backgroundColor: "rgba(180, 151, 90, 0.1)",
  },
  searchButton: {
    width: 40,
    height: 40,
    backgroundColor: "#B4975A",
    borderRadius: 8,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  filtersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(180, 151, 90, 0.3)",
    marginRight: 8,
    marginBottom: 8,
  },
  filterButtonActive: {
    backgroundColor: "rgba(180, 151, 90, 0.1)",
    borderColor: "#B4975A",
  },
  filterButtonText: {
    fontSize: 14,
    marginLeft: 4,
    color: "#B4975A",
  },
  minutesList: {
    paddingBottom: 16,
  },
  minutesCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 16,
    marginBottom: 12,
  },
  minutesCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  minutesDate: {
    fontSize: 16,
    fontWeight: "600",
  },
  badgesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(40, 167, 69, 0.1)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 4,
  },
  archivedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(108, 117, 125, 0.1)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 4,
  },
  badgeText: {
    fontSize: 12,
    marginLeft: 4,
  },
  minutesContent: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    marginBottom: 12,
  },
  minutesCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewDetailsText: {
    fontSize: 14,
    color: "#B4975A",
  },
  exportButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  exportButtonText: {
    fontSize: 14,
    color: "#000",
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyStateContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  paginationButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  paginationButtonDisabled: {
    opacity: 0.6,
  },
  paginationButtonText: {
    fontSize: 14,
    color: "#B4975A",
    marginHorizontal: 4,
  },
  paginationText: {
    fontSize: 14,
  },
});
