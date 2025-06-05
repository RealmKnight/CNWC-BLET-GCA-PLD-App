import { supabase } from "./supabase";
import {
    sendDivisionEmailSettingsChangeNotification,
    sendEmailDeliveryFailureNotification,
    sendEmailDeliveryStatusNotification,
    sendRequestProcessingFailureNotification,
} from "./notificationTypes";
import { sendSystemAlertHybrid } from "./notificationService";

/**
 * Send fallback notifications to division admins when email delivery fails permanently
 */
export async function sendFallbackNotificationToDivisionAdmins(
    requestId: string,
    divisionId: number,
    failureDetails: {
        memberName: string;
        requestDate: string;
        leaveType: "PLD" | "SDV";
        emailType: "request" | "cancellation" | "notification";
        errorMessage: string;
    },
): Promise<boolean> {
    try {
        console.log(
            `[EmailNotificationHelpers] Sending fallback notifications for request ${requestId} to division ${divisionId}`,
        );

        // Get all division admins for this division
        const { data: divisionAdmins, error: adminsError } = await supabase
            .from("members")
            .select(`
                id,
                first_name,
                last_name,
                pin_number,
                user_preferences (
                    user_id
                )
            `)
            .eq("division_id", divisionId)
            .eq("role", "division_admin");

        if (adminsError) throw adminsError;

        if (!divisionAdmins || divisionAdmins.length === 0) {
            console.warn(
                `[EmailNotificationHelpers] No division admins found for division ${divisionId}`,
            );
            return false;
        }

        const title = "Email Delivery Failed - Manual Action Required";
        const body =
            `Failed to send ${failureDetails.emailType} email for ${failureDetails.memberName}'s ${failureDetails.leaveType} request on ${failureDetails.requestDate}. Please process manually. Error: ${failureDetails.errorMessage}`;

        let successCount = 0;
        const totalAdmins = divisionAdmins.length;

        // Send notifications to all division admins
        for (const admin of divisionAdmins) {
            try {
                if (
                    admin.user_preferences && admin.user_preferences.length > 0
                ) {
                    const userId = admin.user_preferences[0].user_id;

                    const success = await sendSystemAlertHybrid(
                        userId,
                        title,
                        body,
                        `fallback-${requestId}-${admin.id}`,
                    );

                    if (success) {
                        successCount++;
                        console.log(
                            `[EmailNotificationHelpers] Sent fallback notification to admin ${admin.pin_number}`,
                        );
                    } else {
                        console.error(
                            `[EmailNotificationHelpers] Failed to send fallback notification to admin ${admin.pin_number}`,
                        );
                    }
                }
            } catch (err) {
                console.error(
                    `[EmailNotificationHelpers] Error sending fallback notification to admin ${admin.pin_number}:`,
                    err,
                );
            }
        }

        // Record the fallback attempt in the database
        await supabase
            .from("email_tracking")
            .update({
                fallback_notification_sent: true,
                last_updated_at: new Date().toISOString(),
            })
            .eq("request_id", requestId);

        console.log(
            `[EmailNotificationHelpers] Sent fallback notifications to ${successCount}/${totalAdmins} division admins`,
        );
        return successCount > 0;
    } catch (error) {
        console.error(
            "[EmailNotificationHelpers] Error sending fallback notifications:",
            error,
        );
        return false;
    }
}

/**
 * Notify company admins about email delivery failures
 */
