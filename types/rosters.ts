/**
 * Types and interfaces for the Rosters feature
 */

import { Member } from "./member";

/**
 * Roster type identifiers
 */
export type RosterType = "WC" | "DMIR" | "DWP" | "EJE";

/**
 * Roster display fields for PDF generation
 */
export type RosterDisplayField =
    | "rank"
    | "name"
    | "pin_number"
    | "system_sen_type"
    | "engineer_date"
    | "date_of_birth"
    | "zone_name"
    | "home_zone_name"
    | "division_name"
    | "prior_vac_sys";

/**
 * Interface for saved rosters in the database
 */
export interface Roster {
    id: string;
    roster_type_id: string;
    name: string;
    year: number;
    effective_date: string;
    created_at: string;
    updated_at: string;
}

/**
 * Interface for roster entries (member assignments) in the database
 */
export interface RosterEntry {
    id: string;
    roster_id: string;
    member_pin_number: number;
    order_in_roster: number;
    details?: {
        [key: string]: any;
    };
    created_at: string;
    updated_at: string;
}

/**
 * Interface for roster types in the database
 */
export interface RosterTypeRecord {
    id: string;
    name: string;
    description?: string;
}

/**
 * Extended Member interface with additional properties needed for roster display
 */
export interface RosterMember extends Member {
    zone_name?: string;
    home_zone_name?: string;
    division_name?: string;
    system_sen_type?: string;
    prior_vac_sys?: number | string | null;
    misc_notes?: string | null;
    rank?: number; // Position in the roster
}

/**
 * Categorized members for roster generation
 */
export interface CategorizedMembers {
    wcmembers: RosterMember[];
    dmirmembers: RosterMember[];
    dwpmembers: RosterMember[];
    ejemembers: RosterMember[];
    sys1members: RosterMember[];
    sys2members: RosterMember[];
}

/**
 * PDF generation options
 */
export interface PDFGenerationOptions {
    members: RosterMember[];
    selectedFields: RosterDisplayField[];
    rosterType: string;
    title?: string;
}
