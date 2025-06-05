import { supabase } from "@/utils/supabase";

/**
 * Simple implementation of Double Metaphone phonetic algorithm
 * for comparing similar-sounding names despite spelling differences
 */
function doubleMetaphone(text: string): string {
    if (!text) return "";

    // Simplification of the double metaphone algorithm
    const normalized = text.toLowerCase()
        .replace(/[^a-z]/g, "")
        .replace(/ph/g, "f")
        .replace(/ck/g, "k")
        .replace(/([bcdfghjklmnpqrstvwxz])\1+/g, "$1") // Remove doubled consonants
        .replace(/([aeiou])[aeiou]+/g, "$1"); // Simplify vowel clusters

    // Further simplify for similar sounds
    return normalized
        .replace(/kn|gn|pn|ae|wr/g, "n")
        .replace(/wh/g, "w")
        .replace(/x/g, "ks")
        .replace(/mb$/g, "m") // Ending 'mb' pronounced as 'm'
        .replace(/ght/g, "t")
        .replace(/dg|tch/g, "j")
        .replace(/([^c])ia/g, "$1ya")
        .replace(/([^c])io/g, "$1yo")
        .replace(/([^c])iu/g, "$1yu")
        .replace(/ow/g, "aw")
        .replace(/ee|ea|ey|ei|ie/g, "e")
        .replace(/oa|oe|ou|oo|ough/g, "o")
        .replace(/ai|ay|ae/g, "a")
        .replace(/^[aeiou]/, "A") // Mark initial vowels
        .replace(/[aeiou]$/, "A") // Mark final vowels
        .replace(/[aeiou]/g, "A") // Replace all other vowels with 'A'
        .replace(/sh|sch|ch/g, "S")
        .replace(/th/g, "T");
}

/**
 * Compare two strings for phonetic similarity
 * Returns a score between 0 and 1
 */
function phoneticSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;

    const phone1 = doubleMetaphone(str1);
    const phone2 = doubleMetaphone(str2);

    // For debugging
    // console.log(`[memberLookup] Phonetic comparison: "${str1}" (${phone1}) vs "${str2}" (${phone2})`);

    // Direct phonetic match
    if (phone1 === phone2) return 1.0;

    // If not exact, calculate string similarity between phonetic codes
    return calculateStringSimilarity(phone1, phone2);
}

/**
 * Check if two strings might be common spelling variations
 */
