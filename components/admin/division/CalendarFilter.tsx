import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import type { Calendar } from "@/types/calendar";

interface CalendarFilterProps {
  calendars: Calendar[];
  selectedCalendarId: string | null;
  onSelectCalendar: (calendarId: string | null) => void;
  style?: ViewStyle;
  isLoading?: boolean;
}

export function CalendarFilter({
  calendars,
  selectedCalendarId,
  onSelectCalendar,
  style,
  isLoading = false,
}: CalendarFilterProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const backgroundColor = Colors[colorScheme].card;
  const textColor = Colors[colorScheme].text;
  const selectedTextColor = Colors[colorScheme].background;
  const borderColor = Colors[colorScheme].border;

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, style]}>
        <ThemedText style={styles.title}>Filter by Calendar</ThemedText>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading calendars...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, style]}>
      <ThemedText style={styles.title}>Filter by Calendar</ThemedText>
      <ThemedView style={styles.calendarList}>
        {/* "All" button */}
        <TouchableOpacity
          style={[
            styles.calendarButton,
            { borderColor: borderColor, backgroundColor: backgroundColor },
            selectedCalendarId === null && { backgroundColor: tintColor, borderColor: tintColor },
          ]}
          onPress={() => onSelectCalendar(null)}
        >
          <ThemedText
            style={[
              styles.calendarText,
              { color: textColor },
              selectedCalendarId === null && { color: selectedTextColor },
            ]}
          >
            All Members
          </ThemedText>
        </TouchableOpacity>

        {/* Calendar buttons */}
        {calendars.map((calendar) => {
          const isSelected = selectedCalendarId === calendar.id;
          return (
            <TouchableOpacity
              key={calendar.id}
              style={[
                styles.calendarButton,
                { borderColor: borderColor, backgroundColor: backgroundColor },
                isSelected && { backgroundColor: tintColor, borderColor: tintColor },
              ]}
              onPress={() => onSelectCalendar(calendar.id)}
            >
              <ThemedText
                style={[styles.calendarText, { color: textColor }, isSelected && { color: selectedTextColor }]}
              >
                {calendar.name}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
    opacity: 0.8,
  },
  calendarList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  calendarButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  calendarText: {
    fontSize: 14,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    opacity: 0.8,
  },
});
