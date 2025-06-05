import {
    addDays,
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    format,
    getDate,
    getDay,
    getDaysInMonth,
    isAfter,
    isBefore,
    isEqual,
    isValid,
    lastDayOfMonth,
    parseISO,
    set,
    setDate,
    setMonth,
    startOfMonth,
} from "date-fns";
import { format as formatTz, fromZonedTime, toZonedTime } from "date-fns-tz";
import {
    DivisionMeeting,
    MeetingOccurrence,
    MeetingPattern,
} from "@/store/divisionMeetingStore";

/**
 * Calculate meeting occurrences based on a complex pattern within a date range
 * Limited to a 12-month maximum range
 */
export function calculateMeetingOccurrences(
    pattern: DivisionMeeting,
    startDate: Date,
    endDate: Date,
    userId?: string,
): MeetingOccurrence[] {
    // Limit to 12 months maximum
    const maxEndDate = addMonths(startDate, 12);
    const limitedEndDate = isAfter(endDate, maxEndDate) ? maxEndDate : endDate;

    // Initialize empty array for occurrences
    const occurrences: MeetingOccurrence[] = [];

    // Generate occurrences based on pattern type
    switch (pattern.meeting_pattern_type) {
        case "day_of_month":
            return calculateDayOfMonthOccurrences(
                pattern,
                startDate,
                limitedEndDate,
                userId,
            );

        case "nth_day_of_month":
            return calculateNthDayOfMonthOccurrences(
                pattern,
                startDate,
                limitedEndDate,
                userId,
            );

        case "specific_date":
            return calculateSpecificDateOccurrences(
                pattern,
                startDate,
                limitedEndDate,
                userId,
            );

        case "rotating":
            return calculateRotatingOccurrences(
                pattern,
                startDate,
                limitedEndDate,
                userId,
            );

        default:
            return [];
    }
}

/**
 * Convert local time to UTC, respecting the adjust_for_dst flag
 * If adjust_for_dst is true, use normal time zone conversion with DST
 * If adjust_for_dst is false, adjust to maintain the same UTC time regardless of DST
 */
function convertToUtc(
    localDateTime: Date,
    timeZone: string,
    adjustForDst: boolean,
): Date {
    if (adjustForDst) {
        // Use regular time zone conversion with automatic DST handling
        return fromZonedTime(localDateTime, timeZone);
    } else {
        // Calculate the standard time (non-DST) offset for this time zone
        const january = new Date(localDateTime.getFullYear(), 0, 1);
        const july = new Date(localDateTime.getFullYear(), 6, 1);

        // Get both offsets and use the larger one (usually non-DST)
        const januaryOffset = new Date(toZonedTime(january, timeZone))
            .getTimezoneOffset();
        const julyOffset = new Date(toZonedTime(july, timeZone))
            .getTimezoneOffset();

        // Standard time has the larger offset value (more negative)
        const standardTimeOffset = Math.max(januaryOffset, julyOffset);
        const currentOffset = new Date(toZonedTime(localDateTime, timeZone))
            .getTimezoneOffset();

        // If currently in DST but we want to ignore it, adjust the time
        if (currentOffset !== standardTimeOffset) {
            const adjustmentMs = (standardTimeOffset - currentOffset) * 60 *
                1000;
            const adjustedDate = new Date(
                localDateTime.getTime() + adjustmentMs,
            );
            return fromZonedTime(adjustedDate, timeZone);
        }

        // Already in standard time
        return fromZonedTime(localDateTime, timeZone);
    }
}

/**
 * Calculate occurrences for a day of month pattern (e.g., 15th of every month)
 */
