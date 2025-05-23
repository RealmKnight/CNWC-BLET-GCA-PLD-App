import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import formData from "https://esm.sh/form-data";
import Mailgun from "https://esm.sh/mailgun.js";

serve(async (req: Request) => {
  try {
    // Initialize Mailgun for webhook verification
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: "api",
      key: Deno.env.get("MAILGUN_API_KEY"),
    });

    // Verify the webhook is coming from Mailgun
    const body = await req.formData();
    const signature = {
      timestamp: body.get("timestamp"),
      token: body.get("token"),
      signature: body.get("signature"),
    };

    // Verify signature using MAILGUN_WEBHOOK_SIGNING_KEY
    const isValid = mg.webhooks.verify(
      signature.timestamp,
      signature.token,
      signature.signature,
      Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY"),
    );

    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
      });
    }

    // Parse email content
    const subject = body.get("subject") || "";
    const strippedText = body.get("stripped-text") || "";
    const sender = body.get("sender") || "";

    // Extract request ID from email subject or body
    const requestIdMatch = subject.match(/Request ID: ([a-f0-9-]+)/i) ||
      strippedText.match(/Request ID: ([a-f0-9-]+)/i);

    if (!requestIdMatch) {
      return new Response(
        JSON.stringify({ error: "Request ID not found in email" }),
        { status: 400 },
      );
    }

    const requestId = requestIdMatch[1];
    const contentLower = strippedText.toLowerCase();

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
      } else if (
        contentLower.includes("allotment is full") ||
        contentLower.includes("out of days") ||
        contentLower.includes("denied") ||
        contentLower.includes("rejected")
      ) {
        newStatus = "denied";

        // Extract denial reason
        if (contentLower.includes("allotment is full")) {
          denialReason = "allotment is full";
        } else if (contentLower.includes("out of days")) {
          denialReason = "out of days";
        } else {
          denialReason = strippedText; // Use full content as reason
        }
      }
    }

    if (!newStatus) {
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
        }),
        {
          status: 400,
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

    return new Response(
      JSON.stringify({ success: true, newStatus, requestId }),
    );
  } catch (error) {
    console.error("Error in process-email-webhook:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Webhook processing failed";

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
});
