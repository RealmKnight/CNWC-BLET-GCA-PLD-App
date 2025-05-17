import { useCallback, useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSupabaseStorage } from "./useSupabaseStorage";

export interface DownloadOptions {
    /**
     * Whether to cache the file for offline access
     */
    cacheFile?: boolean;

    /**
     * Custom filename to save the file as (not including path)
     */
    customFilename?: string;

    /**
     * Custom directory to save the file in
     */
    customDirectory?: string;

    /**
     * Whether to automatically open/share the file after download
     */
    autoOpen?: boolean;

    /**
     * Callback for download progress (0-1)
     */
    onProgress?: (progress: number) => void;

    /**
     * Callback for download completion
     */
    onComplete?: (fileUri: string) => void;

    /**
     * Callback for download error
     */
    onError?: (error: Error) => void;
}

interface FileDownloaderState {
    isDownloading: boolean;
    progress: number;
    error: Error | null;
    lastDownloadedUri: string | null;
}

export function useFileDownloader() {
    const [state, setState] = useState<FileDownloaderState>({
        isDownloading: false,
        progress: 0,
        error: null,
        lastDownloadedUri: null,
    });

    const { downloadFile, getSignedUrl } = useSupabaseStorage();

    /**
     * Downloads a file directly from a URL
     */
    const downloadFromUrl = useCallback(async (
        url: string,
        filename: string,
        options?: DownloadOptions,
    ): Promise<string | null> => {
        try {
            setState((prev) => ({
                ...prev,
                isDownloading: true,
                progress: 0,
                error: null,
            }));

            if (Platform.OS === "web") {
                // For web, initiate a browser download by opening the URL in a new tab
                window.open(url, "_blank");
                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    progress: 1,
                }));

                if (options?.onComplete) {
                    options.onComplete(url);
                }

                return url;
            } else {
                // For native platforms, use expo-file-system
                // Determine the target directory
                const directory = options?.customDirectory ||
                    (options?.cacheFile
                        ? FileSystem.cacheDirectory ||
                            FileSystem.documentDirectory
                        : FileSystem.documentDirectory);

                // Create the full file path
                const fileUri = `${directory}${
                    options?.customFilename || filename
                }`;

                // Set up the download resumable
                const downloadResumable = FileSystem.createDownloadResumable(
                    url,
                    fileUri,
                    {
                        md5: true,
                    },
                    (downloadProgress) => {
                        const progress = downloadProgress.totalBytesWritten /
                            downloadProgress.totalBytesExpectedToWrite;

                        setState((prev) => ({ ...prev, progress }));

                        if (options?.onProgress) {
                            options.onProgress(progress);
                        }
                    },
                );

                // Start the download
                const result = await downloadResumable.downloadAsync();

                if (!result) {
                    throw new Error("Download failed");
                }

                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    progress: 1,
                    lastDownloadedUri: result.uri,
                }));

                // Auto open/share the file if requested
                if (options?.autoOpen && result.uri) {
                    await openFile(result.uri);
                }

                if (options?.onComplete) {
                    options.onComplete(result.uri);
                }

                return result.uri;
            }
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Unknown download error");

            setState((prev) => ({
                ...prev,
                isDownloading: false,
                error: err,
            }));

            if (options?.onError) {
                options.onError(err);
            }

            console.error("Download error:", err);
            return null;
        }
    }, []);

    /**
     * Downloads a file from Supabase Storage
     */
    const downloadFromSupabase = useCallback(async (
        bucketName: string,
        filePath: string,
        options?: DownloadOptions,
    ): Promise<string | null> => {
        try {
            setState((prev) => ({
                ...prev,
                isDownloading: true,
                progress: 0,
                error: null,
            }));

            // Extract filename from the path
            const filename = filePath.split("/").pop() || "downloaded-file";

            // Use custom filename if provided
            const targetFilename = options?.customFilename || filename;

            if (Platform.OS === "web") {
                // For web, get a signed URL and open it
                const signedUrl = await getSignedUrl(
                    bucketName,
                    filePath,
                    3600,
                );

                if (!signedUrl) {
                    throw new Error("Failed to get signed URL");
                }

                window.open(signedUrl, "_blank");

                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    progress: 1,
                    lastDownloadedUri: signedUrl,
                }));

                if (options?.onComplete) {
                    options.onComplete(signedUrl);
                }

                return signedUrl;
            } else {
                // Determine the target directory
                const directory = options?.customDirectory ||
                    (options?.cacheFile
                        ? FileSystem.cacheDirectory ||
                            FileSystem.documentDirectory
                        : FileSystem.documentDirectory);

                // Create the full file path
                const fileUri = `${directory}${targetFilename}`;

                // Download using useSupabaseStorage hook
                const result = await downloadFile(
                    bucketName,
                    filePath,
                    fileUri,
                    {
                        cacheFile: options?.cacheFile,
                        progressCallback: (progress) => {
                            setState((prev) => ({ ...prev, progress }));

                            if (options?.onProgress) {
                                options.onProgress(progress);
                            }
                        },
                    },
                );

                if (!result) {
                    throw new Error("Download failed");
                }

                const resultUri = typeof result === "string"
                    ? result
                    : URL.createObjectURL(result);

                setState((prev) => ({
                    ...prev,
                    isDownloading: false,
                    progress: 1,
                    lastDownloadedUri: resultUri,
                }));

                // Auto open/share the file if requested
                if (options?.autoOpen && typeof result === "string") {
                    await openFile(result);
                }

                if (options?.onComplete) {
                    options.onComplete(resultUri);
                }

                return resultUri;
            }
        } catch (error) {
            const err = error instanceof Error
                ? error
                : new Error("Unknown download error");

            setState((prev) => ({
                ...prev,
                isDownloading: false,
                error: err,
            }));

            if (options?.onError) {
                options.onError(err);
            }

            console.error("Download error:", err);
            return null;
        }
    }, [downloadFile, getSignedUrl]);

    /**
     * Cancels an active download
     */
    const cancelDownload = useCallback(
        async (
            downloadResumable: FileSystem.DownloadResumable,
        ): Promise<void> => {
            try {
                await downloadResumable.cancelAsync();
                setState((prev) => ({ ...prev, isDownloading: false }));
            } catch (error) {
                console.error("Error canceling download:", error);
            }
        },
        [],
    );

    /**
     * Opens a file using the appropriate system app
     */
    const openFile = useCallback(async (fileUri: string): Promise<void> => {
        if (Platform.OS === "web") {
            window.open(fileUri, "_blank");
            return;
        }

        try {
            // Check if sharing is available
            const canShare = await Sharing.isAvailableAsync();

            if (canShare) {
                await Sharing.shareAsync(fileUri);
            } else {
                console.warn("Sharing is not available on this device");
            }
        } catch (error) {
            console.error("Error opening file:", error);
        }
    }, []);

    /**
     * Clears the download cache
     */
    const clearCache = useCallback(async (): Promise<void> => {
        try {
            if (Platform.OS !== "web" && FileSystem.cacheDirectory) {
                const cacheContents = await FileSystem.readDirectoryAsync(
                    FileSystem.cacheDirectory,
                );

                // Delete each cached file
                for (const file of cacheContents) {
                    if (file !== ".DS_Store") { // Skip macOS hidden file
                        await FileSystem.deleteAsync(
                            `${FileSystem.cacheDirectory}${file}`,
                        );
                    }
                }
            }
        } catch (error) {
            console.error("Error clearing cache:", error);
        }
    }, []);

    return {
        isDownloading: state.isDownloading,
        progress: state.progress,
        error: state.error,
        lastDownloadedUri: state.lastDownloadedUri,
        downloadFromUrl,
        downloadFromSupabase,
        cancelDownload,
        openFile,
        clearCache,
    };
}
