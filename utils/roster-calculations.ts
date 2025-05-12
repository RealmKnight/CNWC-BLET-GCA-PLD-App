/**
 * Roster calculation utilities
 *
 * These functions implement the roster combination logic for different roster types.
 * They merge pre-categorized arrays of members according to specific interleaving patterns.
 *
 * Note: These functions mutate the input arrays by using shift().
 */

import { CategorizedMembers, RosterMember } from "@/types/rosters";

/**
 * Combines members for a WC-type roster
 * Pattern: All WC members first, then interleaving patterns of DMIR and DWP, followed by SYS1, EJE, and SYS2
 */
export function combineWCArrays(
    wcmembers: RosterMember[],
    dmirmembers: RosterMember[],
    dwpmembers: RosterMember[],
    sys1members: RosterMember[],
    ejemembers: RosterMember[],
    sys2members: RosterMember[],
): RosterMember[] {
    const combined: RosterMember[] = [];

    // Add all WC members first
    combined.push(...wcmembers);
    wcmembers.length = 0; // Clear the array after using all members

    // Create interleaving patterns for DMIR and DWP
    const pattern_temp: RosterMember[] = [];

    while (dmirmembers.length > 0 || dwpmembers.length > 0) {
        // Loop 1: Repeat up to 6 times (if data available) - Take 2 DMIR, 1 DWP
        for (let i = 0; i < 6; i++) {
            // Take up to 2 from DMIR
            for (let j = 0; j < 2; j++) {
                if (dmirmembers.length > 0) {
                    pattern_temp.push(dmirmembers.shift()!);
                }
            }

            // Take 1 from DWP if available
            if (dwpmembers.length > 0) {
                pattern_temp.push(dwpmembers.shift()!);
            }

            // Break if both arrays are empty
            if (dmirmembers.length === 0 && dwpmembers.length === 0) {
                break;
            }
        }

        // Loop 2: Repeat up to 4 times (if data available) - Take 1 DMIR, 1 DWP
        for (let i = 0; i < 4; i++) {
            // Take 1 from DMIR if available
            if (dmirmembers.length > 0) {
                pattern_temp.push(dmirmembers.shift()!);
            }

            // Take 1 from DWP if available
            if (dwpmembers.length > 0) {
                pattern_temp.push(dwpmembers.shift()!);
            }

            // Break if both arrays are empty
            if (dmirmembers.length === 0 && dwpmembers.length === 0) {
                break;
            }
        }
    }

    // Add the pattern followed by auxiliary groups
    combined.push(...pattern_temp);
    combined.push(...sys1members);
    combined.push(...ejemembers);
    combined.push(...sys2members);

    return combined;
}

/**
 * Combines members for a DMIR-type roster
 * Pattern: All DMIR members first, then interleaving patterns of WC and DWP, followed by SYS1, EJE, and SYS2
 */
export function combineDMIRArrays(
    wcmembers: RosterMember[],
    dmirmembers: RosterMember[],
    dwpmembers: RosterMember[],
    sys1members: RosterMember[],
    ejemembers: RosterMember[],
    sys2members: RosterMember[],
): RosterMember[] {
    const combined: RosterMember[] = [];

    // Add all DMIR members first
    combined.push(...dmirmembers);
    dmirmembers.length = 0; // Clear the array after using all members

    // Create interleaving patterns for WC and DWP
    const pattern_temp: RosterMember[] = [];

    while (wcmembers.length > 0 || dwpmembers.length > 0) {
        // Loop 1: Repeat up to 9 times (if data available) - Take 6 WC, 1 DWP
        for (let i = 0; i < 9; i++) {
            // Take up to 6 from WC
            for (let j = 0; j < 6; j++) {
                if (wcmembers.length > 0) {
                    pattern_temp.push(wcmembers.shift()!);
                }
            }

            // Take 1 from DWP if available
            if (dwpmembers.length > 0) {
                pattern_temp.push(dwpmembers.shift()!);
            }

            // Break if both arrays are empty
            if (wcmembers.length === 0 && dwpmembers.length === 0) {
                break;
            }
        }

        // Single block: Take up to 5 WC, 1 DWP (if data available)
        if (wcmembers.length > 0 || dwpmembers.length > 0) {
            // Take up to 5 from WC
            for (let j = 0; j < 5; j++) {
                if (wcmembers.length > 0) {
                    pattern_temp.push(wcmembers.shift()!);
                }
            }

            // Take 1 from DWP if available
            if (dwpmembers.length > 0) {
                pattern_temp.push(dwpmembers.shift()!);
            }
        }
    }

    // Add the pattern followed by auxiliary groups
    combined.push(...pattern_temp);
    combined.push(...sys1members);
    combined.push(...ejemembers);
    combined.push(...sys2members);

    return combined;
}

