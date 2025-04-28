import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  TextStyle,
  ViewStyle,
  View,
  Modal,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, parseISO } from "date-fns";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "./ThemedText";

interface DatePickerProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export function DatePicker({
  date,
  onDateChange,
  mode = "date",
  placeholder = "Select date",
  style,
  textStyle,
  disabled = false,
}: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [webTempDate, setWebTempDate] = useState<string>("");
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobileWeb = Platform.OS === "web" && width < 768;

  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";

  // Themed styles
  const defaultViewStyle: ViewStyle = {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors[colorScheme].background,
    borderColor: Colors[colorScheme].border,
    flexDirection: "row",
    alignItems: "center",
    opacity: disabled ? 0.6 : 1,
  };
  const defaultTextStyle: TextStyle = {
    fontSize: 16,
    color: Colors[colorScheme].text,
  };
  const viewStyle: ViewStyle = {
    ...defaultViewStyle,
    ...(style || {}),
  };
  const mergedTextStyle: TextStyle = {
    ...defaultTextStyle,
    ...(textStyle || {}),
  };

  // --- Web Implementation ---
  if (Platform.OS === "web") {
    // On all web (desktop and mobile): use a styled, custom input with a clickable icon that opens a modal
    return (
      <>
        <TouchableOpacity
          style={[viewStyle, { flexDirection: "row", justifyContent: "space-between" }]}
          onPress={() => !disabled && setShowPicker(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
          disabled={disabled}
        >
          <ThemedText
            style={{
              ...mergedTextStyle,
              color: formattedDate ? Colors[colorScheme].text : Colors[colorScheme].textDim,
            }}
          >
            {formattedDate || placeholder}
          </ThemedText>
          <Ionicons name="calendar-outline" size={20} color={Colors[colorScheme].icon} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: Colors[colorScheme].background, borderColor: Colors[colorScheme].border },
              ]}
            >
              <ThemedText style={styles.modalTitle}>{placeholder}</ThemedText>
              <input
                type="date"
                value={webTempDate || formattedDate}
                onChange={(e) => setWebTempDate(e.target.value)}
                style={{
                  color: Colors[colorScheme].text,
                  background: Colors[colorScheme].background,
                  border: `1px solid ${Colors[colorScheme].border}`,
                  borderRadius: 6,
                  padding: 12,
                  fontSize: 16,
                  width: "100%",
                  marginBottom: 16,
                  fontFamily: "inherit",
                }}
                aria-label={placeholder}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { borderColor: Colors[colorScheme].border }]}
                  onPress={() => {
                    setShowPicker(false);
                    setWebTempDate("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <ThemedText>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: Colors[colorScheme].tint }]}
                  onPress={() => {
                    if (webTempDate) {
                      const parsedDate = parseISO(webTempDate);
                      const selectedDate = new Date(
                        parsedDate.getFullYear(),
                        parsedDate.getMonth(),
                        parsedDate.getDate()
                      );
                      onDateChange(selectedDate);
                    }
                    setShowPicker(false);
                    setWebTempDate("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Apply"
                >
                  <ThemedText style={{ color: Colors[colorScheme].background }}>Apply</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // --- Native (iOS/Android) Implementation ---
  return (
    <>
      <TouchableOpacity
        style={[viewStyle, { flexDirection: "row", justifyContent: "space-between" }]}
        onPress={() => !disabled && setShowPicker(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        disabled={disabled}
      >
        <ThemedText
          style={{ ...mergedTextStyle, color: formattedDate ? Colors[colorScheme].text : Colors[colorScheme].textDim }}
        >
          {formattedDate || placeholder}
        </ThemedText>
        <Ionicons name="calendar-outline" size={20} color={Colors[colorScheme].icon} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={date || new Date()}
          mode={mode}
          onChange={(_event, selectedDate) => {
            setShowPicker(false);
            if (selectedDate) onDateChange(selectedDate);
          }}
          textColor={Colors[colorScheme].text}
          themeVariant={colorScheme}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    width: "90%",
    maxWidth: 400,
    alignItems: "center",
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 16,
    textAlign: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 16,
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
});
