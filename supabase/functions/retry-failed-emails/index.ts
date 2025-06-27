// supabase/functions/retry-failed-emails/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// Add correlation ID and audit logging support
function generateCorrelationId(): string {
    return `rfe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface AuditEvent {
    correlationId: string;
    stage: string;
    timestamp: string;
    data?: any;
    error?: string;
    executionTimeMs?: number;
}

async function logAuditEvent(
    supabase: any,
    event: AuditEvent,
): Promise<void> {
    try {
        // Log to email_health_log for monitoring
        await supabase.from("email_health_log").insert({
            health_status: {
                correlationId: event.correlationId,
                stage: event.stage,
                timestamp: event.timestamp,
                data: event.data,
                error: event.error,
                executionTimeMs: event.executionTimeMs,
                function: "retry-failed-emails",
            },
            healthy: !event.error,
            recent_failures: event.error ? 1 : 0,
            stuck_attempts: 0,
            average_execution_time_ms: event.executionTimeMs || 0,
            issues: event.error ? [event.error] : [],
            checked_at: event.timestamp,
        });
    } catch (logError) {
        console.error("[Audit] Failed to log audit event:", logError);
    }
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === "OPTIONS") {
        return new Response(null, {
            headers: corsHeaders,
            status: 204,
        });
    }

    const result = await handler();
    return result;
});

export async function handler() {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    let supabase: any = null;

    try {
        console.log(
            `[${correlationId}] Starting failed email retry process...`,
        );

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        supabase = createClient(supabaseUrl!, supabaseServiceKey!);

        // Log initialization stage
        await logAuditEvent(supabase, {
            correlationId,
            stage: "initialization",
            timestamp: new Date().toISOString(),
            data: {
                functionName: "retry-failed-emails",
                hasSupabaseUrl: !!supabaseUrl,
                hasServiceKey: !!supabaseServiceKey,
            },
        });

        // Get failed emails that are due for retry
        const queryStart = Date.now();
        console.log(
            `[${correlationId}] Querying for failed emails due for retry...`,
        );

        const { data: failedEmails, error } = await supabase
            .from("email_tracking")
            .select("*")
            .in("status", ["failed", "queued"])
            .lte("next_retry_at", new Date().toISOString())
            .limit(20); // Process in batches

        if (error) {
            await logAuditEvent(supabase, {
                correlationId,
                stage: "query_failed",
                timestamp: new Date().toISOString(),
                error: error.message,
                executionTimeMs: Date.now() - queryStart,
            });
            throw error;
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "query_success",
            timestamp: new Date().toISOString(),
            data: { emailsFound: failedEmails.length },
            executionTimeMs: Date.now() - queryStart,
        });

        console.log(
            `[${correlationId}] Found ${failedEmails.length} emails to retry`,
        );

        // Process each failed email
        let processedCount = 0;
        let errorCount = 0;

        await logAuditEvent(supabase, {
            correlationId,
            stage: "email_processing_start",
            timestamp: new Date().toISOString(),
            data: { emailsToProcess: failedEmails.length },
        });

        for (const email of failedEmails) {
            const emailStart = Date.now();
            console.log(
                `[${correlationId}] Processing email ${email.id} (type: ${email.email_type})`,
            );

            // Declare requestData in outer scope so it's accessible in catch block
            let requestData: any = null;

            try {
                // UPDATED: Determine which function to call based on email_type including PIL types
                const functionName = (email.email_type === "request" ||
                        email.email_type === "payment_request")
                    ? "send-request-email"
                    : (email.email_type === "cancellation" ||
                            email.email_type === "payment_cancellation")
                    ? "send-cancellation-email"
                    : "process-status-changes";

                // Get request details if needed for the retry
                const { data: requestDataResult } = await supabase
                    .from("pld_sdv_requests")
                    .select(
                        "*, members(name, pin_number, division_admin_id, division_id)",
                    )
                    .eq("id", email.request_id)
                    .single();

                requestData = requestDataResult;
                if (!requestData) continue;

                // UPDATED: Prepare payload based on email type including PIL types
                let payload = {};
                if (
                    email.email_type === "request" ||
                    email.email_type === "payment_request"
                ) {
                    payload = {
                        name: requestData.members.name,
                        pin: requestData.members.pin_number,
                        dateRequested: requestData.request_date,
                        dayType: requestData.leave_type,
                        requestId: requestData.id,
                        divisionId: requestData.members.division_id,
                    };
                } else if (
                    email.email_type === "cancellation" ||
                    email.email_type === "payment_cancellation"
                ) {
                    payload = {
                        requestId: requestData.id,
                        name: requestData.members.name,
                        pin: requestData.members.pin_number,
                        divisionId: requestData.members.division_id,
                    };
                }

                // Try to deliver with primary email service first (Mailgun)
                let emailSent = false;
                try {
                    await supabase.functions.invoke(functionName, {
                        body: payload,
                    });
                    emailSent = true;
                } catch (primaryError: unknown) {
                    const errorMessage = primaryError instanceof Error
                        ? primaryError.message
                        : String(primaryError);
                    console.error(
                        `[${correlationId}] Primary email service failed:`,
                        errorMessage,
                    );

                    // If primary fails, try Resend as backup
                    if (email.retry_count >= 2) {
                        // Try backup after 2 primary failures
                        try {
                            // Get division emails if available
                            let recipients = [
                                Deno.env.get("COMPANY_ADMIN_EMAIL") ||
                                "sroc_cmc_vacationdesk@cn.ca",
                            ];

                            if (requestData.members.division_id) {
                                const { data: divisionData } = await supabase
                                    .from("divisions")
                                    .select(
                                        "primary_email, additional_emails, use_central_email",
                                    )
                                    .eq("id", requestData.members.division_id)
                                    .single();

                                if (
                                    divisionData &&
                                    !divisionData.use_central_email &&
                                    divisionData.primary_email
                                ) {
                                    recipients = [divisionData.primary_email];
                                    if (
                                        divisionData.additional_emails &&
                                        divisionData.additional_emails.length >
                                            0
                                    ) {
                                        recipients = [
                                            ...recipients,
                                            ...divisionData.additional_emails,
                                        ];
                                    }
                                }
                            }

                            await supabase.functions.invoke("send-email", {
                                body: {
                                    to: recipients,
                                    subject: (email.email_type === "request" ||
                                            email.email_type ===
                                                "payment_request")
                                        ? `${requestData.leave_type} ${
                                            email.email_type ===
                                                    "payment_request"
                                                ? "Payment "
                                                : ""
                                        }Request - ${requestData.members.name}`
                                        : `CANCELLATION - ${
                                            email.email_type ===
                                                    "payment_cancellation"
                                                ? "Payment "
                                                : ""
                                        }Request - ${requestData.members.name}`,
                                    html:
                                        `<p>This is a backup delivery of a previously failed email.</p>
                      <p>Name: ${requestData.members.name}</p>
                      <p>PIN: ${requestData.members.pin_number}</p>
                      <p>Date: ${requestData.request_date}</p>
                      <p>Type: ${requestData.leave_type}</p>
                      <p>Request ID: ${requestData.id}</p>
                      ${
                                            email.email_type ===
                                                    "payment_request" ||
                                                email.email_type ===
                                                    "payment_cancellation"
                                                ? "<p><strong>Request Type:</strong> Payment in Lieu</p>"
                                                : ""
                                        }
                      <p>This is an automated message. Please reply "approved" or "denied - [reason]" to this email to 
                      approve or deny this request. Denial reasons include "out of ${requestData.leave_type} days", 
                      ${
                                            email.email_type ===
                                                    "payment_request" ||
                                                email.email_type ===
                                                    "payment_cancellation"
                                                ? '"payment processing unavailable"'
                                                : '"allotment is full"'
                                        }, "other - [reason]".</p>`,
                                },
                            });
                            emailSent = true;
                        } catch (backupError: unknown) {
                            const backupErrorMessage =
                                backupError instanceof Error
                                    ? backupError.message
                                    : String(backupError);
                            console.error(
                                `[${correlationId}] Backup email service failed:`,
                                backupErrorMessage,
                            );
                            throw new Error(
                                `Both primary and backup email services failed`,
                            );
                        }
                    } else {
                        throw primaryError; // Re-throw if not yet trying backup
                    }
                }

                // If we got here, one of the services succeeded
                if (emailSent) {
                    // Update tracking record
                    await supabase
                        .from("email_tracking")
                        .update({
                            status: "sent",
                            retry_count: email.retry_count + 1,
                            last_updated_at: new Date().toISOString(),
                        })
                        .eq("id", email.id);
                }
            } catch (retryError: unknown) {
                const retryErrorMessage = retryError instanceof Error
                    ? retryError.message
                    : String(retryError);
                console.error(
                    `[${correlationId}] Failed to retry email ${email.id}:`,
                    retryErrorMessage,
                );
                errorCount++;

                await logAuditEvent(supabase, {
                    correlationId,
                    stage: "email_retry_failed",
                    timestamp: new Date().toISOString(),
                    error: retryErrorMessage,
                    data: {
                        emailId: email.id,
                        emailType: email.email_type,
                        retryCount: email.retry_count,
                    },
                    executionTimeMs: Date.now() - emailStart,
                });

                // Update retry count and set next retry with exponential backoff
                const nextRetryMinutes = Math.min(
                    120,
                    15 * Math.pow(2, email.retry_count),
                );

                // After 5 retries (about 8 hours with exponential backoff), trigger fallback notification
                const shouldSendFallback = email.retry_count >= 4 &&
                    !email.fallback_notification_sent;

                await supabase
                    .from("email_tracking")
                    .update({
                        retry_count: email.retry_count + 1,
                        next_retry_at: new Date(
                            Date.now() + nextRetryMinutes * 60 * 1000,
                        ).toISOString(),
                        error_message: retryErrorMessage,
                        fallback_notification_sent: shouldSendFallback
                            ? true
                            : email.fallback_notification_sent,
                        last_updated_at: new Date().toISOString(),
                    })
                    .eq("id", email.id);

                // If we've exhausted retries, send fallback notification
                if (shouldSendFallback && requestData?.members?.division_id) {
                    // Check for division_id
                    try {
                        // Determine the specific division admin user ID(s) for requestData.members.division_id.
                        const { data: divisionAdmins, error: adminError } =
                            await supabase
                                .from("members")
                                .select("id") // Select only the user ID
                                .eq("role", "division_admin")
                                .eq(
                                    "division_id",
                                    requestData.members.division_id,
                                );

                        if (adminError) {
                            console.error(
                                `Error fetching division admins for division ${requestData.members.division_id}:`,
                                adminError,
                            );
                            throw adminError; // Rethrow to log the main retry error with this context
                        }

                        if (divisionAdmins && divisionAdmins.length > 0) {
                            const message =
                                `Action required: ${requestData.members.name}'s ${requestData.leave_type} request for ${requestData.request_date} needs processing. Email delivery failed.`;

                            // Log fallback notification attempt
                            console.log(
                                `[${correlationId}] Sending fallback notifications to ${divisionAdmins.length} division admins`,
                            );

                            for (const admin of divisionAdmins) {
                                try {
                                    // Use process-notification-queue to send fallback notification
                                    await supabase.functions.invoke(
                                        "process-notification-queue",
                                        {
                                            body: {
                                                user_id: admin.id,
                                                title: "Email Delivery Failed",
                                                body: message,
                                                data: {
                                                    requestId: email.request_id,
                                                    type:
                                                        "email_failure_fallback",
                                                    category: "system_alert",
                                                    emailType: email.email_type,
                                                    requiresAcknowledgment:
                                                        true,
                                                },
                                            },
                                        },
                                    );
                                } catch (notifError) {
                                    console.error(
                                        `[${correlationId}] Failed to send fallback notification to admin ${admin.id}:`,
                                        notifError,
                                    );
                                }
                            }
                        } else {
                            console.warn(
                                `Could not determine division admin user ID for division ${requestData.members.division_id} to send 
                  fallback notification.`,
                            );
                            // Log this specific issue or escalate if necessary.
                        }
                    } catch (notificationError: unknown) {
                        const notifErrorMessage =
                            notificationError instanceof Error
                                ? notificationError.message
                                : String(notificationError);
                        console.error(
                            `[${correlationId}] Fallback notification failed:`,
                            notifErrorMessage,
                        );

                        // Log the notification failure for manual intervention
                        await supabase.from("notifications").insert({
                            user_id: requestData.members.division_admin_id,
                            type: "critical_failure",
                            title:
                                "CRITICAL: Email and Notification Delivery Failed",
                            message:
                                `Unable to notify about ${email.email_type} for ${requestData.members.name}`,
                            data: {
                                emailTrackingId: email.id,
                                requestId: email.request_id,
                                emailError: retryErrorMessage,
                            },
                            read: false,
                        });
                    }
                }
            }

            // Log successful email processing
            if (requestData) {
                processedCount++;
                await logAuditEvent(supabase, {
                    correlationId,
                    stage: "email_processed_success",
                    timestamp: new Date().toISOString(),
                    data: {
                        emailId: email.id,
                        emailType: email.email_type,
                        requestId: email.request_id,
                    },
                    executionTimeMs: Date.now() - emailStart,
                });
            }
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "processing_complete",
            timestamp: new Date().toISOString(),
            data: {
                totalProcessed: processedCount,
                totalErrors: errorCount,
                totalExecutionTimeMs: Date.now() - startTime,
            },
            executionTimeMs: Date.now() - startTime,
        });

        console.log(
            `[${correlationId}] Completed processing - ${processedCount} processed, ${errorCount} errors`,
        );

        return new Response(
            JSON.stringify({
                success: true,
                processed: processedCount,
                errors: errorCount,
                correlationId,
                executionTimeMs: Date.now() - startTime,
            }),
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : String(error);
        const totalExecutionTime = Date.now() - startTime;

        console.error(`[${correlationId}] Function error:`, errorMessage);

        // Log error to audit trail if supabase client available
        if (supabase) {
            try {
                await logAuditEvent(supabase, {
                    correlationId,
                    stage: "function_error",
                    timestamp: new Date().toISOString(),
                    error: errorMessage,
                    executionTimeMs: totalExecutionTime,
                });
            } catch (logError) {
                console.error(
                    `[${correlationId}] Failed to log error audit event:`,
                    logError,
                );
            }
        }

        return new Response(
            JSON.stringify({
                error: errorMessage,
                correlationId,
                executionTimeMs: totalExecutionTime,
            }),
            {
                status: 500,
            },
        );
    }
}
