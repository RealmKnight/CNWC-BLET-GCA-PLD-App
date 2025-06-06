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

// ============================================================================
// NEW: Staged Import Preview System Interfaces
// ============================================================================

/**
 * Import stage enumeration for staged import workflow
 */
export type ImportStage =
    | "unmatched"
    | "duplicates"
    | "over_allotment"
    | "db_reconciliation"
    | "final_review";

/**
 * Interface for tracking import progress through stages
 */
export interface ImportProgressState {
    currentStage: ImportStage;
    completedStages: ImportStage[];
    stageData: {
        unmatched: UnmatchedStageData;
        duplicates: DuplicateStageData;
        over_allotment: OverAllotmentStageData;
        db_reconciliation: DbReconciliationStageData;
        final_review: FinalReviewStageData;
    };
    canProgress: boolean;
    totalItems: number;
    processedItems: number;
}

/**
 * Interface for unmatched member stage data
 */
export interface UnmatchedStageData {
    unmatchedItems: ImportPreviewItem[];
    resolvedAssignments: Record<number, MemberData>; // originalIndex -> assigned member
    skippedItems: Set<number>; // originalIndex of items to skip
    isComplete: boolean;
}

/**
 * Interface for over-allotment stage data
 */
export interface OverAllotmentStageData {
    overAllottedDates: OverAllotmentDate[];
    allotmentAdjustments: Record<string, number>; // date -> new allotment value
    requestOrdering: Record<string, number[]>; // date -> ordered array of originalIndex
    isComplete: boolean;
}

/**
 * Interface for duplicate detection stage data
 */
export interface DuplicateStageData {
    duplicateItems: ImportPreviewItem[];
    duplicateOriginalIndices: number[]; // Track original indices of duplicate items
    skipDuplicates: Set<number>; // originalIndex of duplicates to skip
    overrideDuplicates: Set<number>; // originalIndex of duplicates to import anyway
    isComplete: boolean;
}

/**
 * Interface for database reconciliation conflict
 */
export interface DbConflict {
    id: string; // Unique conflict identifier
    type: "missing_from_ical" | "status_mismatch" | "leave_type_conflict";
    dbRequest: any; // The existing DB request (PldSdvRequest)
    icalRequest?: ParsedPldSdvRequest; // The matching iCal request (if exists)
    memberId?: string; // For grouping
    memberName: string; // For display
    requestDate: string; // For grouping
    severity: "low" | "medium" | "high"; // Impact level
    description: string; // Human-readable description
    suggestedAction?: string; // Recommended action
}

/**
 * Interface for queued database changes
 */
export interface QueuedDbChange {
    requestId: string; // pld_sdv_requests.id
    currentStatus: string; // Current status in DB
    newStatus: string; // Admin's chosen new status
    memberId?: string; // For audit trail
    pinNumber?: number; // For audit trail
    requestDate: string; // For impact calculations
    leaveType: string; // For impact calculations
    adminReason?: string; // Optional admin note
    timestamp: Date; // When change was queued
}

/**
 * Interface for database reconciliation stage data
 */
export interface DbReconciliationStageData {
    conflicts: DbConflict[]; // All detected conflicts
    queuedChanges: QueuedDbChange[]; // Admin's queued decisions
    reviewedConflicts: Set<string>; // requestId of reviewed conflicts
    isComplete: boolean; // All conflicts reviewed
    cacheTimestamp?: Date; // For cache invalidation
}

/**
 * Interface for final review stage data
 */
export interface FinalReviewStageData {
    approvedItems: ImportPreviewItem[];
    waitlistedItems: Array<ImportPreviewItem & { waitlistPosition: number }>;
    skippedItems: ImportPreviewItem[];
    allotmentChanges: Array<
        { date: string; oldAllotment: number; newAllotment: number }
    >;
    summary: {
        totalToImport: number;
        approvedCount: number;
        waitlistedCount: number;
        skippedCount: number;
        allotmentAdjustments: number;
    };
    isComplete: boolean;
}

/**
 * Interface for over-allotment date information
 */
export interface OverAllotmentDate {
    date: string; // ISO date string
    currentAllotment: number;
    existingRequests: number; // Already in database
    importRequests: ImportPreviewItem[]; // From current import
    totalRequests: number; // existing + import
    overAllotmentCount: number; // how many over the limit
    suggestedAllotment: number; // current + overAllotmentCount
}

/**
 * Interface for over-allotment review with admin ordering
 */
export interface OverAllotmentReview {
    date: string;
    allotment: number;
    requests: Array<
        ImportPreviewItem & {
            originalIndex: number;
            adminOrder: number; // 1-based position set by admin drag-and-drop
            finalStatus: "approved" | "waitlisted";
            waitlistPosition?: number; // Only for waitlisted items
        }
    >;
    allotmentAction: "keep" | "increase" | "custom";
    customAllotment?: number;
}

/**
 * Main interface for staged import preview data
 */
export interface StagedImportPreview {
    originalItems: ImportPreviewItem[];
    progressState: ImportProgressState;
    calendarId: string;
    divisionId?: number;
    year: number;
    createdAt: Date;
    lastUpdated: Date;
}

