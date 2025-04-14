import React from "react";
import { TouchableOpacity, StyleSheet, Platform } from "react-native";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";

interface ButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ onPress, children, disabled = false, variant = "primary" }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, styles[variant], disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <ThemedText style={[styles.text, disabled && styles.disabledText]}>{children}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
    ...(Platform.OS === "web"
      ? {
          cursor: "pointer",
        }
      : {}),
  },
  primary: {
    backgroundColor: Colors.light.tint,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  danger: {
    backgroundColor: Colors.light.error,
  },
  disabled: {
    opacity: 0.5,
    ...(Platform.OS === "web"
      ? {
          cursor: "not-allowed",
        }
      : {}),
  },
  text: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "500",
  },
  disabledText: {
    color: Colors.light.secondary,
  },
});
