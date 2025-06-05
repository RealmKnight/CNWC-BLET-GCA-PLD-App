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

// Enhanced analytics interfaces for detailed member tracking
export interface MemberReadStatus {
    user_id: string;
    pin: string;
    first_name: string;
    last_name: string;
    division_name: string;
    read_at: string | null;
    acknowledged_at: string | null;
    has_read: boolean;
    has_acknowledged: boolean;
}

export interface DivisionAnalytics {
    division_id: number;
    division_name: string;
    member_count: number;
    read_count: number;
    acknowledged_count: number;
    read_percentage: number;
    acknowledged_percentage: number;
}

export interface DetailedAnnouncementAnalytics {
    announcement_id: string;
    title: string;
    created_at: string;
    created_by: string;
    author_name: string;
    target_type: "division" | "GCA";
    target_division_ids: number[];
    require_acknowledgment: boolean;
    start_date: string;
    end_date: string | null;
    is_active: boolean;

    // Overall analytics
    total_eligible_members: number;
    total_read_count: number;
    total_acknowledged_count: number;
    overall_read_percentage: number;
    overall_acknowledged_percentage: number;

    // Member-level details
    members_who_read: MemberReadStatus[];
    members_who_not_read: MemberReadStatus[];

    // Division breakdown (for GCA announcements or union admin view)
    division_breakdown: DivisionAnalytics[];

    // Timestamps for real-time updates
    last_updated: string;
}

export interface AnnouncementsDashboardAnalytics {
    total_announcements: number;
    active_announcements: number;
    expired_announcements: number;
    require_acknowledgment_count: number;

    // Overall engagement metrics
    overall_read_rate: number;
    overall_acknowledgment_rate: number;

    // Recent activity (last 30 days)
    recent_announcements: number;
    recent_average_read_rate: number;

    // Division-specific metrics (for union admin)
    division_summaries?: DivisionAnalytics[];

    // Low engagement alerts
    low_engagement_announcements: {
        announcement_id: string;
        title: string;
        read_percentage: number;
        days_since_created: number;
    }[];

    last_updated: string;
}

// Export request types for analytics
export interface AnalyticsExportRequest {
    announcement_ids?: string[];
    date_range?: {
        start_date: string;
        end_date: string;
    };
    include_member_details: boolean;
    format: "csv" | "pdf";
    division_filter?: string[];
}
