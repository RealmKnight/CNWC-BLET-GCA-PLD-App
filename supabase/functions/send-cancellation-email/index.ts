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
    const { requestId, name, pin, divisionId } = await req.json();

    // Validate required fields
    if (!requestId || !name || !pin) {
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

    // Get request details from Supabase
    const { data: requestData, error } = await supabase
      .from("pld_sdv_requests")
      .select("request_date, leave_type")
      .eq("id", requestId)
      .single();

    if (error) {
      throw new Error(`Failed to get request details: ${error.message}`);
    }

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
    const formattedDate = new Date(requestData.request_date).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    // Prepare email content with professional HTML formatting
    const subject =
      `CANCELLATION - ${requestData.leave_type} Request - ${name}`;
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
                <p><strong>Employee Name:</strong> ${name}</p>
                <p><strong>PIN Number:</strong> ${pin}</p>
                <p><strong>Original Date Requested:</strong> ${formattedDate}</p>
                <p><strong>Leave Type:</strong> ${requestData.leave_type}</p>
                <p><strong>Request ID:</strong> ${requestId}</p>
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
CN/WC GCA BLET PLD Request - CANCELLATION

*** CANCELLATION REQUEST ***

Employee Name: ${name}
PIN Number: ${pin}
Original Date Requested: ${formattedDate}
Leave Type: ${requestData.leave_type}
Request ID: ${requestId}

The employee wishes to CANCEL this previously approved time off request.

RESPONSE INSTRUCTIONS:
To confirm the cancellation, please reply to this email with:
- "completed" or "done"

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