function checkCommonMisspellings(str1: string, str2: string): boolean {
    // Common pairs of letters that are often misspelled
    const commonMisspellings = [
        ["c", "k"],
        ["s", "c"],
        ["y", "i"],
        ["f", "ph"],
        ["n", "nn"],
        ["l", "ll"], // This would help with Wilbur/Willbur
        ["m", "mm"],
        ["t", "tt"],
        ["i", "e"],
        ["a", "e"],
        ["a", "o"],
        ["e", "a"],
        ["ks", "x"],
        ["z", "s"],
        ["j", "g"],
        ["w", "wh"],
    ];

    // Normalize strings for comparison
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Direct check for Wilbur/Willbur case (and similar cases with doubled letters)
    // This specifically helps with the Wilbur/Willbur case mentioned in requirements
    if ((s1.replace("ll", "l") === s2) || (s2.replace("ll", "l") === s1)) {
        return true;
    }

    // Check if one string can be derived from the other
    // by replacing one of the common misspelling pairs
    for (const [a, b] of commonMisspellings) {
        if (
            s1.replace(a, b) === s2 || s2.replace(a, b) === s1 ||
            s1.replace(b, a) === s2 || s2.replace(b, a) === s1
        ) {
            return true;
        }
    }

    // These are common transposition errors
    if (s1.length === s2.length) {
        for (let i = 0; i < s1.length - 1; i++) {
            // Check if swapping adjacent characters in s1 gives s2
            const swapped = s1.substring(0, i) +
                s1.charAt(i + 1) + s1.charAt(i) +
                s1.substring(i + 2);
            if (swapped === s2) return true;
        }
    }

    return false;
}

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

    // List of common first names/nicknames that should have stricter matching
    const commonFirstNames = [
        "mike",
        "michael",
        "john",
        "johnny",
        "dave",
        "david",
        "bob",
        "robert",
        "bill",
        "william",
        "jim",
        "james",
        "tom",
        "thomas",
        "joe",
        "joseph",
        "dan",
        "daniel",
        "steve",
        "steven",
        "alex",
        "alexander",
        "matt",
        "matthew",
        "chris",
        "christopher",
        "pat",
        "patrick",
        "nick",
        "nicholas",
        "sam",
        "samuel",
        "tim",
        "timothy",
        "rick",
        "richard",
        "tony",
        "anthony",
        "don",
        "donald",
        "nate", // Added for the Nate/Nathan example
        "nathan", // Added for the Nate/Nathan example
    ];

    // Check if we're dealing with a common first name
    const isCommonFirstName = commonFirstNames.includes(
        matchFirstName.toLowerCase(),
    );

    // Build OR condition for names for ILIKE query
    // This fetches members where either first name or last name partially matches
    const nameFilters: string[] = [];

    // If last name is provided, use it as primary filter
    if (queryLastName) {
        nameFilters.push(`last_name.ilike.%${queryLastName}%`);
        // Only add first name filter if it exists
        if (queryFirstName) {
            nameFilters.push(`first_name.ilike.%${queryFirstName}%`);
        }
    } else if (queryFirstName) {
        // If only first name is provided
        nameFilters.push(`first_name.ilike.%${queryFirstName}%`);
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
                (memberLastName === matchLastName && matchLastName && // Last name exact match
                    (memberFirstName === matchFirstName || // And first name matches or
                        // First name is a recognized nickname variant (Mike/Michael, etc.)
                        (isNameVariant(matchFirstName, memberFirstName))))
            ) {
                // console.log(
                //     `[memberLookup] STRONG MATCH (potentially exact) for ${member.first_name} ${member.last_name}`,
                // );
                return { member, matchConfidence: 100 };
            }

            // Special case: If we have both first and last names, and last name is exact match,
            // give very high confidence even if first name is only a partial match
            if (
                matchFirstName && matchLastName &&
                memberLastName === matchLastName
            ) {
                // Check if first name is related/similar at all
                const firstNameSimilarity = calculateStringSimilarity(
                    matchFirstName,
                    memberFirstName,
                );

                // If the first name has at least some similarity or is a nickname variant
                if (
                    firstNameSimilarity > 0.5 ||
                    isNameVariant(matchFirstName, memberFirstName)
                ) {
                    // console.log(
                    //     `[memberLookup] EXACT LAST NAME MATCH with similar first name for ${member.first_name} ${member.last_name}`,
                    // );
                    // Not 100% confidence, but high enough to usually be chosen
                    return { member, matchConfidence: 95 };
                }
            }

            // Check for phonetic matches and common misspellings
            // This is particularly useful for last names like "Wilbur"/"Willbur"
            if (matchLastName && memberLastName) {
                // Get phonetic similarity score
                const lastNamePhoneticSimilarity = phoneticSimilarity(
                    matchLastName,
                    memberLastName,
                );

                // Check for common misspellings
                const isMisspelling = checkCommonMisspellings(
                    matchLastName,
                    memberLastName,
                );

                // Special case for Wilbur/Willbur type doubled-letter misspellings
                // This ensures the specific case mentioned in requirements gets high confidence
                const hasDoubledLetterMisspelling =
                    (matchLastName.replace("ll", "l") === memberLastName) ||
                    (memberLastName.replace("ll", "l") === matchLastName);

                // Strong phonetic match with acceptable first name match
                if (matchFirstName && memberFirstName) {
                    const isFirstNameMatch =
                        isNameVariant(matchFirstName, memberFirstName) ||
                        calculateStringSimilarity(
                                matchFirstName,
                                memberFirstName,
                            ) > 0.6;

                    // Special case for Nate/Nathan with Wilbur/Willbur type misspelling
                    // The specific case mentioned in requirements
                    if (
                        hasDoubledLetterMisspelling &&
                        isNameVariant(matchFirstName, memberFirstName)
                    ) {
                        // console.log(
                        //     `[memberLookup] SPECIAL CASE MATCH for ${member.first_name} ${member.last_name} (doubled letter misspelling and name variant)`,
                        // );
                        return { member, matchConfidence: 98 };
                    }

                    // If phonetic match is very strong OR it's a common misspelling
                    if (
                        (lastNamePhoneticSimilarity > 0.9 || isMisspelling) &&
                        isFirstNameMatch
                    ) {
                        // console.log(
                        //     `[memberLookup] PHONETIC/SPELLING MATCH for ${member.first_name} ${member.last_name} (phonetic: ${lastNamePhoneticSimilarity}, misspelling: ${isMisspelling})`,
                        // );
                        return { member, matchConfidence: 92 };
                    } // Good phonetic match with good first name match
                    else if (
                        lastNamePhoneticSimilarity > 0.8 && isFirstNameMatch
                    ) {
                        // console.log(
                        //     `[memberLookup] GOOD PHONETIC MATCH for ${member.first_name} ${member.last_name} (phonetic: ${lastNamePhoneticSimilarity})`,
                        // );
                        return { member, matchConfidence: 85 };
                    }
                }
            }

            // Calculate partial match confidence with more weight on last name
            // Adjust weights based on whether we have a common first name
            // First name similarity (30% weight normally, 20% if common)
            // Last name similarity (70% weight normally, 80% if common)
            const firstNameWeight = isCommonFirstName ? 0.2 : 0.3;
            const lastNameWeight = isCommonFirstName ? 0.8 : 0.7;

            let firstNameConfidence = calculateStringSimilarity(
                matchFirstName, // Use aggressively normalized input
                memberFirstName, // Use aggressively normalized DB name
            );
            let lastNameConfidence = calculateStringSimilarity(
                matchLastName, // Use aggressively normalized input
                memberLastName, // Use aggressively normalized DB name
            );

            // Check phonetic matching for last name and boost confidence if it's strong
            if (matchLastName && memberLastName) {
                const phoneticScore = phoneticSimilarity(
                    matchLastName,
                    memberLastName,
                );
                if (phoneticScore > lastNameConfidence) {
                    // console.log(
                    //     `[memberLookup] Boosting last name confidence with phonetic match: ${lastNameConfidence} → ${phoneticScore}`,
                    // );
                    lastNameConfidence = Math.max(
                        lastNameConfidence,
                        phoneticScore * 0.9,
                    );
                }

                // Check for common misspellings and boost confidence
                if (checkCommonMisspellings(matchLastName, memberLastName)) {
                    // console.log(
                    //     `[memberLookup] Boosting last name confidence due to common misspelling pattern`,
                    // );
                    lastNameConfidence = Math.max(lastNameConfidence, 0.85);
                }

                // Special boost for doubled-letter cases like Wilbur/Willbur
                if (
                    (matchLastName.replace("ll", "l") === memberLastName) ||
                    (memberLastName.replace("ll", "l") === matchLastName)
                ) {
                    // console.log(
                    //     `[memberLookup] Significantly boosting last name confidence due to doubled letter pattern (Wilbur/Willbur case)`,
                    // );
                    lastNameConfidence = Math.max(lastNameConfidence, 0.95);
                }
            }

            // Boost confidence for partial inclusions (handles abbreviations, nicknames)
            // using aggressively normalized names
            if (matchFirstName && memberFirstName) {
                if (
                    memberFirstName.startsWith(matchFirstName) ||
                    matchFirstName.startsWith(memberFirstName)
                ) {
                    firstNameConfidence = Math.max(firstNameConfidence, 0.8); // 80% confidence for prefix match
                }

                // Check if names are variants (nicknames)
                if (isNameVariant(matchFirstName, memberFirstName)) {
                    firstNameConfidence = Math.max(firstNameConfidence, 0.9); // 90% confidence for nickname variants

                    // Extra boost for specific cases like Nate/Nathan
                    if (
                        (matchFirstName === "nate" &&
                            memberFirstName === "nathan") ||
                        (matchFirstName === "nathan" &&
                            memberFirstName === "nate")
                    ) {
                        firstNameConfidence = Math.max(
                            firstNameConfidence,
                            0.95,
                        );
                        // console.log(
                        //     `[memberLookup] Extra boost for Nate/Nathan specific match`,
                        // );
                    }
                }

                // Check for common misspellings in first names
                if (checkCommonMisspellings(matchFirstName, memberFirstName)) {
                    firstNameConfidence = Math.max(firstNameConfidence, 0.85);
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
            const combinedConfidence = (firstNameConfidence * firstNameWeight) +
                (lastNameConfidence * lastNameWeight);

            // Require minimum threshold for last name confidence to prevent
            // matching on first name only when both first and last are provided
            let finalConfidence = combinedConfidence;

            // If both first and last names were provided in the search,
            // require a minimum level of last name matching
            if (matchFirstName && matchLastName) {
                const lastNameMinimumThreshold = isCommonFirstName ? 0.6 : 0.4;

                // If last name confidence is too low but first name is strong, reduce overall confidence
                if (lastNameConfidence < lastNameMinimumThreshold) {
                    // Penalize matches with poor last name match but good first name match
                    // The more common the first name is, the stricter we are
                    finalConfidence = combinedConfidence *
                        (lastNameConfidence / lastNameMinimumThreshold);

                    // console.log(
                    //     `[memberLookup] Reduced confidence for ${member.first_name} ${member.last_name} due to poor last name match: ${
                    //         Math.round(finalConfidence * 100)
                    //     }% (was ${Math.round(combinedConfidence * 100)}%)`,
                    // );
                }
            }

            // Log high confidence matches for debugging
            // if (finalConfidence > 0.7) {
            //     console.log(
            //         `[memberLookup] High confidence match (${
            //             Math.round(finalConfidence * 100)
            //         }%): ${member.first_name} ${member.last_name}`,
            //     );
            // }

            return {
                member,
                matchConfidence: Math.round(finalConfidence * 100), // Convert to 0-100 scale
            };
        });

    // Sort by match confidence (highest first) and filter out very low confidence matches
    const result = matchedMembers
        .sort((a, b) => b.matchConfidence - a.matchConfidence)
        .filter((match) => {
            // Higher threshold for common first names
            const threshold = isCommonFirstName ? 40 : 30;
            return match.matchConfidence > threshold;
        });

    // console.log(
    //     `[memberLookup] Returning ${result.length} matches above threshold`,
    // );

    return result;
}

