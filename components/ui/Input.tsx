import React from "react";
import { TextInput, TextInputProps, StyleSheet, View } from "react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";

interface InputProps extends TextInputProps {
  error?: boolean;
}

export const Input = React.forwardRef<TextInput, InputProps>((props, ref) => {
  const { style, error, ...rest } = props;
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  return (
    <TextInput
      ref={ref}
      style={[
        styles.input,
        {
          borderColor: error ? themeColor.error : "rgba(0,0,0,0.1)",
          color: themeColor.text,
          backgroundColor: colorScheme === "dark" ? "#1F1F1F" : "#FFFFFF",
        },
        style,
      ]}
      placeholderTextColor={colorScheme === "dark" ? "#777777" : "#999999"}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});
