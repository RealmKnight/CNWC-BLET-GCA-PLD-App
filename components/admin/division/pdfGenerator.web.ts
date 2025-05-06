import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Member } from "@/store/adminCalendarManagementStore";
import type { YearType } from "./TimeOffManager";
import { isValid, parseISO } from "date-fns";
import type {
    Content,
    TableCell,
    TDocumentDefinitions,
} from "pdfmake/interfaces";

// Initialize pdfmake fonts
// The runtime error "_vfs_fonts.default.pdfMake is undefined" suggests that
// (pdfFonts as any).default is the most likely candidate for the actual VFS data.
// We cast to `any` to bypass type mismatches if the imported structure differs from
// what @types/pdfmake expects due to bundler behavior.
pdfMake.vfs = (pdfFonts as any).default || pdfFonts;
// This tries pdfFonts.default first. If it's falsy, it falls back to pdfFonts itself.
// One of these should be the VFS object { "Roboto-Regular.ttf": "...base64data...", ... }

// It's good practice to set default fonts if you don't want to specify them everywhere.
// pdfMake.fonts = {
//   Roboto: {
//     normal: 'Roboto-Regular.ttf',
//     bold: 'Roboto-Medium.ttf',
//     italics: 'Roboto-Italic.ttf',
//     bolditalics: 'Roboto-MediumItalic.ttf'
//   }
// };

// Define a type for the totals, similar to what was in TimeOffManager
interface PdfTotals {
    rawWeeksToBid: number;
    ratioWeeksToBid: number;
    rawSingleDays: number;
    ratioSingleDays: number;
}

// --- Helper Functions (copied from previous version) ---
function calculateVacationWeeks(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) return 0;
    const hireDate = parseISO(companyHireDate);
    if (!isValid(hireDate)) return 0;
    const refDate = referenceDate;
    let yearsOfService = refDate.getFullYear() - hireDate.getFullYear();
    const hireMonth = hireDate.getMonth();
    const refMonth = refDate.getMonth();
    const hireDay = hireDate.getDate();
    const refDay = refDate.getDate();
    if (refMonth < hireMonth || (refMonth === hireMonth && refDay < hireDay)) {
        yearsOfService--;
    }
    if (yearsOfService < 1) return 0;
    if (yearsOfService >= 1 && yearsOfService <= 5) return 2;
    if (yearsOfService >= 6 && yearsOfService <= 10) return 3;
    if (yearsOfService >= 11 && yearsOfService <= 15) return 4;
    if (yearsOfService >= 16 && yearsOfService <= 20) return 5;
    if (yearsOfService >= 21) return 6;
    return 0;
}

function calculatePLDs(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) return 0;
    const hireDate = parseISO(companyHireDate);
    if (!isValid(hireDate)) return 0;
    const refDate = referenceDate;
    let yearsOfService = refDate.getFullYear() - hireDate.getFullYear();
    const hireMonth = hireDate.getMonth();
    const refMonth = refDate.getMonth();
    const hireDay = hireDate.getDate();
    const refDay = refDate.getDate();
    if (refMonth < hireMonth || (refMonth === hireMonth && refDay < hireDay)) {
        yearsOfService--;
    }
    if (yearsOfService >= 1 && yearsOfService <= 5) return 2;
    if (yearsOfService >= 6 && yearsOfService <= 10) return 3;
    if (yearsOfService >= 11) return 4;
    return 0;
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
    const headerRow: TableCell[] = [
        { text: "Name", style: "tableHeader" },
        { text: "PIN", style: "tableHeader", alignment: "center" },
        { text: "Hire Date", style: "tableHeader", alignment: "center" },
        { text: "Vac Wks", style: "tableHeader", alignment: "center" },
        { text: "Vac Splt", style: "tableHeader", alignment: "center" },
        { text: "Wks to Bid", style: "tableHeader", alignment: "center" },
        { text: "PLDs", style: "tableHeader", alignment: "center" },
        { text: "SDVs", style: "tableHeader", alignment: "center" },
    ];

    const bodyRows = membersToPrint.map((member: Member) => {
        const isCurrent = selectedTimeOffYear === "current";
        const pinChanges = timeOffChanges[member.pin_number] || {};
        const currentReferenceDate = new Date();
        const nextReferenceDate = new Date();
        nextReferenceDate.setFullYear(currentReferenceDate.getFullYear() + 1);
        const referenceDate = isCurrent
            ? currentReferenceDate
            : nextReferenceDate;

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

        return [
            {
                text: `${member.first_name} ${member.last_name}`,
                style: "tableCell",
            },
            {
                text: member.pin_number.toString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: new Date(member.company_hire_date).toLocaleDateString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: vacationWeeksVal.toString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: vacationSplitVal.toString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: weeksToBidVal.toString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: displayPldsVal.toString(),
                style: "tableCell",
                alignment: "center",
            },
            {
                text: sdvsVal.toString(),
                style: "tableCell",
                alignment: "center",
            },
        ];
    });

    const footerRow: TableCell[] = [
        {
            text: "TOTALS:",
            colSpan: 5,
            style: "tableFooter",
            alignment: "right",
        },
        {},
        {},
        {},
        {},
        {
            text:
                `${finalTotalsForPdf.rawWeeksToBid} (${finalTotalsForPdf.ratioWeeksToBid})`,
            style: "tableFooter",
            alignment: "center",
        },
        { text: " ", style: "tableFooter" }, // Placeholder for PLDs column if individual total was needed
        {
            text:
                `${finalTotalsForPdf.rawSingleDays} (${finalTotalsForPdf.ratioSingleDays}) (Total Single Days)`,
            style: "tableFooter",
            alignment: "center",
        },
    ];

    const documentDefinition: TDocumentDefinitions = {
        pageOrientation: "landscape",
        pageSize: "A4",
        content: [
            {
                text: pdfTitle,
                style: "header",
                alignment: "center",
                margin: [0, 0, 0, 20],
            },
            {
                table: {
                    headerRows: 1,
                    widths: [
                        "*",
                        "auto",
                        "auto",
                        "auto",
                        "auto",
                        "auto",
                        "auto",
                        "auto",
                    ],
                    body: [headerRow, ...bodyRows, footerRow],
                },
                layout: {
                    fillColor: function (
                        rowIndex: number,
                        node: any,
                        columnIndex: number,
                    ) {
                        if (rowIndex === 0) return "#D3D3D3"; // Header row color
                        if (rowIndex === bodyRows.length + 1) return "#F0F0F0"; // Footer row color
                        return (rowIndex % 2 === 0) ? "#F9F9F9" : null; // Alternating row color for body
                    },
                    hLineWidth: function (i: number, node: any) {
                        return (i === 0 || i === node.table.body.length)
                            ? 1
                            : 1;
                    },
                    vLineWidth: function (i: number, node: any) {
                        return 1;
                    },
                    hLineColor: function (i: number, node: any) {
                        return "#AAAAAA";
                    },
                    vLineColor: function (i: number, node: any) {
                        return "#AAAAAA";
                    },
                },
            },
        ],
        styles: {
            header: {
                fontSize: 16,
                bold: true,
            },
            tableHeader: {
                bold: true,
                fontSize: 10,
                color: "black",
            },
            tableCell: {
                fontSize: 9,
            },
            tableFooter: {
                bold: true,
                fontSize: 10,
                color: "black",
            },
        },
        defaultStyle: {
            // font: 'Roboto' // If you have custom fonts configured
        },
    };

    pdfMake.createPdf(documentDefinition).download(
        `${pdfTitle.replace(/[^a-z0-9_\- ]/gi, "_")}.pdf`,
    );
}
