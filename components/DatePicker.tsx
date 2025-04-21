import React from "react";
import { Platform, StyleSheet, TextStyle, ViewStyle } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedTextInput } from "./ThemedTextInput";
import { format, parseISO } from "date-fns";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface DatePickerProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function DatePicker({
  date,
  onDateChange,
  mode = "date",
  placeholder = "Select date",
  style,
  textStyle,
}: DatePickerProps) {
  const [showPicker, setShowPicker] = React.useState(false);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  const handleChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      onDateChange(selectedDate);
    }
  };

  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";

  // Create a merged style that includes theme-based styles
  const defaultStyles: TextStyle = {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: Colors[colorScheme].text,
    borderColor: Colors[colorScheme].border,
    backgroundColor: Colors[colorScheme].background,
  };

  // Merge with passed styles, giving priority to passed styles
  const inputStyle: TextStyle = {
    ...defaultStyles,
    ...(textStyle || {}),
    ...((style as TextStyle) || {}),
  };

  // Handle text input changes (this will be called when user types in web input)
  const handleTextChange = (text: string) => {
    // For web, we'll let the native date input handle changes
    if (Platform.OS === "web") {
      return;
    }
    // For mobile, we don't want to allow direct text input
    setShowPicker(true);
  };

  if (Platform.OS === "web") {
    // For web, we'll use a direct HTML input element with the appropriate props
    const webInputStyle = {
      ...inputStyle,
      padding: "0 12px",
      fontFamily: "inherit",
      boxSizing: "border-box" as "border-box",
    };

    return (
      <input
        type="date"
        style={webInputStyle as any}
        value={formattedDate}
        onChange={(e) => {
          const dateValue = e.target.value;
          if (dateValue) {
            // Create a date object that's timezone-safe for date-only values
            // parseISO creates a date in the local timezone
            const parsedDate = parseISO(dateValue);

            // For date-only values, we want midnight in the user's timezone
            // This ensures the date they pick is the date they get, regardless of timezone
            const selectedDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());

            onDateChange(selectedDate);
          } else {
            onDateChange(null);
          }
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <>
      <ThemedTextInput
        style={inputStyle}
        value={formattedDate}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        onFocus={() => setShowPicker(true)}
        editable={false} // Make input read-only on mobile
      />
      {showPicker && (
        <DateTimePicker
          value={date || new Date()}
          mode={mode}
          onChange={handleChange}
          textColor={Colors[colorScheme].text}
          themeVariant={colorScheme}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
});
