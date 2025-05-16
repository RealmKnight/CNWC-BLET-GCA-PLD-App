import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Platform,
  ScrollView,
  View,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Button } from "@/components/ui/Button";
import { Calendar } from "react-native-calendars";
import { Picker } from "@react-native-picker/picker";
import { format, addMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { useDivisionMeetingStore } from "@/store/divisionMeetingStore";
import { MeetingPatternEditor } from "./MeetingPatternEditor";
import { StructuredMinutesEditor } from "./StructuredMinutesEditor";
import { supabase } from "@/utils/supabase";

type MeetingTab = "schedule" | "agenda" | "minutes" | "attendance";

interface DivisionMeetingsProps {
  division: string;
  isAdmin?: boolean;
}

export function DivisionMeetings({ division, isAdmin = false }: DivisionMeetingsProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  // Get persistent state from store - use individual selectors
  const activeTab = useDivisionMeetingStore((state) => state.activeTabs[division] || "schedule") as MeetingTab;
  const setActiveTab = useDivisionMeetingStore((state) => state.setActiveTab);
  const updateFormState = useDivisionMeetingStore((state) => state.updateFormState);

  // Create default form state once
  const defaultFormState = useMemo(
    () => ({
      showPatternEditor: false,
      editingPattern: null,
      selectedAgendaType: "pattern" as const,
      editingAgenda: "",
      isEditingAgenda: false,
      currentOccurrenceId: null,
      showMinutesEditor: false,
      editingMinutes: null,
      selectedOccurrence: null,
    }),
    []
  );

  // Access individual form state fields directly to avoid object recreation
  const showPatternEditor = useDivisionMeetingStore(
    (state) => state.formStates[division]?.showPatternEditor ?? defaultFormState.showPatternEditor
  );
  const editingPattern = useDivisionMeetingStore(
    (state) => state.formStates[division]?.editingPattern ?? defaultFormState.editingPattern
  );
  const selectedAgendaType = useDivisionMeetingStore(
    (state) => state.formStates[division]?.selectedAgendaType ?? defaultFormState.selectedAgendaType
  );
  const editingAgenda = useDivisionMeetingStore(
    (state) => state.formStates[division]?.editingAgenda ?? defaultFormState.editingAgenda
  );
  const isEditingAgenda = useDivisionMeetingStore(
    (state) => state.formStates[division]?.isEditingAgenda ?? defaultFormState.isEditingAgenda
  );
  const currentOccurrenceId = useDivisionMeetingStore(
    (state) => state.formStates[division]?.currentOccurrenceId ?? defaultFormState.currentOccurrenceId
  );
  const showMinutesEditor = useDivisionMeetingStore(
    (state) => state.formStates[division]?.showMinutesEditor ?? defaultFormState.showMinutesEditor
  );
  const editingMinutes = useDivisionMeetingStore(
    (state) => state.formStates[division]?.editingMinutes ?? defaultFormState.editingMinutes
  );
  const selectedOccurrence = useDivisionMeetingStore(
    (state) => state.formStates[division]?.selectedOccurrence ?? defaultFormState.selectedOccurrence
  );

  // Local state (not needing persistence)
  const [meetingCalendar, setMeetingCalendar] = useState<Record<string, any>>({});
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [attendanceData, setAttendanceData] = useState<{
    present: string;
    absent: string;
    excused: string;
    notes: string;
  }>({
    present: "",
    absent: "",
    excused: "",
    notes: "",
  });

  // Use the store with individual selectors
  const meetings = useDivisionMeetingStore((state) => state.meetings);
  const occurrences = useDivisionMeetingStore((state) => state.occurrences);
  const meetingMinutes = useDivisionMeetingStore((state) => state.meetingMinutes);
  const storeIsLoading = useDivisionMeetingStore((state) => state.isLoading);
  const error = useDivisionMeetingStore((state) => state.error);
  const selectedMeetingPatternId = useDivisionMeetingStore((state) => state.selectedMeetingPatternId);
  const selectedOccurrenceId = useDivisionMeetingStore((state) => state.selectedOccurrenceId);

  // Get store actions
  const fetchDivisionMeetings = useDivisionMeetingStore((state) => state.fetchDivisionMeetings);
  const fetchMeetingOccurrences = useDivisionMeetingStore((state) => state.fetchMeetingOccurrences);
  const fetchMeetingMinutes = useDivisionMeetingStore((state) => state.fetchMeetingMinutes);
  const createMeetingPattern = useDivisionMeetingStore((state) => state.createMeetingPattern);
  const updateMeetingPattern = useDivisionMeetingStore((state) => state.updateMeetingPattern);
  const createMeetingMinutes = useDivisionMeetingStore((state) => state.createMeetingMinutes);
  const updateMeetingMinutes = useDivisionMeetingStore((state) => state.updateMeetingMinutes);
  const approveMeetingMinutes = useDivisionMeetingStore((state) => state.approveMeetingMinutes);
  const archiveMeetingMinutes = useDivisionMeetingStore((state) => state.archiveMeetingMinutes);
  const exportCalendar = useDivisionMeetingStore((state) => state.exportCalendar);
  const exportMinutesPdf = useDivisionMeetingStore((state) => state.exportMinutesPdf);
  const overrideMeetingOccurrence = useDivisionMeetingStore((state) => state.overrideMeetingOccurrence);
  const subscribeToRealtime = useDivisionMeetingStore((state) => state.subscribeToRealtime);
  const unsubscribeFromRealtime = useDivisionMeetingStore((state) => state.unsubscribeFromRealtime);
  const setSelectedMeetingPatternId = useDivisionMeetingStore((state) => state.setSelectedMeetingPatternId);
  const setSelectedOccurrenceId = useDivisionMeetingStore((state) => state.setSelectedOccurrenceId);

  // Load attendance data from minutes when pattern minutes change
  useEffect(() => {
    if (selectedOccurrenceId && meetingMinutes[selectedOccurrenceId]) {
      const patternMinutes = meetingMinutes[selectedOccurrenceId];
      if (patternMinutes.length > 0 && patternMinutes[0].structured_content) {
        const minutes = patternMinutes[0];
        const content = minutes.structured_content;

        if (content.roll_call) {
          setAttendanceData({
            present: content.roll_call.present.join(", "),
            absent: content.roll_call.absent.join(", "),
            excused: content.roll_call.excused.join(", "),
            notes: content.attendance_summary?.notes || "",
          });
          return;
        }
      }
    }

    // Reset attendance data if no minutes available
    setAttendanceData({
      present: "",
      absent: "",
      excused: "",
      notes: "",
    });
  }, [selectedOccurrenceId, meetingMinutes]);

  // Fetch division ID
  useEffect(() => {
    const getDivisionId = async () => {
      try {
        const { data, error } = await supabase.from("divisions").select("id").eq("name", division).single();

        if (error) throw error;
        if (data) {
          setDivisionId(data.id);
        }
      } catch (error) {
        console.error("Error fetching division ID:", error);
      }
    };

    if (division) {
      getDivisionId();
    }
  }, [division]);

  // Load meeting data when component mounts or division changes
  useEffect(() => {
    const loadData = async () => {
      try {
        if (division) {
          await fetchDivisionMeetings(division);
        }
      } catch (error) {
        console.error("Error loading division meetings:", error);
      }
    };

    loadData();
  }, [division, fetchDivisionMeetings]);

  // Update calendar when occurrences change
  useEffect(() => {
    if (selectedMeetingPatternId && occurrences[selectedMeetingPatternId]) {
      const markedDates: Record<string, any> = {};

      occurrences[selectedMeetingPatternId].forEach((occurrence) => {
        if (!occurrence.is_cancelled) {
          const dateString = occurrence.actual_scheduled_datetime_utc.split("T")[0];
          markedDates[dateString] = {
            selected: true,
            marked: true,
            dotColor: Colors[colorScheme].tint,
          };
        }
      });

      setMeetingCalendar(markedDates);
    }
  }, [occurrences, selectedMeetingPatternId, colorScheme]);

  // Initialize realtime subscriptions
  useEffect(() => {
    return () => {
      // Clean up subscriptions when component unmounts
      unsubscribeFromRealtime();
    };
  }, [unsubscribeFromRealtime]);

  // Helper functions to update form state - use useCallback
  const setShowPatternEditor = useCallback(
    (value: boolean) => {
      updateFormState(division, { showPatternEditor: value });
    },
    [division, updateFormState]
  );

  const setEditingPattern = useCallback(
    (value: any) => {
      updateFormState(division, { editingPattern: value });
    },
    [division, updateFormState]
  );

  const setSelectedAgendaType = useCallback(
    (value: "pattern" | "occurrence") => {
      updateFormState(division, { selectedAgendaType: value });
    },
    [division, updateFormState]
  );

  const setEditingAgenda = useCallback(
    (value: string) => {
      updateFormState(division, { editingAgenda: value });
    },
    [division, updateFormState]
  );

  const setIsEditingAgenda = useCallback(
    (value: boolean) => {
      updateFormState(division, { isEditingAgenda: value });
    },
    [division, updateFormState]
  );

  const setCurrentOccurrenceId = useCallback(
    (value: string | null) => {
      updateFormState(division, { currentOccurrenceId: value });
    },
    [division, updateFormState]
  );

  const setShowMinutesEditor = useCallback(
    (value: boolean) => {
      updateFormState(division, { showMinutesEditor: value });
    },
    [division, updateFormState]
  );

  const setEditingMinutes = useCallback(
    (value: any) => {
      updateFormState(division, { editingMinutes: value });
    },
    [division, updateFormState]
  );

  const setSelectedOccurrence = useCallback(
    (value: any) => {
      updateFormState(division, { selectedOccurrence: value });
    },
    [division, updateFormState]
  );

  // Handle pattern create/edit
  const handleCreatePattern = () => {
    if (!divisionId) {
      Alert.alert("Error", "Division ID not found");
      return;
    }

    setEditingPattern({
      division_id: divisionId,
      meeting_type: "regular",
      location_name: "",
      location_address: "",
      meeting_time: "18:00:00",
      meeting_pattern_type: "day_of_month",
      adjust_for_dst: false,
      time_zone: "America/New_York",
      is_active: true,
    });
    setShowPatternEditor(true);
  };

  const handleEditPattern = (pattern: any) => {
    setEditingPattern(pattern);
    setShowPatternEditor(true);
  };

  const handleSavePattern = async (pattern: any) => {
    try {
      // Get the current user ID for created_by/updated_by fields
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to save meeting patterns");
        return;
      }

      // Create a copy of the pattern with proper UUID values
      const patternWithUser = {
        ...pattern,
        created_by: pattern.id ? pattern.created_by || user.id : user.id,
        updated_by: user.id,
      };

      // Remove empty string IDs that should be generated by the database
      if (!patternWithUser.id || patternWithUser.id === "") {
        delete patternWithUser.id;
      }

      // If this is an update operation
      if (pattern.id) {
        await updateMeetingPattern(pattern.id, patternWithUser);
      } else {
        // For new patterns
        await createMeetingPattern(patternWithUser);
      }

      setShowPatternEditor(false);

      // Refresh the data after saving
      fetchDivisionMeetings(division);
    } catch (error) {
      console.error("Error saving pattern:", error);
      Alert.alert("Error", "Failed to save meeting pattern.");
    }
  };

  const handleExportCalendar = async (patternId: string) => {
    try {
      const icalData = await exportCalendar(patternId);

      if (Platform.OS === "web") {
        // For web, create a download link
        const blob = new Blob([icalData], { type: "text/calendar" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `meetings_${division}.ics`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For mobile, this would use expo-sharing or similar
        Alert.alert("Success", "Calendar export functionality for mobile will be implemented in a future update.");
      }
    } catch (error) {
      console.error("Error exporting calendar:", error);
      Alert.alert("Error", "Failed to export calendar.");
    }
  };

  // Handle minutes actions
  const handleCreateMinutes = () => {
    if (!selectedOccurrenceId || !selectedMeetingPatternId) {
      Alert.alert("Error", "Please select a meeting occurrence first");
      return;
    }

    const occurrence = occurrences[selectedMeetingPatternId]?.find((o) => o.id === selectedOccurrenceId);

    if (!occurrence) {
      Alert.alert("Error", "Selected occurrence not found");
      return;
    }

    // Create new empty structured content
    const emptyStructuredContent = {
      call_to_order: {
        time: format(new Date(occurrence.actual_scheduled_datetime_utc), "HH:mm:ss"),
        presiding_officer: "",
      },
      roll_call: {
        present: [],
        absent: [],
        excused: [],
      },
      approval_of_previous_minutes: {
        approved: true,
        amendments: "",
      },
      reports: [],
      motions: [],
      adjournment: {
        moved_by: "",
        seconded_by: "",
        vote_result: {
          in_favor: 0,
          opposed: 0,
          abstained: 0,
        },
        passed: true,
        time: format(
          new Date(new Date(occurrence.actual_scheduled_datetime_utc).getTime() + 2 * 60 * 60 * 1000),
          "HH:mm:ss"
        ), // Default to 2 hours after start
      },
      additional_sections: [],
      attendance_summary: {
        present_count: 0,
        absent_count: 0,
        excused_count: 0,
        notes: "",
      },
    };

    setEditingMinutes({
      structured_content: emptyStructuredContent,
    });
    setSelectedOccurrence(occurrence);
    setShowMinutesEditor(true);
  };

  const handleEditMinutes = (minutes: any) => {
    setEditingMinutes(minutes);
    setShowMinutesEditor(true);
  };

  const handleSaveMinutes = async (structuredContent: any) => {
    try {
      if (!selectedOccurrenceId || !selectedMeetingPatternId) {
        Alert.alert("Error", "Meeting occurrence information is missing");
        return;
      }

      const occurrence = occurrences[selectedMeetingPatternId]?.find((o) => o.id === selectedOccurrenceId);

      if (!occurrence) {
        Alert.alert("Error", "Selected occurrence not found");
        return;
      }

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to save minutes");
        return;
      }

      if (editingMinutes?.id) {
        // Update existing minutes
        await updateMeetingMinutes(editingMinutes.id, {
          structured_content: structuredContent,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        });
      } else {
        // Create new minutes
        await createMeetingMinutes({
          meeting_id: selectedMeetingPatternId,
          meeting_date: occurrence.actual_scheduled_datetime_utc.split("T")[0],
          structured_content: structuredContent,
          is_approved: false,
          is_archived: false,
          created_by: user.id,
          updated_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      setShowMinutesEditor(false);

      // Refresh the minutes list
      if (selectedOccurrenceId) {
        fetchMeetingMinutes(selectedOccurrenceId);
      }
    } catch (error) {
      console.error("Error saving minutes:", error);
      Alert.alert("Error", "Failed to save meeting minutes");
    }
  };

  const handleApproveMinutes = async (minutesId: string) => {
    try {
      await approveMeetingMinutes(minutesId);

      // Refresh the minutes list
      if (selectedOccurrenceId) {
        fetchMeetingMinutes(selectedOccurrenceId);
      }
    } catch (error) {
      console.error("Error approving minutes:", error);
      Alert.alert("Error", "Failed to approve meeting minutes");
    }
  };

  const handleArchiveMinutes = async (minutesId: string) => {
    try {
      await archiveMeetingMinutes(minutesId);

      // Refresh the minutes list
      if (selectedOccurrenceId) {
        fetchMeetingMinutes(selectedOccurrenceId);
      }
    } catch (error) {
      console.error("Error archiving minutes:", error);
      Alert.alert("Error", "Failed to archive meeting minutes");
    }
  };

  const handleExportMinutesPdf = async (minutesId: string) => {
    try {
      await exportMinutesPdf(minutesId);
      // PDF export functionality will be fully implemented in a future phase
      Alert.alert("Info", "PDF export functionality will be implemented in a future update.");
    } catch (error) {
      console.error("Error exporting minutes PDF:", error);
      Alert.alert("Error", "Failed to export minutes as PDF");
    }
  };

  // Handle saving agenda
  const handleSaveAgenda = async () => {
    try {
      if (selectedAgendaType === "pattern") {
        // Saving default agenda for the pattern
        if (!selectedMeetingPatternId) {
          Alert.alert("Error", "No meeting pattern selected");
          return;
        }

        await updateMeetingPattern(selectedMeetingPatternId, {
          default_agenda: editingAgenda,
          updated_at: new Date().toISOString(),
        });
      } else {
        // Saving agenda for a specific occurrence
        if (!currentOccurrenceId) {
          Alert.alert("Error", "No meeting occurrence selected");
          return;
        }

        await overrideMeetingOccurrence(currentOccurrenceId, {
          agenda: editingAgenda,
          updated_at: new Date().toISOString(),
        });

        // Refresh occurrences
        if (selectedMeetingPatternId) {
          fetchMeetingOccurrences(selectedMeetingPatternId);
        }
      }

      // Exit editing mode
      setIsEditingAgenda(false);

      // Refresh meeting data
      if (division) {
        fetchDivisionMeetings(division);
      }
    } catch (error) {
      console.error("Error saving agenda:", error);
      Alert.alert("Error", "Failed to save agenda");
    }
  };

  // Tab rendering
  const renderTabButton = (tab: MeetingTab, icon: string, label: string) => {
    const isActive = activeTab === tab;
    const iconColor = isActive ? Colors[colorScheme].background : Colors[colorScheme].tint;
    const buttonSize = isMobile ? 40 : "auto";
    const iconSize = isMobile ? 20 : 24;

    return (
      <TouchableOpacity
        style={[
          styles.tabButton,
          isActive && styles.activeTabButton,
          isMobile && styles.mobileTabButton,
          { minWidth: buttonSize, height: buttonSize },
        ]}
        onPress={() => setActiveTab(division, tab)}
      >
        <Ionicons name={icon as any} size={iconSize} color={iconColor} />
        {!isMobile && <ThemedText style={[styles.tabButtonText, isActive && styles.activeTabText]}>{label}</ThemedText>}
      </TouchableOpacity>
    );
  };

  // Content rendering based on selected tab
  const renderContent = () => {
    if (storeIsLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors[colorScheme].error} />
          <ThemedText style={styles.errorText}>Error: {error}</ThemedText>
        </View>
      );
    }

    switch (activeTab) {
      case "schedule":
        return renderScheduleContent();
      case "agenda":
        return renderAgendaContent();
      case "minutes":
        return renderMinutesContent();
      case "attendance":
        return renderAttendanceContent();
      default:
        return null;
    }
  };

  // Schedule management content
  const renderScheduleContent = () => {
    if (showPatternEditor) {
      return (
        <ThemedView style={styles.contentContainer}>
          <MeetingPatternEditor
            divisionName={division}
            initialPattern={editingPattern}
            onSave={handleSavePattern}
            onCancel={() => setShowPatternEditor(false)}
          />
        </ThemedView>
      );
    }

    const divisionMeetings = meetings[division] || [];

    return (
      <ThemedView style={styles.contentContainer}>
        <ThemedText style={styles.sectionTitle}>Meeting Schedule Management</ThemedText>

        {divisionMeetings.length === 0 ? (
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyStateText}>No meeting patterns defined for this division.</ThemedText>
            <Button onPress={handleCreatePattern} style={{ marginTop: 16 }}>
              Create Meeting Pattern
            </Button>
          </ThemedView>
        ) : (
          <>
            <View style={styles.meetingListHeader}>
              <ThemedText style={styles.meetingListTitle}>Meeting Patterns</ThemedText>
              <Button onPress={handleCreatePattern}>Create New Pattern</Button>
            </View>

            {divisionMeetings.map((meeting) => (
              <View key={meeting.id} style={styles.meetingItem}>
                <View style={styles.meetingItemContent}>
                  <ThemedText style={styles.meetingItemTitle}>
                    {meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1)} Meeting
                  </ThemedText>
                  <ThemedText style={styles.meetingItemSubtitle}>
                    Pattern: {meeting.meeting_pattern_type.replace(/_/g, " ")}
                  </ThemedText>
                  <ThemedText style={styles.meetingItemDetail}>Location: {meeting.location_name}</ThemedText>
                  <View style={styles.meetingItemStatus}>
                    <ThemedText style={styles.statusText}>
                      Status: {meeting.is_active ? "Active" : "Inactive"}
                    </ThemedText>
                    <View
                      style={[styles.statusIndicator, { backgroundColor: meeting.is_active ? "#4CAF50" : "#F44336" }]}
                    />
                  </View>
                </View>
                <View style={styles.meetingItemActions}>
                  <Button variant="secondary" onPress={() => handleEditPattern(meeting)} style={styles.actionButton}>
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => handleExportCalendar(meeting.id)}
                    style={styles.actionButton}
                  >
                    Export Calendar
                  </Button>
                </View>
              </View>
            ))}

            <ThemedView style={styles.calendarSection}>
              <ThemedText style={styles.calendarTitle}>Meeting Calendar</ThemedText>
              <Calendar
                markedDates={meetingCalendar}
                markingType={"dot"}
                theme={{
                  calendarBackground: Colors[colorScheme].background,
                  textSectionTitleColor: Colors[colorScheme].text,
                  selectedDayBackgroundColor: Colors[colorScheme].tint,
                  selectedDayTextColor: Colors[colorScheme].background,
                  todayTextColor: Colors[colorScheme].tint,
                  dayTextColor: Colors[colorScheme].text,
                  textDisabledColor: Colors[colorScheme].textDim,
                  arrowColor: Colors[colorScheme].tint,
                }}
              />
            </ThemedView>
          </>
        )}
      </ThemedView>
    );
  };

  // Agenda management content
  const renderAgendaContent = () => {
    const divisionMeetings = meetings[division] || [];

    if (divisionMeetings.length === 0) {
      return (
        <ThemedView style={styles.contentContainer}>
          <ThemedText style={styles.sectionTitle}>Meeting Agenda Management</ThemedText>
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyStateText}>
              No meeting patterns defined for this division. Please create a meeting pattern first.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      );
    }

    // Get the selected pattern's occurrences
    const selectedPattern = divisionMeetings.find((m) => m.id === selectedMeetingPatternId);
    const patternOccurrences = selectedMeetingPatternId ? occurrences[selectedMeetingPatternId] || [] : [];

    // If we're editing, show the editor
    if (isEditingAgenda) {
      return (
        <ThemedView style={styles.contentContainer}>
          <ThemedText style={styles.sectionTitle}>
            {selectedAgendaType === "pattern" ? "Edit Default Agenda Template" : "Edit Meeting Agenda"}
          </ThemedText>

          <ThemedTextInput
            style={styles.agendaEditor}
            multiline
            value={editingAgenda}
            onChangeText={setEditingAgenda}
            placeholder="Enter meeting agenda..."
          />

          <View style={styles.buttonContainer}>
            <Button variant="secondary" onPress={() => setIsEditingAgenda(false)} style={{ marginRight: 10 }}>
              Cancel
            </Button>
            <Button onPress={handleSaveAgenda}>Save Agenda</Button>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.contentContainer}>
        <ThemedText style={styles.sectionTitle}>Meeting Agenda Management</ThemedText>

        <View style={styles.meetingSelector}>
          <ThemedText style={styles.selectorLabel}>Select Meeting Pattern:</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedMeetingPatternId || ""}
              onValueChange={(value) => {
                if (value) {
                  setSelectedOccurrenceId(null);
                  setCurrentOccurrenceId(null);
                  fetchMeetingOccurrences(value);
                }
              }}
              style={styles.picker}
            >
              <Picker.Item label="Select a meeting pattern" value="" />
              {divisionMeetings.map((meeting) => (
                <Picker.Item
                  key={meeting.id}
                  label={`${meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1)} - ${
                    meeting.location_name
                  }`}
                  value={meeting.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        {selectedMeetingPatternId && (
          <>
            <View style={styles.agendaTypeSelector}>
              <TouchableOpacity
                style={[styles.agendaTypeButton, selectedAgendaType === "pattern" && styles.selectedAgendaType]}
                onPress={() => setSelectedAgendaType("pattern")}
              >
                <ThemedText
                  style={[styles.agendaTypeText, selectedAgendaType === "pattern" && styles.selectedAgendaTypeText]}
                >
                  Default Template
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.agendaTypeButton, selectedAgendaType === "occurrence" && styles.selectedAgendaType]}
                onPress={() => setSelectedAgendaType("occurrence")}
              >
                <ThemedText
                  style={[styles.agendaTypeText, selectedAgendaType === "occurrence" && styles.selectedAgendaTypeText]}
                >
                  Specific Meeting
                </ThemedText>
              </TouchableOpacity>
            </View>

            {selectedAgendaType === "pattern" ? (
              <View style={styles.defaultAgendaSection}>
                <View style={styles.agendaHeader}>
                  <ThemedText style={styles.agendaTitle}>Default Agenda Template</ThemedText>
                  <Button
                    onPress={() => {
                      const selectedPattern = divisionMeetings.find((m) => m.id === selectedMeetingPatternId);
                      if (selectedPattern) {
                        setEditingAgenda(selectedPattern.default_agenda || "");
                        setIsEditingAgenda(true);
                      }
                    }}
                  >
                    Edit Template
                  </Button>
                </View>

                <ThemedView style={styles.agendaPreview}>
                  {selectedPattern?.default_agenda ? (
                    <ThemedText style={styles.agendaContent}>{selectedPattern.default_agenda}</ThemedText>
                  ) : (
                    <ThemedText style={styles.emptyAgendaText}>
                      No default agenda template set for this meeting pattern.
                    </ThemedText>
                  )}
                </ThemedView>
              </View>
            ) : (
              <View style={styles.specificAgendaSection}>
                <View style={styles.occurrenceSelector}>
                  <ThemedText style={styles.selectorLabel}>Select Meeting Occurrence:</ThemedText>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={currentOccurrenceId || ""}
                      onValueChange={(value) => {
                        if (value) {
                          setCurrentOccurrenceId(value);
                        }
                      }}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select a meeting occurrence" value="" />
                      {patternOccurrences.map((occurrence) => {
                        const dateTime = new Date(occurrence.actual_scheduled_datetime_utc);
                        return (
                          <Picker.Item
                            key={occurrence.id}
                            label={`${format(dateTime, "MMM d, yyyy")} at ${format(dateTime, "h:mm a")}`}
                            value={occurrence.id}
                          />
                        );
                      })}
                    </Picker>
                  </View>
                </View>

                {currentOccurrenceId && (
                  <View style={styles.specificAgendaContent}>
                    {(() => {
                      const occurrence = patternOccurrences.find((o) => o.id === currentOccurrenceId);

                      return (
                        <>
                          <View style={styles.agendaHeader}>
                            <ThemedText style={styles.agendaTitle}>
                              Meeting Agenda for{" "}
                              {occurrence
                                ? format(new Date(occurrence.actual_scheduled_datetime_utc), "MMMM d, yyyy")
                                : ""}
                            </ThemedText>
                            <Button
                              onPress={() => {
                                const occurrence = patternOccurrences.find((o) => o.id === currentOccurrenceId);
                                if (occurrence) {
                                  setEditingAgenda(occurrence.agenda || selectedPattern?.default_agenda || "");
                                  setIsEditingAgenda(true);
                                }
                              }}
                            >
                              Edit Agenda
                            </Button>
                          </View>

                          <ThemedView style={styles.agendaPreview}>
                            {occurrence?.agenda ? (
                              <ThemedText style={styles.agendaContent}>{occurrence.agenda}</ThemedText>
                            ) : selectedPattern?.default_agenda ? (
                              <>
                                <ThemedText style={styles.defaultAgendaNote}>Using default agenda template:</ThemedText>
                                <ThemedText style={styles.agendaContent}>{selectedPattern.default_agenda}</ThemedText>
                              </>
                            ) : (
                              <ThemedText style={styles.emptyAgendaText}>
                                No agenda set for this meeting. Edit to add an agenda.
                              </ThemedText>
                            )}
                          </ThemedView>
                        </>
                      );
                    })()}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ThemedView>
    );
  };

  // Minutes management content
  const renderMinutesContent = () => {
    if (showMinutesEditor) {
      return (
        <ThemedView style={styles.contentContainer}>
          <StructuredMinutesEditor
            initialContent={editingMinutes?.structured_content}
            meetingDate={selectedOccurrence?.actual_scheduled_datetime_utc}
            onSave={handleSaveMinutes}
            onCancel={() => setShowMinutesEditor(false)}
          />
        </ThemedView>
      );
    }

    const divisionMeetings = meetings[division] || [];

    if (divisionMeetings.length === 0) {
      return (
        <ThemedView style={styles.contentContainer}>
          <ThemedText style={styles.sectionTitle}>Meeting Minutes Management</ThemedText>
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyStateText}>
              No meeting patterns defined for this division. Please create a meeting pattern first.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      );
    }

    // Get the selected pattern's occurrences
    const selectedPattern = divisionMeetings.find((m) => m.id === selectedMeetingPatternId);
    const patternOccurrences = selectedMeetingPatternId ? occurrences[selectedMeetingPatternId] || [] : [];
    const patternMinutes = selectedOccurrenceId ? meetingMinutes[selectedOccurrenceId] || [] : [];

    return (
      <ThemedView style={styles.contentContainer}>
        <ThemedText style={styles.sectionTitle}>Meeting Minutes Management</ThemedText>

        <View style={styles.meetingSelector}>
          <ThemedText style={styles.selectorLabel}>Select Meeting Pattern:</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedMeetingPatternId || ""}
              onValueChange={(value) => {
                if (value) {
                  setSelectedOccurrenceId(null);
                  fetchMeetingOccurrences(value);
                }
              }}
              style={styles.picker}
            >
              <Picker.Item label="Select a meeting pattern" value="" />
              {divisionMeetings.map((meeting) => (
                <Picker.Item
                  key={meeting.id}
                  label={`${meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1)} - ${
                    meeting.location_name
                  }`}
                  value={meeting.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        {selectedMeetingPatternId && (
          <View style={styles.occurrenceSelector}>
            <ThemedText style={styles.selectorLabel}>Select Meeting Occurrence:</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOccurrenceId || ""}
                onValueChange={(value) => {
                  if (value) {
                    setSelectedOccurrenceId(value);
                    // Fetch minutes for this occurrence
                    fetchMeetingMinutes(value);
                    // Update selected occurrence
                    setSelectedOccurrence(patternOccurrences.find((o) => o.id === value));
                  }
                }}
                style={styles.picker}
              >
                <Picker.Item label="Select a meeting occurrence" value="" />
                {patternOccurrences.map((occurrence) => {
                  const dateTime = new Date(occurrence.actual_scheduled_datetime_utc);
                  return (
                    <Picker.Item
                      key={occurrence.id}
                      label={`${format(dateTime, "MMM d, yyyy")} at ${format(dateTime, "h:mm a")}`}
                      value={occurrence.id}
                    />
                  );
                })}
              </Picker>
            </View>
          </View>
        )}

        {selectedOccurrenceId && (
          <View style={styles.minutesSection}>
            <View style={styles.minutesHeader}>
              <ThemedText style={styles.minutesTitle}>Meeting Minutes</ThemedText>
              <Button onPress={handleCreateMinutes}>Create New Minutes</Button>
            </View>

            {patternMinutes.length === 0 ? (
              <ThemedView style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>No minutes found for this meeting occurrence.</ThemedText>
              </ThemedView>
            ) : (
              <View style={styles.minutesList}>
                {patternMinutes.map((minutes) => (
                  <View key={minutes.id} style={styles.minutesItem}>
                    <View style={styles.minutesItemContent}>
                      <ThemedText style={styles.minutesItemTitle}>
                        Minutes for {format(new Date(minutes.meeting_date), "MMMM d, yyyy")}
                      </ThemedText>
                      <View style={styles.minutesItemStatus}>
                        <ThemedText style={styles.statusText}>
                          Status: {minutes.is_approved ? "Approved" : "Draft"}
                        </ThemedText>
                        <View
                          style={[
                            styles.statusIndicator,
                            { backgroundColor: minutes.is_approved ? "#4CAF50" : "#FFC107" },
                          ]}
                        />
                      </View>
                      {minutes.is_archived && (
                        <View style={styles.archivedBadge}>
                          <ThemedText style={styles.archivedText}>Archived</ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.minutesItemActions}>
                      <Button
                        variant="secondary"
                        onPress={() => handleEditMinutes(minutes)}
                        style={styles.actionButton}
                        disabled={minutes.is_approved}
                      >
                        Edit
                      </Button>
                      {!minutes.is_approved && (
                        <Button
                          variant="secondary"
                          onPress={() => handleApproveMinutes(minutes.id)}
                          style={styles.actionButton}
                        >
                          Approve
                        </Button>
                      )}
                      {minutes.is_approved && !minutes.is_archived && (
                        <Button
                          variant="secondary"
                          onPress={() => handleArchiveMinutes(minutes.id)}
                          style={styles.actionButton}
                        >
                          Archive
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onPress={() => handleExportMinutesPdf(minutes.id)}
                        style={styles.actionButton}
                      >
                        Export PDF
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ThemedView>
    );
  };

  // Attendance recording content
  const renderAttendanceContent = () => {
    const divisionMeetings = meetings[division] || [];

    if (divisionMeetings.length === 0) {
      return (
        <ThemedView style={styles.contentContainer}>
          <ThemedText style={styles.sectionTitle}>Meeting Attendance</ThemedText>
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyStateText}>
              No meeting patterns defined for this division. Please create a meeting pattern first.
            </ThemedText>
          </ThemedView>
        </ThemedView>
      );
    }

    // Get the selected pattern's occurrences
    const selectedPattern = divisionMeetings.find((m) => m.id === selectedMeetingPatternId);
    const patternOccurrences = selectedMeetingPatternId ? occurrences[selectedMeetingPatternId] || [] : [];
    const patternMinutes = selectedOccurrenceId ? meetingMinutes[selectedOccurrenceId] || [] : [];

    const handleSaveAttendance = async () => {
      try {
        if (!selectedOccurrenceId || !selectedMeetingPatternId) {
          Alert.alert("Error", "Please select a meeting occurrence first");
          return;
        }

        const occurrence = patternOccurrences.find((o) => o.id === selectedOccurrenceId);
        if (!occurrence) {
          Alert.alert("Error", "Selected occurrence not found");
          return;
        }

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert("Error", "You must be logged in to save attendance");
          return;
        }

        // Check if we have minutes for this meeting
        if (patternMinutes.length > 0) {
          // Update existing minutes with attendance data
          const minutesId = patternMinutes[0].id;
          const structuredContent = {
            ...patternMinutes[0].structured_content,
            roll_call: {
              present: attendanceData.present
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
              absent: attendanceData.absent
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
              excused: attendanceData.excused
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
            },
            attendance_summary: {
              present_count: attendanceData.present.split(",").filter(Boolean).length,
              absent_count: attendanceData.absent.split(",").filter(Boolean).length,
              excused_count: attendanceData.excused.split(",").filter(Boolean).length,
              notes: attendanceData.notes,
            },
          };

          await updateMeetingMinutes(minutesId, {
            structured_content: structuredContent,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          });

          Alert.alert("Success", "Attendance data saved successfully");
        } else {
          // Create new minutes with attendance data
          const structuredContent = {
            call_to_order: {
              time: format(new Date(occurrence.actual_scheduled_datetime_utc), "HH:mm:ss"),
              presiding_officer: "",
            },
            roll_call: {
              present: attendanceData.present
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
              absent: attendanceData.absent
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
              excused: attendanceData.excused
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean),
            },
            approval_of_previous_minutes: {
              approved: true,
              amendments: "",
            },
            reports: [],
            motions: [],
            adjournment: {
              moved_by: "",
              seconded_by: "",
              vote_result: {
                in_favor: 0,
                opposed: 0,
                abstained: 0,
              },
              passed: true,
              time: format(
                new Date(new Date(occurrence.actual_scheduled_datetime_utc).getTime() + 2 * 60 * 60 * 1000),
                "HH:mm:ss"
              ), // Default to 2 hours after start
            },
            additional_sections: [],
            attendance_summary: {
              present_count: attendanceData.present.split(",").filter(Boolean).length,
              absent_count: attendanceData.absent.split(",").filter(Boolean).length,
              excused_count: attendanceData.excused.split(",").filter(Boolean).length,
              notes: attendanceData.notes,
            },
          };

          await createMeetingMinutes({
            meeting_id: selectedMeetingPatternId,
            meeting_date: occurrence.actual_scheduled_datetime_utc.split("T")[0],
            structured_content: structuredContent,
            is_approved: false,
            is_archived: false,
            created_by: user.id,
            updated_by: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          Alert.alert("Success", "New minutes created with attendance data");
        }

        // Refresh the minutes list
        if (selectedOccurrenceId) {
          fetchMeetingMinutes(selectedOccurrenceId);
        }
      } catch (error) {
        console.error("Error saving attendance:", error);
        Alert.alert("Error", "Failed to save attendance data");
      }
    };

    return (
      <ThemedView style={styles.contentContainer}>
        <ThemedText style={styles.sectionTitle}>Meeting Attendance</ThemedText>

        <View style={styles.meetingSelector}>
          <ThemedText style={styles.selectorLabel}>Select Meeting Pattern:</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedMeetingPatternId || ""}
              onValueChange={(value) => {
                if (value) {
                  setSelectedOccurrenceId(null);
                  fetchMeetingOccurrences(value);
                }
              }}
              style={styles.picker}
            >
              <Picker.Item label="Select a meeting pattern" value="" />
              {divisionMeetings.map((meeting) => (
                <Picker.Item
                  key={meeting.id}
                  label={`${meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1)} - ${
                    meeting.location_name
                  }`}
                  value={meeting.id}
                />
              ))}
            </Picker>
          </View>
        </View>

        {selectedMeetingPatternId && (
          <View style={styles.occurrenceSelector}>
            <ThemedText style={styles.selectorLabel}>Select Meeting Occurrence:</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOccurrenceId || ""}
                onValueChange={(value) => {
                  if (value) {
                    setSelectedOccurrenceId(value);
                    // Fetch minutes for this occurrence
                    fetchMeetingMinutes(value);
                    // Update selected occurrence
                    setSelectedOccurrence(patternOccurrences.find((o) => o.id === value));
                  }
                }}
                style={styles.picker}
              >
                <Picker.Item label="Select a meeting occurrence" value="" />
                {patternOccurrences.map((occurrence) => {
                  const dateTime = new Date(occurrence.actual_scheduled_datetime_utc);
                  return (
                    <Picker.Item
                      key={occurrence.id}
                      label={`${format(dateTime, "MMM d, yyyy")} at ${format(dateTime, "h:mm a")}`}
                      value={occurrence.id}
                    />
                  );
                })}
              </Picker>
            </View>
          </View>
        )}

        {selectedOccurrenceId && (
          <View style={styles.attendanceSection}>
            <View style={styles.attendanceHeader}>
              <ThemedText style={styles.attendanceTitle}>
                Record Attendance for{" "}
                {selectedOccurrence
                  ? format(new Date(selectedOccurrence.actual_scheduled_datetime_utc), "MMMM d, yyyy")
                  : ""}
              </ThemedText>
            </View>

            <ThemedText style={styles.attendanceHelp}>Enter names separated by commas in each category:</ThemedText>

            <View style={styles.attendanceForm}>
              <View style={styles.attendanceFormGroup}>
                <ThemedText style={styles.attendanceLabel}>Present:</ThemedText>
                <ThemedTextInput
                  style={styles.attendanceInput}
                  value={attendanceData.present}
                  onChangeText={(value) => setAttendanceData({ ...attendanceData, present: value })}
                  placeholder="Enter names separated by commas"
                  multiline
                />
              </View>

              <View style={styles.attendanceFormGroup}>
                <ThemedText style={styles.attendanceLabel}>Absent:</ThemedText>
                <ThemedTextInput
                  style={styles.attendanceInput}
                  value={attendanceData.absent}
                  onChangeText={(value) => setAttendanceData({ ...attendanceData, absent: value })}
                  placeholder="Enter names separated by commas"
                  multiline
                />
              </View>

              <View style={styles.attendanceFormGroup}>
                <ThemedText style={styles.attendanceLabel}>Excused:</ThemedText>
                <ThemedTextInput
                  style={styles.attendanceInput}
                  value={attendanceData.excused}
                  onChangeText={(value) => setAttendanceData({ ...attendanceData, excused: value })}
                  placeholder="Enter names separated by commas"
                  multiline
                />
              </View>

              <View style={styles.attendanceFormGroup}>
                <ThemedText style={styles.attendanceLabel}>Notes:</ThemedText>
                <ThemedTextInput
                  style={styles.attendanceNotes}
                  value={attendanceData.notes}
                  onChangeText={(value) => setAttendanceData({ ...attendanceData, notes: value })}
                  placeholder="Enter any additional notes about attendance"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.attendanceSummary}>
                <ThemedText style={styles.attendanceSummaryItem}>
                  Present: {attendanceData.present.split(",").filter(Boolean).length}
                </ThemedText>
                <ThemedText style={styles.attendanceSummaryItem}>
                  Absent: {attendanceData.absent.split(",").filter(Boolean).length}
                </ThemedText>
                <ThemedText style={styles.attendanceSummaryItem}>
                  Excused: {attendanceData.excused.split(",").filter(Boolean).length}
                </ThemedText>
                <ThemedText style={styles.attendanceSummaryItem}>
                  Total:{" "}
                  {attendanceData.present.split(",").filter(Boolean).length +
                    attendanceData.absent.split(",").filter(Boolean).length +
                    attendanceData.excused.split(",").filter(Boolean).length}
                </ThemedText>
              </View>

              <Button onPress={handleSaveAttendance} style={{ alignSelf: "flex-end", marginTop: 16 }}>
                Save Attendance
              </Button>
            </View>
          </View>
        )}
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <View style={styles.tabsContainer}>
          {renderTabButton("schedule", "calendar-outline", "Schedule")}
          {renderTabButton("agenda", "list-outline", "Agenda")}
          {renderTabButton("minutes", "document-text-outline", "Minutes")}
          {renderTabButton("attendance", "people-outline", "Attendance")}
        </View>
      </ThemedView>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.scrollContentContainer}
        nestedScrollEnabled={true}
      >
        {renderContent()}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  mobileTabButton: {
    padding: 8,
    justifyContent: "center",
  },
  activeTabButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  activeTabText: {
    color: Colors.light.background,
  },
  contentScroll: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
    paddingBottom: 60,
  },
  contentContainer: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.light.error,
  },
  placeholderText: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 16,
  },
  meetingListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  meetingListTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  meetingItem: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  meetingItemContent: {
    marginBottom: 16,
  },
  meetingItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  meetingItemSubtitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  meetingItemDetail: {
    fontSize: 14,
    marginBottom: 4,
  },
  meetingItemStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statusText: {
    fontSize: 14,
    marginRight: 8,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meetingItemActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  actionButton: {
    minWidth: 120,
  },
  calendarSection: {
    marginTop: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  meetingSelector: {
    marginBottom: 16,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
    color: Colors.dark.text,
  },
  pickerContainer: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.dark.background,
    ...Platform.select({
      ios: {
        height: 60,
      },
      android: {
        height: 65,
        paddingHorizontal: 0,
      },
      web: {
        height: 40,
        minHeight: 40,
      },
    }),
  },
  picker: {
    height: Platform.select({
      ios: 60,
      android: 65,
      web: 40,
    }),
    width: "100%",
    color: Colors.dark.text,
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
    ...Platform.select({
      android: {
        paddingHorizontal: 0,
      },
      web: {
        paddingRight: 24, // Space for dropdown arrow
        cursor: "pointer",
      },
    }),
  },
  occurrenceSelector: {
    marginBottom: 16,
  },
  minutesSection: {
    marginTop: 16,
  },
  minutesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  minutesTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  minutesList: {
    marginTop: 8,
  },
  minutesItem: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  minutesItemContent: {
    marginBottom: 16,
  },
  minutesItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  minutesItemStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  minutesItemActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    flexWrap: "wrap",
  },
  archivedBadge: {
    backgroundColor: "#607D8B",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  archivedText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  agendaTypeSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    marginBottom: 8,
  },
  agendaTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 8,
    borderRadius: 8,
  },
  selectedAgendaType: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  agendaTypeText: {
    fontSize: 14,
  },
  selectedAgendaTypeText: {
    color: Colors.dark.buttonText,
  },
  defaultAgendaSection: {
    marginTop: 16,
  },
  specificAgendaSection: {
    marginTop: 16,
  },
  specificAgendaContent: {
    marginTop: 16,
  },
  agendaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  agendaPreview: {
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    minHeight: 200,
  },
  agendaContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyAgendaText: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
  },
  defaultAgendaNote: {
    fontSize: 12,
    fontStyle: "italic",
    opacity: 0.7,
    marginBottom: 8,
  },
  agendaEditor: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 16,
    minHeight: 300,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  attendanceSection: {
    marginTop: 16,
  },
  attendanceHeader: {
    marginBottom: 16,
  },
  attendanceTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  attendanceHelp: {
    fontSize: 14,
    marginBottom: 16,
    fontStyle: "italic",
  },
  attendanceForm: {
    marginTop: 8,
  },
  attendanceFormGroup: {
    marginBottom: 16,
  },
  attendanceLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  attendanceInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  attendanceNotes: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
  },
  attendanceSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 8,
  },
  attendanceSummaryItem: {
    marginRight: 16,
    fontSize: 14,
    fontWeight: "500",
  },
  patternEditorPlaceholder: {
    height: 200,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  calendarPreviewPlaceholder: {
    height: 300,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  agendaEditorPlaceholder: {
    height: 300,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  minutesEditorPlaceholder: {
    height: 400,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  attendanceRecordingPlaceholder: {
    height: 300,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
