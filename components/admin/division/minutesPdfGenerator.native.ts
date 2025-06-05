import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { format } from "date-fns";
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

export async function generateMinutesPdf(
    minutes: MeetingMinute,
    divisionName: string,
): Promise<void> {
    const meetingDate = format(new Date(minutes.meeting_date), "MMMM d, yyyy");
    const pdfTitle = `Meeting Minutes - ${divisionName} - ${meetingDate}`;
    const content = minutes.structured_content;

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
                margin: 40px;
                color: #333;
                line-height: 1.5;
            }
            h1 {
                font-size: 24px;
                text-align: center;
                margin-bottom: 20px;
            }
            h2 {
                font-size: 18px;
                margin-top: 20px;
                margin-bottom: 10px;
                border-bottom: 1px solid #ccc;
                padding-bottom: 5px;
            }
            h3 {
                font-size: 16px;
                margin-top: 15px;
                margin-bottom: 5px;
            }
            p {
                margin: 5px 0;
            }
            .passed {
                color: green;
                font-weight: bold;
            }
            .failed {
                color: red;
                font-weight: bold;
            }
            .approval-status {
                text-align: center;
                margin-top: 30px;
                font-weight: bold;
                font-size: 18px;
            }
            .approved {
                color: green;
            }
            .draft {
                color: orange;
            }
            .footer {
                text-align: center;
                margin-top: 40px;
                font-size: 12px;
                color: #666;
            }
        </style>
    </head>
    <body>
        <h1>${pdfTitle}</h1>
        
        <!-- Call to Order -->
        <h2>Call to Order</h2>
        <p>The meeting was called to order at ${content.call_to_order.time} by ${content.call_to_order.presiding_officer}.</p>
        
        <!-- Roll Call -->
        <h2>Roll Call</h2>
        <p><strong>Present:</strong> ${
        content.roll_call.present.join(", ") || "None"
    }</p>
        <p><strong>Absent:</strong> ${
        content.roll_call.absent.join(", ") || "None"
    }</p>
        <p><strong>Excused:</strong> ${
        content.roll_call.excused.join(", ") || "None"
    }</p>
        
        <!-- Approval of Previous Minutes -->
        <h2>Approval of Previous Minutes</h2>
        <p>Previous minutes were ${
        content.approval_of_previous_minutes.approved
            ? "approved"
            : "not approved"
    }.</p>
        ${
        content.approval_of_previous_minutes.amendments
            ? `<p><strong>Amendments:</strong> ${content.approval_of_previous_minutes.amendments}</p>`
            : `<p>No amendments were made.</p>`
    }
        
        <!-- Reports -->
        ${
        content.reports && content.reports.length > 0
            ? `
        <h2>Reports</h2>
        ${
                content.reports.map((report: Report, index: number) => `
        <h3>${index + 1}. ${report.title}</h3>
        <p><strong>Presenter:</strong> ${report.presenter}</p>
        <p>${report.summary}</p>
        `).join("")
            }
        `
            : ""
    }
        
        <!-- Motions -->
        ${
        content.motions && content.motions.length > 0
            ? `
        <h2>Motions</h2>
        ${
                content.motions.map((motion: Motion, index: number) => `
        <h3>${index + 1}. ${motion.title}</h3>
        <p><strong>Moved by:</strong> ${motion.moved_by}, <strong>Seconded by:</strong> ${motion.seconded_by}</p>
        <p>${motion.description}</p>
        <p><strong>Vote Result:</strong> In Favor: ${motion.vote_result.in_favor}, Opposed: ${motion.vote_result.opposed}, Abstained: ${motion.vote_result.abstained}</p>
        <p>Motion <span class="${motion.passed ? "passed" : "failed"}">${
                    motion.passed ? "PASSED" : "FAILED"
                }</span></p>
        `).join("")
            }
        `
            : ""
    }
        
        <!-- Additional Sections -->
        ${
        content.additional_sections && content.additional_sections.length > 0
            ? content.additional_sections.map((section: AdditionalSection) => `
            <h2>${section.title}</h2>
            <p>${section.content}</p>
            `).join("")
            : ""
    }
        
        <!-- Adjournment -->
        <h2>Adjournment</h2>
        <p>Motion to adjourn was made by ${content.adjournment.moved_by} and seconded by ${content.adjournment.seconded_by}.</p>
        <p><strong>Vote Result:</strong> In Favor: ${content.adjournment.vote_result.in_favor}, Opposed: ${content.adjournment.vote_result.opposed}, Abstained: ${content.adjournment.vote_result.abstained}</p>
        <p>The meeting was adjourned at ${content.adjournment.time}.</p>
        
        <!-- Attendance Summary -->
        <h2>Attendance Summary</h2>
        <p>Present: ${content.attendance_summary.present_count}, Absent: ${content.attendance_summary.absent_count}, Excused: ${content.attendance_summary.excused_count}</p>
        ${
        content.attendance_summary.notes
            ? `<p><strong>Notes:</strong> ${content.attendance_summary.notes}</p>`
            : ""
    }
        
        <!-- Approval Status -->
        <div class="approval-status ${
        minutes.is_approved ? "approved" : "draft"
    }">
            ${minutes.is_approved ? "APPROVED" : "DRAFT - NOT APPROVED"}
        </div>
        
        <div class="footer">
            Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}
        </div>
    </body>
    </html>
    `;

    try {
        // Generate the PDF file
        const { uri } = await Print.printToFileAsync({
            html: htmlContent,
            base64: false,
        });

        // Check if sharing is available
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            // Share the PDF file
            await Sharing.shareAsync(uri, {
                mimeType: "application/pdf",
                dialogTitle: pdfTitle,
                UTI: "com.adobe.pdf", // for iOS
            });
        } else {
            console.error("Sharing is not available on this platform");
            throw new Error("Sharing is not available on this platform");
        }
    } catch (error) {
        console.error("Error generating or sharing PDF:", error);
        throw error;
    }
}
