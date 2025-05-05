import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, ScrollView, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutUp, Layout } from "react-native-reanimated";
import { AssignOfficerPosition } from "./AssignOfficerPosition";
import { useOfficerPositions } from "@/hooks/useOfficerPositions";
import { router } from "expo-router";
import { format } from "date-fns";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import Toast from "react-native-toast-message";
import { supabase } from "@/utils/supabase";
import { Modal } from "@/components/ui/Modal";
import { DatePicker } from "@/components/DatePicker";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);
const isWeb = Platform.OS === "web";
const isIOS = Platform.OS === "ios";

// Combine all positions into a single array with required flag
const ALL_POSITIONS = [
  { title: "President", required: true },
  { title: "Vice-President", required: true },
  { title: "Secretary/Treasurer", required: true },
  { title: "Alternate Secretary/Treasurer", required: true },
  { title: "Legislative Representative", required: true },
  { title: "Alternate Legislative Representative", required: true },
  { title: "Local Chairman", required: true },
  { title: "First Vice-Local Chairman", required: true },
  { title: "Second Vice-Local Chairman", required: true },
  { title: "Third Vice-Local Chairman", required: false },
  { title: "Fourth Vice-Local Chairman", required: false },
  { title: "Fifth Vice-Local Chairman", required: false },
  { title: "Guide", required: true },
  { title: "Chaplain", required: true },
  { title: "Delegate to the National Division", required: true },
  { title: "First Alternate Delegate to the National Division", required: true },
  { title: "Second Alternate Delegate to the National Division", required: true },
  { title: "First Trustee", required: true },
  { title: "Second Trustee", required: true },
  { title: "Third Trustee", required: true },
  { title: "First Alternate Trustee", required: true },
  { title: "Second Alternate Trustee", required: true },
  { title: "Third Alternate Trustee", required: true },
] as const;

type OfficerPosition = (typeof ALL_POSITIONS)[number]["title"];

interface DivisionOfficersProps {
  division: string;
}

