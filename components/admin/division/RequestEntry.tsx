import React, { useState, useEffect } from "react";
import { StyleSheet, Platform, ActivityIndicator, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Picker } from "@react-native-picker/picker";
import { Button } from "@/components/ui/Button";
import Toast from "react-native-toast-message";
import { useAdminMemberManagementStore } from "@/store/adminMemberManagementStore";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { useUserStore } from "@/store/userStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TextStyle, ViewStyle } from "react-native";
import { supabase } from "@/utils/supabase";
import { add, isValid } from "date-fns"; // Import date-fns for date calculation AND isValid
import { TablesInsert } from "@/types/supabase"; // Import Supabase type helper

interface RequestEntryProps {
  selectedDivision: string;
  selectedCalendarId: string | null;
}

type SubmissionState = "idle" | "submitting" | "success" | "error";

export function RequestEntry({ selectedDivision, selectedCalendarId: propSelectedCalendarId }: RequestEntryProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  // State from stores
  const { membersByCalendar, isLoadingMembersByCalendar, fetchMembersByCalendarId } = useAdminMemberManagementStore();
  const { calendars, vacationAllotmentWeeks, isLoadingVacationAllotmentWeeks, fetchVacationAllotmentWeeks } =
    useAdminCalendarManagementStore();
  const { member: adminUser } = useUserStore();

  // Local state for the selected calendar
  const [localSelectedCalendarId, setLocalSelectedCalendarId] = useState<string | null>(propSelectedCalendarId);

  // Get the current division's calendars
  const currentDivisionCalendars = calendars[selectedDivision] || [];

  // Local form state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMemberPin, setSelectedMemberPin] = useState<string | null>(null);
  const [selectedWeekStartDate, setSelectedWeekStartDate] = useState<string | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState<boolean>(false);

  // Effect to sync prop calendar with local state when prop changes
  useEffect(() => {
    if (propSelectedCalendarId !== localSelectedCalendarId) {
      setLocalSelectedCalendarId(propSelectedCalendarId);
    }
  }, [propSelectedCalendarId]);

  // Data fetching effect - now dependent on localSelectedCalendarId
  useEffect(() => {
    // Reset form and fetch data when calendar or year changes
    setSelectedMemberPin(null);
    setSelectedWeekStartDate(null);
    setFormError(null);
    setSubmissionState("idle");

    if (localSelectedCalendarId) {
      console.log(`[RequestEntry] Fetching data for Calendar ${localSelectedCalendarId}, Year ${selectedYear}`);
      fetchMembersByCalendarId(localSelectedCalendarId);
      fetchVacationAllotmentWeeks(localSelectedCalendarId, selectedYear);
    } else {
      // Clear data if no calendar is selected
      console.log("[RequestEntry] No calendar selected, clearing form.");
    }
  }, [localSelectedCalendarId, selectedYear, fetchMembersByCalendarId, fetchVacationAllotmentWeeks]);

  const handleCalendarChange = (calendarId: string | null) => {
    setLocalSelectedCalendarId(calendarId);
  };

  const handleYearChange = (year: number) => {
    // Basic validation: Ensure it's a reasonable year range if needed
    if (!isNaN(year) && year > 1999 && year < 2050) {
      setSelectedYear(year);
    } else {
      // Handle invalid input, maybe show a toast or keep the old value
      console.warn("[RequestEntry] Invalid year selected:", year);
      setSelectedYear(Number(year)); // Attempt conversion
    }
  };

  const handleSubmit = async () => {
    setSubmissionState("submitting");
    setFormError(null);

    if (!localSelectedCalendarId || !selectedMemberPin || !selectedWeekStartDate || !adminUser?.id) {
      setFormError("Missing required information (Calendar, Member, Week, or Admin User).");
      setSubmissionState("error");
      console.error("Form validation failed:", {
        localSelectedCalendarId,
        selectedMemberPin,
        selectedWeekStartDate,
        adminUserId: adminUser?.id,
      });
      return;
    }

    try {
      // 1. Calculate end_date (start_date + 6 days)
      const startDate = new Date(selectedWeekStartDate + "T00:00:00Z"); // Assume UTC or handle timezone appropriately
      if (!isValid(startDate)) {
        throw new Error("Invalid start date selected.");
      }
      const endDate = add(startDate, { days: 6 });
      const formattedStartDate = selectedWeekStartDate; // Already in yyyy-MM-dd
      const formattedEndDate = endDate.toISOString().split("T")[0]; // Format as yyyy-MM-dd

      // 2. Prepare payload
      const payload: TablesInsert<"vacation_requests"> = {
        pin_number: parseInt(selectedMemberPin, 10),
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        status: "approved", // Default status for admin entry
        calendar_id: localSelectedCalendarId,
        requested_at: new Date().toISOString(), // Set request time
        responded_at: new Date().toISOString(), // Set response time (approved immediately)
        responded_by: adminUser.id, // Admin who submitted
        actioned_at: new Date().toISOString(), // Set action time
        actioned_by: adminUser.id, // Admin who submitted
        // Add other required fields if any, ensure defaults are handled by DB
      };

      console.log("[RequestEntry] Submitting payload:", payload);

      // TODO: Add Zod validation here if desired

      // 3. Call Supabase insert
      const { error: insertError } = await supabase.from("vacation_requests").insert(payload);

      if (insertError) {
        console.error("[RequestEntry] Supabase insert error:", insertError);

        // Check if error is a unique constraint violation
        if (insertError.code === "23505" && insertError.message?.includes("unique_pin_start_date")) {
          throw new Error(
            `A vacation request for this member in the week starting ${selectedWeekStartDate} already exists.`
          );
        }

        throw new Error(insertError.message || "Failed to submit request to database.");
      }

      // 4. Handle success
      setSubmissionState("success");
      Toast.show({
        type: "success",
        text1: "Request Submitted",
        text2: `Vacation request for week ${selectedWeekStartDate} submitted successfully.`,
      });

      // Reset form after successful submission
      setSelectedMemberPin(null);
      setSelectedWeekStartDate(null);
      // Keep calendar and year selection

      setTimeout(() => setSubmissionState("idle"), 3000); // Reset state after showing success message
    } catch (error) {
      console.error("[RequestEntry] handleSubmit error:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setFormError(message);
      setSubmissionState("error");
      Toast.show({
        type: "error",
        text1: "Submission Failed",
        text2: message,
      });
    }
  };

  // Loading state check
  const isLoading = isLoadingMembersByCalendar || isLoadingVacationAllotmentWeeks || isLoadingCalendars;

  // Get members and weeks for the selected calendar/year
  const currentMembers = localSelectedCalendarId ? membersByCalendar[localSelectedCalendarId] || [] : [];
  const currentWeeks = localSelectedCalendarId
    ? vacationAllotmentWeeks[localSelectedCalendarId]?.[selectedYear] || []
    : [];

  // Define styles inside the component to access colorScheme
  const pickerBaseStyle: ViewStyle & TextStyle = {
    height: 50,
    width: "100%",
    backgroundColor: Colors[colorScheme].card,
    color: Colors[colorScheme].text,
  };

  const webPickerSpecificStyle =
    Platform.OS === "web"
      ? {
          padding: 10,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: Colors[colorScheme].border,
          fontSize: "1rem",
          cursor: "pointer",
        }
      : {};

  // Define OS-specific styles for native Picker
  const iosPickerSpecificStyle = {
    // iOS often looks better using native defaults, so we might override the background
    // Let's try removing the explicit background to see if the native feel is better
    // backgroundColor: undefined, // Or set to a specific iOS-like color if needed
    // Height might also be better handled by the native component
    height: undefined,
    // Add padding if necessary
    // paddingVertical: 12,
  };

  const androidPickerSpecificStyle = {
    // Android might need minor adjustments, e.g., padding
    paddingHorizontal: 8,
    height: undefined,
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    title: {
      marginBottom: 20,
      textAlign: "center",
    },
    inputGroup: {
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      marginBottom: 8,
      fontWeight: "500",
    },
    // Updated nativePicker style
    nativePicker: {
      ...pickerBaseStyle, // Apply base styles first
      ...(Platform.OS === "ios" ? iosPickerSpecificStyle : {}), // Apply iOS specific overrides
      ...(Platform.OS === "android" ? androidPickerSpecificStyle : {}), // Apply Android specific adjustments
    },
    submitButton: {
      marginTop: 20,
      backgroundColor: Colors[colorScheme].tint,
    },
    submitButtonText: {
      color: Colors[colorScheme].background,
    },
    errorText: {
      color: Colors[colorScheme].error,
      marginTop: 10,
      textAlign: "center",
    },
    loading: {
      marginTop: 30,
    },
    placeholderText: {
      color: Colors[colorScheme].textDim,
      textAlign: "center",
      marginTop: 40,
      fontSize: 16,
    },
    yearSelectorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    yearPickerContainer: {
      flex: 1,
    },
  });

  // Generate year options (e.g., current year +/- 2 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1];

  if (!selectedDivision) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.placeholderText}>Please select a division first.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.title}>
        Enter Vacation Request
      </ThemedText>

      {/* Calendar Selector */}
      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Calendar:</ThemedText>
        <View style={styles.yearPickerContainer}>
          {Platform.OS === "web" ? (
            <select
              value={localSelectedCalendarId || ""}
              onChange={(e) => handleCalendarChange(e.target.value || null)}
              style={{ ...pickerBaseStyle, ...webPickerSpecificStyle } as React.CSSProperties}
              disabled={currentDivisionCalendars.length === 0 || submissionState === "submitting"}
            >
              <option value="">Select Calendar...</option>
              {currentDivisionCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          ) : (
            <Picker
              selectedValue={localSelectedCalendarId}
              onValueChange={(itemValue) => handleCalendarChange(itemValue)}
              style={styles.nativePicker}
              enabled={currentDivisionCalendars.length > 0 && submissionState !== "submitting"}
              dropdownIconColor={Colors[colorScheme].text}
            >
              <Picker.Item label="Select Calendar..." value={null} />
              {currentDivisionCalendars.map((calendar) => (
                <Picker.Item key={calendar.id} label={calendar.name} value={calendar.id} />
              ))}
            </Picker>
          )}
        </View>
      </View>

      {/* Only show remaining form if a calendar is selected */}
      {localSelectedCalendarId ? (
        <>
          {/* Year Selector */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Year:</ThemedText>
            <View style={styles.yearPickerContainer}>
              {Platform.OS === "web" ? (
                <select
                  value={selectedYear}
                  onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                  style={{ ...pickerBaseStyle, ...webPickerSpecificStyle } as React.CSSProperties}
                  disabled={isLoading || submissionState === "submitting"}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              ) : (
                <Picker
                  selectedValue={selectedYear}
                  onValueChange={(itemValue) => handleYearChange(itemValue as number)}
                  style={styles.nativePicker}
                  enabled={!isLoading && submissionState !== "submitting"}
                  dropdownIconColor={Colors[colorScheme].text}
                >
                  {yearOptions.map((year) => (
                    <Picker.Item key={year} label={String(year)} value={year} />
                  ))}
                </Picker>
              )}
            </View>
          </View>

          {isLoading && <ActivityIndicator size="large" color={Colors[colorScheme].tint} style={styles.loading} />}

          {!isLoading && (
            <>
              {/* Member Selector */}
              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Member:</ThemedText>
                <View style={styles.yearPickerContainer}>
                  {Platform.OS === "web" ? (
                    <select
                      value={selectedMemberPin ?? ""}
                      onChange={(e) => setSelectedMemberPin(e.target.value || null)}
                      style={{ ...pickerBaseStyle, ...webPickerSpecificStyle } as React.CSSProperties}
                      disabled={currentMembers.length === 0 || submissionState === "submitting"}
                    >
                      <option value="">Select Member...</option>
                      {currentMembers.map((member) => (
                        <option key={member.pin_number} value={String(member.pin_number)}>
                          {`${member.last_name}, ${member.first_name} (${member.pin_number})`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Picker
                      selectedValue={selectedMemberPin}
                      onValueChange={(itemValue) => setSelectedMemberPin(itemValue)}
                      enabled={currentMembers.length > 0 && submissionState !== "submitting"}
                      style={styles.nativePicker}
                      dropdownIconColor={Colors[colorScheme].text}
                    >
                      <Picker.Item label="Select Member..." value={null} />
                      {currentMembers.map((member) => (
                        <Picker.Item
                          key={member.pin_number}
                          label={`${member.last_name}, ${member.first_name} (${member.pin_number})`}
                          value={String(member.pin_number)}
                        />
                      ))}
                    </Picker>
                  )}
                </View>
              </View>

              {/* Week Start Date Selector */}
              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Week Starting:</ThemedText>
                <View style={styles.yearPickerContainer}>
                  {Platform.OS === "web" ? (
                    <select
                      value={selectedWeekStartDate ?? ""}
                      onChange={(e) => setSelectedWeekStartDate(e.target.value || null)}
                      style={{ ...pickerBaseStyle, ...webPickerSpecificStyle } as React.CSSProperties}
                      disabled={currentWeeks.length === 0 || submissionState === "submitting"}
                    >
                      <option value="">Select Week...</option>
                      {currentWeeks.map((week) => (
                        <option key={week.week_start_date} value={week.week_start_date}>
                          {week.week_start_date} {/* Format date later */}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Picker
                      selectedValue={selectedWeekStartDate}
                      onValueChange={(itemValue) => setSelectedWeekStartDate(itemValue)}
                      enabled={currentWeeks.length > 0 && submissionState !== "submitting"}
                      style={styles.nativePicker}
                      dropdownIconColor={Colors[colorScheme].text}
                    >
                      <Picker.Item label="Select Week..." value={null} />
                      {currentWeeks.map((week) => (
                        <Picker.Item
                          key={week.week_start_date}
                          label={week.week_start_date} // Format date later if needed
                          value={week.week_start_date}
                        />
                      ))}
                    </Picker>
                  )}
                </View>
              </View>

              {/* Submit Button */}
              <Button
                onPress={handleSubmit}
                disabled={!selectedMemberPin || !selectedWeekStartDate || submissionState === "submitting" || isLoading}
                style={styles.submitButton}
              >
                <ThemedText style={styles.submitButtonText}>
                  {submissionState === "submitting" ? "Submitting..." : "Submit Request"}
                </ThemedText>
              </Button>

              {/* Error Message */}
              {formError && submissionState === "error" && (
                <ThemedText style={styles.errorText}>{formError}</ThemedText>
              )}
            </>
          )}
        </>
      ) : (
        <ThemedText style={styles.placeholderText}>Please select a calendar to continue.</ThemedText>
      )}
    </ThemedView>
  );
}

// Styles defined inside component now
