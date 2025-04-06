import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { UserRole } from "../../types/auth";
import { Database } from "../../types/supabase";

export type Member = Database["public"]["Tables"]["members"]["Row"];

export interface DayAllotment {
    id?: number;
    date: string;
    division: string;
    max_allotment: number;
    year?: number;
    zone_id?: number;
}

export interface DayRequest {
    id?: number;
    member_id: string;
    division: string;
    request_date: string;
    leave_type: "PLD" | "SDV";
    status: "pending" | "approved" | "denied" | "waitlisted";
    requested_at?: string;
    waitlist_position?: number;
    zone_id?: number;
}

export const mockAllotment: DayAllotment = {
    id: 1,
    date: format(new Date(), "yyyy-MM-dd"),
    division: "test-division",
    max_allotment: 6,
};

export const mockRequest: DayRequest = {
    id: 1,
    member_id: "test-member",
    division: "test-division",
    request_date: format(new Date(), "yyyy-MM-dd"),
    leave_type: "PLD",
    status: "pending",
    requested_at: new Date().toISOString(),
};

export function generateMockRequests(
    count: number,
    baseDate: Date,
): DayRequest[] {
    return Array.from({ length: count }, (_, i) => ({
        ...mockRequest,
        id: i + 1,
        request_date: format(baseDate, "yyyy-MM-dd"),
    }));
}

export function generateMockAllotments(
    count: number,
    baseDate: Date,
): DayAllotment[] {
    return Array.from({ length: count }, (_, i) => ({
        ...mockAllotment,
        id: i + 1,
        date: format(baseDate, "yyyy-MM-dd"),
    }));
}

interface MockUserState {
    member: Member | null;
    userRole: UserRole | null;
    division: string | null;
    setMember: (member: Member | null) => void;
    setUserRole: (role: UserRole | null) => void;
    setDivision: (division: string | null) => void;
    reset: () => void;
}

export function createMockUserStore(): MockUserState {
    return {
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
    };
}

export function createMockSupabaseClient() {
    const mockClient = createClient("https://test.supabase.co", "test-key");

    // Create mock functions
    const mockEq = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockIn = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockGte = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockLte = jest.fn().mockResolvedValue({ data: [], error: null });

    const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq,
        in: mockIn,
        gte: mockGte,
        lte: mockLte,
    });

    const mockFrom = jest.fn().mockReturnValue({
        select: mockSelect,
        insert: jest.fn().mockResolvedValue({ data: [], error: null }),
        update: jest.fn().mockResolvedValue({ data: [], error: null }),
        delete: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

    // Create a mock client that preserves the original client's type
    const mockSupabaseClient = {
        ...mockClient,
        from: mockFrom,
        rpc: mockRpc,
    };

    return {
        client: mockSupabaseClient,
        mocks: {
            from: mockFrom,
            select: mockSelect,
            eq: mockEq,
            in: mockIn,
            gte: mockGte,
            lte: mockLte,
            rpc: mockRpc,
        },
    };
}
