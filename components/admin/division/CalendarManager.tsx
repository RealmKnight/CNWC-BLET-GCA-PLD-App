import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Platform, ViewStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import { useZoneCalendarStore } from "@/store/zoneCalendarStore";
import { ZoneCalendarAdmin } from "./ZoneCalendarAdmin";
import { CalendarAllotments } from "./CalendarAllotments";

export function CalendarManager() {
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const division = useUserStore((state) => state.division);
  const { divisionsWithZones, fetchDivisionsWithZones } = useZoneCalendarStore();

  // Fetch divisions with zones on mount
  useEffect(() => {
    fetchDivisionsWithZones();
  }, []);

  const hasZoneCalendars = division ? !!divisionsWithZones[division] : false;

  const handleZoneSelect = (zoneId: number) => {
    setSelectedZoneId(zoneId);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Calendar Management
        </ThemedText>

        {/* Zone Calendar Management */}
        <ThemedView style={styles.section}>
          <ZoneCalendarAdmin division={division || ""} onZoneSelect={handleZoneSelect} />
        </ThemedView>

        {/* Division-wide Calendar */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Division Calendar
          </ThemedText>
          <CalendarAllotments />
        </ThemedView>

        {/* Zone-specific Calendar (if a zone is selected) */}
        {selectedZoneId && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Zone Calendar
            </ThemedText>
            <CalendarAllotments zoneId={selectedZoneId} isZoneSpecific={true} />
          </ThemedView>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } as ViewStyle,
  contentContainer: {
    flexGrow: 1,
  } as ViewStyle,
  content: {
    padding: 16,
  } as ViewStyle,
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  } as ViewStyle,
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
});
