import { setupZoneCalendars } from "./zone-calendar-setup";
import { validateZoneAssignments } from "./zone-validation";
import { migrateSixMonthRequests } from "./six-month-request-migration";

interface MigrationResult {
    success: boolean;
    error?: string;
    details: {
        setup: {
            success: boolean;
            divisionsUpdated: string[];
            error?: string;
        };
        validation: {
            success: boolean;
            invalidAssignments: {
                memberId: string;
                memberName: string;
                currentZone: string;
                division: string;
            }[];
            error?: string;
        };
        sixMonthRequests: {
            success: boolean;
            requestsUpdated: number;
            requestsSkipped: number;
            error?: string;
        };
    };
}

/**
 * Runs the complete zone calendar migration process
 * This includes:
 * 1. Setting up zone calendars for divisions that opted in
 * 2. Validating zone assignments for all members
 * 3. Migrating existing six month requests
 */
export async function runZoneMigration(): Promise<MigrationResult> {
    const result: MigrationResult = {
        success: true,
        details: {
            setup: {
                success: false,
                divisionsUpdated: [],
            },
            validation: {
                success: false,
                invalidAssignments: [],
            },
            sixMonthRequests: {
                success: false,
                requestsUpdated: 0,
                requestsSkipped: 0,
            },
        },
    };

    try {
        // Step 1: Setup zone calendars
        console.log("Starting zone calendar setup...");
        const setupResult = await setupZoneCalendars();
        result.details.setup = {
            success: setupResult.success,
            divisionsUpdated: setupResult.divisionsUpdated,
            error: setupResult.error,
        };

        if (!setupResult.success) {
            console.error("Zone calendar setup failed:", setupResult.error);
            result.success = false;
            return result;
        }

        // Step 2: Validate zone assignments
        console.log("Validating zone assignments...");
        const validationResult = await validateZoneAssignments();
        result.details.validation = {
            success: validationResult.success,
            invalidAssignments: validationResult.invalidAssignments,
            error: validationResult.error,
        };

        if (!validationResult.success) {
            console.error("Zone validation failed:", validationResult.error);
            result.success = false;
            return result;
        }

        if (validationResult.invalidAssignments.length > 0) {
            console.warn(
                "Found invalid zone assignments:",
                validationResult.invalidAssignments,
            );
        }

        // Step 3: Migrate six month requests
        console.log("Migrating six month requests...");
        const migrationResult = await migrateSixMonthRequests();
        result.details.sixMonthRequests = {
            success: migrationResult.success,
            requestsUpdated: migrationResult.requestsUpdated,
            requestsSkipped: migrationResult.requestsSkipped,
            error: migrationResult.error,
        };

        if (!migrationResult.success) {
            console.error(
                "Six month request migration failed:",
                migrationResult.error,
            );
            result.success = false;
            return result;
        }

        console.log("Migration completed successfully!");
        console.log("Summary:", {
            divisionsUpdated: setupResult.divisionsUpdated,
            invalidAssignments: validationResult.invalidAssignments.length,
            requestsUpdated: migrationResult.requestsUpdated,
            requestsSkipped: migrationResult.requestsSkipped,
        });

        return result;
    } catch (error) {
        console.error("Migration failed with error:", error);
        return {
            ...result,
            success: false,
            error: (error as Error).message,
        };
    }
}
