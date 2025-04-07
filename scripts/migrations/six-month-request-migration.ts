import { supabase } from "@/utils/supabase";
import { PostgrestResponse } from "@supabase/supabase-js";

interface SixMonthRequestMigrationResult {
    success: boolean;
    error?: string;
    requestsUpdated: number;
    requestsSkipped: number;
}

type SixMonthRequestWithMember = {
    id: string;
    member_id: string;
    division: string;
    request_date: string;
    leave_type: string;
    members: {
        zone: string | null;
    };
};

/**
 * Migrates existing six month requests to include zone information
 * This script should be run once during the migration to zone-based calendars
 */
export async function migrateSixMonthRequests(): Promise<
    SixMonthRequestMigrationResult
> {
    try {
        let requestsUpdated = 0;
        let requestsSkipped = 0;

        // Get all unprocessed six month requests
        const { data, error: requestError } = await supabase
            .from("six_month_requests")
            .select(`
        id,
        member_id,
        division,
        request_date,
        leave_type,
        members!inner (
          zone
        )
      `)
            .eq("processed", false)
            .is("zone_id", null) as PostgrestResponse<
                SixMonthRequestWithMember
            >;

        if (requestError) throw requestError;

        // Process each request
        for (const request of data || []) {
            try {
                if (!request.members?.zone) {
                    requestsSkipped++;
                    continue;
                }

                // Get zone ID from zone name
                const { data: zone, error: zoneError } = await supabase
                    .from("zones")
                    .select("id")
                    .eq("name", request.members.zone)
                    .eq("division_id", request.division)
                    .single();

                if (zoneError || !zone) {
                    requestsSkipped++;
                    continue;
                }

                // Update the request with zone information
                const { error: updateError } = await supabase
                    .from("six_month_requests")
                    .update({ zone_id: zone.id })
                    .eq("id", request.id);

                if (updateError) throw updateError;

                requestsUpdated++;
            } catch (error) {
                console.error(`Error processing request ${request.id}:`, error);
                requestsSkipped++;
            }
        }

        return {
            success: true,
            requestsUpdated,
            requestsSkipped,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            requestsUpdated: 0,
            requestsSkipped: 0,
        };
    }
}
