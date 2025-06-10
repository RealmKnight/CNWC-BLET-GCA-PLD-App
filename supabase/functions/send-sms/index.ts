import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Format phone number to E.164 (assumes US numbers)
function formatPhoneToE164(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, "");

  // If it starts with 1, assume it's already US format
  if (cleaned.startsWith("1") && cleaned.length === 11) {
    return `+${cleaned}`;
  }

  // If it's 10 digits, assume US number without country code
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // Return as-is if already formatted
  return phone;
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }
  try {
    const { to, content, isOTP = false } = await req.json();
    // Validate input
    if (!to || !content) {
      throw new Error("Missing required fields: to, content");
    }

    const formattedPhone = formatPhoneToE164(to);

    // Initialize Supabase client with service_role key to access auth admin APIs
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    // For non-OTP messages, check if phone is verified
    if (!isOTP) {
      const { data: verification, error: verificationError } =
        await supabaseAdmin
          .from("phone_verifications")
          .select("verified, user_id")
          .eq("phone", formattedPhone)
          .eq("verified", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

      if (verificationError || !verification) {
        throw new Error("Cannot send SMS to unverified phone number");
      }

      // Also check if user has opted out
      const { data: userPrefs, error: prefsError } = await supabaseAdmin
        .from("user_preferences")
        .select("sms_opt_out")
        .eq("user_id", verification.user_id)
        .single();

      if (prefsError && prefsError.code !== "PGRST116") {
        console.error("User preferences check error:", prefsError);
      }

      if (userPrefs?.sms_opt_out) {
        throw new Error("Cannot send SMS to opted-out phone number");
      }
    }
    // Send SMS directly using Twilio API
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get("TWILIO_MESSAGE_SERVICE_SID");

    if (!accountSid || !authToken || !messagingServiceSid) {
      throw new Error(
        "Missing Twilio configuration. Please check your environment variables.",
      );
    }

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: formattedPhone,
          MessagingServiceSid: messagingServiceSid,
          Body: content,
        }),
      },
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error("Twilio API error:", errorText);
      throw new Error("Failed to send SMS via Twilio");
    }
    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to send SMS",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 400,
      },
    );
  }
});
