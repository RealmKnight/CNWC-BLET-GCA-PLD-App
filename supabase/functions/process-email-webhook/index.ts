import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
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
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
  let requestId = "";
  let sender = "";
  let subject = "";
  let supabase = null;
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
        return new Response(
          JSON.stringify({
            error: "Invalid signature",
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
      console.log("✓ Webhook signature verified successfully");
    } else {
      console.log(
        "Warning: No webhook signing key configured, skipping signature verification",
      );
    }
    // Parse email content safely
    subject = String(body.get("subject") || "");
    const strippedText = String(body.get("stripped-text") || "");
    sender = String(body.get("sender") || "");
    console.log("=== EMAIL CONTENT ===");
    console.log("Subject:", subject);
    console.log("Sender:", sender);
    console.log(
      "Content preview:",
      strippedText.substring(0, 200) + (strippedText.length > 200 ? "..." : ""),
    );
    // UPDATED: Extract request ID from email subject or body - handle both PIL and regular formats
    const requestIdMatch =
      subject.match(/\[Payment Request ID: ([a-f0-9-]+)\]/i) || // PIL format
      subject.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // Regular format
      subject.match(/Payment Request ID: ([a-f0-9-]+)/i) || // PIL without brackets
      subject.match(/Request ID: ([a-f0-9-]+)/i) || // Regular without brackets
      strippedText.match(/\[Payment Request ID: ([a-f0-9-]+)\]/i) || // PIL in body
      strippedText.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // Regular in body
      strippedText.match(/Payment Request ID: ([a-f0-9-]+)/i) || // PIL in body no brackets
      strippedText.match(/Request ID: ([a-f0-9-]+)/i); // Regular in body no brackets
    if (!requestIdMatch) {
      console.log("Error: Request ID not found in email");
      console.log("Subject searched:", subject);
      console.log("Content searched:", strippedText.substring(0, 300));
      return new Response(
        JSON.stringify({
          error: "Request ID not found in email",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    requestId = requestIdMatch[1];
    const contentLower = strippedText.toLowerCase();
    // ADDED: PIL detection logic
    const isPilRequest = subject.toLowerCase().includes("payment request") ||
      subject.includes("[Payment Request ID:");
    console.log("✓ Request ID found:", requestId);
    console.log(
      "✓ Request type detected:",
      isPilRequest ? "Payment (PIL)" : "Regular",
    );
    console.log("Processing email content...");
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Determine new status based on email content
    let newStatus = null;
    let denialReason = null;
    console.log("=== STATUS DETERMINATION ===");
    console.log(
      "Subject contains 'cancellation':",
      subject.toLowerCase().includes("cancellation"),
    );
    console.log("Content to analyze:", contentLower);
    // Check if it's a cancellation response
    if (subject.toLowerCase().includes("cancellation")) {
      console.log("Processing cancellation email...");
      console.log("Content to check for cancellation keywords:", contentLower);
      const cancellationKeywords = [
        // Original keywords
        "done",
        "complete",
        "completed",
        "all set",
        "confirmed",
        "approved",
        "these are done",
        "cancelled",
        "canceled",
        "entered",
        "entered into",
        "entered into the system",
        "entered into the system",
        // Affirmative responses
        "yes",
        "yep",
        "yeah",
        "ok",
        "okay",
        "sure",
        "absolutely",
        "will do",
        "got it",
        "understood",
        // Task completion
        "finished",
        "handled",
        "processed",
        "taken care of",
        "sorted",
        "resolved",
        "closed",
        // Common typos
        "comfirmed",
        "cancled",
      ];
      const foundKeyword = cancellationKeywords.find((keyword) =>
        contentLower.includes(keyword)
      );
      if (foundKeyword) {
        newStatus = "cancelled";
        console.log(
          `✓ Detected cancellation confirmation with keyword: "${foundKeyword}"`,
        );
      } else {
        console.log(
          "❌ No cancellation confirmation keywords found in content",
        );
        console.log("Content analyzed:", contentLower);
        console.log("Available keywords checked:", cancellationKeywords);
      }
    } else {
      // Regular request response
      const approvalKeywords = [
        // Original keywords
        "done",
        "complete",
        "completed",
        "all set",
        "these are done",
        "approved",
        "confirmed",
        "entered",
        "entered into",
        "entered into the system",
        "entered into the system",
        // Positive responses
        "yes",
        "accept",
        "accepted",
        "granted",
        "authorized",
        "cleared",
        "go ahead",
        "proceed",
        // Informal approvals
        "good to go",
        "looks good",
        "all good",
        "👍",
        "ok",
        "okay",
        "fine",
        "sure",
        // Process confirmations
        "processed",
        "scheduled",
        "booked",
        "arranged",
        "set up",
        "handled",
        // Common typos
        "aproved",
        "comfirmed",
      ];
      const denialKeywords = [
        // Original keywords
        "allotment is full",
        "out of days",
        "denied",
        "rejected",
        // Direct rejections
        "no",
        "not available",
        "unavailable",
        // Capacity issues
        "no coverage",
        "short staffed",
        "insufficient staff",
        "no one available",
        "fully booked",
        "overbooked",
        // Policy/rule based
        "against policy",
        "not allowed",
        "violates",
        "exceeds limit",
        "too many requests",
        "blackout period",
        // Timing issues
        "too late",
        "insufficient notice",
        "short notice",
        "deadline passed",
        "expired",
        // Informal denials
        "sorry",
        "unfortunately",
        "regret",
        "decline",
        "declining",
      ];
      // Check for approval first
      const foundApprovalKeyword = approvalKeywords.find((keyword) =>
        contentLower.includes(keyword)
      );
      // Check for denial
      const foundDenialKeyword = denialKeywords.find((keyword) =>
        contentLower.includes(keyword)
      );
      if (foundApprovalKeyword) {
        newStatus = "approved";
        console.log(
          `✓ Detected approval with keyword: "${foundApprovalKeyword}"`,
        );
      } else if (foundDenialKeyword) {
        newStatus = "denied";
        console.log(`✓ Detected denial with keyword: "${foundDenialKeyword}"`);
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
    console.log("=== STATUS DETERMINATION RESULT ===");
    console.log("Final newStatus:", newStatus);
    console.log(
      "Was cancellation email:",
      subject.toLowerCase().includes("cancellation"),
    );
    console.log("Content analyzed length:", contentLower.length);
    console.log("Content preview:", contentLower.substring(0, 100));

    if (!newStatus) {
      console.log("❌ ERROR: Could not determine status from email content");
      console.log("Full content analyzed:", contentLower);
      // Record the response for manual review
      await supabase.from("email_responses").insert({
        request_id: requestId,
        sender_email: sender,
        subject: subject,
        content: strippedText,
        processed: false,
        created_at: new Date().toISOString(),
      });
      // Send error notification to division admin
      await sendErrorNotificationToAdmin(supabase, requestId, {
        error: "Could not determine approval status from email content",
        sender,
        subject,
        contentPreview: contentLower.substring(0, 200),
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
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    console.log("=== DATABASE UPDATE SECTION ===");
    console.log("About to fetch current request for ID:", requestId);
    // Check current request status before updating
    const { data: currentRequest, error: fetchError } = await supabase.from(
      "pld_sdv_requests",
    ).select("status, member_id, leave_type, request_date").eq("id", requestId)
      .single();

    console.log("Database fetch result:");
    console.log("- Data:", currentRequest);
    console.log("- Error:", fetchError);
    if (fetchError || !currentRequest) {
      console.error("Failed to fetch current request:", fetchError);
      await sendErrorNotificationToAdmin(supabase, requestId, {
        error: `Request not found in database: ${fetchError?.message}`,
        sender,
        subject,
      });
      throw new Error(`Request not found: ${fetchError?.message}`);
    }
    console.log("Current request status:", currentRequest.status);
    console.log("Attempting to set status to:", newStatus);
    // Handle idempotency - check if already in desired state
    if (currentRequest.status === newStatus) {
      console.log(`✓ Request is already in desired status: ${newStatus}`);
      console.log("Treating as successful (idempotent operation)");
      // Still record the email response for audit trail
      await supabase.from("email_responses").insert({
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
      return new Response(
        JSON.stringify({
          success: true,
          newStatus,
          requestId,
          idempotent: true,
          message: `Request was already in ${newStatus} status`,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      "pending": [
        "approved",
        "denied",
        "cancelled",
      ],
      "waitlisted": [
        "approved",
        "denied",
        "cancelled",
      ],
      "approved": [
        "cancelled",
      ],
      "denied": [],
      "cancelled": [],
    };
    const allowedTransitions =
      validTransitions[currentRequest.status as string] || [];
    if (!allowedTransitions.includes(newStatus)) {
      console.log(
        `❌ Invalid status transition: ${currentRequest.status} -> ${newStatus}`,
      );
      const errorMsg =
        `Invalid status transition from ${currentRequest.status} to ${newStatus}. Request is already in final state.`;
      await supabase.from("email_responses").insert({
        request_id: requestId,
        sender_email: sender,
        subject: subject,
        content: strippedText,
        processed: false,
        created_at: new Date().toISOString(),
      });
      await sendErrorNotificationToAdmin(supabase, requestId, {
        error: errorMsg,
        sender,
        subject,
        currentStatus: currentRequest.status,
        attemptedStatus: newStatus,
      });
      return new Response(
        JSON.stringify({
          error: errorMsg,
          currentStatus: currentRequest.status,
          attemptedStatus: newStatus,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
    // Perform database update with error handling
    try {
      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        actioned_at: new Date().toISOString(),
      };
      if (newStatus === "denied" && denialReason) {
        updateData.denial_comment = denialReason;
      }
      const { error: updateError } = await supabase.from("pld_sdv_requests")
        .update(updateData).eq("id", requestId);
      if (updateError) {
        console.error("Database update failed:", updateError);
        // Record failed attempt
        await supabase.from("email_responses").insert({
          request_id: requestId,
          sender_email: sender,
          subject: subject,
          content: strippedText,
          processed: false,
          created_at: new Date().toISOString(),
        });
        await sendErrorNotificationToAdmin(supabase, requestId, {
          error: `Database update failed: ${updateError.message}`,
          sender,
          subject,
          currentStatus: currentRequest.status,
          attemptedStatus: newStatus,
        });
        throw new Error(
          `Failed to update request status: ${updateError.message}`,
        );
      }
      console.log("✓ Database update successful");
    } catch (dbError) {
      console.error("Critical database error:", dbError);
      await sendErrorNotificationToAdmin(supabase, requestId, {
        error: `Critical database error: ${
          dbError instanceof Error ? dbError.message : "Unknown error"
        }`,
        sender,
        subject,
      });
      throw dbError;
    }
    // Record the processed email response
    await supabase.from("email_responses").insert({
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
    // UPDATED: Email tracking query to handle PIL, regular, and cancellation request types
    const isCancellation = subject.toLowerCase().includes("cancellation");
    let emailType = "request"; // default
    if (isCancellation && isPilRequest) {
      emailType = "payment_cancellation";
    } else if (isCancellation) {
      emailType = "cancellation";
    } else if (isPilRequest) {
      emailType = "payment_request";
    }

    console.log("=== EMAIL TRACKING UPDATE ===");
    console.log("Email type determined:", emailType);
    console.log("Is cancellation:", isCancellation);
    console.log("Is PIL request:", isPilRequest);
    await supabase.from("email_tracking").update({
      status: "delivered",
      last_updated_at: new Date().toISOString(),
    }).eq("request_id", requestId).eq("email_type", emailType);
    console.log("✓ Email processed successfully");
    console.log("- Request ID:", requestId);
    console.log("- Request Type:", isPilRequest ? "Payment (PIL)" : "Regular");
    console.log("- New Status:", newStatus);
    console.log("- Sender:", sender);
    return new Response(
      JSON.stringify({
        success: true,
        newStatus,
        requestId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
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
    // Try to send error notification if we have enough context
    if (typeof requestId !== "undefined" && requestId) {
      try {
        await sendErrorNotificationToAdmin(supabase, requestId, {
          error: `Critical webhook error: ${errorMessage}`,
          sender: typeof sender !== "undefined" ? sender : "Unknown",
          subject: typeof subject !== "undefined" ? subject : "Unknown",
          stackTrace: error instanceof Error ? error.stack : "No stack trace",
        });
      } catch (notificationError) {
        console.error(
          "Failed to send critical error notification:",
          notificationError,
        );
      }
    }
    return new Response(
      JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
// Helper function to send error notification to division admin
async function sendErrorNotificationToAdmin(
  supabase: any,
  requestId: string,
  errorDetails: any,
) {
  try {
    console.log("=== SENDING ERROR NOTIFICATION TO ADMIN ===");
    console.log("Request ID:", requestId);
    console.log("Error details:", errorDetails);
    // Get request details to find the division admin
    const { data: requestData, error: requestError } = await supabase.from(
      "pld_sdv_requests",
    ).select(`
        member_id,
        request_date,
        leave_type,
        members!inner(
          division_id,
          name,
          employee_id,
          divisions!inner(
            name,
            admin_user_id,
            users!inner(
              email,
              name
            )
          )
        )
      `).eq("id", requestId).single();
    if (requestError || !requestData) {
      console.error(
        "Failed to get request data for error notification:",
        requestError,
      );
      return;
    }
    const adminEmail = requestData.members?.divisions?.users?.email;
    const adminName = requestData.members?.divisions?.users?.name;
    const divisionName = requestData.members?.divisions?.name;
    const memberName = requestData.members?.name;
    const employeeId = requestData.members?.employee_id;
    if (!adminEmail) {
      console.error("No admin email found for division");
      return;
    }
    // Send error notification email
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: adminEmail,
          subject: `🚨 Email Webhook Processing Error - Request ${
            requestId.substring(0, 8)
          }`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">Email Webhook Processing Error</h2>
              
              <div style="background-color: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0;">
                <h3 style="color: #991b1b; margin-top: 0;">Error Details</h3>
                <p><strong>Error:</strong> ${errorDetails.error}</p>
                <p><strong>Request ID:</strong> ${requestId}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
              </div>

              <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; margin: 16px 0;">
                <h3 style="margin-top: 0;">Request Information</h3>
                <p><strong>Member:</strong> ${memberName} (${employeeId})</p>
                <p><strong>Division:</strong> ${divisionName}</p>
                <p><strong>Request Date:</strong> ${requestData.request_date}</p>
                <p><strong>Leave Type:</strong> ${requestData.leave_type}</p>
                ${
            errorDetails.currentStatus
              ? `<p><strong>Current Status:</strong> ${errorDetails.currentStatus}</p>`
              : ""
          }
                ${
            errorDetails.attemptedStatus
              ? `<p><strong>Attempted Status:</strong> ${errorDetails.attemptedStatus}</p>`
              : ""
          }
              </div>

              ${
            errorDetails.sender
              ? `
                <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; margin: 16px 0;">
                  <h3 style="margin-top: 0;">Email Information</h3>
                  <p><strong>Sender:</strong> ${errorDetails.sender}</p>
                  <p><strong>Subject:</strong> ${
                errorDetails.subject || "N/A"
              }</p>
                  ${
                errorDetails.contentPreview
                  ? `<p><strong>Content Preview:</strong> ${errorDetails.contentPreview}</p>`
                  : ""
              }
                </div>
              `
              : ""
          }

              <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 16px; margin: 16px 0;">
                <h3 style="color: #92400e; margin-top: 0;">Action Required</h3>
                <p>Please review this request manually and update the status appropriately in the admin dashboard.</p>
                <p>If this error persists, please contact the technical support team.</p>
              </div>

              <hr style="margin: 24px 0;">
              <p style="color: #6b7280; font-size: 12px;">
                This is an automated error notification from the PLD App Email Webhook System.
                <br>Generated at: ${new Date().toISOString()}
              </p>
            </div>
          `,
        }),
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send error notification email:", errorText);
    } else {
      console.log("✓ Error notification sent to admin:", adminEmail);
    }
  } catch (error) {
    console.error("Failed to send error notification:", error);
    // Don't throw here as it would cause the webhook to fail completely
  }
}
// Helper function to verify Mailgun webhook signature
async function verifyWebhookSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
) {
  try {
    // Create the message that should be signed
    const message = timestamp + token;
    // Create HMAC SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingKey),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      [
        "sign",
      ],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message),
    );
    // Convert to hex string
    const computedSignature = Array.from(new Uint8Array(signatureBuffer)).map((
      b,
    ) => b.toString(16).padStart(2, "0")).join("");
    // Compare signatures
    return computedSignature === signature;
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}
