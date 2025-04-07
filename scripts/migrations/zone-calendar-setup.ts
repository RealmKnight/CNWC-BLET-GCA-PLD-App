import { supabase } from "@/utils/supabase";

interface ZoneCalendarSetupResult {
    success: boolean;
    error?: string;
    divisionsUpdated: string[];
}

/**
 * Sets up zone calendars for divisions that have opted in
 * This script should be run once during the migration to zone-based calendars
 */
export async function setupZoneCalendars(): Promise<ZoneCalendarSetupResult> {
    try {
        // Get all divisions that have opted into zone calendars
        const { data: divisions, error: divisionError } = await supabase
            .from("divisions")
            .select("name, uses_zone_calendars")
            .eq("uses_zone_calendars", true);

        if (divisionError) throw divisionError;

        const divisionsUpdated: string[] = [];

        // Process each division
        for (const division of divisions || []) {
            try {
                // Get all zones for this division
                const { data: zones, error: zoneError } = await supabase
                    .from("zones")
                    .select("id")
                    .eq("division_id", division.name);

                if (zoneError) throw zoneError;

                // Create initial yearly allotments for each zone
                const currentYear = new Date().getFullYear();
                const yearlyDate = `${currentYear}-01-01`;

                // Get the division's current yearly allotment as a reference
                const { data: divisionAllotment, error: allotmentError } =
                    await supabase
                        .from("pld_sdv_allotments")
                        .select("max_allotment")
                        .eq("division", division.name)
                        .eq("date", yearlyDate)
                        .is("zone_id", null)
                        .single();

                if (allotmentError) throw allotmentError;

                // Create zone-specific allotments
                for (const zone of zones || []) {
                    const { error: insertError } = await supabase
                        .from("pld_sdv_allotments")
                        .insert({
                            division: division.name,
                            zone_id: zone.id,
                            date: yearlyDate,
                            year: currentYear,
                            max_allotment: divisionAllotment?.max_allotment ||
                                6, // Default to 6 if no division allotment
                        });

                    if (insertError) throw insertError;
                }

                divisionsUpdated.push(division.name);
            } catch (error) {
                console.error(
                    `Error processing division ${division.name}:`,
                    error,
                );
                // Continue with next division even if one fails
            }
        }

        return {
            success: true,
            divisionsUpdated,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            divisionsUpdated: [],
        };
    }
}
