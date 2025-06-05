import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { v4 as uuidv4 } from "uuid";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useDocumentPicker } from "@/hooks/useDocumentPicker";
import { useSupabaseStorage } from "@/hooks/useSupabaseStorage";
import { useDocumentManagement, Document, DocumentMetadata } from "@/hooks/useDocumentManagement";
import { supabase } from "@/utils/supabase";
import { DocumentBrowser } from "@/components/DocumentBrowser";
import { DocumentViewer, Document as ViewerDocument } from "@/components/DocumentViewer";

type ColorSchemeName = keyof typeof Colors;

interface DocumentCategoryOption {
  value: string;
  label: string;
}

// Categories for document upload and filtering
const DOCUMENT_CATEGORIES: DocumentCategoryOption[] = [
  { value: "general", label: "General" },
  { value: "bylaw", label: "Bylaws" },
  { value: "agreement", label: "Agreements" },
  { value: "meeting_minutes_attachment", label: "Meeting Attachments" },
  { value: "local_agreement", label: "Local Agreements" },
  { value: "side_letter", label: "Side Letters" },
];

interface DivisionDocumentsAdminProps {
  division: string;
}

// Document type adapter function to convert between document types
function adaptDocument(doc: Document): ViewerDocument {
  return {
    ...doc,
    division_id: doc.division_id,
    gca_id: doc.gca_id,
    document_category: doc.document_category || undefined,
  } as ViewerDocument;
}

function adaptViewerDocument(doc: ViewerDocument): Document {
  return {
    ...doc,
    division_id: doc.division_id ?? null,
    gca_id: doc.gca_id ?? null,
    document_category: doc.document_category || "general",
  } as Document;
}