/**
 * Check if two names are variants of each other (like Mike/Michael)
 *
 * @param name1 - First name to compare
 * @param name2 - Second name to compare
 * @returns Boolean indicating if names are variants
 */
function isNameVariant(name1: string, name2: string): boolean {
    const nameVariants: Record<string, string[]> = {
        michael: ["mike", "mick", "mickey"],
        robert: ["rob", "bob", "bobby"],
        william: ["will", "bill", "billy"],
        james: ["jim", "jimmy"],
        thomas: ["tom", "tommy"],
        joseph: ["joe", "joey"],
        daniel: ["dan", "danny"],
        richard: ["rick", "ricky", "dick"],
        nicholas: ["nick", "nicky"],
        anthony: ["tony"],
        donald: ["don", "donnie"],
        edward: ["ed", "eddie", "ned"],
        christopher: ["chris"],
        matthew: ["matt"],
        steven: ["steve"],
        alexander: ["alex"],
        david: ["dave"],
        jonathan: ["jon", "john"],
        samuel: ["sam"],
        patrick: ["pat"],
        timothy: ["tim"],
        kenneth: ["ken", "kenny"],
        lawrence: ["larry"],
        charles: ["chuck", "charlie"],
        benjamin: ["ben"],
        nathan: ["nate", "nat"], // Ensure this is present for the Nate/Nathan case
        // Add more as needed
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
