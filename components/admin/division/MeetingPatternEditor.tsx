import React, { useState, useEffect, useMemo, useCallback } from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView, Platform, Switch, Modal } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Picker } from "@react-native-picker/picker";
import { Calendar } from "react-native-calendars";
import { ClientOnlyDatePicker } from "@/components/ClientOnlyDatePicker";
import { format, addMonths, parse, parseISO, isValid } from "date-fns";
import {
  MeetingPattern,
  DivisionMeeting,
  useDivisionMeetingStore,
  MeetingChangePreview,
  DuplicateCheckResult,
} from "@/store/divisionMeetingStore";
import { timeZones } from "@/utils/timeZones";
import { MeetingPatternChangePreview } from "@/components/admin/MeetingPatternChangePreview";

interface MeetingPatternEditorProps {
  divisionName: string;
  initialPattern?: Partial<DivisionMeeting>;
  onSave: (pattern: DivisionMeeting) => void;
  onCancel?: () => void;
}

// Helper type for the editor state
type MeetingPatternEditorState = {
  meetingType: string;
  meetingPatternType: DivisionMeeting["meeting_pattern_type"];
  locationName: string;
  locationAddress: string;
  defaultTime: string;
  timeZone: string;
  adjustForDst: boolean;
  notes: string;
  defaultAgenda: string;
  isActive: boolean;
  dayOfMonth: string;
  nthDayOfWeek: string;
  nthWeekOfMonth: string;
  specificDates: Array<{ date: string; time: string }>;
  rotatingRules: Array<{
    rule_type: string;
    day_of_week?: number;
    week_of_month?: number;
    day_of_month?: number;
    time?: string;
  }>;
  previewDate: string;
};

