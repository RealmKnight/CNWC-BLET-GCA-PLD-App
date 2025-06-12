import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { requestId } = await req.json();
    console.log("Received request with requestId:", requestId);

    // Validate required fields
    if (!requestId) {
      console.log("Error: Missing requestId");
      return new Response(
        JSON.stringify({ error: "Missing requestId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("Environment check - SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
    console.log(
      "Environment check - SUPABASE_SERVICE_ROLE_KEY:",
      supabaseServiceKey ? "✓" : "✗",
    );

    if (!supabaseUrl || !supabaseServiceKey) {
      console.log("Error: Missing Supabase configuration");
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log("Supabase client created successfully");

    // Get request details from Supabase first - UPDATED: Include paid_in_lieu field
    console.log("Fetching request details for ID:", requestId);
    const { data: requestData, error: requestError } = await supabase
      .from("pld_sdv_requests")
      .select("id, request_date, leave_type, member_id, paid_in_lieu")
      .eq("id", requestId)
      .single();

    if (requestError) {
      console.log("Error fetching request details:", requestError);
      throw new Error(`Failed to get request details: ${requestError.message}`);
    }

    console.log("Request data fetched:", requestData);

    if (!requestData.member_id) {
      console.log("Error: Member ID not found in request data");
      throw new Error("Member ID not found for this request");
    }

    // Get member details separately
    console.log("Fetching member details for ID:", requestData.member_id);
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("first_name, last_name, pin_number, division_id")
      .eq("id", requestData.member_id)
      .single();

    if (memberError) {
      console.log("Error fetching member details:", memberError);
      throw new Error(`Failed to get member details: ${memberError.message}`);
    }

    console.log("Member data fetched:", memberData);

    if (!memberData) {
      console.log("Error: Member data not found");
      throw new Error("Member information not found for this request");
    }

    const memberInfo = memberData;
    const memberName = `${memberInfo.first_name} ${memberInfo.last_name}`;
    console.log("Member name constructed:", memberName);

    // ADDED: PIL detection and email routing logic
    const isPaidInLieu = requestData.paid_in_lieu === true;
    console.log(
      `[send-cancellation-email] Processing ${
        isPaidInLieu ? "PIL" : "regular"
      } cancellation for ${memberName}`,
    );

    // Check Mailgun environment variables
    const mailgunSendingKey = Deno.env.get("MAILGUN_SENDING_KEY");
    const mailgunDomainRaw = Deno.env.get("MAILGUN_DOMAIN");
    console.log(
      "Environment check - MAILGUN_SENDING_KEY:",
      mailgunSendingKey ? "✓" : "✗",
    );
    console.log(
      "Environment check - MAILGUN_DOMAIN:",
      mailgunDomainRaw ? "✓" : "✗",
    );

    if (!mailgunSendingKey || !mailgunDomainRaw) {
      console.log("Error: Missing Mailgun configuration");
      throw new Error("Missing Mailgun configuration");
    }

    const mailgunDomain = String(mailgunDomainRaw);

    console.log("Using direct Mailgun API calls instead of SDK");

    // UPDATED: Email recipient logic for PIL vs regular cancellations
    const recipientEmail = isPaidInLieu
      ? String(Deno.env.get("COMPANY_PAYMENT_EMAIL") || "us_cmc_payroll@cn.ca")
      : String(
        Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca",
      );

    console.log(
      `[send-cancellation-email] Routing ${
        isPaidInLieu ? "PIL" : "regular"
      } cancellation to: ${recipientEmail}`,
    );

    // Format the date for display
    const formattedDate = new Date(requestData.request_date).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    // Ensure all variables are strings to prevent form-data conversion errors
    const safeRequestId = String(requestId);
    const safeLeaveType = String(requestData.leave_type);
    const safePinNumber = String(memberInfo.pin_number);
    const safeMemberName = String(memberName);
    const safeFormattedDate = String(formattedDate);

    // UPDATED: Subject line logic for PIL vs regular cancellations
    const subject = isPaidInLieu
      ? `CANCELLATION - ${safeLeaveType} Payment Request - ${safeMemberName} [Payment Request ID: ${safeRequestId}]`
      : `CANCELLATION - ${safeLeaveType} Request - ${safeMemberName} [Request ID: ${safeRequestId}]`;

    // UPDATED: Email content variables for PIL vs regular cancellations
    const requestTypeText = isPaidInLieu ? "Payment Request" : "Request";
    const headerTitle = isPaidInLieu
      ? "CN/WC GCA BLET PLD Payment Cancellation"
      : "CN/WC GCA BLET PLD Cancellation";
    const instructionText = isPaidInLieu
      ? "This is a cancellation request for a payment in lieu request."
      : "This is a cancellation request for a time off request.";

    // UPDATED: HTML content with PIL-aware messaging
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
            .content { padding: 20px; border: 1px solid #ddd; }
            .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #dc3545; }
            .instructions { background-color: #fff3cd; padding: 15px; margin: 15px 0; border: 1px solid #ffeaa7; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
            .cancellation-notice { background-color: #f8d7da; padding: 15px; margin: 15px 0; border: 1px solid #f5c6cb; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${headerTitle}</h1>
        </div>
        
        <div class="content">
            <h2>Cancellation Request for ${safeLeaveType} ${requestTypeText}</h2>
            
            <div class="cancellation-notice">
                <strong>🚫 CANCELLATION REQUEST:</strong> ${instructionText}
            </div>
            
            <div class="details">
                <p><strong>Employee Name:</strong> ${safeMemberName}</p>
                <p><strong>PIN Number:</strong> ${safePinNumber}</p>
                <p><strong>Date Requested:</strong> ${safeFormattedDate}</p>
                <p><strong>Leave Type:</strong> ${safeLeaveType}</p>
                <p><strong>${
      isPaidInLieu ? "Payment Request ID" : "Request ID"
    }:</strong> ${safeRequestId}</p>
                ${
      isPaidInLieu
        ? "<p><strong>Request Type:</strong> Payment in Lieu</p>"
        : ""
    }
            </div>
            
            <div class="instructions">
                <h3>Response Instructions</h3>
                <p>To confirm this cancellation, please reply to this email with one of the following:</p>
                <ul>
                    <li><strong>To CONFIRM CANCELLATION:</strong> Reply with "done", "confirmed", or "cancelled"</li>
                </ul>
                <p><em>Note: Once confirmed, this ${requestTypeText.toLowerCase()} will be permanently cancelled and cannot be restored.</em></p>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the CN/WC GCA BLET PLD Application.</p>
            <p>${
      isPaidInLieu ? "Payment Request ID" : "Request ID"
    }: ${safeRequestId}</p>
        </div>
    </body>
    </html>`;

    // UPDATED: Text content with PIL-aware messaging
    const textContent = `
CN/WC GCA BLET PLD ${requestTypeText} Cancellation

🚫 CANCELLATION REQUEST: ${instructionText}

Employee Name: ${safeMemberName}
PIN Number: ${safePinNumber}
Date Requested: ${safeFormattedDate}
Leave Type: ${safeLeaveType}
${isPaidInLieu ? "Payment Request ID" : "Request ID"}: ${safeRequestId}
${isPaidInLieu ? "Request Type: Payment in Lieu\n" : ""}

RESPONSE INSTRUCTIONS:
To confirm this cancellation, please reply to this email with one of the following:
- To CONFIRM CANCELLATION: Reply with "done", "confirmed", or "cancelled"

Note: Once confirmed, this ${requestTypeText.toLowerCase()} will be permanently cancelled and cannot be restored.

This is an automated message from the CN/WC GCA BLET PLD Application.
${isPaidInLieu ? "Payment Request ID" : "Request ID"}: ${safeRequestId}
    `;

    // Prepare email data with both HTML and text content
    const emailData = {
      from: "CN/WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>",
      to: String(recipientEmail),
      subject: String(subject),
      html: String(htmlContent),
      text: String(textContent),
      "h:Reply-To": "replies@pldapp.bletcnwcgca.org",
    };

    // Send email using direct Mailgun API
    console.log("Sending email with Mailgun API...");
    console.log("Email data subject:", emailData.subject);
    console.log("Email recipient:", emailData.to);

    // Create form data for Mailgun API
    const formData = new FormData();
    formData.append("from", emailData.from);
    formData.append("to", emailData.to);
    formData.append("subject", emailData.subject);
    formData.append("html", emailData.html);
    formData.append("text", emailData.text);
    formData.append("h:Reply-To", emailData["h:Reply-To"]);

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

    console.log("Email sent successfully, result:", result);

    // UPDATED: Email tracking with PIL-aware email_type
    const { error: trackingError } = await supabase
      .from("email_tracking")
      .insert({
        request_id: requestId,
        email_type: isPaidInLieu ? "payment_cancellation" : "cancellation",
        recipient: recipientEmail,
        subject: subject,
        message_id: result.id,
        status: "sent",
        retry_count: 0,
        created_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      });

    if (trackingError) {
      console.error("Failed to record email tracking:", trackingError);
      // Don't fail the request if tracking fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: result,
        messageId: result.id,
        recipient: recipientEmail,
        isPaidInLieu: isPaidInLieu,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-cancellation-email:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to send cancellation email";

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
