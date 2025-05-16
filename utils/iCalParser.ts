// import { parseICS } from "ical";
import { format, parseISO } from "date-fns";

// Define interface for calendar component based on ical library
interface CalendarComponent {
    type?: string;
    summary?: string;
    description?: string;
    start?: Date;
    end?: Date;
    created?: Date;
    [key: string]: any;
}

/**
 * Custom implementation of ical parsing to work in both Node.js and browser environments
 * This is a simplified version that only extracts the fields we need
 */
export function parseICS(input: string): Record<string, CalendarComponent> {
    // Normalize line endings
    const content = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Split into lines
    const lines = content.split("\n");

    // Result object
    const events: Record<string, CalendarComponent> = {};

    let currentEvent: CalendarComponent | null = null;
    let currentEventId: string | null = null;
    let lineIndex = 0;

    while (lineIndex < lines.length) {
        let line = lines[lineIndex].trim();
        lineIndex++;

        // Handle line continuations (lines starting with space or tab)
        while (
            lineIndex < lines.length &&
            (lines[lineIndex].startsWith(" ") ||
                lines[lineIndex].startsWith("\t"))
        ) {
            line += lines[lineIndex].trim();
            lineIndex++;
        }

        // Skip empty lines
        if (line === "") continue;

        // Start of event
        if (line === "BEGIN:VEVENT") {
            currentEvent = {
                type: "VEVENT",
            };
            continue;
        }

        // End of event
        if (line === "END:VEVENT" && currentEvent) {
            // If no UID was found, generate a random one
            if (!currentEventId) {
                currentEventId = "generated-" +
                    Math.random().toString(36).substring(2, 11);
            }
            events[currentEventId] = currentEvent;
            currentEvent = null;
            currentEventId = null;
            continue;
        }

        if (currentEvent) {
            // Parse property
            const colonIndex = line.indexOf(":");
            if (colonIndex > 0) {
                const propertyPart = line.substring(0, colonIndex);
                const value = line.substring(colonIndex + 1);

                // Handle property parameters (e.g., DTSTART;TZID=America/Los_Angeles:20230101T120000)
                const semiColonIndex = propertyPart.indexOf(";");
                const property = semiColonIndex > 0
                    ? propertyPart.substring(0, semiColonIndex)
                    : propertyPart;

                // Handle common properties
                if (property === "UID") {
                    currentEventId = value;
                } else if (property === "SUMMARY") {
                    currentEvent.summary = value;
                } else if (property === "DESCRIPTION") {
                    currentEvent.description = value;
                } else if (property === "CREATED") {
                    currentEvent.created = new Date(parseICalDate(value));
                } else if (property === "DTSTART") {
                    currentEvent.start = new Date(parseICalDate(value));
                } else if (property === "DTEND") {
                    currentEvent.end = new Date(parseICalDate(value));
                } else {
                    // For other properties, store them as-is
                    currentEvent[property.toLowerCase()] = value;
                }
            }
        }
    }

    return events;
}

/**
 * Parse iCal date format to a JavaScript Date
 * Handles various formats including:
 * - 20211224T123000Z (UTC)
 * - 20211224T123000 (local)
 */
function parseICalDate(icalDate: string): string {
    // Remove any timezone identifier
    const cleanDate = icalDate.replace("Z", "");

    // Format with dashes and colons for parsing
    if (cleanDate.includes("T")) {
        // Has time component
        const dateString = cleanDate.replace(
            /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
            "$1-$2-$3T$4:$5:$6",
        );
        return dateString;
    } else {
        // Date only
        const dateString = cleanDate.replace(
            /(\d{4})(\d{2})(\d{2})/,
            "$1-$2-$3",
        );
        return dateString;
    }
}

/**
 * Interface for parsed PLD/SDV request extracted from iCal entry
 */
