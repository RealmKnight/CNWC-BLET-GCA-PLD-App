import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Log the incoming request for debugging
  console.log("=== WEBHOOK REQUEST RECEIVED ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Headers:", Object.fromEntries(req.headers.entries()));

  // Only accept POST requests
  if (req.method !== "POST") {
    console.log("Error: Only POST requests allowed");
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  try {
    // Verify the webhook is coming from Mailgun
    console.log("Parsing form data...");
    const body = await req.formData();

    // Log all form fields for debugging
    console.log("=== FORM DATA RECEIVED ===");
    for (const [key, value] of body.entries()) {
      console.log(
        `${key}:`,
        typeof value === "string"
          ? value.substring(0, 100) + (value.length > 100 ? "..." : "")
          : value,
      );
    }

    // Get signature components safely
    const timestamp = String(body.get("timestamp") || "");
    const token = String(body.get("token") || "");
    const signature = String(body.get("signature") || "");

    console.log("Signature verification data:");
    console.log("- Timestamp:", timestamp);
    console.log("- Token:", token ? "present" : "missing");
    console.log("- Signature:", signature ? "present" : "missing");

    // Verify signature using MAILGUN_WEBHOOK_SIGNING_KEY
    const webhookSigningKey = Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY");
    if (webhookSigningKey) {
      console.log("Verifying webhook signature...");
      const isValid = await verifyWebhookSignature(
        timestamp,
        token,
        signature,
        webhookSigningKey,
      );

      if (!isValid) {
        console.log("Error: Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log("✓ Webhook signature verified successfully");
    } else {
      console.log(
        "Warning: No webhook signing key configured, skipping signature verification",
      );
    }

    // Parse email content safely
    const subject = String(body.get("subject") || "");
    const strippedText = String(body.get("stripped-text") || "");
    const sender = String(body.get("sender") || "");

    console.log("=== EMAIL CONTENT ===");
    console.log("Subject:", subject);
    console.log("Sender:", sender);
    console.log(
      "Content preview:",
      strippedText.substring(0, 200) + (strippedText.length > 200 ? "..." : ""),
    );

    // Extract request ID from email subject or body - handle multiple formats
    const requestIdMatch = subject.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // New format: [Request ID: xxx]
      subject.match(/Request ID: ([a-f0-9-]+)/i) || // Old format: Request ID: xxx
      strippedText.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // In body with brackets
      strippedText.match(/Request ID: ([a-f0-9-]+)/i); // In body without brackets

    if (!requestIdMatch) {
      console.log("Error: Request ID not found in email");
      console.log("Subject searched:", subject);
      console.log("Content searched:", strippedText.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Request ID not found in email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const requestId = requestIdMatch[1];
    const contentLower = strippedText.toLowerCase();

    console.log("✓ Request ID found:", requestId);
    console.log("Processing email content...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine new status based on email content
    let newStatus = null;
    let denialReason = null;

    console.log("=== STATUS DETERMINATION ===");
    console.log(
      "Subject contains 'cancellation':",
      subject.toLowerCase().includes("cancellation"),
    );

    // Check if it's a cancellation response
    if (subject.toLowerCase().includes("cancellation")) {
      if (
        contentLower.includes("done") ||
        contentLower.includes("complete") ||
        contentLower.includes("completed") ||
        contentLower.includes("all set") ||
        contentLower.includes("confirmed") ||
        contentLower.includes("approved") ||
        contentLower.includes("these are done")
      ) {
        newStatus = "cancelled";
        console.log("✓ Detected cancellation confirmation");
      }
    } else {
      // Regular request response
      if (
        contentLower.includes("done") ||
        contentLower.includes("complete") ||
        contentLower.includes("completed") ||
        contentLower.includes("all set") ||
        contentLower.includes("these are done") ||
        contentLower.includes("approved") ||
        contentLower.includes("confirmed")
      ) {
        newStatus = "approved";
        console.log("✓ Detected approval");
      } else if (
        contentLower.includes("allotment is full") ||
        contentLower.includes("out of days") ||
        contentLower.includes("denied") ||
        contentLower.includes("rejected")
      ) {
        newStatus = "denied";
        console.log("✓ Detected denial");

        // Extract denial reason
        if (contentLower.includes("allotment is full")) {
          denialReason = "allotment is full";
        } else if (contentLower.includes("out of days")) {
          denialReason = "out of days";
        } else {
          denialReason = strippedText; // Use full content as reason
        }
        console.log("Denial reason:", denialReason);
      }
    }

    if (!newStatus) {
      console.log("Warning: Could not determine status from email content");
      console.log("Content analyzed:", contentLower);

      // Record the response for manual review
      await supabase
        .from("email_responses")
        .insert({
          request_id: requestId,
          sender_email: sender,
          subject: subject,
          content: strippedText,
          processed: false,
          created_at: new Date().toISOString(),
        });

      return new Response(
        JSON.stringify({
          error: "Could not determine approval status from email content",
          debug: {
            requestId,
            sender,
            contentPreview: contentLower.substring(0, 200),
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update status in database - fix database path
    const { error: updateError } = await supabase
      .from("pld_sdv_requests")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        denial_comment: newStatus === "denied" ? denialReason : null,
      })
      .eq("id", requestId);

    if (updateError) {
      throw new Error(
        `Failed to update request status: ${updateError.message}`,
      );
    }

    // Record the processed email response
    await supabase
      .from("email_responses")
      .insert({
        request_id: requestId,
        sender_email: sender,
        subject: subject,
        content: strippedText,
        processed: true,
        processed_at: new Date().toISOString(),
        resulting_status: newStatus,
        denial_reason: denialReason,
        created_at: new Date().toISOString(),
      });

    // Update email tracking if exists
    await supabase
      .from("email_tracking")
      .update({
        status: "delivered",
        last_updated_at: new Date().toISOString(),
      })
      .eq("request_id", requestId)
      .eq(
        "email_type",
        subject.toLowerCase().includes("cancellation")
          ? "cancellation"
          : "request",
      );

    console.log("✓ Email processed successfully");
    console.log("- Request ID:", requestId);
    console.log("- New Status:", newStatus);
    console.log("- Sender:", sender);

    return new Response(
      JSON.stringify({ success: true, newStatus, requestId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("=== CRITICAL ERROR IN WEBHOOK ===");
    console.error("Error:", error);
    console.error(
      "Stack trace:",
      error instanceof Error ? error.stack : "No stack trace",
    );

    const errorMessage = error instanceof Error
      ? error.message
      : "Webhook processing failed";

    return new Response(
      JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// Helper function to verify Mailgun webhook signature
async function verifyWebhookSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  try {
    // Create the message that should be signed
    const message = timestamp + token;

    // Create HMAC SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message),
    );

    // Convert to hex string
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare signatures
    return computedSignature === signature;
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}