export async function notifyCompanyAdminsOfEmailFailure(
    requestId: string,
    failureDetails: {
        requestDate: string;
        memberName: string;
        leaveType: "PLD" | "SDV";
        emailType: "request" | "cancellation" | "notification";
        recipientEmail: string;
        errorMessage: string;
        retryCount: number;
        isPermanentFailure: boolean;
    },
): Promise<void> {
    try {
        console.log(
            `[EmailNotificationHelpers] Notifying company admins of email failure for request ${requestId}`,
        );

        // Get all company admins
        const { data: companyAdmins, error: adminsError } = await supabase
            .from("members")
            .select(`
                id,
                first_name,
                last_name,
                pin_number,
                user_preferences (
                    user_id
                )
            `)
            .eq("role", "company_admin");

        if (adminsError) throw adminsError;

        if (!companyAdmins || companyAdmins.length === 0) {
            console.warn("[EmailNotificationHelpers] No company admins found");
            return;
        }

        // Send notifications to all company admins
        for (const admin of companyAdmins) {
            try {
                if (
                    admin.user_preferences && admin.user_preferences.length > 0
                ) {
                    const userId = admin.user_preferences[0].user_id;

                    await sendEmailDeliveryFailureNotification(userId, {
                        requestId,
                        emailType: failureDetails.emailType,
                        recipientEmail: failureDetails.recipientEmail,
                        errorMessage: failureDetails.errorMessage,
                        retryCount: failureDetails.retryCount,
                    });

                    console.log(
                        `[EmailNotificationHelpers] Sent failure notification to company admin ${admin.pin_number}`,
                    );
                }
            } catch (err) {
                console.error(
                    `[EmailNotificationHelpers] Error sending failure notification to company admin ${admin.pin_number}:`,
                    err,
                );
            }
        }
    } catch (error) {
        console.error(
            "[EmailNotificationHelpers] Error notifying company admins:",
            error,
        );
    }
}

/**
 * Notify division admins when their email settings are changed
 */
export async function notifyDivisionAdminsOfEmailSettingsChange(
    divisionId: number,
    changeDetails: {
        changeType: "add" | "update" | "remove" | "toggle";
        adminName: string;
        emailsAffected: string[];
    },
): Promise<void> {
    try {
        console.log(
            `[EmailNotificationHelpers] Notifying division admins of email settings change for division ${divisionId}`,
        );

        // Get division info
        const { data: division, error: divisionError } = await supabase
            .from("divisions")
            .select("name")
            .eq("id", divisionId)
            .single();

        if (divisionError) throw divisionError;

        // Get all division admins for this division
        const { data: divisionAdmins, error: adminsError } = await supabase
            .from("members")
            .select(`
                id,
                first_name,
                last_name,
                pin_number,
                user_preferences (
                    user_id
                )
            `)
            .eq("division_id", divisionId)
            .eq("role", "division_admin");

        if (adminsError) throw adminsError;

        if (!divisionAdmins || divisionAdmins.length === 0) {
            console.warn(
                `[EmailNotificationHelpers] No division admins found for division ${divisionId}`,
            );
            return;
        }

        // Send notifications to all division admins
        for (const admin of divisionAdmins) {
            try {
                if (
                    admin.user_preferences && admin.user_preferences.length > 0
                ) {
                    const userId = admin.user_preferences[0].user_id;

                    await sendDivisionEmailSettingsChangeNotification(userId, {
                        divisionName: division.name,
                        divisionId: divisionId.toString(),
                        changeType: changeDetails.changeType,
                        adminName: changeDetails.adminName,
                        emailsAffected: changeDetails.emailsAffected,
                    });

                    console.log(
                        `[EmailNotificationHelpers] Sent settings change notification to division admin ${admin.pin_number}`,
                    );
                }
            } catch (err) {
                console.error(
                    `[EmailNotificationHelpers] Error sending settings change notification to division admin ${admin.pin_number}:`,
                    err,
                );
            }
        }
    } catch (error) {
        console.error(
            "[EmailNotificationHelpers] Error notifying division admins of email settings change:",
            error,
        );
    }
}

/**
 * Check email delivery status and send appropriate notifications
 */
