import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SMSRequest {
  to: string;
  content: string;
  messageId?: string;
  deliveryId?: string;
  priority?: "low" | "normal" | "high";
  isOTP?: boolean;
}

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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to,
      content,
      messageId,
      deliveryId,
      priority = "normal",
      isOTP = false,
    }: SMSRequest = await req.json();

    // Validate input
    if (!to || !content) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: to, content",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const formattedPhone = formatPhoneToE164(to);

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Enhanced verification and opt-out checking for non-OTP messages
    if (!isOTP) {
      const canSend = await validateSMSDelivery(supabaseAdmin, formattedPhone);
      if (!canSend.allowed) {
        // Update delivery record if provided
        if (deliveryId) {
          await supabaseAdmin
            .from("sms_deliveries")
            .update({
              status: "failed",
              error_message: canSend.reason,
              updated_at: new Date().toISOString(),
            })
            .eq("id", deliveryId);
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: canSend.reason,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }
    }

    // Send SMS via Twilio with enhanced configuration
    const twilioResult = await sendViaTwilio(formattedPhone, content, priority);

    // Update delivery tracking if deliveryId provided
    if (deliveryId && twilioResult.success) {
      await supabaseAdmin
        .from("sms_deliveries")
        .update({
          status: "sent",
          twilio_sid: twilioResult.sid,
          cost_amount: twilioResult.cost,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);

      // Update organization budget
      if (twilioResult.cost) {
        const cost = Math.abs(twilioResult.cost);
        await updateOrganizationBudget(supabaseAdmin, cost);
      }
    } else if (deliveryId && !twilioResult.success) {
      await supabaseAdmin
        .from("sms_deliveries")
        .update({
          status: "failed",
          error_message: twilioResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    }

    // Log analytics
    if (messageId) {
      await supabaseAdmin.from("notification_analytics").insert({
        notification_id: messageId,
        delivery_method: "sms",
        success: twilioResult.success,
        timestamp: new Date().toISOString(),
        metadata: {
          phone: formattedPhone,
          priority,
          cost: twilioResult.cost,
          isOTP,
        },
      });
    }

    // Log successful delivery in webhook audit log
    if (twilioResult.success) {
      await supabaseAdmin.from("sms_webhook_audit_log").insert({
        phone_number: formattedPhone,
        message_sid: twilioResult.sid,
        status: "sent",
        webhook_data: {
          sid: twilioResult.sid,
          cost: twilioResult.cost,
          priority,
          messageId,
        },
        created_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        success: twilioResult.success,
        sid: twilioResult.sid,
        cost: twilioResult.cost,
        messageId: messageId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("SMS Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to send SMS",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});

async function validateSMSDelivery(
  supabase: any,
  phone: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Check phone verification
  const { data: verification, error: verificationError } = await supabase
    .from("phone_verifications")
    .select("verified, user_id")
    .eq("phone", phone)
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (verificationError || !verification) {
    return { allowed: false, reason: "Phone number not verified" };
  }

  // Check user preferences
  const { data: userPrefs, error: prefsError } = await supabase
    .from("user_preferences")
    .select("sms_opt_out, sms_lockout_until")
    .eq("user_id", verification.user_id)
    .single();

  if (prefsError && prefsError.code !== "PGRST116") {
    return { allowed: false, reason: "Unable to check user preferences" };
  }

  if (userPrefs?.sms_opt_out) {
    return { allowed: false, reason: "User has opted out of SMS" };
  }

  if (
    userPrefs?.sms_lockout_until &&
    new Date(userPrefs.sms_lockout_until) > new Date()
  ) {
    return { allowed: false, reason: "User is temporarily locked out" };
  }

  return { allowed: true };
}

async function sendViaTwilio(
  phone: string,
  content: string,
  priority: string,
): Promise<{
  success: boolean;
  sid?: string;
  cost?: number;
  error?: string;
}> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGE_SERVICE_SID");

  if (!accountSid || !authToken || !messagingServiceSid) {
    return { success: false, error: "Missing Twilio configuration" };
  }

  try {
    const body = new URLSearchParams({
      To: phone,
      MessagingServiceSid: messagingServiceSid,
      Body: content,
    });

    // Add priority-based features
    if (priority === "high") {
      body.append("ValidityPeriod", "14400"); // 4 hours for high priority
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body,
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Twilio API error:", errorData);
      return { success: false, error: "Twilio API error" };
    }

    const result = await response.json();

    return {
      success: true,
      sid: result.sid,
      cost: parseFloat(result.price || "0") * -1, // Twilio returns negative prices
    };
  } catch (error) {
    console.error("Twilio request error:", error);
    return { success: false, error: "Network error" };
  }
}

// Update organization SMS budget
async function updateOrganizationBudget(supabaseClient: any, cost: number) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toISOString().substr(0, 7);

    // Get current budget
    const { data: budget, error: budgetError } = await supabaseClient
      .from("organization_sms_budget")
      .select("*")
      .single();

    if (budgetError && budgetError.code !== "PGRST116") {
      console.error("Error getting organization budget:", budgetError);
      return;
    }

    if (!budget) {
      console.warn("No organization budget found");
      return;
    }

    // Prepare updates
    let updates: any = {
      updated_at: new Date().toISOString(),
    };

    // Reset daily budget if needed
    if (budget.last_daily_reset !== today) {
      updates.current_daily_spend = cost;
      updates.last_daily_reset = today;
    } else {
      updates.current_daily_spend = (budget.current_daily_spend || 0) + cost;
    }

    // Reset monthly budget if needed
    if (!budget.last_monthly_reset?.startsWith(currentMonth)) {
      updates.current_monthly_spend = cost;
      updates.last_monthly_reset = today;
    } else {
      updates.current_monthly_spend = (budget.current_monthly_spend || 0) +
        cost;
    }

    // Update budget
    await supabaseClient
      .from("organization_sms_budget")
      .update(updates)
      .eq("id", budget.id);

    console.log(`Updated organization budget: +$${cost}`);
  } catch (error) {
    console.error("Error updating organization budget:", error);
  }
}
