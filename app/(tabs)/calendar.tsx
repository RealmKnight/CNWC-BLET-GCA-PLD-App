import React, { useEffect, useState } from "react";
import { StyleSheet, Platform, TouchableOpacity, ScrollView, Modal, Alert } from "react-native";
import { Calendar } from "@/components/Calendar";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useCalendarStore, DayRequest } from "@/store/calendarStore";
import { setupCalendarSubscriptions } from "@/store/calendarStore";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format } from "date-fns-tz";
import { supabase } from "@/utils/supabase";
import { useUserStore } from "@/store/userStore";

type ColorScheme = keyof typeof Colors;

interface RequestWithMember extends DayRequest {
  member: {
    first_name: string;
    last_name: string;
    pin_number: string;
  };
}

interface RequestDialogProps {
  isVisible: boolean;
  onClose: () => void;
  onSubmit: (leaveType: "PLD" | "SDV") => void;
  selectedDate: string;
  allotments: {
    max: number;
    current: number;
  };
  requests: RequestWithMember[];
}

function RequestDialog({ isVisible, onClose, onSubmit, selectedDate, allotments, requests }: RequestDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const isFull = allotments.current >= allotments.max;
  const [remainingDays, setRemainingDays] = useState<{ PLD: number; SDV: number }>({ PLD: 0, SDV: 0 });
  const { user } = useAuth();
  const { member } = useUserStore();

  useEffect(() => {
    async function fetchRemainingDays() {
      if (!member?.id) return;

      const year = new Date(selectedDate).getFullYear();
      try {
        const [pldResult, sdvResult] = await Promise.all([
          supabase.rpc("get_member_remaining_days", {
            p_member_id: member.id,
            p_year: year,
            p_leave_type: "PLD",
          }),
          supabase.rpc("get_member_remaining_days", {
            p_member_id: member.id,
            p_year: year,
            p_leave_type: "SDV",
          }),
        ]);

        if (pldResult.error) throw pldResult.error;
        if (sdvResult.error) throw sdvResult.error;

        setRemainingDays({
          PLD: pldResult.data || 0,
          SDV: sdvResult.data || 0,
        });
      } catch (error) {
        console.error("[RequestDialog] Error fetching remaining days:", error);
      }
    }

    if (isVisible) {
      fetchRemainingDays();
    }
  }, [isVisible, member?.id, selectedDate]);

  const renderRequestList = () => {
    const spots = Array.from({ length: allotments.max }, (_, i) => i + 1);
    return spots.map((spot) => {
      const request = requests[spot - 1];
      return (
        <ThemedView key={spot} style={styles.requestSpot}>
          <ThemedText style={styles.spotNumber}>{spot}.</ThemedText>
          {request ? (
            <ThemedView style={styles.spotInfo}>
              <ThemedText>
                {request.member.first_name} {request.member.last_name} ({request.member.pin_number})
              </ThemedText>
              <ThemedText
                style={[
                  styles.requestStatus,
                  {
                    color:
                      request.status === "approved" ? "#4CAF50" : request.status === "denied" ? "#F44336" : "#FFC107",
                  },
                ]}
              >
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedText style={styles.emptySpot}>Available</ThemedText>
          )}
        </ThemedView>
      );
    });
  };

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          <ThemedText type="title" style={styles.modalTitle}>
            Request for {selectedDate}
          </ThemedText>

          <ThemedText style={styles.allotmentInfo}>
            {allotments.current}/{allotments.max} spots filled
          </ThemedText>

          <ThemedView style={styles.remainingDaysInfo}>
            <ThemedText>Remaining Days:</ThemedText>
            <ThemedText>PLD: {remainingDays.PLD}</ThemedText>
            <ThemedText>SDV: {remainingDays.SDV}</ThemedText>
          </ThemedView>

          {!isFull ? (
            <ThemedView style={styles.requestButtons}>
              <TouchableOpacity
                style={[
                  styles.requestButton,
                  { backgroundColor: Colors[theme].tint },
                  remainingDays.PLD <= 0 && styles.disabledButton,
                ]}
                onPress={() => onSubmit("PLD")}
                activeOpacity={0.7}
                disabled={remainingDays.PLD <= 0}
              >
                <ThemedText style={styles.requestButtonText}>
                  Request PLD {remainingDays.PLD <= 0 ? "(None Left)" : ""}
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.requestButton,
                  { backgroundColor: Colors[theme].tint },
                  remainingDays.SDV <= 0 && styles.disabledButton,
                ]}
                onPress={() => onSubmit("SDV")}
                activeOpacity={0.7}
                disabled={remainingDays.SDV <= 0}
              >
                <ThemedText style={styles.requestButtonText}>
                  Request SDV {remainingDays.SDV <= 0 ? "(None Left)" : ""}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <TouchableOpacity
              style={[styles.requestButton, styles.waitlistButton]}
              onPress={() => onSubmit("PLD")}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.requestButtonText}>Request Waitlist Spot</ThemedText>
            </TouchableOpacity>
          )}

          <ScrollView style={styles.requestList}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Current Requests:
            </ThemedText>
            {renderRequestList()}
          </ScrollView>

          <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={onClose} activeOpacity={0.7}>
            <ThemedText style={styles.modalButtonText}>Close</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

