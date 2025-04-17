export const REQUEST_TYPES = ["PLD", "SDV", "OTHER"] as const;
export type RequestType = typeof REQUEST_TYPES[number];

export const REQUEST_STATUSES = [
    "pending",
    "approved",
    "denied",
    "waitlisted",
    "cancellation_pending",
    "cancelled",
    "transferred",
] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];

export const AUDIT_EVENT_TYPES = [
    "created",
    "status_changed",
    "updated",
    "responded",
    "actioned",
    "overridden",
] as const;
export type AuditEventType = typeof AUDIT_EVENT_TYPES[number];
