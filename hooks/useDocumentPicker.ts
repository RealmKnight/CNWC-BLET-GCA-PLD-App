import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";

export interface DocumentPickerResult {
    uri: string;
    name: string;
    size: number;
    type: string;
    error?: Error;
}

type AllowedFileTypes =
    | "application/pdf"
    | "application/msword"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/vnd.ms-excel"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    | "image/jpeg"
    | "image/png";

interface UseDocumentPickerOptions {
    maxSize?: number; // in bytes, default 25MB
    allowedTypes?: AllowedFileTypes[];
}

export function useDocumentPicker(options?: UseDocumentPickerOptions) {
    const [document, setDocument] = useState<DocumentPickerResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const defaultMaxSize = 26214400; // 25MB
    const defaultAllowedTypes: AllowedFileTypes[] = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image/jpeg",
        "image/png",
    ];

    const maxSize = options?.maxSize || defaultMaxSize;
    const allowedTypes = options?.allowedTypes || defaultAllowedTypes;

    // Function to pick a document
    const pickDocument = async (): Promise<DocumentPickerResult | null> => {
        try {
            setIsLoading(true);
            setError(null);

            // Use expo-document-picker to pick a document
            const result = await DocumentPicker.getDocumentAsync({
                type: allowedTypes,
                copyToCacheDirectory: true,
            });

            if (
                result.canceled || !result.assets || result.assets.length === 0
            ) {
                setDocument(null);
                return null;
            }

            const pickedDoc = result.assets[0];

            // Validate file size
            if (pickedDoc.size && pickedDoc.size > maxSize) {
                const err = new Error(
                    `File size exceeds the maximum limit of ${
                        maxSize / (1024 * 1024)
                    }MB`,
                );
                setError(err);
                setDocument(null);
                return { uri: "", name: "", size: 0, type: "", error: err };
            }

            // Format the result to be consistent across platforms
            const formattedResult: DocumentPickerResult = {
                uri: pickedDoc.uri,
                name: pickedDoc.name ||
                    `document_${Date.now()}${
                        getExtensionFromMimeType(pickedDoc.mimeType || "")
                    }`,
                size: pickedDoc.size || 0,
                type: pickedDoc.mimeType || inferMimeType(pickedDoc.name || ""),
            };

            setDocument(formattedResult);
            return formattedResult;
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error when picking document");
            setError(error);
            setDocument(null);
            return { uri: "", name: "", size: 0, type: "", error };
        } finally {
            setIsLoading(false);
        }
    };

    // Reset the state
    const resetDocument = () => {
        setDocument(null);
        setError(null);
    };

    // Helper function to get file extension from MIME type
    const getExtensionFromMimeType = (mimeType: string): string => {
        const mimeExtMap: Record<string, string> = {
            "application/pdf": ".pdf",
            "application/msword": ".doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                ".docx",
            "application/vnd.ms-excel": ".xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                ".xlsx",
            "image/jpeg": ".jpg",
            "image/png": ".png",
        };

        return mimeExtMap[mimeType] || "";
    };

    // Helper function to infer MIME type from filename
    const inferMimeType = (filename: string): string => {
        const extension = filename.split(".").pop()?.toLowerCase() || "";
        const extMimeMap: Record<string, string> = {
            "pdf": "application/pdf",
            "doc": "application/msword",
            "docx":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls": "application/vnd.ms-excel",
            "xlsx":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
        };

        return extMimeMap[extension] || "application/octet-stream";
    };

    return {
        document,
        isLoading,
        error,
        pickDocument,
        resetDocument,
    };
}
