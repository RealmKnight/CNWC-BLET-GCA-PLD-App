import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, FlatList, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";

import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Document } from "./DocumentViewer";

type ColorSchemeName = keyof typeof Colors;

interface DocumentBrowserProps {
  documents: Document[];
  onSelectDocument: (document: Document) => void;
  onDownload?: (documentId: string) => void;
  onSearch?: (term: string) => void;
  onFilterChange?: (filters: { category?: string; fileType?: string }) => void;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  totalPages?: number;
  isLoading?: boolean;
  categories?: Array<{ value: string; label: string }>;
  renderCustomActions?: (document: Document) => React.ReactNode;
}

export function DocumentBrowser({
  documents,
  onSelectDocument,
  onDownload,
  onSearch,
  onFilterChange,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
  isLoading = false,
  categories = [],
  renderCustomActions,
}: DocumentBrowserProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    category: "",
    fileType: "",
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

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Handle search input
  const handleSearch = () => {
    if (onSearch) {
      onSearch(searchTerm);
    }
  };

  // Set filter and notify parent
  const setFilter = (filterName: "category" | "fileType", value: string) => {
    const newFilters = {
      ...filters,
      [filterName]: value === filters[filterName] ? "" : value,
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

  // Get file type icon based on file extension
  const getFileTypeIcon = (fileType: string) => {
    const type = fileType.toLowerCase();

    if (type === "pdf") return "document-text-outline";
    if (["doc", "docx"].includes(type)) return "document-outline";
    if (["xls", "xlsx", "csv"].includes(type)) return "calculator-outline";
    if (["ppt", "pptx"].includes(type)) return "easel-outline";
    if (["jpg", "jpeg", "png", "gif"].includes(type)) return "image-outline";

    return "document-outline";
  };

  // Render each document card
  const renderDocumentItem = ({ item }: { item: Document }) => {
    return (
      <TouchableOpacity style={styles.documentCard} onPress={() => onSelectDocument(item)}>
        <ThemedView style={styles.documentCardHeader}>
          <Ionicons
            name={getFileTypeIcon(item.file_type)}
            size={24}
            color={Colors[colorScheme].text}
            style={styles.fileTypeIcon}
          />
          <ThemedView style={styles.documentTitleContainer}>
            <ThemedText style={styles.documentTitle} numberOfLines={1}>
              {item.display_name}
            </ThemedText>
            <ThemedText style={styles.documentFilename} numberOfLines={1}>
              {item.file_name}
            </ThemedText>
          </ThemedView>

          {item.version_number > 1 && (
            <ThemedView style={styles.versionBadge}>
              <ThemedText style={styles.versionText}>v{item.version_number}</ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        <ThemedView style={styles.documentMetadata}>
          <ThemedText style={styles.documentDate}>Uploaded: {formatDate(item.created_at)}</ThemedText>
          <ThemedText style={styles.documentSize}>{formatFileSize(item.file_size)}</ThemedText>
          {item.document_category && (
            <ThemedView style={styles.categoryBadge}>
              <ThemedText style={styles.categoryText}>{item.document_category}</ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        <ThemedView style={styles.documentCardFooter}>
          <TouchableOpacity style={styles.viewDetailsButton} onPress={() => onSelectDocument(item)}>
            <ThemedText style={styles.viewDetailsText}>View Document</ThemedText>
          </TouchableOpacity>

          {onDownload && (
            <TouchableOpacity style={styles.downloadButton} onPress={() => onDownload && onDownload(item.id)}>
              <Ionicons name="download-outline" size={16} color={Colors[colorScheme].buttonText} />
              <ThemedText style={styles.downloadButtonText}>Download</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>

        {/* Render custom actions if provided */}
        {renderCustomActions && renderCustomActions(item)}
      </TouchableOpacity>
    );
  };

  // Render category filter buttons
  const renderCategoryFilters = () => {
    if (categories.length === 0) return null;

    return (
      <ThemedView style={styles.categoryFiltersContainer}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.value}
            style={[
              styles.categoryFilterButton,
              filters.category === category.value && styles.categoryFilterButtonActive,
            ]}
            onPress={() => setFilter("category", category.value)}
          >
            <ThemedText
              style={[
                styles.categoryFilterText,
                filters.category === category.value && { color: Colors[colorScheme].text },
              ]}
            >
              {category.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  // Render file type filters
  const renderFileTypeFilters = () => {
    // Extract unique file types from documents
    const fileTypes = Array.from(new Set(documents.map((doc) => doc.file_type.toLowerCase())));

    if (fileTypes.length <= 1) return null;

    return (
      <ThemedView style={styles.fileTypeFiltersContainer}>
        {fileTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.fileTypeFilterButton, filters.fileType === type && styles.fileTypeFilterButtonActive]}
            onPress={() => setFilter("fileType", type)}
          >
            <Ionicons
              name={getFileTypeIcon(type)}
              size={16}
              color={filters.fileType === type ? Colors[colorScheme].text : Colors[colorScheme].textDim}
            />
            <ThemedText
              style={[styles.fileTypeFilterText, filters.fileType === type && { color: Colors[colorScheme].text }]}
            >
              {type.toUpperCase()}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Search and Filter Controls */}
      <ThemedView style={styles.searchContainer}>
        <ThemedView style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search documents..."
            placeholderTextColor={Colors[colorScheme].textDim}
            value={searchTerm}
            onChangeText={setSearchTerm}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
            <Ionicons name="search" size={20} color={Colors[colorScheme].buttonText} />
          </TouchableOpacity>
        </ThemedView>

        {/* Render category filters */}
        {renderCategoryFilters()}

        {/* Render file type filters */}
        {renderFileTypeFilters()}
      </ThemedView>

      {/* Documents List */}
      {isLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading documents...</ThemedText>
        </ThemedView>
      ) : documents.length > 0 ? (
        <FlatList
          data={documents}
          renderItem={renderDocumentItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.documentsList}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ThemedView style={styles.emptyStateContainer}>
          <Ionicons name="document-text" size={48} color={Colors[colorScheme].textDim} />
          <ThemedText style={styles.emptyStateText}>No documents found</ThemedText>
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
  categoryFiltersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  categoryFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(180, 151, 90, 0.3)",
    marginRight: 8,
    marginBottom: 8,
  },
  categoryFilterButtonActive: {
    backgroundColor: "rgba(180, 151, 90, 0.2)",
    borderColor: "#B4975A",
  },
  categoryFilterText: {
    fontSize: 14,
    color: "#B4975A",
  },
  fileTypeFiltersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  fileTypeFilterButton: {
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
  fileTypeFilterButtonActive: {
    backgroundColor: "rgba(180, 151, 90, 0.2)",
    borderColor: "#B4975A",
  },
  fileTypeFilterText: {
    fontSize: 14,
    marginLeft: 4,
    color: "#B4975A",
  },
  documentsList: {
    paddingBottom: 16,
  },
  documentCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 16,
    marginBottom: 12,
  },
  documentCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  fileTypeIcon: {
    marginRight: 12,
  },
  documentTitleContainer: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  documentFilename: {
    fontSize: 12,
    opacity: 0.7,
  },
  documentMetadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 12,
  },
  documentDate: {
    fontSize: 14,
    opacity: 0.8,
    marginRight: 12,
  },
  documentSize: {
    fontSize: 14,
    opacity: 0.8,
    marginRight: 12,
  },
  versionBadge: {
    backgroundColor: "rgba(180, 151, 90, 0.2)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  versionText: {
    fontSize: 12,
    color: "#B4975A",
  },
  categoryBadge: {
    backgroundColor: "rgba(180, 151, 90, 0.1)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    color: "#B4975A",
  },
  documentCardFooter: {
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
  downloadButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  downloadButtonText: {
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
