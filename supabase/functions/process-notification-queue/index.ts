import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
    createClient,
    SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Add correlation ID and audit logging support
function generateCorrelationId(): string {
    return `pnq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    supabase: SupabaseClient,
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
                function: "process-notification-queue",
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

// Add interface for PushNotification
interface PushNotification {
    id: string;
    notification_id: string | null;
    user_id: string;
    push_token: string;
    title: string;
    body: string;
    data: Record<string, any>;
    status: string;
    error?: string | null;
    retry_count: number;
    next_attempt_at: string;
    max_attempts: number;
    first_attempted_at?: string | null;
    last_attempted_at?: string | null;
    sent_at?: string | null;
    created_at: string;
    updated_at: string;
}

// Add interface for SMS Delivery
interface SMSDelivery {
    id: string;
    message_id: string | null;
    recipient_id: string;
    phone_number: string;
    sms_content: string;
    full_content: string;
    status: string;
    twilio_sid?: string | null;
    error_message?: string | null;
    cost_amount?: number | null;
    priority: string;
    was_truncated: boolean;
    sent_at?: string | null;
    created_at: string;
    updated_at: string;
}

// Add interface for push notification parameters
interface PushNotificationParams {
    to: string;
    title: string;
    body: string;
    data: Record<string, any>;
}

// Add interface for SMS parameters
interface SMSParams {
    to: string;
    content: string;
    messageId?: string;
    deliveryId: string;
    priority?: string;
}

// Add interface for push notification result
interface PushNotificationResult {
    success: boolean;
    error?: string;
}

// Add interface for SMS result
interface SMSResult {
    success: boolean;
    error?: string;
    sid?: string;
    cost?: number;
}

// Interface for updates object
interface QueueItemUpdates {
    status: string;
    error: string | null;
    last_attempted_at: string;
    sent_at?: string;
    first_attempted_at?: string;
    retry_count?: number;
    next_attempt_at?: string;
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

    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    let supabaseClient: SupabaseClient | null = null;

    try {
        console.log(
            `[${correlationId}] === Starting notification queue processing ===`,
        );
        console.log(`[${correlationId}] Request method:`, req.method);
        console.log(`[${correlationId}] Request URL:`, req.url);

        // Check environment variables
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            const missingVars = [
                !supabaseUrl && "SUPABASE_URL",
                !supabaseKey && "SUPABASE_SERVICE_ROLE_KEY",
            ].filter(Boolean);

            const errorMsg = `Missing required environment variables: ${
                missingVars.join(", ")
            }`;
            console.error(errorMsg);
            return new Response(
                JSON.stringify({
                    error: errorMsg,
                    details:
                        "Edge function environment variables not properly configured",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 500,
                },
            );
        }

        // Create Supabase client
        supabaseClient = createClient(supabaseUrl, supabaseKey);
        console.log(`[${correlationId}] Supabase client created successfully`);

        // Log initialization stage
        if (supabaseClient) {
            await logAuditEvent(supabaseClient, {
                correlationId,
                stage: "initialization",
                timestamp: new Date().toISOString(),
                data: {
                    requestMethod: req.method,
                    requestUrl: req.url,
                },
            });
        }

        try {
            // Test database connection with a simple query
            const dbTestStart = Date.now();
            console.log(`[${correlationId}] Testing database connection...`);
            const { data: testData, error: testError } = await supabaseClient
                .from("push_notification_queue")
                .select("id")
                .limit(1);

            if (testError) {
                console.error(
                    `[${correlationId}] Database connection test failed:`,
                    testError,
                );

                await logAuditEvent(supabaseClient, {
                    correlationId,
                    stage: "database_test_failed",
                    timestamp: new Date().toISOString(),
                    error: testError.message,
                    executionTimeMs: Date.now() - dbTestStart,
                });

                throw new Error(`Database test failed: ${testError.message}`);
            } else {
                const dbTestTime = Date.now() - dbTestStart;
                console.log(
                    `[${correlationId}] Database connection test successful - found`,
                    testData?.length || 0,
                    "rows",
                );

                await logAuditEvent(supabaseClient, {
                    correlationId,
                    stage: "database_test_success",
                    timestamp: new Date().toISOString(),
                    data: { rowsFound: testData?.length || 0 },
                    executionTimeMs: dbTestTime,
                });
            }
        } catch (dbTestError) {
            console.error(
                `[${correlationId}] Exception in database test:`,
                dbTestError,
            );

            if (supabaseClient) {
                await logAuditEvent(supabaseClient, {
                    correlationId,
                    stage: "database_test_exception",
                    timestamp: new Date().toISOString(),
                    error: dbTestError instanceof Error
                        ? dbTestError.message
                        : String(dbTestError),
                });
            }

            throw dbTestError;
        }

        // Process pending notifications
        const processingStart = Date.now();
        console.log(
            `[${correlationId}] Starting notification queue processing...`,
        );

        await logAuditEvent(supabaseClient, {
            correlationId,
            stage: "queue_processing_start",
            timestamp: new Date().toISOString(),
        });

        const result = await processNotificationQueue(supabaseClient);
        const processingTime = Date.now() - processingStart;

        console.log(
            `[${correlationId}] Notification queue processing completed:`,
            result,
        );

        await logAuditEvent(supabaseClient, {
            correlationId,
            stage: "queue_processing_complete",
            timestamp: new Date().toISOString(),
            data: {
                processed: result.processed,
                failures: result.failures,
                totalExecutionTimeMs: Date.now() - startTime,
            },
            executionTimeMs: processingTime,
        });

        return new Response(
            JSON.stringify({
                success: true,
                processed: result.processed,
                failures: result.failures,
                correlationId,
                executionTimeMs: Date.now() - startTime,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : "Unknown error occurred";
        const errorStack = error instanceof Error ? error.stack : undefined;
        const totalExecutionTime = Date.now() - startTime;

        console.error(`[${correlationId}] === ERROR PROCESSING QUEUE ===`);
        console.error(`[${correlationId}] Error message:`, errorMessage);
        console.error(`[${correlationId}] Error stack:`, errorStack);
        console.error(`[${correlationId}] Error object:`, error);

        // Log error to audit trail if supabase client available
        if (supabaseClient) {
            try {
                await logAuditEvent(supabaseClient, {
                    correlationId,
                    stage: "function_error",
                    timestamp: new Date().toISOString(),
                    error: errorMessage,
                    data: {
                        errorStack,
                        totalExecutionTimeMs: totalExecutionTime,
                    },
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
                stack: errorStack,
                correlationId,
                timestamp: new Date().toISOString(),
                executionTimeMs: totalExecutionTime,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});

async function processNotificationQueue(supabase: SupabaseClient) {
    // Process both push notifications and SMS deliveries
    const [pushResults, smsResults] = await Promise.allSettled([
        processPushNotifications(supabase),
        processSMSDeliveries(supabase),
    ]);

    // Combine results
    let totalProcessed = 0;
    let totalFailures = 0;

    if (pushResults.status === "fulfilled") {
        totalProcessed += pushResults.value.processed;
        totalFailures += pushResults.value.failures;
        console.log(
            `Push notifications: ${pushResults.value.processed} processed, ${pushResults.value.failures} failed`,
        );
    } else {
        console.error(
            "Error processing push notifications:",
            pushResults.reason,
        );
        totalFailures += 1; // Count the entire batch as a failure
    }

    if (smsResults.status === "fulfilled") {
        totalProcessed += smsResults.value.processed;
        totalFailures += smsResults.value.failures;
        console.log(
            `SMS deliveries: ${smsResults.value.processed} processed, ${smsResults.value.failures} failed`,
        );
    } else {
        console.error("Error processing SMS deliveries:", smsResults.reason);
        totalFailures += 1; // Count the entire batch as a failure
    }

    return { processed: totalProcessed, failures: totalFailures };
}

async function processPushNotifications(supabase: SupabaseClient) {
    // Get pending notifications that are due for processing
    const { data: pendingNotifications, error } = await supabase
        .from("push_notification_queue")
        .select("*")
        .or(`status.eq.pending,status.eq.failed`)
        .lte("next_attempt_at", new Date().toISOString())
        .lt("retry_count", 10) // Max attempts
        .order("next_attempt_at", { ascending: true })
        .limit(50);

    if (error) {
        console.error("Error querying push notification queue:", error);
        throw error;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
        console.log("No pending push notifications to process");
        return { processed: 0, failures: 0 };
    }

    console.log(`Processing ${pendingNotifications.length} push notifications`);

    // Process each notification
    const results = await Promise.allSettled(
        pendingNotifications.map((notification) =>
            processNotification(supabase, notification)
        ),
    );

    // Count successes and failures
    const processed = results.filter(
        (result) => result.status === "fulfilled" && result.value === true,
    ).length;
    const failures = results.filter(
        (result) => result.status === "rejected" || result.value === false,
    ).length;

    return { processed, failures };
}

async function processSMSDeliveries(supabase: SupabaseClient) {
    // Get pending SMS deliveries that are due for processing
    const { data: pendingSMS, error } = await supabase
        .from("sms_deliveries")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);

    if (error) {
        console.error("Error querying SMS deliveries:", error);
        throw error;
    }

    if (!pendingSMS || pendingSMS.length === 0) {
        console.log("No pending SMS deliveries to process");
        return { processed: 0, failures: 0 };
    }

    console.log(`Processing ${pendingSMS.length} SMS deliveries`);

    // Process each SMS delivery
    const results = await Promise.allSettled(
        pendingSMS.map((smsDelivery) =>
            processSMSDelivery(supabase, smsDelivery)
        ),
    );

    // Count successes and failures
    const processed = results.filter(
        (result) => result.status === "fulfilled" && result.value === true,
    ).length;
    const failures = results.filter(
        (result) => result.status === "rejected" || result.value === false,
    ).length;

    return { processed, failures };
}

async function processNotification(
    supabase: SupabaseClient,
    notification: PushNotification,
) {
    try {
        const now = new Date();
        const isFirstAttempt = notification.retry_count === 0;

        // Update retry count and timestamps
        const updatedFields = {
            retry_count: notification.retry_count + 1,
            last_attempted_at: now.toISOString(),
            first_attempted_at: isFirstAttempt
                ? now.toISOString()
                : notification.first_attempted_at,
        };

        // Send push notification
        const result = await sendPushNotification({
            to: notification.push_token,
            title: notification.title,
            body: notification.body,
            data: notification.data,
        });

        if (result.success) {
            // Success - mark as sent
            await supabase
                .from("push_notification_queue")
                .update({
                    ...updatedFields,
                    status: "sent",
                    sent_at: now.toISOString(),
                    updated_at: now.toISOString(),
                })
                .eq("id", notification.id);

            // Record delivery metrics
            if (notification.notification_id) {
                await recordDeliveryMetrics(
                    supabase,
                    notification.notification_id,
                    notification.user_id,
                    true,
                    null,
                );
            }

            return true;
        } else {
            // Failed - schedule retry with backoff
            const nextAttemptAt = calculateNextAttemptTime(
                notification.retry_count,
            );

            await supabase
                .from("push_notification_queue")
                .update({
                    ...updatedFields,
                    status: "failed",
                    error: result.error || "Unknown error",
                    next_attempt_at: nextAttemptAt.toISOString(),
                    updated_at: now.toISOString(),
                })
                .eq("id", notification.id);

            // Record delivery metrics
            if (notification.notification_id) {
                await recordDeliveryMetrics(
                    supabase,
                    notification.notification_id,
                    notification.user_id,
                    false,
                    result.error,
                );
            }

            return false;
        }
    } catch (error) {
        console.error(
            `Error processing notification ${notification.id}:`,
            error,
        );
        return false;
    }
}

async function processSMSDelivery(
    supabase: SupabaseClient,
    smsDelivery: SMSDelivery,
) {
    try {
        console.log(
            `Processing SMS delivery ${smsDelivery.id} to ${smsDelivery.phone_number}`,
        );

        // Send SMS via Twilio
        const result = await sendSMSViaTwilio({
            to: smsDelivery.phone_number,
            content: smsDelivery.sms_content,
            messageId: smsDelivery.message_id || undefined,
            deliveryId: smsDelivery.id,
            priority: smsDelivery.priority,
        });

        if (result.success) {
            // Success - mark as sent
            await supabase
                .from("sms_deliveries")
                .update({
                    status: "sent",
                    twilio_sid: result.sid,
                    cost_amount: result.cost,
                    sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", smsDelivery.id);

            // Record delivery metrics
            if (smsDelivery.message_id) {
                await recordSMSDeliveryMetrics(
                    supabase,
                    smsDelivery.message_id,
                    smsDelivery.recipient_id,
                    true,
                    null,
                    result.cost || 0,
                );
            }

            console.log(`Successfully sent SMS ${smsDelivery.id}`);
            return true;
        } else {
            // Failed - mark as failed (no retry for SMS to keep it simple)
            await supabase
                .from("sms_deliveries")
                .update({
                    status: "failed",
                    error_message: result.error || "Unknown error",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", smsDelivery.id);

            // Record delivery metrics
            if (smsDelivery.message_id) {
                await recordSMSDeliveryMetrics(
                    supabase,
                    smsDelivery.message_id,
                    smsDelivery.recipient_id,
                    false,
                    result.error,
                    0,
                );
            }

            console.error(
                `Failed to send SMS ${smsDelivery.id}: ${result.error}`,
            );
            return false;
        }
    } catch (error) {
        console.error(
            `Error processing SMS delivery ${smsDelivery.id}:`,
            error,
        );

        // Mark as failed in case of exception
        try {
            await supabase
                .from("sms_deliveries")
                .update({
                    status: "failed",
                    error_message: error instanceof Error
                        ? error.message
                        : "Unknown error",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", smsDelivery.id);
        } catch (updateError) {
            console.error(`Failed to update SMS delivery status:`, updateError);
        }

        return false;
    }
}

// Calculate next attempt time with increasing backoff
function calculateNextAttemptTime(retryCount: number): Date {
    const now = new Date();

    // Implement exponential backoff strategy:
    // 1-3 retries in 60 secs
    // 4-6 retries in 10 mins
    // Then hourly retries
    // Continue for up to 24 hours

    if (retryCount <= 3) {
        // First 3 retries: 20 seconds apart
        return new Date(now.getTime() + 20 * 1000);
    } else if (retryCount <= 6) {
        // Next 3 retries: ~3 minutes apart
        return new Date(now.getTime() + 3 * 60 * 1000);
    } else if (retryCount <= 12) {
        // Next 6 retries: hourly
        return new Date(now.getTime() + 60 * 60 * 1000);
    } else {
        // Beyond 12 retries: every 2 hours until max attempts
        return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }
}

// Function for sending the push notification
async function sendPushNotification(
    params: PushNotificationParams,
): Promise<PushNotificationResult> {
    try {
        console.log(`Sending push notification to: ${params.to}`);
        console.log(`Notification payload: ${
            JSON.stringify({
                to: params.to,
                title: params.title,
                body: params.body,
                data: params.data,
            })
        }`);

        const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                to: params.to,
                title: params.title,
                body: params.body,
                data: params.data,
                sound: "default",
                priority: params.data?.importance === "high"
                    ? "high"
                    : "default",
                channelId: params.data?.importance === "high"
                    ? "urgent"
                    : "default",
                _displayInForeground: true,
            }),
        });

        const result = await response.json();
        console.log("Expo push service raw response:", JSON.stringify(result));

        if (result.data && result.data.status === "ok") {
            return { success: true };
        } else {
            const errorMsg = result.errors && result.errors.length > 0
                ? result.errors[0].message
                : "Push service returned an error";
            console.error(
                `Push notification failed: ${errorMsg}`,
                JSON.stringify(result),
            );
            return {
                success: false,
                error: errorMsg,
            };
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : "Unknown error occurred";
        console.error("Exception sending push notification:", errorMessage);
        return { success: false, error: errorMessage };
    }
}

// Add function to record delivery metrics
async function recordDeliveryMetrics(
    client: SupabaseClient,
    notificationId: string,
    userId: string,
    success: boolean,
    error: string | null = null,
) {
    try {
        const timestamp = new Date().toISOString();
        const { data, error: recordError } = await client
            .from("notification_analytics")
            .insert({
                notification_id: notificationId,
                user_id: userId,
                success,
                reason: error,
                timestamp,
            });

        if (recordError) {
            console.error("Error recording delivery metrics:", recordError);
        }

        return true;
    } catch (error) {
        console.error("Exception recording delivery metrics:", error);
        return false;
    }
}

// Update notification status in queue
async function updateQueueItemStatus(
    client: SupabaseClient,
    queueItemId: string,
    success: boolean,
    errorMessage: string | null = null,
) {
    const now = new Date().toISOString();
    const updates: QueueItemUpdates = {
        status: success ? "sent" : "failed",
        error: errorMessage,
        last_attempted_at: now,
    };

    if (success) {
        updates.sent_at = now;
    }

    // Check if this is the first attempt
    const { data: queueItem } = await client
        .from("push_notification_queue")
        .select("first_attempted_at, retry_count")
        .eq("id", queueItemId)
        .single();

    if (!queueItem.first_attempted_at) {
        updates.first_attempted_at = now;
    }

    updates.retry_count = (queueItem.retry_count || 0) + 1;

    // If failed, calculate next retry time with exponential backoff
    if (!success) {
        const baseDelay = 60; // 1 minute in seconds
        const maxBackoff = 24 * 60 * 60; // 24 hours in seconds

        // Calculate delay with exponential backoff (2^retry_count * baseDelay)
        const retryDelay = Math.min(
            Math.pow(2, updates.retry_count || 0) * baseDelay,
            maxBackoff,
        );

        // Set next attempt time
        const nextAttemptDate = new Date();
        nextAttemptDate.setSeconds(nextAttemptDate.getSeconds() + retryDelay);
        updates.next_attempt_at = nextAttemptDate.toISOString();
    }

    // Update the queue item
    const { error: updateError } = await client
        .from("push_notification_queue")
        .update(updates)
        .eq("id", queueItemId);

    if (updateError) {
        console.error("Error updating queue item:", updateError);
        return false;
    }

    return true;
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

// Function for sending SMS via Twilio
async function sendSMSViaTwilio(params: SMSParams): Promise<SMSResult> {
    try {
        console.log(`Sending SMS to: ${params.to}`);

        const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const messagingServiceSid = Deno.env.get("TWILIO_MESSAGE_SERVICE_SID");

        if (!accountSid || !authToken || !messagingServiceSid) {
            return {
                success: false,
                error:
                    "Missing Twilio configuration. Please check your environment variables.",
            };
        }

        const formattedPhone = formatPhoneToE164(params.to);

        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${
                        btoa(`${accountSid}:${authToken}`)
                    }`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    To: formattedPhone,
                    MessagingServiceSid: messagingServiceSid,
                    Body: params.content,
                }),
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Twilio API error:", errorText);
            return {
                success: false,
                error: "Failed to send SMS via Twilio",
            };
        }

        const result = await response.json();
        console.log("Twilio response:", JSON.stringify(result));

        return {
            success: true,
            sid: result.sid,
            cost: parseFloat(result.price || "0") * -1, // Twilio returns negative prices
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : "Unknown error occurred";
        console.error("Exception sending SMS:", errorMessage);
        return { success: false, error: errorMessage };
    }
}

// Record SMS delivery metrics
async function recordSMSDeliveryMetrics(
    client: SupabaseClient,
    messageId: string,
    userId: string,
    success: boolean,
    error: string | null = null,
    cost: number = 0,
) {
    try {
        const timestamp = new Date().toISOString();

        // Record in notification analytics
        await client.from("notification_analytics").insert({
            notification_id: messageId,
            user_id: userId,
            delivery_method: "sms",
            success,
            timestamp,
            metadata: {
                cost,
                error,
            },
        });

        // Record in SMS cost analytics for reporting
        if (success && cost > 0) {
            // Get user's division and role for analytics
            const { data: member } = await client
                .from("members")
                .select("division_name, role")
                .eq("id", userId)
                .single();

            await client.from("sms_cost_analytics").insert({
                division_name: member?.division_name || "unknown",
                user_role: member?.role || "member",
                cost_amount: cost,
                message_count: 1,
                date_sent: new Date().toISOString().split("T")[0],
            });
        }

        return true;
    } catch (error) {
        console.error("Error recording SMS delivery metrics:", error);
        return false;
    }
}
