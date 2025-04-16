import React, { useEffect, useCallback, memo } from "react";
import { StyleSheet, Modal, ViewStyle, TextStyle, ScrollView } from "react-native";
import { format, addDays } from "date-fns";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { WeekRequest, WeekAllotment } from "@/store/vacationCalendarStore";
import { TouchableOpacityComponent } from "./TouchableOpacityComponent";

type ColorScheme = keyof typeof Colors;

interface VacationWeekDialogProps {
  isVisible: boolean;
  onClose: () => void;
  weekStartDate: string;
  allotment: WeekAllotment;
  requests: WeekRequest[];
}

// Use React.memo to prevent unnecessary re-renders
const VacationWeekDialog = memo(function VacationWeekDialog({
  isVisible,
  onClose,
  weekStartDate,
  allotment,
  requests,
}: VacationWeekDialogProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;

  // Make onClose callback stable to prevent unnecessary re-renders
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Log dialog data for debugging
  useEffect(() => {
    if (isVisible) {
      console.log("[VacationWeekDialog] Dialog data:", {
        weekStartDate,
        allotment: {
          max: allotment.max_allotment,
          current: allotment.current_requests,
        },
        actualRequests: requests.length,
      });
    }
  }, [isVisible, weekStartDate, allotment, requests]);

  // Use consistent date parsing to avoid timezone issues
  const formatDateDisplay = (dateString: string) => {
    // Create date with explicit time part to avoid date shift due to timezone
    const date = new Date(`${dateString}T12:00:00`);
    return format(date, "MMM d, yyyy");
  };

  // Calculate start and end date displays consistently
  const weekStartDisplay = formatDateDisplay(weekStartDate);
  const weekEnd = addDays(new Date(`${weekStartDate}T12:00:00`), 6);
  const weekEndDisplay = format(weekEnd, "MMM d, yyyy");

  // Log the date calculations for debugging
  useEffect(() => {
    if (isVisible) {
      console.log("[VacationWeekDialog] Date calculations:", {
        originalWeekStart: weekStartDate,
        formattedStart: weekStartDisplay,
        formattedEnd: weekEndDisplay,
      });
    }
  }, [isVisible, weekStartDate, weekStartDisplay, weekEndDisplay]);

  // Use the actual request count from our requests array for display
  const actualRequestCount = requests.length;
  const remainingSpots = Math.max(0, allotment.max_allotment - actualRequestCount);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      // Ensure dialog doesn't cause parent component to re-render
      hardwareAccelerated
    >
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={[styles.modalContent, { backgroundColor: Colors[theme].background }]}>
          <ThemedText style={styles.modalTitle}>
            Vacation Week: {weekStartDisplay} - {weekEndDisplay}
          </ThemedText>

          <ThemedView style={styles.allotmentContainer}>
            <ThemedText style={styles.allotmentInfo}>
              {actualRequestCount}/{allotment.max_allotment} spots filled
            </ThemedText>
          </ThemedView>

          <ScrollView style={styles.requestList}>
            {/* Show filled spots first */}
            {requests.map((request) => (
              <ThemedView key={request.id} style={[styles.requestSpot, { backgroundColor: Colors[theme].card }]}>
                <ThemedText style={styles.spotNumber}>#{request.member.spot_number}</ThemedText>
                <ThemedView style={styles.spotInfo}>
                  <ThemedText>
                    {request.member.first_name} {request.member.last_name}
                  </ThemedText>
                  <ThemedText style={[styles.pinNumber, { color: Colors[theme].textDim }]}>
                    PIN: {request.member.pin_number}
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            ))}

            {/* Then show remaining available spots */}
            {remainingSpots > 0 &&
              Array.from({ length: remainingSpots }).map((_, index) => (
                <ThemedView
                  key={`empty-${index}`}
                  style={[styles.requestSpot, { backgroundColor: Colors[theme].card }]}
                >
                  <ThemedText style={styles.spotNumber}>#{actualRequestCount + index + 1}</ThemedText>
                  <ThemedText style={[styles.emptySpot, { color: Colors[theme].success }]}>Available</ThemedText>
                </ThemedView>
              ))}
          </ScrollView>

          <ThemedView style={styles.modalButtons}>
            <TouchableOpacityComponent
              style={[styles.modalButton, { backgroundColor: Colors[theme].border }]}
              onPress={handleClose}
            >
              <ThemedText style={styles.modalButtonText}>Close</ThemedText>
            </TouchableOpacityComponent>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
});

export { VacationWeekDialog };

const styles = StyleSheet.create({
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
  } as ViewStyle,
  modalContent: {
    padding: 20,
    borderRadius: 10,
    width: "90%",
    maxWidth: 500,
    maxHeight: "90%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  } as ViewStyle,
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  } as TextStyle,
  modalButtons: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
    marginTop: 16,
  } as ViewStyle,
  modalButton: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  } as ViewStyle,
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  } as TextStyle,
  allotmentContainer: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 10,
  } as ViewStyle,
  allotmentInfo: {
    fontSize: 16,
    fontWeight: "500",
  } as TextStyle,
  requestList: {
    width: "100%",
    maxHeight: "60%",
    marginVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.dark.border,
  } as ViewStyle,
  requestSpot: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginVertical: 2,
    borderRadius: 8,
  } as ViewStyle,
  spotNumber: {
    marginRight: 12,
    fontWeight: "bold",
    minWidth: 25,
    textAlign: "right",
  } as TextStyle,
  spotInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  } as ViewStyle,
  pinNumber: {
    fontSize: 14,
  } as TextStyle,
  emptySpot: {
    flex: 1,
    fontStyle: "italic",
  } as TextStyle,
});
