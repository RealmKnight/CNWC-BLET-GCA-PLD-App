import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, ViewStyle, Switch, TouchableOpacity, View, VirtualizedList } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useUserStore } from "@/store/userStore";
import { CalendarSelector } from "./CalendarSelector";
import { CalendarAllotments } from "./CalendarAllotments";
import { CalendarCrudAdmin } from "./CalendarCrudAdmin";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { DivisionSelector } from "./DivisionSelector";
import { Calendar } from "@/types/calendar";

export function CalendarManager() {
  const {
    calendars,
    selectedCalendarId,
    divisionZones,
    isLoading,
    isDivisionLoading,
    error,
    setSelectedCalendarId,
    resetAllotments,
    ensureDivisionSettingsLoaded,
    prepareDivisionSwitch,
    isSwitchingDivision,
    setError,
    setIsLoading,
  } = useAdminCalendarManagementStore();

  const { member, division: userDivision } = useUserStore();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [selectedDivision, setSelectedDivision] = useState(userDivision || "");

  const isAdmin = member?.role === "application_admin" || member?.role === "union_admin";
  const currentDivisionCalendars = calendars[selectedDivision] || [];
  const currentDivisionZones = divisionZones[selectedDivision] || [];

  // Load initial division data on mount
  useEffect(() => {
    console.log("[CalendarManager] Component mounted with:", {
      member,
      userDivision,
      selectedDivision,
      isAdmin,
      memberRole: member?.role,
      divisionId: member?.division_id,
      memberCalendarId: member?.calendar_id,
      userStoreCalendarId: useUserStore.getState().calendar_id,
      hasCalendars: !!calendars[selectedDivision],
      currentCalendars: calendars[selectedDivision] || [],
    });

    const loadInitialDivision = async () => {
      if (!selectedDivision) {
        console.log("[CalendarManager] No selected division to load");
        return;
      }

      try {
        console.log("[CalendarManager] Loading initial division:", selectedDivision);
        if (isAdmin) {
          await prepareDivisionSwitch("", selectedDivision);
        } else {
          await ensureDivisionSettingsLoaded(selectedDivision);
        }

        // After loading division, check if we need to select a calendar
        const divCalendars = calendars[selectedDivision] || [];
        if (divCalendars.length > 0 && !selectedCalendarId) {
          // Try to match the user's assigned calendar first
          const userCalendarId = member?.calendar_id || useUserStore.getState().calendar_id;
          const matchingUserCalendar = userCalendarId ? divCalendars.find((c) => c.id === userCalendarId) : undefined;

          // If user has a matching calendar, select it
          if (matchingUserCalendar) {
            console.log("[CalendarManager] Selecting user's assigned calendar:", matchingUserCalendar.id);
            setSelectedCalendarId(matchingUserCalendar.id);
          }
          // Otherwise, select the first calendar
          else if (divCalendars.length === 1) {
            console.log("[CalendarManager] Auto-selecting the only calendar:", divCalendars[0].id);
            setSelectedCalendarId(divCalendars[0].id);
          }
        }
      } catch (error) {
        console.error("[CalendarManager] Error loading initial division:", error);
        setError("Failed to load initial division data. Please try again.");
      }
    };

    loadInitialDivision();
  }, []); // Only run on mount

  // Handle division changes
  useEffect(() => {
    console.log("[CalendarManager] Division selection changed:", {
      selectedDivision,
      hasCalendars: !!calendars[selectedDivision],
      calendarCount: currentDivisionCalendars.length,
      isLoading,
      error,
      calendarsMap: calendars,
    });

    if (!selectedDivision) return;

    handleDivisionChange(selectedDivision).catch((error) => {
      console.error("[CalendarManager] Error handling division change:", error);
      setError("Failed to switch division. Please try again.");
    });
  }, [selectedDivision]);

  // Auto-select single calendar
  useEffect(() => {
    if (currentDivisionCalendars.length === 1 && !selectedCalendarId && currentDivisionCalendars[0]?.id) {
      console.log("[CalendarManager] Auto-selecting single calendar:", currentDivisionCalendars[0].id);
      setSelectedCalendarId(currentDivisionCalendars[0].id);
    }
  }, [currentDivisionCalendars, selectedCalendarId]);

  const handleDivisionChange = async (newDivision: string) => {
    if (!newDivision) {
      console.log("[CalendarManager] No division provided, skipping change");
      return;
    }

    if (isLoading && newDivision === selectedDivision) {
      console.log("[CalendarManager] Already loading this division, skipping");
      return;
    }

    try {
      console.log("[CalendarManager] Handling division change:", {
        from: selectedDivision,
        to: newDivision,
        isAdmin,
        currentCalendars: calendars[newDivision] || [],
      });

      setIsLoading(true);
      setError(null);
      setSelectedCalendarId(null);
      resetAllotments();

      // Load the new division's data
      if (isAdmin) {
        await prepareDivisionSwitch(selectedDivision, newDivision);
      } else {
        await ensureDivisionSettingsLoaded(newDivision);
      }

      // Auto-select calendar based on priority:
      // 1. User's assigned calendar (if it belongs to this division)
      // 2. First active calendar
      // 3. First calendar in the list (if no active calendars)
      const newDivisionCalendars = calendars[newDivision] || [];
      console.log("[CalendarManager] After division change:", {
        newDivision,
        calendarsCount: newDivisionCalendars.length,
        calendars: newDivisionCalendars.map((c) => ({ id: c.id, name: c.name, isActive: c.is_active })),
        userCalendarId: member?.calendar_id,
      });

      if (newDivisionCalendars.length > 0) {
        // Try to match the user's assigned calendar
        const userCalendarId = member?.calendar_id;
        const userCalendarInThisDivision = userCalendarId
          ? newDivisionCalendars.find((c) => c.id === userCalendarId)
          : undefined;

        if (userCalendarInThisDivision) {
          console.log("[CalendarManager] Found user's calendar in this division:", userCalendarInThisDivision.id);
          setSelectedCalendarId(userCalendarInThisDivision.id);
        } else {
          // Find first active calendar
          const firstActiveCalendar = newDivisionCalendars.find((c) => c.is_active);
          if (firstActiveCalendar) {
            console.log("[CalendarManager] Selecting first active calendar:", firstActiveCalendar.id);
            setSelectedCalendarId(firstActiveCalendar.id);
          } else if (newDivisionCalendars.length > 0) {
            console.log(
              "[CalendarManager] No active calendars, selecting first available:",
              newDivisionCalendars[0].id
            );
            setSelectedCalendarId(newDivisionCalendars[0].id);
          }
        }
      } else {
        console.log("[CalendarManager] No calendars found for division:", newDivision);
      }

      // Update the division in the component state
      setSelectedDivision(newDivision);
    } catch (error) {
      console.error("[CalendarManager] Error switching division:", error);
      setError("Failed to switch division. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCalendarSelect = (calendarId: string | null) => {
    if (isLoading) return;
    setSelectedCalendarId(calendarId);
  };

  // Add getItem and getItemCount functions for VirtualizedList
  const getItem = (_data: any[], index: number) => ({
    id: index,
    content:
      index === 0 ? (
        <ThemedView style={styles.componentGroup}>
          <CalendarCrudAdmin selectedDivisionName={selectedDivision} style={{ marginBottom: 0 }} />
          {currentDivisionCalendars.length > 1 && (
            <CalendarSelector
              calendars={currentDivisionCalendars}
              selectedCalendarId={selectedCalendarId}
              onSelectCalendar={handleCalendarSelect}
              disabled={isLoading || isSwitchingDivision}
              style={{ borderTopWidth: 0, marginTop: -8 }}
            />
          )}
        </ThemedView>
      ) : selectedCalendarId ? (
        <CalendarAllotments calendarId={selectedCalendarId} selectedDivision={isAdmin ? selectedDivision : undefined} />
      ) : currentDivisionCalendars.length === 0 ? (
        <ThemedView style={styles.noCalendarsContainer}>
          <ThemedText style={styles.noCalendarsText}>
            No calendars found for this division. Please create a calendar to begin.
          </ThemedText>
        </ThemedView>
      ) : null,
  });

  const getItemCount = () => (selectedCalendarId || currentDivisionCalendars.length === 0 ? 2 : 1);

  const renderItem = ({ item }: { item: { id: number; content: React.ReactNode } }) => (
    <View key={item.id}>{item.content}</View>
  );

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
                onDivisionChange={handleDivisionChange}
                isAdmin={isAdmin}
                disabled={isLoading || isSwitchingDivision}
              />
            ) : (
              <ThemedText style={styles.divisionText}>{selectedDivision}</ThemedText>
            )}
          </View>
          {currentDivisionCalendars.length > 0 && (
            <View style={styles.divisionRow}>
              <ThemedText style={styles.divisionLabel}>Calendar(s): </ThemedText>
              <ThemedText style={[styles.divisionText, styles.calendarText]}>
                {currentDivisionCalendars.map((cal) => cal.name).join(", ")}
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>

      {error ? (
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      ) : (
        <VirtualizedList
          data={[]}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          getItem={getItem}
          getItemCount={getItemCount}
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={true}
          scrollEnabled={true}
          removeClippedSubviews={Platform.OS !== "web"}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 16,
    marginBottom: 16,
  },
  contentContainer: {
    padding: 16,
  },
  componentGroup: {
    flex: 1,
    minHeight: 0,
  },
  errorText: {
    color: Colors.light.error,
    textAlign: "center",
    marginTop: 16,
  },
  divisionContainer: {
    ...Platform.select({
      web: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
      default: { flexDirection: "column", width: "100%", gap: 8 },
    }),
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      web: { flexBasis: "auto", marginRight: 16 },
      default: { width: "100%", paddingRight: 0 },
    }),
  },
  divisionLabel: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: "500",
    minWidth: 80,
  },
  divisionText: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  calendarText: {
    flexShrink: 1,
    fontStyle: "italic",
    color: Colors.light.textDim,
  },
  noCalendarsContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 32,
  },
  noCalendarsText: {
    fontSize: 16,
    textAlign: "center",
    color: Colors.light.textDim,
  },
});
