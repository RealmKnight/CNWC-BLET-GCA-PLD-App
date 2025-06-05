/**
 * Roster utility functions
 *
 * These utilities help prepare member lists for roster generation.
 * They handle filtering, categorization, and sorting of members.
 */

import { CategorizedMembers, RosterMember, RosterType } from "@/types/rosters";
import {
    combineDMIRArrays,
    combineDWPArrays,
    combineEJEArrays,
    combineWCArrays,
} from "./roster-calculations";

/**
 * Filters members for OSL (Off Seniority List)
 * Removes members with non-null misc_notes
 */
export function filterMembersForOSL(members: RosterMember[]): RosterMember[] {
    return members.filter((member) => !member.misc_notes);
}

/**
 * Sort function to order members by prior_vac_sys
 * Handles null, number, and string values
 */
export function sortByPriorVacSys(a: RosterMember, b: RosterMember): number {
    // Handle null values (they should appear last)
    if (a.prior_vac_sys === null || a.prior_vac_sys === undefined) {
        return 1;
    }
    if (b.prior_vac_sys === null || b.prior_vac_sys === undefined) {
        return -1;
    }

    // Handle mixed types by converting to numbers
    const aVal = typeof a.prior_vac_sys === "string"
        ? parseInt(a.prior_vac_sys, 10)
        : a.prior_vac_sys;
    const bVal = typeof b.prior_vac_sys === "string"
        ? parseInt(b.prior_vac_sys, 10)
        : b.prior_vac_sys;

    // Sort ascending
    return (aVal as number) - (bVal as number);
}

/**
 * Categorizes members based on system_sen_type
 */
export function categorizeMembers(members: RosterMember[]): CategorizedMembers {
    const categorized: CategorizedMembers = {
        wcmembers: [],
        dmirmembers: [],
        dwpmembers: [],
        ejemembers: [],
        sys1members: [],
        sys2members: [],
    };

    // Filter members by system_sen_type and sort each category
    members.forEach((member) => {
        const senType = member.system_sen_type?.toUpperCase();

        switch (senType) {
            case "WC":
                categorized.wcmembers.push(member);
                break;
            case "DMIR":
                categorized.dmirmembers.push(member);
                break;
            case "DWP":
                categorized.dwpmembers.push(member);
                break;
            case "EJ&E":
            case "EJE":
                categorized.ejemembers.push(member);
                break;
            case "SYS1":
                categorized.sys1members.push(member);
                break;
            case "SYS2":
                categorized.sys2members.push(member);
                break;
            default:
                // CN or other values are not included in roster calculations
                break;
        }
    });

    // Sort each category by prior_vac_sys
    Object.keys(categorized).forEach((key) => {
        const category = key as keyof CategorizedMembers;
        categorized[category].sort(sortByPriorVacSys);
    });

    return categorized;
}

/**
 * Fetches active members with necessary joins and filters
 * @returns Promise with RosterMember array
 */
export async function fetchRosterMembers(): Promise<RosterMember[]> {
    // Import the existing Supabase client
    const { supabase } = await import("@/utils/supabase");

    // First fetch all active members
    const { data: members, error: membersError } = await supabase
        .from("members")
        .select(`
      id,
      created_at,
      username,
      pin_number,
      company_hire_date,
      engineer_date,
      first_name,
      last_name,
      system_sen_type,
      prior_vac_sys,
      misc_notes,
      wc_sen_roster,
      dwp_sen_roster,
      dmir_sen_roster,
      eje_sen_roster,
      date_of_birth,
      status,
      division_id,
      current_zone_id,
      home_zone_id
    `)
        .eq("status", "ACTIVE")
        .not("system_sen_type", "eq", "CN"); // Exclude test CN members

    if (membersError) {
        console.error("Error fetching roster members:", membersError);
        throw membersError;
    }

    // Then fetch divisions and zones separately to avoid type issues
    const { data: divisions, error: divisionsError } = await supabase
        .from("divisions")
        .select("id, name");

    if (divisionsError) {
        console.error("Error fetching divisions:", divisionsError);
        throw divisionsError;
    }

    const { data: zones, error: zonesError } = await supabase
        .from("zones")
        .select("id, name");

    if (zonesError) {
        console.error("Error fetching zones:", zonesError);
        throw zonesError;
    }

    // Create lookup maps for divisions and zones
    const divisionMap = new Map(divisions.map((div) => [div.id, div.name]));
    const zoneMap = new Map(zones.map((zone) => [zone.id, zone.name]));

    // Map members to RosterMember with manually joined fields
    const rosterMembers: RosterMember[] = members.map((member) => ({
        id: member.id,
        created_at: member.created_at,
        username: member.username,
        pin_number: member.pin_number,
        company_hire_date: member.company_hire_date,
        engineer_date: member.engineer_date,
        first_name: member.first_name,
        last_name: member.last_name,
        system_sen_type: member.system_sen_type,
        prior_vac_sys: member.prior_vac_sys,
        misc_notes: member.misc_notes,
        date_of_birth: member.date_of_birth,
        status: member.status,
        division_id: member.division_id,
        current_zone_id: member.current_zone_id,
        home_zone_id: member.home_zone_id,
        // Lookup names from maps
        division_name: member.division_id
            ? divisionMap.get(member.division_id)
            : undefined,
        zone_name: member.current_zone_id
            ? zoneMap.get(member.current_zone_id)
            : undefined,
        home_zone_name: member.home_zone_id
            ? zoneMap.get(member.home_zone_id)
            : undefined,
    }));

    return rosterMembers;
}

