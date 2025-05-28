/**
 * Utility functions for handling Realtime subscription errors,
 * specifically filtering out Cloudflare cookie warnings that are non-critical
 */

export interface RealtimeErrorResult {
    shouldRetry: boolean;
    isFatal: boolean;
    isCloudflareWarning: boolean;
}

/**
 * Checks if an error is related to Cloudflare cookie issues
 */
export const isCloudflareError = (error: any): boolean => {
    if (!error) return false;

    const errorMessage = error?.message || error?.toString() || "";
    return errorMessage.includes("__cf_bm") ||
        errorMessage.includes("invalid domain") ||
        (errorMessage.includes("Cookie") &&
            errorMessage.includes("rejected")) ||
        errorMessage.includes("cf_bm");
};

/**
 * Handles Realtime subscription errors with appropriate logging and response
 */
export const handleRealtimeError = (
    status: string,
    error: any,
    context: string,
): RealtimeErrorResult => {
    if (isCloudflareError(error)) {
        console.warn(
            `[${context}] Cloudflare cookie warning (non-critical): ${
                error?.message || "Unknown cookie issue"
            }`,
        );
        return {
            shouldRetry: false,
            isFatal: false,
            isCloudflareWarning: true,
        };
    }

    // Handle other subscription errors
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || error) {
        console.error(`[${context}] Realtime error:`, status, error);
        return {
            shouldRetry: true,
            isFatal: true,
            isCloudflareWarning: false,
        };
    }

    // Normal status updates
    console.log(`[${context}] Realtime status: ${status}`);
    return {
        shouldRetry: false,
        isFatal: false,
        isCloudflareWarning: false,
    };
};

/**
 * Enhanced subscription callback that filters Cloudflare warnings
 */
export const createRealtimeCallback = (
    context: string,
    onError?: (status: string, error: any) => void,
    onSuccess?: (status: string) => void,
) => {
    return (status: string, error?: any) => {
        const result = handleRealtimeError(status, error, context);

        if (result.isCloudflareWarning) {
            // Don't propagate Cloudflare warnings as errors
            return;
        }

        if (result.isFatal && onError) {
            onError(status, error);
        } else if (status === "SUBSCRIBED" && onSuccess) {
            onSuccess(status);
        }
    };
};
