// components/admin/division/CalendarSelector.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Calendar } from "@/types/calendar"; // Import the Calendar type

interface CalendarSelectorProps {
  calendars: Calendar[];
  selectedCalendarId: string | null;
  onSelectCalendar: (calendarId: string | null) => void;
  disabled?: boolean;
  style?: ViewStyle; // Add style prop
}

export function CalendarSelector({
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  disabled = false,
  style,
}: CalendarSelectorProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const backgroundColor = Colors[colorScheme].card;
  const textColor = Colors[colorScheme].text;
  const selectedTextColor = Colors[colorScheme].background; // Or contrast color
  const borderColor = Colors[colorScheme].border;

  return (
    <ThemedView style={[styles.container, style]}>
      <ThemedText style={styles.title}>Select Calendar</ThemedText>
      <ThemedView style={styles.calendarList}>
        {calendars.map((calendar) => {
          const isSelected = selectedCalendarId === calendar.id;
          return (
            <TouchableOpacity
              key={calendar.id}
              style={[
                styles.calendarButton,
                { borderColor: borderColor, backgroundColor: backgroundColor },
                isSelected && { backgroundColor: tintColor, borderColor: tintColor },
                disabled && styles.disabledButton,
              ]}
              onPress={() => !disabled && onSelectCalendar(calendar.id)}
              disabled={disabled}
            >
              <ThemedText
                style={[styles.calendarText, { color: textColor }, isSelected && { color: selectedTextColor }]}
              >
                {calendar.name}
              </ThemedText>
              {/* Optional: Add indicator for inactive calendars */}
              {!calendar.is_active && <ThemedText style={styles.inactiveText}>(Inactive)</ThemedText>}
            </TouchableOpacity>
          );
        })}
        {/* Optional: Add a button to clear selection */}
        {/* <TouchableOpacity
                    style={[styles.calendarButton, { borderColor: borderColor, backgroundColor: backgroundColor }]}
                    onPress={() => !disabled && onSelectCalendar(null)}
                    disabled={disabled}
                >
                    <ThemedText style={[styles.calendarText, { color: textColor }]}>
                        None
                    </ThemedText>
                </TouchableOpacity> */}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.dark.border, // Adjust color
    backgroundColor: Colors.dark.card,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  calendarList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    backgroundColor: Colors.dark.card,
  },
  calendarButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20, // Pill shape
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  calendarText: {
    fontSize: 14,
  },
  inactiveText: {
    fontSize: 12,
    fontStyle: "italic",
    opacity: 0.7,
  },
});
