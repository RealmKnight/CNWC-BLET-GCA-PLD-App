import { supabase } from "@/utils/supabase";

/**
 * Interface for member data returned from database
 */
export interface MemberData {
    id?: string;
    pin_number: number;
    first_name: string | null;
    last_name: string | null;
    status?: string | null;
    division_id?: number | null;
}

/**
 * Interface for matched member result
 */
export interface MatchedMember {
    member: MemberData;
    matchConfidence: number; // 0-100, with 100 being exact match
}

/**
 * Find members by name using improved fuzzy matching
 *
 * @param firstName - First name to search for
 * @param lastName - Last name to search for
 * @param divisionId - Optional division ID to restrict search
 * @returns Promise resolving to array of potential matching members with confidence scores
 */
export async function findMembersByName(
    firstName: string,
    lastName: string,
    divisionId?: number,
): Promise<MatchedMember[]> {
    // Normalize names for DB query (less aggressive)
    const queryFirstName = firstName.trim().toLowerCase();
    const queryLastName = lastName.trim().toLowerCase();

    // Normalize names for precise matching (more aggressive)
    const matchFirstName = queryFirstName.replace(/[^a-z0-9]/gi, "");
    const matchLastName = queryLastName.replace(/[^a-z0-9]/gi, "");

    // console.log(
    //     `[memberLookup] findMembersByName received call for: "${queryFirstName} ${queryLastName}" (match normalized: "${matchFirstName} ${matchLastName}") with divisionId: ${divisionId}`,
    // );

    if (!matchFirstName && !matchLastName) {
        console.log(
            "[memberLookup] No valid name provided for search after normalization",
        );
        return [];
    }

    // Query database for members with similar names
    let query = supabase
        .from("members")
        .select("id, pin_number, first_name, last_name, status, division_id");

    // Add division filter if provided
    if (divisionId !== undefined && divisionId !== null) {
        // console.log(`[memberLookup] Filtering by division_id: ${divisionId}`);
        query = query.eq("division_id", divisionId);
    }

    // Build OR condition for names for ILIKE query
    // This fetches members where either first name or last name partially matches
    const nameFilters: string[] = [];
    if (queryFirstName) {
        nameFilters.push(`first_name.ilike.%${queryFirstName}%`);
    }
    if (queryLastName) {
        nameFilters.push(`last_name.ilike.%${queryLastName}%`);
    }

    if (nameFilters.length > 0) {
        query = query.or(nameFilters.join(","));
    } else {
        // Fallback if somehow both queryFirstName and queryLastName are empty
        // though the check for matchFirstName/LastName should prevent this.
        console.log("[memberLookup] No name parts to build query filter.");
        // If divisionId is set, we might proceed to fetch all from division,
        // but generally this means no specific name search is possible.
        // For now, return empty if no name parts.
        return [];
    }

    const { data: members, error } = await query;

    if (error) {
        console.error("[memberLookup] Error finding members by name:", error);
        throw error;
    }

    // No matches found
    if (!members || members.length === 0) {
        console.log("[memberLookup] No members found in query");
        return [];
    }

    // console.log(
    //     `[memberLookup] Found ${members.length} potential members from DB query`,
    // );

    // Calculate match confidence for each member with improved scoring
    const matchedMembers: MatchedMember[] = members
        .filter((member) => member.first_name && member.last_name) // Ensure we have names to compare
        .map((member) => {
            // Normalize member names from DB the same aggressive way for precise comparison
            const memberFirstName = (member.first_name || "").trim()
                .toLowerCase().replace(/[^a-z0-9]/gi, "");
            const memberLastName = (member.last_name || "").trim().toLowerCase()
                .replace(/[^a-z0-9]/gi, "");

            // Exact match gets 100% confidence (using aggressively normalized names)
            if (
                (memberFirstName === matchFirstName &&
                    memberLastName === matchLastName && matchFirstName &&
                    matchLastName) || // Both full names match
                (memberFirstName === matchFirstName && matchFirstName &&
                    !matchLastName &&
                    memberLastName.includes(queryLastName)) || // First name exact, last name not specified for match but part of queryLastName
                (memberLastName === matchLastName && matchLastName &&
                    !matchFirstName &&
                    memberFirstName.includes(queryFirstName)) || // Last name exact, first name not specified for match but part of queryFirstName
                (memberFirstName.includes(matchFirstName) && matchFirstName && // Partial first name inclusion
                    memberLastName === matchLastName && matchLastName) ||
                (memberFirstName === matchFirstName && matchFirstName &&
                    memberLastName.includes(matchLastName) && matchLastName) // Partial last name inclusion
            ) {
                console.log(
                    `[memberLookup] STRONG MATCH (potentially exact) for ${member.first_name} ${member.last_name}`,
                );
                return { member, matchConfidence: 100 };
            }

            // Calculate partial match confidence with more weight on last name
            // First name similarity (40% weight)
            // Last name similarity (60% weight) - more important for identification
            let firstNameConfidence = calculateStringSimilarity(
                matchFirstName, // Use aggressively normalized input
                memberFirstName, // Use aggressively normalized DB name
            );
            let lastNameConfidence = calculateStringSimilarity(
                matchLastName, // Use aggressively normalized input
                memberLastName, // Use aggressively normalized DB name
            );

            // Boost confidence for partial inclusions (handles abbreviations, nicknames)
            // using aggressively normalized names
            if (matchFirstName && memberFirstName) {
                if (
                    memberFirstName.startsWith(matchFirstName) ||
                    matchFirstName.startsWith(memberFirstName)
                ) {
                    firstNameConfidence = Math.max(firstNameConfidence, 0.8); // 80% confidence for prefix match
                }
            }

            if (matchLastName && memberLastName) {
                if (
                    memberLastName.startsWith(matchLastName) ||
                    matchLastName.startsWith(memberLastName)
                ) {
                    lastNameConfidence = Math.max(lastNameConfidence, 0.9); // 90% confidence for last name prefix match
                }
            }

            // Combined weighted confidence
            const combinedConfidence = (firstNameConfidence * 0.4) +
                (lastNameConfidence * 0.6);

            // Log high confidence matches for debugging
            if (combinedConfidence > 0.7) {
                console.log(
                    `[memberLookup] High confidence match (${
                        Math.round(combinedConfidence * 100)
                    }%): ${member.first_name} ${member.last_name}`,
                );
            }

            return {
                member,
                matchConfidence: Math.round(combinedConfidence * 100), // Convert to 0-100 scale
            };
        });

    // Sort by match confidence (highest first) and filter out very low confidence matches
    const result = matchedMembers
        .sort((a, b) => b.matchConfidence - a.matchConfidence)
        .filter((match) => match.matchConfidence > 30); // Higher threshold for better matches

    console.log(
        `[memberLookup] Returning ${result.length} matches above threshold`,
    );

    return result;
}