export default function CalendarScreen() {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const { user } = useAuth();
  const { selectedDate, requests, submitRequest, setSelectedDate, allotments, yearlyAllotments, error, setError } =
    useCalendarStore();
  const [isRequestDialogVisible, setIsRequestDialogVisible] = useState(false);

  // Force the date to be the actual current date, not system date
  const [currentDate, setCurrentDate] = useState("");
  // Add a key to force re-render
  const [calendarKey, setCalendarKey] = useState(0);

  // Get the actual server time on mount
  useEffect(() => {
    async function getServerTime() {
      try {
        const { data, error } = await supabase.rpc("get_server_timestamp");
        if (error) throw error;

        const serverDate = new Date(data);
        console.log("[CalendarScreen] Server date:", serverDate.toISOString());
        const formattedDate = format(serverDate, "yyyy-MM-dd", { timeZone: "UTC" });
        setCurrentDate(formattedDate);
      } catch (error) {
        console.error("[CalendarScreen] Error getting server time:", error);
        // Fallback to local time if server time fails
        const now = new Date();
        setCurrentDate(format(now, "yyyy-MM-dd", { timeZone: "UTC" }));
      }
    }
    getServerTime();
  }, []);

  // Log when currentDate changes
  useEffect(() => {
    console.log("[CalendarScreen] currentDate updated to:", currentDate);
  }, [currentDate]);

  // Set up realtime subscriptions and cleanup
  useEffect(() => {
    const subscription = setupCalendarSubscriptions();
    return () => {
      subscription.unsubscribe();
      // Clear selection when unmounting
      setSelectedDate(null);
    };
  }, []);

  // Clear selection when navigating away
  useEffect(() => {
    return () => {
      setSelectedDate(null);
    };
  }, []);

  const handleRequestSubmit = async (leaveType: "PLD" | "SDV") => {
    if (selectedDate) {
      try {
        await submitRequest(selectedDate, leaveType);
        setIsRequestDialogVisible(false);
        // Show success message using Alert
        if (Platform.OS === "web") {
          alert("Request submitted successfully");
        } else {
          Alert.alert("Success", "Request submitted successfully");
        }
      } catch (error) {
        // Show error message using Alert
        if (Platform.OS === "web") {
          alert(error instanceof Error ? error.message : "Failed to submit request");
        } else {
          Alert.alert("Error", error instanceof Error ? error.message : "Failed to submit request");
        }
      }
    }
  };

  const handleTodayPress = async () => {
    try {
      const { data, error } = await supabase.rpc("get_server_timestamp");
      if (error) throw error;

      const serverDate = new Date(data);
      const today = format(serverDate, "yyyy-MM-dd", { timeZone: "UTC" });
      console.log("[CalendarScreen] Today button pressed, setting date to:", today);
      // Clear the selection since today cannot be requested
      setSelectedDate(null);
      console.log("[CalendarScreen] Cleared selected date");
      // Update the current date and force calendar to re-render
      setCurrentDate(today);
      setCalendarKey((prev) => prev + 1);
    } catch (error) {
      console.error("[CalendarScreen] Error getting server time for Today button:", error);
      // Fallback to local time if server time fails
      const now = new Date();
      const today = format(now, "yyyy-MM-dd", { timeZone: "UTC" });
      setSelectedDate(null);
      setCurrentDate(today);
      setCalendarKey((prev) => prev + 1);
    }
  };

  const selectedDateRequests = selectedDate ? requests[selectedDate] || [] : [];
  const maxAllotment = selectedDate
    ? allotments[selectedDate] ?? yearlyAllotments[new Date(selectedDate).getFullYear()] ?? 6
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ThemedView style={styles.header}>
        <IconSymbol size={24} color={Colors[theme].text} name="calendar" style={styles.headerIcon} />
        <ThemedText type="title">PLD/SDV Calendar</ThemedText>
        <TouchableOpacity
          style={[styles.todayButton, { backgroundColor: Colors[theme].tint }]}
          onPress={handleTodayPress}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.todayButtonText}>Today</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <Calendar key={`calendar-${currentDate}-${calendarKey}`} current={currentDate} />

      {selectedDate && (
        <ThemedView style={styles.selectedDateInfo}>
          <ThemedText type="subtitle">Selected Date: {selectedDate}</ThemedText>
          <ThemedText>
            {selectedDateRequests.length}/{maxAllotment} spots filled
          </ThemedText>

          <TouchableOpacity
            style={[styles.requestButton, { backgroundColor: Colors[theme].tint }]}
            onPress={() => setIsRequestDialogVisible(true)}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.requestButtonText}>
              {selectedDateRequests.length >= maxAllotment ? "Request Waitlist Spot" : "Request Day Off"}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      <RequestDialog
        isVisible={isRequestDialogVisible}
        onClose={() => {
          setIsRequestDialogVisible(false);
          setError(null); // Clear any errors when closing the dialog
        }}
        onSubmit={handleRequestSubmit}
        selectedDate={selectedDate || ""}
        allotments={{
          max: maxAllotment,
          current: selectedDateRequests.length,
        }}
        requests={selectedDateRequests as unknown as RequestWithMember[]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 16,
    paddingBottom: 8,
  },
  headerIcon: {
    marginRight: 0,
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    marginLeft: 16,
  },
  todayButtonText: {
    color: "black",
    fontWeight: "600",
    fontSize: 14,
  },
  selectedDateInfo: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.2)",
    marginTop: 10,
    alignItems: "center",
  },
  requestButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    marginTop: 16,
  },
  requestButtonText: {
    color: "white",
    fontWeight: "600",
  },
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 20,
    minWidth: 300,
    maxWidth: "90%",
  },
  modalTitle: {
    marginBottom: 12,
    textAlign: "center",
  },
  modalMessage: {
    marginBottom: 20,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  confirmButton: {
    backgroundColor: Colors.light.tint,
  },
  modalButtonText: {
    fontWeight: "600",
  },
  requestSpot: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  spotNumber: {
    fontWeight: "600",
    marginRight: 10,
  },
  spotInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emptySpot: {
    color: "#666",
  },
  requestList: {
    maxHeight: 300,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  requestStatus: {
    fontWeight: "600",
  },
  allotmentInfo: {
    marginBottom: 10,
  },
  requestButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 16,
    gap: 16,
  },
  waitlistButton: {
    backgroundColor: "#FFC107",
  },
  remainingDaysInfo: {
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: "rgba(128, 128, 128, 0.5)",
  },
});
