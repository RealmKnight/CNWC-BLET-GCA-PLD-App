import { createClient } from "@supabase/supabase-js";
import formData from "form-data";
import Mailgun from "mailgun.js";

export async function handler(req) {
  try {
    // Verify the webhook is coming from Mailgun
    const body = await req.formData();
    const signature = {
      timestamp: body.get("timestamp"),
      token: body.get("token"),
      signature: body.get("signature"),
    };

    // In production, you would verify the signature here
    const isValid = mg.webhooks.verify(
      signature.timestamp,
      signature.token,
      signature.signature,
      Deno.env.get("MAILGUN_WEBHOOK_SIGNING_KEY")
    );
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
    }

    // Parse email content
    const subject = body.get("subject") || "";
    const strippedText = body.get("stripped-text") || "";
    const _sender = body.get("sender") || "";

    // Extract request ID from email subject or body
    const requestIdMatch =
      subject.match(/Request ID: ([a-f0-9-]+)/i) || strippedText.match(/Request ID: ([a-f0-9-]+)/i);

    if (!requestIdMatch) {
      return new Response(JSON.stringify({ error: "Request ID not found in email" }), { status: 400 });
    }

    const requestId = requestIdMatch[1];
    const contentLower = strippedText.toLowerCase();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine new status based on email content
    let newStatus = null;

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
      }
    }

    if (!newStatus) {
      return new Response(JSON.stringify({ error: "Could not determine approval status from email content" }), {
        status: 400,
      });
    }

    // Update status in database
    const { error: updateError } = await supabase
      .from("public.pld_sdv_requests")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        denial_comment: newStatus === "denied" ? contentLower : null,
      })
      .eq("id", requestId);

    if (updateError) {
      throw new Error(`Failed to update request status: ${updateError.message}`);
    }

    return new Response(JSON.stringify({ success: true, newStatus, requestId }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