export async function processEmailDeliveryStatusUpdate(
    trackingId: number,
    newStatus:
        | "delivered"
        | "opened"
        | "clicked"
        | "bounced"
        | "complained"
        | "failed",
    errorMessage?: string,
): Promise<void> {
    try {
        console.log(
            `[EmailNotificationHelpers] Processing email delivery status update for tracking ID ${trackingId}: ${newStatus}`,
        );

        // Get the email tracking record with request details
        const { data: trackingRecord, error: trackingError } = await supabase
            .from("email_tracking")
            .select(`
                *,
                request:pld_sdv_requests (
                    id,
                    request_date,
                    leave_type,
                    member:members (
                        first_name,
                        last_name,
                        pin_number,
                        division_id
                    )
                )
            `)
            .eq("id", trackingId)
            .single();

        if (trackingError) throw trackingError;

        const isFailureStatus = ["bounced", "complained", "failed"].includes(
            newStatus,
        );

        // If this is a permanent failure, send fallback notifications
        if (
            isFailureStatus && trackingRecord.retry_count >= 3 &&
            !trackingRecord.fallback_notification_sent
        ) {
            if (trackingRecord.request?.member?.division_id) {
                await sendFallbackNotificationToDivisionAdmins(
                    trackingRecord.request_id,
                    trackingRecord.request.member.division_id,
                    {
                        memberName:
                            `${trackingRecord.request.member.first_name} ${trackingRecord.request.member.last_name}`,
                        requestDate: trackingRecord.request.request_date,
                        leaveType: trackingRecord.request.leave_type,
                        emailType: trackingRecord.email_type,
                        errorMessage: errorMessage ||
                            "Email delivery failed permanently",
                    },
                );
            }

            // Notify company admins of the failure
            await notifyCompanyAdminsOfEmailFailure(
                trackingRecord.request_id,
                {
                    requestDate: trackingRecord.request?.request_date ||
                        "Unknown",
                    memberName: trackingRecord.request?.member
                        ? `${trackingRecord.request.member.first_name} ${trackingRecord.request.member.last_name}`
                        : "Unknown Member",
                    leaveType: trackingRecord.request?.leave_type || "PLD",
                    emailType: trackingRecord.email_type,
                    recipientEmail: trackingRecord.recipient,
                    errorMessage: errorMessage ||
                        "Email delivery failed permanently",
                    retryCount: trackingRecord.retry_count,
                    isPermanentFailure: true,
                },
            );
        }

        // For positive delivery statuses, optionally notify admins (can be configured)
        if (["delivered", "opened", "clicked"].includes(newStatus)) {
            // This could be made configurable per division or admin preference
            // For now, we'll just log successful deliveries
            console.log(
                `[EmailNotificationHelpers] Email successfully ${newStatus}: ${trackingRecord.subject} to ${trackingRecord.recipient}`,
            );
        }
    } catch (error) {
        console.error(
            "[EmailNotificationHelpers] Error processing email delivery status update:",
            error,
        );
    }
}

/**
 * Get notification preferences for a user regarding email-related alerts
 */
export async function getUserEmailNotificationPreferences(
    userId: string,
): Promise<{
    emailFailures: boolean;
    emailSettings: boolean;
    emailStatus: boolean;
}> {
    try {
        const { data: preferences, error } = await supabase
            .from("user_notification_preferences")
            .select("*")
            .eq("user_id", userId);

        if (error) throw error;

        // Default preferences if none exist
        const defaultPrefs = {
            emailFailures: true,
            emailSettings: true,
            emailStatus: false, // Don't spam with delivery status by default
        };

        if (!preferences || preferences.length === 0) {
            return defaultPrefs;
        }

        // Extract email-related preferences from the user's settings
        // This assumes the preferences table has email-related fields
        // You may need to adjust based on your actual schema
        return {
            emailFailures: preferences.find((p) =>
                p.category_code === "email_failures"
            )?.enabled ?? defaultPrefs.emailFailures,
            emailSettings: preferences.find((p) =>
                p.category_code === "email_settings"
            )?.enabled ?? defaultPrefs.emailSettings,
            emailStatus: preferences.find((p) =>
                p.category_code === "email_status"
            )?.enabled ?? defaultPrefs.emailStatus,
        };
    } catch (error) {
        console.error(
            "[EmailNotificationHelpers] Error getting email notification preferences:",
            error,
        );
        // Return defaults on error
        return {
            emailFailures: true,
            emailSettings: true,
            emailStatus: false,
        };
    }
}
