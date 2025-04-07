import { supabase } from "@/utils/supabase";

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Mock Supabase client
jest.mock("@/utils/supabase", () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    gte: jest.fn(() => ({
                        or: jest.fn(() =>
                            Promise.resolve({ count: 0, error: null })
                        ),
                    })),
                })),
            })),
        })),
    },
}));

// Mock migration modules
jest.mock("../../scripts/migrations/zone-calendar-setup", () => ({
    setupZoneCalendars: jest.fn(),
}));

jest.mock("../../scripts/migrations/zone-validation", () => ({
    validateZoneAssignments: jest.fn(),
}));

jest.mock("../../scripts/migrations/six-month-request-migration", () => ({
    migrateSixMonthRequests: jest.fn(),
}));

// Import after mocks
import { migrateZoneCalendars } from "../../scripts/migrations/zone-calendar-migration";
import { setupZoneCalendars } from "../../scripts/migrations/zone-calendar-setup";
import { validateZoneAssignments } from "../../scripts/migrations/zone-validation";
import { migrateSixMonthRequests } from "../../scripts/migrations/six-month-request-migration";

describe("Zone Calendar Migration", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    it("should successfully complete all migration steps", async () => {
        // Mock successful responses for all steps
        const setupResult = {
            success: true,
            divisionsUpdated: ["DIV1", "DIV2"],
        };

        const validationResult = {
            success: true,
            invalidAssignments: [],
        };

        const migrationResult = {
            success: true,
            requestsUpdated: 5,
            requestsSkipped: 0,
        };

        (setupZoneCalendars as jest.Mock).mockResolvedValue(setupResult);
        (validateZoneAssignments as jest.Mock).mockResolvedValue(
            validationResult,
        );
        (migrateSixMonthRequests as jest.Mock).mockResolvedValue(
            migrationResult,
        );

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.steps).toEqual({
            setup: setupResult,
            validation: validationResult,
            migration: migrationResult,
        });

        // Verify logs
        expect(console.log).toHaveBeenCalledWith(
            "Starting zone calendar migration...",
        );
        expect(console.log).toHaveBeenCalledWith(
            "Zone calendar setup completed successfully",
        );
        expect(console.log).toHaveBeenCalledWith(
            "Zone assignment validation completed successfully",
        );
        expect(console.log).toHaveBeenCalledWith(
            "Six-month request migration completed successfully",
        );
        expect(console.log).toHaveBeenCalledWith(
            "Zone calendar migration completed successfully",
        );
    });

    it("should handle setup step failure", async () => {
        // Mock setup failure
        const setupResult = {
            success: false,
            divisionsUpdated: [],
            error: "Failed to setup zone calendars",
        };

        (setupZoneCalendars as jest.Mock).mockResolvedValue(setupResult);

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            "Zone calendar setup failed: Failed to setup zone calendars",
        );
        expect(result.steps).toEqual({
            setup: setupResult,
            validation: null,
            migration: null,
        });

        // Verify error logs
        expect(console.error).toHaveBeenCalledWith(
            "Zone calendar setup failed:",
            setupResult.error,
        );
    });

    it("should handle validation step failure", async () => {
        // Mock successful setup but failed validation
        const setupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult = {
            success: false,
            invalidAssignments: [],
            error: "Failed to validate zone assignments",
        };

        (setupZoneCalendars as jest.Mock).mockResolvedValue(setupResult);
        (validateZoneAssignments as jest.Mock).mockResolvedValue(
            validationResult,
        );

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            "Zone assignment validation failed: Failed to validate zone assignments",
        );
        expect(result.steps).toEqual({
            setup: setupResult,
            validation: validationResult,
            migration: null,
        });

        // Verify error logs
        expect(console.error).toHaveBeenCalledWith(
            "Zone assignment validation failed:",
            validationResult.error,
        );
    });

    it("should handle migration step failure", async () => {
        // Mock successful setup and validation but failed migration
        const setupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult = {
            success: true,
            invalidAssignments: [],
        };

        const migrationResult = {
            success: false,
            requestsUpdated: 0,
            requestsSkipped: 0,
            error: "Failed to migrate six-month requests",
        };

        (setupZoneCalendars as jest.Mock).mockResolvedValue(setupResult);
        (validateZoneAssignments as jest.Mock).mockResolvedValue(
            validationResult,
        );
        (migrateSixMonthRequests as jest.Mock).mockResolvedValue(
            migrationResult,
        );

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            "Six-month request migration failed: Failed to migrate six-month requests",
        );
        expect(result.steps).toEqual({
            setup: setupResult,
            validation: validationResult,
            migration: migrationResult,
        });

        // Verify error logs
        expect(console.error).toHaveBeenCalledWith(
            "Six-month request migration failed:",
            migrationResult.error,
        );
    });

    it("should handle invalid zone assignments", async () => {
        // Mock successful setup but validation found invalid assignments
        const setupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult = {
            success: true,
            invalidAssignments: [
                {
                    member_id: "MEM1",
                    zone_id: "ZONE1",
                    reason: "Zone not found",
                },
                {
                    member_id: "MEM2",
                    zone_id: "ZONE2",
                    reason: "Invalid division",
                },
            ],
        };

        (setupZoneCalendars as jest.Mock).mockResolvedValue(setupResult);
        (validateZoneAssignments as jest.Mock).mockResolvedValue(
            validationResult,
        );

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe("Found 2 invalid zone assignments");
        expect(result.steps).toEqual({
            setup: setupResult,
            validation: validationResult,
            migration: null,
        });

        // Verify warning logs
        expect(console.log).toHaveBeenCalledWith(
            "Found invalid zone assignments:",
            validationResult.invalidAssignments,
        );
    });

    it("should handle unexpected errors", async () => {
        // Mock unexpected error during setup
        (setupZoneCalendars as jest.Mock).mockRejectedValue(
            new Error("Unexpected error"),
        );

        const result = await migrateZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe(
            "Unexpected error during zone calendar migration",
        );
        expect(result.steps).toEqual({
            setup: null,
            validation: null,
            migration: null,
        });

        // Verify error logs
        expect(console.error).toHaveBeenCalledWith(
            "Unexpected error during zone calendar migration:",
            expect.any(Error),
        );
    });
});
