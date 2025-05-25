// This file serves as the base export for platform-specific PDF generation
// Metro bundler will automatically resolve to the appropriate platform file:
// - pdfGenerator.web.ts for web builds
// - pdfGenerator.native.ts for React Native builds

export { generateWebPdf } from "./pdfGenerator.native";
