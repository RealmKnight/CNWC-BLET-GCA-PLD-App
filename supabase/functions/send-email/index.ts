import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp2@v0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

const SUPABASE_URL = 'https://bletcnwcgca.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlta2loZGllZ2txYmVlZ2ZlYnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY4OTMxNzAsImV4cCI6MjAyMjQ2OTE3MH0.TH2mXBKVJNt3UnX-ZLt4b7YLBvQj-p0P5D9h8ZzQgbE';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/public_assets/logo/BLETblackgold.png`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Log request details
    console.log("Request method:", req.method);
    console.log("Request headers:", Object.fromEntries(req.headers.entries()));
    
    // Get and validate content type
    const contentType = req.headers.get('content-type');
    console.log("Content-Type header:", contentType);
    
    if (!contentType?.includes('application/json')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // Read the request body
    const bodyText = await req.text();
    console.log("Raw request body:", bodyText);

    if (!bodyText) {
      throw new Error('Empty request body');
    }

    // Parse the JSON body
    let body;
    try {
      body = JSON.parse(bodyText);
      console.log("Parsed body:", body);
    } catch (e) {
      throw new Error(`Invalid JSON body: ${e.message}`);
    }

    // Validate required fields
    if (!body?.to || !body?.subject || !body?.content) {
      throw new Error(`Missing required fields: ${!body?.to ? 'to' : ''} ${!body?.subject ? 'subject' : ''} ${!body?.content ? 'content' : ''}`);
    }

    // Configure SMTP client
    console.log("Configuring SMTP client...");
    const client = new SmtpClient({
      host: "rs2.hostrocket.com",
      port: 465,
      secure: true, // for port 465
      auth: {
        username: "noreply@bletcnwcgca.org",
        password: "bletmay1863"
      }
    });

    // Send email
    console.log("Sending email to:", body.to);
    await client.send({
      from: "CN/WC GCA BLET PLD App <noreply@bletcnwcgca.org>",
      to: body.to,
      subject: body.subject,
      html: body.content // Using HTML content type
    });

    console.log("Email sent successfully!");
    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
        timestamp: new Date().toISOString()
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("Function error:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: {
          name: error.name,
          stack: error.stack
        },
        timestamp: new Date().toISOString()
      }),
      { 
        status: 400,
        headers: corsHeaders
      }
    );
  }
});