/**
 * Find members by PIN number
 *
 * @param pinNumber - PIN number to search for
 * @returns Promise resolving to the found member or null
 */
export async function findMemberByPin(
    pinNumber: number,
): Promise<MemberData | null> {
    const { data, error } = await supabase
        .from("members")
        .select("id, pin_number, first_name, last_name, status, division_id")
        .eq("pin_number", pinNumber)
        .single();

    if (error) {
        // If error is 'No rows found', return null instead of throwing
        if (error.code === "PGRST116") {
            return null;
        }
        console.error("Error finding member by PIN:", error);
        throw error;
    }

    return data;
}

/**
 * Calculate similarity between two strings
 * Uses Levenshtein distance algorithm to calculate a similarity score
 *
 * @param str1 - First string to compare
 * @param str2 - Second string to compare
 * @returns Similarity score between 0 and 1
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1; // Both empty
    if (!str1 || !str2) return 0; // One empty

    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Levenshtein distance calculation
    const track = Array(s2.length + 1).fill(null).map(() =>
        Array(s1.length + 1).fill(null)
    );

    for (let i = 0; i <= s1.length; i += 1) {
        track[0][i] = i;
    }

    for (let j = 0; j <= s2.length; j += 1) {
        track[j][0] = j;
    }

    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator, // substitution
            );
        }
    }

    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1; // Both strings are empty

    // Convert distance to similarity score (1 - normalized distance)
    return 1 - (track[s2.length][s1.length] / maxLength);
}

/**
 * Log unmatched name for admin review
 *
 * @param firstName - First name that wasn't matched
 * @param lastName - Last name that wasn't matched
 */
export function logUnmatchedName(firstName: string, lastName: string): void {
    console.warn(`Unmatched name in import: ${firstName} ${lastName}`);
    // In a production implementation, this might store the unmatched name
    // in a separate table for admin review
}
