export interface AdminMessage {
    id: string; // uuid
    created_at?: string; // timestamp with time zone
    updated_at?: string; // timestamp with time zone
    sender_user_id: string; // uuid, FK to auth.users
    sender_role: string | null; // text
    recipient_roles: string[]; // text[]
    parent_message_id: string | null; // uuid, FK to admin_messages.id
    subject: string | null; // text
    message: string; // text
    is_read: boolean; // boolean, default false
    read_by: string[]; // uuid[], default '{}'
    is_archived: boolean; // boolean, default false
    requires_acknowledgment: boolean; // boolean, default false
    acknowledged_at: string | null; // timestamp with time zone
    acknowledged_by: string[]; // uuid[], default '{}'

    // Potential additions for frontend convenience (can be added later if needed):
    // replies?: AdminMessage[]; // For grouping threads in UI
    // sender_name?: string; // Might be useful to fetch/display
}
