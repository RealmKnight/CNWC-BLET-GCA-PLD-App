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
            `[importPreviewService] Found ${matchedMembers.length} potential matches for "${firstName} ${lastName}"`,
        );

        // Debug log the top matches
        if (matchedMembers.length > 0) {
            matchedMembers.slice(0, Math.min(3, matchedMembers.length)).forEach(
                (match, idx) => {
                    console.log(
                        `[importPreviewService] Match #${
                            idx + 1
                        }: ${match.member.first_name} ${match.member.last_name} (${match.matchConfidence}% confidence)`,
                    );
                },
            );
        }

        if (matchedMembers.length === 0) {
            // No matches found
            console.log(
                `[importPreviewService] No matches found for "${firstName} ${lastName}"`,
            );
            return {
                status: "unmatched",
            };
        }

        // Check for high confidence matches (exact matches, phonetic matches, or very high confidence)
        // Match thresholds: 100% (exact), 95% (near exact), 92% (phonetic/spelling match)
        const highConfidenceThresholds = [100, 95, 92];

        // Look for matches at each threshold level
        for (const threshold of highConfidenceThresholds) {
            const confidenceMatches = matchedMembers.filter((match) =>
                match.matchConfidence >= threshold
            );

            if (confidenceMatches.length === 1) {
                // Found a single high-confidence match
                console.log(
                    `[importPreviewService] Found single ${
                        threshold === 100
                            ? "exact"
                            : threshold === 95
                            ? "near-exact"
                            : "phonetic/spelling"
                    } match: ${confidenceMatches[0].member.first_name} ${
                        confidenceMatches[0].member.last_name
                    } (${confidenceMatches[0].matchConfidence}%)`,
                );
                return {
                    status: "matched",
                    member: confidenceMatches[0].member,
                };
            }
        }

        // Handle case with a single match regardless of confidence
        if (matchedMembers.length === 1) {
            console.log(
                `[importPreviewService] Single match found: ${
                    matchedMembers[0].member.first_name
                } ${matchedMembers[0].member.last_name} (${
                    matchedMembers[0].matchConfidence
                }%)`,
            );
            return {
                status: "matched",
                member: matchedMembers[0].member,
            };
        }

        // Multiple possible matches - if one has significantly higher confidence, use it
        const topMatch = matchedMembers[0];
        const secondMatch = matchedMembers[1];

        // Log the comparison between top matches for debugging
        console.log(
            `[importPreviewService] Top match: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
        );
        console.log(
            `[importPreviewService] Second match: ${secondMatch.member.first_name} ${secondMatch.member.last_name} (${secondMatch.matchConfidence}%)`,
        );
        console.log(
            `[importPreviewService] Confidence difference: ${
                topMatch.matchConfidence - secondMatch.matchConfidence
            }%`,
        );

        // Check common first name situation
        // If we're matching a common first name (e.g., "Mike"), be more strict about the confidence
        // difference required
        const commonFirstNames = [
            "mike",
            "michael",
            "john",
            "jim",
            "dave",
            "david",
            "bob",
            "robert",
            "tom",
            "thomas",
            "joe",
            "dan",
            "steve",
            "chris",
            "matt",
            "will",
            "bill",
            "nate", // Added for the Nate/Nathan example
            "nathan",
            "nick",
            "nicholas",
            "anthony",
            "christopher",
            "matthew",
            "steven",
            "alexander",
            "jonathan",
        ];
        const isCommonFirstName = commonFirstNames.includes(
            firstName.toLowerCase(),
        );

        // Adjusted thresholds based on name commonality
        const requiredConfidence = isCommonFirstName ? 85 : 80;
        const requiredConfidenceDifference = isCommonFirstName ? 30 : 25;

        if (
            topMatch.matchConfidence >= requiredConfidence &&
            topMatch.matchConfidence - secondMatch.matchConfidence >
                requiredConfidenceDifference
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

        // If we got this far but the top match is still very high confidence (>= 85%)
        // and likely a phonetic/misspelling match (hence why we didn't catch it earlier),
        // we can consider using it if the first name also matches well
        if (lastName && topMatch.matchConfidence >= 85) {
            // Check if first name is a close match or variant
            const isFirstNameMatch =
                topMatch.member.first_name?.toLowerCase() ===
                    firstName.toLowerCase() ||
                isNameVariant(
                    firstName.toLowerCase(),
                    topMatch.member.first_name?.toLowerCase() || "",
                );

            if (isFirstNameMatch) {
                console.log(
                    `[importPreviewService] Using phonetic/misspelling match with good first name: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
                );
                return {
                    status: "matched",
                    member: topMatch.member,
                };
            }
        }

        // Special case: If last names match exactly and first names are similar
        if (firstName && lastName && topMatch.matchConfidence >= 70) {
            const topMatchLastName = topMatch.member.last_name?.toLowerCase() ||
                "";
            if (topMatchLastName === lastName.toLowerCase()) {
                console.log(
                    `[importPreviewService] Using top match with exact last name match: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
                );
                return {
                    status: "matched",
                    member: topMatch.member,
                };
            }
        }

        // Check for misspelled name specifically (Wilbur vs Willbur example)
        // If the top match looks close enough and might be a misspelling
        const namePatternsDiff = [
            ["l", "ll"],
            ["n", "nn"],
            ["m", "mm"],
            ["t", "tt"], // doubled consonants
            ["c", "k"], // common phonetic equivalents
            ["i", "e"],
            ["a", "e"],
            ["a", "o"],
            ["e", "a"], // common vowel swaps
        ];

        if (lastName && topMatch.member.last_name) {
            // Check if the last names differ only by doubled consonants or other common patterns
            const inputLastName = lastName.toLowerCase();
            const matchLastName = topMatch.member.last_name.toLowerCase();

            let isMisspellingPattern = false;

            // Simple check for common misspelling patterns
            for (const [a, b] of namePatternsDiff) {
                if (
                    inputLastName.replace(a, b) === matchLastName ||
                    matchLastName.replace(a, b) === inputLastName ||
                    inputLastName.replace(b, a) === matchLastName ||
                    matchLastName.replace(b, a) === inputLastName
                ) {
                    isMisspellingPattern = true;
                    break;
                }
            }

            if (isMisspellingPattern && topMatch.matchConfidence >= 65) {
                console.log(
                    `[importPreviewService] Using match with likely misspelled last name: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
                );
                return {
                    status: "matched",
                    member: topMatch.member,
                };
            }
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

// Helper function to check if two names are variants (shortened version for importPreviewService)
function isNameVariant(name1: string, name2: string): boolean {
    if (!name1 || !name2) return false;

    const nameVariants: Record<string, string[]> = {
        michael: ["mike", "mick"],
        robert: ["rob", "bob"],
        william: ["will", "bill"],
        james: ["jim", "jimmy"],
        thomas: ["tom"],
        joseph: ["joe"],
        daniel: ["dan"],
        richard: ["rick", "dick"],
        nicholas: ["nick"],
        anthony: ["tony"],
        donald: ["don"],
        christopher: ["chris"],
        matthew: ["matt"],
        steven: ["steve"],
        alexander: ["alex"],
        david: ["dave"],
        jonathan: ["jon", "john"],
        samuel: ["sam"],
        patrick: ["pat"],
        timothy: ["tim"],
        nathan: ["nate", "nat"], // Added for the Nate/Nathan example
    };

    const name1Lower = name1.toLowerCase();
    const name2Lower = name2.toLowerCase();

    // Check if names are identical
    if (name1Lower === name2Lower) {
        return true;
    }

    // Check if one name is a variant of the other
    for (const [base, variants] of Object.entries(nameVariants)) {
        if (name1Lower === base && variants.includes(name2Lower)) {
            return true;
        }
        if (name2Lower === base && variants.includes(name1Lower)) {
            return true;
        }
        if (variants.includes(name1Lower) && variants.includes(name2Lower)) {
            return true;
        }
    }

    return false;
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
            metadata: {
                from_import: true,
                import_source: "ical",
                original_status: item.status,
                imported_at: new Date().toISOString(),
            },
        };
    });
}
