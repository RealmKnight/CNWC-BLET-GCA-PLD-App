import { supabase } from "@/utils/supabase";
import type {
    AnalyticsExportRequest,
    AnnouncementsDashboardAnalytics,
    DetailedAnnouncementAnalytics,
    DivisionAnalytics,
    MemberReadStatus,
} from "@/types/announcements";

/**
 * Get detailed analytics for a specific announcement including member-level read status
 */
export async function getDetailedAnnouncementAnalytics(
    announcementId: string,
): Promise<DetailedAnnouncementAnalytics | null> {
    try {
        // Get announcement details
        const { data: announcement, error: announcementError } = await supabase
            .from("announcements_with_author")
            .select("*")
            .eq("id", announcementId)
            .single();

        if (announcementError) throw announcementError;
        if (!announcement) return null;

        // Get all eligible members based on target type and divisions
        let membersQuery = supabase
            .from("members")
            .select(`
                id,
                pin_number,
                first_name,
                last_name,
                division_id
            `)
            .neq("deleted", true);

        // Filter by target divisions if this is a division announcement
        if (
            announcement.target_type === "division" &&
            announcement.target_division_ids?.length > 0
        ) {
            membersQuery = membersQuery.in(
                "division_id",
                announcement.target_division_ids,
            );
        }

        const { data: eligibleMembers, error: membersError } =
            await membersQuery;
        if (membersError) throw membersError;

        if (!eligibleMembers) return null;

        // Get division information for the members
        const divisionIds = [
            ...new Set(eligibleMembers.map((m) => m.division_id)),
        ];
        const { data: divisions, error: divisionsError } = await supabase
            .from("divisions")
            .select("id, name")
            .in("id", divisionIds);

        if (divisionsError) throw divisionsError;

        // Create a mapping of division_id to division_name
        const divisionMap = new Map<number, string>();
        divisions?.forEach((div) => {
            divisionMap.set(div.id, div.name);
        });

        // Get read status for all eligible members
        const memberPins = eligibleMembers.map((m) => m.pin_number);
        const readByPins = announcement.read_by || [];
        const acknowledgedByPins = announcement.acknowledged_by || [];

        // Create member read status objects
        const memberReadStatuses: MemberReadStatus[] = eligibleMembers.map(
            (member) => {
                // Convert both to strings for comparison to handle type mismatches
                const memberPinStr = String(member.pin_number);
                const hasRead = readByPins.some((pin: any) =>
                    String(pin) === memberPinStr
                );
                const hasAcknowledged = acknowledgedByPins.some((pin: any) =>
                    String(pin) === memberPinStr
                );

                return {
                    user_id: member.id,
                    pin: member.pin_number,
                    first_name: member.first_name,
                    last_name: member.last_name,
                    division_name: divisionMap.get(member.division_id) ||
                        "Unknown Division",
                    read_at: hasRead ? new Date().toISOString() : null, // TODO: Get actual read timestamp
                    acknowledged_at: hasAcknowledged
                        ? new Date().toISOString()
                        : null, // TODO: Get actual ack timestamp
                    has_read: hasRead,
                    has_acknowledged: hasAcknowledged,
                };
            },
        );

        // Separate into read and unread
        const membersWhoRead = memberReadStatuses.filter((m) => m.has_read);
        const membersWhoNotRead = memberReadStatuses.filter((m) => !m.has_read);

        // Calculate division breakdown
        const divisionBreakdown: DivisionAnalytics[] = [];

        if (announcement.target_type === "GCA") {
            // For GCA announcements, group by all divisions
            const divisionGroups = new Map<
                number,
                { name: string; members: MemberReadStatus[] }
            >();

            memberReadStatuses.forEach((member) => {
                const divisionId = eligibleMembers.find((m) =>
                    m.pin_number === member.pin
                )?.division_id;
                if (divisionId) {
                    if (!divisionGroups.has(divisionId)) {
                        divisionGroups.set(divisionId, {
                            name: member.division_name,
                            members: [],
                        });
                    }
                    divisionGroups.get(divisionId)!.members.push(member);
                }
            });

            divisionGroups.forEach((group, divisionId) => {
                const readCount = group.members.filter((m) =>
                    m.has_read
                ).length;
                const acknowledgedCount = group.members.filter((m) =>
                    m.has_acknowledged
                ).length;
                const memberCount = group.members.length;

                divisionBreakdown.push({
                    division_id: divisionId,
                    division_name: group.name,
                    member_count: memberCount,
                    read_count: readCount,
                    acknowledged_count: acknowledgedCount,
                    read_percentage: memberCount > 0
                        ? Math.round((readCount / memberCount) * 100)
                        : 0,
                    acknowledged_percentage: memberCount > 0
                        ? Math.round((acknowledgedCount / memberCount) * 100)
                        : 0,
                });
            });
        } else {
            // For division announcements, just one division
            const readCount = membersWhoRead.length;
            const acknowledgedCount = memberReadStatuses.filter((m) =>
                m.has_acknowledged
            ).length;
            const memberCount = memberReadStatuses.length;

            if (announcement.target_division_ids?.[0]) {
                const divisionName = memberReadStatuses[0]?.division_name ||
                    "Unknown Division";
                divisionBreakdown.push({
                    division_id: announcement.target_division_ids[0],
                    division_name: divisionName,
                    member_count: memberCount,
                    read_count: readCount,
                    acknowledged_count: acknowledgedCount,
                    read_percentage: memberCount > 0
                        ? Math.round((readCount / memberCount) * 100)
                        : 0,
                    acknowledged_percentage: memberCount > 0
                        ? Math.round((acknowledgedCount / memberCount) * 100)
                        : 0,
                });
            }
        }

        // Calculate overall metrics
        const totalEligibleMembers = memberReadStatuses.length;
        const totalReadCount = membersWhoRead.length;
        const totalAcknowledgedCount = memberReadStatuses.filter((m) =>
            m.has_acknowledged
        ).length;
        const overallReadPercentage = totalEligibleMembers > 0
            ? Math.round((totalReadCount / totalEligibleMembers) * 100)
            : 0;
        const overallAcknowledgedPercentage = totalEligibleMembers > 0
            ? Math.round((totalAcknowledgedCount / totalEligibleMembers) * 100)
            : 0;

        const detailedAnalytics: DetailedAnnouncementAnalytics = {
            announcement_id: announcement.id,
            title: announcement.title,
            created_at: announcement.created_at,
            created_by: announcement.created_by,
            author_name: announcement.author_name || "Unknown",
            target_type: announcement.target_type,
            target_division_ids: announcement.target_division_ids || [],
            require_acknowledgment: announcement.require_acknowledgment,
            start_date: announcement.start_date,
            end_date: announcement.end_date,
            is_active: announcement.is_active,
            total_eligible_members: totalEligibleMembers,
            total_read_count: totalReadCount,
            total_acknowledged_count: totalAcknowledgedCount,
            overall_read_percentage: overallReadPercentage,
            overall_acknowledged_percentage: overallAcknowledgedPercentage,
            members_who_read: membersWhoRead,
            members_who_not_read: membersWhoNotRead,
            division_breakdown: divisionBreakdown,
            last_updated: new Date().toISOString(),
        };

        return detailedAnalytics;
    } catch (error) {
        console.error(
            "[Analytics] Error fetching detailed announcement analytics:",
            error,
        );
        return null;
    }
}