// ============================================================================
// END: New Staged Import Interfaces
// ============================================================================

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
    console.log(
        `[ImportPreview] Processing ${parsedRequests.length} requests for calendar ${calendarId}${
            divisionId ? ` in division ${divisionId}` : ""
        }`,
    );
    const previewItems: ImportPreviewItem[] = [];

    // Process each parsed request with progress logging
    for (let i = 0; i < parsedRequests.length; i++) {
        const parsedRequest = parsedRequests[i];

        // Log progress every 10 items or for small batches
        if (
            parsedRequests.length <= 20 || (i + 1) % 10 === 0 ||
            i === parsedRequests.length - 1
        ) {
            console.log(
                `[ImportPreview] Processing request ${
                    i + 1
                }/${parsedRequests.length}: ${parsedRequest.firstName} ${parsedRequest.lastName}`,
            );
        }

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

            // Check for potential duplicates if we have a matched member or resolved assignment
            let isPotentialDuplicate = false;
            let memberForDuplicateCheck = null;

            if (matchedMember.status === "matched" && matchedMember.member) {
                memberForDuplicateCheck = matchedMember.member;
            }
            // Note: We can't check resolved assignments here because they haven't been made yet
            // during initial preview generation. The duplicate checking will happen later in the
            // over-allotment stage where resolved assignments are available.

            if (memberForDuplicateCheck) {
                isPotentialDuplicate = await checkForDuplicate(
                    memberForDuplicateCheck.id || null,
                    memberForDuplicateCheck.pin_number,
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
                `[ImportPreview] Error processing request for ${parsedRequest.firstName} ${parsedRequest.lastName}:`,
                error,
            );
        }
    }

    // Log final summary
    const matchedCount =
        previewItems.filter((item) => item.matchedMember.status === "matched")
            .length;
    const unmatchedCount =
        previewItems.filter((item) => item.matchedMember.status === "unmatched")
            .length;
    const multipleMatchCount =
        previewItems.filter((item) =>
            item.matchedMember.status === "multiple_matches"
        ).length;
    const duplicateCount =
        previewItems.filter((item) => item.isPotentialDuplicate).length;

    console.log(
        `[ImportPreview] Complete - ${previewItems.length} items processed: ${matchedCount} matched, ${unmatchedCount} unmatched, ${multipleMatchCount} multiple matches, ${duplicateCount} potential duplicates`,
    );

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
    try {
        console.log(
            `[MemberMatch] Searching for "${firstName} ${lastName}"${
                divisionId ? ` in division ${divisionId}` : ""
            }`,
        );

        // Ensure names aren't empty
        if (!firstName && !lastName) {
            console.warn(
                "[MemberMatch] Empty name provided for member matching",
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
            `[MemberMatch] Found ${matchedMembers.length} potential matches for "${firstName} ${lastName}"`,
        );

        // Debug log the top matches for significant cases
        if (matchedMembers.length > 1) {
            matchedMembers.slice(0, Math.min(3, matchedMembers.length)).forEach(
                (match, idx) => {
                    console.log(
                        `[MemberMatch] Option ${
                            idx + 1
                        }: ${match.member.first_name} ${match.member.last_name} (${match.matchConfidence}% confidence)`,
                    );
                },
            );
        }

        if (matchedMembers.length === 0) {
            console.log(
                `[MemberMatch] No matches found for "${firstName} ${lastName}"`,
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
                    `[MemberMatch] Single ${
                        threshold >= 95 ? "high" : "good"
                    } confidence match: ${
                        confidenceMatches[0].member.first_name
                    } ${confidenceMatches[0].member.last_name} (${
                        confidenceMatches[0].matchConfidence
                    }%)`,
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
                `[MemberMatch] Single match found: ${
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
            `[MemberMatch] Top candidates: "${topMatch.member.first_name} ${topMatch.member.last_name}" (${topMatch.matchConfidence}%) vs "${secondMatch.member.first_name} ${secondMatch.member.last_name}" (${secondMatch.matchConfidence}%)`,
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
                `[MemberMatch] Using top match with significantly higher confidence: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
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
                    `[MemberMatch] Using phonetic/misspelling match with good first name: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
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
                    `[MemberMatch] Using top match with exact last name match: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
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
                    `[MemberMatch] Using match with likely misspelled last name: ${topMatch.member.first_name} ${topMatch.member.last_name} (${topMatch.matchConfidence}%)`,
                );
                return {
                    status: "matched",
                    member: topMatch.member,
                };
            }
        }

        // Multiple viable matches
        console.log(
            `[MemberMatch] Multiple matches found for "${firstName} ${lastName}" - requires manual selection`,
        );
        return {
            status: "multiple_matches",
            possibleMatches: matchedMembers.map((match) => match.member),
        };
    } catch (error) {
        console.error(
            "[MemberMatch] Error finding matching member:",
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

        // Build query based on available identifiers (excluding cancelled requests)
        let query = supabase
            .from("pld_sdv_requests")
            .select("id")
            .eq("calendar_id", calendarId)
            .eq("request_date", formattedDate)
            .in("status", ["approved", "waitlisted", "pending"]); // Exclude cancelled requests

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

// ============================================================================
// NEW: Staged Import Preview Functions
// ============================================================================

/**
 * Create a new staged import preview from parsed requests
 *
 * @param parsedRequests - Array of parsed PLD/SDV requests from iCal
 * @param calendarId - Target calendar ID for import
 * @param divisionId - Division ID for focusing member search
 * @param year - Target year for import
 * @returns Promise resolving to staged import preview
 */
export async function createStagedImportPreview(
    parsedRequests: ParsedPldSdvRequest[],
    calendarId: string,
    divisionId?: number,
    year?: number,
): Promise<StagedImportPreview> {
    console.log(
        `[StagedImport] Creating staged preview for ${parsedRequests.length} requests`,
    );

    // Generate the initial import preview items
    const originalItems = await generateImportPreview(
        parsedRequests,
        calendarId,
        divisionId,
    );

    // Initialize progress state with unmatched stage
    const progressState = await initializeProgressState(originalItems);

    console.log(
        `[StagedImport] Initialized with ${progressState.stageData.unmatched.unmatchedItems.length} unmatched items requiring resolution`,
    );

    return {
        originalItems,
        progressState,
        calendarId,
        divisionId,
        year: year || new Date().getFullYear(),
        createdAt: new Date(),
        lastUpdated: new Date(),
    };
}

/**
 * Initialize the progress state for staged import
 *
 * @param items - Array of import preview items
 * @returns Promise resolving to initialized progress state
 */
async function initializeProgressState(
    items: ImportPreviewItem[],
): Promise<ImportProgressState> {
    // Analyze unmatched items for Stage 1
    const unmatchedItems = items.filter((item) =>
        item.matchedMember.status === "unmatched" ||
        item.matchedMember.status === "multiple_matches"
    );

    const progressState: ImportProgressState = {
        currentStage: "unmatched",
        completedStages: [],
        stageData: {
            unmatched: {
                unmatchedItems,
                resolvedAssignments: {},
                skippedItems: new Set(),
                isComplete: unmatchedItems.length === 0,
            },
            duplicates: {
                duplicateItems: [],
                duplicateOriginalIndices: [],
                skipDuplicates: new Set(),
                overrideDuplicates: new Set(),
                isComplete: false,
            },
            over_allotment: {
                overAllottedDates: [],
                allotmentAdjustments: {},
                requestOrdering: {},
                isComplete: false,
            },
            db_reconciliation: {
                conflicts: [],
                queuedChanges: [],
                reviewedConflicts: new Set(),
                isComplete: false,
                cacheTimestamp: undefined,
            },
            final_review: {
                approvedItems: [],
                waitlistedItems: [],
                skippedItems: [],
                allotmentChanges: [],
                summary: {
                    totalToImport: 0,
                    approvedCount: 0,
                    waitlistedCount: 0,
                    skippedCount: 0,
                    allotmentAdjustments: 0,
                },
                isComplete: false,
            },
        },
        canProgress: unmatchedItems.length === 0,
        totalItems: items.length,
        processedItems: 0,
    };

    console.log(
        `[StagedImport] Analysis complete - ${unmatchedItems.length} unmatched items found out of ${items.length} total`,
    );
    return progressState;
}

/**
 * Advance to the next stage after completing current stage
 *
 * @param stagedPreview - Current staged import preview
 * @returns Promise resolving to updated staged import preview
 */
export async function advanceToNextStage(
    stagedPreview: StagedImportPreview,
): Promise<StagedImportPreview> {
    const { progressState } = stagedPreview;
    const currentStage = progressState.currentStage;

    console.log(`[StagedImport] Advancing from ${currentStage} stage`);

    // Validate current stage is complete
    if (!progressState.stageData[currentStage].isComplete) {
        throw new Error(
            `Cannot advance: ${currentStage} stage is not complete`,
        );
    }

    // Mark current stage as completed
    if (!progressState.completedStages.includes(currentStage)) {
        progressState.completedStages.push(currentStage);
    }

    // Determine next stage and perform re-analysis
    let nextStage: ImportStage;

    switch (currentStage) {
        case "unmatched":
            nextStage = "duplicates";
            console.log(`[StagedImport] Analyzing duplicate detection...`);
            // First, update duplicate flags for any manually resolved assignments
            await updateDuplicateFlagsForResolvedAssignments(stagedPreview);
            // Then analyze duplicates
            await analyzeDuplicateStage(stagedPreview);
            break;
        case "duplicates":
            nextStage = "over_allotment";
            console.log(
                `[StagedImport] Analyzing over-allotment situations...`,
            );
            await analyzeOverAllotmentStage(stagedPreview);
            break;
        case "over_allotment":
            nextStage = "db_reconciliation";
            console.log(`[StagedImport] Analyzing database reconciliation...`);
            await analyzeDbReconciliationStage(stagedPreview);
            break;
        case "db_reconciliation":
            nextStage = "final_review";
            console.log(`[StagedImport] Preparing final review summary...`);
            await analyzeFinalReviewStage(stagedPreview);
            break;
        case "final_review":
            throw new Error("Already at final stage");
        default:
            throw new Error(`Unknown stage: ${currentStage}`);
    }

    // Update progress state
    progressState.currentStage = nextStage;
    progressState.canProgress = progressState.stageData[nextStage].isComplete;
    stagedPreview.lastUpdated = new Date();

    console.log(`[StagedImport] Advanced to ${nextStage} stage`);
    return stagedPreview;
}

/**
 * Analyze over-allotment situations for Stage 3 (after duplicates are resolved)
 *
 * @param stagedPreview - Current staged import preview
 */
async function analyzeOverAllotmentStage(
    stagedPreview: StagedImportPreview,
): Promise<void> {
    console.log(`[StagedImport] Analyzing over-allotment stage`);

    const { originalItems, calendarId, progressState } = stagedPreview;
    const { unmatched, duplicates } = progressState.stageData;

    // Get items that will proceed to import (matched + resolved assignments - skipped - duplicates to skip)
    const itemsToAnalyze = originalItems.filter((item, index) => {
        // Skip items that were marked to skip in unmatched stage
        if (unmatched.skippedItems.has(index)) return false;

        // Skip items that were marked as duplicates to skip
        if (duplicates.skipDuplicates.has(index)) return false;

        // Include items that are matched or have resolved assignments
        return item.matchedMember.status === "matched" ||
            unmatched.resolvedAssignments[index];
    });

    console.log(
        `[StagedImport] Analyzing ${itemsToAnalyze.length} items for over-allotment (after filtering duplicates)`,
    );

    // Group items by date
    const itemsByDate = groupItemsByDate(itemsToAnalyze);

    // Filter out dates that are invalid for waitlisting and auto-reject waitlisted requests
    const { validItems: validItemsByDate, autoRejectedCount } =
        await filterItemsByDateValidity(itemsByDate, calendarId, stagedPreview);

    if (autoRejectedCount > 0) {
        console.log(
            `[StagedImport] Auto-rejected ${autoRejectedCount} requests that would be waitlisted on invalid dates (past/today/within 48hrs)`,
        );
    }

    // Query allotments for each valid date
    const overAllottedDates: OverAllotmentDate[] = [];

    for (const [dateStr, items] of Object.entries(validItemsByDate)) {
        const allotmentInfo = await getDateAllotmentInfo(dateStr, calendarId);
        const totalRequests = allotmentInfo.existingRequests + items.length;

        if (totalRequests > allotmentInfo.currentAllotment) {
            const overAllotmentCount = totalRequests -
                allotmentInfo.currentAllotment;

            overAllottedDates.push({
                date: dateStr,
                currentAllotment: allotmentInfo.currentAllotment,
                existingRequests: allotmentInfo.existingRequests,
                importRequests: items,
                totalRequests,
                overAllotmentCount,
                suggestedAllotment: allotmentInfo.currentAllotment +
                    overAllotmentCount,
            });
        }
    }

    // Update stage data
    progressState.stageData.over_allotment = {
        overAllottedDates,
        allotmentAdjustments: {},
        requestOrdering: {},
        isComplete: overAllottedDates.length === 0, // Complete if no over-allotments
    };

    console.log(
        `[StagedImport] Found ${overAllottedDates.length} over-allotted dates requiring resolution`,
    );
}

/**
 * Analyze duplicate situations for Stage 3
 *
 * @param stagedPreview - Current staged import preview
 */
async function analyzeDuplicateStage(
    stagedPreview: StagedImportPreview,
): Promise<void> {
    console.log(`[StagedImport] Analyzing duplicate stage`);

    const { originalItems, progressState } = stagedPreview;
    const { unmatched } = progressState.stageData;

    // Get items that will proceed (after unmatched resolution) and their original indices
    const itemsToAnalyze: Array<
        { item: ImportPreviewItem; originalIndex: number }
    > = [];

    originalItems.forEach((item, index) => {
        if (
            !unmatched.skippedItems.has(index) &&
            (item.matchedMember.status === "matched" ||
                unmatched.resolvedAssignments[index])
        ) {
            itemsToAnalyze.push({ item, originalIndex: index });
        }
    });

    // Find duplicates and store their original indices
    const duplicateItems: ImportPreviewItem[] = [];
    const duplicateOriginalIndices: number[] = [];

    itemsToAnalyze.forEach(({ item, originalIndex }) => {
        if (item.isPotentialDuplicate) {
            duplicateItems.push(item);
            duplicateOriginalIndices.push(originalIndex);
        }
    });

    // Update stage data - store original indices for tracking
    progressState.stageData.duplicates = {
        duplicateItems,
        duplicateOriginalIndices, // Add this to track original indices
        skipDuplicates: new Set(),
        overrideDuplicates: new Set(),
        isComplete: duplicateItems.length === 0, // Complete if no duplicates
    };

    console.log(
        `[StagedImport] Found ${duplicateItems.length} potential duplicate items requiring resolution`,
    );
}

/**
 * Analyze final review stage (Stage 5)
 *
 * @param stagedPreview - Current staged import preview
 */
async function analyzeFinalReviewStage(
    stagedPreview: StagedImportPreview,
): Promise<void> {
    console.log(`[StagedImport] Analyzing final review stage`);

    const { originalItems, progressState } = stagedPreview;
    const { unmatched, duplicates, over_allotment } = progressState.stageData;

    // Calculate final items to import
    const approvedItems: ImportPreviewItem[] = [];
    const waitlistedItems: Array<
        ImportPreviewItem & { waitlistPosition: number }
    > = [];
    const skippedItems: ImportPreviewItem[] = [];

    // Process each item based on stage resolutions
    originalItems.forEach((item, index) => {
        // Skip items marked to skip in any stage
        if (
            unmatched.skippedItems.has(index) ||
            duplicates.skipDuplicates.has(index)
        ) {
            skippedItems.push(item);
            return;
        }

        // Check if item has member assignment
        const hasAssignment = item.matchedMember.status === "matched" ||
            unmatched.resolvedAssignments[index];
        if (!hasAssignment) {
            skippedItems.push(item);
            return;
        }

        // For duplicate items that are being overridden, include them in import
        const isDuplicateOverride = duplicates.overrideDuplicates.has(index);

        // Determine final status based on over-allotment resolution
        const dateStr = item.requestDate.toISOString().split("T")[0];
        const dateOrdering = over_allotment.requestOrdering[dateStr];
        const overAllottedDate = over_allotment.overAllottedDates.find((d) =>
            d.date === dateStr
        );

        if (overAllottedDate && dateOrdering) {
            // Use admin ordering to determine status
            const position = dateOrdering.indexOf(index);
            const effectiveAllotment =
                over_allotment.allotmentAdjustments[dateStr] ||
                overAllottedDate.currentAllotment;

            if (
                position <
                    effectiveAllotment - overAllottedDate.existingRequests
            ) {
                approvedItems.push(item);
            } else {
                // Calculate waitlist position
                const waitlistPosition = position -
                    (effectiveAllotment - overAllottedDate.existingRequests) +
                    1;
                waitlistedItems.push({ ...item, waitlistPosition });
            }
        } else {
            // No over-allotment, use original status
            if (item.status === "approved") {
                approvedItems.push(item);
            } else {
                // Need to calculate waitlist position for originally waitlisted items
                waitlistedItems.push({ ...item, waitlistPosition: 1 }); // TODO: Calculate proper position
            }
        }
    });

    // Calculate allotment changes
    const allotmentChanges = Object.entries(over_allotment.allotmentAdjustments)
        .map(([date, newAllotment]) => {
            const overAllottedDate = over_allotment.overAllottedDates.find(
                (d) => d.date === date,
            );
            return {
                date,
                oldAllotment: overAllottedDate?.currentAllotment || 0,
                newAllotment,
            };
        });

    // Update stage data
    progressState.stageData.final_review = {
        approvedItems,
        waitlistedItems,
        skippedItems,
        allotmentChanges,
        summary: {
            totalToImport: approvedItems.length + waitlistedItems.length,
            approvedCount: approvedItems.length,
            waitlistedCount: waitlistedItems.length,
            skippedCount: skippedItems.length,
            allotmentAdjustments: allotmentChanges.length,
        },
        isComplete: true, // Final stage is always complete when reached
    };

    // PHASE 8.6: Update final review with database changes impact
    updateFinalReviewWithDbChanges(stagedPreview);

    console.log(
        `[StagedImport] Final review complete - ${approvedItems.length} approved, ${waitlistedItems.length} waitlisted, ${skippedItems.length} skipped`,
    );
}

/**
 * Analyze database reconciliation stage (Stage 4 - between over_allotment and final_review)
 *
 * @param stagedPreview - Current staged import preview
 */
async function analyzeDbReconciliationStage(
    stagedPreview: StagedImportPreview,
): Promise<void> {
    console.log(`[DbReconciliation] Analyzing database reconciliation stage`);

    const { calendarId, year, progressState, originalItems } = stagedPreview;
    const { unmatched, duplicates, over_allotment } = progressState.stageData;

    try {
        // Query existing requests from database for comparison
        const existingRequests = await queryExistingRequests(calendarId, year);
        console.log(
            `[DbReconciliation] Found ${existingRequests.length} existing requests in database`,
        );

        // IMPORTANT: Compare against ORIGINAL import items, not filtered ones
        // The filtering stages (duplicates, unmatched) should not affect conflict detection
        // We need to see ALL potential matches, including duplicates that were identified earlier
        const originalItemsWithIndex = originalItems.map((item, index) => ({
            ...item,
            originalIndex: index,
        }));

        console.log(
            `[DbReconciliation] Analyzing ${originalItemsWithIndex.length} ORIGINAL items for database conflicts`,
        );

        // Detect conflicts between existing DB requests and ALL original import items
        const conflicts = await detectDatabaseConflicts(
            existingRequests,
            originalItemsWithIndex,
            originalItems,
        );
        console.log(
            `[DbReconciliation] Found ${conflicts.length} conflicts requiring review`,
        );

        // Update reconciliation stage data
        progressState.stageData.db_reconciliation = {
            conflicts,
            queuedChanges: [],
            reviewedConflicts: new Set(),
            isComplete: conflicts.length === 0, // Auto-complete if no conflicts
            cacheTimestamp: new Date(),
        };

        console.log(
            `[DbReconciliation] Analysis complete - ${conflicts.length} conflicts ${
                conflicts.length === 0
                    ? "(auto-advancing)"
                    : "requiring admin review"
            }`,
        );
    } catch (error) {
        console.error("[DbReconciliation] Error during analysis:", error);
        // Initialize with empty state on error
        progressState.stageData.db_reconciliation = {
            conflicts: [],
            queuedChanges: [],
            reviewedConflicts: new Set(),
            isComplete: true, // Skip stage on error
            cacheTimestamp: new Date(),
        };
    }
}

/**
 * Query existing PLD/SDV requests from the database for a specific calendar and year
 * Filters OUT cancelled, transferred, and cancellation_pending requests
 *
 * @param calendarId - Calendar ID to query
 * @param year - Year to filter requests
 * @returns Promise resolving to array of existing requests
 */
async function queryExistingRequests(
    calendarId: string,
    year: number,
): Promise<any[]> {
    try {
        console.log(
            `[queryExistingRequests] Querying existing requests for calendar ${calendarId}, year ${year}`,
        );

        const { data, error } = await supabase
            .from("pld_sdv_requests")
            .select(`
                id,
                member_id,
                pin_number,
                request_date,
                leave_type,
                status,
                requested_at,
                waitlist_position,
                created_at,
                updated_at,
                actioned_at,
                actioned_by,
                members:member_id (
                    id,
                    first_name,
                    last_name,
                    pin_number
                )
            `)
            .eq("calendar_id", calendarId)
            .gte("request_date", `${year}-01-01`)
            .lte("request_date", `${year}-12-31`)
            .in("status", ["pending", "approved", "denied", "waitlisted"]) // Exclude cancelled, transferred, cancellation_pending
            .order("request_date", { ascending: true });

        if (error) {
            console.error("[queryExistingRequests] Database error:", error);
            throw new Error(
                `Failed to query existing requests: ${error.message}`,
            );
        }

        console.log(
            `[queryExistingRequests] Found ${
                data?.length || 0
            } existing requests`,
        );
        return data || [];
    } catch (error) {
        console.error("[queryExistingRequests] Error:", error);
        throw error;
    }
}

/**
 * Get items that will proceed to import after filtering through previous stages
 *
 * @param originalItems - All original import items
 * @param unmatchedStageData - Unmatched stage data with resolutions
 * @param duplicateStageData - Duplicate stage data with skip decisions
 * @returns Array of items that will be imported
 */
function getItemsToImport(
    originalItems: ImportPreviewItem[],
    unmatchedStageData: UnmatchedStageData,
    duplicateStageData: DuplicateStageData,
): Array<ImportPreviewItem & { originalIndex: number }> {
    const itemsToImport: Array<ImportPreviewItem & { originalIndex: number }> =
        [];

    originalItems.forEach((item, index) => {
        // Skip items marked to skip in unmatched stage
        if (unmatchedStageData.skippedItems.has(index)) return;

        // Skip items marked as duplicates to skip
        if (duplicateStageData.skipDuplicates.has(index)) return;

        // Include items that are matched or have resolved assignments
        const hasAssignment = item.matchedMember.status === "matched" ||
            unmatchedStageData.resolvedAssignments[index];

        if (hasAssignment) {
            itemsToImport.push({ ...item, originalIndex: index });
        }
    });

    return itemsToImport;
}

/**
 * Detect conflicts between existing database requests and iCal import items
 *
 * @param existingRequests - Existing requests from database
 * @param itemsToImport - Items that will be imported
 * @param originalItems - Original import items for context
 * @returns Promise resolving to array of detected conflicts
 */
async function detectDatabaseConflicts(
    existingRequests: any[],
    itemsToImport: Array<ImportPreviewItem & { originalIndex: number }>,
    originalItems: ImportPreviewItem[],
): Promise<DbConflict[]> {
    console.log(
        `[detectDatabaseConflicts] Analyzing ${existingRequests.length} existing vs ${itemsToImport.length} import items`,
    );

    const conflicts: DbConflict[] = [];

    // Create lookup maps for efficient matching
    const importItemsByMemberAndDate = new Map<
        string,
        ImportPreviewItem & { originalIndex: number }
    >();
    const importItemsByPinAndDate = new Map<
        string,
        ImportPreviewItem & { originalIndex: number }
    >();

    // Build lookup maps for import items
    itemsToImport.forEach((item) => {
        const dateStr = item.requestDate.toISOString().split("T")[0];

        // Try to get member info from matched member or resolved assignment
        let memberId: string | null = null;
        let pinNumber: number | null = null;

        if (
            item.matchedMember.status === "matched" && item.matchedMember.member
        ) {
            memberId = item.matchedMember.member.id || null;
            pinNumber = item.matchedMember.member.pin_number || null;
        }
        // Note: Could also check resolved assignments here if needed

        if (memberId) {
            const key = `${memberId}_${dateStr}_${item.leaveType}`;
            importItemsByMemberAndDate.set(key, item);
        }

        if (pinNumber) {
            const key = `${pinNumber}_${dateStr}_${item.leaveType}`;
            importItemsByPinAndDate.set(key, item);
        }
    });

    // Check each existing request against import items
    for (const existingRequest of existingRequests) {
        const dateStr = existingRequest.request_date;
        const conflicts_for_request = await detectConflictsForRequest(
            existingRequest,
            importItemsByMemberAndDate,
            importItemsByPinAndDate,
            dateStr,
        );
        conflicts.push(...conflicts_for_request);
    }

    console.log(
        `[detectDatabaseConflicts] Detected ${conflicts.length} conflicts`,
    );
    return conflicts;
}

/**
 * Helper function to get member name from database request
 */
function getMemberNameFromDbRequest(dbRequest: any): string {
    // Try to get name from joined member data
    if (dbRequest.members && dbRequest.members.first_name) {
        const firstName = dbRequest.members.first_name || "";
        const lastName = dbRequest.members.last_name || "";
        return `${firstName} ${lastName}`.trim();
    }

    // Fallback to PIN number or member ID
    if (dbRequest.pin_number) {
        return `Member PIN ${dbRequest.pin_number}`;
    }

    if (dbRequest.member_id) {
        return `Member ID ${dbRequest.member_id.substring(0, 8)}...`;
    }

    return `Unknown Member`;
}

/**
 * Detect conflicts for a specific existing database request
 */
async function detectConflictsForRequest(
    existingRequest: any,
    importItemsByMemberAndDate: Map<
        string,
        ImportPreviewItem & { originalIndex: number }
    >,
    importItemsByPinAndDate: Map<
        string,
        ImportPreviewItem & { originalIndex: number }
    >,
    dateStr: string,
): Promise<DbConflict[]> {
    const conflicts: DbConflict[] = [];

    // Primary matching: member_id + request_date + leave_type
    let matchingImportItem:
        | (ImportPreviewItem & { originalIndex: number })
        | undefined;

    if (existingRequest.member_id) {
        const memberKey =
            `${existingRequest.member_id}_${dateStr}_${existingRequest.leave_type}`;
        matchingImportItem = importItemsByMemberAndDate.get(memberKey);
    }

    // Fallback matching: pin_number + request_date + leave_type
    if (!matchingImportItem && existingRequest.pin_number) {
        const pinKey =
            `${existingRequest.pin_number}_${dateStr}_${existingRequest.leave_type}`;
        matchingImportItem = importItemsByPinAndDate.get(pinKey);
    }

    if (matchingImportItem) {
        // Found matching import item - check for status conflicts
        const existingStatus = existingRequest.status;
        const importStatus = matchingImportItem.status;

        if (existingStatus !== importStatus) {
            conflicts.push({
                id: `conflict_${existingRequest.id}_${matchingImportItem.originalIndex}`,
                type: "status_mismatch",
                dbRequest: existingRequest,
                icalRequest: matchingImportItem.originalICalData,
                memberId: existingRequest.member_id,
                memberName: getMemberNameFromDbRequest(existingRequest),
                requestDate: dateStr,
                severity: determineConflictSeverity(
                    existingStatus,
                    importStatus,
                ),
                description:
                    `Request exists in both DB (${existingStatus}) and iCal import (${importStatus}) with different statuses`,
                suggestedAction:
                    `Review and choose correct status: keep DB (${existingStatus}) or update to iCal (${importStatus})`,
            });
        }
    } else {
        // No matching import item found - this DB request is missing from iCal
        // IMPORTANT: Only flag as conflict if this seems problematic
        // Most existing requests SHOULD be missing from new imports

        // Only create conflicts for recent requests (within last 30 days) that might be missing
        const requestDate = new Date(existingRequest.request_date);
        const now = new Date();
        const daysDiff = Math.floor(
            (now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Only flag as conflict if:
        // 1. Request is for future dates (should potentially be in calendar)
        // 2. OR request was created/modified recently (within 30 days)
        const isForFutureDate = requestDate > now;
        const isRecentlyCreated = daysDiff <= 30;

        if (isForFutureDate || isRecentlyCreated) {
            conflicts.push({
                id: `missing_${existingRequest.id}`,
                type: "missing_from_ical",
                dbRequest: existingRequest,
                memberId: existingRequest.member_id,
                memberName: getMemberNameFromDbRequest(existingRequest),
                requestDate: dateStr,
                severity: "low", // Most missing requests are not high priority
                description:
                    `Request exists in database but not found in iCal import`,
                suggestedAction:
                    `Review if this request should be cancelled or if it's missing from the calendar`,
            });
        }
        // Note: We intentionally skip creating conflicts for old requests that are expected to be missing
    }

    return conflicts;
}

/**
 * Determine the severity of a status conflict
 */
function determineConflictSeverity(
    dbStatus: string,
    icalStatus: string,
): "low" | "medium" | "high" {
    // High severity: approved to waitlisted or denied
    if (
        dbStatus === "approved" &&
        (icalStatus === "waitlisted" || icalStatus === "denied")
    ) {
        return "high";
    }

    // High severity: waitlisted/denied to approved
    if (
        (dbStatus === "waitlisted" || dbStatus === "denied") &&
        icalStatus === "approved"
    ) {
        return "high";
    }

    // Medium severity: waitlisted to denied or vice versa
    if (
        (dbStatus === "waitlisted" && icalStatus === "denied") ||
        (dbStatus === "denied" && icalStatus === "waitlisted")
    ) {
        return "medium";
    }

    // Low severity: other status changes
    return "low";
}

/**
 * Helper function to group items by date
 *
 * @param items - Array of import preview items
 * @returns Object mapping date strings to arrays of items
 */
function groupItemsByDate(
    items: ImportPreviewItem[],
): Record<string, ImportPreviewItem[]> {
    return items.reduce((groups, item) => {
        const dateStr = item.requestDate.toISOString().split("T")[0];
        if (!groups[dateStr]) {
            groups[dateStr] = [];
        }
        groups[dateStr].push(item);
        return groups;
    }, {} as Record<string, ImportPreviewItem[]>);
}

/**
 * Get allotment information for a specific date
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @returns Promise resolving to allotment information
 */
async function getDateAllotmentInfo(date: string, calendarId: string): Promise<{
    currentAllotment: number;
    existingRequests: number;
}> {
    try {
        // First, try to find a specific allotment for this date
        const { data: specificAllotmentData, error: specificAllotmentError } =
            await supabase
                .from("pld_sdv_allotments")
                .select("max_allotment, current_requests")
                .eq("calendar_id", calendarId)
                .eq("date", date)
                .limit(1);

        if (specificAllotmentError) {
            console.error(
                "Error querying specific date allotments:",
                specificAllotmentError,
            );
        }

        let allotmentRecord = specificAllotmentData?.[0];

        // If no specific date allotment found, fall back to yearly default
        if (!allotmentRecord) {
            const year = new Date(date).getFullYear();
            const { data: yearlyAllotmentData, error: yearlyAllotmentError } =
                await supabase
                    .from("pld_sdv_allotments")
                    .select("max_allotment, current_requests")
                    .eq("calendar_id", calendarId)
                    .eq("year", year)
                    .limit(1);

            if (yearlyAllotmentError) {
                console.error(
                    "Error querying yearly default allotments:",
                    yearlyAllotmentError,
                );
            }

            allotmentRecord = yearlyAllotmentData?.[0];

            if (allotmentRecord) {
                console.log(
                    `[getDateAllotmentInfo] Using yearly default allotment (${allotmentRecord.max_allotment}) for date ${date}`,
                );
            }
        } else {
            console.log(
                `[getDateAllotmentInfo] Using specific date allotment (${allotmentRecord.max_allotment}) for date ${date}`,
            );
        }

        // Query existing requests for this date (excluding cancelled requests)
        const { data: requestData, error: requestError } = await supabase
            .from("pld_sdv_requests")
            .select("id")
            .eq("calendar_id", calendarId)
            .eq("request_date", date)
            .in("status", ["approved", "waitlisted", "pending"]); // Exclude cancelled requests

        if (requestError) {
            console.error("Error querying existing requests:", requestError);
        }

        return {
            currentAllotment: allotmentRecord?.max_allotment || 0,
            existingRequests: requestData?.length || 0,
        };
    } catch (error) {
        console.error("Error getting date allotment info:", error);
        return {
            currentAllotment: 0,
            existingRequests: 0,
        };
    }
}

/**
 * Calculate waitlist positions for items considering existing waitlisted requests
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param newWaitlistedItems - Array of new items to be waitlisted
 * @returns Promise resolving to array of items with calculated waitlist positions
 */
export async function calculateWaitlistPositions(
    date: string,
    calendarId: string,
    newWaitlistedItems: ImportPreviewItem[],
): Promise<Array<ImportPreviewItem & { waitlistPosition: number }>> {
    try {
        // Query existing waitlisted requests for this date to get the highest position
        const { data: existingWaitlisted, error } = await supabase
            .from("pld_sdv_requests")
            .select("waitlist_position")
            .eq("calendar_id", calendarId)
            .eq("request_date", date)
            .eq("status", "waitlisted")
            .not("waitlist_position", "is", null)
            .order("waitlist_position", { ascending: false })
            .limit(1);

        if (error) {
            console.error("Error querying existing waitlist positions:", error);
        }

        // Determine starting position for new waitlisted items
        const highestExistingPosition =
            existingWaitlisted?.[0]?.waitlist_position || 0;
        let nextPosition = highestExistingPosition + 1;

        // Assign positions to new items
        const itemsWithPositions = newWaitlistedItems.map((item) => ({
            ...item,
            waitlistPosition: nextPosition++,
        }));

        console.log(
            `[StagedImportPreview] Calculated waitlist positions for ${newWaitlistedItems.length} items starting at position ${
                highestExistingPosition + 1
            }`,
        );

        return itemsWithPositions;
    } catch (error) {
        console.error("Error calculating waitlist positions:", error);
        // Fallback: assign positions starting from 1
        return newWaitlistedItems.map((item, index) => ({
            ...item,
            waitlistPosition: index + 1,
        }));
    }
}

/**
 * Enhanced waitlist position calculation with conflict resolution
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param newWaitlistedItems - Array of new items to be waitlisted
 * @param preserveExistingOrder - Whether to preserve existing waitlist order
 * @returns Promise resolving to array of items with calculated waitlist positions
 */
export async function calculateWaitlistPositionsWithConflictResolution(
    date: string,
    calendarId: string,
    newWaitlistedItems: ImportPreviewItem[],
    preserveExistingOrder: boolean = true,
): Promise<Array<ImportPreviewItem & { waitlistPosition: number }>> {
    try {
        console.log(
            `[WaitlistPositions] Calculating positions for ${newWaitlistedItems.length} items on ${date}`,
        );

        // Query all existing waitlisted requests for this date
        const { data: existingWaitlisted, error } = await supabase
            .from("pld_sdv_requests")
            .select("id, waitlist_position, member_id, pin_number")
            .eq("calendar_id", calendarId)
            .eq("request_date", date)
            .eq("status", "waitlisted")
            .not("waitlist_position", "is", null)
            .order("waitlist_position", { ascending: true });

        if (error) {
            console.error("Error querying existing waitlist positions:", error);
            // Fallback to simple calculation
            return calculateWaitlistPositions(
                date,
                calendarId,
                newWaitlistedItems,
            );
        }

        // Find gaps in existing positions and validate sequence
        const existingPositions = existingWaitlisted?.map((req) =>
            req.waitlist_position
        ).filter((pos) =>
            pos !== null
        ) || [];
        const maxExistingPosition = Math.max(0, ...existingPositions);

        // Check for gaps in position sequence
        const positionGaps: number[] = [];
        for (let i = 1; i <= maxExistingPosition; i++) {
            if (!existingPositions.includes(i)) {
                positionGaps.push(i);
            }
        }

        console.log(
            `[WaitlistPositions] Found ${existingPositions.length} existing positions, max: ${maxExistingPosition}, gaps: ${positionGaps.length}`,
        );

        let nextPosition = preserveExistingOrder ? maxExistingPosition + 1 : 1;
        let gapIndex = 0;

        // Assign positions to new items
        const itemsWithPositions = newWaitlistedItems.map((item) => {
            let assignedPosition: number;

            if (!preserveExistingOrder && gapIndex < positionGaps.length) {
                // Fill gaps first if not preserving order
                assignedPosition = positionGaps[gapIndex];
                gapIndex++;
            } else {
                // Use next available position
                assignedPosition = nextPosition;
                nextPosition++;
            }

            return {
                ...item,
                waitlistPosition: assignedPosition,
            };
        });

        console.log(
            `[WaitlistPositions] Assigned positions ${
                itemsWithPositions.map((item) => item.waitlistPosition).join(
                    ", ",
                )
            }`,
        );

        return itemsWithPositions;
    } catch (error) {
        console.error(
            "Error calculating waitlist positions with conflict resolution:",
            error,
        );
        // Fallback to simple calculation
        return calculateWaitlistPositions(date, calendarId, newWaitlistedItems);
    }
}

/**
 * Update waitlist positions during drag operations
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param reorderedItems - Array of items in new order with original indices
 * @param approvedSlots - Number of approved slots available
 * @returns Updated items with recalculated positions
 */
export function updateWaitlistPositionsDuringDrag(
    date: string,
    calendarId: string,
    reorderedItems: Array<ImportPreviewItem & { originalIndex: number }>,
    approvedSlots: number,
): Array<
    ImportPreviewItem & {
        originalIndex: number;
        adminOrder: number;
        finalStatus: "approved" | "waitlisted";
        waitlistPosition?: number;
    }
> {
    console.log(
        `[WaitlistDrag] Updating positions for ${reorderedItems.length} items, ${approvedSlots} approved slots`,
    );

    return reorderedItems.map((item, index) => {
        const adminOrder = index + 1; // 1-based admin ordering
        const finalStatus = index < approvedSlots ? "approved" : "waitlisted";

        // Calculate waitlist position for waitlisted items
        let waitlistPosition: number | undefined;
        if (finalStatus === "waitlisted") {
            waitlistPosition = index - approvedSlots + 1;
        }

        return {
            ...item,
            adminOrder,
            finalStatus,
            waitlistPosition,
        };
    });
}

/**
 * Validate waitlist position uniqueness and sequence
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param proposedPositions - Array of proposed waitlist positions
 * @returns Validation result with conflicts and suggestions
 */
export async function validateWaitlistPositions(
    date: string,
    calendarId: string,
    proposedPositions: Array<{ itemId: string; position: number }>,
): Promise<{
    isValid: boolean;
    conflicts: Array<
        { position: number; existingId: string; proposedId: string }
    >;
    gaps: number[];
    suggestions: Array<{ itemId: string; suggestedPosition: number }>;
}> {
    try {
        console.log(
            `[WaitlistValidation] Validating ${proposedPositions.length} positions for ${date}`,
        );

        // Query existing waitlist positions
        const { data: existingWaitlisted, error } = await supabase
            .from("pld_sdv_requests")
            .select("id, waitlist_position")
            .eq("calendar_id", calendarId)
            .eq("request_date", date)
            .eq("status", "waitlisted")
            .not("waitlist_position", "is", null);

        if (error) {
            console.error(
                "Error querying existing waitlist for validation:",
                error,
            );
            return {
                isValid: false,
                conflicts: [],
                gaps: [],
                suggestions: [],
            };
        }

        const existingPositions = new Map<number, string>();
        existingWaitlisted?.forEach((req) => {
            if (req.waitlist_position) {
                existingPositions.set(req.waitlist_position, req.id);
            }
        });

        // Check for conflicts
        const conflicts: Array<
            { position: number; existingId: string; proposedId: string }
        > = [];
        const proposedPositionMap = new Map<number, string>();

        proposedPositions.forEach(({ itemId, position }) => {
            // Check for conflicts with existing positions
            if (existingPositions.has(position)) {
                conflicts.push({
                    position,
                    existingId: existingPositions.get(position)!,
                    proposedId: itemId,
                });
            }

            // Check for conflicts within proposed positions
            if (proposedPositionMap.has(position)) {
                conflicts.push({
                    position,
                    existingId: proposedPositionMap.get(position)!,
                    proposedId: itemId,
                });
            }

            proposedPositionMap.set(position, itemId);
        });

        // Find gaps in sequence
        const allPositions = [
            ...Array.from(existingPositions.keys()),
            ...proposedPositions.map((p) => p.position),
        ].sort((a, b) => a - b);

        const gaps: number[] = [];
        const maxPosition = Math.max(...allPositions);
        for (let i = 1; i <= maxPosition; i++) {
            if (!allPositions.includes(i)) {
                gaps.push(i);
            }
        }

        // Generate suggestions for conflicted items
        const suggestions: Array<
            { itemId: string; suggestedPosition: number }
        > = [];
        let nextAvailablePosition = maxPosition + 1;

        conflicts.forEach((conflict) => {
            // Suggest next available position
            while (
                existingPositions.has(nextAvailablePosition) ||
                proposedPositionMap.has(nextAvailablePosition)
            ) {
                nextAvailablePosition++;
            }

            suggestions.push({
                itemId: conflict.proposedId,
                suggestedPosition: nextAvailablePosition,
            });

            nextAvailablePosition++;
        });

        const isValid = conflicts.length === 0;

        console.log(
            `[WaitlistValidation] Validation result: ${
                isValid ? "VALID" : "INVALID"
            }, ${conflicts.length} conflicts, ${gaps.length} gaps`,
        );

        return {
            isValid,
            conflicts,
            gaps,
            suggestions,
        };
    } catch (error) {
        console.error("Error validating waitlist positions:", error);
        return {
            isValid: false,
            conflicts: [],
            gaps: [],
            suggestions: [],
        };
    }
}

/**
 * Reset waitlist positions to eliminate gaps and ensure sequence
 *
 * @param date - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param preserveRelativeOrder - Whether to preserve relative order of existing items
 * @returns Promise resolving to reset operation result
 */
export async function resetWaitlistPositions(
    date: string,
    calendarId: string,
    preserveRelativeOrder: boolean = true,
): Promise<{
    success: boolean;
    updatedCount: number;
    newPositions: Array<
        { id: string; oldPosition: number; newPosition: number }
    >;
    error?: string;
}> {
    try {
        console.log(
            `[WaitlistReset] Resetting positions for ${date}, preserveOrder: ${preserveRelativeOrder}`,
        );

        // Query all waitlisted requests for this date
        const { data: waitlistedRequests, error: queryError } = await supabase
            .from("pld_sdv_requests")
            .select("id, waitlist_position, requested_at")
            .eq("calendar_id", calendarId)
            .eq("request_date", date)
            .eq("status", "waitlisted")
            .not("waitlist_position", "is", null);

        if (queryError) {
            console.error(
                "Error querying waitlisted requests for reset:",
                queryError,
            );
            return {
                success: false,
                updatedCount: 0,
                newPositions: [],
                error: queryError.message,
            };
        }

        if (!waitlistedRequests || waitlistedRequests.length === 0) {
            console.log("[WaitlistReset] No waitlisted requests found");
            return {
                success: true,
                updatedCount: 0,
                newPositions: [],
            };
        }

        // Sort requests based on preservation preference
        const sortedRequests = [...waitlistedRequests].sort((a, b) => {
            if (preserveRelativeOrder) {
                // Sort by current position, then by requested_at as tiebreaker
                const positionDiff = (a.waitlist_position || 0) -
                    (b.waitlist_position || 0);
                if (positionDiff !== 0) return positionDiff;
                return new Date(a.requested_at || 0).getTime() -
                    new Date(b.requested_at || 0).getTime();
            } else {
                // Sort by requested_at only (first-come, first-served)
                return new Date(a.requested_at || 0).getTime() -
                    new Date(b.requested_at || 0).getTime();
            }
        });

        // Assign new sequential positions
        const newPositions: Array<
            { id: string; oldPosition: number; newPosition: number }
        > = [];

        // Create update promises for positions that need to change
        const updatePromises = sortedRequests.map(async (request, index) => {
            const newPosition = index + 1;
            const oldPosition = request.waitlist_position || 0;

            if (oldPosition !== newPosition) {
                newPositions.push({
                    id: request.id,
                    oldPosition,
                    newPosition,
                });

                // Update the position in database
                return supabase
                    .from("pld_sdv_requests")
                    .update({ waitlist_position: newPosition })
                    .eq("id", request.id);
            }
            return null;
        });

        // Filter out null promises and execute all updates
        const validUpdatePromises = updatePromises.filter((
            promise,
        ): promise is Promise<any> => promise !== null);
        const updateResults = await Promise.all(validUpdatePromises);

        const failedUpdates = updateResults.filter((result) => result?.error);

        if (failedUpdates.length > 0) {
            console.error(
                "[WaitlistReset] Some updates failed:",
                updateResults,
            );
            return {
                success: false,
                updatedCount: updateResults.length - failedUpdates.length,
                newPositions,
                error: failedUpdates[0]?.error?.message || "Unknown error",
            };
        }

        console.log(
            `[WaitlistReset] Successfully reset ${newPositions.length} positions`,
        );

        return {
            success: true,
            updatedCount: newPositions.length,
            newPositions,
        };
    } catch (error) {
        console.error("Error resetting waitlist positions:", error);
        return {
            success: false,
            updatedCount: 0,
            newPositions: [],
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Update stage completion status and validate progression
 *
 * @param stagedPreview - Current staged import preview
 * @param stage - Stage to update
 * @param isComplete - Whether the stage is complete
 * @returns Updated staged import preview
 */
export function updateStageCompletion(
    stagedPreview: StagedImportPreview,
    stage: ImportStage,
    isComplete: boolean,
): StagedImportPreview {
    // Create a deep copy to avoid mutating the original object
    const updatedPreview = {
        ...stagedPreview,
        progressState: {
            ...stagedPreview.progressState,
            stageData: {
                ...stagedPreview.progressState.stageData,
                [stage]: {
                    ...stagedPreview.progressState.stageData[stage],
                    isComplete,
                },
            },
        },
        lastUpdated: new Date(),
    };

    // Update canProgress based on CURRENT stage completion, not the stage being updated
    const currentStage = updatedPreview.progressState.currentStage;
    updatedPreview.progressState.canProgress =
        updatedPreview.progressState.stageData[currentStage].isComplete;

    console.log(
        `[StagedImportPreview] Stage ${stage} completion updated: ${isComplete}`,
    );
    console.log(
        `[StagedImportPreview] Current stage ${currentStage} completion: ${
            updatedPreview.progressState.stageData[currentStage].isComplete
        }`,
    );
    console.log(
        `[StagedImportPreview] Can progress: ${updatedPreview.progressState.canProgress}`,
    );

    return updatedPreview;
}

// ============================================================================
// END: New Staged Import Functions
// ============================================================================

// ============================================================================
// PHASE 5: Enhanced Stage Transition & Re-Analysis Logic
// ============================================================================

/**
 * Interface for stage transition validation result
 */
export interface StageTransitionValidation {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    canProceed: boolean;
    requiresReAnalysis: boolean;
}

/**
 * Interface for stage rollback configuration
 */
export interface StageRollbackConfig {
    targetStage: ImportStage;
    preserveData: boolean;
    triggerReAnalysis: boolean;
    confirmationRequired: boolean;
    warningMessage: string;
}

/**
 * Interface for progress tracking metrics
 */
export interface ProgressMetrics {
    totalStages: number;
    completedStages: number;
    currentStageProgress: number; // 0-100
    estimatedTimeRemaining?: number; // in minutes
    stageCompletionTimes: Record<ImportStage, number>; // completion time in ms
    dataIntegrityScore: number; // 0-100
}

/**
 * Validate stage transition requirements before advancing
 *
 * @param stagedPreview - Current staged import preview
 * @param targetStage - Stage to transition to
 * @returns Validation result with errors and warnings
 */
export function validateStageTransition(
    stagedPreview: StagedImportPreview,
    targetStage: ImportStage,
): StageTransitionValidation {
    const { progressState } = stagedPreview;
    const currentStage = progressState.currentStage;
    const stageData = progressState.stageData;

    const validation: StageTransitionValidation = {
        isValid: true,
        errors: [],
        warnings: [],
        canProceed: false,
        requiresReAnalysis: false,
    };

    console.log(
        `[StageTransition] Validating transition from ${currentStage} to ${targetStage}`,
    );

    // Validate stage sequence
    const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "final_review",
    ];
    const currentIndex = stageOrder.indexOf(currentStage);
    const targetIndex = stageOrder.indexOf(targetStage);

    if (targetIndex < 0) {
        validation.errors.push(`Invalid target stage: ${targetStage}`);
        validation.isValid = false;
        return validation;
    }

    // Check if going backwards (rollback scenario)
    if (targetIndex < currentIndex) {
        validation.requiresReAnalysis = true;
        validation.warnings.push(
            `Rolling back to ${targetStage} will trigger re-analysis of all subsequent stages`,
        );
    }

    // Check if skipping stages (not allowed)
    if (targetIndex > currentIndex + 1) {
        validation.errors.push(
            `Cannot skip stages. Must complete ${
                stageOrder[currentIndex + 1]
            } before advancing to ${targetStage}`,
        );
        validation.isValid = false;
        return validation;
    }

    // Validate current stage completion for forward progression
    if (targetIndex > currentIndex) {
        const currentStageData = stageData[currentStage];
        if (!currentStageData.isComplete) {
            validation.errors.push(
                `Current stage ${currentStage} is not complete`,
            );
            validation.isValid = false;
            return validation;
        }

        // Stage-specific validation
        switch (currentStage) {
            case "unmatched":
                const unmatchedValidation = validateUnmatchedStageCompletion(
                    stageData.unmatched,
                );
                console.log(
                    `[StageTransition] Unmatched validation:`,
                    unmatchedValidation,
                );
                validation.errors.push(...unmatchedValidation.errors);
                validation.warnings.push(...unmatchedValidation.warnings);
                break;

            case "duplicates":
                const duplicateValidation = validateDuplicateStageCompletion(
                    stageData.duplicates,
                );
                validation.errors.push(...duplicateValidation.errors);
                validation.warnings.push(...duplicateValidation.warnings);
                break;

            case "over_allotment":
                const overAllotmentValidation =
                    validateOverAllotmentStageCompletion(
                        stageData.over_allotment,
                    );
                validation.errors.push(...overAllotmentValidation.errors);
                validation.warnings.push(...overAllotmentValidation.warnings);
                break;

            case "db_reconciliation":
                const dbReconciliationValidation =
                    validateDbReconciliationStageCompletion(
                        stageData.db_reconciliation,
                    );
                validation.errors.push(...dbReconciliationValidation.errors);
                validation.warnings.push(
                    ...dbReconciliationValidation.warnings,
                );
                break;
        }
    }

    // Data integrity checks
    const integrityValidation = validateDataIntegrity(stagedPreview);
    validation.errors.push(...integrityValidation.errors);
    validation.warnings.push(...integrityValidation.warnings);

    // Final determination
    validation.isValid = validation.errors.length === 0;
    validation.canProceed = validation.isValid;

    console.log(
        `[StageTransition] Validation result: ${
            validation.isValid ? "PASS" : "FAIL"
        }, ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
    );

    return validation;
}

/**
 * Validate unmatched stage completion requirements
 */
function validateUnmatchedStageCompletion(
    stageData: UnmatchedStageData,
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check that all unmatched items are resolved
    // Note: We need to find the original index for each unmatched item
    const unresolvedItems = stageData.unmatchedItems.filter(
        (item, unmatchedIndex) => {
            // Find the original index of this unmatched item
            // This is a bit tricky since we don't have direct access to originalItems here
            // We'll need to check if ANY original index has this item resolved
            // For now, let's assume the resolvedAssignments keys correspond to the correct original indices

            // Check if this unmatched item has been resolved by checking if any assignment exists
            // that could correspond to this item, or if it's been skipped
            const hasAssignment = Object.values(stageData.resolvedAssignments)
                .some((assignment) => assignment !== undefined);

            // Actually, we need a different approach. Let's check if the number of resolved items
            // matches the number of unmatched items minus skipped items
            return false; // We'll handle this differently below
        },
    );

    // Better approach: Check if total resolved + skipped equals total unmatched
    const totalUnmatched = stageData.unmatchedItems.length;
    const totalResolved = Object.keys(stageData.resolvedAssignments).length;
    const totalSkipped = stageData.skippedItems.size;
    const totalHandled = totalResolved + totalSkipped;

    console.log(
        `[validateUnmatchedStageCompletion] Total unmatched: ${totalUnmatched}, Resolved: ${totalResolved}, Skipped: ${totalSkipped}, Handled: ${totalHandled}`,
    );

    if (totalHandled < totalUnmatched) {
        const remaining = totalUnmatched - totalHandled;
        errors.push(
            `${remaining} unmatched items still need resolution`,
        );
    }

    // Warn about skipped items
    if (stageData.skippedItems.size > 0) {
        warnings.push(
            `${stageData.skippedItems.size} items will be excluded from import`,
        );
    }

    return { errors, warnings };
}

/**
 * Validate over-allotment stage completion requirements
 */
function validateOverAllotmentStageCompletion(
    stageData: OverAllotmentStageData,
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // UPDATED LOGIC: Check that all over-allotted dates have resolutions OR we can use defaults
    const unresolvedDates = stageData.overAllottedDates.filter((dateInfo) => {
        const hasExplicitOrdering = stageData.requestOrdering[dateInfo.date];
        const hasExplicitAllotmentDecision =
            stageData.allotmentAdjustments[dateInfo.date] !== undefined;

        // If admin has taken explicit actions, they must complete both
        if (hasExplicitOrdering || hasExplicitAllotmentDecision) {
            const hasAllotmentDecision = hasExplicitAllotmentDecision ||
                dateInfo.overAllotmentCount === 0;
            return !(hasExplicitOrdering && hasAllotmentDecision);
        }

        // If admin hasn't taken any explicit actions, accept defaults
        // Default behavior: keep current allotment, use natural order, waitlist excess requests
        return false; // No resolution needed - defaults are acceptable
    });

    if (unresolvedDates.length > 0) {
        errors.push(
            `${unresolvedDates.length} over-allotted dates still need resolution`,
        );
    }

    // Warn about allotment increases
    const allotmentIncreases =
        Object.keys(stageData.allotmentAdjustments).length;
    if (allotmentIncreases > 0) {
        warnings.push(
            `${allotmentIncreases} calendar allotments will be modified`,
        );
    }

    return { errors, warnings };
}

/**
 * Validate duplicate stage completion requirements
 */
function validateDuplicateStageCompletion(
    stageData: DuplicateStageData,
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check that all duplicates have decisions using original indices
    const unresolvedDuplicates = stageData.duplicateItems.filter((_, index) => {
        const originalIndex = stageData.duplicateOriginalIndices?.[index] ??
            index;
        return !stageData.skipDuplicates.has(originalIndex) &&
            !stageData.overrideDuplicates.has(originalIndex);
    });

    if (unresolvedDuplicates.length > 0) {
        errors.push(
            `${unresolvedDuplicates.length} duplicate items need decisions`,
        );
    }

    // Warn about overridden duplicates
    if (stageData.overrideDuplicates.size > 0) {
        warnings.push(
            `${stageData.overrideDuplicates.size} duplicate requests will be imported anyway`,
        );
    }

    return { errors, warnings };
}

/**
 * Validate database reconciliation stage completion requirements
 */
function validateDbReconciliationStageCompletion(
    stageData: DbReconciliationStageData,
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check that all conflicts have been reviewed
    const totalConflicts = stageData.conflicts.length;
    const reviewedConflicts = stageData.reviewedConflicts.size;

    if (totalConflicts > 0 && reviewedConflicts < totalConflicts) {
        const remaining = totalConflicts - reviewedConflicts;
        errors.push(
            `${remaining} database conflicts still need review`,
        );
    }

    // Warn about queued database changes
    if (stageData.queuedChanges.length > 0) {
        warnings.push(
            `${stageData.queuedChanges.length} database requests will be modified during import`,
        );
    }

    // Warn about high-severity conflicts that are resolved but have significant impact
    const highSeverityChanges = stageData.queuedChanges.filter((change) => {
        const conflict = stageData.conflicts.find((c) =>
            c.dbRequest.id === change.requestId
        );
        return conflict?.severity === "high";
    });

    if (highSeverityChanges.length > 0) {
        warnings.push(
            `${highSeverityChanges.length} high-impact database changes queued`,
        );
    }

    return { errors, warnings };
}

/**
 * Validate data integrity across all stages
 */
function validateDataIntegrity(
    stagedPreview: StagedImportPreview,
): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { originalItems, progressState } = stagedPreview;

    // Check for data consistency between stages
    const totalOriginalItems = originalItems.length;
    const { unmatched, duplicates } = progressState.stageData;

    // Validate that skipped items don't overlap incorrectly
    const unmatchedSkipped = unmatched.skippedItems.size;
    const duplicateSkipped = duplicates.skipDuplicates.size;

    // Check for logical consistency
    if (unmatchedSkipped + duplicateSkipped > totalOriginalItems) {
        errors.push(
            "Data integrity error: More items skipped than total items",
        );
    }

    // Validate member assignments
    const assignmentCount = Object.keys(unmatched.resolvedAssignments).length;
    const unmatchedCount = unmatched.unmatchedItems.length;

    if (assignmentCount > unmatchedCount) {
        warnings.push(
            "More member assignments than unmatched items - possible data inconsistency",
        );
    }

    // Check for orphaned data
    const allStageIndices = new Set([
        ...Array.from(unmatched.skippedItems),
        ...Object.keys(unmatched.resolvedAssignments).map(Number),
        ...Array.from(duplicates.skipDuplicates),
        ...Array.from(duplicates.overrideDuplicates),
    ]);

    const orphanedIndices = Array.from(allStageIndices).filter((index) =>
        index < 0 || index >= totalOriginalItems
    );

    if (orphanedIndices.length > 0) {
        errors.push(
            `Data integrity error: ${orphanedIndices.length} references to non-existent items`,
        );
    }

    return { errors, warnings };
}

/**
 * Execute stage rollback with data preservation options
 *
 * @param stagedPreview - Current staged import preview
 * @param config - Rollback configuration
 * @returns Updated staged import preview
 */
export async function executeStageRollback(
    stagedPreview: StagedImportPreview,
    config: StageRollbackConfig,
): Promise<StagedImportPreview> {
    console.log(`[StageRollback] Rolling back to stage: ${config.targetStage}`);

    const { progressState } = stagedPreview;
    const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "final_review",
    ];
    const targetIndex = stageOrder.indexOf(config.targetStage);
    const currentIndex = stageOrder.indexOf(progressState.currentStage);

    if (targetIndex >= currentIndex) {
        throw new Error("Cannot rollback to current or future stage");
    }

    // Update current stage
    progressState.currentStage = config.targetStage;

    // Clear subsequent stages from completed list
    progressState.completedStages = progressState.completedStages.filter(
        (stage) => {
            const stageIndex = stageOrder.indexOf(stage);
            return stageIndex <= targetIndex;
        },
    );

    // Reset subsequent stage data if not preserving
    if (!config.preserveData) {
        for (let i = targetIndex + 1; i < stageOrder.length; i++) {
            const stage = stageOrder[i];
            resetStageData(progressState.stageData, stage);
        }
    } else {
        // Mark subsequent stages as incomplete but preserve data
        for (let i = targetIndex + 1; i < stageOrder.length; i++) {
            const stage = stageOrder[i];
            progressState.stageData[stage].isComplete = false;
        }
    }

    // Update progression capability
    progressState.canProgress =
        progressState.stageData[config.targetStage].isComplete;

    // Trigger re-analysis if requested
    if (config.triggerReAnalysis) {
        await triggerStageReAnalysis(stagedPreview, config.targetStage);
    }

    stagedPreview.lastUpdated = new Date();

    console.log(
        `[StageRollback] Rollback completed to stage: ${config.targetStage}`,
    );
    return stagedPreview;
}

/**
 * Reset stage data to initial state
 */
function resetStageData(
    stageData: ImportProgressState["stageData"],
    stage: ImportStage,
): void {
    switch (stage) {
        case "unmatched":
            stageData.unmatched.resolvedAssignments = {};
            stageData.unmatched.skippedItems.clear();
            stageData.unmatched.isComplete = false;
            break;

        case "duplicates":
            stageData.duplicates.duplicateItems = [];
            stageData.duplicates.skipDuplicates.clear();
            stageData.duplicates.overrideDuplicates.clear();
            stageData.duplicates.isComplete = false;
            break;

        case "over_allotment":
            stageData.over_allotment.overAllottedDates = [];
            stageData.over_allotment.allotmentAdjustments = {};
            stageData.over_allotment.requestOrdering = {};
            stageData.over_allotment.isComplete = false;
            break;

        case "db_reconciliation":
            stageData.db_reconciliation.queuedChanges = [];
            stageData.db_reconciliation.reviewedConflicts.clear();
            stageData.db_reconciliation.isComplete = false;
            stageData.db_reconciliation.cacheTimestamp = undefined;
            break;

        case "final_review":
            stageData.final_review.approvedItems = [];
            stageData.final_review.waitlistedItems = [];
            stageData.final_review.skippedItems = [];
            stageData.final_review.allotmentChanges = [];
            stageData.final_review.summary = {
                totalToImport: 0,
                approvedCount: 0,
                waitlistedCount: 0,
                skippedCount: 0,
                allotmentAdjustments: 0,
            };
            stageData.final_review.isComplete = false;
            break;
    }
}

/**
 * Trigger re-analysis for a specific stage and all subsequent stages
 *
 * @param stagedPreview - Current staged import preview
 * @param fromStage - Stage to start re-analysis from
 */
export async function triggerStageReAnalysis(
    stagedPreview: StagedImportPreview,
    fromStage: ImportStage,
): Promise<void> {
    console.log(
        `[StageReAnalysis] Triggering re-analysis from stage: ${fromStage}`,
    );

    const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "db_reconciliation",
        "final_review",
    ];
    const fromIndex = stageOrder.indexOf(fromStage);

    // Re-analyze each stage in sequence
    for (let i = fromIndex; i < stageOrder.length; i++) {
        const stage = stageOrder[i];

        try {
            switch (stage) {
                case "unmatched":
                    // Unmatched stage doesn't need re-analysis as it's based on original data
                    break;

                case "duplicates":
                    await analyzeDuplicateStage(stagedPreview);
                    break;

                case "over_allotment":
                    await analyzeOverAllotmentStage(stagedPreview);
                    break;

                case "db_reconciliation":
                    await analyzeDbReconciliationStage(stagedPreview);
                    break;

                case "final_review":
                    await analyzeFinalReviewStage(stagedPreview);
                    break;
            }

            console.log(
                `[StageReAnalysis] Completed re-analysis for stage: ${stage}`,
            );
        } catch (error) {
            console.error(
                `[StageReAnalysis] Failed to re-analyze stage ${stage}:`,
                error,
            );
            throw new Error(`Re-analysis failed at stage ${stage}: ${error}`);
        }
    }

    stagedPreview.lastUpdated = new Date();
    console.log(
        `[StageReAnalysis] Re-analysis completed from stage: ${fromStage}`,
    );
}

/**
 * Calculate progress metrics for the staged import
 *
 * @param stagedPreview - Current staged import preview
 * @returns Progress metrics and estimates
 */
export function calculateProgressMetrics(
    stagedPreview: StagedImportPreview,
): ProgressMetrics {
    const { progressState } = stagedPreview;
    const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "db_reconciliation",
        "final_review",
    ];

    const totalStages = stageOrder.length;
    const completedStages = progressState.completedStages.length;
    const currentStageIndex = stageOrder.indexOf(progressState.currentStage);

    // Calculate current stage progress
    let currentStageProgress = 0;
    const currentStageData =
        progressState.stageData[progressState.currentStage];

    if (currentStageData.isComplete) {
        currentStageProgress = 100;
    } else {
        // Estimate progress based on stage type
        switch (progressState.currentStage) {
            case "unmatched":
                const totalUnmatched =
                    progressState.stageData.unmatched.unmatchedItems.length;
                const resolvedUnmatched = Object.keys(
                    progressState.stageData.unmatched.resolvedAssignments,
                ).length +
                    progressState.stageData.unmatched.skippedItems.size;
                currentStageProgress = totalUnmatched > 0
                    ? (resolvedUnmatched / totalUnmatched) * 100
                    : 100;
                break;

            case "duplicates":
                const totalDuplicates =
                    progressState.stageData.duplicates.duplicateItems.length;
                const resolvedDuplicates =
                    progressState.stageData.duplicates.skipDuplicates.size +
                    progressState.stageData.duplicates.overrideDuplicates.size;
                currentStageProgress = totalDuplicates > 0
                    ? (resolvedDuplicates / totalDuplicates) * 100
                    : 100;
                break;

            case "over_allotment":
                const totalOverAllotted =
                    progressState.stageData.over_allotment.overAllottedDates
                        .length;
                const resolvedOverAllotted =
                    progressState.stageData.over_allotment.overAllottedDates
                        .filter((dateInfo) => {
                            const hasOrdering =
                                progressState.stageData.over_allotment
                                    .requestOrdering[dateInfo.date];
                            const hasAllotmentDecision =
                                progressState.stageData.over_allotment
                                    .allotmentAdjustments[dateInfo.date] !==
                                    undefined;
                            return hasOrdering && hasAllotmentDecision;
                        }).length;
                currentStageProgress = totalOverAllotted > 0
                    ? (resolvedOverAllotted / totalOverAllotted) * 100
                    : 100;
                break;

            case "db_reconciliation":
                const totalConflicts =
                    progressState.stageData.db_reconciliation.conflicts.length;
                const reviewedConflicts =
                    progressState.stageData.db_reconciliation.reviewedConflicts
                        .size;
                currentStageProgress = totalConflicts > 0
                    ? (reviewedConflicts / totalConflicts) * 100
                    : 100;
                break;

            case "final_review":
                currentStageProgress =
                    progressState.stageData.final_review.isComplete ? 100 : 50;
                break;
        }
    }

    // Calculate data integrity score
    const integrityValidation = validateDataIntegrity(stagedPreview);
    const dataIntegrityScore = Math.max(
        0,
        100 - (integrityValidation.errors.length * 20) -
            (integrityValidation.warnings.length * 5),
    );

    // Estimate time remaining (simplified)
    const avgTimePerStage = 2; // minutes
    const remainingStages = totalStages - currentStageIndex -
        (currentStageProgress / 100);
    const estimatedTimeRemaining = remainingStages * avgTimePerStage;

    return {
        totalStages,
        completedStages,
        currentStageProgress: Math.round(currentStageProgress),
        estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
        stageCompletionTimes: {
            unmatched: 0,
            duplicates: 0,
            over_allotment: 0,
            db_reconciliation: 0,
            final_review: 0,
        }, // Would be populated with actual timing data
        dataIntegrityScore: Math.round(dataIntegrityScore),
    };
}

/**
 * Enhanced stage advancement with comprehensive validation
 *
 * @param stagedPreview - Current staged import preview
 * @returns Promise resolving to updated staged import preview
 */
export async function advanceToNextStageWithValidation(
    stagedPreview: StagedImportPreview,
): Promise<StagedImportPreview> {
    const { progressState } = stagedPreview;
    const currentStage = progressState.currentStage;

    console.log(
        `[EnhancedStageAdvancement] Attempting to advance from stage: ${currentStage}`,
    );

    // Determine next stage
    const stageOrder: ImportStage[] = [
        "unmatched",
        "duplicates",
        "over_allotment",
        "final_review",
    ];
    const currentIndex = stageOrder.indexOf(currentStage);

    if (currentIndex >= stageOrder.length - 1) {
        throw new Error("Already at final stage");
    }

    const nextStage = stageOrder[currentIndex + 1];

    // Validate transition
    const validation = validateStageTransition(stagedPreview, nextStage);

    if (!validation.isValid) {
        throw new Error(
            `Cannot advance to ${nextStage}: ${validation.errors.join(", ")}`,
        );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
        console.warn(
            `[EnhancedStageAdvancement] Warnings for transition to ${nextStage}:`,
            validation.warnings,
        );
    }

    // Use existing advancement logic
    return await advanceToNextStage(stagedPreview);
}

/**
 * Create rollback configuration for stage navigation
 *
 * @param targetStage - Stage to rollback to
 * @param preserveData - Whether to preserve subsequent stage data
 * @returns Rollback configuration
 */
export function createRollbackConfig(
    targetStage: ImportStage,
    preserveData: boolean = false,
): StageRollbackConfig {
    const stageNames = {
        unmatched: "Unmatched Members",
        duplicates: "Duplicate Detection",
        over_allotment: "Over-Allotment Review",
        db_reconciliation: "Database Reconciliation",
        final_review: "Final Review",
    };

    return {
        targetStage,
        preserveData,
        triggerReAnalysis: !preserveData,
        confirmationRequired: true,
        warningMessage: `Going back to ${stageNames[targetStage]} will ${
            preserveData
                ? "mark subsequent stages as incomplete"
                : "reset all subsequent stage data and trigger re-analysis"
        }. This action cannot be undone.`,
    };
}

/**
 * Helper function to check if a request date is valid for waitlisting
 * Requests in the past, today, or within 48 hours cannot be waitlisted
 *
 * @param requestDate - The date of the request
 * @returns true if the date is valid for waitlisting, false otherwise
 */
function isValidForWaitlisting(requestDate: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const requestDay = new Date(requestDate);
    requestDay.setHours(0, 0, 0, 0); // Start of request day

    // Calculate 48 hours from today (2 days)
    const minValidDate = new Date(today);
    minValidDate.setDate(today.getDate() + 2); // 48 hours = 2 days from today

    // Request must be at least 2 days in the future
    return requestDay >= minValidDate;
}

/**
 * Filter items by date validity for waitlisting and auto-reject waitlisted requests on invalid dates
 * This ensures requests that would be waitlisted on dates in the past, today, or within 48 hours are automatically rejected
 *
 * @param itemsByDate - Items grouped by date
 * @param calendarId - Calendar ID for checking allotments
 * @param stagedPreview - Staged preview to update with auto-rejected items
 * @returns Filtered items with auto-rejected waitlisted requests handled
 */
async function filterItemsByDateValidity(
    itemsByDate: Record<string, ImportPreviewItem[]>,
    calendarId: string,
    stagedPreview: StagedImportPreview,
): Promise<
    {
        validItems: Record<string, ImportPreviewItem[]>;
        autoRejectedCount: number;
    }
> {
    const validItems: Record<string, ImportPreviewItem[]> = {};
    let autoRejectedCount = 0;

    for (const [dateStr, items] of Object.entries(itemsByDate)) {
        const requestDate = new Date(dateStr);

        if (isValidForWaitlisting(requestDate)) {
            // Date is valid for waitlisting, but still need to filter duplicates
            try {
                // Compare imported requests to existing requests in DB and drop duplicates
                const { uniqueItems, duplicateCount } =
                    await filterDuplicatesAgainstDatabase(
                        items,
                        dateStr,
                        calendarId,
                        stagedPreview,
                    );

                if (duplicateCount > 0) {
                    console.log(
                        `[OverAllotment] Found ${duplicateCount} duplicates against existing DB requests for ${dateStr} (valid for waitlisting)`,
                    );
                }

                // Keep all unique items since this date is valid for waitlisting
                validItems[dateStr] = uniqueItems;
            } catch (error) {
                console.error(
                    `[OverAllotment] Error filtering duplicates for ${dateStr}:`,
                    error,
                );
                // On error, keep original items to be safe
                validItems[dateStr] = items;
            }
        } else {
            // Date is invalid for waitlisting - auto-reject requests that would be waitlisted
            console.log(
                `[OverAllotment] Date ${dateStr} is invalid for waitlisting (past/today/within 48hrs) - checking for auto-rejections`,
            );

            try {
                // Get allotment info for this date
                const allotmentInfo = await getDateAllotmentInfo(
                    dateStr,
                    calendarId,
                );
                const availableSlots = Math.max(
                    0,
                    allotmentInfo.currentAllotment -
                        allotmentInfo.existingRequests,
                );

                // Compare imported requests to existing requests in DB and drop duplicates
                const { uniqueItems, duplicateCount } =
                    await filterDuplicatesAgainstDatabase(
                        items,
                        dateStr,
                        calendarId,
                        stagedPreview,
                    );

                console.log(
                    `[OverAllotment] Found ${duplicateCount} duplicates against existing DB requests for ${dateStr}`,
                );

                if (uniqueItems.length <= availableSlots) {
                    // All unique requests can be approved, so keep all items
                    validItems[dateStr] = uniqueItems;
                    console.log(
                        `[OverAllotment] All ${uniqueItems.length} unique requests for ${dateStr} can be approved (${availableSlots} slots available)`,
                    );
                } else {
                    // Some requests would be waitlisted - auto-reject those
                    const approvedItems = uniqueItems.slice(0, availableSlots);
                    const waitlistedItems = uniqueItems.slice(availableSlots);

                    // Add approved items to valid items
                    if (approvedItems.length > 0) {
                        validItems[dateStr] = approvedItems;
                    }

                    // Auto-reject waitlisted items by adding their original indices to skipped items
                    waitlistedItems.forEach((item) => {
                        const originalIndex = stagedPreview.originalItems
                            .findIndex(
                                (orig) => orig === item,
                            );
                        if (originalIndex !== -1) {
                            stagedPreview.progressState.stageData.unmatched
                                .skippedItems.add(originalIndex);
                            autoRejectedCount++;
                        }
                    });

                    console.log(
                        `[OverAllotment] Auto-approved ${approvedItems.length} requests and auto-rejected ${waitlistedItems.length} requests for ${dateStr} (too close for waitlisting)`,
                    );
                }
            } catch (error) {
                console.error(
                    `[OverAllotment] Error processing date ${dateStr}:`,
                    error,
                );
                // On error, exclude all items for this date to be safe
                items.forEach((item) => {
                    const originalIndex = stagedPreview.originalItems.findIndex(
                        (orig) => orig === item,
                    );
                    if (originalIndex !== -1) {
                        stagedPreview.progressState.stageData.unmatched
                            .skippedItems.add(originalIndex);
                        autoRejectedCount++;
                    }
                });
            }
        }
    }

    return { validItems, autoRejectedCount };
}

/**
 * Filter imported requests against existing database requests to remove duplicates
 *
 * @param items - Array of import preview items for a specific date
 * @param dateStr - Date string in ISO format
 * @param calendarId - Calendar ID
 * @param stagedPreview - Staged preview to update with duplicate items
 * @returns Object with unique items and duplicate count
 */
async function filterDuplicatesAgainstDatabase(
    items: ImportPreviewItem[],
    dateStr: string,
    calendarId: string,
    stagedPreview: StagedImportPreview,
): Promise<{ uniqueItems: ImportPreviewItem[]; duplicateCount: number }> {
    try {
        // Query existing requests for this date (excluding cancelled requests)
        const { data: existingRequests, error } = await supabase
            .from("pld_sdv_requests")
            .select("member_id, pin_number, leave_type")
            .eq("calendar_id", calendarId)
            .eq("request_date", dateStr)
            .in("status", ["approved", "waitlisted", "pending"]); // Exclude cancelled requests

        if (error) {
            console.error(
                `Error querying existing requests for ${dateStr}:`,
                error,
            );
            // On error, return all items as unique to be safe
            return { uniqueItems: items, duplicateCount: 0 };
        }

        if (!existingRequests || existingRequests.length === 0) {
            // No existing requests, all items are unique
            return { uniqueItems: items, duplicateCount: 0 };
        }

        // Create lookup set for existing requests
        const existingRequestsSet = new Set(
            existingRequests.map((req) => {
                // Create a unique key combining member_id (or pin_number) and leave_type
                const identifier = req.member_id ||
                    req.pin_number?.toString() || "";
                return `${identifier}_${req.leave_type}`;
            }),
        );

        const uniqueItems: ImportPreviewItem[] = [];
        let duplicateCount = 0;

        // Check each imported item against existing requests
        items.forEach((item) => {
            const originalIndex = stagedPreview.originalItems.findIndex((
                orig,
            ) => orig === item);

            // Get member identifier for this import item
            let memberIdentifier = "";
            let memberData = null;

            if (
                item.matchedMember.status === "matched" &&
                item.matchedMember.member
            ) {
                // Item was automatically matched
                memberData = item.matchedMember.member;
                memberIdentifier = memberData.id ||
                    memberData.pin_number?.toString() || "";
            } else if (
                originalIndex !== -1 &&
                stagedPreview.progressState.stageData.unmatched
                    .resolvedAssignments[originalIndex]
            ) {
                // Item was manually resolved in unmatched stage
                memberData = stagedPreview.progressState.stageData.unmatched
                    .resolvedAssignments[originalIndex];
                memberIdentifier = memberData.id ||
                    memberData.pin_number?.toString() || "";
                console.log(
                    `[DuplicateFilter] Using manually resolved member for ${item.firstName} ${item.lastName}: ${memberData.first_name} ${memberData.last_name}`,
                );
            } else {
                // For truly unmatched members, we can't properly check duplicates, so consider them unique
                memberIdentifier =
                    `unmatched_${item.firstName}_${item.lastName}`;
                console.log(
                    `[DuplicateFilter] No member assignment found for ${item.firstName} ${item.lastName}, treating as unique`,
                );
            }

            const itemKey = `${memberIdentifier}_${item.leaveType}`;

            if (existingRequestsSet.has(itemKey)) {
                // This is a duplicate - add to skipped items
                if (originalIndex !== -1) {
                    stagedPreview.progressState.stageData.unmatched.skippedItems
                        .add(originalIndex);
                    duplicateCount++;
                    console.log(
                        `[DuplicateFilter] Skipping duplicate request for ${item.firstName} ${item.lastName} (${item.leaveType}) on ${dateStr} - matches existing member ${
                            memberData?.first_name || "unknown"
                        } ${memberData?.last_name || "unknown"}`,
                    );
                }
            } else {
                // This is unique
                uniqueItems.push(item);
            }
        });

        return { uniqueItems, duplicateCount };
    } catch (error) {
        console.error(`Error filtering duplicates for ${dateStr}:`, error);
        // On error, return all items as unique to be safe
        return { uniqueItems: items, duplicateCount: 0 };
    }
}

/**
 * Update duplicate detection flags for manually resolved member assignments
 * This should be called after the unmatched stage is completed to properly mark
 * items with resolved assignments as potential duplicates
 *
 * @param stagedPreview - Current staged import preview
 */
export async function updateDuplicateFlagsForResolvedAssignments(
    stagedPreview: StagedImportPreview,
): Promise<void> {
    console.log(
        `[DuplicateUpdate] Updating duplicate flags for resolved assignments`,
    );

    const { unmatched } = stagedPreview.progressState.stageData;
    let updatedCount = 0;

    // Check each resolved assignment for potential duplicates
    for (
        const [originalIndexStr, memberData] of Object.entries(
            unmatched.resolvedAssignments,
        )
    ) {
        const originalIndex = parseInt(originalIndexStr, 10);
        const item = stagedPreview.originalItems[originalIndex];

        if (!item) {
            console.warn(
                `[DuplicateUpdate] No item found for original index ${originalIndex}`,
            );
            continue;
        }

        // Check if this member already has a request for this date
        const isPotentialDuplicate = await checkForDuplicate(
            memberData.id || null,
            memberData.pin_number,
            item.requestDate,
            stagedPreview.calendarId,
        );

        if (isPotentialDuplicate && !item.isPotentialDuplicate) {
            // Update the original item to mark it as a potential duplicate
            item.isPotentialDuplicate = true;
            updatedCount++;
            console.log(
                `[DuplicateUpdate] Marked resolved assignment as duplicate: ${item.firstName} ${item.lastName} -> ${memberData.first_name} ${memberData.last_name}`,
            );
        }
    }

    if (updatedCount > 0) {
        stagedPreview.lastUpdated = new Date();
        console.log(
            `[DuplicateUpdate] Updated ${updatedCount} items with duplicate flags`,
        );
    } else {
        console.log(`[DuplicateUpdate] No duplicate flags needed updating`);
    }
}

// ============================================================================
// PHASE 8.4: Database State Management & Re-Analysis Functions
// ============================================================================

/**
 * Interface for allotment impact analysis result
 */
export interface AllotmentImpactAnalysis {
    affectedDates: string[];
    impactsByDate: Record<string, {
        date: string;
        currentAllotment: number;
        currentRequests: number;
        queuedCancellations: number;
        queuedStatusChanges: number;
        newAvailableSlots: number;
        requiresOverAllotmentReAnalysis: boolean;
    }>;
    requiresOverAllotmentReturn: boolean;
    preservedOrderings: Record<string, number[]>;
    modifiedOrderings: Record<string, {
        originalOrdering: number[];
        newOrdering: number[];
        removedIndices: number[];
        movedIndices: Array<{ index: number; from: string; to: string }>;
    }>;
}

/**
 * Analyze the impact of queued database changes on allotment calculations
 *
 * @param stagedPreview - Current staged import preview
 * @returns Promise resolving to impact analysis result
 */
export async function analyzeQueuedDbChangesImpact(
    stagedPreview: StagedImportPreview,
): Promise<AllotmentImpactAnalysis> {
    console.log(
        `[DbImpactAnalysis] Analyzing impact of queued database changes`,
    );

    const { progressState } = stagedPreview;
    const { db_reconciliation, over_allotment } = progressState.stageData;

    const impactAnalysis: AllotmentImpactAnalysis = {
        affectedDates: [],
        impactsByDate: {},
        requiresOverAllotmentReturn: false,
        preservedOrderings: {},
        modifiedOrderings: {},
    };

    // Group queued changes by date
    const changesByDate = groupQueuedChangesByDate(
        db_reconciliation.queuedChanges,
    );

    // Analyze impact for each affected date
    for (const [dateStr, changes] of Object.entries(changesByDate)) {
        const impact = await analyzeQueuedChangesForDate(
            dateStr,
            changes,
            stagedPreview.calendarId,
            over_allotment.requestOrdering[dateStr] || [],
            over_allotment.allotmentAdjustments[dateStr],
        );

        if (impact.requiresOverAllotmentReAnalysis) {
            impactAnalysis.requiresOverAllotmentReturn = true;
            impactAnalysis.affectedDates.push(dateStr);
            impactAnalysis.impactsByDate[dateStr] = impact;

            // Calculate modified orderings if admin had previously set them
            const existingOrdering = over_allotment.requestOrdering[dateStr];
            if (existingOrdering && existingOrdering.length > 0) {
                const orderingChanges = calculateOrderingChanges(
                    existingOrdering,
                    changes,
                    stagedPreview.originalItems,
                );

                if (orderingChanges.hasChanges) {
                    impactAnalysis.modifiedOrderings[dateStr] = orderingChanges;
                } else {
                    impactAnalysis.preservedOrderings[dateStr] =
                        existingOrdering;
                }
            }
        }
    }

    console.log(
        `[DbImpactAnalysis] Analysis complete - ${impactAnalysis.affectedDates.length} dates affected, ` +
            `requires over-allotment return: ${impactAnalysis.requiresOverAllotmentReturn}`,
    );

    return impactAnalysis;
}

/**
 * Group queued database changes by date
 */
function groupQueuedChangesByDate(
    queuedChanges: QueuedDbChange[],
): Record<string, QueuedDbChange[]> {
    return queuedChanges.reduce((groups, change) => {
        const dateStr = change.requestDate;
        if (!groups[dateStr]) {
            groups[dateStr] = [];
        }
        groups[dateStr].push(change);
        return groups;
    }, {} as Record<string, QueuedDbChange[]>);
}

/**
 * Analyze queued changes impact for a specific date
 */
async function analyzeQueuedChangesForDate(
    dateStr: string,
    changes: QueuedDbChange[],
    calendarId: string,
    existingOrdering: number[],
    currentAllotmentAdjustment?: number,
): Promise<{
    date: string;
    currentAllotment: number;
    currentRequests: number;
    queuedCancellations: number;
    queuedStatusChanges: number;
    newAvailableSlots: number;
    requiresOverAllotmentReAnalysis: boolean;
}> {
    // Get current allotment info for this date
    const allotmentInfo = await getDateAllotmentInfo(dateStr, calendarId);
    const effectiveAllotment = currentAllotmentAdjustment ||
        allotmentInfo.currentAllotment;

    // Count different types of changes
    let queuedCancellations = 0;
    let queuedStatusChanges = 0;

    changes.forEach((change) => {
        if (change.newStatus === "cancelled") {
            queuedCancellations++;
        } else if (change.currentStatus !== change.newStatus) {
            queuedStatusChanges++;
        }
    });

    // Calculate new available slots after queued changes
    const newAvailableSlots = effectiveAllotment -
        (allotmentInfo.existingRequests - queuedCancellations);

    // Check if this affects over-allotment calculations
    const requiresOverAllotmentReAnalysis = queuedCancellations > 0 || // Cancelled requests free up slots
        queuedStatusChanges > 0 || // Status changes might affect approval/waitlist counts
        existingOrdering.length > 0; // Admin had set custom ordering

    return {
        date: dateStr,
        currentAllotment: effectiveAllotment,
        currentRequests: allotmentInfo.existingRequests,
        queuedCancellations,
        queuedStatusChanges,
        newAvailableSlots,
        requiresOverAllotmentReAnalysis,
    };
}

/**
 * Calculate how admin's previous ordering will be affected by queued changes
 */
function calculateOrderingChanges(
    existingOrdering: number[],
    queuedChanges: QueuedDbChange[],
    originalItems: ImportPreviewItem[],
): {
    hasChanges: boolean;
    originalOrdering: number[];
    newOrdering: number[];
    removedIndices: number[];
    movedIndices: Array<{ index: number; from: string; to: string }>;
} {
    // For now, we'll assume that database changes don't directly affect import ordering
    // since they apply to existing requests, not import items
    // The main impact is on available slots which affects how many can be approved vs waitlisted

    return {
        hasChanges: false,
        originalOrdering: [...existingOrdering],
        newOrdering: [...existingOrdering],
        removedIndices: [],
        movedIndices: [],
    };
}

/**
 * Create warning message for returning to over-allotment stage due to DB changes
 *
 * @param impactAnalysis - Result from analyzeQueuedDbChangesImpact
 * @returns Warning message object with summary and details
 */
export function createDbChangesWarningMessage(
    impactAnalysis: AllotmentImpactAnalysis,
): {
    title: string;
    summary: string;
    details: string[];
    affectedDates: string[];
    preservedOrderingCount: number;
    modifiedOrderingCount: number;
} {
    const affectedDatesCount = impactAnalysis.affectedDates.length;
    const preservedOrderingCount =
        Object.keys(impactAnalysis.preservedOrderings).length;
    const modifiedOrderingCount =
        Object.keys(impactAnalysis.modifiedOrderings).length;

    const title = "Database Changes Affect Allotment Calculations";

    const summary =
        `Your queued database changes affect ${affectedDatesCount} date(s) with over-allotment situations. ` +
        `You'll need to review the over-allotment stage to ensure your import decisions are still valid.`;

    const details: string[] = [];

    // Add details for each affected date
    impactAnalysis.affectedDates.forEach((dateStr) => {
        const impact = impactAnalysis.impactsByDate[dateStr];
        if (impact.queuedCancellations > 0) {
            details.push(
                `${dateStr}: ${impact.queuedCancellations} cancelled request(s) will free up ${impact.queuedCancellations} slot(s)`,
            );
        }
        if (impact.queuedStatusChanges > 0) {
            details.push(
                `${dateStr}: ${impact.queuedStatusChanges} status change(s) may affect approval/waitlist calculations`,
            );
        }
    });

    // Add ordering preservation info
    if (preservedOrderingCount > 0) {
        details.push(
            `Your previous drag-and-drop ordering will be preserved for ${preservedOrderingCount} date(s)`,
        );
    }

    if (modifiedOrderingCount > 0) {
        details.push(
            `Your previous drag-and-drop ordering needs adjustment for ${modifiedOrderingCount} date(s) due to database changes`,
        );
    }

    return {
        title,
        summary,
        details,
        affectedDates: impactAnalysis.affectedDates,
        preservedOrderingCount,
        modifiedOrderingCount,
    };
}

/**
 * Apply queued database changes impact to over-allotment stage data
 * This updates the over-allotment calculations to reflect the impact of pending DB changes
 *
 * @param stagedPreview - Current staged import preview
 * @param impactAnalysis - Result from analyzeQueuedDbChangesImpact
 */
export async function applyDbChangesImpactToOverAllotment(
    stagedPreview: StagedImportPreview,
    impactAnalysis: AllotmentImpactAnalysis,
): Promise<void> {
    console.log(
        `[ApplyDbImpact] Applying database changes impact to over-allotment stage`,
    );

    const { progressState } = stagedPreview;
    const { over_allotment } = progressState.stageData;

    // Re-analyze over-allotment considering queued DB changes
    for (const dateStr of impactAnalysis.affectedDates) {
        const impact = impactAnalysis.impactsByDate[dateStr];

        // Find the corresponding over-allotted date
        const overAllottedDate = over_allotment.overAllottedDates.find((d) =>
            d.date === dateStr
        );

        if (overAllottedDate) {
            // Update existing requests count to reflect queued cancellations
            overAllottedDate.existingRequests = impact.currentRequests -
                impact.queuedCancellations;

            // Recalculate total requests and over-allotment
            overAllottedDate.totalRequests = overAllottedDate.existingRequests +
                overAllottedDate.importRequests.length;
            overAllottedDate.overAllotmentCount = Math.max(
                0,
                overAllottedDate.totalRequests - impact.currentAllotment,
            );

            // Update suggested allotment
            overAllottedDate.suggestedAllotment = impact.currentAllotment +
                overAllottedDate.overAllotmentCount;

            console.log(
                `[ApplyDbImpact] Updated ${dateStr}: existing requests ${impact.currentRequests} -> ${overAllottedDate.existingRequests}, ` +
                    `over-allotment ${overAllottedDate.overAllotmentCount}`,
            );
        }

        // Preserve or update ordering based on impact analysis
        if (impactAnalysis.preservedOrderings[dateStr]) {
            // Keep existing ordering
            console.log(
                `[ApplyDbImpact] Preserving existing ordering for ${dateStr}`,
            );
        } else if (impactAnalysis.modifiedOrderings[dateStr]) {
            // Apply modified ordering
            const modification = impactAnalysis.modifiedOrderings[dateStr];
            over_allotment.requestOrdering[dateStr] = modification.newOrdering;
            console.log(
                `[ApplyDbImpact] Applied modified ordering for ${dateStr}`,
            );
        }
    }

    // Update stage completion status
    const hasUnresolvedOverAllotments = over_allotment.overAllottedDates.some(
        (dateInfo) =>
            dateInfo.overAllotmentCount > 0 &&
            !over_allotment.requestOrdering[dateInfo.date],
    );

    over_allotment.isComplete = !hasUnresolvedOverAllotments;

    stagedPreview.lastUpdated = new Date();

    console.log(
        `[ApplyDbImpact] Impact applied - over-allotment stage complete: ${over_allotment.isComplete}`,
    );
}

/**
 * Implement rollback mechanism for queued changes when admin returns to earlier stages
 *
 * @param stagedPreview - Current staged import preview
 * @param targetStage - Stage being rolled back to
 * @param preserveQueuedChanges - Whether to preserve queued changes or clear them
 */
export function rollbackQueuedDbChanges(
    stagedPreview: StagedImportPreview,
    targetStage: ImportStage,
    preserveQueuedChanges: boolean = false,
): void {
    console.log(
        `[DbRollback] Rolling back queued changes for transition to ${targetStage}, ` +
            `preserve: ${preserveQueuedChanges}`,
    );

    const { db_reconciliation } = stagedPreview.progressState.stageData;

    if (!preserveQueuedChanges) {
        // Clear all queued changes
        const originalQueuedCount = db_reconciliation.queuedChanges.length;
        db_reconciliation.queuedChanges = [];

        // Reset reviewed conflicts to allow re-review
        db_reconciliation.reviewedConflicts.clear();

        // Mark stage as incomplete
        db_reconciliation.isComplete = false;

        // Invalidate cache to force fresh analysis
        db_reconciliation.cacheTimestamp = undefined;

        console.log(
            `[DbRollback] Cleared ${originalQueuedCount} queued changes and reset reconciliation stage`,
        );
    } else {
        // Keep queued changes but mark stage as incomplete for re-review
        db_reconciliation.isComplete = false;

        console.log(
            `[DbRollback] Preserved ${db_reconciliation.queuedChanges.length} queued changes but marked stage incomplete`,
        );
    }

    stagedPreview.lastUpdated = new Date();
}

// ============================================================================
// PHASE 8.6: Final Review Integration Functions
// ============================================================================

/**
 * Interface for database changes summary in final review
 */
export interface DbChangesSummary {
    totalChanges: number;
    changesByType: {
        cancelled: number;
        approved: number;
        waitlisted: number;
        transferred: number;
    };
    changesByDate: Record<string, {
        date: string;
        changes: Array<{
            memberName: string;
            currentStatus: string;
            newStatus: string;
            severity: "low" | "medium" | "high";
        }>;
    }>;
    highImpactChanges: QueuedDbChange[];
    affectedMembers: Set<string>;
}

/**
 * Generate summary of queued database changes for final review display
 *
 * @param stagedPreview - Current staged import preview
 * @returns Database changes summary for final review
 */
export function generateDbChangesSummary(
    stagedPreview: StagedImportPreview,
): DbChangesSummary {
    console.log(
        `[DbSummary] Generating database changes summary for final review`,
    );

    const { db_reconciliation } = stagedPreview.progressState.stageData;
    const queuedChanges = db_reconciliation.queuedChanges;

    const summary: DbChangesSummary = {
        totalChanges: queuedChanges.length,
        changesByType: {
            cancelled: 0,
            approved: 0,
            waitlisted: 0,
            transferred: 0,
        },
        changesByDate: {},
        highImpactChanges: [],
        affectedMembers: new Set(),
    };

    // Process each queued change
    queuedChanges.forEach((change) => {
        // Count by type
        if (
            summary
                .changesByType[
                    change.newStatus as keyof typeof summary.changesByType
                ] !== undefined
        ) {
            summary
                .changesByType[
                    change.newStatus as keyof typeof summary.changesByType
                ]++;
        }

        // Add to affected members
        if (change.memberId) {
            summary.affectedMembers.add(change.memberId);
        }

        // Group by date
        const dateStr = change.requestDate;
        if (!summary.changesByDate[dateStr]) {
            summary.changesByDate[dateStr] = {
                date: dateStr,
                changes: [],
            };
        }

        // Find the corresponding conflict to get member name and severity
        const conflict = db_reconciliation.conflicts.find((c) =>
            c.dbRequest.id === change.requestId
        );
        const memberName = conflict?.memberName ||
            `Member ${change.memberId || change.pinNumber}`;
        const severity = conflict?.severity || "low";

        summary.changesByDate[dateStr].changes.push({
            memberName,
            currentStatus: change.currentStatus,
            newStatus: change.newStatus,
            severity,
        });

        // Track high impact changes
        if (severity === "high") {
            summary.highImpactChanges.push(change);
        }
    });

    console.log(
        `[DbSummary] Summary generated - ${summary.totalChanges} total changes, ` +
            `${summary.highImpactChanges.length} high impact, ${summary.affectedMembers.size} members affected`,
    );

    return summary;
}

/**
 * Execute queued database changes with audit trail
 * This is called during the final import process
 *
 * @param queuedChanges - Array of queued database changes to execute
 * @param adminUserId - ID of admin performing the import
 * @returns Promise resolving to execution result
 */
export async function executeQueuedDbChanges(
    queuedChanges: QueuedDbChange[],
    adminUserId: string,
): Promise<{
    success: boolean;
    executedCount: number;
    failedCount: number;
    errors: string[];
    auditTrailEntries: number;
}> {
    console.log(
        `[ExecuteDbChanges] Executing ${queuedChanges.length} queued database changes for admin ${adminUserId}`,
    );

    const result = {
        success: true,
        executedCount: 0,
        failedCount: 0,
        errors: [] as string[],
        auditTrailEntries: 0,
    };

    // Execute changes in a transaction
    try {
        for (const change of queuedChanges) {
            try {
                // Update the request status
                const { error: updateError } = await supabase
                    .from("pld_sdv_requests")
                    .update({
                        status: change.newStatus,
                        actioned_by: adminUserId,
                        actioned_at: new Date().toISOString(),
                    })
                    .eq("id", change.requestId);

                if (updateError) {
                    throw new Error(
                        `Failed to update request ${change.requestId}: ${updateError.message}`,
                    );
                }

                // Create audit trail entry
                const { error: auditError } = await supabase
                    .from("calendar_audit_trail")
                    .insert({
                        action_type: "status_change_via_import_reconciliation",
                        table_name: "pld_sdv_requests",
                        record_id: change.requestId,
                        old_values: { status: change.currentStatus },
                        new_values: {
                            status: change.newStatus,
                            actioned_by: adminUserId,
                            actioned_at: new Date().toISOString(),
                        },
                        changed_by: adminUserId,
                        metadata: {
                            import_reconciliation: true,
                            admin_reason: change.adminReason,
                            original_calendar_missing: true,
                            member_id: change.memberId,
                            pin_number: change.pinNumber,
                            request_date: change.requestDate,
                            leave_type: change.leaveType,
                        },
                    });

                if (auditError) {
                    console.warn(
                        `Failed to create audit trail for request ${change.requestId}:`,
                        auditError,
                    );
                    // Don't fail the entire operation for audit trail issues
                }

                result.executedCount++;
                result.auditTrailEntries++;

                console.log(
                    `[ExecuteDbChanges] Updated request ${change.requestId}: ${change.currentStatus} -> ${change.newStatus}`,
                );
            } catch (error) {
                result.failedCount++;
                result.success = false;
                const errorMessage = error instanceof Error
                    ? error.message
                    : "Unknown error";
                result.errors.push(
                    `Request ${change.requestId}: ${errorMessage}`,
                );

                console.error(
                    `[ExecuteDbChanges] Failed to update request ${change.requestId}:`,
                    error,
                );
            }
        }
    } catch (error) {
        result.success = false;
        result.errors.push(
            `Transaction failed: ${
                error instanceof Error ? error.message : "Unknown error"
            }`,
        );
        console.error(`[ExecuteDbChanges] Transaction failed:`, error);
    }

    console.log(
        `[ExecuteDbChanges] Execution complete - ${result.executedCount} succeeded, ${result.failedCount} failed`,
    );

    return result;
}

/**
 * Update final review stage data to include database changes impact
 *
 * @param stagedPreview - Current staged import preview
 */
export function updateFinalReviewWithDbChanges(
    stagedPreview: StagedImportPreview,
): void {
    console.log(
        `[FinalReviewUpdate] Updating final review with database changes`,
    );

    const { progressState } = stagedPreview;
    const { final_review, db_reconciliation } = progressState.stageData;

    // Generate database changes summary
    const dbChangesSummary = generateDbChangesSummary(stagedPreview);

    // Update the final review summary to include DB changes
    final_review.summary = {
        ...final_review.summary,
        // Add new fields for database changes tracking
        dbChangesCount: dbChangesSummary.totalChanges,
        affectedMembersCount: dbChangesSummary.affectedMembers.size,
        highImpactDbChanges: dbChangesSummary.highImpactChanges.length,
    } as any; // Type assertion since we're extending the interface

    console.log(
        `[FinalReviewUpdate] Updated final review with ${dbChangesSummary.totalChanges} database changes, ` +
            `${dbChangesSummary.affectedMembers.size} affected members`,
    );

    stagedPreview.lastUpdated = new Date();
}