function calculateDayOfMonthOccurrences(
    pattern: DivisionMeeting,
    startDate: Date,
    endDate: Date,
    userId?: string,
): MeetingOccurrence[] {
    const occurrences: MeetingOccurrence[] = [];
    const dayOfMonth = pattern.meeting_pattern.day_of_month || 1;
    const meetingTime = pattern.meeting_pattern.time || pattern.meeting_time;

    // Calculate for each month in the range
    let currentDate = new Date(startDate);
    currentDate.setDate(1); // Start at the 1st of the month

    while (isBefore(currentDate, endDate)) {
        const daysInMonth = getDaysInMonth(currentDate);
        const actualDay = Math.min(dayOfMonth, daysInMonth); // Handle months with fewer days

        // Set the day of month
        const meetingDate = new Date(currentDate);
        meetingDate.setDate(actualDay);

        // Only include if it's within our date range
        if (
            isAfter(meetingDate, startDate) || isEqual(meetingDate, startDate)
        ) {
            if (
                isBefore(meetingDate, endDate) || isEqual(meetingDate, endDate)
            ) {
                // Create the occurrence with the specified time
                const [hours, minutes, seconds] = meetingTime.split(":").map(
                    Number,
                );
                const localDateTime = set(meetingDate, {
                    hours,
                    minutes,
                    seconds,
                });

                // Convert to UTC for storage, respecting adjust_for_dst flag
                const utcDateTime = convertToUtc(
                    localDateTime,
                    pattern.time_zone,
                    pattern.adjust_for_dst,
                );

                occurrences.push(createOccurrenceFromPattern(
                    pattern,
                    utcDateTime.toISOString(),
                    utcDateTime.toISOString(),
                    userId,
                ));
            }
        }

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return occurrences;
}

/**
 * Calculate occurrences for an nth day of month pattern (e.g., 2nd Tuesday of each month)
 */
function calculateNthDayOfMonthOccurrences(
    pattern: DivisionMeeting,
    startDate: Date,
    endDate: Date,
    userId?: string,
): MeetingOccurrence[] {
    const occurrences: MeetingOccurrence[] = [];
    const dayOfWeek = pattern.meeting_pattern.day_of_week || 1; // Default to Monday
    const weekOfMonth = pattern.meeting_pattern.week_of_month || 1; // Default to first
    const meetingTime = pattern.meeting_pattern.time || pattern.meeting_time;

    // Calculate for each month in the range
    let currentMonth = new Date(startDate);
    currentMonth.setDate(1); // Start at the 1st of the month

    while (isBefore(currentMonth, endDate)) {
        // Find the meeting date for this month
        const meetingDate = findNthDayOfMonth(
            currentMonth,
            dayOfWeek,
            weekOfMonth,
        );

        // Only include if it's within our date range
        if (
            isAfter(meetingDate, startDate) || isEqual(meetingDate, startDate)
        ) {
            if (
                isBefore(meetingDate, endDate) || isEqual(meetingDate, endDate)
            ) {
                // Create the occurrence with the specified time
                const [hours, minutes, seconds] = meetingTime.split(":").map(
                    Number,
                );
                const localDateTime = set(meetingDate, {
                    hours,
                    minutes,
                    seconds,
                });

                // Convert to UTC for storage, respecting adjust_for_dst flag
                const utcDateTime = convertToUtc(
                    localDateTime,
                    pattern.time_zone,
                    pattern.adjust_for_dst,
                );

                occurrences.push(createOccurrenceFromPattern(
                    pattern,
                    utcDateTime.toISOString(),
                    utcDateTime.toISOString(),
                    userId,
                ));
            }
        }

        // Move to next month
        currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    return occurrences;
}

/**
 * Calculate occurrences for specific dates pattern
 */
function calculateSpecificDateOccurrences(
    pattern: DivisionMeeting,
    startDate: Date,
    endDate: Date,
    userId?: string,
): MeetingOccurrence[] {
    const occurrences: MeetingOccurrence[] = [];
    const specificDates = pattern.meeting_pattern.specific_dates || [];

    // Process each specific date
    specificDates.forEach(({ date, time }) => {
        const dateObj = parseISO(date);

        // Only include if it's within our date range
        if (
            (isAfter(dateObj, startDate) || isEqual(dateObj, startDate)) &&
            (isBefore(dateObj, endDate) || isEqual(dateObj, endDate))
        ) {
            // Create the occurrence with the specified time
            const [hours, minutes, seconds] = time.split(":").map(Number);
            const localDateTime = set(dateObj, { hours, minutes, seconds });

            // Convert to UTC for storage, respecting adjust_for_dst flag
            const utcDateTime = convertToUtc(
                localDateTime,
                pattern.time_zone,
                pattern.adjust_for_dst,
            );

            occurrences.push(createOccurrenceFromPattern(
                pattern,
                utcDateTime.toISOString(),
                utcDateTime.toISOString(),
                userId,
            ));
        }
    });

    return occurrences;
}

/**
 * Calculate occurrences for a rotating pattern (cycles through multiple rules)
 */
function calculateRotatingOccurrences(
    pattern: DivisionMeeting,
    startDate: Date,
    endDate: Date,
    userId?: string,
): MeetingOccurrence[] {
    const occurrences: MeetingOccurrence[] = [];
    const rules = pattern.meeting_pattern.rules || [];

    if (rules.length === 0) {
        return [];
    }

    let currentRuleIndex = pattern.meeting_pattern.current_rule_index || 0;
    let currentDate = new Date(startDate);
    currentDate.setDate(1); // Start at the 1st of the month

    // Generate occurrences for each month in the range
    while (isBefore(currentDate, endDate)) {
        const rule = rules[currentRuleIndex];
        let meetingDate: Date;

        // Calculate meeting date based on rule type
        if (rule.rule_type === "day_of_month") {
            const dayOfMonth = rule.day_of_month || 1;
            const daysInMonth = getDaysInMonth(currentDate);
            const actualDay = Math.min(dayOfMonth, daysInMonth);

            meetingDate = new Date(currentDate);
            meetingDate.setDate(actualDay);
        } else if (rule.rule_type === "nth_day_of_month") {
            meetingDate = findNthDayOfMonth(
                currentDate,
                rule.day_of_week || 1,
                rule.week_of_month || 1,
            );
        } else {
            // Move to next month and rule if we don't recognize the rule type
            currentDate.setMonth(currentDate.getMonth() + 1);
            currentRuleIndex = (currentRuleIndex + 1) % rules.length;
            continue;
        }

        // Only include if it's within our date range
        if (
            isAfter(meetingDate, startDate) || isEqual(meetingDate, startDate)
        ) {
            if (
                isBefore(meetingDate, endDate) || isEqual(meetingDate, endDate)
            ) {
                // Create the occurrence with the specified time
                const meetingTime = rule.time || pattern.meeting_time;
                const [hours, minutes, seconds] = meetingTime.split(":").map(
                    Number,
                );
                const localDateTime = set(meetingDate, {
                    hours,
                    minutes,
                    seconds,
                });

                // Convert to UTC for storage, respecting adjust_for_dst flag
                const utcDateTime = convertToUtc(
                    localDateTime,
                    pattern.time_zone,
                    pattern.adjust_for_dst,
                );

                occurrences.push(createOccurrenceFromPattern(
                    pattern,
                    utcDateTime.toISOString(),
                    utcDateTime.toISOString(),
                    userId,
                ));
            }
        }

        // Move to next month and rule
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentRuleIndex = (currentRuleIndex + 1) % rules.length;
    }

    return occurrences;
}

/**
 * Helper function to find the nth occurrence of a specific day of the week in a month
 * @param month The month to search in (should be set to the 1st day of the month)
 * @param targetDayOfWeek The day of week (0 = Sunday, 1 = Monday, etc.)
 * @param weekOfMonth Which occurrence to find (1 = first, 2 = second, etc., 5 = last)
 */
function findNthDayOfMonth(
    month: Date,
    targetDayOfWeek: number,
    weekOfMonth: number,
): Date {
    const firstDayOfMonth = startOfMonth(month);
    const lastDay = lastDayOfMonth(month);

    // Special case for "last" (5)
    if (weekOfMonth === 5) {
        // Start from the end of the month and go backwards
        let currentDay = lastDay;
        while (getDay(currentDay) !== targetDayOfWeek) {
            currentDay = addDays(currentDay, -1);
        }
        return currentDay;
    }

    // For 1st, 2nd, 3rd, 4th occurrences
    let currentDay = firstDayOfMonth;
    let count = 0;

    // Find the first occurrence of the target day
    while (getDay(currentDay) !== targetDayOfWeek) {
        currentDay = addDays(currentDay, 1);
    }

    // Find the nth occurrence
    for (let i = 1; i < weekOfMonth; i++) {
        currentDay = addDays(currentDay, 7);

        // If we've gone past the end of the month, return the last valid occurrence
        if (getMonth(currentDay) !== getMonth(month)) {
            return addDays(currentDay, -7);
        }
    }

    return currentDay;
}

/**
 * Helper function to create a meeting occurrence object from a pattern
 */
function createOccurrenceFromPattern(
    pattern: DivisionMeeting,
    originalScheduledDatetimeUtc: string,
    actualScheduledDatetimeUtc: string,
    userId?: string,
): MeetingOccurrence {
    // Ensure userId is provided since created_by and updated_by are required fields
    if (!userId) {
        throw new Error("userId is required to create meeting occurrences");
    }

    // Create the occurrence with essential data, including required user fields
    return {
        meeting_pattern_id: pattern.id,
        original_scheduled_datetime_utc: originalScheduledDatetimeUtc,
        actual_scheduled_datetime_utc: actualScheduledDatetimeUtc,
        time_zone: pattern.time_zone,
        location_name: pattern.location_name,
        location_address: pattern.location_address,
        agenda: pattern.default_agenda || "",
        notes: "",
        is_cancelled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: userId,
        updated_by: userId,
    } as MeetingOccurrence;
}

/**
 * Check if DST transitions will occur in the next month
 */
export function checkUpcomingDstTransitions(timeZone: string): {
    isDstTransitionSoon: boolean;
    transitionDate?: Date;
} {
    // This is a simplified check for DST transitions
    // In a real implementation, you would check the actual DST transition dates for the given time zone

    const now = new Date();
    const month = now.getMonth();

    // Common DST transition periods (US/Canada)
    // March and November (0-indexed months: 2, 10)
    if (month === 2 || month === 10) {
        return {
            isDstTransitionSoon: true,
            transitionDate: month === 2
                ? new Date(now.getFullYear(), 2, 14) // Around 2nd Sunday in March
                : new Date(now.getFullYear(), 10, 7), // Around 1st Sunday in November
        };
    }

    return { isDstTransitionSoon: false };
}

/**
 * Generate iCalendar data for a set of meeting occurrences
 */
export function generateICalendarData(
    occurrences: MeetingOccurrence[],
    meetingPattern: DivisionMeeting,
): string {
    if (occurrences.length === 0) {
        return "";
    }

    const now = new Date();
    const prodId = `-//PLD App//Division Meetings//EN`;

    let icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:${prodId}`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ];

    // Add each occurrence as an event
    occurrences.forEach((occurrence) => {
        if (occurrence.is_cancelled) return; // Skip cancelled occurrences

        // Parse the UTC datetime
        const utcDateTime = parseISO(occurrence.actual_scheduled_datetime_utc);

        // Assume meetings last 1 hour by default
        const endDateTime = addHours(utcDateTime, 1);

        // Format dates for iCalendar (UTC)
        const dtStart = format(utcDateTime, "yyyyMMdd'T'HHmmss'Z'");
        const dtEnd = format(endDateTime, "yyyyMMdd'T'HHmmss'Z'");
        const dtstamp = format(now, "yyyyMMdd'T'HHmmss'Z'");

        // Create a UID for the event
        const uid = `meeting-${occurrence.id}@pld-app`;

        // Build the event
        icsContent = [
            ...icsContent,
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${dtStart}`,
            `DTEND:${dtEnd}`,
            `SUMMARY:${meetingPattern.meeting_type} Meeting`,
            `LOCATION:${
                occurrence.location_name || meetingPattern.location_name
            }${
                occurrence.location_address || meetingPattern.location_address
                    ? ` - ${
                        occurrence.location_address ||
                        meetingPattern.location_address
                    }`
                    : ""
            }`,
            `DESCRIPTION:${occurrence.agenda || "No agenda available."}`,
            "END:VEVENT",
        ];
    });

    // Close the calendar
    icsContent.push("END:VCALENDAR");

    return icsContent.join("\r\n");
}

