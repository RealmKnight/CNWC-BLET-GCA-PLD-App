import { useState, useEffect } from "react";
import { StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
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

type ColorSchemeName = keyof typeof Colors;

export default function GCADocumentsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gcaId, setGcaId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentVersions, setDocumentVersions] = useState<Document[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  // Always filter by general category for this page
  const documentCategory = "general";

  // Document loading hooks
  const { fetchDocuments, fetchDocumentVersions } = useDocumentManagement();
  const { downloadFromSupabase } = useFileDownloader();
  const { getSignedUrl } = useSupabaseStorage();

  // Document categories to show in the filter dropdown (only general and other for this page)
  const documentCategories = [
    { value: "general", label: "General" },
    { value: "other", label: "Other" },
  ];

  useEffect(() => {
    // Check if user is authenticated
    if (!session) {
      console.log("[GCADocuments] No active session, redirecting to login");
      router.replace("/(auth)/login");
      return;
    }

    async function getGCAId() {
      try {
        console.log("[GCADocuments] Fetching GCA entity");

        // Get the GCA entity ID
        const { data: gcaData, error: gcaError } = await supabase
          .from("gca_entities")
          .select("id, name")
          .limit(1)
          .maybeSingle();

        if (gcaError) {
          console.error("[GCADocuments] Supabase error fetching GCA entity:", gcaError);
          throw new Error(`Failed to load GCA details: ${gcaError.message}`);
        }

        if (!gcaData) {
          console.error("[GCADocuments] GCA entity not found");
          throw new Error("GCA entity not found");
        }

        setGcaId(gcaData.id);
        return gcaData.id;
      } catch (err) {
        console.error("[GCADocuments] Error getting GCA ID:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
        setIsLoading(false);
        return null;
      }
    }

    async function loadDocuments() {
      try {
        setIsLoading(true);
        setError(null);

        const gId = await getGCAId();
        if (!gId) return;

        // Fetch GCA documents with pagination and filtering
        const result = await fetchDocuments({
          gca_id: gId,
          document_category: documentCategory,
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
        console.error("[GCADocuments] Error in loadDocuments:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    loadDocuments();
  }, [router, session, currentPage, searchTerm]);

  const handleSelectDocument = async (document: Document) => {
    try {
      setSelectedDocument(document);

      // Fetch document versions
      const versionsResult = await fetchDocumentVersions(document.document_group_id);
      if (versionsResult.error) {
        console.error("[GCADocuments] Error fetching versions:", versionsResult.error);
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
      console.error("[GCADocuments] Error selecting document:", error);
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
          console.error("[GCADocuments] Download error:", error);
        },
      });
    } catch (error) {
      console.error("[GCADocuments] Error downloading document:", error);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setCurrentPage(1); // Reset to first page when searching
  };

  // Note: We don't need to handle category filter changes as we only show general documents

  if (isLoading && !gcaId) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading GCA documents...</ThemedText>
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
        <ThemedText style={styles.title}>GCA Documents</ThemedText>
        <ThemedText style={styles.subtitle}>View and download general GCA documents</ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <DocumentBrowser
          documents={documents}
          onSelectDocument={handleSelectDocument}
          onDownload={handleDownload}
          onSearch={handleSearch}
          onPageChange={setCurrentPage}
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isLoading}
          categories={documentCategories}
        />
      </ThemedView>

      {/* Document Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewerVisible(false)}
        hardwareAccelerated={Platform.OS === "android"}
        statusBarTranslucent={false}
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
