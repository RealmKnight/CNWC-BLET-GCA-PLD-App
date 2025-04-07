import { supabase } from "@/utils/supabase";

interface ZoneValidationResult {
    success: boolean;
    error?: string;
    invalidAssignments: {
        memberId: string;
        memberName: string;
        currentZone: string;
        division: string;
    }[];
}

/**
 * Validates zone assignments for all members
 * Checks if members are assigned to zones that exist in their division
 */
export async function validateZoneAssignments(): Promise<ZoneValidationResult> {
    try {
        // Get all members with their zones and divisions
        const { data: members, error: memberError } = await supabase
            .from("members")
            .select(`
        id,
        first_name,
        last_name,
        division,
        zone
      `)
            .not("zone", "is", null);

        if (memberError) throw memberError;

        const invalidAssignments: ZoneValidationResult["invalidAssignments"] =
            [];

        // Process each member
        for (const member of members || []) {
            try {
                // Check if the zone exists in the member's division
                const { data: zoneExists, error: zoneError } = await supabase
                    .from("zones")
                    .select("id")
                    .eq("name", member.zone)
                    .eq("division_id", member.division)
                    .single();

                if (zoneError || !zoneExists) {
                    invalidAssignments.push({
                        memberId: member.id,
                        memberName: `${member.first_name} ${member.last_name}`,
                        currentZone: member.zone,
                        division: member.division,
                    });
                }
            } catch (error) {
                console.error(`Error validating member ${member.id}:`, error);
                // Continue with next member even if one fails
            }
        }

        return {
            success: true,
            invalidAssignments,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            invalidAssignments: [],
        };
    }
}
