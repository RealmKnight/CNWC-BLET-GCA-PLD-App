import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS_PER_SESSION = 3;
const MAX_TOTAL_FAILED_ATTEMPTS = 6; // After 6 total failed attempts across sessions, lock out user
const LOCKOUT_DURATION_HOURS = 24; // 24 hours lockout

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
        const { phone, user_id, code, pin_number } = await req.json();

        // Validate input
        if (!phone || !user_id || !code || !pin_number) {
            throw new Error(
                "Missing required fields: phone, user_id, code, pin_number",
            );
        }

        // Format phone number to E.164
        const formattedPhone = formatPhoneToE164(phone);

        // Validate OTP format (6 digits)
        if (!/^\d{6}$/.test(code)) {
            throw new Error(
                "Invalid OTP. Please double-check the code and try again.",
            );
        }

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

        // Get the most recent verification record for this user and phone
        const { data: verification, error: verificationError } =
            await supabaseAdmin
                .from("phone_verifications")
                .select("*")
                .eq("user_id", user_id)
                .eq("phone", formattedPhone)
                .eq("verified", false)
                .order("created_at", { ascending: false })
                .limit(1)
                .single();

        if (verificationError) {
            if (verificationError.code === "PGRST116") {
                throw new Error(
                    "No active verification session found. Please request a new OTP.",
                );
            }
            console.error("Verification lookup error:", verificationError);
            throw new Error("Failed to retrieve verification session");
        }

        // Check if OTP has expired
        const expiresAt = new Date(verification.expires_at);
        if (expiresAt < new Date()) {
            throw new Error("Your OTP has expired. Please request a new one.");
        }

        // Check if too many attempts for this session
        if (verification.attempts >= MAX_ATTEMPTS_PER_SESSION) {
            throw new Error(
                "Too many incorrect attempts for this session. Please request a new OTP.",
            );
        }

        // Hash the provided code and compare with stored hash
        const codeHash = await hashOTP(code);
        const isCorrect = codeHash === verification.otp_hash;

        if (!isCorrect) {
            // Increment attempts for this session
            const newAttempts = verification.attempts + 1;

            await supabaseAdmin
                .from("phone_verifications")
                .update({
                    attempts: newAttempts,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", verification.id);

            // Count total failed attempts across all sessions for this user
            const { data: allFailedAttempts, error: failedAttemptsError } =
                await supabaseAdmin
                    .from("phone_verifications")
                    .select("attempts")
                    .eq("user_id", user_id)
                    .eq("verified", false);

            if (failedAttemptsError) {
                console.error(
                    "Failed attempts check error:",
                    failedAttemptsError,
                );
            }

            let totalFailedAttempts = 0;
            if (allFailedAttempts) {
                totalFailedAttempts = allFailedAttempts.reduce(
                    (sum, record) => sum + record.attempts,
                    0,
                );
            }

            // Log failed attempt for compliance
            console.log(
                `Failed OTP attempt for user ${user_id}, phone ${formattedPhone}. Session attempts: ${newAttempts}, Total failed: ${totalFailedAttempts}`,
            );

            // If total failed attempts >= 6, lock out the user
            if (totalFailedAttempts >= MAX_TOTAL_FAILED_ATTEMPTS) {
                const lockoutUntil = new Date(
                    Date.now() + (LOCKOUT_DURATION_HOURS * 60 * 60 * 1000),
                );

                await supabaseAdmin
                    .from("user_preferences")
                    .upsert({
                        user_id,
                        sms_lockout_until: lockoutUntil.toISOString(),
                        phone_verification_status: "locked_out",
                        updated_at: new Date().toISOString(),
                    }, {
                        onConflict: "user_id",
                        ignoreDuplicates: false,
                    });

                // TODO: Send admin notification about user lockout
                console.log(
                    `User ${user_id} locked out due to ${totalFailedAttempts} failed OTP attempts`,
                );

                throw new Error(
                    "You have entered an incorrect OTP too many times. Your account has been temporarily locked. Please try again later or contact your division admin for assistance.",
                );
            }

            // Return appropriate error message based on remaining attempts
            const remainingSessionAttempts = MAX_ATTEMPTS_PER_SESSION -
                newAttempts;
            if (remainingSessionAttempts > 0) {
                throw new Error(
                    `Invalid OTP. Please double-check the code and try again. ${remainingSessionAttempts} attempt(s) remaining for this session.`,
                );
            } else {
                throw new Error(
                    "Too many incorrect attempts for this session. Please request a new OTP.",
                );
            }
        }

        // Success! Mark verification as complete
        const { error: updateVerificationError } = await supabaseAdmin
            .from("phone_verifications")
            .update({
                verified: true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", verification.id);

        if (updateVerificationError) {
            console.error(
                "Update verification error:",
                updateVerificationError,
            );
            throw new Error("Failed to complete verification");
        }

        // Update user preferences using provided pin_number
        const { error: updatePrefsError } = await supabaseAdmin
            .from("user_preferences")
            .upsert({
                user_id,
                pin_number: pin_number,
                phone_verified: true,
                phone_verification_status: "verified",
                sms_lockout_until: null, // Clear any existing lockout
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "user_id",
                ignoreDuplicates: false,
            });

        if (updatePrefsError) {
            console.error("Update user preferences error:", updatePrefsError);
            throw new Error("Failed to update user preferences");
        }

        // Log successful verification for compliance
        console.log(
            `Successful OTP verification for user ${user_id}, phone ${formattedPhone}, session ${verification.session_id}`,
        );

        return new Response(
            JSON.stringify({
                success: true,
                message: "Phone number verified successfully",
                verified: true,
            }),
            {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            },
        );
    } catch (error) {
        console.error("Verify OTP error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error
                    ? error.message
                    : "Failed to verify OTP",
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
