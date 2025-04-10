import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Platform, ViewStyle, Switch, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import { ZoneCalendarAdmin } from "./ZoneCalendarAdmin";
import { CalendarAllotments } from "./CalendarAllotments";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";

export function CalendarManager() {
  const {
    usesZoneCalendars,
    selectedZoneId,
    zones,
    isLoading,
    error,
    fetchDivisionSettings,
    toggleZoneCalendars,
    setSelectedZoneId,
  } = useAdminCalendarManagementStore();

  const division = useUserStore((state) => state.division);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  useEffect(() => {
    if (division) {
      fetchDivisionSettings(division);
    }
  }, [division, fetchDivisionSettings]);

  const handleZoneCalendarToggle = async () => {
    if (!division) return;
    await toggleZoneCalendars(division, usesZoneCalendars);
  };

  const handleZoneSelect = (zoneId: number) => {
    setSelectedZoneId(zoneId);
  };

  const currentDivisionZones = zones[division || ""] || [];
  const hasSingleZone = currentDivisionZones.length === 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Calendar Management
        </ThemedText>

        {error && (
          <ThemedView style={[styles.section, styles.errorSection]}>
            <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
          </ThemedView>
        )}

        {!hasSingleZone && (
          <ThemedView style={styles.section}>
            <ThemedView style={styles.toggleContainer}>
              <ThemedText type="subtitle">Use Zone-Based Calendars</ThemedText>
              <Switch
                value={usesZoneCalendars}
                onValueChange={handleZoneCalendarToggle}
                disabled={isLoading}
                trackColor={{ false: Colors[colorScheme]?.border || "#ccc", true: Colors[colorScheme]?.tint || "#000" }}
              />
            </ThemedView>
            <ThemedText style={styles.description}>
              {usesZoneCalendars
                ? "Each zone will have its own calendar and allotments"
                : "Using a single calendar for the entire division"}
            </ThemedText>
          </ThemedView>
        )}

        {hasSingleZone && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.description}>Using a single calendar for the entire division</ThemedText>
          </ThemedView>
        )}

        {usesZoneCalendars && !hasSingleZone && (
          <ThemedView style={styles.section}>
            <ZoneCalendarAdmin
              division={division || ""}
              onZoneSelect={handleZoneSelect}
              selectedZoneId={selectedZoneId}
              zones={currentDivisionZones}
              isLoading={isLoading}
            />
          </ThemedView>
        )}

        {(!usesZoneCalendars || hasSingleZone) && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Division Calendar
            </ThemedText>
            <CalendarAllotments isZoneSpecific={false} />
          </ThemedView>
        )}

        {usesZoneCalendars && selectedZoneId && !hasSingleZone && (
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
  errorSection: {
    backgroundColor: Colors.light.error,
    borderColor: Colors.light.error,
    borderWidth: 1,
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  errorText: {
    color: Colors.dark.text,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } as ViewStyle,
  description: {
    fontSize: 14,
    color: Colors.light.text,
    marginTop: 8,
  },
});
