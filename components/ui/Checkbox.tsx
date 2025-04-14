import React from "react";
import { TouchableOpacity, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Checkbox({ checked, onCheckedChange, disabled = false }: CheckboxProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];

  return (
    <TouchableOpacity
      onPress={() => !disabled && onCheckedChange(!checked)}
      style={[
        styles.container,
        {
          backgroundColor: checked ? colors.primary : "transparent",
          borderColor: checked ? colors.primary : colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      disabled={disabled}
    >
      {checked && <Ionicons name="checkmark" size={16} color="#fff" style={styles.checkmark} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    marginTop: 1, // Visual alignment
  },
});
