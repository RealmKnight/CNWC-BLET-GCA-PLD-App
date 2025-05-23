import { NotificationType } from "./notificationConfig";

/**
 * Standardized notification payload structure
 * Used for all push notifications to ensure consistent data format
 */
export interface NotificationPayload {
    // Core identifiers
    messageId: string;
    notificationType: NotificationType;

    // Content
    title: string;
    body: string;

    // Metadata
    timestamp: number;
    categoryCode: string;
    importance: "high" | "medium" | "low";

    // Behavior flags
    requiresAcknowledgment?: boolean;
    shouldBadge?: boolean;

    // Navigation data
    divisionName?: string; // For division-specific notifications - use name not ID
    divisionId?: string;
    meetingId?: string;

    // Grouping
    groupKey?: string;
    groupSummary?: string;

    // Email-related notification data
    emailFailureDetails?: {
        requestId: string;
        emailType: "request" | "cancellation" | "notification";
        recipientEmail: string;
        errorMessage: string;
        retryCount: number;
    };
    emailSettingsChange?: {
        divisionName: string;
        divisionId: string;
        changeType: "add" | "update" | "remove" | "toggle";
        adminName: string;
        emailsAffected: string[];
    };
    emailStatusDetails?: {
        requestId: string;
        memberName: string;
        emailType: "request" | "cancellation" | "notification";
        status: "delivered" | "opened" | "clicked" | "bounced" | "complained";
        timestamp: string;
    };
    requestFailureDetails?: {
        requestId: string;
        memberName: string;
        requestDate: string;
        leaveType: "PLD" | "SDV";
        allEmailsFailedPermanently: boolean;
        fallbackSent: boolean;
    };
}

/**
 * Send a typed push notification with the appropriate metadata
 * Ensures consistent payload structure across different notification types
 */
export async function sendTypedPushNotification(
    userId: string,
    title: string,
    body: string,
    type: NotificationType,
    messageId: string,
    additionalData: Partial<NotificationPayload> = {},
) {
    // Determine category code and importance based on notification type
    const categoryCode = getCategoryCodeFromType(type);
    const importance = getImportanceFromType(
        type,
        additionalData.requiresAcknowledgment,
    );

    // Combine data into standardized payload
    const data: NotificationPayload = {
        messageId,
        notificationType: type,
        title,
        body,
        timestamp: Date.now(),
        categoryCode,
        importance,
        ...additionalData,
    };

    return await sendPushNotificationToUser(userId, title, body, data);
}

/**
 * Map notification types to category codes
 */
function getCategoryCodeFromType(type: NotificationType): string {
    switch (type) {
        case NotificationType.ADMIN_MESSAGE:
            return "admin_message";
        case NotificationType.GCA_ANNOUNCEMENT:
            return "gca_announcement";
        case NotificationType.DIVISION_ANNOUNCEMENT:
            return "division_announcement";
        case NotificationType.SYSTEM_ALERT:
            return "system_alert";
        case NotificationType.MUST_READ:
            return "must_read";
        case NotificationType.MEETING_REMINDER:
            return "meeting_reminder";
        case NotificationType.REGULAR_MESSAGE:
        default:
            return "general_message";
    }
}

/**
 * Determine notification importance based on type and acknowledgment requirement
 */
function getImportanceFromType(
    type: NotificationType,
    requiresAcknowledgment?: boolean,
): "high" | "medium" | "low" {
    // If requires acknowledgment, always high importance
    if (requiresAcknowledgment) return "high";

    switch (type) {
        case NotificationType.SYSTEM_ALERT:
        case NotificationType.MUST_READ:
        case NotificationType.ADMIN_MESSAGE:
            return "high";
        case NotificationType.GCA_ANNOUNCEMENT:
        case NotificationType.DIVISION_ANNOUNCEMENT:
        case NotificationType.MEETING_REMINDER:
            return "medium";
        case NotificationType.REGULAR_MESSAGE:
        default:
            return "low";
    }
}

/**
 * Type-specific notification sending functions
 */

// Regular messages
export async function sendMessageNotification(userId: string, message: any) {
    return sendTypedPushNotification(
        userId,
        "New Message",
        message.subject || "You have a new message",
        NotificationType.REGULAR_MESSAGE,
        message.id,
        {
            requiresAcknowledgment: message.requiresAcknowledgment,
            shouldBadge: true,
        },
    );
}

// Admin messages
export async function sendAdminMessageNotification(
    userId: string,
    message: any,
) {
    return sendTypedPushNotification(
        userId,
        "Admin Message",
        message.subject || "You have a new admin message",
        NotificationType.ADMIN_MESSAGE,
        message.id,
        {
            requiresAcknowledgment: true,
            shouldBadge: true,
        },
    );
}

// GCA announcements
export async function sendGCAAnnouncementNotification(
    userId: string,
    announcement: any,
) {
    return sendTypedPushNotification(
        userId,
        "GCA Announcement",
        announcement.title || "New GCA Announcement",
        NotificationType.GCA_ANNOUNCEMENT,
        announcement.id,
        {
            shouldBadge: true,
        },
    );
}

// Division announcements
export async function sendDivisionAnnouncementNotification(
    userId: string,
    announcement: any,
    divisionName: string,
    divisionId: string,
) {
    return sendTypedPushNotification(
        userId,
        "Division Announcement",
        announcement.title || "New Division Announcement",
        NotificationType.DIVISION_ANNOUNCEMENT,
        announcement.id,
        {
            divisionName,
            divisionId,
            shouldBadge: true,
        },
    );
}

