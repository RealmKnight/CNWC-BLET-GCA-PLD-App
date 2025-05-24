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

    // Validate required fields
    if (!requestId) {
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

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request details from Supabase first
    const { data: requestData, error: requestError } = await supabase
      .from("pld_sdv_requests")
      .select("id, request_date, leave_type, member_id")
      .eq("id", requestId)
      .single();

    if (requestError) {
      throw new Error(`Failed to get request details: ${requestError.message}`);
    }

    if (!requestData.member_id) {
      throw new Error("Member ID not found for this request");
    }

    // Get member details separately
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("first_name, last_name, pin_number, division_id")
      .eq("id", requestData.member_id)
      .single();

    if (memberError) {
      throw new Error(`Failed to get member details: ${memberError.message}`);
    }

    if (!memberData) {
      throw new Error("Member information not found for this request");
    }

    const memberInfo = memberData;
    const memberName = `${memberInfo.first_name} ${memberInfo.last_name}`;

    // Check Mailgun environment variables
    const mailgunSendingKey = Deno.env.get("MAILGUN_SENDING_KEY");
    const mailgunDomainRaw = Deno.env.get("MAILGUN_DOMAIN");

    if (!mailgunSendingKey || !mailgunDomainRaw) {
      throw new Error("Missing Mailgun configuration");
    }

    const mailgunDomain = String(mailgunDomainRaw);

    // Get company admin email with fallback
    const companyAdminEmail = String(
      Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca",
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

    // Prepare email content with professional HTML formatting - include Request ID in subject
    const subject = safeLeaveType + " Request - " + safeMemberName +
      " [Request ID: " + safeRequestId + "]";
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
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
            <h1>CN/WC GCA BLET PLD Request</h1>
        </div>
        
        <div class="content">
            <h2>New ${safeLeaveType} Request</h2>
            
            <div class="details">
                <p><strong>Employee Name:</strong> ${safeMemberName}</p>
                <p><strong>PIN Number:</strong> ${safePinNumber}</p>
                <p><strong>Date Requested:</strong> ${safeFormattedDate}</p>
                <p><strong>Leave Type:</strong> ${safeLeaveType}</p>
                <p><strong>Request ID:</strong> ${safeRequestId}</p>
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
                    <li>"denied - out of ${safeLeaveType} days"</li>
                    <li>"denied - allotment is full"</li>
                    <li>"denied - other - [specific reason]"</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the CN/WC GCA BLET PLD Application.</p>
            <p>Request ID: ${safeRequestId}</p>
        </div>
    </body>
    </html>`;

    // Prepare text content with safe variables
    const textContent = `
CN/WC GCA BLET PLD Request

Employee Name: ${safeMemberName}
PIN Number: ${safePinNumber}
Date Requested: ${safeFormattedDate}
Leave Type: ${safeLeaveType}
Request ID: ${safeRequestId}

RESPONSE INSTRUCTIONS:
To process this request, please reply to this email with one of the following:
- To APPROVE: Reply with "approved" or "done"
- To DENY: Reply with "denied - [reason]"

Common denial reasons:
- "denied - out of ${safeLeaveType} days"
- "denied - allotment is full"  
- "denied - other - [specific reason]"

This is an automated message from the CN/WC GCA BLET PLD Application.
Request ID: ${safeRequestId}
    `;

    // Prepare email data with both HTML and text content
    const emailData = {
      from: "CN/WC GCA BLET PLD App <replies@pldapp.bletcnwcgca.org>",
      to: String(companyAdminEmail),
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

    // Record email tracking
    const { error: trackingError } = await supabase
      .from("email_tracking")
      .insert({
        request_id: requestId,
        email_type: "request",
        recipient: companyAdminEmail,
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
        recipient: companyAdminEmail,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-request-email:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Failed to send request email";

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