export function DivisionDocumentsAdmin({ division }: DivisionDocumentsAdminProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Document picker hook
  const { document, pickDocument, resetDocument, isLoading: isPickerLoading, error: pickerError } = useDocumentPicker();

  // Supabase storage hook
  const {
    uploadFile,
    isLoading: isStorageLoading,
    progress: uploadProgress,
    error: storageError,
  } = useSupabaseStorage();

  // Document management hook
  const {
    addDocumentRecord,
    fetchDocuments,
    deleteDocumentRecord,
    updateDocumentRecord,
    fetchDocumentVersions,
    isLoading: isDocManagementLoading,
    error: docManagementError,
  } = useDocumentManagement();

  // Document state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [divisionDocBucket] = useState("division_documents");

  // Document form state
  const [documentName, setDocumentName] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [documentCategory, setDocumentCategory] = useState(DOCUMENT_CATEGORIES[0].value);

  // Document viewer state
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [documentUrl, setDocumentUrl] = useState("");
  const [viewerVisible, setViewerVisible] = useState(false);
  const [documentVersions, setDocumentVersions] = useState<Document[]>([]);

  // Version upload state
  const [isUploadingNewVersion, setIsUploadingNewVersion] = useState(false);
  const [documentForNewVersion, setDocumentForNewVersion] = useState<Document | null>(null);

  // Edit metadata state
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [documentToEdit, setDocumentToEdit] = useState<Document | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editReason, setEditReason] = useState("");

  // Fetch division ID
  useEffect(() => {
    async function fetchDivisionId() {
      try {
        const { data, error } = await supabase.from("divisions").select("id").eq("name", division).single();

        if (error) throw error;
        if (data) {
          setDivisionId(data.id);
        }
      } catch (error) {
        console.error("Error fetching division ID:", error);
      }
    }

    if (division) {
      fetchDivisionId();
    }
  }, [division]);

  // Load documents whenever division ID changes
  useEffect(() => {
    if (divisionId !== null) {
      loadDocuments();
    }
  }, [divisionId, currentPage, selectedCategory, searchTerm]);

  // Load documents function
  const loadDocuments = useCallback(async () => {
    if (divisionId === null) return;

    try {
      const result = await fetchDocuments({
        division_id: divisionId,
        document_category: selectedCategory || undefined,
        search: searchTerm || undefined,
        is_latest: true,
        is_deleted: false,
        page: currentPage,
        limit: 25,
      });

      setDocuments(result.data);
      setTotalDocuments(result.count);
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  }, [fetchDocuments, divisionId, selectedCategory, searchTerm, currentPage]);

  // Handle document upload
  const handleUploadDocument = async () => {
    if (!document || !divisionId) return;

    try {
      setIsUploading(true);
      setUploadError(null);

      // Validate form
      if (!documentName.trim()) {
        throw new Error("Please enter a document name");
      }

      // Generate unique ID for the document
      const documentId = uuidv4();
      const fileExtension = document.name.split(".").pop() || "";
      const storagePath = `${divisionId}/${documentId}.${fileExtension}`;

      // Upload file to Supabase Storage
      const fileUrl = await uploadFile(divisionDocBucket, storagePath, document.uri, {
        contentType: document.type,
        progressCallback: (progress) => console.log(`Upload progress: ${progress * 100}%`),
      });

      if (!fileUrl) {
        throw new Error("File upload failed");
      }

      // Create document record in the database
      const docMetadata: DocumentMetadata = {
        display_name: documentName,
        file_name: document.name,
        storage_path: storagePath,
        file_type: fileExtension,
        file_size: document.size,
        division_id: divisionId,
        document_category: documentCategory,
        description: documentDescription.trim() || null,
      };

      const newDocument = await addDocumentRecord(docMetadata);

      if (newDocument) {
        // Reset form
        setDocumentName("");
        setDocumentDescription("");
        setDocumentCategory(DOCUMENT_CATEGORIES[0].value);
        resetDocument();

        // Reload documents
        loadDocuments();
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "An unknown error occurred");
      console.error("Error uploading document:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle upload new version
  const handleUploadNewVersion = async () => {
    if (!document || !documentForNewVersion || !divisionId) {
      setIsUploadingNewVersion(false);
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      // Generate unique ID for the document version
      const documentId = uuidv4();
      const fileExtension = document.name.split(".").pop() || "";
      const storagePath = `${divisionId}/${documentId}.${fileExtension}`;

      // Upload file to Supabase Storage
      const fileUrl = await uploadFile(divisionDocBucket, storagePath, document.uri, {
        contentType: document.type,
        progressCallback: (progress) => console.log(`Upload progress: ${progress * 100}%`),
      });

      if (!fileUrl) {
        throw new Error("File upload failed");
      }

      // Create document record for the new version
      const docMetadata: DocumentMetadata = {
        display_name: documentForNewVersion.display_name,
        file_name: document.name,
        storage_path: storagePath,
        file_type: fileExtension,
        file_size: document.size,
        division_id: divisionId,
        document_category: documentForNewVersion.document_category || "general",
        description: documentForNewVersion.description,
        document_group_id: documentForNewVersion.document_group_id, // Important for versioning!
      };

      const newDocument = await addDocumentRecord(docMetadata);

      if (newDocument) {
        resetDocument();
        setIsUploadingNewVersion(false);
        setDocumentForNewVersion(null);

        // Reload documents
        loadDocuments();
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "An unknown error occurred");
      console.error("Error uploading new version:", error);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle document selection for viewing
  const handleSelectDocument = async (doc: ViewerDocument) => {
    // Convert ViewerDocument to Document type
    const documentToUse = adaptViewerDocument(doc);
    setSelectedDocument(documentToUse);

    try {
      // Get signed URL for the document
      const { data: urlData } = await supabase.storage
        .from(divisionDocBucket)
        .createSignedUrl(documentToUse.storage_path, 3600);

      if (urlData && urlData.signedUrl) {
        setDocumentUrl(urlData.signedUrl);

        // Fetch document versions
        const versions = await fetchDocumentVersions(documentToUse.document_group_id);
        setDocumentVersions(versions.data.filter((doc) => !doc.is_deleted));

        setViewerVisible(true);
      }
    } catch (error) {
      console.error("Error getting document URL:", error);
    }
  };

  // Handle document deletion (soft delete)
  const handleDeleteDocument = async (documentId: string) => {
    Alert.alert("Delete Document", "Are you sure you want to delete this document? This action can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const success = await deleteDocumentRecord(documentId);
            if (success) {
              loadDocuments();
            }
          } catch (error) {
            console.error("Error deleting document:", error);
          }
        },
      },
    ]);
  };

  // Handle edit metadata
  const handleEditMetadata = (doc: ViewerDocument) => {
    // Convert ViewerDocument to Document type
    const documentToUse = adaptViewerDocument(doc);
    setDocumentToEdit(documentToUse);
    setEditName(documentToUse.display_name);
    setEditDescription(documentToUse.description || "");
    setEditCategory(documentToUse.document_category || "general");
    setEditReason("");
    setIsEditingMetadata(true);
  };

  // Save metadata changes
  const saveMetadataChanges = async () => {
    if (!documentToEdit) return;

    try {
      const updates = {
        display_name: editName,
        description: editDescription || null,
        document_category: editCategory,
      };

      const updatedDoc = await updateDocumentRecord(documentToEdit.id, updates, editReason);

      if (updatedDoc) {
        setIsEditingMetadata(false);
        setDocumentToEdit(null);
        loadDocuments();
      }
    } catch (error) {
      console.error("Error updating document metadata:", error);
    }
  };

  // Render the upload form
  const renderUploadForm = () => (
    <ThemedView style={styles.uploadFormContainer}>
      <ThemedText style={styles.sectionTitle}>Upload New Document</ThemedText>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.formLabel}>Document Name*</ThemedText>
        <TextInput
          style={styles.textInput}
          value={documentName}
          onChangeText={setDocumentName}
          placeholder="Enter document name"
          placeholderTextColor={Colors[colorScheme].textDim}
        />
      </ThemedView>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.formLabel}>Description</ThemedText>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={documentDescription}
          onChangeText={setDocumentDescription}
          placeholder="Enter document description (optional)"
          placeholderTextColor={Colors[colorScheme].textDim}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </ThemedView>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.formLabel}>Category</ThemedText>
        <ThemedView style={styles.categoryButtonsContainer}>
          {DOCUMENT_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.value}
              style={[styles.categoryButton, documentCategory === category.value && styles.categoryButtonActive]}
              onPress={() => setDocumentCategory(category.value)}
            >
              <ThemedText
                style={[
                  styles.categoryButtonText,
                  documentCategory === category.value && styles.categoryButtonTextActive,
                ]}
              >
                {category.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.formGroup}>
        <ThemedText style={styles.formLabel}>Select File*</ThemedText>
        <ThemedView style={styles.fileSelectContainer}>
          {document ? (
            <ThemedView style={styles.selectedFileContainer}>
              <Ionicons name="document-text-outline" size={24} color={Colors[colorScheme].text} />
              <ThemedView style={styles.selectedFileInfo}>
                <ThemedText style={styles.selectedFileName} numberOfLines={1}>
                  {document.name}
                </ThemedText>
                <ThemedText style={styles.selectedFileSize}>{(document.size / (1024 * 1024)).toFixed(2)} MB</ThemedText>
              </ThemedView>
              <TouchableOpacity style={styles.clearButton} onPress={resetDocument}>
                <Ionicons name="close-circle" size={24} color={Colors[colorScheme].text} />
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <TouchableOpacity style={styles.selectFileButton} onPress={pickDocument} disabled={isPickerLoading}>
              <Ionicons name="cloud-upload-outline" size={24} color={Colors[colorScheme].text} />
              <ThemedText style={styles.selectFileText}>{isPickerLoading ? "Selecting..." : "Select File"}</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>
        {pickerError && <ThemedText style={styles.errorText}>{pickerError.message}</ThemedText>}
      </ThemedView>

      <TouchableOpacity
        style={[styles.uploadButton, (!document || !documentName || isUploading) && styles.uploadButtonDisabled]}
        onPress={handleUploadDocument}
        disabled={!document || !documentName || isUploading}
      >
        {isUploading ? (
          <ThemedText style={styles.uploadButtonText}>Uploading... {Math.round(uploadProgress * 100)}%</ThemedText>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={20} color={Colors[colorScheme].buttonText} />
            <ThemedText style={styles.uploadButtonText}>Upload Document</ThemedText>
          </>
        )}
      </TouchableOpacity>

      {uploadError && <ThemedText style={styles.errorText}>{uploadError}</ThemedText>}
    </ThemedView>
  );

  // Render the documents list with browser
  const renderDocumentsList = () => {
    const totalPages = Math.ceil(totalDocuments / 25);

    return (
      <ThemedView style={styles.documentsListContainer}>
        <ThemedText style={styles.sectionTitle}>Division Documents</ThemedText>

        <DocumentBrowser
          documents={documents.map(adaptDocument)}
          onSelectDocument={handleSelectDocument}
          onSearch={(term) => {
            setSearchTerm(term);
            setCurrentPage(1);
          }}
          onFilterChange={(filters) => {
            setSelectedCategory(filters.category || "");
            setCurrentPage(1);
          }}
          onPageChange={(page) => setCurrentPage(page)}
          currentPage={currentPage}
          totalPages={totalPages}
          isLoading={isDocManagementLoading}
          categories={DOCUMENT_CATEGORIES}
          onDownload={(documentId) => {
            const doc = documents.find((d) => d.id === documentId);
            if (doc) handleSelectDocument(adaptDocument(doc));
          }}
          renderCustomActions={(document) => (
            <ThemedView style={styles.customActionsContainer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  const docToUse = adaptViewerDocument(document);
                  setDocumentForNewVersion(docToUse);
                  setIsUploadingNewVersion(true);
                  resetDocument();
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors[colorScheme].text} />
                <ThemedText style={styles.actionButtonText}>New Version</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handleEditMetadata(document)}>
                <Ionicons name="create-outline" size={18} color={Colors[colorScheme].text} />
                <ThemedText style={styles.actionButtonText}>Edit</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteDocument(document.id)}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.dark.buttonText} />
                <ThemedText style={[styles.actionButtonText, { color: Colors.dark.buttonText }]}>Delete</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}
        />
      </ThemedView>
    );
  };

  // Render modals
  const renderModals = () => (
    <>
      {/* Document Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewerVisible(false)}
        hardwareAccelerated={Platform.OS === "android"} // Improves performance on Android
        statusBarTranslucent={false} // Better compatibility on Android
      >
        {selectedDocument && documentUrl && (
          <DocumentViewer
            document={adaptDocument(selectedDocument)}
            fileUrl={documentUrl}
            versions={documentVersions.map(adaptDocument)}
            onClose={() => setViewerVisible(false)}
          />
        )}
      </Modal>

      {/* New Version Upload Modal */}
      <Modal
        visible={isUploadingNewVersion}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsUploadingNewVersion(false)}
        hardwareAccelerated={Platform.OS === "android"} // Improves performance on Android
        statusBarTranslucent={false} // Better compatibility on Android
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Upload New Version</ThemedText>

            {documentForNewVersion && (
              <ThemedText style={styles.modalSubtitle}>For: {documentForNewVersion.display_name}</ThemedText>
            )}

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.formLabel}>Select File*</ThemedText>
              <ThemedView style={styles.fileSelectContainer}>
                {document ? (
                  <ThemedView style={styles.selectedFileContainer}>
                    <Ionicons name="document-text-outline" size={24} color={Colors[colorScheme].text} />
                    <ThemedView style={styles.selectedFileInfo}>
                      <ThemedText style={styles.selectedFileName} numberOfLines={1}>
                        {document.name}
                      </ThemedText>
                      <ThemedText style={styles.selectedFileSize}>
                        {(document.size / (1024 * 1024)).toFixed(2)} MB
                      </ThemedText>
                    </ThemedView>
                    <TouchableOpacity style={styles.clearButton} onPress={resetDocument}>
                      <Ionicons name="close-circle" size={24} color={Colors[colorScheme].text} />
                    </TouchableOpacity>
                  </ThemedView>
                ) : (
                  <TouchableOpacity style={styles.selectFileButton} onPress={pickDocument} disabled={isPickerLoading}>
                    <Ionicons name="cloud-upload-outline" size={24} color={Colors[colorScheme].text} />
                    <ThemedText style={styles.selectFileText}>
                      {isPickerLoading ? "Selecting..." : "Select File"}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setIsUploadingNewVersion(false);
                  setDocumentForNewVersion(null);
                  resetDocument();
                }}
              >
                <ThemedText style={styles.modalCancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitButton, !document && styles.modalSubmitButtonDisabled]}
                onPress={handleUploadNewVersion}
                disabled={!document || isUploading}
              >
                {isUploading ? (
                  <ThemedText style={styles.modalSubmitButtonText}>
                    Uploading... {Math.round(uploadProgress * 100)}%
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.modalSubmitButtonText}>Upload Version</ThemedText>
                )}
              </TouchableOpacity>
            </ThemedView>

            {uploadError && <ThemedText style={styles.errorText}>{uploadError}</ThemedText>}
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Edit Metadata Modal */}
      <Modal
        visible={isEditingMetadata}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsEditingMetadata(false)}
        hardwareAccelerated={Platform.OS === "android"} // Improves performance on Android
        statusBarTranslucent={false} // Better compatibility on Android
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Edit Document</ThemedText>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.formLabel}>Document Name*</ThemedText>
              <TextInput
                style={styles.textInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter document name"
                placeholderTextColor={Colors[colorScheme].textDim}
              />
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.formLabel}>Description</ThemedText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Enter document description (optional)"
                placeholderTextColor={Colors[colorScheme].textDim}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.formLabel}>Category</ThemedText>
              <ThemedView style={styles.categoryButtonsContainer}>
                {DOCUMENT_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[styles.categoryButton, editCategory === category.value && styles.categoryButtonActive]}
                    onPress={() => setEditCategory(category.value)}
                  >
                    <ThemedText
                      style={[
                        styles.categoryButtonText,
                        editCategory === category.value && styles.categoryButtonTextActive,
                      ]}
                    >
                      {category.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.formGroup}>
              <ThemedText style={styles.formLabel}>Edit Reason*</ThemedText>
              <TextInput
                style={styles.textInput}
                value={editReason}
                onChangeText={setEditReason}
                placeholder="Why are you changing this document?"
                placeholderTextColor={Colors[colorScheme].textDim}
              />
            </ThemedView>

            <ThemedView style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setIsEditingMetadata(false);
                  setDocumentToEdit(null);
                }}
              >
                <ThemedText style={styles.modalCancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalSubmitButton,
                  (!editName.trim() || !editReason.trim()) && styles.modalSubmitButtonDisabled,
                ]}
                onPress={saveMetadataChanges}
                disabled={!editName.trim() || !editReason.trim()}
              >
                <ThemedText style={styles.modalSubmitButtonText}>Save Changes</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </>
  );

  // Main render
  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.content}>
        {!isMobile ? (
          // Desktop layout
          <View style={styles.desktopLayout}>
            <View style={styles.uploadSection}>{renderUploadForm()}</View>
            <View style={styles.documentsSection}>{renderDocumentsList()}</View>
          </View>
        ) : (
          // Mobile layout
          <ScrollView contentContainerStyle={styles.mobileLayout}>
            {renderUploadForm()}
            {renderDocumentsList()}
          </ScrollView>
        )}
      </ThemedView>

      {renderModals()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  desktopLayout: {
    flex: 1,
    flexDirection: "row",
  },
  uploadSection: {
    width: 320,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  documentsSection: {
    flex: 1,
  },
  mobileLayout: {
    flexGrow: 1,
  },
  uploadFormContainer: {
    padding: 16,
  },
  documentsListContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  fileSelectContainer: {
    marginTop: 4,
  },
  selectFileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    borderStyle: "dashed",
    padding: 16,
    backgroundColor: Colors.dark.background,
  },
  selectFileText: {
    marginLeft: 8,
    fontSize: 14,
  },
  selectedFileContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    padding: 12,
    backgroundColor: Colors.dark.background,
  },
  selectedFileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedFileName: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedFileSize: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  clearButton: {
    padding: 4,
  },
  categoryButtonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  categoryButtonActive: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  categoryButtonText: {
    fontSize: 12,
  },
  categoryButtonTextActive: {
    color: Colors.dark.background,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.tint,
    borderRadius: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
    marginLeft: 8,
  },
  errorText: {
    color: "#d32f2f",
    fontSize: 14,
    marginTop: 8,
  },
  customActionsContainer: {
    flexDirection: "row",
    marginTop: 8,
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  actionButtonText: {
    fontSize: 12,
    marginLeft: 4,
  },
  deleteButton: {
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    padding: 20,
    width: "100%",
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 12,
  },
  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalCancelButtonText: {
    fontSize: 14,
  },
  modalSubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.tint,
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5,
  },
  modalSubmitButtonText: {
    fontSize: 14,
    color: Colors.dark.buttonText,
  },
});
