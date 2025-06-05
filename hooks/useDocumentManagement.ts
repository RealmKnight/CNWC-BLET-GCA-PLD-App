import { useCallback, useState } from "react";
import { supabase } from "@/utils/supabase";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "./useAuth";

export interface Document {
    id: string;
    document_group_id: string;
    version_number: number;
    is_latest: boolean;
    created_at: string;
    uploader_id: string;
    file_name: string;
    display_name: string;
    storage_path: string;
    file_type: string;
    file_size: number;
    division_id: number | null;
    gca_id: string | null;
    document_category: string;
    description: string | null;
    is_public: boolean;
    is_deleted: boolean;
}

export interface DocumentMetadata {
    display_name: string;
    file_name: string;
    storage_path: string;
    file_type: string;
    file_size: number;
    division_id?: number | null;
    gca_id?: string | null;
    document_category?: string;
    description?: string | null;
    is_public?: boolean;
    document_group_id?: string; // If it's a new version of an existing document
}

export interface DocumentsResult {
    data: Document[];
    error: Error | null;
    count: number;
}

export interface FetchDocumentsOptions {
    division_id?: number;
    gca_id?: string;
    document_category?: string;
    search?: string;
    is_latest?: boolean;
    is_deleted?: boolean;
    page?: number;
    limit?: number;
}

export interface DocumentsUpdateData {
    display_name?: string;
    document_category?: string;
    description?: string | null;
    is_public?: boolean;
}

export interface AuditLogEntry {
    id: string;
    document_version_id: string;
    editor_id: string;
    edit_timestamp: string;
    changed_fields: {
        [key: string]: {
            old: any;
            new: any;
        };
    };
    edit_reason: string | null;
}

