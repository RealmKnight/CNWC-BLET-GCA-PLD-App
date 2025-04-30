import React, { useState } from "react";
import { DatePicker } from "./DatePicker";
import { StyleSheet, ViewStyle, TextStyle } from "react-native";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

interface ClientOnlyDatePickerProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  mode?: "date" | "time" | "datetime";
  placeholder?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function ClientOnlyDatePicker({
  date,
  onDateChange,
  mode = "date",
  placeholder = "Select date",
  style,
  textStyle,
  disabled = false,
  minDate,
  maxDate,
  accessibilityLabel,
  accessibilityHint,
}: ClientOnlyDatePickerProps) {
  const [isMounted, setIsMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Return an empty placeholder with the same dimensions during SSR
    return (
      <div
        style={{
          height: (style as any)?.height || 40,
          width: "100%",
          borderWidth: 1,
          borderRadius: 8,
          opacity: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <DatePicker
      date={date}
      onDateChange={onDateChange}
      mode={mode}
      placeholder={placeholder}
      style={style}
      textStyle={textStyle}
      disabled={disabled}
      minDate={minDate}
      maxDate={maxDate}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 40,
    width: "100%",
    borderWidth: 1,
    borderRadius: 8,
  },
});
