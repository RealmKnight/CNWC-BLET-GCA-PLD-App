import { DayAllotment, DayRequest } from "./test-utils";
import { addDays, format } from "date-fns";

export interface Zone {
    id: number;
    name: string;
    division: string;
}

export interface ZoneDayAllotment extends DayAllotment {
    zone_id: number | null;
}

export interface ZoneDayRequest extends DayRequest {
    zone_id: number | null;
}

export const mockZone: Zone = {
    id: 1,
    name: "ZONE_A",
    division: "TEST_DIV",
};

export const mockZoneAllotment: ZoneDayAllotment = {
    id: "123e4567-e89b-12d3-a456-426614174001",
    division: "TEST_DIV",
    zone_id: mockZone.id,
    date: "2024-03-20",
    max_allotment: 6,
    current_requests: 0,
};

export const mockZoneRequest: ZoneDayRequest = {
    id: "123e4567-e89b-12d3-a456-426614174002",
    member_id: "123e4567-e89b-12d3-a456-426614174000",
    division: "TEST_DIV",
    zone_id: mockZone.id,
    request_date: "2024-03-20",
    leave_type: "PLD",
    status: "pending",
    requested_at: new Date().toISOString(),
    member: {
        first_name: "John",
        last_name: "Doe",
        pin_number: "12345",
    },
};

export function generateMockZoneRequests(
    count: number,
    baseDate: Date,
    zoneId: number,
): ZoneDayRequest[] {
    return Array.from({ length: count }, (_, i) => ({
        ...mockZoneRequest,
        id: `123e4567-e89b-12d3-a456-${i.toString().padStart(12, "0")}`,
        request_date: format(addDays(baseDate, i), "yyyy-MM-dd"),
        zone_id: zoneId,
    }));
}

export function generateMockZoneAllotments(
    count: number,
    baseDate: Date,
    zoneId: number | null,
): ZoneDayAllotment[] {
    return Array.from({ length: count }, (_, i) => ({
        ...mockZoneAllotment,
        id: `123e4567-e89b-12d3-a456-${i.toString().padStart(12, "0")}`,
        date: format(addDays(baseDate, i), "yyyy-MM-dd"),
        zone_id: zoneId,
    }));
}
