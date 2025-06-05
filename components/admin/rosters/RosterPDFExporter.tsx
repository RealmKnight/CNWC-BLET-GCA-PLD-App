import React from "react";
import { Platform } from "react-native";
import { RosterMember, RosterDisplayField, PDFGenerationOptions } from "@/types/rosters";

// Import platform-specific implementations directly
import { generateRosterPdf as generateRosterPdfWeb } from "@/utils/roster-pdf-generator.web";
import { generateRosterPdf as generateRosterPdfNative } from "@/utils/roster-pdf-generator.native";

interface RosterPDFExporterProps {
  children: (handleExportPdf: HandleExportPdfFunction) => React.ReactNode;
}

// Define the function type for the export handler
type HandleExportPdfFunction = (
  members: RosterMember[],
  rosterType: string,
  selectedFields: RosterDisplayField[]
) => Promise<void>;

export function RosterPDFExporter({ children }: RosterPDFExporterProps) {
  const handleExportPdf: HandleExportPdfFunction = async (members, rosterType, selectedFields) => {
    try {
      // Use the appropriate implementation based on platform
      const generateRosterPdf = Platform.OS === "web" ? generateRosterPdfWeb : generateRosterPdfNative;

      // Generate PDF with the provided data
      await generateRosterPdf({
        members,
        selectedFields,
        rosterType,
        title: `${rosterType} Seniority Roster`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      // You could implement a toast or alert here
      if (Platform.OS === "web") {
        alert(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  // Render children with the export function
  return <>{children(handleExportPdf)}</>;
}

// This is a HOC that can be used to wrap components that need PDF export functionality
export function withPDFExport<P extends { onExportPdf: HandleExportPdfFunction }>(
  Component: React.ComponentType<P>
): React.FC<Omit<P, "onExportPdf">> {
  return (props: Omit<P, "onExportPdf">) => (
    <RosterPDFExporter>
      {(handleExportPdf) => <Component {...(props as P)} onExportPdf={handleExportPdf} />}
    </RosterPDFExporter>
  );
}
