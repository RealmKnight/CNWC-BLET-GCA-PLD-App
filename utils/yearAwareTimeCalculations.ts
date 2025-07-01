// ============================================================================
// Year-Aware Time Calculation Utilities
// ============================================================================
// This file provides centralized, year-aware calculation functions for
// PLD, SDV, and vacation week allocations, replacing duplicated logic
// throughout the codebase.

import { TimeStats } from "../store/timeStore";
import { Member as AdminMember } from "../store/adminCalendarManagementStore";

// Extended member interface that includes all possible time-off related fields
interface MemberWithTimeOff extends AdminMember {
    pld_rolled_over?: number | null;
}

// ============================================================================
// Core Date Utilities
// ============================================================================

/**
 * Extract year from date string or Date object
 */
export function getYearFromDate(date: string | Date): number {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.getFullYear();
}

/**
 * Check if a date string represents the current year
 */
export function isCurrentYear(date: string): boolean {
    return getYearFromDate(date) === new Date().getFullYear();
}

/**
 * Check if a date string represents the next year
 */
export function isNextYear(date: string): boolean {
    return getYearFromDate(date) === new Date().getFullYear() + 1;
}

/**
 * Get start and end date strings for a given year
 */
export function getYearBoundaries(
    year: number,
): { start: string; end: string } {
    return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
    };
}

/**
 * Check if target year should include rollover PLDs in calculations
 * NOTE: Per conservative approach, rollover PLDs are NOT included in next year request calculations
 */
export function shouldIncludeRolloverPlds(
    targetYear: number,
    currentYear: number,
): boolean {
    // Only include rollover PLDs for current year calculations
    return targetYear === currentYear;
}

// ============================================================================
// Anniversary-Aware Calculations
// ============================================================================

/**
 * Calculate years of service as of a specific reference date
 * Accounts for whether anniversary has occurred in the reference year
 */
export function calculateYearsOfService(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    if (!companyHireDate) {
        return 0;
    }

    const hireDate = new Date(companyHireDate);
    let yearsOfService = referenceDate.getFullYear() - hireDate.getFullYear();

    // Adjust if the anniversary in the reference year hasn't occurred yet
    if (
        referenceDate.getMonth() < hireDate.getMonth() ||
        (referenceDate.getMonth() === hireDate.getMonth() &&
            referenceDate.getDate() < hireDate.getDate())
    ) {
        yearsOfService--;
    }

    // Ensure non-negative (edge case for future hire dates)
    return Math.max(0, yearsOfService);
}

/**
 * Calculate vacation weeks for a specific year
 * Uses anniversary-aware logic for the target year
 */
export function calculateVacationWeeksForYear(
    companyHireDate: string | null | undefined,
    targetYear: number,
): number {
    if (!companyHireDate) {
        return 0;
    }

    // Create reference date for the target year (end of year to account for anniversary increases)
    const referenceDate = new Date(targetYear, 11, 31); // December 31 of target year

    const yearsOfService = calculateYearsOfService(
        companyHireDate,
        referenceDate,
    );

    // Apply vacation week rules
    if (yearsOfService < 2) return 1;
    if (yearsOfService < 5) return 2;
    if (yearsOfService < 14) return 3;
    if (yearsOfService < 23) return 4;
    return 5;
}

/**
 * Calculate PLDs for a specific year
 * Uses anniversary-aware logic for the target year
 */
export function calculatePldsForYear(
    companyHireDate: string | null | undefined,
    targetYear: number,
): number {
    if (!companyHireDate) {
        return 0;
    }

    // For PLD calculations, use current date within target year for more accurate anniversary detection
    const referenceDate = new Date(
        targetYear,
        new Date().getMonth(),
        new Date().getDate(),
    );

    const yearsOfService = calculateYearsOfService(
        companyHireDate,
        referenceDate,
    );

    // Apply PLD rules
    if (yearsOfService < 3) return 5;
    if (yearsOfService < 6) return 8;
    if (yearsOfService < 10) return 11;
    return 13;
}

/**
 * Calculate SDV allocation for a specific year
 * Uses appropriate field based on year (current vs future)
 */
export function calculateSdvAllocationForYear(
    member: MemberWithTimeOff,
    targetYear: number,
): number {
    const currentYear = new Date().getFullYear();

    if (targetYear === currentYear) {
        // Current year: use sdv_entitlement
        return member.sdv_entitlement || 0;
    } else {
        // Future year: use sdv_election (member's choice for next year)
        return member.sdv_election || 0;
    }
}

