import { supabase } from "@/utils/supabase";
import { ImportPreviewItem, prepareImportData } from "./importPreviewService";

/**
 * Interface for batch import result
 */
export interface BatchImportResult {
    success: boolean;
    insertedCount: number;
    failedCount: number;
    errorMessages: string[];
    insertedIds?: string[];
    waitlistPositionUpdates?: Array<{ id: string; position: number }>;
    failedItems?: Array<{ index: number; error: string }>;
}

/**
 * Insert a batch of admin-confirmed PLD/SDV requests from import preview
 *
 * @param previewItems - Array of reviewed preview items
 * @param selectedItems - Array of indices of selected items to import
 * @returns Promise resolving to batch import result
 */
export async function insertBatchPldSdvRequests(
    previewItems: ImportPreviewItem[],
    selectedItems: number[],
): Promise<BatchImportResult> {
    try {
        // Validate parameters
        if (!previewItems?.length || !selectedItems?.length) {
            return {
                success: false,
                insertedCount: 0,
                failedCount: 0,
                errorMessages: ["No items selected for import"],
            };
        }

        // Prepare the data for insertion
        const importData = prepareImportData(previewItems, selectedItems);

        // Debug info about statuses
        const statusCounts = {
            approved: selectedItems.filter((idx) =>
                previewItems[idx].status === "approved"
            ).length,
            waitlisted: selectedItems.filter((idx) =>
                previewItems[idx].status === "waitlisted"
            ).length,
        };
        console.log(
            `Import status counts - Approved: ${statusCounts.approved}, Waitlisted: ${statusCounts.waitlisted}`,
        );

        // ------------------------------
        // PRIMARY ATTEMPT: single batch insert
        // ------------------------------
        const { data: batchData, error: batchError } = await supabase
            .from("pld_sdv_requests")
            .insert(importData)
            .select("id");

        // If batch succeeded – great, return early
        if (!batchError) {
            const insertedIds = batchData?.map((row) =>
                row.id
            ) || [];
            console.log(
                `Successfully inserted ${insertedIds.length} PLD/SDV requests (batch)`,
            );
            return {
                success: true,
                insertedCount: insertedIds.length,
                failedCount: 0,
                errorMessages: [],
                insertedIds,
            };
        }

        // ------------------------------
        // FALLBACK PATH: batch failed – retry row-by-row so we can salvage valid rows
        // ------------------------------
        console.warn(
            "Batch insert failed – switching to per-row insertion. Reason:",
            batchError?.message,
        );

        const insertedIds: string[] = [];
        const failedItems: Array<{ index: number; error: string }> = [];

        // Use for…of to await each insert sequentially to respect potential constraint locks
        for (let localIdx = 0; localIdx < importData.length; localIdx++) {
            const row = importData[localIdx];

            /* eslint-disable no-await-in-loop */
            const { data: singleData, error: singleError } = await supabase
                .from("pld_sdv_requests")
                .insert(row)
                .select("id")
                .single();

            if (singleError) {
                console.error(`Row ${localIdx} failed:`, singleError.message);
                failedItems.push({
                    index: selectedItems[localIdx],
                    error: singleError.message,
                });
                continue;
            }
            if (singleData?.id) insertedIds.push(singleData.id);
        }

        const failedCount = failedItems.length;
        const insertedCount = insertedIds.length;

        return {
            success: insertedCount > 0,
            insertedCount,
            failedCount,
            errorMessages: failedItems.map((f) => f.error),
            insertedIds,
            failedItems,
        };
    } catch (error) {
        console.error(
            "Exception during batch PLD/SDV request insertion:",
            error,
        );
        return {
            success: false,
            insertedCount: 0,
            failedCount: selectedItems.length,
            errorMessages: [
                error instanceof Error ? error.message : "Unknown error",
            ],
        };
    }
}

/**
 * Insert a single PLD/SDV request with the option to specify a PIN number for unregistered members
 *
 * @param requestData - Object with request data
 * @returns Promise resolving to inserted request ID or null on failure
 */
export async function insertSinglePldSdvRequest(requestData: {
    member_id?: string | null;
    pin_number?: number | null;
    calendar_id: string;
    request_date: string;
    leave_type: "PLD" | "SDV";
    status: "approved" | "waitlisted";
    requested_at?: string;
    paid_in_lieu?: boolean;
}): Promise<string | null> {
    try {
        // Validate that either member_id or pin_number is provided
        if (!requestData.member_id && !requestData.pin_number) {
            console.error("Either member_id or pin_number must be provided");
            return null;
        }

        // Set default requested_at if not provided
        if (!requestData.requested_at) {
            requestData.requested_at = new Date().toISOString();
        }

        // Insert the request
        const { data, error } = await supabase
            .from("pld_sdv_requests")
            .insert({
                member_id: requestData.member_id || null,
                pin_number: requestData.pin_number || null,
                calendar_id: requestData.calendar_id,
                request_date: requestData.request_date,
                leave_type: requestData.leave_type,
                status: requestData.status,
                requested_at: requestData.requested_at,
                paid_in_lieu: requestData.paid_in_lieu || false,
            })
            .select("id")
            .single();

        if (error) {
            console.error("Error inserting PLD/SDV request:", error);
            return null;
        }

        return data?.id || null;
    } catch (error) {
        console.error("Exception inserting PLD/SDV request:", error);
        return null;
    }
}

