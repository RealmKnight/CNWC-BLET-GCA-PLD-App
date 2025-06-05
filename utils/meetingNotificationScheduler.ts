import { supabase } from "./supabase";
import { sendPushNotification } from "./notificationService";
import { Platform } from "react-native";

/**
 * Scheduled function to check for upcoming meetings and send notifications
 * This should be executed by a cron job or scheduled task on the server
 */
export async function checkAndSendMeetingNotifications() {
    try {
        console.log("[Meeting Notifications] Starting notification check");

        // Find upcoming meeting occurrences
        const weekBeforeMeetings = await findMeetingsForNotification(7 * 24); // 7 days in hours
        const dayBeforeMeetings = await findMeetingsForNotification(24); // 24 hours
        const hourBeforeMeetings = await findMeetingsForNotification(1); // 1 hour

        // Send notifications for each time period
        await sendNotificationsForMeetings(
            weekBeforeMeetings,
            "notify_week_before",
            "week",
        );
        await sendNotificationsForMeetings(
            dayBeforeMeetings,
            "notify_day_before",
            "day",
        );
        await sendNotificationsForMeetings(
            hourBeforeMeetings,
            "notify_hour_before",
            "hour",
        );

        console.log("[Meeting Notifications] Notification check completed");
        return { success: true };
    } catch (error) {
        console.error(
            "[Meeting Notifications] Error in notification scheduler:",
            error,
        );
        return { success: false, error };
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
      division_meetings(division_id)
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
) {
    for (const meeting of meetings) {
        try {
            // Get division members
            const divisionId = meeting.division_meetings?.division_id;

            if (!divisionId) {
                console.warn(
                    `[Meeting Notifications] Meeting ${meeting.id} has no division_id, skipping`,
                );
                continue;
            }

            // Get members of this division
            const { data: divisionMembers, error: membersError } =
                await supabase
                    .from("members")
                    .select("id")
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

            // Get member IDs
            const memberIds = divisionMembers.map((member) => member.id);

            // Find members with notification preferences enabled for this time frame
            const { data: userPreferences, error: prefsError } = await supabase
                .from("meeting_notification_preferences")
                .select("user_id")
                .in("user_id", memberIds)
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
            const userIds = userPreferences.map((pref) => pref.user_id);

            const { data: usersWithTokens, error: tokensError } = await supabase
                .from("user_preferences")
                .select("user_id, push_token, contact_preference")
                .in("user_id", userIds)
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

            // For each user, send push notification if they have a token and prefer push notifications
            for (const user of (usersWithTokens || [])) {
                if (
                    user.contact_preference === "push" && user.push_token &&
                    Platform.OS !== "web"
                ) {
                    // Send push notification
                    await sendPushNotification({
                        to: user.push_token,
                        title: `Meeting in ${
                            timeFrame === "hour"
                                ? "one hour"
                                : timeFrame === "day"
                                ? "one day"
                                : "one week"
                        }`,
                        body:
                            `Upcoming meeting at ${meeting.location_name} on ${formattedTime}`,
                        data: {
                            meetingId: meeting.id,
                            meetingPatternId: meeting.meeting_pattern_id,
                            screen: "meetings",
                            type: "meeting_reminder",
                        },
                        sound: "default",
                        priority: "high",
                    });

                    // Record that notification was sent
                    await supabase
                        .from("push_notification_deliveries")
                        .insert({
                            message_id:
                                `meeting_${meeting.id}_${timeFrame}_${user.user_id}`,
                            recipient_id: user.user_id,
                            push_token: user.push_token,
                            status: "sent",
                            sent_at: new Date().toISOString(),
                        });
                }

                // Here you would also handle email and SMS notifications based on user preferences
                // Similar to how it's done in the notificationService.ts file
            }

            console.log(
                `[Meeting Notifications] Sent ${timeFrame} notifications for meeting ${meeting.id}`,
            );
        } catch (error) {
            console.error(
                `[Meeting Notifications] Error processing meeting ${meeting.id}:`,
                error,
            );
        }
    }
}
