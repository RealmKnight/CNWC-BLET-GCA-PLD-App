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

        // Insert the data into the database
        const { data, error } = await supabase
            .from("pld_sdv_requests")
            .insert(importData)
            .select("id"); // Return the IDs of inserted rows

        if (error) {
            console.error("Error inserting batch PLD/SDV requests:", error);
            return {
                success: false,
                insertedCount: 0,
                failedCount: importData.length,
                errorMessages: [error.message],
            };
        }

        // Return success result
        return {
            success: true,
            insertedCount: data?.length || 0,
            failedCount: importData.length - (data?.length || 0),
            errorMessages: [],
        };
    } catch (error: any) {
        console.error("Exception in batch import:", error);
        return {
            success: false,
            insertedCount: 0,
            failedCount: selectedItems.length,
            errorMessages: [error?.message || "Unknown error during import"],
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
