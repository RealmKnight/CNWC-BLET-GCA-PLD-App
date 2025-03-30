import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface TextProps extends RNTextProps {
  dim?: boolean;
}

export function Text({ style, dim, ...props }: TextProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  return (
    <RNText
      style={[
        {
          color: dim ? Colors[colorScheme].textDim : Colors[colorScheme].text,
        },
        style,
      ]}
      {...props}
    />
  );
}
