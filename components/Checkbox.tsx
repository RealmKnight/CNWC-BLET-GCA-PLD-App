import React from "react";
import { TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface CheckboxProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({ value, onValueChange, disabled = false }: CheckboxProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  return (
    <TouchableOpacity
      style={[styles.checkbox, value && styles.checked, disabled && styles.disabled, { borderColor: tintColor }]}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
    >
      {value && <Ionicons name="checkmark" size={16} color="#000000" />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    ...(Platform.OS === "web"
      ? {
          cursor: "pointer",
        }
      : {}),
  },
  checked: {
    backgroundColor: Colors.light.tint,
  },
  disabled: {
    opacity: 0.5,
    ...(Platform.OS === "web"
      ? {
          cursor: "not-allowed",
        }
      : {}),
  },
});
