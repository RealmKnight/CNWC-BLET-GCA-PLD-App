import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { PdfViewerProps } from "./PdfViewer";
import Pdf from "react-native-pdf";

// Native-specific implementation using react-native-pdf
export default function PdfViewer({ url, title }: PdfViewerProps) {
  if (!url) {
    return (
      <ThemedView style={styles.fallbackContainer}>
        <ThemedText style={styles.fallbackText}>No PDF URL provided.</ThemedText>
      </ThemedView>
    );
  }

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
          }}
        />
      </View>
    );
  } catch (e) {
    console.error("Failed to load PDF component", e);
    return (
      <ThemedView style={styles.fallbackContainer}>
        <ThemedText style={styles.fallbackText}>
          PDF preview is not available on this platform. Please download the document to view it.
        </ThemedText>
      </ThemedView>
    );
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
  },
});