export interface ParsedPldSdvRequest {
    firstName: string;
    lastName: string;
    leaveType: "PLD" | "SDV";
    requestDate: Date; // From DTSTART
    isWaitlisted: boolean; // True if "denied req" is present
    originalRequestDate: Date | null; // For waitlisted items, constructed from MM/DD + created year
    createdAt: Date; // From CREATED field
}

/**
 * Parse an iCal file content and extract PLD/SDV requests within the specified year
 *
 * @param icalContent - String content of the .ics file
 * @param targetYear - Year to filter events by (from selected calendar)
 * @returns Array of parsed PLD/SDV requests
 */
export function parseICalForPldSdvRequests(
    icalContent: string,
    targetYear: number,
): ParsedPldSdvRequest[] {
    // Parse the iCal content
    const parsedCal = parseICS(icalContent);
    const parsedRequests: ParsedPldSdvRequest[] = [];

    // Process each event in the calendar
    Object.values(parsedCal).forEach((event: CalendarComponent) => {
        // Skip entries without required fields
        if (!event.summary || !event.start) return;

        // Only process events within the target year
        if (event.start.getFullYear() !== targetYear) return;

        try {
            // Parse the summary to extract name, leave type, and waitlist info
            const parsedSummary = parseSummary(event.summary);
            if (!parsedSummary) return;

            const {
                firstName,
                lastName,
                leaveType,
                isWaitlisted,
                originalRequestMonthDay,
            } = parsedSummary;

            // Prepare the parsed request
            const parsedRequest: ParsedPldSdvRequest = {
                firstName,
                lastName,
                leaveType,
                requestDate: event.start,
                isWaitlisted,
                originalRequestDate: null,
                createdAt: event.created || new Date(),
            };

            // For waitlisted items, construct the original request date
            if (isWaitlisted && originalRequestMonthDay) {
                // Extract year from created date, or fallback to event start year
                const year = event.created?.getFullYear() ||
                    event.start.getFullYear();
                const [month, day] = originalRequestMonthDay.split("/").map(
                    Number,
                );

                if (!isNaN(month) && !isNaN(day)) {
                    parsedRequest.originalRequestDate = new Date(
                        year,
                        month - 1,
                        day,
                    );
                }
            }

            parsedRequests.push(parsedRequest);
        } catch (error) {
            console.error(`Error parsing event: ${event.summary}`, error);
            // Continue processing other events
        }
    });

    return parsedRequests;
}

/**
 * Extract information from the summary field of iCal event
 *
 * Standard formats:
 * - "{First Name} {Last Name} {Leave Type}"
 * - "{Last Name}, {First Name} {Leave Type}"
 * - "{First Name} {Last Name}-{Leave Type}" (no space between name and leave type)
 * - "{Last Name}, {First Name}-{Leave Type}" (no space between name and leave type)
 * - "{Last Name}-{Leave Type}" (single name treated as last name)
 * - "{Last Name} - {Leave Type}" (single name treated as last name, with spaces around dash)
 * - "{Last Name}- {Leave Type}" (single name treated as last name, with space after dash)
 * - "{Last Name} -{Leave Type}" (single name treated as last name, with space before dash)
 * - "{Last Name} {Leave Type}" (single name treated as last name, space separator)
 *
 * Waitlisted formats:
 * - "{First Name} {Last Name} {Leave Type} denied req {MM/DD}"
 * - "{Last Name}, {First Name} {Leave Type} denied req {MM/DD}"
 * - "{Last Name} {Leave Type} denied req {MM/DD}" (single name treated as last name)
 *
 * NOTE: When only a single name is present in the summary (without a comma separator),
 * we always treat it as a last name and leave the first name empty.
 */
