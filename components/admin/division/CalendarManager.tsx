import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, Platform, ViewStyle, Switch, TouchableOpacity, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import { ZoneCalendarAdmin } from "./ZoneCalendarAdmin";
import { CalendarAllotments } from "./CalendarAllotments";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { DivisionSelector } from "./DivisionSelector";

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
    resetAllotments,
    ensureDivisionSettingsLoaded,
  } = useAdminCalendarManagementStore();

  const { member, division: userDivision } = useUserStore();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [selectedDivision, setSelectedDivision] = useState(userDivision || "");

  const isAdmin = member?.role === "application_admin" || member?.role === "union_admin";

  useEffect(() => {
    if (selectedDivision) {
      const loadDivisionData = async () => {
        try {
          // Reset state before loading new division
          setSelectedZoneId(null);
          resetAllotments();

          // Load division settings and wait for completion
          await ensureDivisionSettingsLoaded(selectedDivision);
        } catch (error) {
          console.error("[CalendarManager] Error loading division data:", error);
        }
      };

      loadDivisionData();
    }
  }, [selectedDivision, ensureDivisionSettingsLoaded, setSelectedZoneId, resetAllotments]);

  const handleZoneCalendarToggle = async () => {
    if (!selectedDivision) return;
    await toggleZoneCalendars(selectedDivision, usesZoneCalendars);
  };

  const handleZoneSelect = (zoneId: number) => {
    setSelectedZoneId(zoneId);
  };

  const currentDivisionZones = zones[selectedDivision || ""] || [];
  const hasSingleZone = currentDivisionZones.length === 1;

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>Calendar Management</ThemedText>
        <View style={styles.divisionContainer}>
          <View style={styles.divisionRow}>
            <ThemedText style={styles.divisionLabel}>Division: </ThemedText>
            {isAdmin ? (
              <DivisionSelector
                currentDivision={selectedDivision}
                onDivisionChange={setSelectedDivision}
                isAdmin={isAdmin}
                disabled={isLoading}
              />
            ) : (
              <ThemedText style={styles.divisionText}>{selectedDivision}</ThemedText>
            )}
          </View>
          <View style={styles.divisionRow}>
            <ThemedText style={styles.divisionLabel}>Zone(s): </ThemedText>
            <ThemedText style={[styles.divisionText, styles.zoneText]}>
              {currentDivisionZones.length > 0
                ? currentDivisionZones.map((zone) => zone.name).join(", ")
                : "No zones found"}
            </ThemedText>
          </View>
        </View>
      </ThemedView>

      {error ? (
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      ) : (
        <ScrollView style={styles.content}>
          {!hasSingleZone && (
            <ThemedView style={styles.zoneToggleContainer}>
              <ThemedText>Use Zone Calendars</ThemedText>
              <Switch value={usesZoneCalendars} onValueChange={handleZoneCalendarToggle} disabled={isLoading} />
            </ThemedView>
          )}
          {usesZoneCalendars && (
            <ThemedText style={styles.subtitleText}>Each Zone has its own calendar and allotments</ThemedText>
          )}

          {usesZoneCalendars && currentDivisionZones.length > 0 && (
            <ZoneCalendarAdmin
              zones={currentDivisionZones}
              selectedZoneId={selectedZoneId}
              onZoneSelect={handleZoneSelect}
            />
          )}

          <CalendarAllotments zoneId={selectedZoneId || undefined} isZoneSpecific={usesZoneCalendars} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 2,
    borderRadius: 10,
    borderColor: Colors.dark.border,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  content: {
    flex: 1,
  },
  zoneToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  errorText: {
    color: Colors.light.error,
    textAlign: "center",
    marginTop: 16,
  },
  divisionContainer: {
    marginBottom: 8,
    ...Platform.select({
      web: {
        flexDirection: "row",
        alignItems: "center",
      },
      ios: {
        flexDirection: "column",
        width: "100%",
      },
      android: {
        flexDirection: "column",
        width: "100%",
      },
      default: {
        flexDirection: "column",
        width: "100%",
      },
    }),
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    ...Platform.select({
      web: {
        marginRight: 24,
        flexShrink: 1,
      },
      ios: {
        marginBottom: 8,
        paddingRight: 16,
      },
      android: {
        marginBottom: 8,
        paddingRight: 16,
      },
      default: {
        marginBottom: 8,
        paddingRight: 16,
      },
    }),
  },
  divisionLabel: {
    fontSize: 16,
    marginRight: 8,
    ...Platform.select({
      ios: {
        minWidth: 80,
      },
      android: {
        minWidth: 80,
      },
    }),
  },
  divisionText: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    ...Platform.select({
      ios: {
        flexShrink: 1,
      },
      android: {
        flexShrink: 1,
      },
    }),
  },
  zoneText: {
    flexShrink: 1,
  },
  subtitleText: {
    fontSize: 14,
    color: Colors.light.textDim,
    marginTop: -8,
    marginBottom: 16,
    marginLeft: 8,
  },
});