/**
 * Get dashboard analytics for announcements in a specific division context
 */
export async function getDashboardAnalytics(
    divisionContext?: string,
    dateRange?: { start_date: string; end_date: string },
): Promise<AnnouncementsDashboardAnalytics | null> {
    try {
        // Build announcement query based on division context
        let announcementsQuery = supabase
            .from("announcements_with_author")
            .select("*");

        if (
            divisionContext && divisionContext !== "GCA" &&
            divisionContext !== "total"
        ) {
            // Division Admin: ONLY division announcements for their specific division (NO GCA)
            const { data: divisionData } = await supabase
                .from("divisions")
                .select("id")
                .eq("name", divisionContext)
                .single();

            if (divisionData?.id) {
                announcementsQuery = announcementsQuery
                    .eq("target_type", "division")
                    .contains("target_division_ids", [divisionData.id]);
            } else {
                // Division not found, return empty analytics
                return {
                    total_announcements: 0,
                    active_announcements: 0,
                    expired_announcements: 0,
                    require_acknowledgment_count: 0,
                    overall_read_rate: 0,
                    overall_acknowledgment_rate: 0,
                    recent_announcements: 0,
                    recent_average_read_rate: 0,
                    low_engagement_announcements: [],
                    last_updated: new Date().toISOString(),
                };
            }
        } else if (divisionContext === "GCA") {
            // Union Admin GCA View: ONLY GCA announcements
            announcementsQuery = announcementsQuery.eq("target_type", "GCA");
        } else if (divisionContext === "total") {
            // Union Admin Total View: ALL announcements (both GCA and division)
            // No additional filtering needed - get all announcements
        }
        // If no divisionContext provided, get all announcements (for backward compatibility)

        // Apply date range filter if provided
        if (dateRange) {
            announcementsQuery = announcementsQuery
                .gte("created_at", dateRange.start_date)
                .lte("created_at", dateRange.end_date);
        }

        const { data: announcements, error: announcementsError } =
            await announcementsQuery;
        if (announcementsError) throw announcementsError;

        if (!announcements) return null;

        // Calculate basic metrics
        const totalAnnouncements = announcements.length;
        const activeAnnouncements = announcements.filter((a) =>
            a.is_active
        ).length;
        const expiredAnnouncements = announcements.filter((a) =>
            a.end_date && new Date(a.end_date) < new Date()
        ).length;
        const requireAcknowledgmentCount = announcements.filter((a) =>
            a.require_acknowledgment
        ).length;

        // Calculate recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentAnnouncements = announcements.filter((a) =>
            new Date(a.created_at) >= thirtyDaysAgo
        ).length;

        // Calculate engagement metrics
        let totalReadRate = 0;
        let totalAcknowledgmentRate = 0;
        let validAnnouncementsCount = 0;

        const lowEngagementAnnouncements: Array<{
            announcement_id: string;
            title: string;
            read_percentage: number;
            days_since_created: number;
        }> = [];

        for (const announcement of announcements) {
            if (announcement.read_by && announcement.read_by.length > 0) {
                // Get eligible member count for this announcement
                const { data: analytics } = await supabase
                    .from("announcement_read_counts")
                    .select("*")
                    .eq("announcement_id", announcement.id)
                    .single();

                if (analytics) {
                    const readPercentage = analytics.eligible_member_count > 0
                        ? (analytics.read_count /
                            analytics.eligible_member_count) * 100
                        : 0;

                    totalReadRate += readPercentage;
                    validAnnouncementsCount++;

                    if (
                        announcement.require_acknowledgment &&
                        announcement.acknowledged_by
                    ) {
                        const ackPercentage =
                            analytics.eligible_member_count > 0
                                ? (announcement.acknowledged_by.length /
                                    analytics.eligible_member_count) * 100
                                : 0;
                        totalAcknowledgmentRate += ackPercentage;
                    }

                    // Check for low engagement (below 50% read rate and created more than 3 days ago)
                    const daysSinceCreated = Math.floor(
                        (new Date().getTime() -
                            new Date(announcement.created_at).getTime()) /
                            (1000 * 60 * 60 * 24),
                    );

                    if (readPercentage < 50 && daysSinceCreated > 3) {
                        lowEngagementAnnouncements.push({
                            announcement_id: announcement.id,
                            title: announcement.title,
                            read_percentage: Math.round(readPercentage),
                            days_since_created: daysSinceCreated,
                        });
                    }
                }
            }
        }

        const overallReadRate = validAnnouncementsCount > 0
            ? totalReadRate / validAnnouncementsCount
            : 0;
        const overallAcknowledgmentRate = validAnnouncementsCount > 0
            ? totalAcknowledgmentRate / validAnnouncementsCount
            : 0;

        // Calculate recent average read rate
        let recentReadRate = 0;
        let recentValidCount = 0;
        for (const announcement of announcements) {
            if (
                new Date(announcement.created_at) >= thirtyDaysAgo &&
                announcement.read_by
            ) {
                const { data: analytics } = await supabase
                    .from("announcement_read_counts")
                    .select("*")
                    .eq("announcement_id", announcement.id)
                    .single();

                if (analytics) {
                    const readPercentage = analytics.eligible_member_count > 0
                        ? (analytics.read_count /
                            analytics.eligible_member_count) * 100
                        : 0;
                    recentReadRate += readPercentage;
                    recentValidCount++;
                }
            }
        }

        const recentAverageReadRate = recentValidCount > 0
            ? recentReadRate / recentValidCount
            : 0;

        // For union admin total view or no division context, get division summaries
        let divisionSummaries: DivisionAnalytics[] | undefined;
        if (!divisionContext || divisionContext === "total") {
            // Get all divisions for summary
            const { data: divisions } = await supabase
                .from("divisions")
                .select("id, name")
                .order("name");

            if (divisions) {
                divisionSummaries = [];

                for (const division of divisions) {
                    // Get announcements targeting this division (GCA + division-specific)
                    const divisionAnnouncements = announcements.filter((a) =>
                        a.target_type === "GCA" ||
                        (a.target_type === "division" &&
                            a.target_division_ids?.includes(division.id))
                    );

                    // Get member count for this division
                    const { data: memberCount } = await supabase
                        .from("members")
                        .select("id", { count: "exact" })
                        .eq("division_id", division.id)
                        .neq("deleted", true);

                    const totalMembers = memberCount?.length || 0;

                    // Get PINs for members of this division
                    const { data: divisionMembers } = await supabase
                        .from("members")
                        .select("pin_number")
                        .eq("division_id", division.id)
                        .neq("deleted", true);

                    const divisionPins = divisionMembers?.map((m) =>
                        m.pin_number.toString()
                    ) || [];

                    let totalReadCount = 0;
                    let totalAcknowledgedCount = 0;
                    let totalPossibleReads = 0;
                    let totalPossibleAcknowledgments = 0;

                    // Calculate engagement for this division
                    for (const announcement of divisionAnnouncements) {
                        // Count possible reads (one per member per announcement)
                        totalPossibleReads += totalMembers;

                        if (announcement.require_acknowledgment) {
                            totalPossibleAcknowledgments += totalMembers;
                        }

                        if (announcement.read_by) {
                            // Count actual reads by members of this division
                            const divisionReads =
                                announcement.read_by.filter((pin: string) =>
                                    divisionPins.includes(pin)
                                ).length;
                            totalReadCount += divisionReads;
                        }

                        if (announcement.acknowledged_by) {
                            // Count actual acknowledgments by members of this division
                            const divisionAcks =
                                announcement.acknowledged_by.filter((
                                    pin: string,
                                ) => divisionPins.includes(pin)).length;
                            totalAcknowledgedCount += divisionAcks;
                        }
                    }

                    const readPercentage = totalPossibleReads > 0
                        ? Math.round(
                            (totalReadCount / totalPossibleReads) * 100,
                        )
                        : 0;
                    const acknowledgedPercentage =
                        totalPossibleAcknowledgments > 0
                            ? Math.round(
                                (totalAcknowledgedCount /
                                    totalPossibleAcknowledgments) * 100,
                            )
                            : 0;

                    divisionSummaries.push({
                        division_id: division.id,
                        division_name: division.name,
                        member_count: totalMembers,
                        read_count: totalReadCount,
                        acknowledged_count: totalAcknowledgedCount,
                        read_percentage: readPercentage,
                        acknowledged_percentage: acknowledgedPercentage,
                    });
                }
            }
        }

        const dashboardAnalytics: AnnouncementsDashboardAnalytics = {
            total_announcements: totalAnnouncements,
            active_announcements: activeAnnouncements,
            expired_announcements: expiredAnnouncements,
            require_acknowledgment_count: requireAcknowledgmentCount,
            overall_read_rate: Math.round(overallReadRate),
            overall_acknowledgment_rate: Math.round(overallAcknowledgmentRate),
            recent_announcements: recentAnnouncements,
            recent_average_read_rate: Math.round(recentAverageReadRate),
            division_summaries: divisionSummaries,
            low_engagement_announcements: lowEngagementAnnouncements,
            last_updated: new Date().toISOString(),
        };

        return dashboardAnalytics;
    } catch (error) {
        console.error("[Analytics] Error fetching dashboard analytics:", error);
        return null;
    }
}

