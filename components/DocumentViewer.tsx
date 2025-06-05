import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View, Platform, Image, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import * as WebBrowser from "expo-web-browser";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
// Import our platform-specific PDF viewer
import PdfViewer from "./PdfViewer";
import { PdfViewerProps } from "./PdfViewer";
import { WebView } from "react-native-webview";

import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { ThemedScrollView } from "./ThemedScrollView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

type ColorSchemeName = keyof typeof Colors;

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
  division_id?: number | null;
  gca_id?: string | null;
  document_category?: string;
  description?: string | null;
  is_public: boolean;
  is_deleted: boolean;
  uploader_name?: string; // Optional joined field for display
}

interface DocumentViewerProps {
  document: Document;
  fileUrl: string;
  versions?: Document[];
  onDownload?: () => void;
  onClose?: () => void;
  isLoading?: boolean;
}

export function DocumentViewer({
  document,
  fileUrl,
  versions = [],
  onDownload,
  onClose,
  isLoading = false,
}: DocumentViewerProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      return format(parseISO(dateString), "MMMM d, yyyy");
    } catch (error) {
      return dateString;
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Handle file download
  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    if (Platform.OS === "web") {
      // For web, open in new tab or download directly
      window.open(fileUrl, "_blank");
      return;
    }

    try {
      setIsDownloading(true);

      const isAndroid = Platform.OS === "android";

      // For Android, use WebBrowser for simpler file opening
      if (isAndroid) {
        try {
          await WebBrowser.openBrowserAsync(fileUrl);
          setIsDownloading(false);
          return;
        } catch (webError) {
          console.log("WebBrowser failed, falling back to download:", webError);
          // Continue with download as fallback
        }
      }

      // Ensure the directory exists
      const fileUri = FileSystem.documentDirectory + document.file_name;

      // Download the file
      const downloadResumable = FileSystem.createDownloadResumable(fileUrl, fileUri, {}, (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setDownloadProgress(progress);
      });

      const result = await downloadResumable.downloadAsync();
      setIsDownloading(false);

      if (result && result.uri) {
        // Share the downloaded file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri);
        } else if (isAndroid) {
          // If sharing isn't available on Android, try to open with Intent
          try {
            await WebBrowser.openBrowserAsync(`file://${result.uri}`);
          } catch (e) {
            console.error("Could not open file with WebBrowser:", e);
            // Last resort - try direct link
            Linking.openURL(fileUrl).catch((err) => console.error("Could not open URL:", err));
          }
        }
      }
    } catch (error) {
      console.error("Download error:", error);
      setIsDownloading(false);

      // For Android, try direct URL as last resort
      if (Platform.OS === "android") {
        try {
          await Linking.openURL(fileUrl);
        } catch (linkError) {
          console.error("Could not open URL:", linkError);
        }
      }
    }
  };

  // Render PDF viewer or fallback based on file type and platform
  const renderDocumentContent = () => {
    if (isLoading) {
      return (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Loading document...</ThemedText>
        </ThemedView>
      );
    }

    const fileType = document.file_type.toLowerCase();
    const isPdf = fileType === "pdf";
    const isImage = fileType.match(/^(png|jpg|jpeg|gif)$/) !== null;
    const isAndroid = Platform.OS === "android";

    // For PDFs, use our cross-platform PDF viewer
    if (isPdf) {
      return <PdfViewer url={fileUrl} title={document.display_name} />;
    }
    // For images
    else if (isImage) {
      return (
        <View style={styles.imageContainer}>
          <Image source={{ uri: fileUrl }} style={styles.image} resizeMode="contain" />
        </View>
      );
    }
    // For Office documents on Android, provide direct open option
    else if (isAndroid && fileType.match(/^(doc|docx|xls|xlsx|ppt|pptx)$/)) {
      return (
        <ThemedView style={styles.fileInfoContainer}>
          <Ionicons name="document-outline" size={64} color={Colors[colorScheme].text} style={styles.fileIcon} />
          <ThemedText style={styles.fileInfoText}>
            This file type ({document.file_type}) cannot be previewed in the app.
          </ThemedText>
          <ThemedText style={styles.fileInfoSubtext}>File size: {formatFileSize(document.file_size)}</ThemedText>
          <TouchableOpacity style={styles.downloadButton} onPress={handleDownload} disabled={isDownloading}>
            {isDownloading ? (
              <ThemedView style={styles.downloadProgressContainer}>
                <ThemedText style={styles.downloadButtonText}>
                  Downloading... {Math.round(downloadProgress * 100)}%
                </ThemedText>
              </ThemedView>
            ) : (
              <>
                <Ionicons name="open-outline" size={20} color={Colors[colorScheme].buttonText} />
                <ThemedText style={styles.downloadButtonText}>Open in External App</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </ThemedView>
      );
    }
    // For all other file types, or on other platforms
    else {
      return (
        <ThemedView style={styles.fileInfoContainer}>
          <Ionicons name="document-outline" size={64} color={Colors[colorScheme].text} style={styles.fileIcon} />
          <ThemedText style={styles.fileInfoText}>
            This file type ({document.file_type}) cannot be previewed.
          </ThemedText>
          <ThemedText style={styles.fileInfoSubtext}>File size: {formatFileSize(document.file_size)}</ThemedText>
          <TouchableOpacity style={styles.downloadButton} onPress={handleDownload} disabled={isDownloading}>
            {isDownloading ? (
              <ThemedView style={styles.downloadProgressContainer}>
                <ThemedText style={styles.downloadButtonText}>
                  Downloading... {Math.round(downloadProgress * 100)}%
                </ThemedText>
              </ThemedView>
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color={Colors[colorScheme].buttonText} />
                <ThemedText style={styles.downloadButtonText}>Download File</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </ThemedView>
      );
    }
  };

  // Render version history section
  const renderVersionHistory = () => {
    if (!showVersionHistory) return null;

    return (
      <ThemedView style={styles.versionHistoryContainer}>
        <ThemedText style={styles.versionHistoryTitle}>Version History</ThemedText>
        {versions.length > 0 ? (
          versions.map((version) => (
            <ThemedView key={version.id} style={styles.versionItem}>
              <ThemedText style={styles.versionNumber}>v{version.version_number}</ThemedText>
              <ThemedText style={styles.versionDate}>{formatDate(version.created_at)}</ThemedText>
              {version.uploader_name && (
                <ThemedText style={styles.versionUploader}>by {version.uploader_name}</ThemedText>
              )}
              {version.id === document.id && (
                <ThemedView style={styles.currentVersionBadge}>
                  <ThemedText style={styles.currentVersionText}>Current</ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          ))
        ) : (
          <ThemedText style={styles.noVersionsText}>No previous versions available</ThemedText>
        )}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>{document.display_name}</ThemedText>
        <ThemedText style={styles.date}>Uploaded on {formatDate(document.created_at)}</ThemedText>

        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors[colorScheme].text} />
          </TouchableOpacity>
        )}
      </ThemedView>

      <ThemedView style={styles.fileMetadata}>
        <ThemedView style={styles.metadataItem}>
          <Ionicons name="document-outline" size={18} color={Colors[colorScheme].text} />
          <ThemedText style={styles.metadataText}>{document.file_name}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.metadataItem}>
          <Ionicons name="folder-outline" size={18} color={Colors[colorScheme].text} />
          <ThemedText style={styles.metadataText}>{document.file_type.toUpperCase()}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.metadataItem}>
          <Ionicons name="save-outline" size={18} color={Colors[colorScheme].text} />
          <ThemedText style={styles.metadataText}>{formatFileSize(document.file_size)}</ThemedText>
        </ThemedView>

        {document.version_number > 1 && (
          <ThemedView style={styles.metadataItem}>
            <Ionicons name="git-branch-outline" size={18} color={Colors[colorScheme].text} />
            <ThemedText style={styles.metadataText}>Version {document.version_number}</ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      {document.description && (
        <ThemedView style={styles.descriptionContainer}>
          <ThemedText style={styles.description}>{document.description}</ThemedText>
        </ThemedView>
      )}

      <ThemedScrollView style={styles.documentContent}>{renderDocumentContent()}</ThemedScrollView>

      <ThemedView style={styles.actionBar}>
        <TouchableOpacity style={styles.actionButton} onPress={handleDownload} disabled={isDownloading}>
          <Ionicons name="download-outline" size={20} color={Colors[colorScheme].text} />
          <ThemedText style={styles.actionButtonText}>
            {isDownloading ? `${Math.round(downloadProgress * 100)}%` : "Download"}
          </ThemedText>
        </TouchableOpacity>

        {versions.length > 0 && (
          <TouchableOpacity style={styles.actionButton} onPress={() => setShowVersionHistory(!showVersionHistory)}>
            <Ionicons name="git-branch-outline" size={20} color={Colors[colorScheme].text} />
            <ThemedText style={styles.actionButtonText}>
              {showVersionHistory ? "Hide Versions" : "Show Versions"}
            </ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>

      {renderVersionHistory()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#B4975A",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
  },
  fileMetadata: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    backgroundColor: "rgba(180, 151, 90, 0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "#B4975A",
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginBottom: 8,
  },
  metadataText: {
    fontSize: 14,
    marginLeft: 4,
  },
  descriptionContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#B4975A",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  documentContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 300,
  },
  pdfContainer: {
    flex: 1,
    height: 500,
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  imageContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  image: {
    width: "100%",
    height: 400,
  },
  fileInfoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  fileIcon: {
    marginBottom: 16,
  },
  fileInfoText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  fileInfoSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
    opacity: 0.7,
  },
  downloadButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  downloadButtonText: {
    fontSize: 14,
    color: "#000",
    marginLeft: 8,
  },
  downloadProgressContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#B4975A",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  actionButtonText: {
    fontSize: 14,
    marginLeft: 8,
  },
  versionHistoryContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#B4975A",
  },
  versionHistoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  versionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.3)",
  },
  versionNumber: {
    fontSize: 14,
    fontWeight: "600",
    width: 40,
  },
  versionDate: {
    fontSize: 14,
    flex: 1,
  },
  versionUploader: {
    fontSize: 14,
    color: "#B4975A",
    marginRight: 8,
  },
  currentVersionBadge: {
    backgroundColor: "#B4975A",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  currentVersionText: {
    fontSize: 12,
    color: "#000",
  },
  noVersionsText: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
    textAlign: "center",
    padding: 12,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    height: 300,
  },
  fallbackText: {
    textAlign: "center",
    fontSize: 16,
    opacity: 0.8,
    marginVertical: 10,
  },
  androidButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
    backgroundColor: "#B4975A",
  },
  androidButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
    textAlign: "center",
  },
});
