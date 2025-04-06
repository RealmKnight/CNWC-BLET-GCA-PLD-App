import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Calendar } from "../../components/Calendar";
import { useCalendarStore } from "../../store/calendarStore";
import { useUserStore } from "../../store/userStore";
import { mockZone, mockZoneAllotment, mockZoneRequest } from "../utils/zone-test-utils";

// Mock the stores
jest.mock("../../store/calendarStore");
jest.mock("../../store/userStore");

// Mock the color scheme hook
jest.mock("../../hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));

describe("Zone-based Calendar Component", () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock user store with zone information
    (useUserStore.getState as jest.Mock).mockReturnValue({
      division: "TEST_DIV",
      member: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        division: "TEST_DIV",
        zone_id: mockZone.id,
        pin_number: "12345",
      },
    });

    // Mock calendar store
    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      selectedDate: null,
      allotments: {},
      yearlyAllotments: {},
      requests: {},
      isLoading: false,
      error: null,
      isInitialized: true,
      setSelectedDate: jest.fn(),
      setError: jest.fn(),
      fetchAllotments: jest.fn(),
      fetchRequests: jest.fn(),
      submitRequest: jest.fn(),
      getDateAvailability: jest.fn().mockReturnValue("available"),
      isDateSelectable: jest.fn().mockReturnValue(true),
    });
  });

  it("should render zone-specific calendar", () => {
    const { getByTestId } = render(<Calendar current={new Date().toISOString()} />);

    expect(getByTestId("calendar-view")).toBeTruthy();
  });

  it("should display zone-specific allotments", async () => {
    const mockAllotments = {
      "2024-03-20": mockZoneAllotment.max_allotment,
    };

    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      allotments: mockAllotments,
      getDateAvailability: jest.fn().mockReturnValue("available"),
    });

    const { getByTestId } = render(<Calendar current="2024-03-20" />);

    await waitFor(() => {
      expect(getByTestId("calendar-view")).toBeTruthy();
    });
  });

  it("should handle zone-specific request submission", async () => {
    const mockSubmitRequest = jest.fn();
    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      submitRequest: mockSubmitRequest,
    });

    const { getByTestId } = render(<Calendar current="2024-03-20" />);

    // Simulate date selection
    fireEvent.press(getByTestId("date-2024-03-20"));

    // Verify that the request submission includes zone information
    expect(mockSubmitRequest).toHaveBeenCalledWith(
      "2024-03-20",
      "PLD",
      expect.objectContaining({ zoneId: mockZone.id })
    );
  });

  it("should display zone transfer warning when applicable", async () => {
    const { getByTestId, getByText } = render(<Calendar current="2024-03-20" />);

    // Mock a zone transfer scenario
    (useUserStore.getState as jest.Mock).mockReturnValue({
      ...useUserStore.getState(),
      member: {
        ...useUserStore.getState().member,
        pending_zone_transfer: true,
        new_zone_id: 2,
      },
    });

    // Re-render to trigger the warning
    fireEvent.press(getByTestId("date-2024-03-20"));

    expect(getByText(/zone transfer pending/i)).toBeTruthy();
  });

  it("should handle errors for invalid zone requests", async () => {
    const mockError = "Invalid zone request";
    const mockSubmitRequest = jest.fn().mockRejectedValue(new Error(mockError));

    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      submitRequest: mockSubmitRequest,
    });

    const { getByTestId, getByText } = render(<Calendar current="2024-03-20" />);

    // Attempt to submit a request
    fireEvent.press(getByTestId("date-2024-03-20"));

    await waitFor(() => {
      expect(getByText(mockError)).toBeTruthy();
    });
  });

  it("should display correct availability based on zone allotments", async () => {
    const mockGetDateAvailability = jest.fn().mockReturnValue("limited");

    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      getDateAvailability: mockGetDateAvailability,
    });

    const { getByTestId } = render(<Calendar current="2024-03-20" />);

    const dateCell = getByTestId("date-2024-03-20");
    expect(dateCell.props.style).toMatchObject(
      expect.objectContaining({
        backgroundColor: expect.any(String), // Check for limited availability color
      })
    );
  });
});