/**
 * Calculate weeks to bid (vacation weeks minus split weeks)
 */
export function calculateWeeksToBid(
    vacationWeeks: number,
    vacationSplit: number,
): number {
    return Math.max(0, vacationWeeks - vacationSplit);
}

/**
 * Calculate SDVs from vacation split weeks
 */
export function calculateSdvsFromVacationSplit(vacationSplit: number): number {
    return vacationSplit * 6;
}

// ============================================================================
// Year-Aware Max PLD Calculations
// ============================================================================

/**
 * Get maximum PLDs for a member in a specific year
 * Considers anniversary dates and service time progression
 */
export function getMaxPldsForYear(
    member: MemberWithTimeOff,
    targetYear: number,
): number {
    // If member has max_plds set and we're asking for current year, use it
    const currentYear = new Date().getFullYear();
    if (targetYear === currentYear && member.max_plds) {
        return member.max_plds;
    }

    // Otherwise calculate based on years of service for target year
    return calculatePldsForYear(member.company_hire_date, targetYear);
}

// ============================================================================
// Conservative Time Stats Calculation
// ============================================================================

/**
 * Calculate time stats for a specific year using conservative approach
 * CONSERVATIVE RULE: Next year calculations do NOT include current year remaining PLDs
 */
export async function calculateTimeStatsForYear(
    member: MemberWithTimeOff,
    targetYear: number,
    requestCounts?: {
        approved: { pld: number; sdv: number };
        requested: { pld: number; sdv: number };
        waitlisted: { pld: number; sdv: number };
        paidInLieu: { pld: number; sdv: number };
    },
): Promise<Partial<TimeStats>> {
    const currentYear = new Date().getFullYear();

    // Calculate base allocations for target year
    const maxPlds = getMaxPldsForYear(member, targetYear);
    const sdvAllocation = calculateSdvAllocationForYear(member, targetYear);

    // Conservative approach: only include rollover PLDs for current year
    const rolledOverPlds = shouldIncludeRolloverPlds(targetYear, currentYear)
        ? (member.pld_rolled_over || 0)
        : 0;

    // Total allocations for target year
    const totalPlds = maxPlds + rolledOverPlds;
    const totalSdvs = sdvAllocation;

    // If request counts provided, calculate available days
    if (requestCounts) {
        const { approved, requested, waitlisted, paidInLieu } = requestCounts;

        const availablePlds = Math.max(
            0,
            totalPlds -
                (approved.pld + requested.pld + waitlisted.pld +
                    paidInLieu.pld),
        );

        const availableSdvs = Math.max(
            0,
            totalSdvs -
                (approved.sdv + requested.sdv + waitlisted.sdv +
                    paidInLieu.sdv),
        );

        return {
            total: { pld: totalPlds, sdv: totalSdvs },
            rolledOver: {
                pld: rolledOverPlds,
                unusedPlds: targetYear === currentYear
                    ? Math.max(0, rolledOverPlds)
                    : 0,
            },
            available: { pld: availablePlds, sdv: availableSdvs },
            approved,
            requested,
            waitlisted,
            paidInLieu,
        };
    }

    // Return basic allocations if no request counts provided
    return {
        total: { pld: totalPlds, sdv: totalSdvs },
        rolledOver: {
            pld: rolledOverPlds,
            unusedPlds: targetYear === currentYear
                ? Math.max(0, rolledOverPlds)
                : 0,
        },
        available: { pld: totalPlds, sdv: totalSdvs },
    };
}

// ============================================================================
// Legacy Compatibility Functions
// ============================================================================

/**
 * Calculate vacation weeks (legacy compatibility)
 * @deprecated Use calculateVacationWeeksForYear instead
 */
export function calculateVacationWeeks(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    return calculateVacationWeeksForYear(
        companyHireDate,
        referenceDate.getFullYear(),
    );
}

/**
 * Calculate PLDs (legacy compatibility)
 * @deprecated Use calculatePldsForYear instead
 */
export function calculatePLDs(
    companyHireDate: string | null | undefined,
    referenceDate: Date = new Date(),
): number {
    return calculatePldsForYear(companyHireDate, referenceDate.getFullYear());
}