export function parseSummary(summary: string): {
    firstName: string;
    lastName: string;
    leaveType: "PLD" | "SDV";
    isWaitlisted: boolean;
    originalRequestMonthDay: string | null;
} | null {
    console.log(`[iCalParser] Parsing summary: "${summary}"`);

    // Normalize the summary to handle inconsistent spacing around dash
    // Replace dash with space-dash-space, then collapse multiple spaces
    const normalizedSummary = summary
        .replace(/\s*-\s*/g, " - ")
        .replace(/\s+/g, " ")
        .trim();

    // Handle the case where we have a single word followed by SDV or PLD with various dash formats
    // This handles "FORD-SDV", "Ford - SDV", "Ford- SDV", "FORD -SDV"
    // Single name is always treated as last name
    const singleNameLeaveTypeRegex = /^([A-Za-z\-\.\']+)\s+-\s+(PLD|SDV)$/i;
    const singleNameLeaveTypeMatch = normalizedSummary.match(
        singleNameLeaveTypeRegex,
    );

    if (singleNameLeaveTypeMatch) {
        const [, rawName, rawLeaveType] = singleNameLeaveTypeMatch;
        const lastName = rawName.trim();
        const leaveType = rawLeaveType.toUpperCase() as "PLD" | "SDV";

        console.log(
            `[iCalParser] Matched single name with dash format: ${lastName} - ${leaveType}`,
        );

        return {
            firstName: "", // Empty first name for single name entries - always treat as last name
            lastName,
            leaveType,
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Handle waitlisted version of the single name with dash
    // Single name is always treated as last name
    const singleNameLeaveTypeWaitlistedRegex =
        /^([A-Za-z\-\.\']+)\s+-\s+(PLD|SDV)\s+denied\s+req\s+(\d{1,2}\/\d{1,2})$/i;
    const singleNameLeaveTypeWaitlistedMatch = normalizedSummary.match(
        singleNameLeaveTypeWaitlistedRegex,
    );

    if (singleNameLeaveTypeWaitlistedMatch) {
        const [, rawName, rawLeaveType, originalRequestMonthDay] =
            singleNameLeaveTypeWaitlistedMatch;
        const lastName = rawName.trim();
        const leaveType = rawLeaveType.toUpperCase() as "PLD" | "SDV";

        console.log(
            `[iCalParser] Matched single name with dash format (waitlisted): ${lastName} - ${leaveType} denied req ${originalRequestMonthDay}`,
        );

        return {
            firstName: "", // Empty first name for single name entries - always treat as last name
            lastName,
            leaveType,
            isWaitlisted: true,
            originalRequestMonthDay,
        };
    }

    // Format with no space between name and leave type (like "Ford-PLD")
    // Single name is always treated as last name
    let nameWithNoSpaceMatch = summary.match(
        /^([A-Za-z\-\.\']+)(?:\-)(PLD|SDV)$/,
    );
    if (nameWithNoSpaceMatch) {
        const [, rawName, leaveType] = nameWithNoSpaceMatch;
        const lastName = rawName.trim();
        console.log(
            `[iCalParser] Matched single name with no space before leave type: ${lastName}-${leaveType}`,
        );
        return {
            firstName: "", // Empty first name for single name entries - always treat as last name
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Try to match "Last Name Only" format with space (FORD PLD)
    // Single name is always treated as last name
    let lastNameOnlyStandardMatch = summary.match(
        /^([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)$/,
    );
    if (lastNameOnlyStandardMatch) {
        const [, rawLastName, leaveType] = lastNameOnlyStandardMatch;
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched LastNameOnly standard format: ${lastName} ${leaveType}`,
        );
        return {
            firstName: "", // Empty first name for single name entries - always treat as last name
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Try to match "Last Name Only" waitlisted format
    // Single name is always treated as last name
    let lastNameOnlyWaitlistedMatch = summary.match(
        /^([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)\s+denied\s+req\s+(\d{1,2}\/\d{1,2})$/,
    );
    if (lastNameOnlyWaitlistedMatch) {
        const [
            ,
            rawLastName,
            leaveType,
            originalRequestMonthDay,
        ] = lastNameOnlyWaitlistedMatch;
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched LastNameOnly waitlisted format: ${lastName} ${leaveType} denied req ${originalRequestMonthDay}`,
        );
        return {
            firstName: "", // Empty first name for single name entries - always treat as last name
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: true,
            originalRequestMonthDay,
        };
    }

    // Define regex patterns for different formats
    // Format with "Last, First PLD"
    const lastFirstStandardRegex =
        /^([A-Za-z\-\']+),\s*([A-Za-z\-\']+)\s+(?:\-\s*)?(PLD|SDV)$/;
    const lastFirstWaitlistedRegex =
        /^([A-Za-z\-\']+),\s*([A-Za-z\-\']+)\s+(?:\-\s*)?(PLD|SDV)\s+denied\s+req\s+(\d{1,2}\/\d{1,2})$/;

    // Format with "First Last PLD"
    const firstLastStandardRegex =
        /^([A-Za-z\-\.\']+)\s+([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)$/;
    const firstLastWaitlistedRegex =
        /^([A-Za-z\-\.\']+)\s+([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)\s+denied\s+req\s+(\d{1,2}\/\d{1,2})$/;

    // Format with "Initial. LastName - PLD"
    const initialLastNameStandardRegex =
        /^([A-Za-z]\.)\s+([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)$/;
    const initialLastNameWaitlistedRegex =
        /^([A-Za-z]\.)\s+([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)\s+denied\s+req\s+(\d{1,2}\/\d{1,2})$/;

    // Try to match the case with no space between name and leave type first
    let twoPartNameWithNoSpaceMatch = summary.match(
        /([A-Za-z\-\.\']+)\s+([A-Za-z\-\.\']+)\s+(?:\-\s*)?(PLD|SDV)$/,
    );
    if (twoPartNameWithNoSpaceMatch) {
        const [, rawFirstName, rawLastName, leaveType] =
            twoPartNameWithNoSpaceMatch;
        const firstName = rawFirstName.trim();
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched FirstLast with no space before leave type: ${firstName} ${lastName}-${leaveType}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    let lastFirstWithNoSpaceMatch = summary.match(
        /^([A-Za-z\-\']+),\s*([A-Za-z\-\']+)(?:\-)(PLD|SDV)$/,
    );
    if (lastFirstWithNoSpaceMatch) {
        const [, rawLastName, rawFirstName, leaveType] =
            lastFirstWithNoSpaceMatch;
        const lastName = rawLastName.trim();
        const firstName = rawFirstName.trim();
        console.log(
            `[iCalParser] Matched Last,First with no space before leave type: ${lastName}, ${firstName}-${leaveType}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Try to match the "Last, First" format
    let lastFirstWaitlistedMatch = summary.match(lastFirstWaitlistedRegex);
    if (lastFirstWaitlistedMatch) {
        const [
            ,
            rawLastName,
            rawFirstName,
            leaveType,
            originalRequestMonthDay,
        ] = lastFirstWaitlistedMatch;
        const lastName = rawLastName.trim();
        const firstName = rawFirstName.trim();
        console.log(
            `[iCalParser] Matched Last,First waitlisted format: ${lastName}, ${firstName} ${leaveType} denied req ${originalRequestMonthDay}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: true,
            originalRequestMonthDay,
        };
    }

    let lastFirstStandardMatch = summary.match(lastFirstStandardRegex);
    if (lastFirstStandardMatch) {
        const [, rawLastName, rawFirstName, leaveType] = lastFirstStandardMatch;
        const lastName = rawLastName.trim();
        const firstName = rawFirstName.trim();
        console.log(
            `[iCalParser] Matched Last,First standard format: ${lastName}, ${firstName} ${leaveType}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Try to match the "First Last" format
    let firstLastWaitlistedMatch = summary.match(firstLastWaitlistedRegex);
    if (firstLastWaitlistedMatch) {
        const [
            ,
            rawFirstName,
            rawLastName,
            leaveType,
            originalRequestMonthDay,
        ] = firstLastWaitlistedMatch;
        const firstName = rawFirstName.trim();
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched FirstLast waitlisted format: ${firstName} ${lastName} ${leaveType} denied req ${originalRequestMonthDay}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: true,
            originalRequestMonthDay,
        };
    }

    let firstLastStandardMatch = summary.match(firstLastStandardRegex);
    if (firstLastStandardMatch) {
        const [, rawFirstName, rawLastName, leaveType] = firstLastStandardMatch;
        const firstName = rawFirstName.trim();
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched FirstLast standard format: ${firstName} ${lastName} ${leaveType}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Try to match "Initial. LastName" format
    let initialLastNameWaitlistedMatch = summary.match(
        initialLastNameWaitlistedRegex,
    );
    if (initialLastNameWaitlistedMatch) {
        const [
            ,
            rawFirstInitial,
            rawLastName,
            leaveType,
            originalRequestMonthDay,
        ] = initialLastNameWaitlistedMatch;
        const firstName = rawFirstInitial.trim();
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched Initial.LastName waitlisted format: ${firstName} ${lastName} ${leaveType} denied req ${originalRequestMonthDay}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: true,
            originalRequestMonthDay,
        };
    }

    let initialLastNameStandardMatch = summary.match(
        initialLastNameStandardRegex,
    );
    if (initialLastNameStandardMatch) {
        const [, rawFirstInitial, rawLastName, leaveType] =
            initialLastNameStandardMatch;
        const firstName = rawFirstInitial.trim();
        const lastName = rawLastName.trim();
        console.log(
            `[iCalParser] Matched Initial.LastName standard format: ${firstName} ${lastName} ${leaveType}`,
        );
        return {
            firstName,
            lastName,
            leaveType: leaveType as "PLD" | "SDV",
            isWaitlisted: false,
            originalRequestMonthDay: null,
        };
    }

    // Handle more complex names with multiple parts
    // Try to extract leave type first, then figure out the name parts
    const leaveTypeMatch = summary.match(/(?:(?:\s|\-))(PLD|SDV)/);
    if (leaveTypeMatch) {
        const leaveType = leaveTypeMatch[1] as "PLD" | "SDV";
        const leaveTypeIndex = summary.indexOf(leaveTypeMatch[0]);
        const leaveTypeStartIndex = summary.indexOf(leaveType);

        // Extract the name part (everything before the leave type or dash+leave type)
        let namePart = summary.substring(0, leaveTypeIndex).trim();

        // Check if it contains a comma (Last, First format)
        if (namePart.includes(",")) {
            const [rawLastName, rawFirstName] = namePart.split(",").map((
                part,
            ) => part.trim());
            const lastName = rawLastName.trim();
            const firstName = rawFirstName ? rawFirstName.trim() : "";

            // Check for waitlisted format
            const restOfSummary = summary.substring(
                leaveTypeStartIndex + leaveType.length,
            ).trim();
            const waitlistedMatch = restOfSummary.match(
                /denied\s+req\s+(\d{1,2}\/\d{1,2})/,
            );

            console.log(
                `[iCalParser] Parsed complex Last,First format: ${lastName}, ${firstName} ${leaveType}`,
            );
            return {
                firstName,
                lastName,
                leaveType,
                isWaitlisted: !!waitlistedMatch,
                originalRequestMonthDay: waitlistedMatch
                    ? waitlistedMatch[1]
                    : null,
            };
        } else {
            // Check if there's only one word (Last Name only)
            const words = namePart.split(/\s+/).filter((w) => w.length > 0);

            if (words.length === 1) {
                const lastName = words[0].trim();

                // Check for waitlisted format
                const restOfSummary = summary.substring(
                    leaveTypeStartIndex + leaveType.length,
                ).trim();
                const waitlistedMatch = restOfSummary.match(
                    /denied\s+req\s+(\d{1,2}\/\d{1,2})/,
                );

                console.log(
                    `[iCalParser] Parsed complex LastNameOnly format: ${lastName} ${leaveType}`,
                );
                return {
                    firstName: "",
                    lastName,
                    leaveType,
                    isWaitlisted: !!waitlistedMatch,
                    originalRequestMonthDay: waitlistedMatch
                        ? waitlistedMatch[1]
                        : null,
                };
            } // Check if first word is an initial with period
            else if (words.length >= 2 && /^[A-Za-z]\.$/.test(words[0])) {
                const firstName = words[0].trim();
                const lastName = words.slice(1).join(" ").trim();

                // Check for waitlisted format
                const restOfSummary = summary.substring(
                    leaveTypeStartIndex + leaveType.length,
                ).trim();
                const waitlistedMatch = restOfSummary.match(
                    /denied\s+req\s+(\d{1,2}\/\d{1,2})/,
                );

                console.log(
                    `[iCalParser] Parsed complex Initial.LastName format: ${firstName} ${lastName} ${leaveType}`,
                );
                return {
                    firstName,
                    lastName,
                    leaveType,
                    isWaitlisted: !!waitlistedMatch,
                    originalRequestMonthDay: waitlistedMatch
                        ? waitlistedMatch[1]
                        : null,
                };
            } // Assume First Last format, with last word before leave type as last name
            else if (words.length >= 2) {
                const rawLastName = words.pop() || "";
                const rawFirstName = words.join(" ");
                const lastName = rawLastName.trim();
                const firstName = rawFirstName.trim();

                // Check for waitlisted format
                const restOfSummary = summary.substring(
                    leaveTypeStartIndex + leaveType.length,
                ).trim();
                const waitlistedMatch = restOfSummary.match(
                    /denied\s+req\s+(\d{1,2}\/\d{1,2})/,
                );

                console.log(
                    `[iCalParser] Parsed complex FirstLast format: ${firstName} ${lastName} ${leaveType}`,
                );
                return {
                    firstName,
                    lastName,
                    leaveType,
                    isWaitlisted: !!waitlistedMatch,
                    originalRequestMonthDay: waitlistedMatch
                        ? waitlistedMatch[1]
                        : null,
                };
            }
        }
    }

    console.log(`[iCalParser] Failed to parse summary: "${summary}"`);
    return null;
}

/**
 * Validates that an event falls within the target year
 * Required for filtering events outside the target calendar year
 *
 * @param eventDate - Date to validate
 * @param targetYear - Target year for import
 * @returns Boolean indicating if event is within target year
 */
export function isEventInTargetYear(
    eventDate: Date,
    targetYear: number,
): boolean {
    return eventDate.getFullYear() === targetYear;
}

/**
 * Handles edge cases that might appear in iCal files
 * - Names with apostrophes, hyphens, or multiple spaces
 * - Mixed case in leave types
 * - Various date formats
 *
 * @param icalContent - Raw iCal content
 * @returns Normalized iCal content
 */
export function normalizeICalContent(icalContent: string): string {
    if (!icalContent || typeof icalContent !== "string") {
        throw new Error("Invalid iCal content provided");
    }

    // Ensure proper line endings
    let normalized = icalContent
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\n\s+/g, "") // Handle folded lines (RFC 5545)
        .replace(/\\n/g, "\n");

    // Ensure uppercase for event boundaries and properties
    normalized = normalized
        .replace(/begin:vevent/gi, "BEGIN:VEVENT")
        .replace(/end:vevent/gi, "END:VEVENT")
        .replace(/summary:/gi, "SUMMARY:")
        .replace(/description:/gi, "DESCRIPTION:")
        .replace(/dtstart:/gi, "DTSTART:")
        .replace(/dtend:/gi, "DTEND:")
        .replace(/created:/gi, "CREATED:")
        .replace(/last-modified:/gi, "LAST-MODIFIED:");

    // Ensure uppercase for leave types in content
    normalized = normalized
        .replace(/PLD/gi, "PLD")
        .replace(/SDV/gi, "SDV");

    return normalized;
}