/**
 * Main function to get roster members for a specific type
 * Orchestrates the roster creation workflow
 *
 * @param members Array of RosterMember objects
 * @param type Roster type (e.g., "WC", "DMIR", "DWP", "EJE", "osl-WC", etc.)
 * @returns Combined and ordered array of RosterMember objects
 */
export function getRosterMembers(
    members: RosterMember[],
    type: string,
): RosterMember[] {
    // Create a deep copy of the members array to avoid mutating the original
    const membersCopy: RosterMember[] = JSON.parse(JSON.stringify(members));

    // Check if this is an OSL (Off Seniority List) type
    const isOSL = type.toLowerCase().startsWith("osl-");
    const baseType = isOSL
        ? type.substring(4).toUpperCase()
        : type.toUpperCase();

    // Apply OSL filtering if needed
    const filteredMembers = isOSL
        ? filterMembersForOSL(membersCopy)
        : membersCopy;

    // Categorize members by system_sen_type
    const {
        wcmembers,
        dmirmembers,
        dwpmembers,
        ejemembers,
        sys1members,
        sys2members,
    } = categorizeMembers(filteredMembers);

    // Apply the appropriate combination function based on the roster type
    let result: RosterMember[];

    switch (baseType as RosterType) {
        case "WC":
            result = combineWCArrays(
                [...wcmembers],
                [...dmirmembers],
                [...dwpmembers],
                [...sys1members],
                [...ejemembers],
                [...sys2members],
            );
            break;
        case "DMIR":
            result = combineDMIRArrays(
                [...wcmembers],
                [...dmirmembers],
                [...dwpmembers],
                [...sys1members],
                [...ejemembers],
                [...sys2members],
            );
            break;
        case "DWP":
            result = combineDWPArrays(
                [...wcmembers],
                [...dmirmembers],
                [...dwpmembers],
                [...sys1members],
                [...ejemembers],
                [...sys2members],
            );
            break;
        case "EJE":
            result = combineEJEArrays(
                [...wcmembers],
                [...dmirmembers],
                [...dwpmembers],
                [...sys1members],
                [...ejemembers],
                [...sys2members],
            );
            break;
        default:
            throw new Error(`Unknown roster type: ${type}`);
    }

    // Add rank (position in roster) to each member
    return result.map((member, index) => ({
        ...member,
        rank: index + 1,
    }));
}

/**
 * Saves a generated roster to the database
 * Creates a roster record and associated roster entries
 *
 * @param members Array of RosterMember objects to save
 * @param rosterType The type of roster (WC, DMIR, DWP, EJE)
 * @param year The year for this roster
 * @param isOsl Whether this is an OSL (Off Seniority List) roster
 * @returns The ID of the created roster
 */
export async function saveRosterToDatabase(
    members: RosterMember[],
    rosterType: string,
    year: number,
    isOsl: boolean,
): Promise<string> {
    try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        // First, find the roster type ID
        const { data: rosterTypeData, error: rosterTypeError } = await supabase
            .from("roster_types")
            .select("id")
            .eq("name", rosterType.toUpperCase())
            .single();

        if (rosterTypeError || !rosterTypeData) {
            throw new Error(
                `Roster type '${rosterType}' not found: ${rosterTypeError?.message}`,
            );
        }

        const rosterTypeId = rosterTypeData.id;

        // Generate roster name with year and OSL indicator if applicable
        const rosterName = `${rosterType.toUpperCase()} ${year} ${
            isOsl ? "OSL" : "Roster"
        }`;

        // Create the roster record
        const { data: rosterData, error: rosterError } = await supabase
            .from("rosters")
            .insert({
                roster_type_id: rosterTypeId,
                name: rosterName,
                year: year,
                effective_date: new Date().toISOString(),
            })
            .select("id")
            .single();

        if (rosterError || !rosterData) {
            throw new Error(`Error creating roster: ${rosterError?.message}`);
        }

        const rosterId = rosterData.id;

        // Prepare roster entries for bulk insert
        const entries = members.map((member, index) => ({
            roster_id: rosterId,
            member_pin_number: member.pin_number,
            order_in_roster: index + 1,
            details: {
                system_sen_type: member.system_sen_type,
                prior_vac_sys: member.prior_vac_sys,
                zone_name: member.zone_name,
                home_zone_name: member.home_zone_name,
                division_name: member.division_name,
            },
        }));

        // Insert all roster entries
        const { error: entriesError } = await supabase
            .from("roster_entries")
            .insert(entries);

        if (entriesError) {
            // If entries fail to insert, delete the roster to maintain consistency
            await supabase.from("rosters").delete().eq("id", rosterId);
            throw new Error(
                `Error creating roster entries: ${entriesError.message}`,
            );
        }

        return rosterId;
    } catch (error) {
        console.error("Database error saving roster:", error);
        throw error;
    }
}
