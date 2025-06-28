import { supabase } from "@/utils/supabase";

// Email attempt status types matching database enum
export type EmailAttemptStatus =
    | "initiated"
    | "function_invoked"
    | "function_failed"
    | "email_queued"
    | "email_sent"
    | "email_failed"
    | "email_delivered";

// Interface for logging email attempts
export interface EmailAttemptData {
    requestId?: string;
    emailType: string;
    functionName?: string;
    appComponent: string;
    attemptData?: Record<string, any>;
    responseData?: Record<string, any>;
    errorMessage?: string;
    emailTrackingId?: number;
}

/**
 * Log an email attempt to the database
 * @param status - The attempt status
 * @param data - The attempt data
 * @returns The attempt ID if successful, null if failed
 */
export async function logEmailAttempt(
    status: EmailAttemptStatus,
    data: EmailAttemptData,
): Promise<number | null> {
    try {
        console.log(`[EmailAttemptLogger] Logging ${status} attempt:`, {
            emailType: data.emailType,
            appComponent: data.appComponent,
            functionName: data.functionName,
            requestId: data.requestId,
        });

        const { data: result, error } = await supabase.rpc(
            "log_email_attempt",
            {
                p_request_id: data.requestId || null,
                p_email_type: data.emailType,
                p_attempt_status: status,
                p_function_name: data.functionName || null,
                p_app_component: data.appComponent,
                p_attempt_data: data.attemptData
                    ? JSON.stringify(data.attemptData)
                    : null,
                p_response_data: data.responseData
                    ? JSON.stringify(data.responseData)
                    : null,
                p_error_message: data.errorMessage || null,
                p_email_tracking_id: data.emailTrackingId || null,
            },
        );

        if (error) {
            console.error(
                "[EmailAttemptLogger] Error logging email attempt:",
                error,
            );
            return null;
        }

        console.log(
            `[EmailAttemptLogger] Successfully logged attempt with ID: ${result}`,
        );
        return result;
    } catch (error) {
        console.error(
            "[EmailAttemptLogger] Exception logging email attempt:",
            error,
        );
        return null;
    }
}

/**
 * Update an existing email attempt status
 * @param attemptId - The attempt ID to update
 * @param status - The new status
 * @param data - Additional data to update
 * @returns True if successful, false if failed
 */
export async function updateEmailAttempt(
    attemptId: number,
    status: EmailAttemptStatus,
    data?: {
        responseData?: Record<string, any>;
        errorMessage?: string;
        emailTrackingId?: number;
    },
): Promise<boolean> {
    try {
        console.log(
            `[EmailAttemptLogger] Updating attempt ${attemptId} to ${status}`,
        );

        const { data: result, error } = await supabase.rpc(
            "update_email_attempt",
            {
                p_attempt_id: attemptId,
                p_attempt_status: status,
                p_response_data: data?.responseData
                    ? JSON.stringify(data.responseData)
                    : null,
                p_error_message: data?.errorMessage || null,
                p_email_tracking_id: data?.emailTrackingId || null,
            },
        );

        if (error) {
            console.error(
                "[EmailAttemptLogger] Error updating email attempt:",
                error,
            );
            return false;
        }

        console.log(
            `[EmailAttemptLogger] Successfully updated attempt ${attemptId}`,
        );
        return result === true;
    } catch (error) {
        console.error(
            "[EmailAttemptLogger] Exception updating email attempt:",
            error,
        );
        return false;
    }
}

/**
 * Helper function to safely invoke an edge function with attempt logging
 * @param functionName - The edge function name
 * @param payload - The function payload
 * @param attemptData - The attempt logging data
 * @returns Object with success flag, response data, and attempt ID
 */
export async function invokeWithAttemptLogging(
    functionName: string,
    payload: Record<string, any>,
    attemptData: Omit<EmailAttemptData, "functionName">,
): Promise<{
    success: boolean;
    response?: any;
    error?: string;
    attemptId: number | null;
}> {
    // Log initial attempt
    const attemptId = await logEmailAttempt("initiated", {
        ...attemptData,
        functionName,
        attemptData: payload,
    });

    try {
        // Log function invocation
        if (attemptId) {
            await updateEmailAttempt(attemptId, "function_invoked");
        }

        // Invoke the edge function with attemptId
        const { data, error } = await supabase.functions.invoke(functionName, {
            body: {
                ...payload,
                attemptId: attemptId, // Pass attemptId to edge function
            },
        });

        if (error) {
            // Log function failure
            if (attemptId) {
                await updateEmailAttempt(attemptId, "function_failed", {
                    errorMessage: error.message || "Unknown function error",
                    responseData: { error: error },
                });
            }

            return {
                success: false,
                error: error.message || "Function invocation failed",
                attemptId,
            };
        }

        // Log successful function call - the edge function handles its own status updates
        // We don't update the status here to avoid overwriting the edge function's status updates
        console.log(
            `[EmailAttemptLogger] ${functionName} completed - edge function handles status update`,
        );

        return {
            success: true,
            response: data,
            attemptId,
        };
    } catch (exception: any) {
        // Log exception
        if (attemptId) {
            await updateEmailAttempt(attemptId, "function_failed", {
                errorMessage: exception.message ||
                    "Function invocation exception",
            });
        }

        return {
            success: false,
            error: exception.message || "Function invocation exception",
            attemptId,
        };
    }
}

/**
 * Enhanced edge function invocation with timeout and retry logic
 * @param functionName - The edge function name
 * @param payload - The function payload
 * @param attemptData - The attempt logging data
 * @param options - Additional options for timeout and retry
 * @returns Object with success flag, response data, and attempt ID
 */
