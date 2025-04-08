import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface Zone {
  id: number;
  name: string;
}

interface ZoneCalendarAdminProps {
  division: string;
  onZoneSelect: (zoneId: number) => void;
  selectedZoneId: number | null;
  zones: Zone[];
  isLoading: boolean;
}

export function ZoneCalendarAdmin({
  division,
  onZoneSelect,
  selectedZoneId,
  zones,
  isLoading,
}: ZoneCalendarAdminProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Select Zone
      </ThemedText>
      <ThemedView style={styles.zoneList}>
        {zones.map((zone) => (
          <TouchableOpacity
            key={zone.id}
            style={[
              styles.zoneButton,
              selectedZoneId === zone.id && {
                backgroundColor: Colors[colorScheme].tint,
              },
            ]}
            onPress={() => onZoneSelect(zone.id)}
          >
            <ThemedText style={[styles.zoneName, selectedZoneId === zone.id && styles.selectedZoneName]}>
              {zone.name}
            </ThemedText>
          </TouchableOpacity>
        ))}
        {isLoading && <ThemedText style={styles.loadingText}>Loading zones...</ThemedText>}
        {!isLoading && zones.length === 0 && (
          <ThemedText style={styles.emptyText}>No zones found for this division</ThemedText>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  zoneList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  } as ViewStyle,
  zoneButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minWidth: 100,
    alignItems: "center",
  } as ViewStyle,
  zoneName: {
    fontSize: 14,
  },
  selectedZoneName: {
    color: "#000000",
    fontWeight: "600",
  },
  loadingText: {
    fontStyle: "italic",
  },
  emptyText: {
    fontStyle: "italic",
    color: Colors.light.text,
  },
});
