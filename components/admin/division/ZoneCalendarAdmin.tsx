import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { Zone } from "../../../types/calendar";

interface ZoneCalendarAdminProps {
  zones: Zone[];
  selectedZoneId: number | null;
  onZoneSelect: (zoneId: number) => void;
}

export function ZoneCalendarAdmin({ zones, selectedZoneId, onZoneSelect }: ZoneCalendarAdminProps) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Select Zone</ThemedText>
      <ThemedView style={styles.zoneList}>
        {zones.map((zone) => (
          <TouchableOpacity
            key={zone.id}
            style={[styles.zoneButton, selectedZoneId === zone.id && styles.selectedZone]}
            onPress={() => onZoneSelect(zone.id)}
          >
            <ThemedText style={[styles.zoneText, selectedZoneId === zone.id && styles.selectedZoneText]}>
              {zone.name}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  zoneList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  zoneButton: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  selectedZone: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  zoneText: {
    color: Colors.light.text,
  },
  selectedZoneText: {
    color: Colors.light.background,
  },
});