/**
 * Get low engagement announcements based on read percentage and age thresholds
 */
export async function getLowEngagementAnnouncements(
    thresholdPercentage: number = 50,
    daysThreshold: number = 3,
    divisionContext?: string,
): Promise<
    Array<{
        announcement_id: string;
        title: string;
        read_percentage: number;
        days_since_created: number;
    }>
> {
    try {
        // Build query based on division context (matching getDashboardAnalytics logic)
        let query = supabase
            .from("announcement_read_counts")
            .select("*");

        if (
            divisionContext && divisionContext !== "GCA" &&
            divisionContext !== "total"
        ) {
            // Division Admin: ONLY division announcements for their specific division
            const { data: divisionData } = await supabase
                .from("divisions")
                .select("id")
                .eq("name", divisionContext)
                .single();

            if (divisionData?.id) {
                query = query
                    .eq("target_type", "division")
                    .contains("target_division_ids", [divisionData.id]);
            } else {
                // Division not found, return empty array
                return [];
            }
        } else if (divisionContext === "GCA") {
            // Union Admin GCA View: ONLY GCA announcements
            query = query.eq("target_type", "GCA");
        } else if (divisionContext === "total") {
            // Union Admin Total View: ALL announcements (no additional filtering)
        }
        // If no divisionContext provided, get all announcements (for backward compatibility)

        const { data: analytics, error } = await query;
        if (error) throw error;

        if (!analytics) return [];

        const lowEngagementAnnouncements = analytics
            .map((item) => {
                const readPercentage = item.eligible_member_count > 0
                    ? (item.read_count / item.eligible_member_count) * 100
                    : 0;

                const daysSinceCreated = Math.floor(
                    (new Date().getTime() -
                        new Date(item.created_at).getTime()) /
                        (1000 * 60 * 60 * 24),
                );

                return {
                    announcement_id: item.announcement_id,
                    title: item.title,
                    read_percentage: Math.round(readPercentage),
                    days_since_created: daysSinceCreated,
                };
            })
            .filter((item) =>
                item.read_percentage < thresholdPercentage &&
                item.days_since_created >= daysThreshold
            )
            .sort((a, b) => a.read_percentage - b.read_percentage);

        return lowEngagementAnnouncements;
    } catch (error) {
        console.error(
            "[Analytics] Error fetching low engagement announcements:",
            error,
        );
        return [];
    }
}

/**
 * Export analytics data to CSV or PDF format
 */
export async function exportAnalytics(
    request: AnalyticsExportRequest,
): Promise<{ url: string; filename: string } | null> {
    try {
        // This is a placeholder implementation
        // In a real implementation, you would:
        // 1. Fetch the requested analytics data
        // 2. Format it according to the export format
        // 3. Upload to storage and return download URL

        console.log("[Analytics] Export request:", request);

        // For now, return null to indicate this feature is not yet implemented
        return null;
    } catch (error) {
        console.error("[Analytics] Error exporting analytics:", error);
        return null;
    }
}
