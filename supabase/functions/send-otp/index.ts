import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// Rate limiting: Max 3 OTP requests per phone number per 5-minute window
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_REQUESTS = 3;
const OTP_EXPIRY_SECONDS = 120; // 2 minutes
const OTP_LENGTH = 6;

// Generate secure 6-digit OTP
function generateOTP(): string {
    const digits = "0123456789";
    let otp = "";
    for (let i = 0; i < OTP_LENGTH; i++) {
        otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
}

// Hash OTP using SHA-256
async function hashOTP(otp: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

    throw new Error(
        "Invalid phone number format. Please provide a valid US phone number.",
    );
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: corsHeaders,
        });
    }

    try {
        const { phone, user_id, pin_number } = await req.json();

        // Validate input
        if (!phone || !user_id || !pin_number) {
            throw new Error(
                "Missing required fields: phone, user_id, pin_number",
            );
        }

        // Format phone number to E.164
        const formattedPhone = formatPhoneToE164(phone);

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

        // Check rate limiting - max 3 requests per phone per 5-minute window
        const rateLimitCutoff = new Date(
            Date.now() - (RATE_LIMIT_WINDOW_MINUTES * 60 * 1000),
        );
        const { data: recentRequests, error: rateLimitError } =
            await supabaseAdmin
                .from("phone_verifications")
                .select("id")
                .eq("phone", formattedPhone)
                .gte("created_at", rateLimitCutoff.toISOString());

        if (rateLimitError) {
            console.error("Rate limit check error:", rateLimitError);
            throw new Error("Failed to check rate limits");
        }

        if (
            recentRequests && recentRequests.length >= RATE_LIMIT_MAX_REQUESTS
        ) {
            throw new Error(
                "Rate limit exceeded. You have requested an OTP too many times. Please try again in a few minutes.",
            );
        }

        // Check if user is locked out
        const { data: userPrefs, error: prefsError } = await supabaseAdmin
            .from("user_preferences")
            .select("sms_lockout_until")
            .eq("user_id", user_id)
            .single();

        if (prefsError && prefsError.code !== "PGRST116") { // PGRST116 = not found
            console.error("User preferences check error:", prefsError);
            throw new Error("Failed to check user status");
        }

        if (userPrefs?.sms_lockout_until) {
            const lockoutTime = new Date(userPrefs.sms_lockout_until);
            if (lockoutTime > new Date()) {
                throw new Error(
                    "Your account has been temporarily locked due to too many failed verification attempts. Please try again later or contact your division admin for assistance.",
                );
            }
        }

        // Check if phone is already verified by another user
        const { data: existingVerified, error: existingError } =
            await supabaseAdmin
                .from("phone_verifications")
                .select("user_id")
                .eq("phone", formattedPhone)
                .eq("verified", true)
                .neq("user_id", user_id);

        if (existingError) {
            console.error("Existing verification check error:", existingError);
            throw new Error("Failed to validate phone number");
        }

        if (existingVerified && existingVerified.length > 0) {
            throw new Error(
                "This phone number is already verified by another user.",
            );
        }

        // Generate OTP and create verification record
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);
        const expiresAt = new Date(Date.now() + (OTP_EXPIRY_SECONDS * 1000));
        const sessionId = crypto.randomUUID();

        // Insert verification record
        const { error: insertError } = await supabaseAdmin
            .from("phone_verifications")
            .insert({
                user_id,
                phone: formattedPhone,
                otp_hash: otpHash,
                expires_at: expiresAt.toISOString(),
                attempts: 0,
                verified: false,
                session_id: sessionId,
            });

        if (insertError) {
            console.error("Insert verification error:", insertError);
            throw new Error("Failed to create verification record");
        }

        // Update user preferences to 'pending' status using provided pin_number
        const { error: updateError } = await supabaseAdmin
            .from("user_preferences")
            .upsert({
                user_id,
                pin_number: pin_number,
                phone_verification_status: "pending",
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "user_id",
                ignoreDuplicates: false,
            });

        if (updateError) {
            console.error("Update user preferences error:", updateError);
            // Non-fatal error, continue with SMS sending
        }

        // Send OTP via SMS using existing send-sms function
        const smsContent =
            `Your BLET verification code is: ${otp}. This code expires in 2 minutes. Reply STOP to opt-out.`;

        // Call the send-sms function
        const smsResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${
                        Deno.env.get("SUPABASE_ANON_KEY")
                    }`,
                },
                body: JSON.stringify({
                    to: formattedPhone,
                    content: smsContent,
                    isOTP: true,
                }),
            },
        );

        if (!smsResponse.ok) {
            const smsError = await smsResponse.text();
            console.error("SMS sending failed:", smsError);
            throw new Error(
                "Failed to send OTP. Please check your phone number and try again.",
            );
        }

        // Log the event for compliance
        console.log(
            `OTP sent to ${formattedPhone} for user ${user_id}, session ${sessionId}`,
        );

        return new Response(
            JSON.stringify({
                success: true,
                message: "OTP sent successfully",
                session_id: sessionId,
                expires_in_seconds: OTP_EXPIRY_SECONDS,
            }),
            {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            },
        );
    } catch (error) {
        console.error("Send OTP error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to send OTP",
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
