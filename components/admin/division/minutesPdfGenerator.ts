import { Platform } from "react-native";
import type { MeetingMinute } from "@/store/divisionMeetingStore";

/**
 * Generate a PDF of meeting minutes
 *
 * This function detects the platform and uses the appropriate implementation:
 * - On web: Uses pdfMake to generate and download the PDF
 * - On native: Uses expo-print and expo-sharing to generate and share the PDF
 *
 * @param minutes - The meeting minutes to generate a PDF for
 * @param divisionName - The name of the division
 */
export async function generateMinutesPdf(
    minutes: MeetingMinute,
    divisionName: string,
): Promise<void> {
    if (Platform.OS === "web") {
        // Use web implementation
        const { generateMinutesPdf: generateWebPdf } = await import(
            "./minutesPdfGenerator.web"
        );
        return generateWebPdf(minutes, divisionName);
    } else {
        // Use native implementation
        const { generateMinutesPdf: generateNativePdf } = await import(
            "./minutesPdfGenerator.native"
        );
        return generateNativePdf(minutes, divisionName);
    }
}
