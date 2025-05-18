import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { StyleSheet, Modal, View, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { useAuth } from "@/hooks/useAuth";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { DocumentViewer, Document } from "@/components/DocumentViewer";
import { useDocumentManagement } from "@/hooks/useDocumentManagement";
import { useFileDownloader } from "@/hooks/useFileDownloader";
import { useSupabaseStorage } from "@/hooks/useSupabaseStorage";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

type ColorSchemeName = keyof typeof Colors;

export default function HistoricalAgreementsScreen() {
  console.log("[HistoricalAgreements] Component rendering");
  const router = useRouter();
  const { session } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  // For tracking renders and component lifecycle
  // const renderCount = useRef(0);
  const isMountedRef = useRef(false);

  //   useEffect(() => {
  //     renderCount.current += 1;
  //     console.log(`[HistoricalAgreements] Render count: ${renderCount.current}`);
  //   });

  // Track component mounting/unmounting
  useEffect(() => {
    isMountedRef.current = true;
    console.log("[HistoricalAgreements] Component mounted");

    return () => {
      isMountedRef.current = false;
      console.log("[HistoricalAgreements] Component unmounted");
    };
  }, []);

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentVersions, setDocumentVersions] = useState<Document[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Document loading hooks
  const { fetchDocuments, fetchDocumentVersions } = useDocumentManagement();
  const { downloadFromSupabase } = useFileDownloader();
  const { getSignedUrl } = useSupabaseStorage();

  // Document categories for filtering
  const documentCategories = useMemo(
    () => [
      { value: "agreement", label: "Agreements" },
      { value: "local agreement", label: "Local Agreements" },
      { value: "side_letter", label: "Side Letters" },
    ],
    []
  );

  // Initial document loading
  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[HistoricalAgreements] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function loadDocuments() {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch historical documents (older versions) by setting is_latest to false
        const result = await fetchDocuments({
          document_category: "agreement", // Start with agreement category
          is_latest: false, // Show older versions, not just latest
          is_deleted: false,
          page: currentPage,
          limit: 10,
          search: searchTerm || undefined,
        });

        if (result.error) {
          throw result.error;
        }

        setDocuments(result.data || []);
        setTotalPages(Math.ceil((result.count || 0) / 10));
      } catch (err) {
        console.error("[HistoricalAgreements] Error in loadDocuments:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    loadDocuments();
  }, [session, router, currentPage, searchTerm, fetchDocuments]);

  // Handle selecting a document
  const handleSelectDocument = useCallback(
    async (document: Document) => {
      if (!document || !document.id) return;

      console.log("[HistoricalAgreements] Document selection started:", document.id);

      try {
        // Set loading states first to prevent unwanted UI updates
        console.log("[HistoricalAgreements] Setting loading state");
        setIsLoading(true);
        setSelectedDocumentId(document.id);
        console.log("[HistoricalAgreements] Document ID set:", document.id);

        // Get all data ready before updating UI state
        console.log("[HistoricalAgreements] Fetching document versions");
        const versionsResult = await fetchDocumentVersions(document.document_group_id);
        const versions = !versionsResult.error ? versionsResult.data : [];
        console.log("[HistoricalAgreements] Versions fetched:", versions.length);

        // Get signed URL for the document
        console.log("[HistoricalAgreements] Getting signed URL");
        let url = "";
        if (document.division_id) {
          url = (await getSignedUrl("division_documents", document.storage_path, 3600)) || "";
        } else if (document.gca_id) {
          url = (await getSignedUrl("gca_documents", document.storage_path, 3600)) || "";
        }
        console.log("[HistoricalAgreements] URL generated:", url ? "Success" : "Failed");

        if (!url) {
          throw new Error("Could not get document URL");
        }

        // Now update all UI states at once to minimize renders
        console.log("[HistoricalAgreements] Setting all states at once");
        setDocumentVersions(versions);
        setDocumentUrl(url);
        setSelectedDocument(document);
        setIsLoading(false);

        // Only show modal after everything is ready
        console.log("[HistoricalAgreements] Showing modal");
        setViewerVisible(true);
      } catch (error) {
        console.error("[HistoricalAgreements] Error selecting document:", error);
        setIsLoading(false);
      }
    },
    [fetchDocumentVersions, getSignedUrl]
  );

  const handleDownload = useCallback(
    async (documentId: string) => {
      try {
        const document = documents.find((doc) => doc.id === documentId);
        if (!document) return;

        let bucketName = document.division_id ? "division_documents" : "gca_documents";

        await downloadFromSupabase(bucketName, document.storage_path, {
          autoOpen: true,
          onError: (error) => {
            console.error("[HistoricalAgreements] Download error:", error);
          },
        });
      } catch (error) {
        console.error("[HistoricalAgreements] Error downloading document:", error);
      }
    },
    [documents, downloadFromSupabase]
  );

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when searching
  }, []);

  const handleFilterChange = useCallback((filters: { category?: string; fileType?: string }) => {
    if (filters.category !== undefined) {
      setCurrentPage(1); // Reset to first page when changing filters
    }
  }, []);

  const closeViewer = useCallback(() => {
    console.log("[HistoricalAgreements] Closing viewer");
    // First hide the modal
    setViewerVisible(false);

    // Clean up states after modal is closed to prevent memory leaks
    // Use setTimeout to ensure this happens after animation completes
    setTimeout(() => {
      console.log("[HistoricalAgreements] Cleanup after modal close");
      setDocumentUrl("");
      setSelectedDocument(null);
    }, 300);
  }, []);

  // Simple loading state
  if (isLoading && !documents.length) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading historical agreements...</ThemedText>
      </ThemedView>
    );
  }

  // Error state
  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <ThemedText style={styles.errorSubtext}>An error occurred loading historical agreements</ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <ThemedScrollView style={styles.container}>
        <ThemedView style={styles.header}>
          <ThemedText style={styles.title}>Historical Agreements</ThemedText>
          <ThemedText style={styles.subtitle}>Access archive of past agreements and changes</ThemedText>
        </ThemedView>

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
            categories={documentCategories}
          />
        </ThemedView>
      </ThemedScrollView>

      {/* Modal always in component tree, just controlled by visibility */}
      <Modal
        visible={viewerVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewerVisible(false)}
        hardwareAccelerated={Platform.OS === "android"}
        statusBarTranslucent={false}
        onShow={() => console.log("[HistoricalAgreements] Modal shown")}
      >
        {(() => {
          if (selectedDocument && documentUrl) {
            console.log("[HistoricalAgreements] Rendering DocumentViewer", {
              docId: selectedDocument.id,
              hasUrl: !!documentUrl,
              versionsCount: documentVersions.length,
            });
            return (
              <DocumentViewer
                key={`document-${selectedDocumentId}`}
                document={selectedDocument}
                fileUrl={documentUrl}
                versions={documentVersions}
                onClose={closeViewer}
                onDownload={() => handleDownload(selectedDocument.id)}
              />
            );
          }
          console.log("[HistoricalAgreements] Not rendering DocumentViewer", {
            hasDocument: !!selectedDocument,
            hasUrl: !!documentUrl,
          });
          return null;
        })()}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    alignItems: "center",
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
