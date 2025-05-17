import { useState, useEffect, useCallback } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { Modal } from "react-native";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { DocumentViewer, Document } from "@/components/DocumentViewer";
import { useDocumentManagement } from "@/hooks/useDocumentManagement";
import { useFileDownloader } from "@/hooks/useFileDownloader";
import { useSupabaseStorage } from "@/hooks/useSupabaseStorage";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { useWindowDimensions } from "react-native";

type ColorSchemeName = keyof typeof Colors;

type DocumentCategory = {
  key: string;
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function DivisionDocumentsScreen() {
  const { divisionName } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentVersions, setDocumentVersions] = useState<Document[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("general");

  // Document loading hooks
  const { fetchDocuments, fetchDocumentVersions } = useDocumentManagement();
  const { downloadFromSupabase } = useFileDownloader();
  const { getSignedUrl } = useSupabaseStorage();

  // Document categories
  const documentCategories: DocumentCategory[] = [
    { key: "general", label: "General", value: "general", icon: "document-text" },
    { key: "bylaw", label: "Bylaws", value: "bylaw", icon: "book" },
    { key: "meeting", label: "Meeting", value: "meeting", icon: "calendar" },
    { key: "agreement", label: "Agreements", value: "agreement", icon: "contract" },
    { key: "other", label: "Other", value: "other", icon: "folder" },
  ];

  // Convert to format needed by DocumentBrowser component
  const browserCategories = documentCategories.map(({ value, label }) => ({ value, label }));

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[DivisionDocuments] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function getDivisionId() {
      try {
        // --- Validation ---
        if (!divisionName || typeof divisionName !== "string" || divisionName.trim() === "") {
          console.error("[DivisionDocuments] Invalid or missing divisionName parameter:", divisionName);
          throw new Error("Invalid division name provided.");
        }

        const divisionNameString = divisionName.trim();
        console.log("[DivisionDocuments] Looking up division by name:", divisionNameString);

        // First get division ID
        const { data: divisionData, error: divisionError } = await supabase
          .from("divisions")
          .select("id, name")
          .eq("name", divisionNameString)
          .limit(1)
          .maybeSingle();

        if (divisionError) {
          console.error("[DivisionDocuments] Supabase error fetching division:", divisionError);
          throw new Error(`Failed to load division details: ${divisionError.message}`);
        }

        if (!divisionData) {
          console.error("[DivisionDocuments] Division not found:", divisionNameString);
          throw new Error(`Division '${divisionNameString}' not found`);
        }

        setDivisionId(divisionData.id);
        return divisionData.id;
      } catch (err) {
        console.error("[DivisionDocuments] Error getting division ID:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setIsLoading(false);
        return null;
      }
    }

    async function loadDocuments() {
      try {
        setIsLoading(true);
        setError(null);

        const divId = await getDivisionId();
        if (!divId) return;

        // Fetch documents with pagination and filtering
        const result = await fetchDocuments({
          division_id: divId,
          document_category: activeTab,
          is_latest: true,
          is_deleted: false,
          page: currentPage,
          limit: 10,
          search: searchTerm || undefined,
        });

        if (result.error) {
          throw result.error;
        }

        setDocuments(result.data);
        setTotalPages(Math.ceil((result.count || 0) / 10));
      } catch (err) {
        console.error("[DivisionDocuments] Error in loadDocuments:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    loadDocuments();
  }, [divisionName, router, session, currentPage, searchTerm, activeTab]);

  const handleSelectDocument = async (document: Document) => {
    try {
      setSelectedDocument(document);

      // Fetch document versions
      const versionsResult = await fetchDocumentVersions(document.document_group_id);
      if (versionsResult.error) {
        console.error("[DivisionDocuments] Error fetching versions:", versionsResult.error);
      } else {
        setDocumentVersions(versionsResult.data);
      }

      // Get signed URL for the document
      let url = "";

      if (document.division_id) {
        // Division document
        url = (await getSignedUrl("division_documents", document.storage_path, 3600)) || "";
      } else if (document.gca_id) {
        // GCA document
        url = (await getSignedUrl("gca_documents", document.storage_path, 3600)) || "";
      }

      if (!url) {
        throw new Error("Failed to get document URL");
      }

      setDocumentUrl(url);
      setViewerVisible(true);
    } catch (error) {
      console.error("[DivisionDocuments] Error selecting document:", error);
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      const document = documents.find((doc) => doc.id === documentId);
      if (!document) return;

      let bucketName = document.division_id ? "division_documents" : "gca_documents";

      await downloadFromSupabase(bucketName, document.storage_path, {
        autoOpen: true,
        onError: (error) => {
          console.error("[DivisionDocuments] Download error:", error);
        },
      });
    } catch (error) {
      console.error("[DivisionDocuments] Error downloading document:", error);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleFilterChange = (filters: { category?: string; fileType?: string }) => {
    // Even though we have tabs, we'll still support the dropdown filter from DocumentBrowser
    // This allows additional filtering options beyond the main tabs
    if (filters.category !== undefined && filters.category !== activeTab) {
      setActiveTab(filters.category);
      setCurrentPage(1); // Reset to first page when changing filters
    }
  };

  const renderTabButton = useCallback(
    (category: DocumentCategory) => {
      const isActive = activeTab === category.value;
      const tintColor = Colors[colorScheme].tint;

      return (
        <TouchableOpacity
          key={category.key}
          style={[styles.tabButton, isActive && styles.activeTabButton, { borderColor: tintColor }]}
          onPress={() => setActiveTab(category.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={`${category.label} documents tab`}
        >
          <Ionicons name={category.icon} size={20} color={isActive ? Colors[colorScheme].buttonText : tintColor} />
          <ThemedText
            style={[
              styles.tabButtonText,
              isActive && { color: Colors[colorScheme].buttonText },
              isMobile && { fontSize: 12 },
            ]}
          >
            {category.label}
          </ThemedText>
        </TouchableOpacity>
      );
    },
    [activeTab, colorScheme, isMobile]
  );

  if (isLoading && !divisionId) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading division documents...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>An error occurred loading documents</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>Division {divisionName} Documents</ThemedText>
        <ThemedText style={styles.subtitle}>View and download documents for your division</ThemedText>
      </ThemedView>

      {/* Tab Navigation */}
      <ThemedView style={styles.tabContainer}>{documentCategories.map(renderTabButton)}</ThemedView>

      <ThemedView style={styles.content}>
        <DocumentBrowser
          documents={documents}
          onSelectDocument={handleSelectDocument}
          onDownload={handleDownload}
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          onPageChange={setCurrentPage}
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          categories={browserCategories}
        />
      </ThemedView>

      {/* Document Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewerVisible(false)}
      >
        {selectedDocument && (
          <DocumentViewer
            document={selectedDocument}
            fileUrl={documentUrl}
            versions={documentVersions}
            onClose={() => setViewerVisible(false)}
            onDownload={() => selectedDocument && handleDownload(selectedDocument.id)}
          />
        )}
      </Modal>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  tabContainer: {
    flexDirection: "row",
    marginTop: 16,
    marginHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  activeTabButton: {
    backgroundColor: Colors.dark.tint,
  },
  tabButtonText: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: "500",
  },
  errorText: {
    color: "#FF3B30",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  errorSubtext: {
    color: "#FF3B30",
    textAlign: "center",
    fontSize: 14,
    marginTop: 8,
    opacity: 0.8,
  },
});
