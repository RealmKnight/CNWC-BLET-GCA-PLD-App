// types/announcements.ts

export interface Link {
    url: string;
    label: string;
}

export interface Announcement {
    id: string;
    created_at: string;
    updated_at: string;
    title: string;
    message: string;
    links: Link[];
    created_by: string;
    creator_role: string;
    author_name?: string;
    start_date: string;
    end_date: string | null;
    is_active: boolean;
    require_acknowledgment: boolean;
    target_type: "division" | "GCA";
    target_division_ids: number[];
    document_ids: string[];
    read_by: string[];
    acknowledged_by: string[];
    has_been_read?: boolean; // Client-side computed property
    has_been_acknowledged?: boolean; // Client-side computed property
}

export interface AnnouncementReadStatus {
    announcement_id: string;
    user_id: string;
    read_at: string;
}

export interface AnnouncementAnalytics {
    announcement_id: string;
    title: string;
    created_at: string;
    target_type: string;
    target_division_ids: number[];
    require_acknowledgment: boolean;
    read_count: number;
    eligible_member_count: number;
    read_percentage?: number; // Calculated client-side
}
