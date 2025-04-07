import { supabase } from "@/utils/supabase";
import { migrateSixMonthRequests } from "../../scripts/migrations/six-month-request-migration";

// Mock Supabase client
jest.mock("@/utils/supabase", () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    is: jest.fn(() =>
                        Promise.resolve({ data: [], error: null })
                    ),
                })),
            })),
            update: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({ error: null })),
            })),
        })),
    },
}));

describe("Six Month Request Migration", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should migrate six month requests successfully", async () => {
        // Mock request data
        const mockRequests = [
            {
                id: "1",
                member_id: "member1",
                division: "DIV1",
                request_date: "2024-01-01",
                leave_type: "PLD",
                members: {
                    zone: "ZONE1",
                },
            },
        ];

        // Mock zone data
        const mockZone = { id: 1 };

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    is: jest.fn().mockResolvedValue({
                        data: mockRequests,
                        error: null,
                    }),
                    single: jest.fn().mockResolvedValue({
                        data: mockZone,
                        error: null,
                    }),
                }),
            }),
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null }),
            }),
        }));

        const result = await migrateSixMonthRequests();

        expect(result.success).toBe(true);
        expect(result.requestsUpdated).toBe(1);
        expect(result.requestsSkipped).toBe(0);
    });

    it("should handle requests without zone information", async () => {
        // Mock request data without zone
        const mockRequests = [
            {
                id: "1",
                member_id: "member1",
                division: "DIV1",
                request_date: "2024-01-01",
                leave_type: "PLD",
                members: {
                    zone: null,
                },
            },
        ];

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    is: jest.fn().mockResolvedValue({
                        data: mockRequests,
                        error: null,
                    }),
                }),
            }),
        }));

        const result = await migrateSixMonthRequests();

        expect(result.success).toBe(true);
        expect(result.requestsUpdated).toBe(0);
        expect(result.requestsSkipped).toBe(1);
    });

    it("should handle request fetch error", async () => {
        // Mock request fetch error
        (supabase.from as jest.Mock).mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    is: jest.fn().mockResolvedValue({
                        data: null,
                        error: new Error("Failed to fetch requests"),
                    }),
                }),
            }),
        }));

        const result = await migrateSixMonthRequests();

        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to fetch requests");
        expect(result.requestsUpdated).toBe(0);
        expect(result.requestsSkipped).toBe(0);
    });

    it("should handle zone lookup error", async () => {
        // Mock request data
        const mockRequests = [
            {
                id: "1",
                member_id: "member1",
                division: "DIV1",
                request_date: "2024-01-01",
                leave_type: "PLD",
                members: {
                    zone: "INVALID_ZONE",
                },
            },
        ];

        // Setup mock responses
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue(
                    table === "six_month_requests"
                        ? {
                            is: jest.fn().mockResolvedValue({
                                data: mockRequests,
                                error: null,
                            }),
                        }
                        : {
                            single: jest.fn().mockResolvedValue({
                                data: null,
                                error: new Error("Zone not found"),
                            }),
                        },
                ),
            }),
        }));

        const result = await migrateSixMonthRequests();

        expect(result.success).toBe(true);
        expect(result.requestsUpdated).toBe(0);
        expect(result.requestsSkipped).toBe(1);
    });

    it("should handle request update error", async () => {
        // Mock request data
        const mockRequests = [
            {
                id: "1",
                member_id: "member1",
                division: "DIV1",
                request_date: "2024-01-01",
                leave_type: "PLD",
                members: {
                    zone: "ZONE1",
                },
            },
        ];

        // Mock zone data
        const mockZone = { id: 1 };

        // Setup mock responses with update error
        (supabase.from as jest.Mock).mockImplementation((table) => ({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    is: jest.fn().mockResolvedValue({
                        data: mockRequests,
                        error: null,
                    }),
                    single: jest.fn().mockResolvedValue({
                        data: mockZone,
                        error: null,
                    }),
                }),
            }),
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                    error: new Error("Failed to update request"),
                }),
            }),
        }));

        const result = await migrateSixMonthRequests();

        expect(result.success).toBe(true);
        expect(result.requestsUpdated).toBe(0);
        expect(result.requestsSkipped).toBe(1);
    });
});
