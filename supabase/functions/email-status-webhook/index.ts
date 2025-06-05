import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// Helper function to create HMAC SHA256 using Web Crypto API
async function createHmacSha256(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    return Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: corsHeaders,
        });
    }

    try {
        console.log("=== EMAIL STATUS WEBHOOK CALLED ===");

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error("Missing Supabase configuration");
            throw new Error("Missing Supabase configuration");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get webhook data
        const formData = await req.formData();
        console.log("=== RAW FORM DATA ===");
        const formDataEntries: Record<string, string> = {};
        for (const [key, value] of formData.entries()) {
            formDataEntries[key] = value.toString();
            console.log(`${key}:`, value.toString().substring(0, 200)); // Log first 200 chars
        }

        const webhookData = {
            timestamp: formData.get("timestamp")?.toString() || "",
            token: formData.get("token")?.toString() || "",
            signature: formData.get("signature")?.toString() || "",
            "event-data": formData.get("event-data")?.toString() || "",
        };

        console.log("=== PROCESSED WEBHOOK DATA ===");
        console.log("Has timestamp:", !!webhookData.timestamp);
        console.log("Has token:", !!webhookData.token);
        console.log("Has signature:", !!webhookData.signature);
        console.log("Has event-data:", !!webhookData["event-data"]);

        // Verify webhook signature (optional - Mailgun delivery webhooks may not always have signatures)
        const mailgunWebhookSigningKey = Deno.env.get(
            "MAILGUN_WEBHOOK_SIGNING_KEY",
        );
        if (
            mailgunWebhookSigningKey && webhookData.signature &&
            webhookData.timestamp && webhookData.token
        ) {
            console.log("Verifying webhook signature...");
            const expectedSignature = await createHmacSha256(
                mailgunWebhookSigningKey,
                webhookData.timestamp + webhookData.token,
            );

            if (expectedSignature !== webhookData.signature) {
                console.error("Invalid webhook signature");
                return new Response("Forbidden", {
                    status: 403,
                    headers: corsHeaders,
                });
            }
            console.log("Webhook signature verified successfully");
        } else {
            console.log(
                "Skipping signature verification (test webhook or missing data)",
            );
        }

        // Check if this is a Mailgun test webhook
        if (!webhookData["event-data"]) {
            console.log("=== HANDLING TEST WEBHOOK ===");
            console.log(
                "No event-data found - this appears to be a test webhook",
            );
            return new Response("Test webhook received successfully", {
                headers: corsHeaders,
            });
        }

        // Parse event data
        let eventData;
        try {
            eventData = JSON.parse(webhookData["event-data"]);
            console.log("=== PARSED EVENT DATA ===");
            console.log("Event:", eventData.event);
            console.log("Recipient:", eventData.recipient);
            console.log(
                "Message ID available:",
                !!eventData.message?.headers?.["message-id"] || !!eventData.id,
            );
        } catch (error) {
            console.error("Failed to parse event data:", error);
            console.error("Raw event-data:", webhookData["event-data"]);
            return new Response("Invalid event data", {
                status: 400,
                headers: corsHeaders,
            });
        }

        // Extract relevant information from the event
        const messageId = eventData.message?.headers?.["message-id"] ||
            eventData.id;
        const event = eventData.event;
        const recipient = eventData.recipient;
        const timestamp = eventData.timestamp;
        const severity = eventData.severity || "info";
        const reason = eventData.reason || "";
        const deliveryStatus = eventData["delivery-status"];

        console.log("=== EXTRACTED EVENT INFO ===");
        console.log("Message ID:", messageId);
        console.log("Event:", event);
        console.log("Recipient:", recipient);

        if (!messageId || !event) {
            console.error("Missing required fields in webhook data");
            console.error("messageId present:", !!messageId);
            console.error("event present:", !!event);
            return new Response("Missing required fields", {
                status: 400,
                headers: corsHeaders,
            });
        }

        // Map Mailgun events to our status values
        const statusMapping: Record<string, string> = {
            "accepted": "queued",
            "delivered": "delivered",
            "failed": "failed",
            "opened": "opened",
            "clicked": "clicked",
            "unsubscribed": "unsubscribed",
            "complained": "complained",
            "rejected": "failed",
            "temporary-fail": "temporary_fail",
            "permanent-fail": "failed",
        };

        const newStatus = statusMapping[event] || event;
        console.log("Mapped status:", newStatus);

        // Update email tracking record
        console.log("=== UPDATING EMAIL TRACKING ===");
        const { data: emailTrackingData, error: updateError } = await supabase
            .from("email_tracking")
            .update({
                status: newStatus,
                error_message: severity === "error" || event.includes("fail")
                    ? reason
                    : null,
                last_updated_at: new Date().toISOString(),
            })
            .eq("message_id", messageId)
            .select()
            .single();

        if (updateError) {
            console.error("Failed to update email tracking:", updateError);
            // Don't return error to Mailgun - we'll log this for manual review
        } else {
            console.log("Email tracking updated successfully");
        }

        // Handle failed deliveries
        if (
            event === "failed" || event === "permanent-fail" ||
            event === "rejected"
        ) {
            console.log("=== HANDLING FAILED DELIVERY ===");
            await handleFailedDelivery(
                supabase,
                emailTrackingData,
                reason,
                severity,
            );
        }

        // Handle successful deliveries
        if (event === "delivered") {
            console.log("=== HANDLING SUCCESSFUL DELIVERY ===");
            await handleSuccessfulDelivery(supabase, emailTrackingData);
        }

        // Log the webhook event for monitoring
        console.log(`=== WEBHOOK PROCESSED SUCCESSFULLY ===`);
        console.log(`Email ${event} for message ${messageId} to ${recipient}`, {
            event,
            messageId,
            recipient,
            status: newStatus,
            reason,
            severity,
            timestamp,
        });

        return new Response("OK", {
            headers: corsHeaders,
        });
    } catch (error) {
        console.error("=== ERROR IN EMAIL STATUS WEBHOOK ===");
        console.error("Error:", error);
        console.error(
            "Error message:",
            error instanceof Error ? error.message : "Unknown error",
        );
        console.error(
            "Error stack:",
            error instanceof Error ? error.stack : "No stack trace",
        );

        // Return 200 to Mailgun to prevent retries for this webhook
        // Log error for manual investigation
        return new Response("Internal Error Logged", {
            headers: corsHeaders,
        });
    }
});

