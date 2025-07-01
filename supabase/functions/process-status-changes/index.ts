// Supabase Edge Function for sending notification emails when status changes
// supabase/functions/process-status-changes/index.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// This function would be scheduled to run every few minutes
serve(async (req: Request) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get unprocessed status changes
    const { data: queueItems, error: queueError } = await supabase
      .from("status_change_queue")
      .select("id, request_id, old_status, new_status")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(10); // Process in small batches

    if (queueError) {
      throw new Error(`Failed to get queue items: ${queueError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: "No items to process" }));
    }

    // Check Mailgun environment variables
    const mailgunSendingKey = Deno.env.get("MAILGUN_SENDING_KEY");
    const mailgunDomainRaw = Deno.env.get("MAILGUN_DOMAIN");

    if (!mailgunSendingKey || !mailgunDomainRaw) {
      throw new Error("Missing Mailgun configuration");
    }

    const mailgunDomain = String(mailgunDomainRaw);

    let processedCount = 0;
    let errorCount = 0;

    // Process each item
    for (const item of queueItems) {
      try {
        // Get request details with explicit joins to handle member relationship properly
        const { data: requestData, error: requestError } = await supabase
          .rpc("get_request_with_member_email", {
            request_id: item.request_id,
          });

        if (requestError) {
          throw new Error(
            `Failed to get request details: ${requestError.message}`,
          );
        }

        if (!requestData || requestData.length === 0) {
          throw new Error(`No member found for request ${item.request_id}`);
        }

        const request = requestData[0];
        const memberName = `${request.first_name} ${request.last_name}`;
        const memberEmail = request.email;
        const divisionId = request.division_id;

        // Get division email settings
        const { data: divisionEmailSettings } = await supabase
          .from("division_email_settings")
          .select("primary_email, additional_emails, enabled")
          .eq("division_id", divisionId)
          .eq("enabled", true)
          .single();

        // Get division admin emails as fallback
        console.log(
          `About to call get_division_admin_emails with divisionId: ${divisionId} (type: ${typeof divisionId})`,
        );
        const { data: divisionAdminEmails } = await supabase
          .rpc("get_division_admin_emails", { division_id_param: divisionId });

        console.log(
          `Processing request ${item.request_id} for member ${memberName} in division ${divisionId}`,
        );
        console.log(`Division email settings:`, divisionEmailSettings);
        console.log(`Division admin emails:`, divisionAdminEmails);

        // Send notification emails based on status change
        await sendStatusChangeEmails(
          mailgunSendingKey,
          mailgunDomain,
          supabase,
          item.new_status,
          request,
          memberName,
          memberEmail,
          divisionEmailSettings,
          divisionAdminEmails || [],
        );

        // NOTE: In-app message creation is now handled immediately by the database trigger
        // when the status changes, so users get instant in-app notifications

        // Mark as processed
        await supabase.from("status_change_queue")
          .update({ processed: true })
          .eq("id", item.id);

        processedCount++;
      } catch (processError) {
        console.error(`Error processing queue item ${item.id}:`, processError);
        errorCount++;

        const errorMessage = processError instanceof Error
          ? processError.message
          : "Unknown error occurred";

        // Record email tracking failure
        await supabase
          .from("email_tracking")
          .insert({
            request_id: item.request_id,
            email_type: "notification",
            recipient: "system",
            subject: `Status Change Notification Error`,
            message_id: `error-${Date.now()}-${item.id}`,
            status: "failed",
            error_message: errorMessage,
            retry_count: 0,
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message:
        `Processed ${processedCount} status change notifications, ${errorCount} errors`,
      processed: processedCount,
      errors: errorCount,
    }));
  } catch (error) {
    console.error("Error in process-status-changes:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Status change processing failed";

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
});

// Helper function to send status change emails with HTML templates
async function sendStatusChangeEmails(
  mailgunSendingKey: string,
  mailgunDomain: string,
  supabase: any,
  status: string,
  request: any,
  memberName: string,
  memberEmail: string,
  divisionEmailSettings: any,
  divisionAdmins: any[],
) {
  // Fix variable naming - use request_date and leave_type
  const formattedDate = new Date(request.request_date).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
  const leaveType = request.leave_type.charAt(0).toUpperCase() +
    request.leave_type.slice(1);

  // Determine email recipients for division notifications
  let divisionEmails: string[] = [];

  if (divisionEmailSettings && divisionEmailSettings.enabled) {
    if (divisionEmailSettings.primary_email) {
      divisionEmails.push(divisionEmailSettings.primary_email);
    }
    if (
      divisionEmailSettings.additional_emails &&
      divisionEmailSettings.additional_emails.length > 0
    ) {
      divisionEmails = [
        ...divisionEmails,
        ...divisionEmailSettings.additional_emails,
      ];
    }

    // FIXED: Remove requesting member's email from division emails to prevent duplicates
    divisionEmails = divisionEmails.filter((email) => email !== memberEmail);
    console.log(
      `Filtered out requesting member email from division settings to prevent duplicates`,
    );
  }

  // Fallback to division admin emails if no division emails configured
  if (divisionEmails.length === 0 && divisionAdmins) {
    divisionEmails = divisionAdmins
      .filter((admin) => admin.email)
      .filter((admin) => admin.email !== memberEmail)
      .map((admin) => admin.email);
  }

  console.log(`Final division emails for notifications:`, divisionEmails);
  console.log(`Member email:`, memberEmail);
  console.log(
    `Excluded member email from division admin list to prevent duplicates`,
  );

  // Configure email content based on status
  let userSubject: string = "";
  let userHtml: string = "";
  let userText: string = "";
  let adminSubject: string = "";
  let adminHtml: string = "";
  let adminText: string = "";

  const baseUserStyle = `
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
    .content { padding: 20px; border: 1px solid #ddd; }
    .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #2c5aa0; }
    .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
  `;

  const baseAdminStyle = `
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #636e72; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
    .content { padding: 20px; border: 1px solid #ddd; }
    .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #636e72; }
    .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
  `;

  switch (status) {
    case "approved":
      userSubject = `${leaveType} Request Approved - ${formattedDate}`;
      userHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseUserStyle} .status { background-color: #00b894; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Request</h1></div>
          <div class="status">REQUEST APPROVED</div>
          <div class="content">
            <h2>Good news, ${memberName}!</h2>
            <p>Your time off request has been <strong>APPROVED</strong>.</p>
            <div class="details">
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
            <p>If you need to cancel this request, you can do so through the app.</p>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      userText =
        `Dear ${memberName},\n\nYour time off request for ${formattedDate} (${leaveType}) has been APPROVED.\n\nIf you need to cancel this request, you can do so through the app.\n\nRequest ID: ${request.id}`;

      adminSubject =
        `${leaveType} Request Approved - ${memberName} - ${formattedDate}`;
      adminHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseAdminStyle} .status { background-color: #00b894; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Notification</h1></div>
          <div class="status">REQUEST APPROVED</div>
          <div class="content">
            <h2>Status Update</h2>
            <p>A time off request has been approved.</p>
            <div class="details">
              <p><strong>Employee:</strong> ${memberName}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      adminText =
        `A time off request for ${memberName} on ${formattedDate} (${leaveType}) has been APPROVED.\n\nRequest ID: ${request.id}`;
      break;

    case "denied":
      userSubject = `${leaveType} Request Denied - ${formattedDate}`;
      userHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseUserStyle} .status { background-color: #d63031; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Request</h1></div>
          <div class="status">REQUEST DENIED</div>
          <div class="content">
            <h2>Request Update</h2>
            <p>Unfortunately, your time off request has been <strong>DENIED</strong>.</p>
            <div class="details">
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Reason:</strong> ${
        request.denial_comment || "No reason specified"
      }</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
            <p>You may contact your division administrator for more information.</p>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      userText =
        `Dear ${memberName},\n\nUnfortunately, your time off request for ${formattedDate} (${leaveType}) has been DENIED.\nReason: ${
          request.denial_comment || "No reason specified"
        }\n\nYou may contact your division administrator for more information.\n\nRequest ID: ${request.id}`;

      adminSubject =
        `${leaveType} Request Denied - ${memberName} - ${formattedDate}`;
      adminHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseAdminStyle} .status { background-color: #d63031; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Notification</h1></div>
          <div class="status">REQUEST DENIED</div>
          <div class="content">
            <h2>Status Update</h2>
            <p>A time off request has been denied.</p>
            <div class="details">
              <p><strong>Employee:</strong> ${memberName}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Reason:</strong> ${
        request.denial_comment || "No reason specified"
      }</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      adminText =
        `A time off request for ${memberName} on ${formattedDate} (${leaveType}) has been DENIED.\nReason: ${
          request.denial_comment || "No reason specified"
        }\n\nRequest ID: ${request.id}`;
      break;

    case "cancelled":
      userSubject =
        `${leaveType} Request Cancellation Confirmed - ${formattedDate}`;
      userHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseUserStyle} .status { background-color: #fdcb6e; color: #2d3436; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Request</h1></div>
          <div class="status">CANCELLATION CONFIRMED</div>
          <div class="content">
            <h2>Cancellation Confirmed</h2>
            <p>Your cancellation request has been <strong>CONFIRMED</strong>.</p>
            <div class="details">
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      userText =
        `Dear ${memberName},\n\nYour cancellation request for ${formattedDate} (${leaveType}) has been CONFIRMED.\n\nRequest ID: ${request.id}`;

      adminSubject =
        `${leaveType} Request Cancelled - ${memberName} - ${formattedDate}`;
      adminHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${baseAdminStyle} .status { background-color: #fdcb6e; color: #2d3436; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }</style></head>
        <body>
          <div class="header"><h1>WC GCA BLET PLD Notification</h1></div>
          <div class="status">REQUEST CANCELLED</div>
          <div class="content">
            <h2>Status Update</h2>
            <p>A time off request has been cancelled.</p>
            <div class="details">
              <p><strong>Employee:</strong> ${memberName}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Type:</strong> ${leaveType}</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>
          </div>
          <div class="footer">
            <p>WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      adminText =
        `A time off request for ${memberName} on ${formattedDate} (${leaveType}) has been CANCELLED.\n\nRequest ID: ${request.id}`;
      break;

    case "pending": {
      // Handle waitlist→pending transitions by sending the standard request email
      console.log(`Processing pending status change for request ${request.id}`);

      try {
        // 🔄 NEW: delegate email generation to the dedicated edge function
        await supabase.functions.invoke("send-request-email", {
          body: {
            requestId: request.id,
          },
        });

        console.log(
          `send-request-email invoked successfully for request ${request.id}`,
        );

        // Exit early – send-request-email handles company notifications only.
        return; // ⬅️ ensure no duplicate member/admin emails for pending status
      } catch (invokeError) {
        console.error(
          `send-request-email invocation failed for request ${request.id}. Falling back to in-place email logic.`,
          invokeError,
        );

        // 🌐 FALLBACK: legacy direct email to company (previous implementation)
        const companyEmail = "sroc_cmc_vacationdesk@cn.ca";
        const companySubject =
          `${leaveType} Request - ${memberName} [Request ID: ${request.id}]`;

        // NEW TEMPLATE ALIGNMENT – replicate send-request-email (regular request)
        const companyHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${companySubject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
            .content { padding: 20px; border: 1px solid #ddd; }
            .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #2c5aa0; }
            .instructions { background-color: #fff3cd; padding: 15px; margin: 15px 0; border: 1px solid #ffeaa7; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>WC GCA BLET PLD Request</h1>
          </div>

          <div class="content">
            <h2>New ${leaveType} Request</h2>

            <div class="details">
              <p><strong>Employee Name:</strong> ${memberName}</p>
              <p><strong>Date Requested:</strong> ${formattedDate}</p>
              <p><strong>Leave Type:</strong> ${leaveType}</p>
              <p><strong>Request ID:</strong> ${request.id}</p>
            </div>

            <div class="instructions">
              <h3>Response Instructions</h3>
              <p>To process this request, please reply to this email with one of the following:</p>
              <ul>
                <li><strong>To APPROVE:</strong> Reply with "approved" or "done"</li>
                <li><strong>To DENY:</strong> Reply with "denied - [reason]"</li>
              </ul>
              <p><strong>Common denial reasons:</strong></p>
              <ul>
                <li>"denied - out of ${leaveType} days"</li>
                <li>"denied - allotment is full"</li>
                <li>"denied - other - [specific reason]"</li>
              </ul>
            </div>
          </div>

          <div class="footer">
            <p>This is an automated message from the WC GCA BLET PLD Application.</p>
            <p>Request ID: ${request.id}</p>
          </div>
        </body>
        </html>`;

        const companyText = `
WC GCA BLET PLD Request

Employee Name: ${memberName}
Date Requested: ${formattedDate}
Leave Type: ${leaveType}
Request ID: ${request.id}

RESPONSE INSTRUCTIONS:
To process this request, please reply to this email with one of the following:
- To APPROVE: Reply with "approved" or "done"
- To DENY: Reply with "denied - [reason]"

Common denial reasons:
- "denied - out of ${leaveType} days"
- "denied - allotment is full"
- "denied - other - [specific reason]"

This is an automated message from the WC GCA BLET PLD Application.
Request ID: ${request.id}
        `;

        // END TEMPLATE ALIGNMENT

        try {
          console.log(
            `Fallback: sending company notification email to: ${companyEmail} for request ${request.id}`,
          );

          const companyResult = await sendEmailViaDirect(
            mailgunSendingKey,
            mailgunDomain,
            {
              from: "WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>",
              to: companyEmail,
              subject: companySubject,
              html: companyHtml,
              text: companyText,
            },
          );

          // Record tracking for company email
          await supabase
            .from("email_tracking")
            .insert({
              request_id: request.id,
              email_type: "request",
              recipient: companyEmail,
              subject: companySubject,
              message_id: companyResult.id,
              status: "sent",
              retry_count: 0,
              created_at: new Date().toISOString(),
              last_updated_at: new Date().toISOString(),
            });

          console.log(
            `Company notification email sent successfully for request ${request.id}`,
          );
        } catch (companyEmailError) {
          console.error(
            `Error sending fallback company email for request ${request.id}:`,
            companyEmailError,
          );
        }

        // After fallback attempt (successful or not) return to avoid member/admin emails.
        return;
      }
    }

    default:
      // Don't send emails for other status changes
      return;
  }

  try {
    // Send email to member if email available
    if (memberEmail) {
      const userResult = await sendEmailViaDirect(
        mailgunSendingKey,
        mailgunDomain,
        {
          from: "WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>",
          to: String(memberEmail),
          subject: String(userSubject),
          html: String(userHtml),
          text: String(userText),
        },
      );

      // Record tracking
      await supabase
        .from("email_tracking")
        .insert({
          request_id: request.id,
          email_type: "notification",
          recipient: memberEmail,
          subject: userSubject,
          message_id: userResult.id,
          status: "sent",
          retry_count: 0,
          created_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        });
    }

    // Send emails to division administrators
    for (const email of divisionEmails) {
      if (email) {
        console.log(
          `Sending admin notification to: ${email} for request ${request.id}`,
        );
        const adminResult = await sendEmailViaDirect(
          mailgunSendingKey,
          mailgunDomain,
          {
            from: "WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>",
            to: String(email),
            subject: String(adminSubject),
            html: String(adminHtml),
            text: String(adminText),
          },
        );

        // Record tracking
        await supabase
          .from("email_tracking")
          .insert({
            request_id: request.id,
            email_type: "notification",
            recipient: email,
            subject: adminSubject,
            message_id: adminResult.id,
            status: "sent",
            retry_count: 0,
            created_at: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
          });
      }
    }
  } catch (emailError) {
    console.error("Error sending status change emails:", emailError);

    // If email sending fails, try to send fallback push notifications to division admins
    try {
      const fallbackMessage =
        `Action required: ${memberName}'s ${leaveType} request for ${formattedDate} status changed to ${status}. Email delivery failed.`;

      // Get division admin user IDs for push notifications
      const { data: adminUsers } = await supabase
        .from("members")
        .select("user_id")
        .eq("role", "division_admin")
        .eq("division_id", request.division_id);

      for (const admin of adminUsers || []) {
        if (admin.user_id) {
          // Queue push notification as fallback
          await supabase.functions.invoke("process-notification-queue", {
            body: {
              user_id: admin.user_id,
              title: "Email Delivery Failed",
              body: fallbackMessage,
              data: {
                requestId: request.id,
                type: "email_failure_fallback",
                category: "system_alert",
              },
            },
          });
        }
      }
    } catch (fallbackError) {
      console.error("Fallback notification failed:", fallbackError);
    }

    throw emailError; // Re-throw to be caught by main error handler
  }
}

// Helper function to send email via direct Mailgun API
async function sendEmailViaDirect(
  mailgunSendingKey: string,
  mailgunDomain: string,
  emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  },
) {
  // Create form data for Mailgun API
  const formData = new FormData();
  formData.append("from", emailData.from);
  formData.append("to", emailData.to);
  formData.append("subject", emailData.subject);
  formData.append("html", emailData.html);
  formData.append("text", emailData.text);

  // Send via Mailgun REST API
  const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
  const response = await fetch(mailgunUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${btoa(`api:${mailgunSendingKey}`)}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mailgun API error:", response.status, errorText);
    throw new Error(`Mailgun API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result;
}