export function useDocumentManagement() {
    const { session } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25); // Default items per page

    /**
     * Creates a new document record in the database
     * @param documentMetadata Metadata for the document
     * @returns The newly created document record
     */
    const addDocumentRecord = useCallback(async (
        documentMetadata: DocumentMetadata,
    ): Promise<Document | null> => {
        try {
            if (!session?.user?.id) {
                throw new Error("User not authenticated");
            }

            setIsLoading(true);
            setError(null);

            // Generate UUIDs for new document
            const docId = uuidv4();
            const docGroupId = documentMetadata.document_group_id || docId;

            // Prepare the record to insert
            const newDocument = {
                id: docId,
                document_group_id: docGroupId,
                // The following fields will be set by the trigger if needed
                version_number: undefined, // Set by trigger
                is_latest: undefined, // Set by trigger
                uploader_id: session.user.id,
                file_name: documentMetadata.file_name,
                display_name: documentMetadata.display_name,
                storage_path: documentMetadata.storage_path,
                file_type: documentMetadata.file_type,
                file_size: documentMetadata.file_size,
                division_id: documentMetadata.division_id || null,
                gca_id: documentMetadata.gca_id || null,
                document_category: documentMetadata.document_category ||
                    "general",
                description: documentMetadata.description || null,
                is_public: documentMetadata.is_public !== undefined
                    ? documentMetadata.is_public
                    : true,
                is_deleted: false,
            };

            // Insert the document record
            const { data, error } = await supabase
                .from("documents")
                .insert([newDocument])
                .select()
                .single();

            if (error) {
                throw error;
            }

            return data as Document;
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error adding document record";
            setError(message);
            console.error("Error adding document record:", message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [session, setIsLoading, setError]);

    /**
     * Fetches documents based on specified criteria
     * @param options Options for filtering and pagination
     * @returns Object containing documents, error, and count
     */
    const fetchDocuments = useCallback(async (
        options: FetchDocumentsOptions = {},
    ): Promise<DocumentsResult> => {
        try {
            setIsLoading(true);
            setError(null);

            // Build the query
            let query = supabase
                .from("documents")
                .select("*", { count: "exact" });

            // Apply filters
            if (options.division_id !== undefined) {
                query = query.eq("division_id", options.division_id);
            }

            if (options.gca_id !== undefined) {
                query = query.eq("gca_id", options.gca_id);
            }

            if (options.document_category) {
                query = query.eq(
                    "document_category",
                    options.document_category,
                );
            }

            // Handle is_latest filter
            if (options.is_latest !== undefined) {
                query = query.eq("is_latest", options.is_latest);
            } else {
                // Default to latest versions only if not specified
                query = query.eq("is_latest", true);
            }

            // Handle is_deleted filter
            if (options.is_deleted !== undefined) {
                query = query.eq("is_deleted", options.is_deleted);
            } else {
                // By default, exclude deleted documents
                query = query.eq("is_deleted", false);
            }

            // Search by display name or description
            if (options.search) {
                query = query.or(
                    `display_name.ilike.%${options.search}%,description.ilike.%${options.search}%`,
                );
            }

            // Apply pagination
            const page = options.page || currentPage;
            const perPage = options.limit || itemsPerPage;
            const start = (page - 1) * perPage;

            query = query
                .order("created_at", { ascending: false })
                .range(start, start + perPage - 1);

            // Execute the query
            const { data, error, count } = await query;

            if (error) {
                throw error;
            }

            // Update pagination state
            if (count !== null) {
                setTotalCount(count);
            }
            setCurrentPage(page);

            return {
                data: data as Document[] || [],
                error: null,
                count: count || 0,
            };
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error fetching documents";
            setError(message);
            console.error("Error fetching documents:", message);
            return {
                data: [],
                error: new Error(message),
                count: 0,
            };
        } finally {
            setIsLoading(false);
        }
    }, [
        currentPage,
        itemsPerPage,
        setIsLoading,
        setError,
        setTotalCount,
        setCurrentPage,
    ]);

    /**
     * Fetches all versions of a specific document
     * @param documentGroupId The document_group_id to fetch versions for
     * @param includeDeleted Whether to include deleted versions
     * @returns Object containing document versions and error
     */
    const fetchDocumentVersions = useCallback(async (
        documentGroupId: string,
        includeDeleted: boolean = false,
    ): Promise<DocumentsResult> => {
        try {
            setIsLoading(true);
            setError(null);

            // Build the query
            let query = supabase
                .from("documents")
                .select("*", { count: "exact" })
                .eq("document_group_id", documentGroupId)
                .order("version_number", { ascending: false });

            // Exclude deleted versions if specified
            if (!includeDeleted) {
                query = query.eq("is_deleted", false);
            }

            const { data, error, count } = await query;

            if (error) {
                throw error;
            }

            return {
                data: data as Document[] || [],
                error: null,
                count: count || 0,
            };
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error fetching document versions";
            setError(message);
            console.error("Error fetching document versions:", message);
            return {
                data: [],
                error: new Error(message),
                count: 0,
            };
        } finally {
            setIsLoading(false);
        }
    }, [setIsLoading, setError]);

    /**
     * Soft deletes a document by setting is_deleted to true
     * @param documentId The ID of the document to delete
     * @returns True if the document was successfully deleted
     */
    const deleteDocumentRecord = useCallback(async (
        documentId: string,
    ): Promise<boolean> => {
        try {
            if (!session?.user?.id) {
                throw new Error("User not authenticated");
            }

            setIsLoading(true);
            setError(null);

            // Perform soft delete (set is_deleted to true)
            const { error } = await supabase
                .from("documents")
                .update({ is_deleted: true })
                .eq("id", documentId);

            if (error) {
                throw error;
            }

            return true;
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error deleting document";
            setError(message);
            console.error("Error deleting document:", message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [session, setIsLoading, setError]);

    /**
     * Updates metadata for an existing document
     * @param documentId The ID of the document to update
     * @param updates The fields to update
     * @param editReason Optional reason for the edit (for audit log)
     * @returns The updated document
     */
    const updateDocumentRecord = useCallback(async (
        documentId: string,
        updates: DocumentsUpdateData,
        editReason?: string,
    ): Promise<Document | null> => {
        try {
            if (!session?.user?.id) {
                throw new Error("User not authenticated");
            }

            setIsLoading(true);
            setError(null);

            // Update the document record
            const { data, error } = await supabase
                .from("documents")
                .update(updates)
                .eq("id", documentId)
                .select()
                .single();

            if (error) {
                throw error;
            }

            // If an edit reason is provided, add to the audit log
            if (editReason) {
                // The trigger will have already inserted the basic audit record
                // We just need to update it with the reason
                const { error: auditError } = await supabase
                    .from("document_edits_audit_log")
                    .update({ edit_reason: editReason })
                    .eq("document_version_id", documentId)
                    .order("edit_timestamp", { ascending: false })
                    .limit(1);

                if (auditError) {
                    console.error(
                        "Error updating audit log with reason:",
                        auditError,
                    );
                    // Don't throw, this is a non-critical error
                }
            }

            return data as Document;
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error updating document";
            setError(message);
            console.error("Error updating document:", message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [session, setIsLoading, setError]);

    /**
     * Fetches the audit log entries for a document
     * @param documentId The ID of the document to fetch audit logs for
     * @returns List of audit log entries
     */
    const fetchDocumentAuditLog = useCallback(async (
        documentId: string,
    ): Promise<AuditLogEntry[]> => {
        try {
            setIsLoading(true);
            setError(null);

            const { data, error } = await supabase
                .from("document_edits_audit_log")
                .select("*")
                .eq("document_version_id", documentId)
                .order("edit_timestamp", { ascending: false });

            if (error) {
                throw error;
            }

            return data as AuditLogEntry[];
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "Unknown error fetching audit log";
            setError(message);
            console.error("Error fetching audit log:", message);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [setIsLoading, setError]);

    /**
     * Changes the page for paginated results
     * @param page The page number to set
     */
    const setPage = useCallback((page: number) => {
        setCurrentPage(page);
    }, [setCurrentPage]);

    return {
        isLoading,
        error,
        currentPage,
        totalCount,
        itemsPerPage,
        addDocumentRecord,
        fetchDocuments,
        fetchDocumentVersions,
        deleteDocumentRecord,
        updateDocumentRecord,
        fetchDocumentAuditLog,
        setPage,
    };
}
