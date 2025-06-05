import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, Linking, TouchableOpacity } from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { PdfViewerProps } from "./PdfViewer";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import PdfRendererView from "react-native-pdf-renderer";

type ColorSchemeName = keyof typeof Colors;

// Native-specific implementation for PDF viewing using react-native-pdf-renderer
export default function PdfViewer({ url, title }: PdfViewerProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState(false);

  // Download the PDF locally for react-native-pdf-renderer (requires local file path)
  useEffect(() => {
    if (url) {
      downloadPdfLocally();
    }
  }, [url]);

  const downloadPdfLocally = async () => {
    if (!url) return;

    try {
      setIsDownloading(true);
      setPdfLoadError(false);

      // Create a unique filename
      const fileName = `pdf_${Date.now()}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      // Download the file
      const downloadResumable = FileSystem.createDownloadResumable(url, fileUri, {}, (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setDownloadProgress(progress);
      });

      const result = await downloadResumable.downloadAsync();
      if (result && result.uri) {
        setLocalFilePath(result.uri);
      } else {
        throw new Error("Download failed - no file URI returned");
      }
      setIsDownloading(false);
    } catch (error) {
      console.error("Failed to download PDF locally:", error);
      setIsDownloading(false);
      setPdfLoadError(true);
    }
  };

  const openInSystemViewer = async () => {
    try {
      // If we have a local copy, share it
      if (localFilePath) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(localFilePath);
          return;
        }
      }

      // Otherwise try to open the original URL
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error("Failed to open PDF in system viewer:", error);
      // Try direct linking as last resort
      Linking.openURL(url).catch((err) => console.error("Could not open URL:", err));
    }
  };

  if (!url) {
    return (
      <ThemedView style={styles.fallbackContainer}>
        <ThemedText style={styles.fallbackText}>No PDF URL provided.</ThemedText>
      </ThemedView>
    );
  }

  if (isDownloading) {
    return (
      <ThemedView style={styles.fallbackContainer}>
        <Ionicons name="download-outline" size={36} color={Colors[colorScheme].text} />
        <ThemedText style={styles.fallbackText}>Downloading PDF... {Math.round(downloadProgress * 100)}%</ThemedText>
      </ThemedView>
    );
  }

  if (pdfLoadError || !localFilePath) {
    return (
      <ThemedView style={styles.fallbackContainer}>
        <Ionicons name="document-text-outline" size={50} color={Colors[colorScheme].text} style={styles.icon} />
        <ThemedText style={styles.fallbackText}>
          {pdfLoadError ? "Failed to load PDF." : "PDF preview is not available directly in the app."}
        </ThemedText>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: Colors[colorScheme].tint }]}
          onPress={openInSystemViewer}
        >
          <ThemedText style={styles.buttonText}>Open in PDF Viewer</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  // Use react-native-pdf-renderer with the downloaded local file
  return (
    <ThemedView style={styles.container}>
      <PdfRendererView
        source={localFilePath}
        style={styles.pdf}
        distanceBetweenPages={16}
        maxZoom={5}
        onPageChange={(current, total) => {
          console.log(`PDF Page ${current} of ${total}`);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    height: 500,
  },
  fallbackText: {
    textAlign: "center",
    fontSize: 16,
    opacity: 0.8,
    marginVertical: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  icon: {
    marginBottom: 12,
  },
});