export function MeetingPatternEditor({ divisionName, initialPattern, onSave, onCancel }: MeetingPatternEditorProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const isDark = colorScheme === "dark";

  // Get form state from store with fallbacks to initial values if not in store
  const editorState = useDivisionMeetingStore((state) => state.formStates[divisionName]?.meetingPatternEditorState);

  // Default values memo to avoid recreating objects on each render
  const defaultValues = useMemo(
    (): MeetingPatternEditorState => ({
      meetingType: initialPattern?.meeting_type || "regular",
      meetingPatternType: initialPattern?.meeting_pattern_type || "day_of_month",
      locationName: initialPattern?.location_name || "",
      locationAddress: initialPattern?.location_address || "",
      defaultTime: initialPattern?.meeting_time || "18:00:00",
      timeZone: initialPattern?.time_zone || "America/New_York",
      adjustForDst: initialPattern?.adjust_for_dst || false,
      notes: initialPattern?.meeting_notes || "",
      defaultAgenda: initialPattern?.default_agenda || "",
      isActive: initialPattern?.is_active ?? true,
      dayOfMonth: initialPattern?.meeting_pattern?.day_of_month?.toString() || "15",
      nthDayOfWeek: initialPattern?.meeting_pattern?.day_of_week?.toString() || "1",
      nthWeekOfMonth: initialPattern?.meeting_pattern?.week_of_month?.toString() || "1",
      specificDates: initialPattern?.meeting_pattern?.specific_dates || [],
      rotatingRules: initialPattern?.meeting_pattern?.rules || [
        {
          rule_type: "nth_day_of_month",
          day_of_week: 1,
          week_of_month: 1,
          time: "18:00:00",
        },
      ],
      previewDate: format(new Date(), "yyyy-MM-dd"),
    }),
    [initialPattern]
  );

  // Function to merge editorState with defaults
  const getCompleteEditorState = useCallback((): MeetingPatternEditorState => {
    if (!editorState) return defaultValues;

    return {
      meetingType: editorState.meetingType ?? defaultValues.meetingType,
      meetingPatternType: editorState.meetingPatternType ?? defaultValues.meetingPatternType,
      locationName: editorState.locationName ?? defaultValues.locationName,
      locationAddress: editorState.locationAddress ?? defaultValues.locationAddress,
      defaultTime: editorState.defaultTime ?? defaultValues.defaultTime,
      timeZone: editorState.timeZone ?? defaultValues.timeZone,
      adjustForDst: editorState.adjustForDst ?? defaultValues.adjustForDst,
      notes: editorState.notes ?? defaultValues.notes,
      defaultAgenda: editorState.defaultAgenda ?? defaultValues.defaultAgenda,
      isActive: editorState.isActive ?? defaultValues.isActive,
      dayOfMonth: editorState.dayOfMonth ?? defaultValues.dayOfMonth,
      nthDayOfWeek: editorState.nthDayOfWeek ?? defaultValues.nthDayOfWeek,
      nthWeekOfMonth: editorState.nthWeekOfMonth ?? defaultValues.nthWeekOfMonth,
      specificDates: editorState.specificDates ?? defaultValues.specificDates,
      rotatingRules: editorState.rotatingRules ?? defaultValues.rotatingRules,
      previewDate: editorState.previewDate ?? defaultValues.previewDate,
    };
  }, [editorState, defaultValues]);

  // Get values from state
  const currentState = getCompleteEditorState();
  const meetingType = currentState.meetingType;
  const meetingPatternType = currentState.meetingPatternType;
  const locationName = currentState.locationName;
  const locationAddress = currentState.locationAddress;
  const defaultTime = currentState.defaultTime;
  const timeZone = currentState.timeZone;
  const adjustForDst = currentState.adjustForDst;
  const notes = currentState.notes;
  const defaultAgenda = currentState.defaultAgenda;
  const isActive = currentState.isActive;
  const dayOfMonth = currentState.dayOfMonth;
  const nthDayOfWeek = currentState.nthDayOfWeek;
  const nthWeekOfMonth = currentState.nthWeekOfMonth;
  const specificDates = currentState.specificDates;
  const rotatingRules = currentState.rotatingRules;
  const previewDate = currentState.previewDate;

  // Get update function from store
  const updateFormState = useDivisionMeetingStore((state) => state.updateFormState);

  // Generic update function
  const updateEditorState = useCallback(
    <K extends keyof MeetingPatternEditorState>(field: K, value: MeetingPatternEditorState[K]) => {
      const currentState = getCompleteEditorState();
      updateFormState(divisionName, {
        meetingPatternEditorState: {
          ...currentState,
          [field]: value,
        },
      });
    },
    [divisionName, updateFormState, getCompleteEditorState]
  );

  // Create update functions using the generic update function
  const setMeetingType = useCallback(
    (value: string) => {
      updateEditorState("meetingType", value);
    },
    [updateEditorState]
  );

  const setMeetingPatternType = useCallback(
    (value: DivisionMeeting["meeting_pattern_type"]) => {
      updateEditorState("meetingPatternType", value);
    },
    [updateEditorState]
  );

  const setLocationName = useCallback(
    (value: string) => {
      updateEditorState("locationName", value);
    },
    [updateEditorState]
  );

  const setLocationAddress = useCallback(
    (value: string) => {
      updateEditorState("locationAddress", value);
    },
    [updateEditorState]
  );

  const setDefaultTime = useCallback(
    (value: string) => {
      updateEditorState("defaultTime", value);
    },
    [updateEditorState]
  );

  const setTimeZone = useCallback(
    (value: string) => {
      updateEditorState("timeZone", value);
    },
    [updateEditorState]
  );

  const setAdjustForDst = useCallback(
    (value: boolean) => {
      updateEditorState("adjustForDst", value);
    },
    [updateEditorState]
  );

  const setNotes = useCallback(
    (value: string) => {
      updateEditorState("notes", value);
    },
    [updateEditorState]
  );

  const setDefaultAgenda = useCallback(
    (value: string) => {
      updateEditorState("defaultAgenda", value);
    },
    [updateEditorState]
  );

  const setIsActive = useCallback(
    (value: boolean) => {
      updateEditorState("isActive", value);
    },
    [updateEditorState]
  );

  const setDayOfMonth = useCallback(
    (value: string) => {
      updateEditorState("dayOfMonth", value);
    },
    [updateEditorState]
  );

  const setNthDayOfWeek = useCallback(
    (value: string) => {
      updateEditorState("nthDayOfWeek", value);
    },
    [updateEditorState]
  );

  const setNthWeekOfMonth = useCallback(
    (value: string) => {
      updateEditorState("nthWeekOfMonth", value);
    },
    [updateEditorState]
  );

  const setSpecificDates = useCallback(
    (value: Array<{ date: string; time: string }>) => {
      updateEditorState("specificDates", value);
    },
    [updateEditorState]
  );

  const setRotatingRules = useCallback(
    (
      value: Array<{
        rule_type: string;
        day_of_week?: number;
        week_of_month?: number;
        day_of_month?: number;
        time?: string;
      }>
    ) => {
      updateEditorState("rotatingRules", value);
    },
    [updateEditorState]
  );

  const setPreviewDate = useCallback(
    (value: string) => {
      updateEditorState("previewDate", value);
    },
    [updateEditorState]
  );

  // Local state for preview data - this doesn't need to be persisted
  const [previewMarkedDates, setPreviewMarkedDates] = useState<any>({});
  const [dstTransition, setDstTransition] = useState<{ isDstTransitionSoon: boolean; transitionDate?: Date }>({
    isDstTransitionSoon: false,
  });

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    preview: MeetingChangePreview;
    duplicateCheck: DuplicateCheckResult;
    warnings: string[];
    errors: string[];
    isValid: boolean;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [pendingPattern, setPendingPattern] = useState<DivisionMeeting | null>(null);

  // Get store functions for validation
  const validatePatternUpdate = useDivisionMeetingStore((state) => state.validatePatternUpdate);

  // Check for upcoming DST transitions (placeholder for actual implementation)
  useEffect(() => {
    // In a real implementation, this would check for DST transitions in the next 30 days
    // For now, we'll simulate a warning if within a certain date range
    const currentDate = new Date();

    // Example: Warning in March and October for typical DST transition months
    const isTransitionMonth = currentDate.getMonth() === 2 || currentDate.getMonth() === 9;
    setDstTransition({
      isDstTransitionSoon: isTransitionMonth,
      transitionDate: isTransitionMonth ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 14) : undefined,
    });
  }, [timeZone]);

  // Generate preview dates
  useEffect(() => {
    // This would call the calculateMeetingOccurrences utility function in a real implementation
    // For now, we'll generate some sample dates based on the pattern type
    generatePreviewDates();
  }, [meetingPatternType, dayOfMonth, nthDayOfWeek, nthWeekOfMonth, specificDates, rotatingRules, previewDate]);

  // Simple preview date generator (would be replaced with actual implementation)
  const generatePreviewDates = () => {
    const dates: Record<string, { selected: boolean; marked: boolean; dotColor: string }> = {};
    const currentMonth = previewDate.substring(0, 7); // YYYY-MM

    // Generate sample dates based on pattern type
    if (meetingPatternType === "day_of_month") {
      // Mark the specified day of the month
      const day = parseInt(dayOfMonth, 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        const dateStr = `${currentMonth}-${day.toString().padStart(2, "0")}`;
        dates[dateStr] = { selected: true, marked: true, dotColor: Colors[colorScheme].tint };
      }
    } else if (meetingPatternType === "nth_day_of_month") {
      // Calculate the date for the nth day of week in the current month
      const week = parseInt(nthWeekOfMonth, 10);
      const dayOfWeek = parseInt(nthDayOfWeek, 10);

      if (!isNaN(week) && !isNaN(dayOfWeek)) {
        const year = parseInt(currentMonth.substring(0, 4));
        const month = parseInt(currentMonth.substring(5, 7)) - 1; // Month is 0-indexed in Date

        // Find the first day of the month
        const firstDay = new Date(year, month, 1);

        // Calculate the first occurrence of the specified day of week
        let firstOccurrence = 1 + ((dayOfWeek - firstDay.getDay() + 7) % 7);

        // Calculate the day of the nth occurrence
        let dayOfMonth;

        if (week === 5) {
          // For "last" occurrence, find the last matching day in the month
          const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
          // Start from the first occurrence and find the last one
          dayOfMonth = firstOccurrence;
          while (dayOfMonth + 7 <= lastDayOfMonth) {
            dayOfMonth += 7;
          }
        } else {
          // For 1st through 4th occurrences
          dayOfMonth = firstOccurrence + (week - 1) * 7;

          // Check if this occurrence exists in this month
          const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
          if (dayOfMonth > lastDayOfMonth) {
            // This occurrence doesn't exist this month
            return;
          }
        }

        // Format and add the date
        const dateStr = `${currentMonth}-${dayOfMonth.toString().padStart(2, "0")}`;
        dates[dateStr] = { selected: true, marked: true, dotColor: Colors[colorScheme].tint };
      }
    } else if (meetingPatternType === "specific_date") {
      // Mark all specific dates
      specificDates.forEach(({ date }) => {
        dates[date] = { selected: true, marked: true, dotColor: Colors[colorScheme].tint };
      });
    } else if (meetingPatternType === "rotating") {
      // For rotating rules, we'd need more complex logic to show multiple patterns
      // For now, let's just show the current rule based on current_rule_index (defaulting to 0)
      const currentRuleIndex = 0; // Would come from the pattern in a full implementation
      const currentRule = rotatingRules[currentRuleIndex];

      if (currentRule) {
        if (currentRule.rule_type === "day_of_month" && currentRule.day_of_month) {
          // Similar to day_of_month pattern
          const day = currentRule.day_of_month;
          const dateStr = `${currentMonth}-${day.toString().padStart(2, "0")}`;
          dates[dateStr] = { selected: true, marked: true, dotColor: Colors[colorScheme].tint };
        } else if (
          currentRule.rule_type === "nth_day_of_month" &&
          currentRule.day_of_week !== undefined &&
          currentRule.week_of_month !== undefined
        ) {
          // Similar calculation as nth_day_of_month pattern
          const week = currentRule.week_of_month;
          const dayOfWeek = currentRule.day_of_week;

          const year = parseInt(currentMonth.substring(0, 4));
          const month = parseInt(currentMonth.substring(5, 7)) - 1;

          // Find the first day of the month
          const firstDay = new Date(year, month, 1);

          // Calculate the first occurrence of the specified day of week
          let firstOccurrence = 1 + ((dayOfWeek - firstDay.getDay() + 7) % 7);

          // Calculate the day of the nth occurrence
          let dayOfMonth;

          if (week === 5) {
            // For "last" occurrence, find the last matching day in the month
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
            // Start from the first occurrence and find the last one
            dayOfMonth = firstOccurrence;
            while (dayOfMonth + 7 <= lastDayOfMonth) {
              dayOfMonth += 7;
            }
          } else {
            // For 1st through 4th occurrences
            dayOfMonth = firstOccurrence + (week - 1) * 7;

            // Check if this occurrence exists in this month
            const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
            if (dayOfMonth > lastDayOfMonth) {
              // This occurrence doesn't exist this month
              return;
            }
          }

          // Format and add the date
          const dateStr = `${currentMonth}-${dayOfMonth.toString().padStart(2, "0")}`;
          dates[dateStr] = { selected: true, marked: true, dotColor: Colors[colorScheme].tint };
        }
      }
    }

    setPreviewMarkedDates(dates);
  };

  // Handle adding a new specific date
  const handleAddSpecificDate = useCallback(() => {
    setSpecificDates([...specificDates, { date: format(new Date(), "yyyy-MM-dd"), time: defaultTime }]);
  }, [specificDates, defaultTime, setSpecificDates]);

  // Handle removing a specific date
  const handleRemoveSpecificDate = useCallback(
    (index: number) => {
      const updatedDates = [...specificDates];
      updatedDates.splice(index, 1);
      setSpecificDates(updatedDates);
    },
    [specificDates, setSpecificDates]
  );

  // Handle updating a specific date
  const handleUpdateSpecificDate = useCallback(
    (index: number, field: "date" | "time", value: string) => {
      const updatedDates = [...specificDates];
      updatedDates[index] = { ...updatedDates[index], [field]: value };
      setSpecificDates(updatedDates);
    },
    [specificDates, setSpecificDates]
  );

  // Handle adding a new rotating rule
  const handleAddRotatingRule = useCallback(() => {
    setRotatingRules([
      ...(rotatingRules || []),
      {
        rule_type: "nth_day_of_month",
        day_of_week: 1,
        week_of_month: 1,
        time: defaultTime,
      },
    ]);
  }, [rotatingRules, defaultTime, setRotatingRules]);

  // Handle removing a rotating rule
  const handleRemoveRotatingRule = useCallback(
    (index: number) => {
      if (!rotatingRules || rotatingRules.length <= 1) return; // Keep at least one rule
      const updatedRules = [...rotatingRules];
      updatedRules.splice(index, 1);
      setRotatingRules(updatedRules);
    },
    [rotatingRules, setRotatingRules]
  );

  // Handle updating a rotating rule
  const handleUpdateRotatingRule = useCallback(
    (
      index: number,
      field: "rule_type" | "day_of_week" | "week_of_month" | "day_of_month" | "time",
      value: string | number
    ) => {
      const updatedRules = [...rotatingRules];

      // Convert string values to numbers where appropriate
      const processedValue = ["day_of_week", "week_of_month", "day_of_month"].includes(field)
        ? parseInt(value.toString(), 10)
        : value;

      updatedRules[index] = { ...updatedRules[index], [field]: processedValue };
      setRotatingRules(updatedRules);
    },
    [rotatingRules, setRotatingRules]
  );

  // Handle form submission - now shows preview instead of directly saving
  const handleSave = async () => {
    // Construct the meeting pattern based on the selected type
    let meetingPattern: MeetingPattern = {};

    switch (meetingPatternType) {
      case "day_of_month":
        meetingPattern = {
          day_of_month: parseInt(dayOfMonth, 10),
          time: defaultTime,
        };
        break;
      case "nth_day_of_month":
        meetingPattern = {
          day_of_week: parseInt(nthDayOfWeek, 10),
          week_of_month: parseInt(nthWeekOfMonth, 10),
          time: defaultTime,
        };
        break;
      case "specific_date":
        meetingPattern = {
          specific_dates: specificDates,
        };
        break;
      case "rotating":
        meetingPattern = {
          rules: rotatingRules,
          current_rule_index: 0,
        };
        break;
    }

    // Construct the complete meeting pattern object
    const completePattern: DivisionMeeting = {
      id: initialPattern?.id || "",
      division_id: initialPattern?.division_id || 0,
      meeting_type: meetingType,
      location_name: locationName,
      location_address: locationAddress,
      meeting_time: defaultTime,
      meeting_pattern_type: meetingPatternType,
      adjust_for_dst: adjustForDst,
      meeting_pattern: meetingPattern,
      meeting_notes: notes,
      default_agenda: defaultAgenda,
      time_zone: timeZone,
      is_active: isActive,
      created_at: initialPattern?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: initialPattern?.created_by || "",
      updated_by: "", // This would be set by the API
    };

    // If this is a new pattern, save directly without preview
    if (!initialPattern?.id) {
      onSave(completePattern);
      return;
    }

    // For existing patterns, show preview
    setIsValidating(true);
    setPendingPattern(completePattern);

    try {
      const validation = await validatePatternUpdate(initialPattern.id, completePattern);
      setPreviewData(validation);
      setShowPreview(true);
    } catch (error) {
      console.error("Error validating pattern update:", error);
      // If validation fails, fall back to direct save
      onSave(completePattern);
    } finally {
      setIsValidating(false);
    }
  };

  // Handle preview confirmation
  const handlePreviewConfirm = () => {
    if (pendingPattern) {
      onSave(pendingPattern);
    }
    setShowPreview(false);
    setPreviewData(null);
    setPendingPattern(null);
  };

  // Handle preview cancellation
  const handlePreviewCancel = () => {
    setShowPreview(false);
    setPreviewData(null);
    setPendingPattern(null);
  };

  // Render day of month form
  const renderDayOfMonthForm = () => (
    <View style={styles.patternSection}>
      <ThemedText style={styles.patternTitle}>Day of Month Pattern</ThemedText>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Day of Month:</ThemedText>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={dayOfMonth}
            onValueChange={(value) => setDayOfMonth(value)}
            style={styles.picker}
            dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <Picker.Item key={day} label={`${day}`} value={`${day}`} />
            ))}
          </Picker>
        </View>
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Time:</ThemedText>
        <ThemedTextInput
          style={styles.timeInput}
          value={defaultTime}
          onChangeText={setDefaultTime}
          placeholder="HH:MM:SS"
        />
      </View>
    </View>
  );

  // Render nth day of month form
  const renderNthDayOfMonthForm = () => (
    <View style={styles.patternSection}>
      <ThemedText style={styles.patternTitle}>Nth Day of Month Pattern</ThemedText>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Week of Month:</ThemedText>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={nthWeekOfMonth}
            onValueChange={(value) => setNthWeekOfMonth(value)}
            style={styles.picker}
            dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
          >
            <Picker.Item label="First" value="1" />
            <Picker.Item label="Second" value="2" />
            <Picker.Item label="Third" value="3" />
            <Picker.Item label="Fourth" value="4" />
            <Picker.Item label="Last" value="5" />
          </Picker>
        </View>
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Day of Week:</ThemedText>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={nthDayOfWeek}
            onValueChange={(value) => setNthDayOfWeek(value)}
            style={styles.picker}
            dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
          >
            <Picker.Item label="Sunday" value="0" />
            <Picker.Item label="Monday" value="1" />
            <Picker.Item label="Tuesday" value="2" />
            <Picker.Item label="Wednesday" value="3" />
            <Picker.Item label="Thursday" value="4" />
            <Picker.Item label="Friday" value="5" />
            <Picker.Item label="Saturday" value="6" />
          </Picker>
        </View>
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Time:</ThemedText>
        <ThemedTextInput
          style={styles.timeInput}
          value={defaultTime}
          onChangeText={setDefaultTime}
          placeholder="HH:MM:SS"
        />
      </View>
    </View>
  );

  // Render specific dates form
  const renderSpecificDatesForm = () => (
    <View style={styles.patternSection}>
      <ThemedText style={styles.patternTitle}>Specific Dates</ThemedText>
      {specificDates.map((dateItem, index) => (
        <View key={index} style={styles.specificDateItem}>
          <View style={styles.dateTimeRow}>
            <ClientOnlyDatePicker
              date={parseISO(dateItem.date)}
              onDateChange={(newDate) => {
                if (newDate) {
                  handleUpdateSpecificDate(index, "date", format(newDate, "yyyy-MM-dd"));
                }
              }}
            />
            <ThemedTextInput
              style={styles.timeInput}
              value={dateItem.time}
              onChangeText={(text) => handleUpdateSpecificDate(index, "time", text)}
              placeholder="HH:MM:SS"
            />
            <TouchableOpacity style={styles.removeButton} onPress={() => handleRemoveSpecificDate(index)}>
              <Ionicons name="trash-outline" size={24} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <Button onPress={handleAddSpecificDate} style={{ marginTop: 10 }}>
        <View style={styles.buttonContent}>
          <Ionicons name="add-circle-outline" size={16} color={Colors[colorScheme].buttonText} />
          <ThemedText style={styles.buttonText}>Add Date</ThemedText>
        </View>
      </Button>
    </View>
  );

  // Render rotating rules form
  const renderRotatingRulesForm = () => (
    <View style={styles.patternSection}>
      <ThemedText style={styles.patternTitle}>Rotating Rules</ThemedText>
      <ThemedText style={styles.description}>Define a sequence of meeting rules that will rotate in order.</ThemedText>

      {(rotatingRules || []).map((rule, index) => (
        <View key={index} style={styles.rotatingRuleItem}>
          <ThemedText style={styles.ruleHeader}>Rule {index + 1}</ThemedText>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Rule Type:</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={rule.rule_type}
                onValueChange={(value) => handleUpdateRotatingRule(index, "rule_type", value)}
                style={styles.picker}
                dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
              >
                <Picker.Item label="Day of Month" value="day_of_month" />
                <Picker.Item label="Nth Day of Month" value="nth_day_of_month" />
              </Picker>
            </View>
          </View>

          {rule.rule_type === "day_of_month" ? (
            <View style={styles.inputRow}>
              <ThemedText style={styles.inputLabel}>Day of Month:</ThemedText>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rule.day_of_month?.toString() || "1"}
                  onValueChange={(value) => handleUpdateRotatingRule(index, "day_of_month", value)}
                  style={styles.picker}
                  dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <Picker.Item key={day} label={`${day}`} value={`${day}`} />
                  ))}
                </Picker>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.inputRow}>
                <ThemedText style={styles.inputLabel}>Week of Month:</ThemedText>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={rule.week_of_month?.toString() || "1"}
                    onValueChange={(value) => handleUpdateRotatingRule(index, "week_of_month", value)}
                    style={styles.picker}
                    dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
                  >
                    <Picker.Item label="First" value="1" />
                    <Picker.Item label="Second" value="2" />
                    <Picker.Item label="Third" value="3" />
                    <Picker.Item label="Fourth" value="4" />
                    <Picker.Item label="Last" value="5" />
                  </Picker>
                </View>
              </View>
              <View style={styles.inputRow}>
                <ThemedText style={styles.inputLabel}>Day of Week:</ThemedText>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={rule.day_of_week?.toString() || "1"}
                    onValueChange={(value) => handleUpdateRotatingRule(index, "day_of_week", value)}
                    style={styles.picker}
                    dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
                  >
                    <Picker.Item label="Sunday" value="0" />
                    <Picker.Item label="Monday" value="1" />
                    <Picker.Item label="Tuesday" value="2" />
                    <Picker.Item label="Wednesday" value="3" />
                    <Picker.Item label="Thursday" value="4" />
                    <Picker.Item label="Friday" value="5" />
                    <Picker.Item label="Saturday" value="6" />
                  </Picker>
                </View>
              </View>
            </>
          )}

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Time:</ThemedText>
            <ThemedTextInput
              style={styles.timeInput}
              value={rule.time || defaultTime}
              onChangeText={(text) => handleUpdateRotatingRule(index, "time", text)}
              placeholder="HH:MM:SS"
            />
          </View>

          {(rotatingRules || []).length > 1 && (
            <TouchableOpacity style={styles.removeRuleButton} onPress={() => handleRemoveRotatingRule(index)}>
              <ThemedText style={styles.removeButtonText}>Remove Rule</ThemedText>
            </TouchableOpacity>
          )}

          <View style={styles.ruleDivider} />
        </View>
      ))}

      <Button onPress={handleAddRotatingRule} style={{ marginTop: 10 }}>
        <View style={styles.buttonContent}>
          <Ionicons name="add-circle-outline" size={16} color={Colors[colorScheme].buttonText} />
          <ThemedText style={styles.buttonText}>Add Rule</ThemedText>
        </View>
      </Button>
    </View>
  );

  // Render pattern form based on selected type
  const renderPatternForm = () => {
    switch (meetingPatternType) {
      case "day_of_month":
        return renderDayOfMonthForm();
      case "nth_day_of_month":
        return renderNthDayOfMonthForm();
      case "specific_date":
        return renderSpecificDatesForm();
      case "rotating":
        return renderRotatingRulesForm();
      default:
        return null;
    }
  };

  const formattedDate = (date: Date): string => {
    return format(date, "MMMM d, yyyy");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <ThemedText style={styles.title}>Meeting Pattern Editor</ThemedText>

      {/* Basic Meeting Information */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Basic Information</ThemedText>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Meeting Type:</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={meetingType}
              onValueChange={setMeetingType}
              style={styles.picker}
              dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
            >
              <Picker.Item label="Regular" value="regular" />
              <Picker.Item label="Special" value="special" />
              <Picker.Item label="Committee" value="committee" />
            </Picker>
          </View>
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Location Name:</ThemedText>
          <ThemedTextInput
            style={styles.textInput}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Location Name"
          />
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Location Address:</ThemedText>
          <ThemedTextInput
            style={styles.textInput}
            value={locationAddress}
            onChangeText={setLocationAddress}
            placeholder="Location Address"
          />
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Default Time:</ThemedText>
          <ThemedTextInput
            style={styles.timeInput}
            value={defaultTime}
            onChangeText={setDefaultTime}
            placeholder="HH:MM:SS"
          />
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Time Zone:</ThemedText>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={timeZone}
              onValueChange={setTimeZone}
              style={styles.picker}
              dropdownIconColor={isDark ? Colors.dark.text : Colors.light.text}
            >
              {timeZones.map((zone) => (
                <Picker.Item key={zone} label={zone} value={zone} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>
            Adjust for DST:
            {dstTransition.isDstTransitionSoon && (
              <ThemedText style={styles.dstWarning}> (DST change approaching!)</ThemedText>
            )}
          </ThemedText>
          <Switch
            value={adjustForDst}
            onValueChange={setAdjustForDst}
            trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
          />
        </View>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Active:</ThemedText>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
          />
        </View>
      </View>

      {/* Pattern Type Selection */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Meeting Pattern Type</ThemedText>
        <View style={styles.patternTypeContainer}>
          {(["day_of_month", "nth_day_of_month", "specific_date", "rotating"] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.patternTypeButton, meetingPatternType === type && styles.selectedPatternType]}
              onPress={() => setMeetingPatternType(type)}
            >
              <ThemedText
                style={[styles.patternTypeText, meetingPatternType === type && styles.selectedPatternTypeText]}
              >
                {type === "day_of_month"
                  ? "Day of Month"
                  : type === "nth_day_of_month"
                  ? "Nth Day of Month"
                  : type === "specific_date"
                  ? "Specific Dates"
                  : "Rotating"}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pattern Form */}
      <View style={styles.section}>{renderPatternForm()}</View>

      {/* Calendar Preview */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Calendar Preview</ThemedText>
        <ThemedText style={styles.previewDescription}>
          Preview of upcoming meetings based on the selected pattern.
        </ThemedText>
        <Calendar
          current={previewDate}
          onMonthChange={(date: { dateString: string }) => setPreviewDate(date.dateString)}
          markedDates={previewMarkedDates}
          theme={{
            calendarBackground: isDark ? Colors.dark.background : Colors.light.background,
            textSectionTitleColor: isDark ? Colors.dark.text : Colors.light.text,
            textSectionTitleDisabledColor: isDark ? Colors.dark.textDim : Colors.light.textDim,
            selectedDayBackgroundColor: Colors[colorScheme].tint,
            selectedDayTextColor: Colors[colorScheme].background,
            todayTextColor: Colors[colorScheme].tint,
            dayTextColor: isDark ? Colors.dark.text : Colors.light.text,
            textDisabledColor: isDark ? Colors.dark.textDim : Colors.light.textDim,
            monthTextColor: isDark ? Colors.dark.text : Colors.light.text,
            arrowColor: Colors[colorScheme].tint,
          }}
        />
      </View>

      {/* Additional Settings */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Additional Settings</ThemedText>

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Meeting Notes:</ThemedText>
        </View>
        <ThemedTextInput
          style={styles.textArea}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          placeholder="Enter any general notes about this meeting pattern"
        />

        <View style={styles.inputRow}>
          <ThemedText style={styles.inputLabel}>Default Agenda:</ThemedText>
        </View>
        <ThemedTextInput
          style={styles.textArea}
          value={defaultAgenda}
          onChangeText={setDefaultAgenda}
          multiline
          numberOfLines={6}
          placeholder="Enter a default agenda template for meetings created from this pattern"
        />
      </View>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <Button variant="secondary" onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button onPress={handleSave} style={{ minWidth: 120 }} disabled={isValidating}>
          {isValidating ? "Validating..." : initialPattern?.id ? "Preview Changes" : "Save Pattern"}
        </Button>
      </View>

      {/* Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handlePreviewCancel}
      >
        {previewData && (
          <MeetingPatternChangePreview
            preview={previewData.preview}
            duplicateCheck={previewData.duplicateCheck}
            warnings={previewData.warnings}
            errors={previewData.errors}
            isValid={previewData.isValid}
            onConfirm={handlePreviewConfirm}
            onCancel={handlePreviewCancel}
            isLoading={false}
          />
        )}
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    width: 150,
  },
  textInput: {
    flex: 1,
    minWidth: 150,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.card,
  },
  timeInput: {
    width: 120,
    color: Colors.dark.text,
    backgroundColor: Colors.dark.background,
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
  textArea: {
    height: 100,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  patternTypeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  patternTypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedPatternType: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  patternTypeText: {
    fontSize: 14,
  },
  selectedPatternTypeText: {
    color: Colors.dark.buttonText,
    fontWeight: "500",
  },
  dstWarning: {
    color: "#ff9800",
    fontWeight: "bold",
  },
  patternSection: {
    marginTop: 8,
  },
  patternTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
  },
  specificDateItem: {
    marginBottom: 12,
  },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  removeButton: {
    padding: 8,
  },
  addButton: {
    marginTop: 8,
  },
  rotatingRuleItem: {
    marginBottom: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
  },
  ruleHeader: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 12,
  },
  removeRuleButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  removeButtonText: {
    color: "#f44336",
    fontWeight: "500",
  },
  ruleDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginTop: 16,
  },
  description: {
    fontSize: 14,
    marginBottom: 12,
    fontStyle: "italic",
  },
  previewDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  saveButton: {
    minWidth: 120,
  },
  cancelButton: {
    minWidth: 120,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
  },
});