export function DivisionOfficers({ division }: DivisionOfficersProps) {
  const [expandedPosition, setExpandedPosition] = useState<OfficerPosition | null>(null);
  const [assignModalPosition, setAssignModalPosition] = useState<OfficerPosition | null>(null);
  const [currentOfficers, setCurrentOfficers] = useState<any[]>([]);
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<OfficerPosition | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { fetchCurrentOfficers } = useOfficerPositions({ division });

  useEffect(() => {
    loadCurrentOfficers();
  }, []);

  const loadCurrentOfficers = async () => {
    const officers = await fetchCurrentOfficers();
    setCurrentOfficers(officers);
  };

  const handlePositionPress = (position: OfficerPosition) => {
    setExpandedPosition(expandedPosition === position ? null : position);
  };

  const handleAssign = async (position: OfficerPosition) => {
    console.log("[DivisionOfficers] Opening assign modal for position:", position, "division:", division);
    if (isWeb) {
      setAssignModalPosition(position);
    } else {
      // For mobile platforms, navigate to the modal screen
      router.push({
        pathname: "/assign-officer",
        params: {
          position,
          division,
          updateDateOnly: currentOfficers.find((officer) => String(officer.position).trim() === String(position).trim())
            ? "true"
            : "false",
        },
      });
    }
  };

  const handleUpdateDate = (position: OfficerPosition) => {
    const currentOfficer = currentOfficers.find(
      (officer) => String(officer.position).trim() === String(position).trim()
    );
    if (currentOfficer) {
      // For the date picker, adjust the UTC date to local
      const date = new Date(currentOfficer.startDate);
      date.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
      setSelectedDate(date);
    } else {
      setSelectedDate(new Date());
    }
    setSelectedPosition(position);
    setDatePickerVisible(true);
  };

  const handleDateConfirm = async (date: Date) => {
    setDatePickerVisible(false);
    if (!selectedPosition) return;

    try {
      const currentOfficer = currentOfficers.find(
        (officer) => String(officer.position).trim() === String(selectedPosition).trim()
      );

      if (!currentOfficer) {
        throw new Error("No officer found for this position");
      }

      // Set the time to noon UTC to ensure consistent date storage
      const saveDate = new Date(date);
      saveDate.setUTCHours(12, 0, 0, 0);

      const { error } = await supabase
        .from("officer_positions")
        .update({ start_date: saveDate.toISOString() })
        .eq("member_pin", currentOfficer.memberPin)
        .eq("position", selectedPosition)
        .eq("division", division)
        .is("end_date", null);

      if (error) throw error;

      await loadCurrentOfficers();

      Toast.show({
        type: "success",
        text1: "Date Updated",
        text2: `Start date updated for ${selectedPosition}`,
        position: "bottom",
        visibilityTime: 3000,
      });
    } catch (error: any) {
      console.error("Error updating date:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error.message || "Failed to update start date",
        position: "bottom",
        visibilityTime: 3000,
      });
    }
  };

  const formatStartDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "MMM d, yyyy");
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  };

  const renderPositionItem = (position: (typeof ALL_POSITIONS)[number]) => {
    const isExpanded = expandedPosition === position.title;
    const iconName = isExpanded ? "chevron-up" : "chevron-down";
    const currentOfficer = currentOfficers.find(
      (officer) => String(officer.position).trim() === String(position.title).trim()
    );

    return (
      <Animated.View key={position.title} layout={Layout.springify()} entering={FadeIn} exiting={FadeOut}>
        <TouchableOpacityComponent
          style={[styles.positionItem, isExpanded && styles.selectedPosition]}
          onPress={() => handlePositionPress(position.title)}
          activeOpacity={0.7}
        >
          <View style={styles.positionHeader}>
            <View style={styles.positionTitleContainer}>
              <ThemedText style={[styles.positionText, isExpanded && styles.selectedPositionText]}>
                {position.title}
              </ThemedText>
              {!position.required && (
                <ThemedText style={[styles.optionalBadge, isExpanded && styles.selectedPositionText]}>
                  Optional
                </ThemedText>
              )}
            </View>
            <Ionicons name={iconName} size={20} color={isExpanded ? "#fff" : Colors[colorScheme].text} />
          </View>
        </TouchableOpacityComponent>

        {isExpanded && (
          <AnimatedThemedView entering={SlideInDown} exiting={SlideOutUp} style={styles.positionDetails}>
            {currentOfficer ? (
              <View style={styles.officerInfo}>
                <View style={styles.officerDetails}>
                  <ThemedText style={styles.officerName}>
                    {currentOfficer.firstName} {currentOfficer.lastName}
                  </ThemedText>
                  <ThemedText style={styles.officerPin}>PIN: {currentOfficer.memberPin}</ThemedText>
                  <ThemedText style={styles.officerStartDate}>
                    Since: {formatStartDate(currentOfficer.startDate)}
                  </ThemedText>
                </View>
                <View style={styles.buttonContainer}>
                  <TouchableOpacityComponent
                    style={[styles.actionButton, styles.updateDateButton]}
                    onPress={() => handleUpdateDate(position.title)}
                  >
                    <ThemedText style={styles.buttonText}>Update Start Date</ThemedText>
                  </TouchableOpacityComponent>
                  <TouchableOpacityComponent
                    style={[styles.actionButton, styles.changeButton]}
                    onPress={() => handleAssign(position.title)}
                  >
                    <ThemedText style={styles.buttonText}>Change</ThemedText>
                  </TouchableOpacityComponent>
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>No officer assigned</ThemedText>
                <TouchableOpacityComponent style={styles.assignButton} onPress={() => handleAssign(position.title)}>
                  <ThemedText style={styles.buttonText}>Assign</ThemedText>
                </TouchableOpacityComponent>
              </View>
            )}
          </AnimatedThemedView>
        )}
      </Animated.View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Division Officers</ThemedText>
      </ThemedView>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {ALL_POSITIONS.map(renderPositionItem)}
      </ScrollView>

      {/* Mobile date picker */}
      {!isWeb && (
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          onConfirm={handleDateConfirm}
          onCancel={() => setDatePickerVisible(false)}
          date={selectedDate}
          display={Platform.OS === "ios" ? "inline" : "default"}
        />
      )}

      {/* Web date picker modal */}
      {isWeb && isDatePickerVisible && (
        <Modal
          visible={true}
          onClose={() => setDatePickerVisible(false)}
          title={`Update Start Date - ${selectedPosition}`}
        >
          <View style={styles.webDatePickerContainer}>
            {/* Use DatePicker for consistent UX */}
            <DatePicker
              date={selectedDate}
              onDateChange={(date) => {
                if (date) setSelectedDate(date);
              }}
              mode="date"
              placeholder="Select date"
              style={{ marginBottom: 20, width: 200 }}
            />
            <View style={styles.webDatePickerButtons}>
              <TouchableOpacityComponent
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => setDatePickerVisible(false)}
              >
                <ThemedText style={styles.buttonText}>Cancel</ThemedText>
              </TouchableOpacityComponent>
              <TouchableOpacityComponent
                style={[styles.actionButton, styles.updateButton]}
                onPress={() => handleDateConfirm(selectedDate)}
              >
                <ThemedText style={styles.buttonText}>Update</ThemedText>
              </TouchableOpacityComponent>
            </View>
          </View>
        </Modal>
      )}

      {/* Only render the assign modal component on web */}
      {isWeb && assignModalPosition && (
        <AssignOfficerPosition
          position={assignModalPosition}
          division={division}
          onAssign={() => {
            setAssignModalPosition(null);
            loadCurrentOfficers();
          }}
          onCancel={() => setAssignModalPosition(null)}
          visible={true}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 8,
  },
  positionItem: {
    borderRadius: 8,
    borderColor: Colors.dark.border,
    borderWidth: 1,
    backgroundColor: Colors.dark.card,
    elevation: 1,
    shadowColor: Colors.dark.border,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  positionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  positionTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  positionText: {
    fontSize: 16,
    flex: 1,
  },
  optionalBadge: {
    fontSize: 12,
    color: Colors.dark.tint,
    backgroundColor: Colors.dark.tint + "20",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  selectedPosition: {
    backgroundColor: Colors.dark.tint,
    color: Colors.dark.buttonText,
  },
  selectedPositionText: {
    color: Colors.dark.buttonText,
  },
  positionDetails: {
    padding: 16,
    borderTopWidth: 1,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopColor: Colors.dark.border,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
    color: Colors.dark.text,
  },
  officerInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  officerDetails: {
    flex: 1,
  },
  officerName: {
    fontSize: 16,
    fontWeight: "600",
  },
  officerPin: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  officerStartDate: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 8,
  },
  emptyStateText: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "column",
    gap: 8,
    marginLeft: 16,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  updateDateButton: {
    backgroundColor: Colors.light.tint + "CC", // Slightly more transparent
  },
  changeButton: {
    backgroundColor: Colors.light.tint,
    color: Colors.dark.buttonText,
  },
  assignButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.dark.buttonText,
    fontSize: 14,
    fontWeight: "600",
  },
  webDatePickerContainer: {
    padding: 20,
    alignItems: "center",
  },
  webDatePicker: {
    marginBottom: 20,
  },
  webDatePickerButtons: {
    flexDirection: "row",
    gap: 16,
  },
  cancelButton: {
    backgroundColor: Colors.dark.buttonText,
    color: Colors.dark.buttonBackground,
  },
  updateButton: {
    backgroundColor: Colors.dark.buttonText,
    color: Colors.dark.buttonBackground,
  },
});
