import { useCallback } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { useFileDownloader } from "./useFileDownloader";

export type FileType =
    | "pdf"
    | "doc"
    | "docx"
    | "xls"
    | "xlsx"
    | "jpg"
    | "jpeg"
    | "png"
    | "gif"
    | "txt"
    | "unknown";

export interface FileInfo {
    uri: string;
    fileType: FileType;
    filename: string;
    fileSize?: number;
    mimeType?: string;
}

interface FileTypeHandlerOptions {
    /**
     * Whether to immediately download non-viewable files
     */
    autoDownload?: boolean;

    /**
     * Whether to open files after download
     */
    autoOpen?: boolean;

    /**
     * Whether to cache downloaded files
     */
    cacheFiles?: boolean;

    /**
     * Callback for download progress
     */
    onProgress?: (progress: number) => void;

    /**
     * Callback for download completion
     */
    onComplete?: (fileUri: string) => void;

    /**
     * Callback for errors
     */
    onError?: (error: Error) => void;
}

/**
 * Hook for handling different file types
 */
export function useFileTypeHandler(options?: FileTypeHandlerOptions) {
    const {
        downloadFromUrl,
        openFile,
        isDownloading,
        progress,
    } = useFileDownloader();

    /**
     * Get file type from filename or mimeType
     */
    const getFileType = useCallback(
        (filename: string, mimeType?: string): FileType => {
            // If mimeType is provided, try to determine from it first
            if (mimeType) {
                if (mimeType === "application/pdf") return "pdf";
                if (mimeType === "application/msword") return "doc";
                if (
                    mimeType ===
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ) return "docx";
                if (mimeType === "application/vnd.ms-excel") return "xls";
                if (
                    mimeType ===
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ) return "xlsx";
                if (mimeType === "image/jpeg") return "jpeg";
                if (mimeType === "image/png") return "png";
                if (mimeType === "image/gif") return "gif";
                if (mimeType === "text/plain") return "txt";
            }

            // Otherwise, extract from filename
            const extension = filename.toLowerCase().split(".").pop() || "";

            if (extension === "pdf") return "pdf";
            if (extension === "doc") return "doc";
            if (extension === "docx") return "docx";
            if (extension === "xls") return "xls";
            if (extension === "xlsx") return "xlsx";
            if (extension === "jpg" || extension === "jpeg") return "jpeg";
            if (extension === "png") return "png";
            if (extension === "gif") return "gif";
            if (extension === "txt") return "txt";

            return "unknown";
        },
        [],
    );

    /**
     * Get mime type from file type
     */
    const getMimeType = useCallback((fileType: FileType): string => {
        switch (fileType) {
            case "pdf":
                return "application/pdf";
            case "doc":
                return "application/msword";
            case "docx":
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xls":
                return "application/vnd.ms-excel";
            case "xlsx":
                return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "png":
                return "image/png";
            case "gif":
                return "image/gif";
            case "txt":
                return "text/plain";
            default:
                return "application/octet-stream";
        }
    }, []);

    /**
     * Check if a file type can be viewed directly in the app
     */
    const canViewFileInApp = useCallback((fileType: FileType): boolean => {
        // PDF files can be viewed on all platforms
        if (fileType === "pdf") return true;

        // Images can be viewed on all platforms
        if (["jpg", "jpeg", "png", "gif"].includes(fileType)) return true;

        // Text files can be viewed on web
        if (fileType === "txt" && Platform.OS === "web") return true;

        return false;
    }, []);

    /**
     * Handle a file based on its type
     */
    const handleFile = useCallback(async (
        fileInfo: FileInfo,
    ): Promise<void> => {
        const { uri, fileType, filename } = fileInfo;

        // If the file is viewable in-app, we don't need to do anything special
        if (canViewFileInApp(fileType)) {
            return;
        }

        try {
            // For non-viewable files, download or open them
            if (Platform.OS === "web") {
                // On web, open a new tab
                window.open(uri, "_blank");
            } else {
                // On native, download and/or share
                if (options?.autoDownload) {
                    await downloadFromUrl(
                        uri,
                        filename,
                        {
                            cacheFile: options?.cacheFiles,
                            autoOpen: options?.autoOpen,
                            onProgress: options?.onProgress,
                            onComplete: options?.onComplete,
                            onError: options?.onError,
                        },
                    );
                } else if (options?.autoOpen) {
                    // Open the file directly if autoOpen is true but autoDownload is false
                    await openFile(uri);
                }
            }
        } catch (error) {
            console.error("Error handling file:", error);

            if (options?.onError) {
                options.onError(
                    error instanceof Error
                        ? error
                        : new Error("Error handling file"),
                );
            }
        }
    }, [canViewFileInApp, downloadFromUrl, openFile, options]);

    /**
     * Open a file with the system's default application
     */
    const openFileWithSystem = useCallback(
        async (fileUri: string): Promise<void> => {
            try {
                if (Platform.OS === "web") {
                    window.open(fileUri, "_blank");
                } else if (Platform.OS === "ios" || Platform.OS === "android") {
                    // For mobile, we use Sharing API which opens the share sheet
                    if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(fileUri);
                    } else {
                        // Fallback to WebBrowser if sharing is not available
                        await WebBrowser.openBrowserAsync(fileUri);
                    }
                }
            } catch (error) {
                console.error("Error opening file with system:", error);

                if (options?.onError) {
                    options.onError(
                        error instanceof Error
                            ? error
                            : new Error("Error opening file with system"),
                    );
                }
            }
        },
        [options],
    );

    /**
     * Extract file information from a URI
     */
    const getFileInfo = useCallback(async (uri: string): Promise<FileInfo> => {
        try {
            let fileSize = 0;
            let mimeType: string | undefined;

            // Try to get file info from FileSystem if on native
            if (Platform.OS !== "web" && uri.startsWith("file:")) {
                try {
                    const fileInfo = await FileSystem.getInfoAsync(uri);
                    if (fileInfo.exists && "size" in fileInfo) {
                        fileSize = fileInfo.size || 0;
                    }
                } catch (e) {
                    console.warn("Could not get file info:", e);
                }
            }

            // Extract filename from URI
            const uriParts = uri.split("/");
            const filename = uriParts[uriParts.length - 1].split("?")[0];

            // Determine file type
            const fileType = getFileType(filename, mimeType);

            return {
                uri,
                fileType,
                filename,
                fileSize,
                mimeType: mimeType || getMimeType(fileType),
            };
        } catch (error) {
            console.error("Error getting file info:", error);

            // Return minimal file info
            return {
                uri,
                fileType: "unknown",
                filename: "unknown",
            };
        }
    }, [getFileType, getMimeType]);

    return {
        getFileType,
        getMimeType,
        canViewFileInApp,
        handleFile,
        openFileWithSystem,
        getFileInfo,
        isDownloading,
        progress,
    };
}