// Meeting reminders
export async function sendMeetingReminderNotification(
    userId: string,
    meeting: any,
    divisionName: string,
    divisionId: string,
    timeframe: "week" | "day" | "hour",
) {
    let title, body;

    switch (timeframe) {
        case "week":
            title = "Meeting Next Week";
            body = `${divisionName} meeting scheduled in one week`;
            break;
        case "day":
            title = "Meeting Tomorrow";
            body = `${divisionName} meeting scheduled for tomorrow`;
            break;
        case "hour":
            title = "Meeting Soon";
            body = `${divisionName} meeting starting in one hour`;
            break;
    }

    return sendTypedPushNotification(
        userId,
        title,
        body,
        NotificationType.MEETING_REMINDER,
        meeting.id,
        {
            divisionName,
            divisionId,
            meetingId: meeting.id,
            importance: timeframe === "hour" ? "high" : "medium",
        },
    );
}

// This is a placeholder - you'll need to implement this function or use your existing one
async function sendPushNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data: any,
) {
    // Implementation would use your existing push notification service
    console.log(`Sending push notification to ${userId} with title: ${title}`);
    // This would call your actual implementation
    return true;
}

/**
 * Email delivery failure notifications
 */
export async function sendEmailDeliveryFailureNotification(
    userId: string,
    failureDetails: {
        requestId: string;
        emailType: "request" | "cancellation" | "notification";
        recipientEmail: string;
        errorMessage: string;
        retryCount: number;
    },
) {
    const title = "Email Delivery Failed";
    const body =
        `Failed to send ${failureDetails.emailType} email to ${failureDetails.recipientEmail}. Error: ${failureDetails.errorMessage}`;

    return sendTypedPushNotification(
        userId,
        title,
        body,
        NotificationType.SYSTEM_ALERT,
        `email-failure-${failureDetails.requestId}-${Date.now()}`,
        {
            requiresAcknowledgment: true,
            shouldBadge: true,
            emailFailureDetails: failureDetails,
        },
    );
}

/**
 * Division email settings change notifications
 */
export async function sendDivisionEmailSettingsChangeNotification(
    userId: string,
    changeDetails: {
        divisionName: string;
        divisionId: string;
        changeType: "add" | "update" | "remove" | "toggle";
        adminName: string;
        emailsAffected: string[];
    },
) {
    const title = "Division Email Settings Changed";
    let body =
        `${changeDetails.adminName} ${changeDetails.changeType}d email settings for ${changeDetails.divisionName} division`;

    if (changeDetails.emailsAffected.length > 0) {
        body += `. Emails affected: ${changeDetails.emailsAffected.join(", ")}`;
    }

    return sendTypedPushNotification(
        userId,
        title,
        body,
        NotificationType.SYSTEM_ALERT,
        `email-settings-${changeDetails.divisionId}-${Date.now()}`,
        {
            requiresAcknowledgment: false,
            shouldBadge: true,
            divisionName: changeDetails.divisionName,
            divisionId: changeDetails.divisionId,
            emailSettingsChange: changeDetails,
        },
    );
}

/**
 * Email delivery status notifications (for admins)
 */
export async function sendEmailDeliveryStatusNotification(
    userId: string,
    statusDetails: {
        requestId: string;
        memberName: string;
        emailType: "request" | "cancellation" | "notification";
        status: "delivered" | "opened" | "clicked" | "bounced" | "complained";
        timestamp: string;
    },
) {
    const title = "Email Delivery Update";
    const body =
        `${statusDetails.emailType} email for ${statusDetails.memberName} was ${statusDetails.status}`;

    return sendTypedPushNotification(
        userId,
        title,
        body,
        NotificationType.SYSTEM_ALERT,
        `email-status-${statusDetails.requestId}-${Date.now()}`,
        {
            requiresAcknowledgment: false,
            shouldBadge: false, // Don't badge for status updates
            emailStatusDetails: statusDetails,
        },
    );
}

/**
 * Request processing email failure with fallback
 */
export async function sendRequestProcessingFailureNotification(
    userId: string,
    requestDetails: {
        requestId: string;
        memberName: string;
        requestDate: string;
        leaveType: "PLD" | "SDV";
        allEmailsFailedPermanently: boolean;
        fallbackSent: boolean;
    },
) {
    const title = "Request Processing Email Failed";
    let body =
        `Unable to send ${requestDetails.leaveType} request email for ${requestDetails.memberName} (${requestDetails.requestDate})`;

    if (requestDetails.allEmailsFailedPermanently) {
        body += ". All email delivery attempts have failed permanently.";
        if (requestDetails.fallbackSent) {
            body += " Fallback notification has been sent to division admins.";
        }
    } else {
        body += ". Retry attempts are ongoing.";
    }

    return sendTypedPushNotification(
        userId,
        title,
        body,
        NotificationType.SYSTEM_ALERT,
        `request-failure-${requestDetails.requestId}-${Date.now()}`,
        {
            requiresAcknowledgment: requestDetails.allEmailsFailedPermanently,
            shouldBadge: true,
            requestFailureDetails: requestDetails,
        },
    );
}
