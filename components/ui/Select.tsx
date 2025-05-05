import React from "react";
import { StyleSheet, Platform, ViewStyle, TextStyle, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";

export interface SelectOption {
  label: string;
  value: string | number | null;
}

interface SelectProps {
  value: string | number | null;
  onValueChange: (value: string | number | null) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  error?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  label,
  disabled = false,
  error = false,
  style,
  textStyle,
}: SelectProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeColors = Colors[colorScheme];

  const containerStyle: ViewStyle = {
    borderWidth: 1,
    borderRadius: 8,
    borderColor: error ? themeColors.error : themeColors.border,
    backgroundColor: themeColors.background,
    opacity: disabled ? 0.6 : 1,
    overflow: "hidden",
    ...style,
  };

  // Web implementation
  if (Platform.OS === "web") {
    return (
      <View>
        {label && <ThemedText style={styles.label}>{label}</ThemedText>}
        <View style={[containerStyle, styles.webSelectContainer]}>
          <select
            value={value !== null ? String(value) : ""}
            onChange={(e) => {
              const selectedValue = e.target.value;
              // If the selected value is our placeholder empty value, pass null
              if (selectedValue === "") {
                onValueChange(null);
              } else {
                // Try to convert to number if it looks like one
                const numValue = Number(selectedValue);
                if (!isNaN(numValue) && String(numValue) === selectedValue) {
                  onValueChange(numValue);
                } else {
                  onValueChange(selectedValue);
                }
              }
            }}
            disabled={disabled}
            style={
              {
                width: "100%",
                height: "100%",
                padding: 8,
                backgroundColor: Colors.dark.card,
                color: themeColors.text,
                border: "none",
                outline: "none",
                appearance: "none",
                fontSize: 16,
                ...textStyle,
              } as React.CSSProperties
            }
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={String(option.value)} value={option.value !== null ? String(option.value) : ""}>
                {option.label}
              </option>
            ))}
          </select>
          <Ionicons name="chevron-down" size={16} color={themeColors.text} style={styles.webSelectIcon} />
        </View>
        {error && <ThemedText style={styles.errorText}>Please select a valid option</ThemedText>}
      </View>
    );
  }

  // Native implementation (iOS/Android)
  return (
    <View>
      {label && <ThemedText style={styles.label}>{label}</ThemedText>}
      <View style={containerStyle}>
        <Picker
          selectedValue={value}
          onValueChange={onValueChange}
          enabled={!disabled}
          mode="dropdown"
          dropdownIconColor={themeColors.text}
          style={[
            styles.picker,
            {
              color: themeColors.text,
              backgroundColor: Colors.dark.card,
            },
            textStyle,
          ]}
          itemStyle={styles.pickerItem}
        >
          <Picker.Item label={placeholder} value={null} />
          {options.map((option) => (
            <Picker.Item key={String(option.value)} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
      {error && <ThemedText style={styles.errorText}>Please select a valid option</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  picker: {
    ...Platform.select({
      android: {
        height: 50,
        width: "100%",
        backgroundColor: Colors.dark.card,
      },
      ios: {
        height: 150,
        width: "100%",
        backgroundColor: Colors.dark.card,
      },
      default: {
        height: 40,
        width: "100%",
        backgroundColor: Colors.dark.card,
      },
    }),
  },
  pickerItem: {
    fontSize: 16,
    height: 120,
  },
  webSelectContainer: {
    position: "relative",
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  webSelectIcon: {
    position: "absolute",
    right: 12,
    pointerEvents: "none",
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 14,
    marginTop: 4,
  },
});
