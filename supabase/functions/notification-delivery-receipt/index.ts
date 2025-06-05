import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";

// Initialize Supabase client with the service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface DeliveryReceiptPayload {
    messageId: string;
    userId?: string;
    pushToken?: string;
    deliveryStatus: "delivered" | "failed" | "opened";
    errorMessage?: string;
    deviceInfo?: {
        platform?: string;
        deviceId?: string;
        appVersion?: string;
    };
}

/**
 * Record notification delivery status
 * Tracks when push notifications are delivered to user devices
 */
async function recordDeliveryReceipt(payload: DeliveryReceiptPayload) {
    try {
        const {
            messageId,
            userId,
            pushToken,
            deliveryStatus,
            errorMessage = null,
            deviceInfo = {},
        } = payload;
        const now = new Date().toISOString();

        // Validate required fields
        if (!messageId) {
            return {
                success: false,
                error: "Missing required field: messageId",
            };
        }

        if (!userId && !pushToken) {
            return {
                success: false,
                error: "Either userId or pushToken must be provided",
            };
        }

        // Query to find the notification record
        let query = supabase
            .from("push_notification_deliveries")
            .select("id, status, recipient_id, push_token");

        // Add messageId condition
        query = query.eq("message_id", messageId);

        // Add recipient identification condition
        if (userId) {
            query = query.eq("recipient_id", userId);
        } else if (pushToken) {
            query = query.eq("push_token", pushToken);
        }

        // Execute the query
        const { data: deliveryRecords, error: queryError } = await query;

        if (queryError) {
            console.error(
                "[Notification Delivery] Error querying delivery records:",
                queryError,
            );
            return { success: false, error: queryError.message };
        }

        // If no existing record found, create a new one
        if (!deliveryRecords || deliveryRecords.length === 0) {
            const newDelivery = {
                message_id: messageId,
                recipient_id: userId || null,
                push_token: pushToken || null,
                status: deliveryStatus,
                error_message: errorMessage,
                delivered_at: deliveryStatus === "delivered" ? now : null,
                opened_at: deliveryStatus === "opened" ? now : null,
                device_platform: deviceInfo.platform,
                device_id: deviceInfo.deviceId,
                app_version: deviceInfo.appVersion,
                created_at: now,
                updated_at: now,
            };

            const { error: insertError } = await supabase
                .from("push_notification_deliveries")
                .insert(newDelivery);

            if (insertError) {
                console.error(
                    "[Notification Delivery] Error creating delivery record:",
                    insertError,
                );
                return { success: false, error: insertError.message };
            }

            console.log(
                `[Notification Delivery] Created delivery record for message ${messageId}`,
            );
            return { success: true, action: "created" };
        }

        // Update existing records
        for (const record of deliveryRecords) {
            const updateData: Record<string, any> = {
                status: deliveryStatus,
                updated_at: now,
            };

            // Set appropriate timestamp based on status
            if (
                deliveryStatus === "delivered" &&
                record.status !== "delivered" && record.status !== "opened"
            ) {
                updateData.delivered_at = now;
            } else if (deliveryStatus === "opened") {
                updateData.opened_at = now;
            } else if (deliveryStatus === "failed") {
                updateData.error_message = errorMessage;
            }

            // Add device info if provided
            if (deviceInfo.platform) {
                updateData.device_platform = deviceInfo.platform;
            }
            if (deviceInfo.deviceId) updateData.device_id = deviceInfo.deviceId;
            if (deviceInfo.appVersion) {
                updateData.app_version = deviceInfo.appVersion;
            }

            // Update the record
            const { error: updateError } = await supabase
                .from("push_notification_deliveries")
                .update(updateData)
                .eq("id", record.id);

            if (updateError) {
                console.error(
                    `[Notification Delivery] Error updating delivery record ${record.id}:`,
                    updateError,
                );
                return { success: false, error: updateError.message };
            }
        }

        console.log(
            `[Notification Delivery] Updated ${deliveryRecords.length} delivery records for message ${messageId}`,
        );

        // Update notification analytics if we have a successful delivery or open
        if (deliveryStatus === "delivered" || deliveryStatus === "opened") {
            await updateNotificationAnalytics(deliveryStatus);
        }

        return {
            success: true,
            action: "updated",
            count: deliveryRecords.length,
        };
    } catch (error) {
        console.error(
            "[Notification Delivery] Error processing delivery receipt:",
            error,
        );
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Updates aggregated notification analytics
 */
async function updateNotificationAnalytics(status: "delivered" | "opened") {
    try {
        const today = new Date().toISOString().split("T")[0];

        // Check if we have an entry for today
        const { data: existingAnalytics, error: queryError } = await supabase
            .from("notification_analytics")
            .select("id")
            .eq("date", today)
            .single();

        if (queryError && queryError.code !== "PGRST116") { // Not found error is ok
            console.error(
                "[Notification Delivery] Error querying analytics:",
                queryError,
            );
            return;
        }

        if (!existingAnalytics) {
            // Create new record for today
            const newAnalytics = {
                date: today,
                sent_count: 0,
                delivered_count: status === "delivered" ? 1 : 0,
                opened_count: status === "opened" ? 1 : 0,
                failed_count: 0,
            };

            const { error: insertError } = await supabase
                .from("notification_analytics")
                .insert(newAnalytics);

            if (insertError) {
                console.error(
                    "[Notification Delivery] Error creating analytics record:",
                    insertError,
                );
            }
        } else {
            // Update existing record
            const updateData: Record<string, any> = {};

            if (status === "delivered") {
                updateData.delivered_count = supabase.rpc("increment", {
                    row_id: existingAnalytics.id,
                    increment_by: 1,
                });
            } else if (status === "opened") {
                updateData.opened_count = supabase.rpc("increment", {
                    row_id: existingAnalytics.id,
                    increment_by: 1,
                });
            }

            const { error: updateError } = await supabase
                .from("notification_analytics")
                .update(updateData)
                .eq("id", existingAnalytics.id);

            if (updateError) {
                console.error(
                    "[Notification Delivery] Error updating analytics record:",
                    updateError,
                );
            }
        }
    } catch (error) {
        console.error(
            "[Notification Delivery] Error updating analytics:",
            error,
        );
    }
}

// Handler for the Edge Function
serve(async (req: Request) => {
    try {
        // Parse request body
        const payload = await req.json() as DeliveryReceiptPayload;

        if (!payload || typeof payload !== "object") {
            return new Response(
                JSON.stringify({ success: false, error: "Invalid payload" }),
                {
                    headers: { "Content-Type": "application/json" },
                    status: 400,
                },
            );
        }

        // Process the delivery receipt
        const result = await recordDeliveryReceipt(payload);

        return new Response(
            JSON.stringify(result),
            {
                headers: { "Content-Type": "application/json" },
                status: result.success ? 200 : 500,
            },
        );
    } catch (error) {
        console.error("[Notification Delivery] Unhandled error:", error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            { headers: { "Content-Type": "application/json" }, status: 500 },
        );
    }
});
