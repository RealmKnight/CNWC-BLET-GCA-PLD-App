import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import { DayRequest, useCalendarStore } from "../../store/calendarStore";
import {
    generateMockAllotments,
    generateMockRequests,
    mockAllotment,
    mockMember,
    mockPLDSDVRequest,
} from "../utils/test-utils";

// Mock Supabase client
jest.mock("@supabase/supabase-js", () => ({
    createClient: jest.fn(() => ({
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    gte: jest.fn(() => ({
                        lte: jest.fn(() => ({
                            order: jest.fn(() => ({
                                data: [],
                                error: null,
                            })),
                        })),
                    })),
                })),
            })),
            insert: jest.fn(() => ({
                select: jest.fn(() => ({
                    data: null,
                    error: null,
                })),
            })),
            update: jest.fn(() => ({
                eq: jest.fn(() => ({
                    select: jest.fn(() => ({
                        data: null,
                        error: null,
                    })),
                })),
            })),
            delete: jest.fn(() => ({
                eq: jest.fn(() => ({
                    data: null,
                    error: null,
                })),
            })),
        })),
        rpc: jest.fn(() => ({
            data: null,
            error: null,
        })),
    })),
}));

// Mock user store
jest.mock("../../store/userStore", () => ({
    useUserStore: {
        getState: () => ({
            division: "TEST_DIV",
            member: {
                id: "123e4567-e89b-12d3-a456-426614174000",
                division: "TEST_DIV",
                pin_number: "12345",
            },
        }),
    },
}));

interface CalendarState {
    selectedDate: Date | null;
    selectedMonth: Date | null;
    allotments: Record<string, number>;
    yearlyAllotments: Record<number, number>;
    requests: Record<string, DayRequest[]>;
    isLoading: boolean;
    error: string | null;
    isInitialized: boolean;
    setSelectedDate: (date: Date | null) => void;
    setSelectedMonth: (date: Date | null) => void;
    setError: (error: string | null) => void;
    clearError: () => void;
    setSupabaseClient: (client: any) => void;
    reset: () => void;
    fetchAllotments: (startDate: string, endDate: string) => Promise<{
        allotments: Record<string, number>;
        yearlyAllotments: Record<number, number>;
    }>;
    fetchRequests: (
        startDate: string,
        endDate: string,
    ) => Promise<Record<string, DayRequest[]>>;
    submitRequest: (date: string, type: "PLD" | "SDV") => Promise<void>;
}

describe("Calendar Store", () => {
    let store: ReturnType<typeof useCalendarStore.getState>;
    const mockSupabase = createClient("", "");

    beforeEach(() => {
        store = useCalendarStore.getState();
        // Initialize store with mock data
        store.setError(null);
        store.setIsLoading(false);
        store.setIsInitialized(false);
    });

    describe("Allotment Management", () => {
        it("should fetch allotments for a date range", async () => {
            const startDate = new Date("2024-03-01");
            const endDate = new Date("2024-03-31");
            const mockAllotments = generateMockAllotments(31, startDate);

            // Mock the Supabase response for yearly allotments
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        in: jest.fn(() => ({
                            eq: jest.fn(() => ({
                                data: [{ year: 2024, max_allotment: 6 }],
                                error: null,
                            })),
                        })),
                    })),
                })),
            }));

            // Mock the Supabase response for date-specific allotments
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        gte: jest.fn(() => ({
                            lte: jest.fn(() => ({
                                neq: jest.fn(() => ({
                                    data: mockAllotments,
                                    error: null,
                                })),
                            })),
                        })),
                    })),
                })),
            }));

            const result = await store.fetchAllotments(
                format(startDate, "yyyy-MM-dd"),
                format(endDate, "yyyy-MM-dd"),
            );

            expect(result.allotments).toBeDefined();
            expect(result.yearlyAllotments).toBeDefined();
            expect(result.yearlyAllotments[2024]).toBe(6);
            expect(store.error).toBeNull();
        });

        it("should handle allotment fetch errors", async () => {
            const startDate = new Date("2024-03-01");
            const endDate = new Date("2024-03-31");
            const mockError = new Error("Failed to fetch allotments");

            // Mock the Supabase error response
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        in: jest.fn(() => ({
                            eq: jest.fn(() => ({
                                data: null,
                                error: mockError,
                            })),
                        })),
                    })),
                })),
            }));

            const result = await store.fetchAllotments(
                format(startDate, "yyyy-MM-dd"),
                format(endDate, "yyyy-MM-dd"),
            );

            expect(result.allotments).toEqual({});
            expect(result.yearlyAllotments).toEqual({});
            expect(store.error).toBe(mockError.message);
        });
    });

    describe("Request Management", () => {
        it("should fetch requests for a date range", async () => {
            const startDate = new Date("2024-03-01");
            const endDate = new Date("2024-03-31");
            const mockRequests = generateMockRequests(31, startDate);

            // Mock the Supabase response for requests
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        gte: jest.fn(() => ({
                            lte: jest.fn(() => ({
                                data: mockRequests,
                                error: null,
                            })),
                        })),
                    })),
                })),
            }));

            // Mock the Supabase response for member details
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    in: jest.fn(() => ({
                        data: [{
                            id: mockMember.id,
                            first_name: "John",
                            last_name: "Doe",
                            pin_number: mockMember.pin_number,
                        }],
                        error: null,
                    })),
                })),
            }));

            const result = await store.fetchRequests(
                format(startDate, "yyyy-MM-dd"),
                format(endDate, "yyyy-MM-dd"),
            );

            expect(result).toBeDefined();
            expect(Object.keys(result).length).toBeGreaterThan(0);
            expect(store.error).toBeNull();
        });

        it("should handle request fetch errors", async () => {
            const startDate = new Date("2024-03-01");
            const endDate = new Date("2024-03-31");
            const mockError = new Error("Failed to fetch requests");

            // Mock the Supabase error response
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        gte: jest.fn(() => ({
                            lte: jest.fn(() => ({
                                data: null,
                                error: mockError,
                            })),
                        })),
                    })),
                })),
            }));

            const result = await store.fetchRequests(
                format(startDate, "yyyy-MM-dd"),
                format(endDate, "yyyy-MM-dd"),
            );

            expect(result).toEqual({});
            expect(store.error).toBe(mockError.message);
        });

        it("should submit a new request", async () => {
            const date = format(new Date(), "yyyy-MM-dd");
            const type = "PLD";

            // Mock remaining days check
            (mockSupabase.rpc as jest.Mock).mockImplementationOnce(() => ({
                data: 5,
                error: null,
            }));

            // Mock six months check
            (mockSupabase.rpc as jest.Mock).mockImplementationOnce(() => ({
                data: false,
                error: null,
            }));

            // Mock request submission
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                insert: jest.fn(() => ({
                    select: jest.fn(() => ({
                        single: jest.fn(() => ({
                            data: mockPLDSDVRequest,
                            error: null,
                        })),
                    })),
                })),
            }));

            // Mock member details fetch
            (mockSupabase.from as jest.Mock).mockImplementationOnce(() => ({
                select: jest.fn(() => ({
                    eq: jest.fn(() => ({
                        single: jest.fn(() => ({
                            data: {
                                first_name: "John",
                                last_name: "Doe",
                            },
                            error: null,
                        })),
                    })),
                })),
            }));

            await store.submitRequest(date, type);

            expect(store.error).toBeNull();
        });
    });

    describe("Error Handling", () => {
        it("should set and clear error state", () => {
            store.setError("Test error");
            expect(store.error).toBe("Test error");

            store.setError(null);
            expect(store.error).toBeNull();
        });
    });
});