export async function invokeWithRetryAndTimeout(
    functionName: string,
    payload: Record<string, any>,
    attemptData: Omit<EmailAttemptData, "functionName">,
    options: {
        timeoutMs?: number;
        maxRetries?: number;
        retryDelayMs?: number;
    } = {},
): Promise<{
    success: boolean;
    response?: any;
    error?: string;
    attemptId: number | null;
    retryCount: number;
    errorCategory: "network" | "timeout" | "validation" | "server" | "unknown";
}> {
    const { timeoutMs = 30000, maxRetries = 2, retryDelayMs = 1000 } = options;

    // Log initial attempt
    const attemptId = await logEmailAttempt("initiated", {
        ...attemptData,
        functionName,
        attemptData: { ...payload, options },
    });

    let lastError: string = "";
    let errorCategory:
        | "network"
        | "timeout"
        | "validation"
        | "server"
        | "unknown" = "unknown";

    for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
        try {
            console.log(
                `[EmailAttemptLogger] Attempt ${retryCount + 1}/${
                    maxRetries + 1
                } for ${functionName}`,
            );

            // Log function invocation for first attempt only
            if (retryCount === 0 && attemptId) {
                await updateEmailAttempt(attemptId, "function_invoked");
            }

            // Create timeout promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(
                    () =>
                        reject(
                            new Error(`Function timeout after ${timeoutMs}ms`),
                        ),
                    timeoutMs,
                );
            });

            // Invoke the edge function with attemptId and retry info
            const functionPromise = supabase.functions.invoke(functionName, {
                body: {
                    ...payload,
                    attemptId: attemptId,
                    retryCount,
                },
            });

            // Race between function and timeout
            const { data, error } = await Promise.race([
                functionPromise,
                timeoutPromise,
            ]);

            if (error) {
                // Categorize the error
                errorCategory = categorizeError(
                    error.message || error.toString(),
                );
                lastError = error.message || "Unknown function error";

                console.warn(
                    `[EmailAttemptLogger] Attempt ${retryCount + 1} failed:`,
                    error,
                );

                // If this is the last retry or error is not retryable, break
                if (
                    retryCount === maxRetries ||
                    !isRetryableError(errorCategory)
                ) {
                    if (attemptId) {
                        await updateEmailAttempt(attemptId, "function_failed", {
                            errorMessage: `Final failure after ${
                                retryCount + 1
                            } attempts: ${lastError}`,
                            responseData: {
                                error: error,
                                retryCount,
                                errorCategory,
                                finalAttempt: true,
                            },
                        });
                    }
                    break;
                }

                // Wait before retry (exponential backoff)
                const delay = retryDelayMs * Math.pow(2, retryCount);
                console.log(`[EmailAttemptLogger] Retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            // Success! Edge function handles its own status updates (email_sent/email_failed)
            // We don't update the status here to avoid overwriting the edge function's status
            console.log(
                `[EmailAttemptLogger] ${functionName} completed - edge function will handle status update`,
            );

            console.log(
                `[EmailAttemptLogger] ${functionName} succeeded after ${
                    retryCount + 1
                } attempts`,
            );

            return {
                success: true,
                response: data,
                attemptId,
                retryCount,
                errorCategory: "unknown",
            };
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : String(error);
            errorCategory = categorizeError(errorMessage);
            lastError = errorMessage;

            console.error(
                `[EmailAttemptLogger] Exception on attempt ${retryCount + 1}:`,
                error,
            );

            // If this is a timeout or the last retry, break
            if (
                errorMessage.includes("timeout") || retryCount === maxRetries ||
                !isRetryableError(errorCategory)
            ) {
                if (attemptId) {
                    await updateEmailAttempt(attemptId, "function_failed", {
                        errorMessage: `Exception after ${
                            retryCount + 1
                        } attempts: ${lastError}`,
                        responseData: {
                            error: errorMessage,
                            retryCount,
                            errorCategory,
                            finalAttempt: true,
                        },
                    });
                }
                break;
            }

            // Wait before retry
            const delay = retryDelayMs * Math.pow(2, retryCount);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    return {
        success: false,
        error: lastError,
        attemptId,
        retryCount: maxRetries,
        errorCategory,
    };
}

/**
 * Categorize error type for better handling
 */
function categorizeError(
    errorMessage: string,
): "network" | "timeout" | "validation" | "server" | "unknown" {
    const message = errorMessage.toLowerCase();

    if (message.includes("timeout") || message.includes("timed out")) {
        return "timeout";
    }

    if (
        message.includes("network") || message.includes("connection") ||
        message.includes("fetch")
    ) {
        return "network";
    }

    if (
        message.includes("invalid") || message.includes("missing") ||
        message.includes("required")
    ) {
        return "validation";
    }

    if (
        message.includes("500") || message.includes("internal") ||
        message.includes("server error")
    ) {
        return "server";
    }

    return "unknown";
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(
    category: "network" | "timeout" | "validation" | "server" | "unknown",
): boolean {
    // Validation errors are typically not retryable
    return category !== "validation";
}

/**
 * Enhanced structured error logging
 */
export async function logStructuredError(
    context: string,
    error: any,
    additionalData?: Record<string, any>,
): Promise<void> {
    try {
        const errorInfo = {
            context,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            userAgent: typeof navigator !== "undefined"
                ? navigator.userAgent
                : undefined,
            additionalData,
        };

        console.error(`[StructuredError] ${context}:`, errorInfo);

        // Could also send to external error tracking service here
        // await sendToErrorTrackingService(errorInfo);
    } catch (loggingError) {
        console.error(
            "[StructuredError] Failed to log structured error:",
            loggingError,
        );
    }
}
