import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// Use the 'smtp' library referenced in the import_map
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
console.log("Send Email Function Initializing (using smtp@v0.7.0)...");
// Log environment variables (excluding password for security)
console.log("SMTP_HOST:", Deno.env.get("SMTP_HOST"));
console.log("SMTP_PORT:", Deno.env.get("SMTP_PORT"));
console.log("SMTP_USERNAME:", Deno.env.get("SMTP_USERNAME"));
console.log("SMTP_FROM_EMAIL:", Deno.env.get("SMTP_FROM_EMAIL"));
console.log("TEST_VAR:", Deno.env.get("TEST_VAR"));
serve(async (req) => {
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  console.log(`Received ${req.method} request`);
  try {
    if (req.method !== "POST") {
      throw new Error("Method Not Allowed: Only POST requests are accepted.");
    }
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Invalid Content-Type: Must be application/json.");
    }
    const body = await req.json();
    console.log("Parsed request body:", body);
    const { to, subject, content } = body;
    if (!to || !subject || !content) {
      const missing = [!to && "to", !subject && "subject", !content && "content"].filter(Boolean).join(", ");
      throw new Error(`Missing required fields: ${missing}`);
    }
    const smtpHost = "smtp.resend.com";
    const smtpPort = Number("465");
    const smtpUsername = "resend"; // 'resend'
    const smtpPassword = "re_CMYFxBMU_AUnuUNtPriMo3FwQF9byG6BB"; // API Key
    const smtpFromEmail = "replies@pldapp.bletcnwcgca.org";
    if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword || !smtpFromEmail) {
      console.error("Missing SMTP environment variables!");
      throw new Error("SMTP configuration is incomplete. Please check environment variables.");
    }
    console.log("Configuring SMTP client (smtp@v0.7.0)...");
    // This library uses a slightly different configuration approach
    const client = new SmtpClient();
    // Connect using appropriate TLS/SSL settings for the port
    // Port 465 usually implies implicit TLS/SSL
    // Port 587 usually implies STARTTLS
    const connectOptions = {
      hostname: smtpHost,
      port: smtpPort,
      username: smtpUsername,
      password: smtpPassword,
    };
    if (smtpPort === 465) {
      console.log("Connecting using TLS/SSL (Port 465)...");
      await client.connect(connectOptions); // smtp@v0.7.0 might handle implicit TLS here
    } else {
      console.log("Connecting using STARTTLS (Port 587)...");
      await client.connect(connectOptions); // Connect first
      await client.startTls(); // Then initiate STARTTLS
    }
    console.log("SMTP client connected.");
    // Send the email
    console.log(`Sending email to: ${to} from: ${smtpFromEmail}`);
    await client.send({
      from: `CN/WC GCA BLET PLD App <${smtpFromEmail}>`,
      to: to,
      subject: subject,
      html: content,
    });
    console.log("Email sent successfully!");
    await client.close();
    console.log("SMTP client closed.");
    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully via Edge Function.",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("-------------------------------------");
    console.error("Error occurred in send-email function:");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.error("-------------------------------------");
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "An unknown error occurred.",
        details: {
          name: error.name,
        },
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
