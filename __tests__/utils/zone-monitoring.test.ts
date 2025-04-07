import { supabase } from "@/utils/supabase";
import * as zoneMonitoring from "../../utils/zone-monitoring";
import {
    collectZoneMetrics,
    monitorZonePerformance,
} from "../../utils/zone-monitoring";
import type { ZoneCalendarSetupResult } from "../../scripts/migrations/zone-calendar-setup";
import type { ZoneValidationResult } from "../../scripts/migrations/zone-validation";
import type { SixMonthRequestMigrationResult } from "../../scripts/migrations/six-month-request-migration";
import { migrateZoneCalendars } from "../../scripts/migrations/zone-calendar-migration";

// Mock console methods
const originalConsoleWarn = console.warn;
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

describe("Zone Monitoring", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.warn = jest.fn();
        console.error = jest.fn();
    });

    afterEach(() => {
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    });

    describe("collectZoneMetrics", () => {
        it("should collect metrics successfully", async () => {
            // Mock zone data
            const mockZones = [
                { id: 1, name: "ZONE1", division_id: "DIV1" },
                { id: 2, name: "ZONE2", division_id: "DIV1" },
            ];

            // Mock request data
            const mockRequests = [
                {
                    status: "approved",
                    requested_at: "2024-01-01T00:00:00Z",
                    responded_at: "2024-01-01T02:00:00Z",
                },
                {
                    status: "waitlisted",
                    requested_at: "2024-01-01T00:00:00Z",
                    responded_at: "2024-01-01T01:00:00Z",
                },
                {
                    status: "denied",
                    requested_at: "2024-01-01T00:00:00Z",
                    responded_at: "2024-01-01T03:00:00Z",
                },
            ];

            // Setup mock responses
            (supabase.from as jest.Mock).mockImplementation(() => ({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        gte: jest.fn().mockResolvedValue({
                            data: mockRequests,
                            error: null,
                        }),
                    }),
                }),
            }));

            const result = await collectZoneMetrics();

            expect(result.success).toBe(true);
            expect(result.metrics).toBeDefined();
            expect(result.timestamp).toBeDefined();
        });

        it("should handle zone fetch error", async () => {
            // Mock zone fetch error
            (supabase.from as jest.Mock).mockImplementation(() => ({
                select: jest.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Failed to fetch zones"),
                }),
            }));

            const result = await collectZoneMetrics();

            expect(result.success).toBe(false);
            expect(result.error).toBe("Failed to fetch zones");
            expect(result.metrics).toEqual({});
        });

        it("should handle request fetch error for a zone", async () => {
            // Mock zone data but request fetch error
            const mockZones = [{ id: 1, name: "ZONE1", division_id: "DIV1" }];

            (supabase.from as jest.Mock).mockImplementation((table) => ({
                select: jest.fn().mockReturnValue({
                    eq: table === "zones"
                        ? Promise.resolve({ data: mockZones, error: null })
                        : Promise.resolve({
                            data: null,
                            error: new Error("Failed to fetch requests"),
                        }),
                }),
            }));

            const result = await collectZoneMetrics();

            expect(result.success).toBe(true);
            expect(result.metrics["ZONE1"]).toEqual({
                totalRequests: 0,
                approvedRequests: 0,
                waitlistedRequests: 0,
                deniedRequests: 0,
                averageProcessingTime: 0,
                errorCount: 0,
            });
        });
    });

    describe("monitorZonePerformance", () => {
        it("should generate alerts for high error rates", async () => {
            // Mock metrics with high error count
            const mockMetrics = {
                success: true,
                metrics: {
                    ZONE1: {
                        totalRequests: 10,
                        approvedRequests: 5,
                        waitlistedRequests: 2,
                        deniedRequests: 1,
                        averageProcessingTime: 3600000, // 1 hour
                        errorCount: 6,
                    },
                },
                timestamp: new Date().toISOString(),
            };

            jest.spyOn(zoneMonitoring, "collectZoneMetrics").mockResolvedValue(
                mockMetrics,
            );

            await monitorZonePerformance(5);

            expect(console.warn).toHaveBeenCalledWith(
                "Zone Calendar Monitoring Alerts:",
                expect.arrayContaining([
                    expect.stringContaining("High error rate in zone ZONE1"),
                ]),
            );
        });

        it("should generate alerts for slow processing times", async () => {
            // Mock metrics with slow processing time
            const mockMetrics = {
                success: true,
                metrics: {
                    ZONE1: {
                        totalRequests: 10,
                        approvedRequests: 5,
                        waitlistedRequests: 2,
                        deniedRequests: 1,
                        averageProcessingTime: 172800000, // 48 hours
                        errorCount: 1,
                    },
                },
                timestamp: new Date().toISOString(),
            };

            jest.spyOn(zoneMonitoring, "collectZoneMetrics").mockResolvedValue(
                mockMetrics,
            );

            await monitorZonePerformance(5, 86400000); // 24 hours threshold

            expect(console.warn).toHaveBeenCalledWith(
                "Zone Calendar Monitoring Alerts:",
                expect.arrayContaining([
                    expect.stringContaining(
                        "Slow processing time in zone ZONE1",
                    ),
                ]),
            );
        });

        it("should generate alerts for high waitlist ratios", async () => {
            // Mock metrics with high waitlist ratio
            const mockMetrics = {
                success: true,
                metrics: {
                    ZONE1: {
                        totalRequests: 10,
                        approvedRequests: 2,
                        waitlistedRequests: 6,
                        deniedRequests: 2,
                        averageProcessingTime: 3600000,
                        errorCount: 0,
                    },
                },
                timestamp: new Date().toISOString(),
            };

            jest.spyOn(zoneMonitoring, "collectZoneMetrics").mockResolvedValue(
                mockMetrics,
            );

            await monitorZonePerformance();

            expect(console.warn).toHaveBeenCalledWith(
                "Zone Calendar Monitoring Alerts:",
                expect.arrayContaining([
                    expect.stringContaining(
                        "High waitlist ratio in zone ZONE1",
                    ),
                ]),
            );
        });

        it("should handle monitoring errors", async () => {
            jest.spyOn(zoneMonitoring, "collectZoneMetrics").mockRejectedValue(
                new Error("Monitoring failed"),
            );

            await monitorZonePerformance();

            expect(console.error).toHaveBeenCalledWith(
                "Error monitoring zone performance:",
                expect.any(Error),
            );
        });
    });
});

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
        const setupResult: ZoneCalendarSetupResult = {
            success: true,
            divisionsUpdated: ["DIV1", "DIV2"],
        };

        const validationResult: ZoneValidationResult = {
            success: true,
            invalidAssignments: [],
        };

        const migrationResult: SixMonthRequestMigrationResult = {
            success: true,
            requestsUpdated: 5,
            requestsSkipped: 0,
        };

        jest.spyOn(zoneSetup, "setupZoneCalendars").mockResolvedValue(
            setupResult,
        );
        jest.spyOn(zoneValidation, "validateZoneAssignments").mockResolvedValue(
            validationResult,
        );
        jest.spyOn(requestMigration, "migrateSixMonthRequests")
            .mockResolvedValue(migrationResult);

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
        const setupResult: ZoneCalendarSetupResult = {
            success: false,
            divisionsUpdated: [],
            error: "Failed to setup zone calendars",
        };

        jest.spyOn(zoneSetup, "setupZoneCalendars").mockResolvedValue(
            setupResult,
        );

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
        const setupResult: ZoneCalendarSetupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult: ZoneValidationResult = {
            success: false,
            invalidAssignments: [],
            error: "Failed to validate zone assignments",
        };

        jest.spyOn(zoneSetup, "setupZoneCalendars").mockResolvedValue(
            setupResult,
        );
        jest.spyOn(zoneValidation, "validateZoneAssignments").mockResolvedValue(
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
        const setupResult: ZoneCalendarSetupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult: ZoneValidationResult = {
            success: true,
            invalidAssignments: [],
        };

        const migrationResult: SixMonthRequestMigrationResult = {
            success: false,
            requestsUpdated: 0,
            requestsSkipped: 0,
            error: "Failed to migrate six-month requests",
        };

        jest.spyOn(zoneSetup, "setupZoneCalendars").mockResolvedValue(
            setupResult,
        );
        jest.spyOn(zoneValidation, "validateZoneAssignments").mockResolvedValue(
            validationResult,
        );
        jest.spyOn(requestMigration, "migrateSixMonthRequests")
            .mockResolvedValue(migrationResult);

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
        const setupResult: ZoneCalendarSetupResult = {
            success: true,
            divisionsUpdated: ["DIV1"],
        };

        const validationResult: ZoneValidationResult = {
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

        jest.spyOn(zoneSetup, "setupZoneCalendars").mockResolvedValue(
            setupResult,
        );
        jest.spyOn(zoneValidation, "validateZoneAssignments").mockResolvedValue(
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
        jest.spyOn(zoneSetup, "setupZoneCalendars").mockRejectedValue(
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
