import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import { format } from "date-fns";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { MeetingMinute } from "@/store/divisionMeetingStore";

// Define types for the structured content parts
interface Report {
    title: string;
    presenter: string;
    summary: string;
}

interface Motion {
    title: string;
    moved_by: string;
    seconded_by: string;
    description: string;
    vote_result: {
        in_favor: number;
        opposed: number;
        abstained: number;
    };
    passed: boolean;
}

interface AdditionalSection {
    title: string;
    content: string;
}

// Initialize pdfmake fonts
pdfMake.vfs = (pdfFonts as any).default || pdfFonts;

export async function generateMinutesPdf(
    minutes: MeetingMinute,
    divisionName: string,
): Promise<void> {
    const meetingDate = format(new Date(minutes.meeting_date), "MMMM d, yyyy");
    const pdfTitle = `Meeting Minutes - ${divisionName} - ${meetingDate}`;

    // Create the content sections
    const contentSections: Content[] = [];

    // Title
    contentSections.push(
        {
            text: pdfTitle,
            style: "header",
            alignment: "center",
            margin: [0, 0, 0, 20],
        },
    );

    // Call to Order
    const content = minutes.structured_content;
    contentSections.push(
        {
            text: "Call to Order",
            style: "sectionHeader",
            margin: [0, 10, 0, 5],
        },
        {
            text:
                `The meeting was called to order at ${content.call_to_order.time} by ${content.call_to_order.presiding_officer}.`,
            margin: [0, 0, 0, 10],
        },
    );

    // Roll Call
    contentSections.push(
        {
            text: "Roll Call",
            style: "sectionHeader",
            margin: [0, 10, 0, 5],
        },
        {
            text: `Present: ${content.roll_call.present.join(", ") || "None"}`,
            margin: [0, 0, 0, 5],
        },
        {
            text: `Absent: ${content.roll_call.absent.join(", ") || "None"}`,
            margin: [0, 0, 0, 5],
        },
        {
            text: `Excused: ${content.roll_call.excused.join(", ") || "None"}`,
            margin: [0, 0, 0, 10],
        },
    );

    // Approval of Previous Minutes
    contentSections.push(
        {
            text: "Approval of Previous Minutes",
            style: "sectionHeader",
            margin: [0, 10, 0, 5],
        },
        {
            text: `Previous minutes were ${
                content.approval_of_previous_minutes.approved
                    ? "approved"
                    : "not approved"
            }.`,
            margin: [0, 0, 0, 5],
        },
    );

    if (content.approval_of_previous_minutes.amendments) {
        contentSections.push(
            {
                text:
                    `Amendments: ${content.approval_of_previous_minutes.amendments}`,
                margin: [0, 0, 0, 10],
            },
        );
    } else {
        contentSections.push(
            {
                text: "No amendments were made.",
                margin: [0, 0, 0, 10],
            },
        );
    }

    // Reports
    if (content.reports && content.reports.length > 0) {
        contentSections.push(
            {
                text: "Reports",
                style: "sectionHeader",
                margin: [0, 10, 0, 5],
            },
        );

        content.reports.forEach((report: Report, index: number) => {
            contentSections.push(
                {
                    text: `${index + 1}. ${report.title}`,
                    style: "subheader",
                    margin: [0, 5, 0, 5],
                },
                {
                    text: `Presenter: ${report.presenter}`,
                    margin: [0, 0, 0, 5],
                },
                {
                    text: report.summary,
                    margin: [0, 0, 0, 10],
                },
            );
        });
    }

    // Motions
    if (content.motions && content.motions.length > 0) {
        contentSections.push(
            {
                text: "Motions",
                style: "sectionHeader",
                margin: [0, 10, 0, 5],
            },
        );

        content.motions.forEach((motion: Motion, index: number) => {
            contentSections.push(
                {
                    text: `${index + 1}. ${motion.title}`,
                    style: "subheader",
                    margin: [0, 5, 0, 5],
                },
                {
                    text:
                        `Moved by: ${motion.moved_by}, Seconded by: ${motion.seconded_by}`,
                    margin: [0, 0, 0, 5],
                },
                {
                    text: motion.description,
                    margin: [0, 0, 0, 5],
                },
                {
                    text:
                        `Vote Result: In Favor: ${motion.vote_result.in_favor}, Opposed: ${motion.vote_result.opposed}, Abstained: ${motion.vote_result.abstained}`,
                    margin: [0, 0, 0, 5],
                },
                {
                    text: `Motion ${motion.passed ? "PASSED" : "FAILED"}`,
                    style: motion.passed ? "passedMotion" : "failedMotion",
                    margin: [0, 0, 0, 10],
                },
            );
        });
    }

    // Additional Sections
    if (content.additional_sections && content.additional_sections.length > 0) {
        content.additional_sections.forEach((section: AdditionalSection) => {
            contentSections.push(
                {
                    text: section.title,
                    style: "sectionHeader",
                    margin: [0, 10, 0, 5],
                },
                {
                    text: section.content,
                    margin: [0, 0, 0, 10],
                },
            );
        });
    }

    // Adjournment
    contentSections.push(
        {
            text: "Adjournment",
            style: "sectionHeader",
            margin: [0, 10, 0, 5],
        },
        {
            text:
                `Motion to adjourn was made by ${content.adjournment.moved_by} and seconded by ${content.adjournment.seconded_by}.`,
            margin: [0, 0, 0, 5],
        },
        {
            text:
                `Vote Result: In Favor: ${content.adjournment.vote_result.in_favor}, Opposed: ${content.adjournment.vote_result.opposed}, Abstained: ${content.adjournment.vote_result.abstained}`,
            margin: [0, 0, 0, 5],
        },
        {
            text: `The meeting was adjourned at ${content.adjournment.time}.`,
            margin: [0, 0, 0, 10],
        },
    );

    // Attendance Summary
    contentSections.push(
        {
            text: "Attendance Summary",
            style: "sectionHeader",
            margin: [0, 10, 0, 5],
        },
        {
            text:
                `Present: ${content.attendance_summary.present_count}, Absent: ${content.attendance_summary.absent_count}, Excused: ${content.attendance_summary.excused_count}`,
            margin: [0, 0, 0, 5],
        },
    );

    if (content.attendance_summary.notes) {
        contentSections.push(
            {
                text: `Notes: ${content.attendance_summary.notes}`,
                margin: [0, 0, 0, 10],
            },
        );
    }

    // Add approval status footer
    contentSections.push(
        {
            text: minutes.is_approved ? "APPROVED" : "DRAFT - NOT APPROVED",
            style: minutes.is_approved ? "approvedStatus" : "draftStatus",
            alignment: "center",
            margin: [0, 20, 0, 0],
        },
    );

    // Create the PDF document definition
    const documentDefinition: TDocumentDefinitions = {
        pageSize: "A4",
        pageMargins: [40, 40, 40, 60],
        footer: function (currentPage, pageCount) {
            return {
                text: `Page ${currentPage} of ${pageCount}`,
                alignment: "center",
                margin: [0, 20, 0, 0],
            };
        },
        content: contentSections,
        styles: {
            header: {
                fontSize: 18,
                bold: true,
                margin: [0, 0, 0, 10],
            },
            sectionHeader: {
                fontSize: 14,
                bold: true,
                margin: [0, 10, 0, 5],
            },
            subheader: {
                fontSize: 12,
                bold: true,
                margin: [0, 5, 0, 5],
            },
            passedMotion: {
                fontSize: 12,
                bold: true,
                color: "green",
            },
            failedMotion: {
                fontSize: 12,
                bold: true,
                color: "red",
            },
            approvedStatus: {
                fontSize: 14,
                bold: true,
                color: "green",
            },
            draftStatus: {
                fontSize: 14,
                bold: true,
                color: "orange",
            },
        },
    };

    // Create the PDF and initiate download
    const filename = `${pdfTitle.replace(/[^a-z0-9_\- ]/gi, "_")}.pdf`;
    pdfMake.createPdf(documentDefinition).download(filename);
}
