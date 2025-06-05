import React from "react";
import { TextInput, StyleSheet, TextStyle, ViewStyle, Platform, TextInputProps } from "react-native";
import { useColorScheme } from "@/hooks/useColorScheme";

interface ThemedTextInputProps extends Omit<TextInputProps, "style"> {
  containerStyle?: ViewStyle;
  style?: TextStyle;
  type?: "text" | "date" | "number";
}

export function ThemedTextInput({ containerStyle, style, type = "text", ...props }: ThemedTextInputProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const inputStyle = {
    ...styles.input,
    backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
    color: isDark ? "#ffffff" : "#000000",
    borderColor: isDark ? "#404040" : "#e0e0e0",
  };

  if (Platform.OS === "web") {
    // Convert the style object to a flat object with proper CSS property names
    const webStyle = {
      height: inputStyle.height,
      borderWidth: inputStyle.borderWidth,
      borderRadius: inputStyle.borderRadius,
      paddingLeft: inputStyle.paddingHorizontal,
      paddingRight: inputStyle.paddingHorizontal,
      fontSize: inputStyle.fontSize,
      backgroundColor: inputStyle.backgroundColor,
      color: inputStyle.color,
      borderColor: inputStyle.borderColor,
      ...(style && typeof style === "object" ? flattenStyle(style) : {}),
    };

    // Extract onChangeText and other RN-specific props from props for web
    const {
      onChangeText,
      multiline,
      numberOfLines,
      placeholderTextColor,
      textAlignVertical,
      keyboardType,
      editable,
      ...restProps
    } = props;

    // Handle the editable prop conversion for web
    const webProps = {
      ...restProps,
      ...(editable === false ? { disabled: true } : {}),
    };

    // Define the web onChange handler
    const handleWebChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (onChangeText) {
        onChangeText(event.target.value);
      }
    };

    return (
      <input type={type} className="themed-input" style={webStyle} onChange={handleWebChange} {...(webProps as any)} />
    );
  }

  return <TextInput style={[inputStyle, style]} placeholderTextColor={isDark ? "#808080" : "#a0a0a0"} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});

// Helper function to flatten nested style objects and handle arrays
function flattenStyle(style: any): any {
  if (!style) return {};

  // If it's an array, merge all objects in the array
  if (Array.isArray(style)) {
    return style.reduce((acc, curr) => ({ ...acc, ...flattenStyle(curr) }), {});
  }

  // For web, we need to convert specific React Native styles to web CSS
  const result: any = {};

  Object.keys(style).forEach((key) => {
    const value = style[key];

    // Handle specific RN to web conversions
    if (key === "paddingHorizontal") {
      result.paddingLeft = value;
      result.paddingRight = value;
    } else if (key === "marginHorizontal") {
      result.marginLeft = value;
      result.marginRight = value;
    } else if (key === "paddingVertical") {
      result.paddingTop = value;
      result.paddingBottom = value;
    } else if (key === "marginVertical") {
      result.marginTop = value;
      result.marginBottom = value;
    } else if (key === "textAlignVertical") {
      // Skip this prop for web as it's not supported in CSS
    } else {
      // Direct property mapping
      result[key] = value;
    }
  });

  return result;
}
