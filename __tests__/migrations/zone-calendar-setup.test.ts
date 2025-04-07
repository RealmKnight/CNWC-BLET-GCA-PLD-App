import { supabase } from "@/utils/supabase";
import { setupZoneCalendars } from "../../scripts/migrations/zone-calendar-setup";

// Mock Supabase client
jest.mock("@/utils/supabase", () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    is: jest.fn(() => ({
                        single: jest.fn(() =>
                            Promise.resolve({
                                data: { max_allotment: 6 },
                                error: null,
                            })
                        ),
                    })),
                })),
            })),
            insert: jest.fn(() => Promise.resolve({ error: null })),
        })),
    },
}));

describe("Zone Calendar Setup", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should successfully setup zone calendars for divisions", async () => {
        // Mock division data
        const mockDivisions = [
            { name: "DIV1", uses_zone_calendars: true },
            { name: "DIV2", uses_zone_calendars: true },
        ];

        // Mock zones data
        const mockZones = [
            { id: 1 },
            { id: 2 },
        ];

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue(
                    table === "divisions"
                        ? Promise.resolve({ data: mockDivisions, error: null })
                        : Promise.resolve({ data: mockZones, error: null }),
                ),
            }),
            insert: jest.fn().mockResolvedValue({ error: null }),
        }));

        const result = await setupZoneCalendars();

        expect(result.success).toBe(true);
        expect(result.divisionsUpdated).toEqual(["DIV1", "DIV2"]);
        expect(supabase.from).toHaveBeenCalledWith("divisions");
        expect(supabase.from).toHaveBeenCalledWith("zones");
        expect(supabase.from).toHaveBeenCalledWith("pld_sdv_allotments");
    });

    it("should handle division fetch error", async () => {
        // Mock division fetch error
        (supabase.from as jest.Mock).mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Failed to fetch divisions"),
                }),
            }),
        }));

        const result = await setupZoneCalendars();

        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to fetch divisions");
        expect(result.divisionsUpdated).toEqual([]);
    });

    it("should handle zone fetch error for a division", async () => {
        // Mock successful division fetch but failed zone fetch
        const mockDivisions = [{ name: "DIV1", uses_zone_calendars: true }];

        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue(
                    table === "divisions"
                        ? { data: mockDivisions, error: null }
                        : {
                            data: null,
                            error: new Error("Failed to fetch zones"),
                        },
                ),
            }),
        }));

        const result = await setupZoneCalendars();

        expect(result.success).toBe(true);
        expect(result.divisionsUpdated).toEqual([]);
    });

    it("should handle allotment creation error", async () => {
        // Mock successful division and zone fetch but failed allotment creation
        const mockDivisions = [{ name: "DIV1", uses_zone_calendars: true }];
        const mockZones = [{ id: 1 }];

        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue(
                    table === "divisions"
                        ? Promise.resolve({ data: mockDivisions, error: null })
                        : Promise.resolve({ data: mockZones, error: null }),
                ),
            }),
            insert: jest.fn().mockResolvedValue({
                error: new Error("Failed to create allotment"),
            }),
        }));

        const result = await setupZoneCalendars();

        expect(result.success).toBe(true);
        expect(result.divisionsUpdated).toEqual([]);
    });
});
