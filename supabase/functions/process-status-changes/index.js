// Supabase Edge Function for sending notification emails when status changes
// supabase/functions/process-status-changes/index.js
import { createClient } from "@supabase/supabase-js";
import formData from "form-data";
import Mailgun from "mailgun.js";

// This function would be scheduled to run every few minutes
export async function handler(req) {
  try {
    // Process any status changes
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY");
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

    // Process each item
    for (const item of queueItems) {
      try {
        // Get request details
        const { data: request, error: requestError } = await supabase
          .from("public.pld_sdv_requests")
          .select(
            `
            id, 
            request_date, 
            leave_type, 
            status,
            denial_comment,
            public.members!pld_sdv_requests_member_id_fkey (
              id, 
              name, 
              email,
              division_admin_id
            )
          `
          )
          .eq("id", item.request_id)
          .single();

        if (requestError) {
          throw new Error(`Failed to get request details: ${requestError.message}`);
        }

        // Get admin details
        const { data: admin, error: adminError } = await supabase
          .from("users")
          .select("name, email")
          .eq("id", request.users.division_admin_id)
          .single();

        if (adminError) {
          throw new Error(`Failed to get admin details: ${adminError.message}`);
        }

        // Send notification emails based on status change
        await sendStatusChangeEmails(mg, item.new_status, request, request.users, admin);

        // Mark as processed
        await supabase.from("status_change_queue").update({ processed: true }).eq("id", item.id);
      } catch (processError) {
        console.error(`Error processing queue item ${item.id}:`, processError);
        // Log errors but continue processing other items
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${queueItems.length} status change notifications`,
      })
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// Helper function to send status change emails
async function sendStatusChangeEmails(mg, status, request, user, admin) {
  const formattedDate = new Date(request.date_requested).toLocaleDateString();
  const dayType = request.day_type.charAt(0).toUpperCase() + request.day_type.slice(1);

  // Configure email content based on status
  let userSubject, userText, adminSubject, adminText;

  switch (status) {
    case "approved":
      userSubject = `${dayType} Request Approved - ${formattedDate}`;
      userText = `
Dear ${user.name},

Your time off request for ${formattedDate} (${dayType}) has been APPROVED.

If you need to cancel this request, you can do so through the app.

Request ID: ${request.id}
      `;

      adminSubject = `${dayType} Request Approved - ${user.name} - ${formattedDate}`;
      adminText = `
Dear ${admin.name},

A time off request for ${user.name} on ${formattedDate} (${dayType}) has been APPROVED.

Request ID: ${request.id}
      `;
      break;

    case "denied":
      userSubject = `${dayType} Request Denied - ${formattedDate}`;
      userText = `
Dear ${user.name},

Unfortunately, your time off request for ${formattedDate} (${dayType}) has been DENIED.
Reason: ${request.denial_comment}

You may contact your division administrator for more information.

Request ID: ${request.id}
      `;

      adminSubject = `${dayType} Request Denied - ${user.name} - ${formattedDate}`;
      adminText = `
Dear ${admin.name},

A time off request for ${user.name} on ${formattedDate} (${dayType}) has been DENIED. 
Reason: ${request.denial_comment}

Request ID: ${request.id}
      `;
      break;

    case "cancelled":
      userSubject = `${dayType} Request Cancellation Confirmed - ${formattedDate}`;
      userText = `
Dear ${user.name},

Your cancellation request for ${formattedDate} (${dayType}) has been CONFIRMED.

Request ID: ${request.id}
      `;

      adminSubject = `${dayType} Request Cancelled - ${user.name} - ${formattedDate}`;
      adminText = `
Dear ${admin.name},

A time off request for ${user.name} on ${formattedDate} (${dayType}) has been CANCELLED.

Request ID: ${request.id}
      `;
      break;

    default:
      // Don't send emails for other status changes
      return;
  }

  // Send email to user
  await mg.messages.create(Deno.env.get("MAILGUN_DOMAIN"), {
    from: `CN/WC GCA BLET PLD App <notifications@${Deno.env.get("MAILGUN_DOMAIN")}>`,
    to: user.email,
    subject: userSubject,
    text: userText,
  });

  // Send email to admin
  await mg.messages.create(Deno.env.get("MAILGUN_DOMAIN"), {
    from: `CN/WC GCA BLET PLD App <notifications@${Deno.env.get("MAILGUN_DOMAIN")}>`,
    to: admin.email,
    subject: adminSubject,
    text: adminText,
  });
}