// Helper function to handle failed email deliveries
async function handleFailedDelivery(
    supabase: any,
    emailTrackingData: any,
    reason: string,
    severity: string,
) {
    try {
        if (!emailTrackingData) {
            console.error("No email tracking data found for failed delivery");
            return;
        }

        const retryCount = emailTrackingData.retry_count || 0;
        const maxRetries = 3;

        // Determine if we should retry
        const shouldRetry = retryCount < maxRetries && severity !== "permanent";

        if (shouldRetry) {
            // Calculate next retry time with exponential backoff
            const baseDelay = 300; // 5 minutes
            const exponentialDelay = baseDelay * Math.pow(2, retryCount);
            const nextRetryAt = new Date(Date.now() + exponentialDelay * 1000);

            await supabase
                .from("email_tracking")
                .update({
                    retry_count: retryCount + 1,
                    next_retry_at: nextRetryAt.toISOString(),
                    status: "retry_scheduled",
                })
                .eq("id", emailTrackingData.id);

            console.log(
                `Scheduled retry ${
                    retryCount + 1
                }/${maxRetries} for message ${emailTrackingData.message_id} at ${nextRetryAt}`,
            );
        } else {
            // Max retries exceeded or permanent failure
            await supabase
                .from("email_tracking")
                .update({
                    status: "permanently_failed",
                    error_message:
                        `Final failure after ${retryCount} retries: ${reason}`,
                })
                .eq("id", emailTrackingData.id);

            // Send fallback notification to division admins if this was a critical email
            await sendFallbackNotification(supabase, emailTrackingData, reason);
        }
    } catch (error) {
        console.error("Error handling failed delivery:", error);
    }
}

// Helper function to handle successful email deliveries
async function handleSuccessfulDelivery(supabase: any, emailTrackingData: any) {
    try {
        if (emailTrackingData && emailTrackingData.request_id) {
            // Update any pending retry flags
            await supabase
                .from("email_tracking")
                .update({
                    next_retry_at: null,
                    status: "delivered",
                })
                .eq("id", emailTrackingData.id);

            console.log(
                `Email successfully delivered for request ${emailTrackingData.request_id}`,
            );
        }
    } catch (error) {
        console.error("Error handling successful delivery:", error);
    }
}