/**
 * Enhanced batch import with waitlist position management
 *
 * @param previewItems - Array of reviewed preview items
 * @param selectedItems - Array of indices of selected items to import
 * @param waitlistPositions - Optional mapping of item indices to waitlist positions
 * @returns Promise resolving to enhanced batch import result
 */
export async function insertBatchPldSdvRequestsWithWaitlistPositions(
    previewItems: ImportPreviewItem[],
    selectedItems: number[],
    waitlistPositions?: Record<number, number>,
): Promise<BatchImportResult> {
    try {
        // Validate parameters
        if (!previewItems?.length || !selectedItems?.length) {
            return {
                success: false,
                insertedCount: 0,
                failedCount: 0,
                errorMessages: ["No items selected for import"],
            };
        }

        console.log(
            `[BatchImportWithPositions] Importing ${selectedItems.length} items with waitlist position management`,
        );

        // Prepare the data for insertion with waitlist positions
        const importData = selectedItems.map((index) => {
            const item = previewItems[index];
            const baseData = prepareImportData(previewItems, [index])[0];

            // Add waitlist position if provided and item is waitlisted
            if (item.status === "waitlisted" && waitlistPositions?.[index]) {
                baseData.waitlist_position = waitlistPositions[index];
            }

            return baseData;
        });

        // Group items by date and calendar for position validation
        const itemsByDateCalendar = new Map<string, typeof importData>();
        importData.forEach((item) => {
            const key = `${item.calendar_id}-${item.request_date}`;
            if (!itemsByDateCalendar.has(key)) {
                itemsByDateCalendar.set(key, []);
            }
            itemsByDateCalendar.get(key)!.push(item);
        });

        // Validate waitlist positions for each date/calendar combination
        const positionValidationPromises = Array.from(
            itemsByDateCalendar.entries(),
        ).map(
            async ([key, items]) => {
                const [calendarId, requestDate] = key.split("-");
                const waitlistedItems = items.filter((item) =>
                    item.status === "waitlisted" && item.waitlist_position
                );

                if (waitlistedItems.length === 0) {
                    return { valid: true, errors: [] };
                }

                // Check for position conflicts with existing requests
                const { data: existingWaitlisted, error } = await supabase
                    .from("pld_sdv_requests")
                    .select("id, waitlist_position")
                    .eq("calendar_id", calendarId)
                    .eq("request_date", requestDate)
                    .eq("status", "waitlisted")
                    .not("waitlist_position", "is", null);

                if (error) {
                    return {
                        valid: false,
                        errors: [
                            `Position validation failed for ${requestDate}: ${error.message}`,
                        ],
                    };
                }

                const existingPositions = new Set(
                    existingWaitlisted?.map((req) => req.waitlist_position) ||
                        [],
                );
                const newPositions = waitlistedItems.map((item) =>
                    item.waitlist_position
                );
                const conflicts = newPositions.filter((pos) =>
                    existingPositions.has(pos)
                );

                if (conflicts.length > 0) {
                    return {
                        valid: false,
                        errors: [
                            `Position conflicts for ${requestDate}: positions ${
                                conflicts.join(", ")
                            } already exist`,
                        ],
                    };
                }

                return { valid: true, errors: [] };
            },
        );

        const validationResults = await Promise.all(positionValidationPromises);
        const validationErrors = validationResults.flatMap((result) =>
            result.errors
        );

        if (validationErrors.length > 0) {
            console.error(
                "[BatchImportWithPositions] Position validation failed:",
                validationErrors,
            );
            return {
                success: false,
                insertedCount: 0,
                failedCount: importData.length,
                errorMessages: validationErrors,
            };
        }

        // Insert the data into the database
        const { data, error } = await supabase
            .from("pld_sdv_requests")
            .insert(importData)
            .select("id, waitlist_position, request_date, calendar_id");

        if (error) {
            console.error(
                "Error inserting batch PLD/SDV requests with positions:",
                error,
            );
            return {
                success: false,
                insertedCount: 0,
                failedCount: importData.length,
                errorMessages: [error.message],
            };
        }

        const insertedIds = data?.map((row) => row.id) || [];
        const waitlistPositionUpdates = data?.filter((row) =>
            row.waitlist_position
        )
            .map((row) => ({ id: row.id, position: row.waitlist_position })) ||
            [];

        console.log(
            `[BatchImportWithPositions] Successfully inserted ${insertedIds.length} requests, ${waitlistPositionUpdates.length} with waitlist positions`,
        );

        return {
            success: true,
            insertedCount: insertedIds.length,
            failedCount: 0,
            errorMessages: [],
            insertedIds,
            waitlistPositionUpdates,
        };
    } catch (error) {
        console.error(
            "Exception during batch import with waitlist positions:",
            error,
        );
        return {
            success: false,
            insertedCount: 0,
            failedCount: selectedItems.length,
            errorMessages: [
                error instanceof Error ? error.message : "Unknown error",
            ],
        };
    }
}

