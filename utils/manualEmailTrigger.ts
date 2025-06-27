import { supabase } from "./supabase";
import { logEmailAttempt, updateEmailAttempt } from "./emailAttemptLogger";

export interface ManualEmailTriggerOptions {
    requestId: string;
    emailType:
        | "request"
        | "cancellation"
        | "payment_request"
        | "payment_cancellation";
    forceRetry?: boolean; // Bypass normal validation checks
    source?: string; // Source of the manual trigger (e.g., "admin_dashboard", "reconciliation")
    notes?: string; // Admin notes for why email was manually triggered
}

export interface ManualEmailResult {
    success: boolean;
    message: string;
    emailTrackingId?: number;
    attemptLogId?: number;
    error?: string;
    validationErrors?: string[];
}

export async function manuallyTriggerEmail(
    options: ManualEmailTriggerOptions,
): Promise<ManualEmailResult> {
    const {
        requestId,
        emailType,
        forceRetry = false,
        source = "manual",
        notes,
    } = options;

    try {
        // Step 1: Validate the request exists and is in appropriate state
        const validationResult = await validateEmailEligibility(
            requestId,
            emailType,
            forceRetry,
        );
        if (!validationResult.isValid) {
            return {
                success: false,
                message: "Request validation failed",
                validationErrors: validationResult.errors,
            };
        }

        // Step 2: Log the manual attempt
        const attemptLogId = await logEmailAttempt("initiated", {
            requestId,
            emailType,
            appComponent: "manual_trigger",
            attemptData: {
                manualTrigger: true,
                triggeredBy: source,
                notes,
                originalRequestData: validationResult.requestData,
            },
        });

        // Step 3: Determine the correct edge function to call
        const functionName = determineFunctionName(emailType);

        // Step 4: Invoke the edge function
        const startTime = Date.now();
        const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
                requestId,
                manualTrigger: true,
                triggeredBy: source,
                notes,
                attemptLogId,
            },
        });

        const executionTime = Date.now() - startTime;

        if (error) {
            // Update attempt log with failure
            if (attemptLogId) {
                await updateEmailAttempt(attemptLogId, "function_failed", {
                    errorMessage: error.message,
                    responseData: { error: error },
                });
            }

            return {
                success: false,
                message: `Email function failed: ${error.message}`,
                attemptLogId: attemptLogId ?? undefined,
                error: error.message,
            };
        }

        // Update attempt log with success
        if (attemptLogId) {
            await updateEmailAttempt(attemptLogId, "function_invoked", {
                responseData: data,
            });
        }

        return {
            success: true,
            message:
                `Email ${emailType} successfully triggered for request ${requestId}`,
            attemptLogId: attemptLogId ?? undefined,
            emailTrackingId: data?.emailTrackingId,
        };
    } catch (error) {
        const errorMessage = error instanceof Error
            ? error.message
            : String(error);

        return {
            success: false,
            message: `Unexpected error: ${errorMessage}`,
            error: errorMessage,
        };
    }
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    requestData?: any;
}

