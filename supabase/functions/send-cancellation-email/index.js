import { createClient } from "@supabase/supabase-js";
import formData from "form-data";
import Mailgun from "mailgun.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handler(req) {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { requestId, name, pin } = await req.json();

    // Validate required fields
    if (!requestId || !name || !pin) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get request details from Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: requestData, error } = await supabase
      .from("public.pld_sdv_requests")
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

    // Prepare email content
    const emailData = {
      from: `CN/WC GCA BLET PLD App <requests@${Deno.env.get("MAILGUN_DOMAIN")}>`,
      to: "sroc_cmc_vacationdesk@cn.ca",
      subject: `CANCELLATION - ${requestData.day_type} Request - ${name}`,
      text: `
Name: ${name}
PIN: ${pin}
Date Requested: ${requestData.date_requested}
Day Type: ${requestData.day_type}
Request ID: ${requestId}

The employee wishes to CANCEL this previously approved time off request. 
Please reply "completed" to this email to confirm the cancellation.
      `,
      "h:Reply-To": `replies@${Deno.env.get("MAILGUN_DOMAIN")}`,
    };

    // Send email
    const result = await mg.messages.create(Deno.env.get("MAILGUN_DOMAIN"), emailData);

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