/**
 * Combines members for a DWP-type roster
 * Pattern: All DWP members first, then interleaving patterns of WC and DMIR, followed by SYS1, EJE, and SYS2
 */
export function combineDWPArrays(
    wcmembers: RosterMember[],
    dmirmembers: RosterMember[],
    dwpmembers: RosterMember[],
    sys1members: RosterMember[],
    ejemembers: RosterMember[],
    sys2members: RosterMember[],
): RosterMember[] {
    const combined: RosterMember[] = [];

    // Add all DWP members first
    combined.push(...dwpmembers);
    dwpmembers.length = 0; // Clear the array after using all members

    // Create interleaving patterns for WC and DMIR
    const pattern_temp: RosterMember[] = [];

    while (wcmembers.length > 0 || dmirmembers.length > 0) {
        // Loop 1: Repeat up to 7 times (if data available) - Take 4 WC, 1 DMIR
        for (let i = 0; i < 7; i++) {
            // Take up to 4 from WC
            for (let j = 0; j < 4; j++) {
                if (wcmembers.length > 0) {
                    pattern_temp.push(wcmembers.shift()!);
                }
            }

            // Take 1 from DMIR if available
            if (dmirmembers.length > 0) {
                pattern_temp.push(dmirmembers.shift()!);
            }

            // Break if both arrays are empty
            if (wcmembers.length === 0 && dmirmembers.length === 0) {
                break;
            }
        }

        // Loop 2: Repeat up to 3 times (if data available) - Take 3 WC, 1 DMIR
        for (let i = 0; i < 3; i++) {
            // Take up to 3 from WC
            for (let j = 0; j < 3; j++) {
                if (wcmembers.length > 0) {
                    pattern_temp.push(wcmembers.shift()!);
                }
            }

            // Take 1 from DMIR if available
            if (dmirmembers.length > 0) {
                pattern_temp.push(dmirmembers.shift()!);
            }

            // Break if both arrays are empty
            if (wcmembers.length === 0 && dmirmembers.length === 0) {
                break;
            }
        }
    }

    // Add the pattern followed by auxiliary groups
    combined.push(...pattern_temp);
    combined.push(...sys1members);
    combined.push(...ejemembers);
    combined.push(...sys2members);

    return combined;
}

/**
 * Combines members for an EJE-type roster
 * Pattern: All EJE members first, then interleaving pattern of 7 WC, 2 DMIR, 1 DWP, followed by SYS1 and SYS2
 */
export function combineEJEArrays(
    wcmembers: RosterMember[],
    dmirmembers: RosterMember[],
    dwpmembers: RosterMember[],
    sys1members: RosterMember[],
    ejemembers: RosterMember[],
    sys2members: RosterMember[],
): RosterMember[] {
    const roster: RosterMember[] = [];

    // Add all EJE members first
    roster.push(...ejemembers);
    ejemembers.length = 0; // Clear the array after using all members

    // Interleave remaining members: 7 WC, 2 DMIR, 1 DWP
    while (
        wcmembers.length > 0 || dmirmembers.length > 0 || dwpmembers.length > 0
    ) {
        // Take up to 7 from WC
        for (let i = 0; i < 7; i++) {
            if (wcmembers.length > 0) {
                roster.push(wcmembers.shift()!);
            }
        }

        // Take up to 2 from DMIR
        for (let i = 0; i < 2; i++) {
            if (dmirmembers.length > 0) {
                roster.push(dmirmembers.shift()!);
            }
        }

        // Take 1 from DWP if available
        if (dwpmembers.length > 0) {
            roster.push(dwpmembers.shift()!);
        }

        // Break if all arrays are empty
        if (
            wcmembers.length === 0 && dmirmembers.length === 0 &&
            dwpmembers.length === 0
        ) {
            break;
        }
    }

    // Add auxiliary groups
    roster.push(...sys1members);
    roster.push(...sys2members);

    return roster;
}
