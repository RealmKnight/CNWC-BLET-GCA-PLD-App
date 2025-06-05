import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { Member } from "@/store/adminCalendarManagementStore";
import type { YearType } from "./TimeOffManager";

// Define a type for the totals, similar to what was in TimeOffManager
interface PdfTotals {
    rawWeeksToBid: number;
    ratioWeeksToBid: number;
    rawSingleDays: number;
    ratioSingleDays: number;
}

// --- Helper Functions (copied from web version) ---
function calculateVacationWeeks(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) {
        return 0; // Default value if no hire date is provided
    }

    const hireDate = new Date(companyHireDate);
    const referenceYear = referenceDate.getFullYear();

    // Calculate years of service completed *at the end* of the reference year.
    // If the anniversary falls within the reference year, this grants the higher entitlement for the whole year.
    const yearsOfService = referenceYear - hireDate.getFullYear();

    // Apply vacation week rules
    if (yearsOfService < 2) return 1;
    if (yearsOfService < 5) return 2;
    if (yearsOfService < 14) return 3;
    if (yearsOfService < 23) return 4;
    return 5;
}

function calculatePLDs(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) {
        return 0; // Default value if no hire date is provided
    }

    const hireDate = new Date(companyHireDate);

    // Calculate base years of service
    let yearsOfService = referenceDate.getFullYear() - hireDate.getFullYear();

    // Adjust if the anniversary in the reference year hasn't occurred yet
    // compared to the reference date.
    if (
        referenceDate.getMonth() < hireDate.getMonth() ||
        (referenceDate.getMonth() === hireDate.getMonth() &&
            referenceDate.getDate() < hireDate.getDate())
    ) {
        yearsOfService--; // Decrement if anniversary is later in the year than referenceDate
    }

    // Ensure yearsOfService is not negative if hire date is in the future relative to referenceDate (edge case)
    yearsOfService = Math.max(0, yearsOfService);

    // Apply PLD rules based on completed years of service as of the reference date
    if (yearsOfService < 3) return 5;
    if (yearsOfService < 6) return 8;
    if (yearsOfService < 10) return 11;
    return 13;
}

function calculateWeeksToBid(
    vacationWeeks: number,
    vacationSplit: number,
): number {
    return Math.max(0, vacationWeeks - vacationSplit);
}
// --- End Helper Functions ---

export async function generateWebPdf(
    pdfTitle: string,
    membersToPrint: Member[],
    selectedTimeOffYear: YearType,
    timeOffChanges: Record<number, any>,
    finalTotalsForPdf: PdfTotals,
): Promise<void> {
    const isCurrent = selectedTimeOffYear === "current";
    const currentReferenceDate = new Date();
    const nextReferenceDate = new Date();
    nextReferenceDate.setFullYear(currentReferenceDate.getFullYear() + 1);
    const referenceDate = isCurrent ? currentReferenceDate : nextReferenceDate;

    // Generate table rows
    const tableRows = membersToPrint.map((member: Member) => {
        const pinChanges = timeOffChanges[member.pin_number] || {};

        const calculatedVacationWeeksVal = calculateVacationWeeks(
            member.company_hire_date,
            referenceDate,
        );
        const calculatedPldsVal = calculatePLDs(
            member.company_hire_date,
            referenceDate,
        );

        const vacationWeeksVal = isCurrent
            ? pinChanges.curr_vacation_weeks !== undefined
                ? pinChanges.curr_vacation_weeks
                : calculatedVacationWeeksVal
            : pinChanges.next_vacation_weeks !== undefined
            ? pinChanges.next_vacation_weeks
            : calculatedVacationWeeksVal;

        const originalVacationSplitVal = isCurrent
            ? member.curr_vacation_split
            : member.next_vacation_split;

        const vacationSplitVal = isCurrent
            ? pinChanges.curr_vacation_split !== undefined
                ? pinChanges.curr_vacation_split
                : originalVacationSplitVal
            : pinChanges.next_vacation_split !== undefined
            ? pinChanges.next_vacation_split
            : originalVacationSplitVal;

        let sdvsVal: number;
        if (isCurrent) {
            sdvsVal = pinChanges.sdv_entitlement !== undefined
                ? pinChanges.sdv_entitlement
                : member.sdv_entitlement;
        } else {
            sdvsVal = pinChanges.sdv_election !== undefined
                ? pinChanges.sdv_election
                : member.sdv_election;
        }

        const weeksToBidVal = calculateWeeksToBid(
            vacationWeeksVal,
            vacationSplitVal,
        );
        const displayPldsVal = calculatedPldsVal;

        return `
            <tr style="background-color: ${
            membersToPrint.indexOf(member) % 2 === 0 ? "#F9F9F9" : "white"
        };">
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px;">${member.first_name} ${member.last_name}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${member.pin_number}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${
            new Date(member.company_hire_date).toLocaleDateString()
        }</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${vacationWeeksVal}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${vacationSplitVal}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${weeksToBidVal}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${displayPldsVal}</td>
                <td style="padding: 8px; border: 1px solid #AAAAAA; font-size: 9px; text-align: center;">${sdvsVal}</td>
            </tr>
        `;
    }).join("");

    // Generate HTML content
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>${pdfTitle}</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
                color: #333;
                line-height: 1.4;
            }
            h1 {
                font-size: 16px;
                text-align: center;
                margin-bottom: 20px;
                font-weight: bold;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 10px;
            }
            th {
                background-color: #D3D3D3;
                padding: 8px;
                border: 1px solid #AAAAAA;
                font-size: 10px;
                font-weight: bold;
                text-align: center;
            }
            .footer-row {
                background-color: #F0F0F0;
                font-weight: bold;
                font-size: 10px;
            }
            .footer-row td {
                padding: 8px;
                border: 1px solid #AAAAAA;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <h1>${pdfTitle}</h1>
        
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>PIN</th>
                    <th>Hire Date</th>
                    <th>Vac Wks</th>
                    <th>Vac Splt</th>
                    <th>Wks to Bid</th>
                    <th>PLDs</th>
                    <th>SDVs</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
                <tr class="footer-row">
                    <td>TOTALS</td>
                    <td>(Allocations)</td>
                    <td></td>
                    <td>Total</td>
                    <td>Weeks to Bid</td>
                    <td>${finalTotalsForPdf.rawWeeksToBid} (${finalTotalsForPdf.ratioWeeksToBid})</td>
                    <td>Total<br>Single Days</td>
                    <td>${finalTotalsForPdf.rawSingleDays} (${finalTotalsForPdf.ratioSingleDays})</td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>
    `;

    try {
        // Generate PDF using expo-print
        const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false,
        });

        // Share the PDF
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
                mimeType: "application/pdf",
                dialogTitle: pdfTitle,
                UTI: "com.adobe.pdf",
            });
        } else {
            console.log("Sharing is not available on this platform");
        }
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw error;
    }
}
