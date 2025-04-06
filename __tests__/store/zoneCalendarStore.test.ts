// Mock declarations must come before imports
jest.mock("../../utils/supabase", () => {
    const mockFrom = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
    }));

    return {
        supabase: {
            from: mockFrom,
            auth: {
                getUser: jest.fn(),
                signOut: jest.fn(),
            },
            rpc: jest.fn(),
        },
    };
});

jest.mock("../../store/userStore", () => ({
    useUserStore: {
        getState: () => ({
            member: {
                id: "test-user",
                division: "test-division",
                pin_number: 12345,
                first_name: "Test",
                last_name: "User",
                wc_sen_roster: 1,
                created_at: new Date().toISOString(),
                phone_number: "123-456-7890",
            },
            userRole: "user",
            division: "test-division",
            setMember: jest.fn(),
            setUserRole: jest.fn(),
            setDivision: jest.fn(),
            reset: jest.fn(),
        }),
    },
}));

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { format } from "date-fns";
import { useCalendarStore } from "../../store/calendarStore";
import {
    mockZone,
    mockZoneAllotment,
    mockZoneRequest,
} from "../utils/zone-test-utils";
import { supabase } from "../../utils/supabase";

describe("Zone Calendar Store", () => {
    let store: ReturnType<typeof useCalendarStore.getState>;

    beforeEach(() => {
        jest.clearAllMocks();
        store = useCalendarStore.getState();

        // Initialize store
        store.setError(null);
        store.setIsLoading(false);
        store.setIsInitialized(true);
    });

    describe("Zone Allotment Management", () => {
        it("should fetch zone-specific allotments", async () => {
            const startDate = format(new Date(), "yyyy-MM-dd");
            const endDate = format(new Date(), "yyyy-MM-dd");

            // Mock date-specific allotments query
            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnValue({
                    data: [mockZoneAllotment],
                    error: null,
                }),
            }));

            // Mock yearly allotments query
            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnValue({
                    data: [{
                        year: 2024,
                        max_allotment: 6,
                        zone_id: mockZone.id,
                    }],
                    error: null,
                }),
            }));

            const result = await store.fetchAllotments(startDate, endDate);

            expect(result.allotments).toBeDefined();
            expect(result.yearlyAllotments).toBeDefined();
            expect(supabase.from).toHaveBeenCalledWith("pld_sdv_allotments");
        });

        it("should handle allotment fetch errors", async () => {
            const startDate = format(new Date(), "yyyy-MM-dd");
            const endDate = format(new Date(), "yyyy-MM-dd");

            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnValue({
                    data: null,
                    error: new Error("Database error"),
                }),
            }));

            await store.fetchAllotments(startDate, endDate);
            expect(store.error).toBeTruthy();
        });
    });

    describe("Zone Request Management", () => {
        it("should fetch zone-specific requests", async () => {
            const startDate = format(new Date(), "yyyy-MM-dd");
            const endDate = format(new Date(), "yyyy-MM-dd");

            // Mock requests query
            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnValue({
                    data: [mockZoneRequest],
                    error: null,
                }),
            }));

            // Mock member details query
            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                in: jest.fn().mockReturnValue({
                    data: [{
                        id: mockZoneRequest.member_id,
                        first_name: "John",
                        last_name: "Doe",
                        pin_number: "12345",
                    }],
                    error: null,
                }),
            }));

            const result = await store.fetchRequests(startDate, endDate);

            expect(result).toBeDefined();
            expect(supabase.from).toHaveBeenCalledWith("pld_sdv_requests");
        });

        it("should handle request fetch errors", async () => {
            const startDate = format(new Date(), "yyyy-MM-dd");
            const endDate = format(new Date(), "yyyy-MM-dd");

            (supabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn().mockReturnThis(),
                eq: jest.fn().mockReturnThis(),
                gte: jest.fn().mockReturnThis(),
                lte: jest.fn().mockReturnValue({
                    data: null,
                    error: new Error("Database error"),
                }),
            }));

            await store.fetchRequests(startDate, endDate);
            expect(store.error).toBeTruthy();
        });
    });
});
