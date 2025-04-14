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
        console.log("[DivisionSelector] Fetching divisions...");
        const { data, error } = await supabase.from("divisions").select("name").order("name");

        if (error) {
          console.error("[DivisionSelector] Error fetching divisions:", error);
          throw error;
        }

        if (!data || data.length === 0) {
          console.warn("[DivisionSelector] No divisions found");
          setDivisions([]);
          return;
        }

        const divisionNames = data.map((d) => d.name);
        console.log("[DivisionSelector] Fetched divisions:", {
          count: divisionNames.length,
          names: divisionNames,
          currentDivision,
        });
        setDivisions(divisionNames);
      } catch (error) {
        console.error("[DivisionSelector] Error in fetchDivisions:", error);
        setDivisions([]); // Reset to empty array on error
      } finally {
        setIsLoading(false);
      }
    }

    fetchDivisions();
  }, []); // Remove currentDivision from dependency array

  useEffect(() => {
    console.log("[DivisionSelector] State update:", {
      currentDivision,
      availableDivisions: divisions,
      isLoading,
      isAdmin,
      disabled,
    });
  }, [currentDivision, divisions, isLoading, isAdmin, disabled]);

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
      mode="dropdown"
      dropdownIconColor={Colors[colorScheme].text}
      style={[
        styles.picker,
        {
          color: Colors[colorScheme].text,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      itemStyle={styles.pickerItem}
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
    ...Platform.select({
      android: {
        height: 75,
        width: 150, // Increased height for Android
      },
      default: {
        height: 40,
      },
    }),
    minWidth: 150,
  },
  pickerItem: {
    height: 65, // Matching height for picker items
  },
});
