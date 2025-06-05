/**
 * Native-specific PDF generation for rosters using expo-print and expo-sharing
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
    PDFGenerationOptions,
    RosterDisplayField,
    RosterMember,
} from "@/types/rosters";

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
    // Default fields if none provided
    const fields = selectedFields.length > 0
        ? selectedFields
        : ["rank", "name", "pin_number", "system_sen_type"];

    // Get field headers
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

    // Build table rows HTML
    const tableRows = members.map((member) => {
        const cells = fields.map((field) => {
            let cellValue = "";

            switch (field) {
                case "rank":
                    cellValue = member.rank?.toString() || "";
                    break;
                case "name":
                    cellValue = formatName(member);
                    break;
                case "pin_number":
                    cellValue = member.pin_number?.toString() || "";
                    break;
                case "engineer_date":
                    cellValue = formatDate(member.engineer_date);
                    break;
                case "date_of_birth":
                    cellValue = formatDate(member.date_of_birth);
                    break;
                case "zone_name":
                    cellValue = member.zone_name || "";
                    break;
                case "home_zone_name":
                    cellValue = member.home_zone_name || "";
                    break;
                case "division_name":
                    cellValue = member.division_name || "";
                    break;
                case "system_sen_type":
                    cellValue = member.system_sen_type || "";
                    break;
                case "prior_vac_sys":
                    cellValue = member.prior_vac_sys?.toString() || "";
                    break;
                default:
                    // Handle any additional fields
                    cellValue = (member as any)[field]?.toString() || "";
            }

            return `<td>${cellValue}</td>`;
        }).join("");

        return `<tr>${cells}</tr>`;
    }).join("");

    // Get current date
    const currentDate = new Date().toLocaleDateString();

    // Create HTML content for the PDF
    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            margin: 0;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            background-color: #f0f0f0;
            padding: 8px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #ddd;
          }
          td {
            padding: 8px;
            border: 1px solid #ddd;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
          }
          @media print {
            .page-break {
              page-break-after: always;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${rosterType} ${title}</h1>
        </div>
        
        <table>
          <thead>
            <tr>
              ${headers.map((header) => `<th>${header}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        
        <div class="footer">
          <div>Generated: ${currentDate}</div>
        </div>
      </body>
    </html>
  `;

    try {
        // Generate PDF using expo-print
        const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false,
        });

        // Check if sharing is available
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            // Prepare filename for sharing
            const filename = `${rosterType.toLowerCase()}_roster_${
                new Date().toISOString().split("T")[0]
            }.pdf`;

            // Share the PDF
            await Sharing.shareAsync(uri, {
                mimeType: "application/pdf",
                dialogTitle: `${rosterType} Roster PDF`,
                UTI: "com.adobe.pdf", // For iOS
            });
        } else {
            console.log("Sharing is not available on this device");
            // Could display a message to the user here
        }
    } catch (error) {
        console.error("Error generating or sharing PDF:", error);
        throw error;
    }
}
