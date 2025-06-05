// This file serves as the main entry point that will automatically use
// either PdfViewer.web.tsx or PdfViewer.native.tsx based on platform
import React, { FC } from "react";
import { Platform } from "react-native";

// Define the props interface for our PDF viewer
export interface PdfViewerProps {
  url: string;
  title?: string;
}

// Import the appropriate platform-specific implementation
let PdfViewerComponent: FC<PdfViewerProps>;

// Use Platform.select to choose the correct implementation
if (Platform.OS === "web") {
  PdfViewerComponent = require("./PdfViewer.web").default;
} else {
  PdfViewerComponent = require("./PdfViewer.native").default;
}

// Export a component that renders the platform-specific implementation
const PdfViewer: FC<PdfViewerProps> = (props) => {
  return <PdfViewerComponent {...props} />;
};

export default PdfViewer;
