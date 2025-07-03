import { invokeWithRetryAndTimeout } from "@/utils/emailAttemptLogger";

/**
 * Sends “new time-off request” email to the company **only** when the
 * request is *not* wait-listed.
 *
 * @param requestId UUID of the pld_sdv_requests row
 * @param status    Current request status – returned from the INSERT trigger
 * @param attemptData Optional metadata forwarded to invokeWithRetryAndTimeout
 * @returns true when the email was attempted *and* succeeded; false otherwise.
 */
export async function sendRequestEmailIfEligible(
    requestId: string,
    status: "pending" | "approved" | "waitlisted" | "cancellation_pending",
    attemptData: Record<string, any> = {},
): Promise<boolean> {
    if (status === "waitlisted") {
        console.log(
            `[emailHelpers] Skipping company email for wait-listed request ${requestId}`,
        );
        return false;
    }

    const result = await invokeWithRetryAndTimeout(
        "send-request-email",
        { requestId },
        {
            requestId,
            emailType: "request",
            appComponent: attemptData?.appComponent ?? "unknown",
            attemptData,
        },
    );

    if (!result.success) {
        console.error(
            `[emailHelpers] send-request-email failed for ${requestId}:`,
            result.error,
        );
    }

    return result.success;
}
