// Import from central notification types location to prevent circular dependencies
import {
    getCategoryCodeFromType,
    getImportanceFromType,
    NotificationPayload,
    NotificationType,
} from "@/types/notifications";

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
        `${divisionName} Announcement`,
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
    const timeframeText = timeframe === "hour"
        ? "in 1 hour"
        : timeframe === "day"
        ? "tomorrow"
        : "next week";

    return sendTypedPushNotification(
        userId,
        `Meeting Reminder - ${divisionName}`,
        `Meeting ${timeframeText}: ${meeting.title || "Division Meeting"}`,
        NotificationType.MEETING_REMINDER,
        meeting.id,
        {
            divisionName,
            divisionId,
            meetingId: meeting.id,
            shouldBadge: true,
        },
    );
}

// Internal function for sending push notifications
async function sendPushNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data: any,
) {
    try {
        // This function should be imported from notificationService
        // but we need to avoid circular imports, so we'll keep it simple for now
        // or use parameter injection pattern
        console.log(`[NotificationTypes] Would send push to user ${userId}:`, {
            title,
            body,
            data,
        });
        return true;
    } catch (error) {
        console.error(
            "[NotificationTypes] Error sending push notification:",
            error,
        );
        return false;
    }
}

// Email-related notification functions
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
    return sendTypedPushNotification(
        userId,
        "Email Delivery Failed",
        `Failed to send ${failureDetails.emailType} email to ${failureDetails.recipientEmail}`,
        NotificationType.SYSTEM_ALERT,
        `email_failure_${failureDetails.requestId}`,
        {
            emailFailureDetails: failureDetails,
            requiresAcknowledgment: true,
            shouldBadge: true,
        },
    );
}

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
    const actionText = {
        add: "added",
        update: "updated",
        remove: "removed",
        toggle: "toggled",
    }[changeDetails.changeType];

    return sendTypedPushNotification(
        userId,
        "Email Settings Changed",
        `${changeDetails.adminName} ${actionText} email settings for ${changeDetails.divisionName}`,
        NotificationType.ADMIN_MESSAGE,
        `email_settings_${changeDetails.divisionId}_${Date.now()}`,
        {
            emailSettingsChange: changeDetails,
            divisionName: changeDetails.divisionName,
            divisionId: changeDetails.divisionId,
            shouldBadge: true,
        },
    );
}

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
    return sendTypedPushNotification(
        userId,
        "Email Status Update",
        `Email ${statusDetails.emailType} for ${statusDetails.memberName} was ${statusDetails.status}`,
        NotificationType.REGULAR_MESSAGE,
        `email_status_${statusDetails.requestId}`,
        {
            emailStatusDetails: statusDetails,
            shouldBadge: false, // Status updates don't need badges
        },
    );
}

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
    const message = requestDetails.allEmailsFailedPermanently
        ? `All email attempts failed for ${requestDetails.memberName}'s ${requestDetails.leaveType} request on ${requestDetails.requestDate}`
        : `Processing issues with ${requestDetails.memberName}'s ${requestDetails.leaveType} request`;

    return sendTypedPushNotification(
        userId,
        "Request Processing Issue",
        message,
        NotificationType.SYSTEM_ALERT,
        `request_failure_${requestDetails.requestId}`,
        {
            requestFailureDetails: requestDetails,
            requiresAcknowledgment: true,
            shouldBadge: true,
        },
    );
}
