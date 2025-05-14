import { ParsedPldSdvRequest } from "./iCalParser";
import { findMembersByName, MemberData } from "./memberLookup";
import { supabase } from "@/utils/supabase";

/**
 * Interface for import preview item
 */
export interface ImportPreviewItem {
    firstName: string;
    lastName: string;
    requestDate: Date;
    leaveType: "PLD" | "SDV";
    status: "approved" | "waitlisted";
    requestedAt: Date;
    calendarId: string;
    matchedMember: MatchedMemberResult;
    isPotentialDuplicate: boolean;
    originalICalData: ParsedPldSdvRequest;
}

/**
 * Interface for matched member result
 */
export interface MatchedMemberResult {
    status: "matched" | "multiple_matches" | "unmatched";
    member?: MemberData;
    possibleMatches?: MemberData[];
}

/**
 * Generate preview of iCal import data with member matching and duplicate detection
 *
 * @param parsedRequests - Array of parsed PLD/SDV requests from iCal
 * @param calendarId - Target calendar ID for import
 * @param divisionId - Division ID for focusing member search
 * @returns Promise resolving to array of import preview items
 */
export async function generateImportPreview(
    parsedRequests: ParsedPldSdvRequest[],
    calendarId: string,
    divisionId?: number,
): Promise<ImportPreviewItem[]> {
    // console.log(
    //     `[importPreviewService] generateImportPreview called with calendarId: ${calendarId}, divisionId: ${divisionId}`,
    // );
    const previewItems: ImportPreviewItem[] = [];

    // Process each parsed request
    for (const parsedRequest of parsedRequests) {
        try {
            // Find matching member(s)
            const matchedMember = await findMatchingMember(
                parsedRequest.firstName,
                parsedRequest.lastName,
                divisionId,
            );

            // Determine status based on waitlisting
            const status = parsedRequest.isWaitlisted
                ? "waitlisted"
                : "approved";

            // Determine requested_at timestamp
            // For waitlisted items, use the original request date if available, otherwise use creation date
            // For approved items, use creation date
            const requestedAt =
                status === "waitlisted" && parsedRequest.originalRequestDate
                    ? parsedRequest.originalRequestDate
                    : parsedRequest.createdAt;

            // Check for potential duplicates if we have a matched member
            let isPotentialDuplicate = false;
            if (matchedMember.status === "matched" && matchedMember.member) {
                isPotentialDuplicate = await checkForDuplicate(
                    matchedMember.member.id || null,
                    matchedMember.member.pin_number,
                    parsedRequest.requestDate,
                    calendarId,
                );
            }

            // Create preview item
            const previewItem: ImportPreviewItem = {
                firstName: parsedRequest.firstName,
                lastName: parsedRequest.lastName,
                requestDate: parsedRequest.requestDate,
                leaveType: parsedRequest.leaveType,
                status,
                requestedAt,
                calendarId,
                matchedMember,
                isPotentialDuplicate,
                originalICalData: parsedRequest,
            };

            previewItems.push(previewItem);
        } catch (error) {
            console.error(
                `Error processing request for ${parsedRequest.firstName} ${parsedRequest.lastName}:`,
                error,
            );
        }
    }

    return previewItems;
}

/**
 * Find matching member for a name
 *
 * @param firstName - First name to match
 * @param lastName - Last name to match
 * @param divisionId - Optional division ID to restrict search
 * @returns Promise resolving to matched member result
 */
