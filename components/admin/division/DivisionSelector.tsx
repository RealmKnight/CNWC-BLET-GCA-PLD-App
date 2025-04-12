import React, { useState, useEffect } from "react";
import { StyleSheet, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { supabase } from "@/utils/supabase";

interface DivisionSelectorProps {
  currentDivision: string;
  onDivisionChange: (division: string) => void;
  isAdmin?: boolean;
  disabled?: boolean;
}

export function DivisionSelector({
  currentDivision,
  onDivisionChange,
  isAdmin = false,
  disabled = false,
}: DivisionSelectorProps) {
  const [divisions, setDivisions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  useEffect(() => {
    async function fetchDivisions() {
      try {
        const { data, error } = await supabase.from("divisions").select("name").order("name");

        if (error) throw error;

        const divisionNames = data.map((d) => d.name);
        setDivisions(divisionNames);
      } catch (error) {
        console.error("Error fetching divisions:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisions();
  }, []);

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.divisionText}>{currentDivision}</ThemedText>
      </ThemedView>
    );
  }

  if (Platform.OS === "web") {
    return (
      <select
        value={currentDivision}
        onChange={(e) => onDivisionChange(e.target.value)}
        disabled={disabled || isLoading}
        style={{
          padding: "8px 12px",
          fontSize: 16,
          borderRadius: 8,
          borderColor: Colors[colorScheme].border,
          backgroundColor: Colors[colorScheme].background,
          color: Colors[colorScheme].text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {divisions.map((division) => (
          <option key={division} value={division}>
            {division}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Picker
      selectedValue={currentDivision}
      onValueChange={onDivisionChange}
      enabled={!disabled && !isLoading}
      style={[
        styles.picker,
        {
          color: Colors[colorScheme].text,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {divisions.map((division) => (
        <Picker.Item key={division} label={division} value={division} />
      ))}
    </Picker>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divisionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  picker: {
    height: 40,
    minWidth: 150,
  },
});
