import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";

// Initialize Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface MeetingOccurrence {
    id: string;
    actual_scheduled_datetime_utc: string;
    location_name: string;
    location_address: string;
    agenda: string;
    meeting_pattern_id: string;
    division_meetings: {
        division_id: number;
    };
}

interface DivisionMember {
    id: string;
}

interface UserPreference {
    user_id: string;
}

interface UserContactPreference {
    user_id: string;
    push_token: string | null;
    contact_preference: string;
}

async function checkAndSendMeetingNotifications() {
    console.log("[Meeting Notifications] Starting notification check");

    try {
        // Find upcoming meeting occurrences
        const weekBeforeMeetings = await findMeetingsForNotification(7 * 24); // 7 days in hours
        const dayBeforeMeetings = await findMeetingsForNotification(24); // 24 hours
        const hourBeforeMeetings = await findMeetingsForNotification(1); // 1 hour

        // Track notification counts
        let weekBeforeCount = 0;
        let dayBeforeCount = 0;
        let hourBeforeCount = 0;
        let totalNotificationsSent = 0;

        // Send notifications for each time period
        if (weekBeforeMeetings.length > 0) {
            const weekResult = await sendNotificationsForMeetings(
                weekBeforeMeetings,
                "notify_week_before",
                "week",
            );
            weekBeforeCount = weekResult;
            totalNotificationsSent += weekResult;
        }

        if (dayBeforeMeetings.length > 0) {
            const dayResult = await sendNotificationsForMeetings(
                dayBeforeMeetings,
                "notify_day_before",
                "day",
            );
            dayBeforeCount = dayResult;
            totalNotificationsSent += dayResult;
        }

        if (hourBeforeMeetings.length > 0) {
            const hourResult = await sendNotificationsForMeetings(
                hourBeforeMeetings,
                "notify_hour_before",
                "hour",
            );
            hourBeforeCount = hourResult;
            totalNotificationsSent += hourResult;
        }

        // Log the run results to the meeting_notification_log table
        await supabase.from("meeting_notification_log").insert({
            success: true,
            week_before_count: weekBeforeCount,
            day_before_count: dayBeforeCount,
            hour_before_count: hourBeforeCount,
            notifications_sent: totalNotificationsSent,
        });

        console.log("[Meeting Notifications] Notification check completed");
        console.log(
            `[Meeting Notifications] Sent: ${totalNotificationsSent} notifications (${weekBeforeCount} week, ${dayBeforeCount} day, ${hourBeforeCount} hour)`,
        );

        return {
            success: true,
            weekBeforeCount,
            dayBeforeCount,
            hourBeforeCount,
            totalNotificationsSent,
        };
    } catch (error) {
        console.error(
            "[Meeting Notifications] Error in notification scheduler:",
            error,
        );

        // Log error to the notification log table
        await supabase.from("meeting_notification_log").insert({
            success: false,
            week_before_count: 0,
            day_before_count: 0,
            hour_before_count: 0,
            notifications_sent: 0,
            error_message: error.message || "Unknown error",
        });

        return { success: false, error: error.message };
    }
}

/**
 * Find meetings that are coming up in the specified hours
 */
async function findMeetingsForNotification(hoursAhead: number) {
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Time window of +/- 5 minutes for hourly notifications, +/- 1 hour for daily/weekly
    const bufferMinutes = hoursAhead <= 1 ? 5 : 60;

    const lowerBound = new Date(
        targetTime.getTime() - bufferMinutes * 60 * 1000,
    ).toISOString();
    const upperBound = new Date(
        targetTime.getTime() + bufferMinutes * 60 * 1000,
    ).toISOString();

    // Get non-cancelled upcoming meetings within the time window
    const { data: meetings, error } = await supabase
        .from("meeting_occurrences")
        .select(`
      id,
      actual_scheduled_datetime_utc,
      location_name,
      location_address,
      agenda,
      meeting_pattern_id,
      division_meetings(division_id, location_name)
    `)
        .gte("actual_scheduled_datetime_utc", lowerBound)
        .lte("actual_scheduled_datetime_utc", upperBound)
        .eq("is_cancelled", false);

    if (error) {
        console.error(
            "[Meeting Notifications] Error finding upcoming meetings:",
            error,
        );
        return [];
    }

    return meetings || [];
}

/**
 * Send notifications to users for upcoming meetings based on their preferences
 */
