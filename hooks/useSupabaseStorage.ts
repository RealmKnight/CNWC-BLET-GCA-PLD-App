import { useState } from "react";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { supabase } from "@/utils/supabase";

export interface UploadFileOptions {
    contentType?: string;
    upsert?: boolean;
    metadata?: Record<string, string>;
    progressCallback?: (progress: number) => void;
}

export interface DownloadFileOptions {
    cacheFile?: boolean;
    progressCallback?: (progress: number) => void;
}

export interface FileMetadata {
    size?: number;
    type?: string;
    lastModified?: number;
    name?: string;
}

interface SupabaseStorageState {
    isLoading: boolean;
    progress: number;
    error: Error | null;
}

export function useSupabaseStorage() {
    const [state, setState] = useState<SupabaseStorageState>({
        isLoading: false,
        progress: 0,
        error: null,
    });

    /**
     * Uploads a file to Supabase Storage
     * @param bucketName The name of the bucket to upload to (e.g., "division_documents")
     * @param filePath The path within the bucket (e.g., "division_id/version_id.pdf")
     * @param fileUriOrData The file URI on mobile or file data (Blob/Base64) on web
     * @param options Upload options
     * @returns The public URL of the uploaded file
     */
    const uploadFile = async (
        bucketName: string,
        filePath: string,
        fileUriOrData: string | Blob,
        options?: UploadFileOptions,
    ): Promise<string | null> => {
        try {
            setState({ isLoading: true, progress: 0, error: null });

            let data;
            if (Platform.OS === "web") {
                // Handle web upload
                let fileData: Blob;
                if (typeof fileUriOrData === "string") {
                    // Convert URI to Blob
                    const response = await fetch(fileUriOrData);
                    fileData = await response.blob();
                } else {
                    // Already a Blob
                    fileData = fileUriOrData;
                }

                // Report initial progress
                if (options?.progressCallback) {
                    options.progressCallback(0.1);
                }
                setState((prev) => ({ ...prev, progress: 0.1 }));

                // Upload to Supabase Storage
                const uploadResult = await supabase.storage
                    .from(bucketName)
                    .upload(filePath, fileData, {
                        contentType: options?.contentType,
                        upsert: options?.upsert ?? true,
                        ...options?.metadata,
                    });

                // Handle upload error
                if (uploadResult.error) {
                    throw uploadResult.error;
                }

                data = uploadResult.data;

                // Report completion
                if (options?.progressCallback) {
                    options.progressCallback(1);
                }
                setState((prev) => ({ ...prev, progress: 1 }));
            } else {
                // Handle native platform upload
                if (typeof fileUriOrData !== "string") {
                    throw new Error(
                        "File URI must be a string on mobile platforms",
                    );
                }

                // Read file as base64 string
                const fileContent = await FileSystem.readAsStringAsync(
                    fileUriOrData,
                    {
                        encoding: FileSystem.EncodingType.Base64,
                    },
                );

                // Report initial progress
                if (options?.progressCallback) {
                    options.progressCallback(0.3);
                }
                setState((prev) => ({ ...prev, progress: 0.3 }));

                // Upload to Supabase Storage
                const uploadResult = await supabase.storage
                    .from(bucketName)
                    .upload(filePath, fileContent, {
                        contentType: options?.contentType,
                        upsert: options?.upsert ?? true,
                        ...options?.metadata,
                    });

                // Handle upload error
                if (uploadResult.error) {
                    throw uploadResult.error;
                }

                data = uploadResult.data;

                // Report completion
                if (options?.progressCallback) {
                    options.progressCallback(1);
                }
                setState((prev) => ({ ...prev, progress: 1 }));
            }

            // Get public URL for the file
            const { data: urlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            return urlData.publicUrl;
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error during file upload");
            setState({ isLoading: false, progress: 0, error });
            return null;
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    /**
     * Generates a signed URL for a file
     * @param bucketName The name of the bucket (e.g., "division_documents")
     * @param filePath The path within the bucket (e.g., "division_id/version_id.pdf")
     * @param expiresIn Expiration time in seconds (default: 3600)
     * @returns The signed URL
     */
    const getSignedUrl = async (
        bucketName: string,
        filePath: string,
        expiresIn: number = 3600,
    ): Promise<string | null> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            const { data, error } = await supabase.storage
                .from(bucketName)
                .createSignedUrl(filePath, expiresIn);

            if (error) {
                throw error;
            }

            return data.signedUrl;
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error getting signed URL");
            setState((prev) => ({ ...prev, error }));
            return null;
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    /**
     * Downloads a file from Supabase Storage
     * @param bucketName The name of the bucket (e.g., "division_documents")
     * @param filePath The path within the bucket (e.g., "division_id/version_id.pdf")
     * @param destinationUri Local destination path (mobile only)
     * @param options Download options
     * @returns The local file URI or Blob (depending on platform)
     */
    const downloadFile = async (
        bucketName: string,
        filePath: string,
        destinationUri?: string,
        options?: DownloadFileOptions,
    ): Promise<string | Blob | null> => {
        try {
            setState({ isLoading: true, progress: 0, error: null });

            const { data: signedUrlData, error: signedUrlError } =
                await supabase.storage
                    .from(bucketName)
                    .createSignedUrl(filePath, 3600);

            if (signedUrlError) {
                throw signedUrlError;
            }

            const signedUrl = signedUrlData.signedUrl;

            if (Platform.OS === "web") {
                // For web, fetch the file and return a Blob
                const response = await fetch(signedUrl);

                if (!response.ok) {
                    throw new Error(
                        `Failed to download file: ${response.statusText}`,
                    );
                }

                // Report completion
                if (options?.progressCallback) {
                    options.progressCallback(1);
                }
                setState((prev) => ({ ...prev, progress: 1 }));

                return await response.blob();
            } else {
                // For mobile, use FileSystem to download the file
                const dest = destinationUri ||
                    `${FileSystem.cacheDirectory}${bucketName}_${
                        filePath.replace(/\//g, "_")
                    }`;

                // Set up download callback
                const downloadCallback = (
                    { totalBytesWritten, totalBytesExpectedToWrite }: {
                        totalBytesWritten: number;
                        totalBytesExpectedToWrite: number;
                    },
                ) => {
                    const progress = totalBytesWritten /
                        totalBytesExpectedToWrite;
                    if (options?.progressCallback) {
                        options.progressCallback(progress);
                    }
                    setState((prev) => ({ ...prev, progress }));
                };

                // Download the file
                const downloadResult = await FileSystem.downloadAsync(
                    signedUrl,
                    dest,
                    {
                        md5: true,
                        cache: options?.cacheFile === false ? false : true,
                    },
                );

                if (downloadResult.status !== 200) {
                    throw new Error(
                        `File download failed with status ${downloadResult.status}`,
                    );
                }

                return downloadResult.uri;
            }
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error during file download");
            setState({ isLoading: false, progress: 0, error });
            return null;
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    /**
     * Deletes a file from Supabase Storage
     * @param bucketName The name of the bucket (e.g., "division_documents")
     * @param filePath The path within the bucket (e.g., "division_id/version_id.pdf")
     * @returns True if the file was deleted successfully
     */
    const deleteFile = async (
        bucketName: string,
        filePath: string,
    ): Promise<boolean> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            const { error } = await supabase.storage
                .from(bucketName)
                .remove([filePath]);

            if (error) {
                throw error;
            }

            return true;
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error deleting file");
            setState((prev) => ({ ...prev, error }));
            return false;
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    /**
     * Gets metadata for a file in Supabase Storage
     * @param bucketName The name of the bucket (e.g., "division_documents")
     * @param filePath The path within the bucket (e.g., "division_id/version_id.pdf")
     * @returns File metadata
     */
    const getFileMetadata = async (
        bucketName: string,
        filePath: string,
    ): Promise<FileMetadata | null> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            const { data, error } = await supabase.storage
                .from(bucketName)
                .download(filePath);

            if (error) {
                throw error;
            }

            // Basic metadata from the Blob
            const metadata: FileMetadata = {
                size: data.size,
                type: data.type,
            };

            return metadata;
        } catch (err) {
            const error = err instanceof Error
                ? err
                : new Error("Unknown error getting file metadata");
            setState((prev) => ({ ...prev, error }));
            return null;
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    return {
        isLoading: state.isLoading,
        progress: state.progress,
        error: state.error,
        uploadFile,
        downloadFile,
        getSignedUrl,
        deleteFile,
        getFileMetadata,
    };
}