// Helper function to send fallback notifications when email permanently fails
async function sendFallbackNotification(
    supabase: any,
    emailTrackingData: any,
    reason: string,
) {
    try {
        if (!emailTrackingData || !emailTrackingData.request_id) {
            return;
        }

        const requestId = emailTrackingData.request_id;
        const recipient = emailTrackingData.recipient;
        const emailType = emailTrackingData.email_type;

        // Get request details to find division admins for fallback notifications
        const { data: requestData } = await supabase
            .from("pld_sdv_requests")
            .select(`
                id,
                request_date,
                leave_type,
                status,
                member:members (
                    division_id,
                    first_name,
                    last_name
                )
            `)
            .eq("id", requestId)
            .single();

        if (!requestData || !requestData.member) {
            return;
        }

        // Use the email notification helper to send fallback notifications
        // This would ideally import the helper, but in Edge Functions we'll replicate the logic
        console.log(
            `Sending fallback notifications for permanently failed email to request ${requestId}`,
        );

        // Get division admins for fallback notifications
        const { data: divisionAdmins } = await supabase
            .from("members")
            .select(`
                id,
                pin_number,
                user_preferences (
                    user_id
                )
            `)
            .eq("role", "division_admin")
            .eq("division_id", requestData.member.division_id);

        // Send notifications to division admins using the hybrid notification system
        const title = "Email Delivery Failed - Manual Action Required";
        const fallbackMessage =
            `Failed to send ${emailType} email for ${requestData.member.first_name} ${requestData.member.last_name}'s ${requestData.leave_type} request on ${
                new Date(requestData.request_date).toLocaleDateString()
            }. Please process manually. Error: ${reason}`;

        let successCount = 0;
        for (const admin of divisionAdmins || []) {
            if (admin.user_preferences && admin.user_preferences.length > 0) {
                const userId = admin.user_preferences[0].user_id;
                try {
                    // Send system alert notification using the notification queue
                    const { error: notificationError } = await supabase
                        .functions.invoke(
                            "process-notification-queue",
                            {
                                body: {
                                    user_id: userId,
                                    title: title,
                                    body: fallbackMessage,
                                    data: {
                                        requestId: requestId,
                                        type: "email_delivery_failure",
                                        category: "system_alert",
                                        originalRecipient: recipient,
                                        emailType: emailType,
                                        failureReason: reason,
                                        requiresAcknowledgment: true,
                                        emailFailureDetails: {
                                            requestId: requestId,
                                            emailType: emailType,
                                            recipientEmail: recipient,
                                            errorMessage: reason,
                                            retryCount:
                                                emailTrackingData.retry_count ||
                                                0,
                                        },
                                    },
                                },
                            },
                        );

                    if (!notificationError) {
                        successCount++;
                        console.log(
                            `Sent fallback notification to admin ${admin.pin_number}`,
                        );
                    } else {
                        console.error(
                            `Failed to send fallback notification to admin ${admin.pin_number}:`,
                            notificationError,
                        );
                    }
                } catch (adminNotificationError) {
                    console.error(
                        `Error sending fallback notification to admin ${admin.pin_number}:`,
                        adminNotificationError,
                    );
                }
            }
        }

        // Also notify company admins of the failure
        const { data: companyAdmins } = await supabase
            .from("members")
            .select(`
                id,
                pin_number,
                user_preferences (
                    user_id
                )
            `)
            .eq("role", "company_admin");

        for (const admin of companyAdmins || []) {
            if (admin.user_preferences && admin.user_preferences.length > 0) {
                const userId = admin.user_preferences[0].user_id;
                try {
                    const { error: companyNotificationError } = await supabase
                        .functions.invoke(
                            "process-notification-queue",
                            {
                                body: {
                                    user_id: userId,
                                    title: "Email Delivery Failed",
                                    body:
                                        `Failed to send ${emailType} email to ${recipient}. Error: ${reason}`,
                                    data: {
                                        requestId: requestId,
                                        type: "email_delivery_failure",
                                        category: "system_alert",
                                        originalRecipient: recipient,
                                        emailType: emailType,
                                        failureReason: reason,
                                        requiresAcknowledgment: true,
                                        emailFailureDetails: {
                                            requestId: requestId,
                                            emailType: emailType,
                                            recipientEmail: recipient,
                                            errorMessage: reason,
                                            retryCount:
                                                emailTrackingData.retry_count ||
                                                0,
                                        },
                                    },
                                },
                            },
                        );

                    if (!companyNotificationError) {
                        console.log(
                            `Sent failure notification to company admin ${admin.pin_number}`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `Error sending failure notification to company admin ${admin.pin_number}:`,
                        error,
                    );
                }
            }
        }

        // Mark that fallback notification was sent
        await supabase
            .from("email_tracking")
            .update({
                fallback_notification_sent: true,
            })
            .eq("id", emailTrackingData.id);

        console.log(
            `Sent fallback notifications to ${successCount} division admins for permanently failed email to request ${requestId}`,
        );
    } catch (error) {
        console.error("Error sending fallback notification:", error);
    }
}