async function sendNotificationsForMeetings(
    meetings: any[],
    preferenceField:
        | "notify_week_before"
        | "notify_day_before"
        | "notify_hour_before",
    timeFrame: "week" | "day" | "hour",
): Promise<number> {
    let notificationsSent = 0;

    for (const meeting of meetings) {
        try {
            // Get division information
            const divisionId = meeting.division_meetings?.division_id;

            if (!divisionId) {
                console.warn(
                    `[Meeting Notifications] Meeting ${meeting.id} has no division_id, skipping`,
                );
                continue;
            }

            // Get division name
            const { data: divisionData } = await supabase
                .from("divisions")
                .select("name")
                .eq("id", divisionId)
                .single();

            const divisionName = divisionData?.name || "Division";

            // Get members of this division
            const { data: divisionMembers, error: membersError } =
                await supabase
                    .from("members")
                    .select("id, user_id")
                    .eq("division_id", divisionId);

            if (membersError) {
                console.error(
                    `[Meeting Notifications] Error getting members for division ${divisionId}:`,
                    membersError,
                );
                continue;
            }

            if (!divisionMembers || divisionMembers.length === 0) {
                console.warn(
                    `[Meeting Notifications] No members found for division ${divisionId}`,
                );
                continue;
            }

            // Get user IDs
            const userIds = divisionMembers
                .filter((member) => member.user_id)
                .map((member) => member.user_id);

            if (userIds.length === 0) {
                console.warn(
                    `[Meeting Notifications] No users found for division ${divisionId}`,
                );
                continue;
            }

            // Find members with notification preferences enabled for this time frame
            const { data: userPreferences, error: prefsError } = await supabase
                .from("meeting_notification_preferences")
                .select("user_id")
                .in("user_id", userIds)
                .eq(preferenceField, true);

            if (prefsError) {
                console.error(
                    `[Meeting Notifications] Error getting notification preferences:`,
                    prefsError,
                );
                continue;
            }

            if (!userPreferences || userPreferences.length === 0) {
                console.log(
                    `[Meeting Notifications] No users with ${preferenceField} enabled`,
                );
                continue;
            }

            // Get users with push tokens
            const notifyUserIds = userPreferences.map((pref) => pref.user_id);

            const { data: usersWithTokens, error: tokensError } = await supabase
                .from("user_preferences")
                .select("user_id, push_token, contact_preference")
                .in("user_id", notifyUserIds)
                .not("push_token", "is", null);

            if (tokensError) {
                console.error(
                    `[Meeting Notifications] Error getting push tokens:`,
                    tokensError,
                );
                continue;
            }

            // Format meeting time
            const meetingDate = new Date(meeting.actual_scheduled_datetime_utc);
            const formattedTime = meetingDate.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
            });

            const locationName = meeting.location_name ||
                meeting.division_meetings?.location_name || "Unknown Location";

            // For each user, queue a push notification if they have a token
            for (const user of (usersWithTokens || [])) {
                if (user.push_token) {
                    // Prepare the notification title and body
                    const title = `${divisionName} Meeting in ${
                        timeFrame === "hour"
                            ? "one hour"
                            : timeFrame === "day"
                            ? "one day"
                            : "one week"
                    }`;

                    const body =
                        `Upcoming meeting at ${locationName} on ${formattedTime}`;

                    // Enqueue the notification in push_notification_queue
                    await enqueueNotification(
                        user.user_id,
                        user.push_token,
                        title,
                        body,
                        {
                            meetingId: meeting.id,
                            meetingPatternId: meeting.meeting_pattern_id,
                            screen: "meetings",
                            type: "meeting_reminder",
                            divisionId: divisionId,
                            divisionName: divisionName,
                            timeFrame: timeFrame,
                        },
                        `meeting_${meeting.id}_${timeFrame}_${user.user_id}`,
                        "high",
                    );

                    notificationsSent++;
                }
            }

            console.log(
                `[Meeting Notifications] Queued ${timeFrame} notifications for meeting ${meeting.id}`,
            );
        } catch (error) {
            console.error(
                `[Meeting Notifications] Error processing meeting ${meeting.id}:`,
                error,
            );
        }
    }

    return notificationsSent;
}

/**
 * Queue a notification for processing by the notification-processor function
 */
async function enqueueNotification(
    userId: string,
    pushToken: string,
    title: string,
    body: string,
    data: Record<string, any> = {},
    messageId?: string,
    priority: "default" | "normal" | "high" = "default",
    maxAttempts: number = 10,
): Promise<string | null> {
    try {
        // Set scheduled time for immediate processing
        const now = new Date().toISOString();

        // Prepare the queue entry
        const queueEntry: Record<string, any> = {
            user_id: userId,
            push_token: pushToken,
            title,
            body,
            data: {
                ...data,
                importance: priority,
            },
            status: "pending",
            retry_count: 0,
            next_attempt_at: now,
            max_attempts: maxAttempts,
            created_at: now,
            updated_at: now,
        };

        // Add message_id if provided
        if (messageId) {
            queueEntry.message_id = messageId;
        }

        // Insert into queue
        const { data: insertedData, error } = await supabase
            .from("push_notification_queue")
            .insert(queueEntry)
            .select("id")
            .single();

        if (error) {
            console.error(
                "[Meeting Notifications] Error enqueueing notification:",
                error,
            );
            return null;
        }

        return insertedData?.id || null;
    } catch (error) {
        console.error(
            "[Meeting Notifications] Error in enqueueNotification:",
            error,
        );
        return null;
    }
}

// Handler for the Edge Function
serve(async (req: Request) => {
    // This endpoint can be triggered by cron or manual invocation
    try {
        const result = await checkAndSendMeetingNotifications();

        return new Response(
            JSON.stringify(result),
            {
                headers: { "Content-Type": "application/json" },
                status: result.success ? 200 : 500,
            },
        );
    } catch (error) {
        console.error("[Meeting Notifications] Unhandled error:", error);

        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});
