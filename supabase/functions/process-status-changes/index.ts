// Supabase Edge Function for sending notification emails when status changes
// supabase/functions/process-status-changes/index.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import formData from "https://esm.sh/form-data";
import Mailgun from "https://esm.sh/mailgun.js";

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

    // Initialize Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: "api",
      key: Deno.env.get("MAILGUN_API_KEY"),
    });

    let processedCount = 0;
    let errorCount = 0;

    // Process each item
    for (const item of queueItems) {
      try {
        // Get request details with proper member relationship - fix database path and member retrieval
        const { data: request, error: requestError } = await supabase
          .from("pld_sdv_requests")
          .select(`
            id, 
            request_date, 
            leave_type, 
            status,
            denial_comment,
            member_id,
            members (
              id, 
              first_name,
              last_name,
              division_id,
              user_id,
              users (
                email
              )
            )
          `)
          .eq("id", item.request_id)
          .single();

        if (requestError) {
          throw new Error(
            `Failed to get request details: ${requestError.message}`,
          );
        }

        if (!request.members) {
          throw new Error(`No member found for request ${item.request_id}`);
        }

        const member = request.members;
        const memberName = `${member.first_name} ${member.last_name}`;
        const memberEmail = member.users?.email;
        const divisionId = member.division_id;

        // Get division email settings
        const { data: divisionEmailSettings } = await supabase
          .from("division_email_settings")
          .select("primary_email, additional_emails, enabled")
          .eq("division_id", divisionId)
          .eq("enabled", true)
          .single();

        // Get division admin emails as fallback
        const { data: divisionAdmins } = await supabase
          .from("members")
          .select(`
            users (
              email
            )
          `)
          .eq("role", "division_admin")
          .eq("division_id", divisionId);

        // Send notification emails based on status change
        await sendStatusChangeEmails(
          mg,
          supabase,
          item.new_status,
          request,
          memberName,
          memberEmail,
          divisionEmailSettings,
          divisionAdmins,
        );

        // Mark as processed
        await supabase.from("status_change_queue")
          .update({ processed: true })
          .eq("id", item.id);

        processedCount++;
      } catch (processError) {
        console.error(`Error processing queue item ${item.id}:`, processError);
        errorCount++;

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
            error_message: processError.message,
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
  mg: any,
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
  }

  // Fallback to division admin emails if no division emails configured
  if (divisionEmails.length === 0 && divisionAdmins) {
    divisionEmails = divisionAdmins
      .filter((admin) => admin.users?.email)
      .map((admin) => admin.users.email);
  }

  // Configure email content based on status
  let userSubject: string, userHtml: string, userText: string;
  let adminSubject: string, adminHtml: string, adminText: string;

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
          <div class="header"><h1>CN/WC GCA BLET PLD Request</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
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
          <div class="header"><h1>CN/WC GCA BLET PLD Notification</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
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
          <div class="header"><h1>CN/WC GCA BLET PLD Request</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
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
          <div class="header"><h1>CN/WC GCA BLET PLD Notification</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
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
          <div class="header"><h1>CN/WC GCA BLET PLD Request</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
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
          <div class="header"><h1>CN/WC GCA BLET PLD Notification</h1></div>
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
            <p>CN/WC GCA BLET PLD Application</p>
          </div>
        </body>
        </html>`;

      adminText =
        `A time off request for ${memberName} on ${formattedDate} (${leaveType}) has been CANCELLED.\n\nRequest ID: ${request.id}`;
      break;

    default:
      // Don't send emails for other status changes
      return;
  }

  try {
    // Send email to member if email available
    if (memberEmail) {
      const userResult = await mg.messages.create(
        Deno.env.get("MAILGUN_DOMAIN"),
        {
          from: `CN/WC GCA BLET PLD App <notifications@${
            Deno.env.get("MAILGUN_DOMAIN")
          }>`,
          to: memberEmail,
          subject: userSubject,
          html: userHtml,
          text: userText,
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
        const adminResult = await mg.messages.create(
          Deno.env.get("MAILGUN_DOMAIN"),
          {
            from: `CN/WC GCA BLET PLD App <notifications@${
              Deno.env.get("MAILGUN_DOMAIN")
            }>`,
            to: email,
            subject: adminSubject,
            html: adminHtml,
            text: adminText,
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
        .eq("division_id", request.members.division_id);

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
