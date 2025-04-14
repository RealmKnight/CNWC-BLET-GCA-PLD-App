import React from "react";
import { Platform, StyleSheet, TextStyle, ViewStyle } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedTextInput } from "./ThemedTextInput";
import { format } from "date-fns";

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

  const handleChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      onDateChange(selectedDate);
    }
  };

  const formattedDate = date ? format(date, "yyyy-MM-dd") : "";

  // Create a merged style that doesn't use array syntax to avoid the CSS2Properties error
  const inputStyle: TextStyle = {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
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
    return (
      <ThemedTextInput
        style={inputStyle}
        value={formattedDate}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        type="date"
        onFocus={() => setShowPicker(true)}
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
      {showPicker && <DateTimePicker value={date || new Date()} mode={mode} onChange={handleChange} />}
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
