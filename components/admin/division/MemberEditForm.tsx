import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  Platform,
  Alert,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
  Modal as RNModal,
  TouchableWithoutFeedback,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { supabase } from "@/utils/supabase";
import { Picker } from "@react-native-picker/picker";
import Toast from "react-native-toast-message";
import { useAdminMemberManagementStore, type MemberData } from "@/store/adminMemberManagementStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Modal, Button } from "@/components/ui";

// Import the PLD calculation function from the store
import { calculatePLDs } from "@/store/adminCalendarManagementStore";

interface Division {
  id: number;
  name: string;
}

interface Zone {
  id: number;
  name: string;
  division_id: number;
}

interface MemberEditFormProps {
  member: MemberData;
  onClose: (updatedMember?: MemberData | null) => void;
}

interface AuthUser {
  email: string | null;
  phone: string | null;
}

export function MemberEditForm({ member, onClose }: MemberEditFormProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = useThemeColor({}, "tint");
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "border");

  const { width } = useWindowDimensions();
  const isMobileView = width < 768;
  const isWeb = Platform.OS === "web";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<string | null>(null);
  const [webDatePickerModalVisible, setWebDatePickerModalVisible] = useState(false);
  const [currentDateField, setCurrentDateField] = useState<string | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // Member data
  const [formData, setFormData] = useState<any>({});
  const [originalData, setOriginalData] = useState<any>({});
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [changedFields, setChangedFields] = useState<Array<{ field: string; oldValue: any; newValue: any }>>([]);

  // Divisions and Zones data
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [allZones, setAllZones] = useState<Zone[]>([]);
  const [filteredZones, setFilteredZones] = useState<Zone[]>([]);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(false);
  const [isLoadingZones, setIsLoadingZones] = useState(false);

  const { availableCalendars, updateMember } = useAdminMemberManagementStore();

  // Role-based permission helper functions
  const isDivisionAdmin = useCallback(() => {
    return currentUserRole === "division_admin";
  }, [currentUserRole]);

  const canEditField = useCallback(
    (fieldName: string) => {
      // Division admins can't edit these fields
      const divisionAdminReadonlyFields = [
        "division_id",
        "current_zone_id",
        "home_zone_id",
        "calendar_id",
        "system_sen_type",
        "rank",
        "deleted",
      ];

      if (isDivisionAdmin() && divisionAdminReadonlyFields.includes(fieldName)) {
        return false;
      }

      return true;
    },
    [isDivisionAdmin]
  );

  const canViewSection = useCallback(
    (sectionName: string) => {
      // Division admins can't view these sections
      const divisionAdminHiddenSections = ["seniority"];

      if (isDivisionAdmin() && divisionAdminHiddenSections.includes(sectionName)) {
        return false;
      }

      return true;
    },
    [isDivisionAdmin]
  );

  // Get current user role
  useEffect(() => {
    const getCurrentUserRole = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data: userData, error } = await supabase
            .from("members")
            .select("role")
            .eq("id", session.user.id)
            .single();

          if (!error && userData) {
            setCurrentUserRole(userData.role);
            console.log("Current user role:", userData.role);
          }
        }
      } catch (error) {
        console.error("Error getting current user role:", error);
      }
    };

    getCurrentUserRole();
  }, []);

  // Fetch all divisions
  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        setIsLoadingDivisions(true);
        const { data, error } = await supabase.from("divisions").select("id, name").order("name");

        if (error) throw error;

        setDivisions(data || []);
      } catch (error) {
        console.error("Error fetching divisions:", error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to load divisions",
        });
      } finally {
        setIsLoadingDivisions(false);
      }
    };

    fetchDivisions();
  }, []);

  // Fetch all zones
  useEffect(() => {
    const fetchZones = async () => {
      try {
        setIsLoadingZones(true);
        const { data, error } = await supabase.from("zones").select("id, name, division_id").order("name");

        if (error) throw error;

        setAllZones(data || []);
      } catch (error) {
        console.error("Error fetching zones:", error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to load zones",
        });
      } finally {
        setIsLoadingZones(false);
      }
    };

    fetchZones();
  }, []);

  // Filter zones based on selected division
  useEffect(() => {
    if (formData.division_id && allZones.length > 0) {
      const zonesForDivision = allZones.filter((zone) => zone.division_id === formData.division_id);
      setFilteredZones(zonesForDivision);

      // Reset zone if it doesn't belong to the selected division
      if (formData.current_zone_id && !zonesForDivision.some((zone) => zone.id === formData.current_zone_id)) {
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          current_zone_id: "",
        }));
      }
    } else {
      setFilteredZones([]);
    }
  }, [formData.division_id, allZones]);

  // Calculate max_plds if missing
  const calculateMaxPLDs = useCallback(() => {
    if (formData && (!formData.max_plds || formData.max_plds === 0) && formData.company_hire_date) {
      try {
        // Calculate PLDs based on hire date
        const maxPlds = calculatePLDs(formData.company_hire_date);

        // Update the form data
        setFormData((prev: Record<string, any>) => ({
          ...prev,
          max_plds: maxPlds,
        }));

        // Mark as unsaved to prompt saving
        setHasUnsavedChanges(true);

        console.log("Calculated max PLDs:", maxPlds);
      } catch (error) {
        console.error("Error calculating max PLDs:", error);
      }
    }
  }, [formData]);

  // Fetch the full member data
  useEffect(() => {
    const fetchMemberDetails = async () => {
      try {
        setIsLoading(true);
        const pinNumber = typeof member.pin_number === "string" ? parseInt(member.pin_number) : member.pin_number;

        // Fetch the full member details
        const { data, error } = await supabase.from("members").select("*").eq("pin_number", pinNumber).single();

        if (error) throw error;

        // Get auth user data with admin privileges
        try {
          const { data: authData, error: authError } = await supabase.rpc("admin_get_member_auth", {
            member_pin_number: pinNumber,
          });

          if (authError) {
            console.error("Error fetching auth data:", authError);
          } else if (authData) {
            console.log("Auth data:", authData);

            if (authData.email || authData.phone) {
              setAuthUser({
                email: authData.email || null,
                phone: authData.phone || null,
              });
            }
          }
        } catch (authError) {
          console.error("Error in admin_get_member_auth call:", authError);
        }

        setFormData(data);
        setOriginalData(data);
      } catch (error) {
        console.error("Error fetching member details:", error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: "Failed to load member details",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMemberDetails();
  }, [member.pin_number]);

  // Check and calculate max PLDs if needed after member data is loaded
  useEffect(() => {
    if (!isLoading && formData) {
      calculateMaxPLDs();
    }
  }, [isLoading, formData, calculateMaxPLDs]);

  // Track changes to form data
  useEffect(() => {
    if (!isLoading && formData && originalData) {
      // Calculate changed fields
      const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];

      // List of fields to check for changes (add more fields as needed)
      const fieldsToCheck = [
        { key: "pin_number", label: "PIN Number" },
        { key: "first_name", label: "First Name" },
        { key: "last_name", label: "Last Name" },
        { key: "date_of_birth", label: "Date of Birth" },
        { key: "status", label: "Status" },
        { key: "division_id", label: "Division" },
        { key: "current_zone_id", label: "Zone" },
        { key: "home_zone_id", label: "Home Zone" },
        { key: "calendar_id", label: "Calendar" },
        { key: "role", label: "Role" },
        { key: "company_hire_date", label: "Company Hire Date" },
        { key: "engineer_date", label: "Engineer Date" },
        { key: "system_sen_type", label: "System Sen Type" },
        { key: "rank", label: "Rank" },
        { key: "deleted", label: "Deleted" },
        { key: "curr_vacation_weeks", label: "Current Vacation Weeks" },
        { key: "curr_vacation_split", label: "Current Vacation Split" },
        { key: "sdv_entitlement", label: "SDV Entitlement" },
        { key: "pld_rolled_over", label: "PLD Rolled Over" },
        { key: "max_plds", label: "Max PLDs" },
        { key: "next_vacation_weeks", label: "Next Vacation Weeks" },
        { key: "next_vacation_split", label: "Next Vacation Split" },
        { key: "sdv_election", label: "SDV Election" },
        { key: "prior_vac_sys", label: "Prior Vac Sys" },
        { key: "wc_sen_roster", label: "WC Seniority Roster" },
        { key: "dwp_sen_roster", label: "DWP Seniority Roster" },
        { key: "dmir_sen_roster", label: "DMIR Seniority Roster" },
        { key: "eje_sen_roster", label: "EJE Seniority Roster" },
        { key: "misc_notes", label: "Misc Notes" },
      ];

      // Helper function to format value for display
      const formatValue = (key: string, value: any): string => {
        // Handle specific field formatting
        if (key.includes("date") && value) {
          return formatDate(value) || "Not set";
        }

        // Handle division and zone lookups
        if (key === "division_id" && value) {
          const division = divisions.find((d) => d.id === value);
          return division ? division.name : String(value);
        }

        if (key === "current_zone_id" || key === "home_zone_id") {
          const zone = allZones.find((z) => z.id === value);
          return zone ? zone.name : String(value);
        }

        if (key === "calendar_id" && value) {
          const calendar = availableCalendars.find((c) => c.id === value);
          return calendar ? calendar.name : String(value);
        }

        // Handle boolean values
        if (typeof value === "boolean") {
          return value ? "Yes" : "No";
        }

        // Default formatting
        return value !== null && value !== undefined && value !== "" ? String(value) : "Not set";
      };

      // Check each field for changes
      fieldsToCheck.forEach(({ key, label }) => {
        const oldValue = originalData[key];
        const newValue = formData[key];

        // Consider null and empty string as equivalent for comparison unless one is undefined
        const areEquivalent =
          oldValue === newValue || (oldValue === null && newValue === "") || (oldValue === "" && newValue === null);

        if (areEquivalent) return;

        // Add to changed fields
        changes.push({
          field: label,
          oldValue: formatValue(key, oldValue),
          newValue: formatValue(key, newValue),
        });
      });

      setChangedFields(changes);
      setHasUnsavedChanges(changes.length > 0);
    }
  }, [formData, originalData, isLoading, divisions, allZones, availableCalendars]);

  // Handle field changes
  const handleChange = (field: string, value: any) => {
    // If the value from a picker is an empty string, store null internally
    // if it's a field that should represent 'no selection' with null.
    // For simplicity now, we'll store "" directly as picker now uses it.
    // Consider converting back to null on save if needed.
    setFormData((prev: Record<string, any>) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      // Attempt to create a date, handle potential invalid date strings
      // If the string contains timezone info, Date() might adjust it.
      // We want to preserve the YYYY-MM-DD part as is.
      // Check if the string looks like YYYY-MM-DD format already.
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(dateString)) {
        return dateString;
      }
      // Otherwise, try parsing and formatting, but be cautious of timezones
      const date = new Date(dateString);
      // Check if the date is valid before formatting
      if (isNaN(date.getTime())) {
        return ""; // Return empty string for invalid dates
      }
      // Extract year, month, day parts carefully to avoid timezone shifts
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Month is 0-indexed
      const day = date.getDate().toString().padStart(2, "0");
      // Construct the YYYY-MM-DD string manually
      return `${year}-${month}-${day}`;
    } catch (e) {
      console.warn("Error formatting date:", dateString, e);
      return ""; // Return empty string on error
    }
  };

  // Handle date field click
  const handleDateFieldClick = (field: string) => {
    if (Platform.OS === "web") {
      // For web, handle desktop vs mobile differently
      if (isMobileView) {
        // On mobile web, use a native-like date input in a modal
        setCurrentDateField(field);
        const currentDate = formData[field] ? new Date(formData[field]) : new Date();
        setTempDate(currentDate);
        setWebDatePickerModalVisible(true);
      } else {
        // On desktop web, show the inline date picker
        setCurrentDateField(field);
        const currentDate = formData[field] ? new Date(formData[field]) : new Date();
        setTempDate(currentDate);
        setWebDatePickerModalVisible(true);
      }
    } else {
      // For native iOS/Android, use the platform picker
      setShowDatePicker(field);
    }
  };

  // Handle web date picker apply
  const handleWebDateApply = () => {
    if (currentDateField) {
      // Format date in YYYY-MM-DD format
      const formattedDate = tempDate.toISOString().split("T")[0];
      handleChange(currentDateField, formattedDate);

      // If changing company hire date, recalculate max PLDs
      if (currentDateField === "company_hire_date") {
        setTimeout(calculateMaxPLDs, 0);
      }
    }
    setWebDatePickerModalVisible(false);
    setCurrentDateField(null);
  };

  // Handle web date picker cancel
  const handleWebDateCancel = () => {
    setWebDatePickerModalVisible(false);
    setCurrentDateField(null);
  };

  // Handle date changes for native picker
  const handleDateChange = (field: string, date: Date | undefined) => {
    setShowDatePicker(null); // Hide picker regardless of selection
    if (date) {
      handleChange(field, date.toISOString().split("T")[0]);

      // If changing company hire date, recalculate max PLDs
      if (field === "company_hire_date") {
        setTimeout(calculateMaxPLDs, 0);
      }
    }
  };

  // Save changes to the database
  const handleSave = async () => {
    let updatedMemberData: MemberData | null = null;
    try {
      setIsSaving(true);

      const pinNumber = typeof formData.pin_number === "string" ? parseInt(formData.pin_number) : formData.pin_number;

      // Prepare data for saving: Convert empty strings back to null where appropriate
      const dataToSave = { ...formData };
      Object.keys(dataToSave).forEach((key) => {
        const nullableKeys = [
          "division_id",
          "current_zone_id",
          "home_zone_id",
          "calendar_id",
          "sdv_entitlement",
          "sdv_election",
          "pld_rolled_over",
          "prior_vac_sys",
          "date_of_birth",
          "company_hire_date",
          "engineer_date",
          "curr_vacation_weeks",
          "curr_vacation_split",
          "next_vacation_weeks",
          "next_vacation_split",
          "wc_sen_roster",
          "dwp_sen_roster",
          "dmir_sen_roster",
          "eje_sen_roster",
          "max_plds",
          "misc_notes", // Misc notes can be null
          "user_id", // User ID can be null
          "rank", // Rank might be nullable
        ];

        if (nullableKeys.includes(key) && dataToSave[key] === "") {
          dataToSave[key] = null;
        }

        const numericKeys = [
          "pin_number",
          "division_id",
          "current_zone_id",
          "home_zone_id",
          "curr_vacation_weeks",
          "curr_vacation_split",
          "sdv_entitlement",
          "pld_rolled_over",
          "max_plds",
          "next_vacation_weeks",
          "next_vacation_split",
          "sdv_election",
          "prior_vac_sys",
          "wc_sen_roster",
          "dwp_sen_roster",
          "dmir_sen_roster",
          "eje_sen_roster",
          // rank might be string or number, handle carefully or ensure it's string/null
        ];
        if (numericKeys.includes(key)) {
          // Ensure '' becomes null for numeric fields, handle potential NaN
          const value = dataToSave[key];
          if (value === "" || value === null || value === undefined) {
            dataToSave[key] = null;
          } else {
            const parsedValue = parseFloat(value);
            dataToSave[key] = isNaN(parsedValue) ? null : parsedValue;
          }
        }
      });

      // Rank specific handling (if it should always be string)
      if (dataToSave.rank === null || dataToSave.rank === undefined) {
        dataToSave.rank = null;
      } else {
        dataToSave.rank = String(dataToSave.rank);
      }

      // Ensure boolean field is handled correctly
      dataToSave.deleted = Boolean(dataToSave.deleted);

      // Ensure pin_number is handled correctly (it should likely always be a number)
      dataToSave.pin_number =
        typeof dataToSave.pin_number === "string" ? parseInt(dataToSave.pin_number, 10) : dataToSave.pin_number;
      if (isNaN(dataToSave.pin_number)) {
        throw new Error("Invalid PIN Number provided.");
      }
      // Remove derived field before saving
      delete dataToSave.calendar_name;

      const { error } = await supabase.from("members").update(dataToSave).eq("pin_number", pinNumber);

      if (error) throw error;

      // --- Fetch the single updated member record --- START
      const { data: fetchedMember, error: fetchError } = await supabase
        .from("members")
        .select("*") // Select all fields to match the Member type potentially
        .eq("pin_number", pinNumber)
        .single();

      if (fetchError) {
        console.warn("Failed to fetch updated member data after save:", fetchError);
        // Continue closing, but maybe show a different message or log?
      } else if (fetchedMember) {
        // Get calendar name
        const calendarMap = new Map(availableCalendars?.map((cal) => [cal.id, cal.name]) || []);
        // Format the fetched data into the Member type
        updatedMemberData = {
          ...fetchedMember,
          pin_number: fetchedMember.pin_number, // Ensure correct type if needed
          calendar_name: fetchedMember.calendar_id ? calendarMap.get(fetchedMember.calendar_id) || null : null,
        } as MemberData; // Use MemberData type
      }
      // --- Fetch the single updated member record --- END

      // Remove direct store update call
      // await updateMember();

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Member updated successfully",
      });

      setOriginalData(formData); // Update original data to reflect saved state
      setHasUnsavedChanges(false);
      setChangedFields([]); // Clear changed fields list
      // Close the form and pass back the updated data
      onClose(updatedMemberData);
    } catch (error) {
      console.error("Error updating member:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      Toast.show({
        type: "error",
        text1: "Error",
        text2: `Failed to update member: ${errorMessage}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle close with unsaved changes confirmation
  const handleCloseAttempt = useCallback(() => {
    if (hasUnsavedChanges) {
      // Show the confirmation modal instead of platform-specific alerts
      setIsConfirmModalVisible(true);
    } else {
      // Pass null when closing without saving
      onClose(null);
    }
  }, [hasUnsavedChanges, onClose]);

  // Handle Web date input
  const handleWebDateInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = event.target.value;
    if (newDate && currentDateField) {
      try {
        // Parse the date string directly without adding time info
        setTempDate(new Date(newDate));
      } catch (e) {
        console.warn("Invalid date input:", newDate);
      }
    }
  };

  // Render a text input field
  const renderTextField = (
    label: string,
    field: string,
    placeholder: string = "",
    keyboardType: any = "default",
    multiline: boolean = false
  ) => (
    <View style={styles.fieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          !canEditField(field) && styles.readonlyInput,
          {
            color: textColor,
            borderColor: borderColor,
            backgroundColor: backgroundColor,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={Colors[colorScheme].text + "80"}
        // Ensure value is always a string for TextInput
        value={formData[field]?.toString() ?? ""}
        onChangeText={(text) => handleChange(field, text)}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        editable={canEditField(field)}
      />
    </View>
  );

  // Render a date picker field
  const renderDateField = (label: string, field: string) => (
    <View style={styles.fieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>

      {Platform.OS === "web" ? (
        // Web implementation
        <TouchableOpacityComponent
          style={[styles.dateInput, !canEditField(field) && styles.readonlyInput, { borderColor, backgroundColor }]}
          onPress={() => canEditField(field) && handleDateFieldClick(field)}
          disabled={!canEditField(field)}
        >
          <View style={styles.dateInputContent}>
            <ThemedText>{formData[field] ? formatDate(formData[field]) : "Select Date"}</ThemedText>
            <Ionicons name="calendar-outline" size={18} color={textColor} style={{ opacity: 0.7 }} />
          </View>
        </TouchableOpacityComponent>
      ) : (
        // Native mobile implementation
        <>
          <TouchableOpacityComponent
            style={[styles.dateInput, !canEditField(field) && styles.readonlyInput, { borderColor, backgroundColor }]}
            onPress={() => canEditField(field) && handleDateFieldClick(field)}
            disabled={!canEditField(field)}
          >
            <View style={styles.dateInputContent}>
              <ThemedText>{formData[field] ? formatDate(formData[field]) : "Select Date"}</ThemedText>
              <Ionicons
                name={Platform.OS === "ios" ? "calendar-outline" : "calendar"}
                size={18}
                color={textColor}
                style={{ opacity: 0.7 }}
              />
            </View>
          </TouchableOpacityComponent>

          {showDatePicker === field && (
            <DateTimePicker
              value={formData[field] ? new Date(formData[field]) : new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => handleDateChange(field, date)}
              // Theme-aware styling for iOS
              textColor={Platform.OS === "ios" ? textColor : undefined}
              // Add iOS/Android specific props
              {...(Platform.OS === "ios"
                ? {
                    themeVariant: colorScheme,
                    style: { width: "100%" },
                  }
                : {})}
            />
          )}
        </>
      )}
    </View>
  );

  // Render a picker/dropdown field
  const renderPickerField = (label: string, field: string, options: { label: string; value: any }[]) => (
    <View style={styles.fieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <View style={[styles.pickerContainer, !canEditField(field) && styles.readonlyInput, { borderColor }]}>
        {Platform.OS === "web" ? (
          // Web implementation with better styling
          <View style={styles.webPickerWrapper}>
            <Picker
              selectedValue={formData[field] ?? ""}
              onValueChange={(value) => canEditField(field) && handleChange(field, value)}
              style={[
                styles.picker,
                styles.webPicker,
                {
                  color: textColor,
                  backgroundColor: backgroundColor,
                },
              ]}
              dropdownIconColor={textColor}
              accessibilityLabel={`Select ${label}`}
              enabled={canEditField(field)}
            >
              <Picker.Item label="Select..." value="" color={textColor} style={{ backgroundColor: backgroundColor }} />
              {options.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={textColor}
                  style={{ backgroundColor: backgroundColor }}
                />
              ))}
            </Picker>
            <Ionicons name="chevron-down" size={16} color={textColor} style={styles.webPickerIcon} />
          </View>
        ) : Platform.OS === "ios" ? (
          // iOS-specific implementation
          <Picker
            selectedValue={formData[field] ?? ""}
            onValueChange={(value) => canEditField(field) && handleChange(field, value)}
            style={[
              styles.picker,
              styles.iosPicker,
              {
                color: textColor,
                backgroundColor: backgroundColor,
              },
            ]}
            itemStyle={{
              fontSize: 16,
              height: 120,
              color: textColor,
            }}
            enabled={canEditField(field)}
          >
            <Picker.Item label="Select..." value="" />
            {options.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        ) : (
          // Android-specific implementation
          <Picker
            selectedValue={formData[field] ?? ""}
            onValueChange={(value) => canEditField(field) && handleChange(field, value)}
            style={[
              styles.androidPicker,
              {
                color: textColor,
                backgroundColor: backgroundColor,
              },
              !canEditField(field) && styles.readonlyInput,
            ]}
            dropdownIconColor={textColor}
            enabled={canEditField(field)}
            mode="dropdown"
          >
            <Picker.Item label="Select..." value="" style={{ backgroundColor: backgroundColor, color: textColor }} />
            {options.map((option) => (
              <Picker.Item
                key={option.value}
                label={option.label}
                value={option.value}
                style={{ backgroundColor: backgroundColor, color: textColor }}
              />
            ))}
          </Picker>
        )}
      </View>
    </View>
  );

  // Render a switch field
  const renderSwitchField = (label: string, field: string) => (
    <View style={styles.switchFieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {Platform.OS === "web" ? (
        // Web implementation with better styling
        <View style={styles.switchWrapper}>
          <Switch
            trackColor={{ false: Colors[colorScheme].border, true: tintColor }}
            thumbColor={formData[field] ? Colors[colorScheme].background : Colors[colorScheme].icon}
            ios_backgroundColor={Colors[colorScheme].border}
            onValueChange={(value) => (canEditField(field) ? handleChange(field, value) : undefined)}
            value={Boolean(formData[field])}
            accessibilityLabel={label}
            disabled={!canEditField(field)}
            style={isMobileView ? styles.mobileSwitch : styles.webSwitch}
          />
        </View>
      ) : (
        // Native implementation
        <Switch
          trackColor={{
            false: Platform.OS === "ios" ? Colors[colorScheme].border : Colors[colorScheme].textDim,
            true: tintColor,
          }}
          thumbColor={
            Platform.OS === "ios"
              ? Colors[colorScheme].background
              : formData[field]
              ? tintColor
              : Colors[colorScheme].icon
          }
          ios_backgroundColor={Colors[colorScheme].border}
          onValueChange={(value) => (canEditField(field) ? handleChange(field, value) : undefined)}
          value={Boolean(formData[field])}
          accessibilityLabel={label}
          disabled={!canEditField(field)}
        />
      )}
    </View>
  );

  // Render authUser information if available
  const renderAuthUserInfo = () => {
    if (!authUser) {
      return (
        <View style={[styles.authUserInfoContainer, { borderColor, backgroundColor: backgroundColor + "30" }]}>
          <ThemedText style={styles.authUserInfoLabel}>Auth User Info</ThemedText>
          <ThemedText style={styles.authUserInfoText}>Not registered</ThemedText>
        </View>
      );
    }

    return (
      <View style={[styles.authUserInfoContainer, { borderColor, backgroundColor: backgroundColor + "30" }]}>
        <ThemedText style={styles.authUserInfoLabel}>Auth User Info (Read Only)</ThemedText>
        <View style={styles.authUserInfoRow}>
          <ThemedText style={styles.authUserInfoField}>Email:</ThemedText>
          <ThemedText style={styles.authUserInfoValue} selectable>
            {authUser.email || "Not provided"}
          </ThemedText>
        </View>
        <View style={styles.authUserInfoRow}>
          <ThemedText style={styles.authUserInfoField}>Phone:</ThemedText>
          <ThemedText style={styles.authUserInfoValue} selectable>
            {authUser.phone || "Not provided"}
          </ThemedText>
        </View>
      </View>
    );
  };

  // Web date picker modal
  const renderWebDatePickerModal = () => {
    if (Platform.OS !== "web") return null;

    return (
      <RNModal
        visible={webDatePickerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleWebDateCancel}
      >
        <TouchableWithoutFeedback onPress={handleWebDateCancel}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View
                style={[
                  styles.modalContent,
                  isMobileView && styles.modalContentMobile,
                  { backgroundColor, borderColor },
                ]}
              >
                <ThemedText style={styles.modalTitle}>Select Date</ThemedText>

                {isMobileView ? (
                  // Mobile web date input
                  <View style={styles.mobileDateInputContainer}>
                    <input
                      type="date"
                      value={tempDate ? tempDate.toISOString().split("T")[0] : ""}
                      onChange={handleWebDateInputChange}
                      style={{
                        color: textColor,
                        backgroundColor: backgroundColor,
                        borderColor: borderColor,
                        borderWidth: 1,
                        borderRadius: 4,
                        padding: 12,
                        marginTop: 10,
                        marginBottom: 10,
                        fontSize: 16,
                        width: "100%",
                        maxWidth: "100%",
                        appearance: "none", // Remove browser styling
                      }}
                      aria-label="Select date"
                    />
                  </View>
                ) : (
                  // Desktop web date picker with more space
                  <View style={styles.desktopDatePickerContainer}>
                    <input
                      type="date"
                      value={tempDate ? tempDate.toISOString().split("T")[0] : ""}
                      onChange={handleWebDateInputChange}
                      style={{
                        color: textColor,
                        backgroundColor: backgroundColor,
                        borderColor: borderColor,
                        borderWidth: 1,
                        borderRadius: 4,
                        padding: 10,
                        marginTop: 10,
                        marginBottom: 20,
                        fontSize: 16,
                        width: "100%",
                      }}
                      aria-label="Select date"
                    />
                  </View>
                )}

                <View style={[styles.modalButtons, isMobileView && styles.modalButtonsMobile]}>
                  <TouchableOpacityComponent
                    style={[styles.modalButton, isMobileView && styles.modalButtonMobile, { borderColor }]}
                    onPress={handleWebDateCancel}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel date selection"
                  >
                    <ThemedText>Cancel</ThemedText>
                  </TouchableOpacityComponent>

                  <TouchableOpacityComponent
                    style={[
                      styles.modalButton,
                      styles.applyButton,
                      isMobileView && styles.modalButtonMobile,
                      { backgroundColor: tintColor },
                    ]}
                    onPress={handleWebDateApply}
                    accessibilityRole="button"
                    accessibilityLabel="Apply selected date"
                  >
                    <ThemedText style={{ color: backgroundColor }}>Apply</ThemedText>
                  </TouchableOpacityComponent>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </RNModal>
    );
  };

  // Status options for dropdown
  const statusOptions = [
    { label: "Active", value: "ACTIVE" },
    { label: "Inactive", value: "IN-ACTIVE" },
  ];

  // Role options with readable names
  const roleOptions = [
    { label: "Application Admin", value: "application_admin" },
    { label: "Union Admin", value: "union_admin" },
    { label: "Division Admin", value: "division_admin" },
    { label: "User", value: "user" },
  ];

  // Get filtered role options based on current user's role
  const getFilteredRoleOptions = useCallback(() => {
    // Default to just showing user role if we don't know current role
    if (!currentUserRole) {
      return roleOptions.filter((option) => option.value === "user");
    }

    // Define role hierarchy and permissions
    switch (currentUserRole) {
      case "application_admin":
        // Application admins can assign any role
        return roleOptions;
      case "union_admin":
        // Union admins can't assign application_admin role
        return roleOptions.filter((option) => option.value !== "application_admin");
      case "division_admin":
        // Division admins can only assign division_admin and user roles
        return roleOptions.filter((option) => option.value === "division_admin" || option.value === "user");
      default:
        // Regular users can't assign roles
        return roleOptions.filter((option) => option.value === "user");
    }
  }, [currentUserRole]);

  // System Seniority Type options from the database values
  const systemSenTypeOptions = [
    { label: "Wisconsin Central (WC)", value: "WC" },
    { label: "Duluth, Winnipeg & Pacific (DWP)", value: "DWP" },
    { label: "Duluth, Missabe & Iron Range (DMIR)", value: "DMIR" },
    { label: "Elgin, Joliet & Eastern (EJ&E)", value: "EJ&E" },
    { label: "System 1 (SYS1)", value: "SYS1" },
    { label: "System 2 (SYS2)", value: "SYS2" },
  ];

  // Division options
  const divisionOptions = divisions.map((division) => ({
    label: division.name,
    value: division.id,
  }));

  // Zone options (filtered by division for current_zone_id only)
  const zoneOptions = filteredZones.map((zone) => ({
    label: zone.name,
    value: zone.id,
  }));

  // All zones options for home_zone_id
  const allZoneOptions = allZones.map((zone) => ({
    label: zone.name,
    value: zone.id,
  }));

  // Calendar options - ensure the "No Calendar" option uses value ""
  const calendarOptions = [
    { label: "No Calendar Assigned", value: "" }, // Use "" instead of null
    ...availableCalendars.map((cal) => ({ label: cal.name, value: cal.id })),
  ];

  // Render section header
  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText} accessibilityRole="header">
        {title}
      </ThemedText>
      <View style={[styles.sectionDivider, { backgroundColor: borderColor }]} />
    </View>
  );

  // If still loading initial data
  if (isLoading || isLoadingDivisions || isLoadingZones) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Loading member details...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleContainer}>
          <ThemedText type="subtitle" style={styles.title}>
            Edit Member: {formData.first_name} {formData.last_name} ({formData.pin_number})
          </ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacityComponent
            style={styles.closeButton}
            onPress={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: isSaving || !hasUnsavedChanges }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={tintColor} />
            ) : (
              <Ionicons
                name="save-outline"
                size={24}
                color={isSaving || !hasUnsavedChanges ? Colors[colorScheme].textDim : textColor}
              />
            )}
          </TouchableOpacityComponent>
          <TouchableOpacityComponent
            style={styles.closeButton}
            onPress={handleCloseAttempt}
            accessibilityRole="button"
            accessibilityLabel="Close form"
          >
            <Ionicons name="close" size={24} color={textColor} />
          </TouchableOpacityComponent>
        </View>
      </View>

      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
        {renderAuthUserInfo()}
        {/* Basic Info Section */}
        {renderSectionHeader("Basic Information")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderTextField("PIN Number", "pin_number", "PIN Number", "numeric")}
            {renderTextField("First Name", "first_name", "First Name")}
            {renderTextField("Last Name", "last_name", "Last Name")}
            {renderDateField("Date of Birth", "date_of_birth")}
            {renderPickerField("Status", "status", statusOptions)}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderPickerField("Division", "division_id", divisionOptions)}
            {renderPickerField("Zone", "current_zone_id", zoneOptions)}
            {renderPickerField("Home Zone", "home_zone_id", allZoneOptions)}
            {/* Use updated calendarOptions */}
            {renderPickerField("Calendar", "calendar_id", calendarOptions)}
            {renderPickerField("Role", "role", getFilteredRoleOptions())}
          </View>
        </View>

        {/* Employment History Section */}
        {renderSectionHeader("Employment History")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderDateField("Company Hire Date", "company_hire_date")}
            {renderDateField("Engineer Date", "engineer_date")}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderPickerField("System Sen Type", "system_sen_type", systemSenTypeOptions)}
            {renderTextField("Rank", "rank", "Rank")}
            {/* Only render Deleted toggle for admins with appropriate permissions */}
            {!isDivisionAdmin() && renderSwitchField("Deleted", "deleted")}
          </View>
        </View>

        {/* Vacation Section */}
        {renderSectionHeader("Vacation Settings")}
        <View
          style={{
            marginBottom: 16,
            padding: 12,
            borderWidth: 1,
            borderRadius: 8,
            backgroundColor: "rgba(255, 200, 200, 0.1)",
            borderColor: Colors[colorScheme].error + "50",
          }}
        >
          <ThemedText style={{ color: Colors.dark.error, fontSize: 14, fontWeight: "500" }}>
            This is for MANUAL adjustment Only! Please use the Calendar(s) - Manage Time Off section to do regular
            updates as this is where all the calculations occur. This section is just to manually fix any errors.
          </ThemedText>
        </View>
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {/* Current Year Vacation */}
            {renderTextField("Current Vacation Weeks", "curr_vacation_weeks", "Total Current Year Weeks", "numeric")}
            {renderTextField("Current Vacation Split", "curr_vacation_split", "Current Split Weeks Count", "numeric")}
            {renderTextField("SDV Entitlement", "sdv_entitlement", "Current Year SDVs", "numeric")}
            {renderTextField("PLD Rolled Over", "pld_rolled_over", "PLDs Rolled Over", "numeric")}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {/* Next Year Vacation */}
            {renderTextField("Next Vacation Weeks", "next_vacation_weeks", "Total Next Year Weeks", "numeric")}
            {renderTextField("Next Vacation Split", "next_vacation_split", "Next Split Weeks Count", "numeric")}
            {renderTextField("SDV Election", "sdv_election", "Next Year SDVs", "numeric")}
            {renderTextField("Max PLDs", "max_plds", "Maximum PLDs", "numeric")}
          </View>
        </View>

        {/* Seniority Section - only show if user has permission */}
        {canViewSection("seniority") && (
          <>
            {renderSectionHeader("Seniority Rosters")}
            <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
              <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
                {renderTextField("WC Seniority Roster", "wc_sen_roster", "WC Seniority Roster", "numeric")}
                {renderTextField("DWP Seniority Roster", "dwp_sen_roster", "DWP Seniority Roster", "numeric")}
              </View>

              <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
                {renderTextField("DMIR Seniority Roster", "dmir_sen_roster", "DMIR Seniority Roster", "numeric")}
                {renderTextField("EJE Seniority Roster", "eje_sen_roster", "EJE Seniority Roster", "numeric")}
                {renderTextField("Prior Vac Sys", "prior_vac_sys", "Prior Vacation System", "numeric")}
              </View>
            </View>
          </>
        )}

        {/* Additional Notes */}
        {renderSectionHeader("Additional Information")}
        {renderTextField("Misc Notes", "misc_notes", "Miscellaneous Notes", "default", true)}

        <View style={styles.actionContainer}>
          <TouchableOpacityComponent
            style={[
              styles.actionButton,
              styles.saveButton,
              isSaving || !hasUnsavedChanges
                ? [styles.disabledButton, { backgroundColor: Colors[colorScheme].disabled }]
                : { backgroundColor: tintColor },
            ]}
            onPress={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: isSaving || !hasUnsavedChanges }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={backgroundColor} />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color={backgroundColor} />
                <ThemedText style={[styles.actionButtonText, { color: backgroundColor }]}>Save Changes</ThemedText>
              </>
            )}
          </TouchableOpacityComponent>

          <TouchableOpacityComponent
            style={[styles.actionButton, styles.cancelButton, { borderColor }]}
            onPress={handleCloseAttempt}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing"
          >
            <Ionicons name="close-outline" size={20} color={textColor} />
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacityComponent>
        </View>
      </ScrollView>

      {renderWebDatePickerModal()}

      {/* Confirmation Dialog for Unsaved Changes */}
      <Modal visible={isConfirmModalVisible} onClose={() => setIsConfirmModalVisible(false)} title="Unsaved Changes">
        <View style={styles.modalContent}>
          {changedFields.length > 0 ? (
            <>
              <ThemedText style={styles.modalSubtitle}>
                The following {changedFields.length} {changedFields.length === 1 ? "change" : "changes"} will be
                discarded:
              </ThemedText>
              <ScrollView style={styles.changesScrollView} showsVerticalScrollIndicator={true}>
                {changedFields
                  .sort((a, b) => a.field.localeCompare(b.field))
                  .map((change, index) => (
                    <View
                      key={index}
                      style={[
                        styles.changeRow,
                        {
                          backgroundColor: colorScheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
                          borderLeftColor: tintColor,
                        },
                      ]}
                    >
                      <ThemedText style={styles.changeField}>{change.field}</ThemedText>
                      <View style={styles.changeValuesContainer}>
                        <View style={styles.changeValue}>
                          <ThemedText style={[styles.oldValueLabel, { color: Colors[colorScheme].textDim }]}>
                            From:{" "}
                          </ThemedText>
                          <ThemedText style={[styles.oldValue, { color: Colors[colorScheme].textDim }]}>
                            {change.oldValue}
                          </ThemedText>
                        </View>
                        <View style={styles.changeValue}>
                          <ThemedText style={[styles.newValueLabel, { color: Colors[colorScheme].success }]}>
                            To:{" "}
                          </ThemedText>
                          <ThemedText style={[styles.newValue, { color: Colors[colorScheme].success }]}>
                            {change.newValue}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
              </ScrollView>
              <ThemedText style={styles.confirmationWarning}>Are you sure you want to exit without saving?</ThemedText>
            </>
          ) : (
            <ThemedText>You have unsaved changes. Are you sure you want to exit?</ThemedText>
          )}
          <View style={styles.modalButtons}>
            <Button variant="secondary" onPress={() => setIsConfirmModalVisible(false)} style={styles.cancelButton}>
              Cancel
            </Button>
            <Button
              variant="secondary" // Use secondary variant, apply custom styles if needed
              onPress={() => {
                setIsConfirmModalVisible(false);
                // Pass null when discarding changes
                onClose(null);
              }}
            >
              Discard Changes
            </Button>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleContainer: {
    flex: 1,
    marginRight: 8, // Add some space between title and buttons
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeButton: {
    padding: 8,
    borderRadius: 4,
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 16,
  },
  formColumnsDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8, // Negative margin to counteract padding on columns
  },
  formColumnMobile: {
    flexDirection: "column",
  },
  formColumn: {
    flex: 1,
    paddingHorizontal: 8, // Padding for spacing between columns
    minWidth: 300, // Ensure columns have a minimum width
  },
  fullWidth: {
    width: "100%",
    paddingHorizontal: 8, // Consistent padding
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 6,
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    width: "100%",
    fontSize: 14, // Ensure consistent font size
    ...(Platform.OS === "web" && {
      outlineColor: Colors.light.tint, // Use a defined color
      outlineOffset: 0,
      outlineStyle: "solid", // Explicitly set outline style
      outlineWidth: 0, // Start with 0, manage focus state if needed
    }),
  },
  readonlyInput: {
    opacity: 0.7,
    backgroundColor: "#f5f5f5",
  },
  multilineInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden", // Ensures border radius is applied correctly
    // Let the Picker component control its height on Android
    ...(Platform.OS !== "android" && { height: 40 }),
  },
  picker: {
    width: "100%",
    fontSize: 14, // Consistent font size
    // Base height for non-Android platforms
    ...(Platform.OS !== "android" && { height: 40 }),
    ...(Platform.OS === "web" && {
      height: 40, // Explicit height for web
      borderWidth: 0, // Remove default browser border inside the container
      paddingLeft: 10, // Adjust padding
      paddingRight: 30, // Space for dropdown arrow
      appearance: "none", // Remove default browser appearance
      backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="currentColor" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
      backgroundRepeat: "no-repeat",
      backgroundPositionX: "right",
      backgroundPositionY: "center",
    }),
  },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  dateInputContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 4, // Add some padding for better touch area
  },
  switchWrapper: {
    // Styling for web switch wrapper
  },
  webSwitch: {
    // Desktop web specific styling
  },
  mobileSwitch: {
    transform: [{ scale: 1.2 }], // Make mobile switches slightly larger
  },
  webPickerWrapper: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    height: 40, // Ensure wrapper has height for web
  },
  webPicker: {
    flex: 1,
    height: "100%", // Ensure picker fills the wrapper height
  },
  webPickerIcon: {
    position: "absolute",
    right: 10,
    pointerEvents: "none",
  },
  iosPicker: {
    height: 120, // Specific height for iOS spinner
  },
  androidPicker: {
    // Don't set a fixed height for Android, let it adjust
    width: "100%",
    fontSize: 14,
  },
  authUserInfoContainer: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  authUserInfoLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  authUserInfoText: {
    fontStyle: "italic",
  },
  authUserInfoRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  authUserInfoField: {
    fontWeight: "500",
    marginRight: 8,
    width: 80,
  },
  authUserInfoValue: {
    flex: 1,
  },
  actionContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 8,
    minWidth: 140,
  },
  saveButton: {
    borderWidth: 0,
  },
  cancelButton: {
    borderWidth: 1,
  },
  disabledButton: {
    opacity: 0.6, // Make disabled state more visually clear
  },
  actionButtonText: {
    fontWeight: "500",
    fontSize: 14,
  },
  cancelButtonText: {
    fontWeight: "500",
    fontSize: 14,
  },
  // Modal styles for web date picker
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    width: "90%", // Use percentage for responsiveness
    maxWidth: 400, // Max width for larger screens
    alignItems: "center",
    gap: 16,
  },
  modalContentMobile: {
    width: "95%",
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 16,
    textAlign: "center", // Center title
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around", // Better spacing for buttons
    width: "100%",
    marginTop: 16,
  },
  modalButtonsMobile: {
    marginTop: 12,
  },
  modalButton: {
    paddingVertical: 10, // Consistent padding
    paddingHorizontal: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  modalButtonMobile: {
    minWidth: 80,
    paddingHorizontal: 15,
  },
  applyButton: {
    borderWidth: 0,
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 16,
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  sectionDivider: {
    height: 1,
    width: "100%",
  },
  // Confirmation Modal styles
  modalSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 16,
    textAlign: "center",
  },
  changesScrollView: {
    width: "100%", // Ensure ScrollView takes full width
    maxHeight: 300, // Limit height
    marginBottom: 16,
    paddingHorizontal: 4, // Add slight padding
  },
  changeRow: {
    marginBottom: 12,
    padding: 10, // Increase padding
    borderRadius: 6,
    borderLeftWidth: 4, // Make border more prominent
    borderLeftColor: "transparent", // Set dynamically
    backgroundColor: "transparent", // Set dynamically
  },
  changeField: {
    fontWeight: "600",
    marginBottom: 6, // Increase spacing
  },
  changeValuesContainer: {
    // Keep as row, but allow wrapping if needed
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between", // Space out 'From' and 'To'
    alignItems: "flex-start", // Align items to the start
  },
  changeValue: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    flexBasis: "100%", // Start with full basis, wrap if needed
    // Adjust based on content length if wrapping becomes an issue
  },
  oldValueLabel: {
    fontWeight: "500",
    marginRight: 4,
    color: "transparent", // Set dynamically
  },
  oldValue: {
    color: "transparent", // Set dynamically
    flexShrink: 1, // Allow text to shrink if needed
  },
  newValueLabel: {
    fontWeight: "500",
    marginRight: 4,
    color: "transparent", // Set dynamically
  },
  newValue: {
    color: "transparent", // Set dynamically
    flexShrink: 1, // Allow text to shrink if needed
  },
  confirmationWarning: {
    fontStyle: "italic",
    marginBottom: 16,
    marginTop: 16,
    textAlign: "center",
  },
  mobileDateInputContainer: {
    width: "100%",
  },
  desktopDatePickerContainer: {
    width: "100%",
  },
});
