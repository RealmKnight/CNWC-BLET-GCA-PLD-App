import React, { useState, useMemo } from "react";
import { Modal, StyleSheet, useWindowDimensions, Platform } from "react-native";
import { useColorScheme } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { Feather } from "@expo/vector-icons";
import { ClientOnlyDatePicker } from "@/components/ClientOnlyDatePicker";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { parseISO } from "date-fns";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface PaidInLieuModalProps {
  isVisible: boolean;
  onConfirm: (type: "PLD" | "SDV", date: Date) => void;
  onCancel: () => void;
  stats: {
    available: {
      pld: number;
      sdv: number;
    };
  } | null;
  minDate: string;
  maxDate: string;
}

export function PaidInLieuModal({ isVisible, onConfirm, onCancel, stats, minDate, maxDate }: PaidInLieuModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [selectedType, setSelectedType] = useState<"PLD" | "SDV" | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const colorScheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isMobileWeb = Platform.OS === "web" && width < 768;
  const isSmallDevice = width < 375;

  // Parse the ISO date strings to Date objects for the date picker
  const parsedMinDate = useMemo(() => (minDate ? parseISO(minDate) : null), [minDate]);
  const parsedMaxDate = useMemo(() => (maxDate ? parseISO(maxDate) : null), [maxDate]);

  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  const handleConfirm = () => {
    if (!selectedType || !selectedDate) return;
    onConfirm(selectedType, selectedDate);
  };

  // Calculate dynamic padding based on platform and device size
  const dynamicPadding = Platform.select({
    ios: isSmallDevice ? 16 : 24,
    android: isSmallDevice ? 16 : 20,
    web: isMobileWeb ? 16 : 24,
  });

  // Platform specific button height
  const buttonHeight = Platform.select({
    ios: 44,
    android: 48,
    web: isMobileWeb ? 40 : 44,
  });

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCancel}>
      <ThemedView
        style={[
          styles.modalContainer,
          {
            paddingTop: Platform.OS === "ios" ? insets.top : 0,
            paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <ThemedView
          style={[
            styles.modalContent,
            isMobileWeb && styles.modalContentMobile,
            isSmallDevice && styles.modalContentSmall,
            { padding: dynamicPadding },
          ]}
        >
          <ThemedText style={[styles.modalTitle, isSmallDevice && styles.modalTitleSmall]}>
            Request Paid in Lieu
          </ThemedText>
          <ThemedText style={[styles.modalDescription, isSmallDevice && styles.modalDescriptionSmall]}>
            Select the type of day and date you want to request payment for:
          </ThemedText>

          {/* Date range info message */}
          {parsedMinDate && parsedMaxDate && (
            <ThemedView style={styles.infoContainer}>
              <Feather name="info" size={isSmallDevice ? 16 : 18} color={Colors[colorScheme ?? "light"].tint} />
              <ThemedText style={[styles.infoMessageText, isSmallDevice && { fontSize: 13 }]}>
                Date must be between {parsedMinDate.toLocaleDateString()} and {parsedMaxDate.toLocaleDateString()}
              </ThemedText>
            </ThemedView>
          )}

          {/* Warning messages */}
          {stats && stats.available.pld <= 0 && stats.available.sdv <= 0 && (
            <ThemedView style={styles.warningContainer}>
              <Feather
                name="alert-triangle"
                size={isSmallDevice ? 16 : 18}
                color={Colors[colorScheme ?? "light"].warning}
              />
              <ThemedText style={[styles.warningMessageText, isSmallDevice && { fontSize: 13 }]}>
                You don't have any available days to request payment for.
              </ThemedText>
            </ThemedView>
          )}

          {/* Type selection */}
          <ThemedView style={[styles.typeButtonsContainer, isSmallDevice && { gap: 6 }]}>
            <ThemedTouchableOpacity
              style={[
                styles.typeButton,
                selectedType === "PLD" && styles.selectedTypeButton,
                stats && stats.available.pld <= 0 && styles.disabledButton,
                { height: buttonHeight },
                isSmallDevice && { minWidth: 80, paddingHorizontal: 16 },
              ]}
              onPress={() => setSelectedType("PLD")}
              disabled={stats ? stats.available.pld <= 0 : false}
              accessibilityLabel={`PLD: ${stats?.available.pld || 0} available days`}
              accessibilityRole="button"
              accessibilityState={{
                disabled: stats ? stats.available.pld <= 0 : false,
                selected: selectedType === "PLD",
              }}
            >
              <ThemedText
                style={[
                  styles.typeButtonText,
                  selectedType === "PLD" && styles.selectedTypeButtonText,
                  stats && stats.available.pld <= 0 && styles.disabledButtonText,
                  isSmallDevice && { fontSize: 14 },
                ]}
              >
                PLD ({stats?.available.pld || 0})
              </ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[
                styles.typeButton,
                selectedType === "SDV" && styles.selectedTypeButton,
                stats && stats.available.sdv <= 0 && styles.disabledButton,
                { height: buttonHeight },
                isSmallDevice && { minWidth: 80, paddingHorizontal: 16 },
              ]}
              onPress={() => setSelectedType("SDV")}
              disabled={stats ? stats.available.sdv <= 0 : false}
              accessibilityLabel={`SDV: ${stats?.available.sdv || 0} available days`}
              accessibilityRole="button"
              accessibilityState={{
                disabled: stats ? stats.available.sdv <= 0 : false,
                selected: selectedType === "SDV",
              }}
            >
              <ThemedText
                style={[
                  styles.typeButtonText,
                  selectedType === "SDV" && styles.selectedTypeButtonText,
                  stats && stats.available.sdv <= 0 && styles.disabledButtonText,
                  isSmallDevice && { fontSize: 14 },
                ]}
              >
                SDV ({stats?.available.sdv || 0})
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>

          {/* Date picker */}
          <ThemedView style={styles.datePickerContainer}>
            <ClientOnlyDatePicker
              date={selectedDate}
              onDateChange={setSelectedDate}
              mode="date"
              placeholder="Select date for paid in lieu"
              minDate={parsedMinDate || undefined}
              maxDate={parsedMaxDate || undefined}
              accessibilityLabel="Select the date you want to request paid in lieu for"
              accessibilityHint="Opens a date picker to select a date within two weeks of today"
              disabled={!selectedType}
              style={Platform.select({
                ios: styles.iosDatePicker,
                android: styles.androidDatePicker,
                web: isMobileWeb ? styles.webMobileDatePicker : styles.webDatePicker,
              })}
              textStyle={isSmallDevice ? { fontSize: 14 } : undefined}
            />
          </ThemedView>

          {/* Action buttons */}
          <ThemedView style={[styles.modalButtonsContainer, isSmallDevice && { gap: 8 }]}>
            <ThemedTouchableOpacity
              style={[
                styles.cancelButton,
                { height: buttonHeight },
                isSmallDevice && { minWidth: 100, paddingHorizontal: 16 },
              ]}
              onPress={onCancel}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <ThemedText style={[styles.cancelButtonText, isSmallDevice && { fontSize: 14 }]}>Cancel</ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              style={[
                styles.confirmButton,
                { height: buttonHeight },
                isSmallDevice && { minWidth: 140, paddingHorizontal: 16 },
                (!selectedType ||
                  !selectedDate ||
                  (stats && selectedType === "PLD" && stats.available.pld <= 0) ||
                  (stats && selectedType === "SDV" && stats.available.sdv <= 0)) &&
                  styles.disabledButton,
              ]}
              onPress={handleConfirm}
              disabled={
                !selectedType ||
                !selectedDate ||
                (stats
                  ? selectedType === "PLD"
                    ? stats.available.pld <= 0
                    : selectedType === "SDV"
                    ? stats.available.sdv <= 0
                    : false
                  : false)
              }
              accessibilityLabel="Request Payment"
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  !selectedType ||
                  !selectedDate ||
                  (stats
                    ? selectedType === "PLD"
                      ? stats.available.pld <= 0
                      : selectedType === "SDV"
                      ? stats.available.sdv <= 0
                      : false
                    : false),
              }}
            >
              <ThemedText style={[styles.confirmButtonText, isSmallDevice && { fontSize: 14 }]}>
                Request Payment
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 24,
    width: "90%",
    maxWidth: Platform.select({
      ios: 400,
      android: 380,
      web: 400,
    }),
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalContentMobile: {
    padding: 16,
    width: "95%",
  },
  modalContentSmall: {
    padding: 12,
    width: "95%",
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  modalTitleSmall: {
    fontSize: 16,
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  modalDescriptionSmall: {
    fontSize: 14,
    marginBottom: 16,
  },
  typeButtonsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    width: "100%",
    gap: 8,
    backgroundColor: Colors.dark.card,
  },
  typeButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  selectedTypeButton: {
    backgroundColor: Colors.dark.primary,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  selectedTypeButtonText: {
    color: Colors.dark.buttonText,
  },
  disabledButtonText: {
    opacity: 0.5,
  },
  datePickerContainer: {
    width: "100%",
    marginBottom: 24,
  },
  iosDatePicker: {
    height: 44,
  },
  androidDatePicker: {
    height: 48,
  },
  webDatePicker: {
    height: 44,
  },
  webMobileDatePicker: {
    height: 40,
  },
  modalButtonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
    backgroundColor: Colors.dark.card,
  },
  cancelButton: {
    backgroundColor: Colors.dark.background,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelButtonText: {
    fontSize: 16,
  },
  confirmButton: {
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmButtonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.5,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
  },
  warningMessageText: {
    marginLeft: 8,
    fontSize: 14,
  },
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: Colors.dark.background,
    borderColor: Colors.dark.border,
    borderWidth: 1,
  },
  infoMessageText: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.dark.text,
  },
});