async function findMatchingMember(
    firstName: string,
    lastName: string,
    divisionId?: number,
): Promise<MatchedMemberResult> {
    // console.log(
    //     `[importPreviewService] findMatchingMember called for "${firstName} ${lastName}", divisionId: ${divisionId}`,
    // );
    try {
        console.log(
            `[importPreviewService] Finding matching member for "${firstName} ${lastName}" in division ${
                divisionId || "all"
            }`,
        );

        // Ensure names aren't empty
        if (!firstName && !lastName) {
            console.warn(
                "[importPreviewService] Empty name provided for member matching",
            );
            return { status: "unmatched" };
        }

        // Find members by name with fuzzy matching
        const matchedMembers = await findMembersByName(
            firstName,
            lastName,
            divisionId, // Pass division ID to limit search scope
        );

        console.log(
            `[importPreviewService] Found ${matchedMembers.length} potential matches`,
        );

        if (matchedMembers.length === 0) {
            // No matches found
            console.log(
                `[importPreviewService] No matches found for "${firstName} ${lastName}"`,
            );
            return {
                status: "unmatched",
            };
        }

        // Check for high confidence matches (exact matches or very high confidence)
        const highConfidenceMatches = matchedMembers.filter((match) =>
            match.matchConfidence >= 90
        );

        if (highConfidenceMatches.length === 1) {
            // Single high confidence match found
            console.log(
                `[importPreviewService] Single high confidence match found: ${
                    highConfidenceMatches[0].member.first_name
                } ${highConfidenceMatches[0].member.last_name}`,
            );
            return {
                status: "matched",
                member: highConfidenceMatches[0].member,
            };
        }

        if (matchedMembers.length === 1) {
            // Single match found
            console.log(
                `[importPreviewService] Single match found: ${
                    matchedMembers[0].member.first_name
                } ${matchedMembers[0].member.last_name}`,
            );
            return {
                status: "matched",
                member: matchedMembers[0].member,
            };
        }

        // Multiple possible matches - if one has significantly higher confidence, use it
        const topMatch = matchedMembers[0];
        const secondMatch = matchedMembers[1];

        if (
            topMatch.matchConfidence >= 80 &&
            topMatch.matchConfidence - secondMatch.matchConfidence > 20
        ) {
            // Top match has significantly higher confidence
            console.log(
                `[importPreviewService] Using top match with significantly higher confidence: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
            );
            return {
                status: "matched",
                member: topMatch.member,
            };
        }

        // Multiple viable matches
        console.log(
            `[importPreviewService] Multiple matches found for "${firstName} ${lastName}" - returning for user selection`,
        );
        return {
            status: "multiple_matches",
            possibleMatches: matchedMembers.map((match) => match.member),
        };
    } catch (error) {
        console.error(
            "[importPreviewService] Error finding matching member:",
            error,
        );
        return {
            status: "unmatched",
        };
    }
}

/**
 * Check if request would be a duplicate of existing one
 *
 * @param memberId - Member ID (if available)
 * @param pinNumber - PIN number
 * @param requestDate - Request date to check
 * @param calendarId - Calendar ID
 * @returns Promise resolving to boolean indicating if duplicate exists
 */
async function checkForDuplicate(
    memberId: string | null,
    pinNumber: number,
    requestDate: Date,
    calendarId: string,
): Promise<boolean> {
    try {
        // Format date to ISO string for comparison
        const formattedDate = requestDate.toISOString().split("T")[0];

        // Build query based on available identifiers
        let query = supabase
            .from("pld_sdv_requests")
            .select("id")
            .eq("calendar_id", calendarId)
            .eq("request_date", formattedDate);

        if (memberId) {
            query = query.eq("member_id", memberId);
        } else {
            query = query.eq("pin_number", pinNumber);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error checking for duplicate request:", error);
            return false;
        }

        // Duplicate exists if data has any elements
        return data !== null && data.length > 0;
    } catch (error) {
        console.error("Error checking for duplicate:", error);
        return false;
    }
}

/**
 * Prepare final import data from preview items
 *
 * @param previewItems - Array of reviewed preview items
 * @param selectedItems - Array of selected item indices to include
 * @returns Array of objects ready for database insertion
 */
export function prepareImportData(
    previewItems: ImportPreviewItem[],
    selectedItems: number[],
): any[] {
    return selectedItems.map((index) => {
        const item = previewItems[index];

        // Determine which member identifier to use
        let memberId = null;
        let pinNumber = null;

        if (
            item.matchedMember.status === "matched" && item.matchedMember.member
        ) {
            memberId = item.matchedMember.member.id;
            pinNumber = item.matchedMember.member.pin_number;
        } else if (
            item.matchedMember.status === "multiple_matches" &&
            item.matchedMember.possibleMatches &&
            item.matchedMember.possibleMatches.length > 0
        ) {
            // This would be set by admin selection in the UI
            // For now, we're using the first possible match as fallback
            memberId = item.matchedMember.possibleMatches[0].id;
            pinNumber = item.matchedMember.possibleMatches[0].pin_number;
        } else {
            // Unmatched - only use name for logging purposes
            pinNumber = null; // This would be set by admin manually in the UI
        }

        // Format date for database insertion
        const formattedRequestDate =
            item.requestDate.toISOString().split("T")[0];
        const formattedRequestedAt = item.requestedAt.toISOString();

        return {
            member_id: memberId,
            pin_number: pinNumber,
            calendar_id: item.calendarId,
            request_date: formattedRequestDate,
            leave_type: item.leaveType,
            status: item.status,
            requested_at: formattedRequestedAt,
            import_source: "ical",
            imported_at: new Date().toISOString(),
        };
    });
}
