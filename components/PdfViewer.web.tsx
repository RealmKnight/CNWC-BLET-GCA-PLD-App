import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { PdfViewerProps } from "./PdfViewer";

// Web-specific implementation using iframe
export default function PdfViewer({ url, title }: PdfViewerProps) {
  if (!url) {
    return (
      <ThemedView style={styles.fallbackContainer}>
        <ThemedText style={styles.fallbackText}>No PDF URL provided.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <iframe
      src={`${url}#toolbar=0&navpanes=0`}
      style={{
        width: "100%",
        height: 500,
        border: "none",
      }}
      title={title || "PDF Document"}
    />
  );
}

const styles = StyleSheet.create({
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
