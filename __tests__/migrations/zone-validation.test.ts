import { supabase } from "@/utils/supabase";
import { validateZoneAssignments } from "../../scripts/migrations/zone-validation";

// Mock Supabase client
jest.mock("@/utils/supabase", () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    single: jest.fn(() =>
                        Promise.resolve({ data: { id: 1 }, error: null })
                    ),
                })),
                not: jest.fn(() => Promise.resolve({ data: [], error: null })),
            })),
        })),
    },
}));

describe("Zone Validation", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should validate zone assignments successfully", async () => {
        // Mock member data with valid zone assignments
        const mockMembers = [
            {
                id: "1",
                first_name: "John",
                last_name: "Doe",
                division: "DIV1",
                zone: "ZONE1",
            },
            {
                id: "2",
                first_name: "Jane",
                last_name: "Smith",
                division: "DIV2",
                zone: "ZONE2",
            },
        ];

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                    data: mockMembers,
                    error: null,
                }),
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                        data: { id: 1 },
                        error: null,
                    }),
                }),
            }),
        }));

        const result = await validateZoneAssignments();

        expect(result.success).toBe(true);
        expect(result.invalidAssignments).toHaveLength(0);
    });

    it("should identify invalid zone assignments", async () => {
        // Mock member data
        const mockMembers = [
            {
                id: "1",
                first_name: "John",
                last_name: "Doe",
                division: "DIV1",
                zone: "INVALID_ZONE",
            },
        ];

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                    data: mockMembers,
                    error: null,
                }),
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({
                        data: null,
                        error: new Error("Zone not found"),
                    }),
                }),
            }),
        }));

        const result = await validateZoneAssignments();

        expect(result.success).toBe(true);
        expect(result.invalidAssignments).toHaveLength(1);
        expect(result.invalidAssignments[0]).toEqual({
            memberId: "1",
            memberName: "John Doe",
            currentZone: "INVALID_ZONE",
            division: "DIV1",
        });
    });

    it("should handle member fetch error", async () => {
        // Mock member fetch error
        (supabase.from as jest.Mock).mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Failed to fetch members"),
                }),
            }),
        }));

        const result = await validateZoneAssignments();

        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to fetch members");
        expect(result.invalidAssignments).toEqual([]);
    });

    it("should handle zone validation error", async () => {
        // Mock member data
        const mockMembers = [
            {
                id: "1",
                first_name: "John",
                last_name: "Doe",
                division: "DIV1",
                zone: "ZONE1",
            },
        ];

        // Setup mock responses with zone validation error
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                not: jest.fn().mockResolvedValue({
                    data: mockMembers,
                    error: null,
                }),
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockRejectedValue(
                        new Error("Database error"),
                    ),
                }),
            }),
        }));

        const result = await validateZoneAssignments();

        expect(result.success).toBe(true);
        expect(result.invalidAssignments).toHaveLength(1);
    });
});
