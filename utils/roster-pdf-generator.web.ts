/**
 * Web-specific PDF generation for rosters using pdfmake
 */

import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { TDocumentDefinitions } from "pdfmake/interfaces";
import {
    PDFGenerationOptions,
    RosterDisplayField,
    RosterMember,
} from "@/types/rosters";

// Initialize pdfmake with fonts
pdfMake.vfs = (pdfFonts as any).default || pdfFonts;

/**
 * Format date string from YYYY-MM-DD to localized date
 */
function formatDate(dateStr?: string | null): string {
    if (!dateStr) return "";
    try {
        return new Date(dateStr).toLocaleDateString();
    } catch (error) {
        console.error("Error formatting date:", error);
        return dateStr;
    }
}

/**
 * Generate combined name from first and last name
 */
function formatName(member: RosterMember): string {
    const firstName = member.first_name || "";
    const lastName = member.last_name || "";
    return `${lastName}, ${firstName}`.trim();
}

/**
 * Generate PDF for a roster
 */
export async function generateRosterPdf({
    members,
    selectedFields,
    rosterType,
    title = "Seniority Roster",
}: PDFGenerationOptions): Promise<void> {
    // Ensure we're in a browser environment
    if (typeof window === "undefined") {
        throw new Error(
            "PDF generation is only available in browser environments",
        );
    }

    // Default fields if none provided
    const fields = selectedFields.length > 0
        ? selectedFields
        : ["rank", "name", "pin_number", "system_sen_type"];

    // Build table headers
    const headers = fields.map((field) => {
        switch (field) {
            case "rank":
                return "Rank";
            case "name":
                return "Name";
            case "pin_number":
                return "PIN";
            case "system_sen_type":
                return "Prior Rights";
            case "engineer_date":
                return "Engineer Date";
            case "date_of_birth":
                return "Date of Birth";
            case "zone_name":
                return "Zone";
            case "home_zone_name":
                return "Home Zone";
            case "division_name":
                return "Division";
            case "prior_vac_sys":
                return "Prior Rights Rank";
            default:
                return field.charAt(0).toUpperCase() +
                    field.slice(1).replace(/_/g, " ");
        }
    });

    // Build table rows
    const rows = members.map((member) => {
        return fields.map((field) => {
            switch (field) {
                case "rank":
                    return member.rank?.toString() || "";
                case "name":
                    return formatName(member);
                case "pin_number":
                    return member.pin_number?.toString() || "";
                case "engineer_date":
                    return formatDate(member.engineer_date);
                case "date_of_birth":
                    return formatDate(member.date_of_birth);
                case "zone_name":
                    return member.zone_name || "";
                case "home_zone_name":
                    return member.home_zone_name || "";
                case "division_name":
                    return member.division_name || "";
                case "system_sen_type":
                    return member.system_sen_type || "";
                case "prior_vac_sys":
                    return member.prior_vac_sys?.toString() || "";
                default:
                    // Handle any additional fields
                    return (member as any)[field]?.toString() || "";
            }
        });
    });

    // Get current date
    const currentDate = new Date().toLocaleDateString();

    // Determine column widths based on field types
    const columnWidths = fields.map((field) => {
        switch (field) {
            case "rank":
                return 30; // Narrow column for rank numbers
            case "name":
                return "*"; // Flexible width for names (often longer)
            case "pin_number":
                return 50; // Fixed width for PIN numbers
            case "system_sen_type":
                return 60; // Medium width for system type
            case "engineer_date":
            case "date_of_birth":
                return 90; // Medium width for dates
            case "prior_vac_sys":
                return 60; // Narrow column for ranks
            case "zone_name":
                return 50;
            case "home_zone_name":
            case "division_name":
                return "auto"; // Auto-sized based on content
            default:
                return "auto";
        }
    });

    // Determine orientation based on number of columns
    // Use landscape for more than 4 columns or if specific columns are selected
    const useLandscape = fields.length > 7 ||
        fields.includes("engineer_date") ||
        fields.includes("date_of_birth");

    // Define document structure
    const documentDefinition: TDocumentDefinitions = {
        pageSize: "A4",
        pageOrientation: useLandscape ? "landscape" : "portrait",
        pageMargins: [40, 60, 40, 60],
        header: {
            text: `${title}`,
            alignment: "center",
            margin: [0, 20, 0, 10],
            fontSize: 16,
            bold: true,
        },
        footer: function (currentPage, pageCount) {
            return {
                columns: [
                    {
                        text: `Generated: ${currentDate}`,
                        alignment: "left",
                        margin: [40, 10, 0, 0],
                    },
                    {
                        text: `Page ${currentPage}/${pageCount}`,
                        alignment: "right",
                        margin: [0, 10, 40, 0],
                    },
                ],
            };
        },
        content: [
            {
                table: {
                    headerRows: 1,
                    widths: columnWidths,
                    body: [headers, ...rows],
                },
                layout: {
                    fillColor: function (rowIndex: number) {
                        return rowIndex === 0 ? "#CCCCCC" : null;
                    },
                    hLineWidth: function (i: number, node: any) {
                        return i === 0 || i === node.table.body.length ? 2 : 1;
                    },
                    vLineWidth: function (i: number, node: any) {
                        return i === 0 || i === node.table.widths.length
                            ? 2
                            : 1;
                    },
                    paddingLeft: function (i) {
                        return 8;
                    },
                    paddingRight: function (i) {
                        return 8;
                    },
                    paddingTop: function (i) {
                        return 6;
                    },
                    paddingBottom: function (i) {
                        return 6;
                    },
                },
            },
        ],
        styles: {
            header: {
                fontSize: 18,
                bold: true,
                margin: [0, 0, 0, 10],
            },
            subheader: {
                fontSize: 16,
                bold: true,
                margin: [0, 10, 0, 5],
            },
        },
    };

    // Generate and download PDF
    const filename = `${rosterType.toLowerCase()}_roster_${
        new Date().toISOString().split("T")[0]
    }.pdf`;
    pdfMake.createPdf(documentDefinition).download(filename);
}
