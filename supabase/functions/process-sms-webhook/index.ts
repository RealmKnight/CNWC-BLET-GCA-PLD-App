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

    // Return as-is if already formatted correctly
    return phone;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    try {
        // Only accept POST requests (Twilio webhooks)
        if (req.method !== "POST") {
            return new Response("Method not allowed", {
                status: 405,
                headers: corsHeaders,
            });
        }

        // Parse form data from Twilio webhook
        const formData = await req.formData();
        const from = formData.get("From") as string;
        const body = formData.get("Body") as string;
        const messageSid = formData.get("MessageSid") as string;
        const accountSid = formData.get("AccountSid") as string;

        // Validate required fields from Twilio
        if (!from || !body) {
            console.error("Missing required webhook fields:", { from, body });
            return new Response("Bad request", {
                status: 400,
                headers: corsHeaders,
            });
        }

        // Normalize message body
        const normalizedBody = body.trim().toUpperCase();

        // Initialize Supabase client
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

        // Format phone number to match database format
        const formattedPhone = formatPhoneToE164(from);

        // Find user by phone number in verified phone_verifications
        const { data: verification, error: verificationError } =
            await supabaseAdmin
                .from("phone_verifications")
                .select("user_id")
                .eq("phone", formattedPhone)
                .eq("verified", true)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

        if (verificationError || !verification) {
            // Log the event but don't error out - phone number might not be in our system
            console.log(
                `Webhook received for unknown/unverified phone: ${formattedPhone}, body: ${normalizedBody}`,
            );

            // Still return 200 to acknowledge receipt to Twilio
            return new Response("OK", {
                status: 200,
                headers: corsHeaders,
            });
        }

        const userId = verification.user_id;

        // Handle STOP command
        if (
            normalizedBody === "STOP" || normalizedBody === "UNSUBSCRIBE" ||
            normalizedBody === "QUIT"
        ) {
            // Update user preferences to opt out of SMS
            const { error: updateError } = await supabaseAdmin
                .from("user_preferences")
                .update({
                    contact_preference: "in_app", // Revert to in-app notifications
                    sms_opt_out: true,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (updateError) {
                console.error(
                    "Failed to update user preferences for STOP:",
                    updateError,
                );
                return new Response("Internal server error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }

            // Log the opt-out event for compliance
            console.log(
                `SMS opt-out processed for user ${userId}, phone ${formattedPhone}, message: ${normalizedBody}`,
            );

            return new Response("OK - STOP processed", {
                status: 200,
                headers: corsHeaders,
            });
        }

        // Handle START/UNSTOP command
        if (normalizedBody === "START" || normalizedBody === "UNSTOP") {
            // Clear the opt-out flag - user will need to re-enable via app
            const { error: updateError } = await supabaseAdmin
                .from("user_preferences")
                .update({
                    sms_opt_out: false,
                    updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (updateError) {
                console.error(
                    "Failed to update user preferences for START:",
                    updateError,
                );
                return new Response("Internal server error", {
                    status: 500,
                    headers: corsHeaders,
                });
            }

            // Log the opt-in event for compliance
            console.log(
                `SMS opt-in processed for user ${userId}, phone ${formattedPhone}, message: ${normalizedBody}`,
            );

            return new Response("OK - START processed", {
                status: 200,
                headers: corsHeaders,
            });
        }

        // Handle HELP command
        if (normalizedBody === "HELP" || normalizedBody === "INFO") {
            // Log the help request
            console.log(
                `SMS help request from user ${userId}, phone ${formattedPhone}`,
            );

            return new Response("OK - HELP processed", {
                status: 200,
                headers: corsHeaders,
            });
        }

        // For any other message, just log it and respond OK
        console.log(
            `Unhandled SMS webhook from user ${userId}, phone ${formattedPhone}, body: ${normalizedBody}`,
        );

        return new Response("OK", {
            status: 200,
            headers: corsHeaders,
        });
    } catch (error) {
        console.error("SMS webhook processing error:", error);

        // Still return 200 to prevent Twilio from retrying
        return new Response("OK - Error logged", {
            status: 200,
            headers: corsHeaders,
        });
    }
});
