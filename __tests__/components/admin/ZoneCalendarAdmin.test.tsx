import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ZoneCalendarAdmin } from "../../../components/admin/division/ZoneCalendarAdmin";
import { useCalendarStore } from "../../../store/calendarStore";
import { useUserStore } from "../../../store/userStore";
import { mockZone, mockZoneAllotment } from "../../utils/zone-test-utils";

// Mock the stores
jest.mock("../../../store/calendarStore");
jest.mock("../../../store/userStore");

// Mock the color scheme hook
jest.mock("../../../hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));

describe("Zone Calendar Admin Component", () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock user store with admin permissions
    (useUserStore.getState as jest.Mock).mockReturnValue({
      division: "TEST_DIV",
      member: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        division: "TEST_DIV",
        is_admin: true,
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

  it("should render zone management interface", () => {
    const { getByTestId } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    expect(getByTestId("zone-calendar-admin")).toBeTruthy();
  });

  it("should enable zone-specific calendars", async () => {
    const mockEnableZoneCalendars = jest.fn();
    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      enableZoneCalendars: mockEnableZoneCalendars,
    });

    const { getByTestId } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    fireEvent.press(getByTestId("enable-zone-calendars"));
    expect(mockEnableZoneCalendars).toHaveBeenCalledWith("TEST_DIV");
  });

  it("should set zone-specific allotments", async () => {
    const mockSetZoneAllotment = jest.fn();
    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      setZoneAllotment: mockSetZoneAllotment,
    });

    const { getByTestId } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    // Set allotment for a specific zone
    fireEvent.changeText(getByTestId("zone-allotment-input"), "5");
    fireEvent.press(getByTestId("set-zone-allotment"));

    expect(mockSetZoneAllotment).toHaveBeenCalledWith("TEST_DIV", mockZone.id, "2024-03-20", 5);
  });

  it("should display zone-specific statistics", async () => {
    const mockStats = {
      totalRequests: 10,
      approvedRequests: 6,
      waitlistedRequests: 4,
    };

    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      getZoneStats: jest.fn().mockResolvedValue(mockStats),
    });

    const { getByTestId } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    await waitFor(() => {
      expect(getByTestId("zone-stats-approved")).toHaveTextContent("6");
      expect(getByTestId("zone-stats-waitlisted")).toHaveTextContent("4");
    });
  });

  it("should handle zone transfer requests", async () => {
    const mockHandleTransfer = jest.fn();
    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      handleZoneTransfer: mockHandleTransfer,
    });

    const { getByTestId } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    // Initiate a zone transfer
    fireEvent.press(getByTestId("initiate-zone-transfer"));
    fireEvent.changeText(getByTestId("new-zone-input"), "2");
    fireEvent.press(getByTestId("confirm-zone-transfer"));

    expect(mockHandleTransfer).toHaveBeenCalledWith(mockZone.id, 2, expect.any(Object));
  });

  it("should validate zone-specific allotment inputs", async () => {
    const { getByTestId, getByText } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    // Try to set an invalid allotment
    fireEvent.changeText(getByTestId("zone-allotment-input"), "-1");
    fireEvent.press(getByTestId("set-zone-allotment"));

    expect(getByText(/invalid allotment value/i)).toBeTruthy();
  });

  it("should handle errors during zone operations", async () => {
    const mockError = "Failed to update zone settings";
    const mockSetZoneAllotment = jest.fn().mockRejectedValue(new Error(mockError));

    (useCalendarStore.getState as jest.Mock).mockReturnValue({
      ...useCalendarStore.getState(),
      setZoneAllotment: mockSetZoneAllotment,
    });

    const { getByTestId, getByText } = render(<ZoneCalendarAdmin division="TEST_DIV" />);

    fireEvent.changeText(getByTestId("zone-allotment-input"), "5");
    fireEvent.press(getByTestId("set-zone-allotment"));

    await waitFor(() => {
      expect(getByText(mockError)).toBeTruthy();
    });
  });
});
