import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react-hooks";
import { useZoneCalendarStore } from "../../stores/zone-calendar-store";
import { addDays, subDays } from "date-fns";
import { supabase } from "@/utils/supabase";

// Mock Supabase client
vi.mock("@/utils/supabase", () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(),
            insert: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        })),
    },
}));

describe("Zone Calendar Store", () => {
    beforeEach(() => {
        const { result } = renderHook(() => useZoneCalendarStore());
        act(() => {
            result.current.reset();
        });
    });

    describe("fetchZoneCalendars", () => {
        it("should fetch zone calendars successfully", async () => {
            const mockCalendars = [
                {
                    id: 1,
                    zone_id: "zone1",
                    division_id: "div1",
                    start_date: "2024-04-07",
                    end_date: "2024-04-14",
                    max_requests: 10,
                    is_active: true,
                },
            ];

            const { result } = renderHook(() => useZoneCalendarStore());

            // Mock the Supabase response
            (supabase.from as any).mockImplementation(() => ({
                select: vi.fn().mockResolvedValue({
                    data: mockCalendars,
                    error: null,
                }),
            }));

            await act(async () => {
                await result.current.fetchZoneCalendars();
            });

            expect(result.current.zoneCalendars).toEqual(mockCalendars);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it("should handle fetch error", async () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            // Mock the Supabase error response
            const mockError = new Error("Failed to fetch calendars");
            (supabase.from as any).mockImplementation(() => ({
                select: vi.fn().mockResolvedValue({
                    data: null,
                    error: mockError,
                }),
            }));

            await act(async () => {
                await result.current.fetchZoneCalendars();
            });

            expect(result.current.zoneCalendars).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBe("Failed to fetch calendars");
        });
    });

    describe("updateZoneCalendar", () => {
        it("should update zone calendar successfully", async () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            const mockCalendar = {
                id: 1,
                zone_id: "zone1",
                division_id: "div1",
                start_date: "2024-04-07",
                end_date: "2024-04-14",
                max_requests: 10,
                is_active: true,
            };

            // Mock the Supabase response
            (supabase.from as any).mockImplementation(() => ({
                update: vi.fn().mockResolvedValue({
                    data: mockCalendar,
                    error: null,
                }),
            }));

            await act(async () => {
                await result.current.updateZoneCalendar(mockCalendar);
            });

            expect(supabase.from).toHaveBeenCalled();
            expect(result.current.error).toBeNull();
        });

        it("should handle update error", async () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            const mockCalendar = {
                id: 1,
                zone_id: "zone1",
                division_id: "div1",
                start_date: "2024-04-07",
                end_date: "2024-04-14",
                max_requests: 10,
                is_active: true,
            };

            // Mock the Supabase error response
            const mockError = new Error("Failed to update calendar");
            (supabase.from as any).mockImplementation(() => ({
                update: vi.fn().mockResolvedValue({
                    data: null,
                    error: mockError,
                }),
            }));

            await act(async () => {
                await result.current.updateZoneCalendar(mockCalendar);
            });

            expect(supabase.from).toHaveBeenCalled();
            expect(result.current.error).toBe("Failed to update calendar");
        });
    });

    describe("validateCalendarDates", () => {
        it("should validate calendar dates successfully", () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            const startDate = "2024-04-07";
            const endDate = "2024-04-14";

            const isValid = result.current.validateCalendarDates(
                startDate,
                endDate,
            );
            expect(isValid).toBe(true);
        });

        it("should invalidate when end date is before start date", () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            const startDate = "2024-04-14";
            const endDate = "2024-04-07";

            const isValid = result.current.validateCalendarDates(
                startDate,
                endDate,
            );
            expect(isValid).toBe(false);
        });

        it("should invalidate when dates are in the past", () => {
            const { result } = renderHook(() => useZoneCalendarStore());

            const startDate = "2024-01-01";
            const endDate = "2024-01-07";

            const isValid = result.current.validateCalendarDates(
                startDate,
                endDate,
            );
            expect(isValid).toBe(false);
        });
    });
});
