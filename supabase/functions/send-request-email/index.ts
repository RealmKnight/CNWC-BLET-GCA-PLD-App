import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import formData from "https://esm.sh/form-data";
import Mailgun from "https://esm.sh/mailgun.js";

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
    const { name, pin, dateRequested, dayType, requestId, divisionId } =
      await req.json();

    // Validate required fields
    if (!name || !pin || !dateRequested || !dayType || !requestId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
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

    // Initialize Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: "api",
      key: Deno.env.get("MAILGUN_API_KEY"),
    });

    // Get company admin email with fallback
    const companyAdminEmail = Deno.env.get("COMPANY_ADMIN_EMAIL") ||
      "sroc_cmc_vacationdesk@cn.ca";

    // Format the date for display
    const formattedDate = new Date(dateRequested).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Prepare email content with professional HTML formatting
    const subject = `${dayType} Request - ${name}`;
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
            <h2>New ${dayType} Request</h2>
            
            <div class="details">
                <p><strong>Employee Name:</strong> ${name}</p>
                <p><strong>PIN Number:</strong> ${pin}</p>
                <p><strong>Date Requested:</strong> ${formattedDate}</p>
                <p><strong>Leave Type:</strong> ${dayType}</p>
                <p><strong>Request ID:</strong> ${requestId}</p>
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
                    <li>"denied - out of ${dayType} days"</li>
                    <li>"denied - allotment is full"</li>
                    <li>"denied - other - [specific reason]"</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the CN/WC GCA BLET PLD Application.</p>
            <p>Request ID: ${requestId}</p>
        </div>
    </body>
    </html>`;

    // Prepare email data
    const emailData = {
      from: `CN/WC GCA BLET PLD App <requests@${
        Deno.env.get("MAILGUN_DOMAIN")
      }>`,
      to: companyAdminEmail,
      subject: subject,
      html: htmlContent,
      text: `
CN/WC GCA BLET PLD Request

Employee Name: ${name}
PIN Number: ${pin}
Date Requested: ${formattedDate}
Leave Type: ${dayType}
Request ID: ${requestId}

RESPONSE INSTRUCTIONS:
To process this request, please reply to this email with one of the following:
- To APPROVE: Reply with "approved" or "done"
- To DENY: Reply with "denied - [reason]"

Common denial reasons:
- "denied - out of ${dayType} days"
- "denied - allotment is full"  
- "denied - other - [specific reason]"

This is an automated message from the CN/WC GCA BLET PLD Application.
Request ID: ${requestId}
      `,
      "h:Reply-To": `replies@${Deno.env.get("MAILGUN_DOMAIN")}`,
    };

    // Send email using Mailgun
    const result = await mg.messages.create(
      Deno.env.get("MAILGUN_DOMAIN"),
      emailData,
    );

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