async function validateEmailEligibility(
    requestId: string,
    emailType: string,
    forceRetry: boolean,
): Promise<ValidationResult> {
    const errors: string[] = [];

    try {
        // Check if request exists
        const { data: requestData, error: requestError } = await supabase
            .from("pld_sdv_requests")
            .select(`
        *,
        members:member_id (
          first_name,
          last_name,
          email,
          pin_number,
          division_id,
          divisions:division_id (name)
        )
      `)
            .eq("id", requestId)
            .single();

        if (requestError || !requestData) {
            errors.push(`Request ${requestId} not found`);
            return { isValid: false, errors };
        }

        // Check if member has email
        if (!requestData.members?.email) {
            errors.push("Member does not have an email address");
        }

        // Validate email type matches request status
        if (!forceRetry) {
            const statusValidation = validateStatusForEmailType(
                requestData.status,
                emailType,
            );
            if (!statusValidation.isValid) {
                errors.push(
                    statusValidation.error || "Status validation failed",
                );
            }
        }

        // Check for existing successful emails (unless force retry)
        if (!forceRetry) {
            const { data: existingEmails, error: emailError } = await supabase
                .from("email_tracking")
                .select("*")
                .eq("request_id", requestId)
                .eq("email_type", emailType)
                .eq("status", "sent");

            if (emailError) {
                errors.push(
                    `Failed to check existing emails: ${emailError.message}`,
                );
            } else if (existingEmails && existingEmails.length > 0) {
                errors.push(
                    `Email of type '${emailType}' already sent successfully for this request`,
                );
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            requestData,
        };
    } catch (error) {
        errors.push(
            `Validation error: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return { isValid: false, errors };
    }
}

function validateStatusForEmailType(
    status: string,
    emailType: string,
): { isValid: boolean; error?: string } {
    const validCombinations: Record<string, string[]> = {
        "request": ["submitted", "pending", "approved", "cancellation_pending"],
        "cancellation": ["cancellation_pending", "cancelled"],
        "payment_request": ["submitted", "pending", "approved"],
        "payment_cancellation": ["cancellation_pending", "cancelled"],
    };

    const validStatuses = validCombinations[emailType];
    if (!validStatuses) {
        return { isValid: false, error: `Unknown email type: ${emailType}` };
    }

    if (!validStatuses.includes(status)) {
        return {
            isValid: false,
            error:
                `Request status '${status}' is not valid for email type '${emailType}'. Valid statuses: ${
                    validStatuses.join(", ")
                }`,
        };
    }

    return { isValid: true };
}

function determineFunctionName(emailType: string): string {
    switch (emailType) {
        case "request":
        case "payment_request":
            return "send-request-email";
        case "cancellation":
        case "payment_cancellation":
            return "send-cancellation-email";
        default:
            throw new Error(`Unknown email type: ${emailType}`);
    }
}

// Helper function to manually trigger emails for multiple requests
export async function batchTriggerEmails(
    requests: Array<
        { requestId: string; emailType: ManualEmailTriggerOptions["emailType"] }
    >,
    options: {
        source?: string;
        notes?: string;
        forceRetry?: boolean;
        batchSize?: number;
        delayBetweenBatches?: number;
    } = {},
): Promise<
    Array<ManualEmailResult & { requestId: string; emailType: string }>
> {
    const {
        source = "batch_trigger",
        notes,
        forceRetry = false,
        batchSize = 5,
        delayBetweenBatches = 1000,
    } = options;
    const results: Array<
        ManualEmailResult & { requestId: string; emailType: string }
    > = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);

        const batchPromises = batch.map(async ({ requestId, emailType }) => {
            const result = await manuallyTriggerEmail({
                requestId,
                emailType,
                source,
                notes,
                forceRetry,
            });

            return {
                ...result,
                requestId,
                emailType,
            };
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add delay between batches (except for the last batch)
        if (i + batchSize < requests.length && delayBetweenBatches > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, delayBetweenBatches)
            );
        }
    }

    return results;
}

// Helper function to get reconciliation candidates for manual triggering
export async function getManualTriggerCandidates(): Promise<{
    missingCancellations: Array<
        {
            requestId: string;
            memberName: string;
            leaveType: string;
            requestDate: string;
        }
    >;
    failedAttempts: Array<
        {
            requestId: string;
            emailType: string;
            memberName: string;
            errorMessage: string;
            lastAttempt: string;
        }
    >;
}> {
    try {
        // Get missing cancellation emails
        const { data: missingCancellations, error: missingError } =
            await supabase
                .from("missing_cancellation_emails")
                .select("*")
                .limit(50);

        if (missingError) {
            console.error(
                "Error fetching missing cancellations:",
                missingError,
            );
        }

        // Get failed email attempts
        const { data: failedAttempts, error: failedError } = await supabase
            .from("failed_email_requests")
            .select("*")
            .limit(50);

        if (failedError) {
            console.error("Error fetching failed attempts:", failedError);
        }

        return {
            missingCancellations: (missingCancellations || []).map((item) => ({
                requestId: item.id,
                memberName: `${item.first_name} ${item.last_name}`,
                leaveType: item.leave_type,
                requestDate: item.request_date,
            })),
            failedAttempts: (failedAttempts || []).map((item) => ({
                requestId: item.id,
                emailType: item.email_type,
                memberName: `${item.first_name} ${item.last_name}`,
                errorMessage: item.error_message,
                lastAttempt: item.attempted_at,
            })),
        };
    } catch (error) {
        console.error("Error getting manual trigger candidates:", error);
        return {
            missingCancellations: [],
            failedAttempts: [],
        };
    }
}
