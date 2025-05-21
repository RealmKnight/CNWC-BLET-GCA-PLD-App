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
    const { name, pin, dateRequested, dayType, requestId } = await req.json();

    // Validate required fields
    if (!name || !pin || !dateRequested || !dayType || !requestId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      subject: `${dayType} Request - ${name}`,
      text: `
Name: ${name}
PIN: ${pin}
Date Requested: ${dateRequested}
Day Type: ${dayType}
Request ID: ${requestId}

This is an automated message. Please reply "approved" or "denied - [reason]" to this email to approve or deny this request. 
Denial reasons include "out of ${dayType} days", "allotment is full", "other - [reason]".
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
