/**
 * Platform-specific imports for PDF generation
 *
 * This barrel file dynamically imports the correct PDF generator for the current platform.
 * - Web: Uses pdfmake
 * - Native (iOS/Android): Uses expo-print and expo-sharing
 */
import { Platform } from "react-native";
import { PDFGenerationOptions } from "@/types/rosters";

// Re-export the PDFGenerationOptions type
export { PDFGenerationOptions } from "@/types/rosters";

// Export the PDF generation function from the appropriate platform file
// The actual implementation will be imported from the platform-specific file
export async function generateRosterPdf(
    options: PDFGenerationOptions,
): Promise<void> {
    if (Platform.OS === "web") {
        const { generateRosterPdf } = await import(
            "./roster-pdf-generator.web"
        );
        return generateRosterPdf(options);
    } else {
        const { generateRosterPdf } = await import(
            "./roster-pdf-generator.native"
        );
        return generateRosterPdf(options);
    }
}

// Usage example:
//
// import { generateRosterPdf } from "@/utils/roster-pdf-generator";
// await generateRosterPdf({
//   members: rosterMembers,
//   selectedFields: ["rank", "name", "pin_number", "system_sen_type"],
//   rosterType: "WC",
// });
//
// This allows for code splitting and prevents platform-specific imports
// from breaking on other platforms.
