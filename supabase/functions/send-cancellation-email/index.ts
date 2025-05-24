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

    // Get request details from Supabase first
    console.log("Fetching request details for ID:", requestId);
    const { data: requestData, error: requestError } = await supabase
      .from("pld_sdv_requests")
      .select("id, request_date, leave_type, member_id")
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

    // Get company admin email with fallback
    const companyAdminEmail = String(
      Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca",
    );
    console.log("Company admin email:", companyAdminEmail);

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
    const subject = "CANCELLATION - " + safeLeaveType + " Request - " +
      safeMemberName + " [Request ID: " + safeRequestId + "]";

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #d63031; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
            .content { padding: 20px; border: 1px solid #ddd; }
            .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #d63031; }
            .instructions { background-color: #fff3cd; padding: 15px; margin: 15px 0; border: 1px solid #ffeaa7; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
            .cancellation { background-color: #ff7675; color: white; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>CN/WC GCA BLET PLD Request</h1>
        </div>
        
        <div class="cancellation">
            CANCELLATION REQUEST
        </div>
        
        <div class="content">
            <h2>Request Cancellation</h2>
            
            <div class="details">
                <p><strong>Employee Name:</strong> ${safeMemberName}</p>
                <p><strong>PIN Number:</strong> ${safePinNumber}</p>
                <p><strong>Original Date Requested:</strong> ${safeFormattedDate}</p>
                <p><strong>Leave Type:</strong> ${safeLeaveType}</p>
                <p><strong>Request ID:</strong> ${safeRequestId}</p>
            </div>
            
            <div class="instructions">
                <h3>Cancellation Instructions</h3>
                <p>The employee wishes to <strong>CANCEL</strong> this previously approved time off request.</p>
                <p>To confirm the cancellation, please reply to this email with:</p>
                <ul>
                    <li><strong>"completed"</strong> or <strong>"done"</strong></li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the CN/WC GCA BLET PLD Application.</p>
            <p>Request ID: ${safeRequestId}</p>
        </div>
    </body>
    </html>`;

    const textContent = `
CN/WC GCA BLET PLD Request - CANCELLATION

*** CANCELLATION REQUEST ***

Employee Name: ${safeMemberName}
PIN Number: ${safePinNumber}
Original Date Requested: ${safeFormattedDate}
Leave Type: ${safeLeaveType}
Request ID: ${safeRequestId}

The employee wishes to CANCEL this previously approved time off request.

RESPONSE INSTRUCTIONS:
To confirm the cancellation, please reply to this email with:
- "completed" or "done"

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

    console.log("Email sent successfully, result:", result);

    // Record email tracking
    const { error: trackingError } = await supabase
      .from("email_tracking")
      .insert({
        request_id: requestId,
        email_type: "cancellation",
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
