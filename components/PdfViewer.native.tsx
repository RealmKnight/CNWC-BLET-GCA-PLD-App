import React, { useState, useEffect } from "react";
import { StyleSheet, View, Platform, Linking, TouchableOpacity } from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { PdfViewerProps } from "./PdfViewer";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";

type ColorSchemeName = keyof typeof Colors;

// Native-specific implementation for PDF viewing
export default function PdfViewer({ url, title }: PdfViewerProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [localFilePath, setLocalFilePath] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState(false);

  // Check if we can use direct PDF viewing or need fallback approach
  const isAndroid = Platform.OS === "android";
  let Pdf;

  try {
    // Dynamically import to prevent crashes if module is missing
    Pdf = require("react-native-pdf").default;
  } catch (e) {
    console.log("react-native-pdf not available");
  }

  // For Android, download the PDF locally first for better compatibility
  useEffect(() => {
    if (isAndroid && url) {
      downloadPdfLocally();
    }
  }, [url]);

  const downloadPdfLocally = async () => {
    if (!url) return;

    try {
      setIsDownloading(true);

      // Create a unique filename
      const fileName = `temp_${Date.now()}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      // Download the file
      const downloadResumable = FileSystem.createDownloadResumable(url, fileUri, {}, (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setDownloadProgress(progress);
      });

      const result = await downloadResumable.downloadAsync();
      if (result && result.uri) {
        setLocalFilePath(result.uri);
      }
      setIsDownloading(false);
    } catch (e) {
      console.error("Failed to download PDF locally:", e);
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

  // Return different viewer based on platform and available components
  if (isAndroid) {
    if (pdfLoadError || !Pdf) {
      // Android fallback options
      return (
        <ThemedView style={styles.fallbackContainer}>
          <Ionicons name="document-text-outline" size={50} color={Colors[colorScheme].text} style={styles.icon} />
          <ThemedText style={styles.fallbackText}>PDF preview is not available directly in the app.</ThemedText>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors[colorScheme].tint }]}
            onPress={openInSystemViewer}
          >
            <ThemedText style={styles.buttonText}>Open in PDF Viewer</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      );
    }

    // Use local file path if available, otherwise use original URL
    const pdfSource = localFilePath ? { uri: localFilePath } : { uri: url };

    // Try the PDF viewer component first
    try {
      return (
        <View style={styles.pdfContainer}>
          <Pdf
            source={pdfSource}
            style={styles.pdf}
            onLoadComplete={(numberOfPages: number) => {
              console.log(`Loaded ${numberOfPages} pages`);
            }}
            onError={(error: object) => {
              console.log("PDF Error:", error);
              setPdfLoadError(true);
            }}
            onPressLink={(uri: string) => {
              console.log(`Link pressed: ${uri}`);
              Linking.openURL(uri);
            }}
          />
        </View>
      );
    } catch (e) {
      console.error("Failed to load PDF component", e);
      setPdfLoadError(true);
      return (
        <ThemedView style={styles.fallbackContainer}>
          <Ionicons name="document-text-outline" size={50} color={Colors[colorScheme].text} style={styles.icon} />
          <ThemedText style={styles.fallbackText}>PDF preview failed to load.</ThemedText>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors[colorScheme].tint }]}
            onPress={openInSystemViewer}
          >
            <ThemedText style={styles.buttonText}>Open in PDF Viewer</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      );
    }
  } else {
    // iOS can use react-native-pdf directly
    if (Pdf) {
      try {
        return (
          <View style={styles.pdfContainer}>
            <Pdf
              source={{ uri: url }}
              style={styles.pdf}
              onLoadComplete={(numberOfPages: number) => {
                console.log(`Loaded ${numberOfPages} pages`);
              }}
              onError={(error: object) => {
                console.log("PDF Error:", error);
                setPdfLoadError(true);
              }}
              onPressLink={(uri: string) => {
                Linking.openURL(uri);
              }}
            />
          </View>
        );
      } catch (e) {
        setPdfLoadError(true);
      }
    }

    // Fallback for iOS
    if (pdfLoadError || !Pdf) {
      return (
        <ThemedView style={styles.fallbackContainer}>
          <Ionicons name="document-text-outline" size={50} color={Colors[colorScheme].text} style={styles.icon} />
          <ThemedText style={styles.fallbackText}>PDF preview is not available on this device.</ThemedText>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors[colorScheme].tint }]}
            onPress={openInSystemViewer}
          >
            <ThemedText style={styles.buttonText}>Open in PDF Viewer</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      );
    }
  }
}

const styles = StyleSheet.create({
  pdfContainer: {
    flex: 1,
    height: 500,
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
