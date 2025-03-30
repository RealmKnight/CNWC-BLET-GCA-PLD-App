import React from "react";
import { TouchableOpacity, TouchableOpacityProps, StyleSheet } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Text } from "./Text";

interface ButtonProps extends TouchableOpacityProps {
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}

export function Button({ style, variant = "primary", children, disabled, ...props }: ButtonProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];

  const buttonStyle =
    variant === "primary"
      ? {
          backgroundColor: disabled ? colors.buttonBackground + "80" : colors.buttonBackground,
          borderColor: colors.buttonBorder,
        }
      : {
          backgroundColor: colors.buttonBackgroundSecondary,
          borderColor: colors.buttonBorderSecondary,
        };

  const textColor = variant === "primary" ? colors.buttonText : colors.buttonTextSecondary;

  return (
    <TouchableOpacity
      style={[styles.button, buttonStyle, disabled && styles.disabled, style]}
      disabled={disabled}
      {...props}
    >
      <Text style={[styles.text, { color: textColor }]}>{children}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});
