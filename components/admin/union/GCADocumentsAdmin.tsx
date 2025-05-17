import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, TouchableOpacity, TextInput, Platform, View, Modal, Alert } from "react-native";
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
import { DocumentViewer } from "@/components/DocumentViewer";
import { DivisionSelector } from "@/components/admin/division/DivisionSelector";
import { ScrollView } from "react-native";

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

export function GCADocumentsAdmin() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

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

  // GCA state
  const [gcaId, setGcaId] = useState<string | null>(null);
  const [gcaDocBucket] = useState("gca_documents");
  const [divisionDocBucket] = useState("division_documents");

  // Division selector state
  const [selectedDivision, setSelectedDivision] = useState("");
  const [divisionId, setDivisionId] = useState<number | null>(null);

  // Document state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // Fetch GCA ID on component mount
  useEffect(() => {
    async function fetchGcaId() {
      try {
        const { data, error } = await supabase.from("gca_entities").select("id").single();

        if (error) throw error;
        if (data) {
          setGcaId(data.id);
        }
      } catch (error) {
        console.error("Error fetching GCA ID:", error);
      }
    }

    fetchGcaId();
  }, []);

  // Handle division selection
  useEffect(() => {
    async function fetchDivisionId() {
      if (!selectedDivision) {
        setDivisionId(null);
        return;
      }

      try {
        const { data, error } = await supabase.from("divisions").select("id").eq("name", selectedDivision).single();

        if (error) throw error;
        if (data) {
          setDivisionId(data.id);
        }
      } catch (error) {
        console.error("Error fetching division ID:", error);
      }
    }

    fetchDivisionId();
  }, [selectedDivision]);

  // Reset search and pagination when division changes
  useEffect(() => {
    setSearchTerm("");
    setSelectedCategory("");
    setCurrentPage(1);
  }, [selectedDivision]);

  // Load documents when parameters change
  useEffect(() => {
    loadDocuments();
  }, [gcaId, divisionId, currentPage, selectedCategory, searchTerm]);

  // Load documents function
  const loadDocuments = useCallback(async () => {
    if ((!gcaId && !divisionId) || (selectedDivision && !divisionId)) return;

    try {
      const queryParams = {
        gca_id: divisionId ? undefined : gcaId || undefined,
        division_id: divisionId || undefined,
        document_category: selectedCategory || undefined,
        search: searchTerm || undefined,
        is_latest: true,
        is_deleted: false,
        page: currentPage,
        limit: 25,
      };

      const result = await fetchDocuments(queryParams);

      setDocuments(result.data);
      setTotalDocuments(result.count);
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  }, [fetchDocuments, gcaId, divisionId, selectedCategory, searchTerm, currentPage]);

  // Handle document upload
  const handleUploadDocument = async () => {
    if (!document) return;
    if (!documentName.trim()) {
      setUploadError("Please enter a document name");
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      // Generate unique ID for the document
      const documentId = uuidv4();
      const fileExtension = document.name.split(".").pop() || "";

      // Determine bucket and path based on whether we're uploading for GCA or division
      const isGcaDocument = !divisionId;
      const bucketName = isGcaDocument ? gcaDocBucket : divisionDocBucket;
      const storagePath = isGcaDocument
        ? `${documentId}.${fileExtension}`
        : `${divisionId}/${documentId}.${fileExtension}`;

      // Upload file to Supabase Storage
      const fileUrl = await uploadFile(bucketName, storagePath, document.uri, {
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
        gca_id: isGcaDocument ? gcaId : null,
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
    if (!document || !documentForNewVersion) {
      setIsUploadingNewVersion(false);
      return;
    }

    try {
      setIsUploading(true);
      setUploadError(null);

      // Generate unique ID for the document version
      const documentId = uuidv4();
      const fileExtension = document.name.split(".").pop() || "";

      // Determine bucket and path based on the original document
      const isGcaDocument = documentForNewVersion.gca_id !== null;
      const bucketName = isGcaDocument ? gcaDocBucket : divisionDocBucket;
      const storagePath = isGcaDocument
        ? `${documentId}.${fileExtension}`
        : `${documentForNewVersion.division_id}/${documentId}.${fileExtension}`;

      // Upload file to Supabase Storage
      const fileUrl = await uploadFile(bucketName, storagePath, document.uri, {
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
        division_id: documentForNewVersion.division_id,
        gca_id: documentForNewVersion.gca_id,
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
  const handleSelectDocument = async (doc: Document) => {
    setSelectedDocument(doc as any);

    try {
      // Determine bucket based on document
      const bucketName = doc.gca_id ? gcaDocBucket : divisionDocBucket;

      // Get signed URL for the document
      const { data: urlData } = await supabase.storage.from(bucketName).createSignedUrl(doc.storage_path, 3600);

      if (urlData && urlData.signedUrl) {
        setDocumentUrl(urlData.signedUrl);

        // Fetch document versions
        const versions = await fetchDocumentVersions(doc.document_group_id);
        setDocumentVersions(versions.data.filter((v) => !v.is_deleted));

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
  const handleEditMetadata = (doc: Document) => {
    setDocumentToEdit(doc);
    setEditName(doc.display_name);
    setEditDescription(doc.description || "");
    setEditCategory(doc.document_category || "general");
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
      <ThemedText style={styles.sectionTitle}>
        Upload New Document {selectedDivision ? `for ${selectedDivision}` : "for GCA"}
      </ThemedText>

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
        style={[styles.uploadButton, (!document || !documentName || isUploading) && styles.disabledButton]}
        onPress={handleUploadDocument}
        disabled={!document || !documentName || isUploading}
      >
        {isUploading ? (
          <ThemedText style={styles.buttonText}>Uploading... {Math.round(uploadProgress * 100)}%</ThemedText>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
            <ThemedText style={styles.buttonText}>Upload Document</ThemedText>
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
        <ThemedText style={styles.sectionTitle}>
          {selectedDivision ? `${selectedDivision} Documents` : "GCA Documents"}
        </ThemedText>

        <DocumentBrowser
          documents={documents}
          onSelectDocument={(doc) => handleSelectDocument(doc as any)}
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
            if (doc) handleSelectDocument(doc as any);
          }}
          renderCustomActions={(doc) => (
            <ThemedView style={styles.customActionsContainer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setDocumentForNewVersion(doc as any);
                  setIsUploadingNewVersion(true);
                  resetDocument();
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors[colorScheme].text} />
                <ThemedText style={styles.actionButtonText}>New Version</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handleEditMetadata(doc as any)}>
                <Ionicons name="create-outline" size={18} color={Colors[colorScheme].text} />
                <ThemedText style={styles.actionButtonText}>Edit</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleDeleteDocument(doc.id)}
              >
                <Ionicons name="trash-outline" size={18} color={"#d32f2f"} />
                <ThemedText style={[styles.actionButtonText, { color: "#d32f2f" }]}>Delete</ThemedText>
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
      >
        {selectedDocument && documentUrl && (
          <DocumentViewer
            document={selectedDocument}
            fileUrl={documentUrl}
            versions={documentVersions}
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

            <ThemedView style={styles.modalButtonsRow}>
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
                style={[styles.modalSubmitButton, !document && styles.disabledButton]}
                onPress={handleUploadNewVersion}
                disabled={!document || isUploading}
              >
                {isUploading ? (
                  <ThemedText style={styles.modalButtonText}>
                    Uploading... {Math.round(uploadProgress * 100)}%
                  </ThemedText>
                ) : (
                  <ThemedText style={styles.modalButtonText}>Upload Version</ThemedText>
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

            <ThemedView style={styles.modalButtonsRow}>
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
                style={[styles.modalSubmitButton, (!editName.trim() || !editReason.trim()) && styles.disabledButton]}
                onPress={saveMetadataChanges}
                disabled={!editName.trim() || !editReason.trim()}
              >
                <ThemedText style={styles.modalButtonText}>Save Changes</ThemedText>
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
      <ScrollView style={styles.scrollView}>
        <ThemedView style={styles.header}>
          <ThemedView style={styles.selectionContainer}>
            <ThemedText style={styles.selectorLabel}>Manage Documents For:</ThemedText>
            <DivisionSelector
              currentDivision={selectedDivision}
              onDivisionChange={setSelectedDivision}
              isAdmin={true}
            />
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.content}>
          {renderUploadForm()}
          {renderDocumentsList()}
        </ThemedView>
      </ScrollView>

      {renderModals()}
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
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  selectionContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  uploadFormContainer: {
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  },
  documentsListContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.card,
  },
  textInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  selectFileText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.card,
  },
  selectedFileContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 6,
    padding: 12,
    backgroundColor: Colors.dark.card,
  },
  selectedFileInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedFileName: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.dark.text,
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  categoryButtonActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  categoryButtonText: {
    fontSize: 12,
    color: Colors.dark.tint,
  },
  categoryButtonTextActive: {
    color: Colors.dark.buttonText,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.primary,
    borderRadius: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  buttonText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
    marginLeft: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorText: {
    color: Colors.dark.error,
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
    backgroundColor: Colors.dark.card,
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
    backgroundColor: Colors.dark.card,
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
  modalButtonsRow: {
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
    backgroundColor: Colors.dark.card,
  },
  modalCancelButtonText: {
    fontSize: 14,
  },
  modalSubmitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
  },
  modalButtonText: {
    fontSize: 14,
    color: Colors.dark.buttonText,
  },
});
