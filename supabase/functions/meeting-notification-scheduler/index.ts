import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Create a Supabase client with the Admin key
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

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

    return meetings as MeetingOccurrence[] || [];
}

/**
 * Send notifications to users for upcoming meetings based on their preferences
 */
async function sendNotificationsForMeetings(
    meetings: MeetingOccurrence[],
    preferenceField:
        | "notify_week_before"
        | "notify_day_before"
        | "notify_hour_before",
    timeFrame: "week" | "day" | "hour",
) {
    let notificationsSent = 0;

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
            const memberIds = divisionMembers.map((member: DivisionMember) =>
                member.id
            );

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

            // Get users with push tokens and other contact preferences
            const userIds = userPreferences.map((pref: UserPreference) =>
                pref.user_id
            );

            // Get user preferences for notifications (push token, contact preference)
            const { data: userContactPrefs, error: contactPrefsError } =
                await supabase
                    .from("user_preferences")
                    .select("user_id, push_token, contact_preference")
                    .in("user_id", userIds);

            if (contactPrefsError) {
                console.error(
                    `[Meeting Notifications] Error getting user contact preferences:`,
                    contactPrefsError,
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

            const meetingLocation = meeting.location_name ||
                "scheduled location";

            // Process each user's notification based on their preference
            for (
                const userPref
                    of (userContactPrefs as UserContactPreference[] || [])
            ) {
                try {
                    // For push notifications
                    if (
                        userPref.contact_preference === "push" &&
                        userPref.push_token
                    ) {
                        // Insert notification into push_notification_deliveries table
                        // to be processed by the push notification worker
                        const { error: insertError } = await supabase
                            .from("push_notification_deliveries")
                            .insert({
                                message_id:
                                    `meeting_${meeting.id}_${timeFrame}_${userPref.user_id}`,
                                recipient_id: userPref.user_id,
                                push_token: userPref.push_token,
                                status: "queued",
                                metadata: {
                                    title: `Meeting in ${
                                        timeFrame === "hour"
                                            ? "one hour"
                                            : timeFrame === "day"
                                            ? "one day"
                                            : "one week"
                                    }`,
                                    body:
                                        `Upcoming meeting at ${meetingLocation} on ${formattedTime}`,
                                    data: {
                                        meetingId: meeting.id,
                                        meetingPatternId:
                                            meeting.meeting_pattern_id,
                                        screen: "meetings",
                                        type: "meeting_reminder",
                                    },
                                    sound: "default",
                                    priority: "high",
                                },
                            });

                        if (insertError) {
                            console.error(
                                `[Meeting Notifications] Error queuing push notification:`,
                                insertError,
                            );
                        } else {
                            notificationsSent++;
                        }
                    }

                    // For email and SMS notifications, use existing edge functions
                    // This would be implemented similarly to push notifications above
                    // Sending to the appropriate service based on user preference
                } catch (userError) {
                    console.error(
                        `[Meeting Notifications] Error processing user ${userPref.user_id}:`,
                        userError,
                    );
                }
            }

            console.log(
                `[Meeting Notifications] Processed ${timeFrame} notifications for meeting ${meeting.id}`,
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
 * Main handler for the edge function
 */
serve(async (req) => {
    try {
        console.log("[Meeting Notifications] Starting notification check");

        let notificationsSent = 0;

        // Find upcoming meeting occurrences
        const weekBeforeMeetings = await findMeetingsForNotification(7 * 24); // 7 days in hours
        const dayBeforeMeetings = await findMeetingsForNotification(24); // 24 hours
        const hourBeforeMeetings = await findMeetingsForNotification(1); // 1 hour

        // Send notifications for each time period
        if (weekBeforeMeetings.length > 0) {
            const weekCount = await sendNotificationsForMeetings(
                weekBeforeMeetings,
                "notify_week_before",
                "week",
            );
            notificationsSent += weekCount;
            console.log(
                `[Meeting Notifications] Sent ${weekCount} week-before notifications`,
            );
        }

        if (dayBeforeMeetings.length > 0) {
            const dayCount = await sendNotificationsForMeetings(
                dayBeforeMeetings,
                "notify_day_before",
                "day",
            );
            notificationsSent += dayCount;
            console.log(
                `[Meeting Notifications] Sent ${dayCount} day-before notifications`,
            );
        }

        if (hourBeforeMeetings.length > 0) {
            const hourCount = await sendNotificationsForMeetings(
                hourBeforeMeetings,
                "notify_hour_before",
                "hour",
            );
            notificationsSent += hourCount;
            console.log(
                `[Meeting Notifications] Sent ${hourCount} hour-before notifications`,
            );
        }

        console.log(
            `[Meeting Notifications] Notification check completed. Sent ${notificationsSent} notifications in total.`,
        );

        return new Response(
            JSON.stringify({
                success: true,
                weekBeforeMeetings: weekBeforeMeetings.length,
                dayBeforeMeetings: dayBeforeMeetings.length,
                hourBeforeMeetings: hourBeforeMeetings.length,
                notificationsSent,
            }),
            {
                headers: { "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error
            ? error.message
            : "Unknown error occurred";
        console.error("[Meeting Notifications] Error in scheduler:", error);

        return new Response(
            JSON.stringify({
                success: false,
                error: errorMessage,
            }),
            {
                headers: { "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});