/**
 * Update waitlist positions for existing requests
 *
 * @param positionUpdates - Array of position updates with request IDs
 * @returns Promise resolving to update result
 */
export async function updateWaitlistPositions(
    positionUpdates: Array<{ id: string; position: number }>,
): Promise<{
    success: boolean;
    updatedCount: number;
    failedCount: number;
    errorMessages: string[];
}> {
    try {
        if (!positionUpdates.length) {
            return {
                success: true,
                updatedCount: 0,
                failedCount: 0,
                errorMessages: [],
            };
        }

        console.log(
            `[UpdateWaitlistPositions] Updating ${positionUpdates.length} waitlist positions`,
        );

        // Execute updates in parallel
        const updatePromises = positionUpdates.map(async ({ id, position }) => {
            const { error } = await supabase
                .from("pld_sdv_requests")
                .update({ waitlist_position: position })
                .eq("id", id)
                .eq("status", "waitlisted"); // Safety check

            return { id, position, error };
        });

        const results = await Promise.all(updatePromises);
        const failures = results.filter((result) => result.error);
        const successes = results.filter((result) => !result.error);

        if (failures.length > 0) {
            console.error(
                "[UpdateWaitlistPositions] Some updates failed:",
                failures,
            );
        }

        console.log(
            `[UpdateWaitlistPositions] Updated ${successes.length} positions, ${failures.length} failed`,
        );

        return {
            success: failures.length === 0,
            updatedCount: successes.length,
            failedCount: failures.length,
            errorMessages: failures.map((f) =>
                `Failed to update ${f.id}: ${
                    f.error?.message || "Unknown error"
                }`
            ),
        };
    } catch (error) {
        console.error("Exception during waitlist position updates:", error);
        return {
            success: false,
            updatedCount: 0,
            failedCount: positionUpdates.length,
            errorMessages: [
                error instanceof Error ? error.message : "Unknown error",
            ],
        };
    }
}

/**
 * Validate waitlist position consistency for a specific date
 *
 * @param calendarId - Calendar ID
 * @param requestDate - Request date to validate
 * @returns Promise resolving to validation result
 */
export async function validateWaitlistPositionConsistency(
    calendarId: string,
    requestDate: string,
): Promise<{
    isValid: boolean;
    gaps: number[];
    duplicates: Array<{ position: number; requestIds: string[] }>;
    maxPosition: number;
    totalWaitlisted: number;
}> {
    try {
        console.log(
            `[ValidatePositionConsistency] Checking positions for ${calendarId} on ${requestDate}`,
        );

        // Query all waitlisted requests for this date
        const { data: waitlistedRequests, error } = await supabase
            .from("pld_sdv_requests")
            .select("id, waitlist_position")
            .eq("calendar_id", calendarId)
            .eq("request_date", requestDate)
            .eq("status", "waitlisted")
            .not("waitlist_position", "is", null)
            .order("waitlist_position", { ascending: true });

        if (error) {
            console.error(
                "Error querying waitlisted requests for validation:",
                error,
            );
            return {
                isValid: false,
                gaps: [],
                duplicates: [],
                maxPosition: 0,
                totalWaitlisted: 0,
            };
        }

        if (!waitlistedRequests || waitlistedRequests.length === 0) {
            return {
                isValid: true,
                gaps: [],
                duplicates: [],
                maxPosition: 0,
                totalWaitlisted: 0,
            };
        }

        // Analyze positions
        const positionMap = new Map<number, string[]>();
        let maxPosition = 0;

        waitlistedRequests.forEach((req) => {
            const position = req.waitlist_position!;
            maxPosition = Math.max(maxPosition, position);

            if (!positionMap.has(position)) {
                positionMap.set(position, []);
            }
            positionMap.get(position)!.push(req.id);
        });

        // Find gaps
        const gaps: number[] = [];
        for (let i = 1; i <= maxPosition; i++) {
            if (!positionMap.has(i)) {
                gaps.push(i);
            }
        }

        // Find duplicates
        const duplicates = Array.from(positionMap.entries())
            .filter(([_, requestIds]) => requestIds.length > 1)
            .map(([position, requestIds]) => ({ position, requestIds }));

        const isValid = gaps.length === 0 && duplicates.length === 0;

        console.log(
            `[ValidatePositionConsistency] Result: ${
                isValid ? "VALID" : "INVALID"
            }, ${gaps.length} gaps, ${duplicates.length} duplicates`,
        );

        return {
            isValid,
            gaps,
            duplicates,
            maxPosition,
            totalWaitlisted: waitlistedRequests.length,
        };
    } catch (error) {
        console.error(
            "Exception during position consistency validation:",
            error,
        );
        return {
            isValid: false,
            gaps: [],
            duplicates: [],
            maxPosition: 0,
            totalWaitlisted: 0,
        };
    }
}
