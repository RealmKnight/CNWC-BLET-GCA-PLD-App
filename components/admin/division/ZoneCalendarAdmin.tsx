import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useZoneCalendarStore } from "@/store/zoneCalendarStore";

interface ZoneCalendarAdminProps {
  division: string;
  onZoneSelect: (zoneId: number) => void;
}

export function ZoneCalendarAdmin({ division, onZoneSelect }: ZoneCalendarAdminProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  const {
    divisionsWithZones,
    setDivisionZoneCalendars,
    removeDivisionZoneCalendars,
    isLoading,
    error: storeError,
    zones,
    fetchZones,
  } = useZoneCalendarStore();

  // Fetch zones only if we don't have them cached
  useEffect(() => {
    if (!division || zones[division]?.length > 0) return;
    fetchZones(division);
  }, [division, zones, fetchZones]);

  const handleZoneToggle = async (zoneId: number) => {
    try {
      const currentZones = divisionsWithZones[division] || [];
      const isEnabled = currentZones.includes(zoneId);

      if (isEnabled) {
        await removeDivisionZoneCalendars(division, [zoneId]);
      } else {
        await setDivisionZoneCalendars(division, [...currentZones, zoneId]);
      }

      onZoneSelect(zoneId);
    } catch (error) {
      console.error("[ZoneCalendarAdmin] Error toggling zone calendar:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update zone calendar settings";
      if (Platform.OS === "web") {
        alert(errorMessage);
      } else {
        Alert.alert("Error", errorMessage);
      }
    }
  };

  // Only show loading state when we have no data
  if (isLoading && !zones[division]?.length) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Loading zones...</ThemedText>
      </ThemedView>
    );
  }

  if (storeError) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{storeError}</ThemedText>
      </ThemedView>
    );
  }

  const divisionZones = zones[division] || [];

  if (!divisionZones.length) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.noDataText}>No zones found for this division.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Zone Calendars
      </ThemedText>
      <ThemedView style={styles.zonesContainer}>
        {divisionZones.map((zone) => {
          const isEnabled = (divisionsWithZones[division] || []).includes(zone.id);
          return (
            <TouchableOpacity
              key={zone.id}
              style={[styles.zoneButton, isEnabled && styles.activeZoneButton]}
              onPress={() => handleZoneToggle(zone.id)}
            >
              <ThemedText style={[styles.zoneButtonText, isEnabled && styles.activeZoneButtonText]}>
                {zone.name}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  zonesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  zoneButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    minWidth: 120,
    alignItems: "center",
  },
  activeZoneButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  zoneButtonText: {
    fontSize: 16,
  },
  activeZoneButtonText: {
    color: "#FFFFFF",
  },
  errorText: {
    color: "red",
    textAlign: "center",
  },
  loadingText: {
    marginTop: 8,
    textAlign: "center",
  },
  noDataText: {
    textAlign: "center",
    fontSize: 16,
    color: Colors.light.text,
  },
});
