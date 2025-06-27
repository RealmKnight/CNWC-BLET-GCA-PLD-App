import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// Add correlation ID and audit logging support
function generateCorrelationId(): string {
    return `erc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
                function: "email-reconciliation",
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

interface ReconciliationOptions {
    autoResolveStuckEmails?: boolean;
    moveToDLQ?: boolean;
    maxRetries?: number;
    dryRun?: boolean;
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
    let supabase: any = null;

    try {
        console.log(
            `[${correlationId}] Starting email reconciliation process...`,
        );

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing required environment variables");
        }

        supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parse request body for options
        let options: ReconciliationOptions = {};
        try {
            if (req.method === "POST") {
                const body = await req.json();
                options = {
                    autoResolveStuckEmails: body.autoResolveStuckEmails ?? true,
                    moveToDLQ: body.moveToDLQ ?? true,
                    maxRetries: body.maxRetries ?? 3,
                    dryRun: body.dryRun ?? false,
                };
            }
        } catch (parseError) {
            console.warn(
                `[${correlationId}] Failed to parse request body, using defaults`,
            );
        }

        // Log initialization stage
        await logAuditEvent(supabase, {
            correlationId,
            stage: "initialization",
            timestamp: new Date().toISOString(),
            data: {
                functionName: "email-reconciliation",
                options,
                requestMethod: req.method,
            },
        });

        const reconciliationResults = {
            stuckEmailsProcessed: 0,
            failedEmailsMovedToDLQ: 0,
            dlqItemsRetried: 0,
            errorsEncountered: 0,
            actions: [] as string[],
        };

        // Step 1: Process stuck email records
        const stuckEmailsStart = Date.now();
        console.log(`[${correlationId}] Processing stuck email records...`);

        const { data: stuckEmails, error: stuckEmailsError } = await supabase
            .from("stuck_email_records")
            .select("*")
            .limit(50); // Process in batches

        if (stuckEmailsError) {
            throw new Error(
                `Failed to fetch stuck emails: ${stuckEmailsError.message}`,
            );
        }

        for (const stuckEmail of stuckEmails) {
            try {
                if (options.autoResolveStuckEmails && !options.dryRun) {
                    // Update stuck email status to failed after timeout
                    await supabase
                        .from("email_tracking")
                        .update({
                            status: "failed",
                            error_message:
                                "Email stuck in intended status - auto-resolved by reconciliation",
                            last_updated_at: new Date().toISOString(),
                        })
                        .eq("request_id", stuckEmail.id)
                        .eq("email_type", stuckEmail.email_type);

                    reconciliationResults.stuckEmailsProcessed++;
                    reconciliationResults.actions.push(
                        `Resolved stuck email ${stuckEmail.email_type} for request ${stuckEmail.id}`,
                    );
                }
            } catch (error) {
                console.error(
                    `[${correlationId}] Error processing stuck email:`,
                    error,
                );
                reconciliationResults.errorsEncountered++;
            }
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "stuck_emails_processed",
            timestamp: new Date().toISOString(),
            data: {
                stuckEmailsFound: stuckEmails.length,
                stuckEmailsProcessed:
                    reconciliationResults.stuckEmailsProcessed,
            },
            executionTimeMs: Date.now() - stuckEmailsStart,
        });

        // Step 2: Process failed email attempts and move to DLQ
        const failedEmailsStart = Date.now();
        console.log(`[${correlationId}] Processing failed email attempts...`);

        const { data: failedEmails, error: failedEmailsError } = await supabase
            .from("failed_email_requests")
            .select("*")
            .limit(50);

        if (failedEmailsError) {
            throw new Error(
                `Failed to fetch failed emails: ${failedEmailsError.message}`,
            );
        }

        for (const failedEmail of failedEmails) {
            try {
                if (
                    options.moveToDLQ && !options.dryRun &&
                    failedEmail.retry_count >= (options.maxRetries ?? 3)
                ) {
                    // Move to dead letter queue
                    const { error: dlqError } = await supabase.rpc(
                        "move_to_dead_letter_queue",
                        {
                            p_request_id: failedEmail.id,
                            p_email_type: failedEmail.email_type,
                            p_error_message: failedEmail.error_message,
                            p_original_payload: {
                                name:
                                    `${failedEmail.first_name} ${failedEmail.last_name}`,
                                pin: failedEmail.pin_number,
                                division: failedEmail.division_name,
                                leave_type: failedEmail.leave_type,
                                request_date: failedEmail.request_date,
                            },
                        },
                    );

                    if (dlqError) {
                        console.error(
                            `[${correlationId}] Error moving to DLQ:`,
                            dlqError,
                        );
                        reconciliationResults.errorsEncountered++;
                    } else {
                        reconciliationResults.failedEmailsMovedToDLQ++;
                        reconciliationResults.actions.push(
                            `Moved failed ${failedEmail.email_type} to DLQ for request ${failedEmail.id}`,
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `[${correlationId}] Error processing failed email:`,
                    error,
                );
                reconciliationResults.errorsEncountered++;
            }
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "failed_emails_processed",
            timestamp: new Date().toISOString(),
            data: {
                failedEmailsFound: failedEmails.length,
                failedEmailsMovedToDLQ:
                    reconciliationResults.failedEmailsMovedToDLQ,
            },
            executionTimeMs: Date.now() - failedEmailsStart,
        });

        // Step 3: Process dead letter queue items for auto-retry
        const dlqProcessingStart = Date.now();
        console.log(
            `[${correlationId}] Processing DLQ items for auto-retry...`,
        );

        const { data: dlqItems, error: dlqError } = await supabase
            .from("email_dead_letter_queue")
            .select("*")
            .eq("resolved", false)
            .eq("requires_manual_review", false)
            .lt("retry_count", "max_retries")
            .limit(25);

        if (dlqError) {
            console.error(
                `[${correlationId}] Error fetching DLQ items:`,
                dlqError,
            );
        } else {
            for (const dlqItem of dlqItems) {
                try {
                    if (!options.dryRun) {
                        // Attempt to retry the email
                        const functionName =
                            dlqItem.email_type.includes("cancellation")
                                ? "send-cancellation-email"
                                : "send-request-email";

                        const { error: retryError } = await supabase.functions
                            .invoke(functionName, {
                                body: {
                                    requestId: dlqItem.request_id,
                                    retryFromDLQ: true,
                                    dlqId: dlqItem.id,
                                },
                            });

                        if (retryError) {
                            // Update DLQ item with retry failure
                            await supabase
                                .from("email_dead_letter_queue")
                                .update({
                                    retry_count: dlqItem.retry_count + 1,
                                    original_error:
                                        `${dlqItem.original_error}\n\nRetry ${
                                            dlqItem.retry_count + 1
                                        } failed: ${retryError.message}`,
                                    updated_at: new Date().toISOString(),
                                    requires_manual_review:
                                        dlqItem.retry_count + 1 >=
                                            dlqItem.max_retries,
                                })
                                .eq("id", dlqItem.id);

                            reconciliationResults.errorsEncountered++;
                        } else {
                            // Mark as resolved on successful retry
                            await supabase.rpc("resolve_dlq_item", {
                                p_dlq_id: dlqItem.id,
                                p_resolved_by: "auto-reconciliation",
                                p_resolution_notes:
                                    `Auto-retry successful on attempt ${
                                        dlqItem.retry_count + 1
                                    }`,
                            });

                            reconciliationResults.dlqItemsRetried++;
                            reconciliationResults.actions.push(
                                `Successfully retried DLQ item ${dlqItem.id} (${dlqItem.email_type})`,
                            );
                        }
                    }
                } catch (error) {
                    console.error(
                        `[${correlationId}] Error processing DLQ item:`,
                        error,
                    );
                    reconciliationResults.errorsEncountered++;
                }
            }
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "dlq_processing_complete",
            timestamp: new Date().toISOString(),
            data: {
                dlqItemsFound: dlqItems?.length || 0,
                dlqItemsRetried: reconciliationResults.dlqItemsRetried,
            },
            executionTimeMs: Date.now() - dlqProcessingStart,
        });

        // Generate final reconciliation report
        const { data: finalReport, error: reportError } = await supabase.rpc(
            "generate_email_reconciliation_report",
        );

        if (reportError) {
            console.error(
                `[${correlationId}] Error generating final report:`,
                reportError,
            );
        }

        await logAuditEvent(supabase, {
            correlationId,
            stage: "reconciliation_complete",
            timestamp: new Date().toISOString(),
            data: {
                ...reconciliationResults,
                finalReport,
                totalExecutionTimeMs: Date.now() - startTime,
            },
            executionTimeMs: Date.now() - startTime,
        });

        console.log(
            `[${correlationId}] Reconciliation completed:`,
            reconciliationResults,
        );

        return new Response(
            JSON.stringify({
                success: true,
                correlationId,
                executionTimeMs: Date.now() - startTime,
                options,
                results: reconciliationResults,
                finalReport,
                message: options.dryRun
                    ? "Dry run completed - no changes made"
                    : "Reconciliation completed successfully",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : String(error);
        const totalExecutionTime = Date.now() - startTime;

        console.error(`[${correlationId}] Reconciliation error:`, errorMessage);

        // Log error to audit trail if supabase client available
        if (supabase) {
            try {
                await logAuditEvent(supabase, {
                    correlationId,
                    stage: "reconciliation_error",
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
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});