/**
 * Helper function to add hours to a date
 */
function addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Helper function to get the month of a date
 */
function getMonth(date: Date): number {
    return date.getMonth();
}

/**
 * Validate if a meeting pattern is properly configured
 */
export function validateMeetingPattern(pattern: DivisionMeeting): boolean {
    // Basic validation
    if (!pattern.meeting_pattern_type || !pattern.time_zone) {
        return false;
    }

    // Pattern-specific validation
    switch (pattern.meeting_pattern_type) {
        case "day_of_month":
            return (
                typeof pattern.meeting_pattern.day_of_month === "number" &&
                pattern.meeting_pattern.day_of_month >= 1 &&
                pattern.meeting_pattern.day_of_month <= 31
            );

        case "nth_day_of_month":
            return (
                typeof pattern.meeting_pattern.day_of_week === "number" &&
                pattern.meeting_pattern.day_of_week >= 0 &&
                pattern.meeting_pattern.day_of_week <= 6 &&
                typeof pattern.meeting_pattern.week_of_month === "number" &&
                pattern.meeting_pattern.week_of_month >= 1 &&
                pattern.meeting_pattern.week_of_month <= 5
            );

        case "specific_date":
            return (
                Array.isArray(pattern.meeting_pattern.specific_dates) &&
                pattern.meeting_pattern.specific_dates.length > 0 &&
                pattern.meeting_pattern.specific_dates.every((item) =>
                    isValid(parseISO(item.date)) &&
                    /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(item.time)
                )
            );

        case "rotating":
            return (
                Array.isArray(pattern.meeting_pattern.rules) &&
                pattern.meeting_pattern.rules.length > 0 &&
                typeof pattern.meeting_pattern.current_rule_index ===
                    "number" &&
                pattern.meeting_pattern.current_rule_index >= 0 &&
                pattern.meeting_pattern.current_rule_index <
                    pattern.meeting_pattern.rules.length &&
                pattern.meeting_pattern.rules.every((rule) => {
                    if (rule.rule_type === "day_of_month") {
                        return (
                            typeof rule.day_of_month === "number" &&
                            rule.day_of_month >= 1 &&
                            rule.day_of_month <= 31
                        );
                    } else if (rule.rule_type === "nth_day_of_month") {
                        return (
                            typeof rule.day_of_week === "number" &&
                            rule.day_of_week >= 0 &&
                            rule.day_of_week <= 6 &&
                            typeof rule.week_of_month === "number" &&
                            rule.week_of_month >= 1 &&
                            rule.week_of_month <= 5
                        );
                    }
                    return false;
                })
            );

        default:
            return false;
    }
}
