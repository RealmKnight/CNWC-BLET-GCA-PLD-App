// This file serves as the main entry point that will automatically use
// either PdfViewer.web.tsx or PdfViewer.native.tsx based on platform

// Re-export the type definition
export interface PdfViewerProps {
  url: string;
  title?: string;
}

// The default export will be replaced with the platform-specific implementation at build time
export { default } from "./PdfViewer.web";
