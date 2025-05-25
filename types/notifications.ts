/**
 * Central Notification Types and Interfaces
 *
 * This file contains ALL notification-related types and interfaces to prevent
 * circular dependencies between notificationConfig, notificationService, and notificationTypes.
 *
 * All notification-related files should import from this central location.
 */

// Define notification types enum (extracted from notificationConfig.ts)
export enum NotificationType {
    REGULAR_MESSAGE = "regular_message",
    ADMIN_MESSAGE = "admin_message",
    GCA_ANNOUNCEMENT = "gca_announcement",
    DIVISION_ANNOUNCEMENT = "division_announcement",
    SYSTEM_ALERT = "system_alert",
    MUST_READ = "must_read",
    MEETING_REMINDER = "meeting_reminder",
    // PLD/SDV Request Status Notifications
    REQUEST_APPROVED = "request_approved",
    REQUEST_DENIED = "request_denied",
    REQUEST_CANCELLED = "request_cancelled",
    REQUEST_WAITLISTED = "request_waitlisted",
}

// Define notification category priorities (extracted from notificationConfig.ts)
export const NOTIFICATION_PRIORITIES = {
    system_alert: 100, // Highest priority
    must_read: 90,
    admin_message: 80,
    gca_announcement: 70,
    division_announcement: 60,
    request_status: 55, // PLD/SDV request status updates
    status_update: 50,
    meeting_reminder: 45, // Add meeting reminders with medium-high priority
    roster_change: 40,
    general_message: 30, // Lowest priority
};

// Shared interfaces for notification system
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

// Additional interfaces that might be shared across notification files
export interface NotificationConfig {
    categoryCode: string;
    notificationType: NotificationType;
    importance: "high" | "medium" | "low";
    requiresAcknowledgment: boolean;
    shouldBadge: boolean;
}

export interface NotificationDeliveryAttempt {
    method: "push" | "email" | "text" | "in_app";
    success: boolean;
    error?: string;
}

// Type guards for notification types
export function isSystemNotification(type: NotificationType): boolean {
    return type === NotificationType.SYSTEM_ALERT ||
        type === NotificationType.MUST_READ;
}

export function isAdminNotification(type: NotificationType): boolean {
    return type === NotificationType.ADMIN_MESSAGE;
}

export function isAnnouncementNotification(type: NotificationType): boolean {
    return type === NotificationType.GCA_ANNOUNCEMENT ||
        type === NotificationType.DIVISION_ANNOUNCEMENT;
}

// Helper function to get category code from notification type
export function getCategoryCodeFromType(type: NotificationType): string {
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
        case NotificationType.REQUEST_APPROVED:
        case NotificationType.REQUEST_DENIED:
        case NotificationType.REQUEST_CANCELLED:
        case NotificationType.REQUEST_WAITLISTED:
            return "request_status";
        case NotificationType.REGULAR_MESSAGE:
        default:
            return "general_message";
    }
}

// Helper function to determine importance from type and acknowledgment requirement
export function getImportanceFromType(
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
        case NotificationType.REQUEST_APPROVED:
        case NotificationType.REQUEST_DENIED:
        case NotificationType.REQUEST_CANCELLED:
        case NotificationType.REQUEST_WAITLISTED:
            return "medium";
        case NotificationType.REGULAR_MESSAGE:
        default:
            return "low";
    }
}
