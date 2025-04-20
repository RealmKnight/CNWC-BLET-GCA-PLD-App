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
import { useAdminMemberManagementStore } from "@/store/adminMemberManagementStore";
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
  member: {
    pin_number: string | number;
    first_name: string;
    last_name: string;
    division_id: number;
    sdv_entitlement: number | null;
    sdv_election: number | null;
    calendar_id: string | null;
    calendar_name: string | null;
    status: string;
  };
  onClose: () => void;
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
          current_zone_id: null,
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

        // Get auth user data if the member has a user_id
        if (data.user_id) {
          const { data: userData, error: userError } = await supabase
            .from("auth_user_data")
            .select("email, phone")
            .eq("id", data.user_id)
            .single();

          if (!userError && userData) {
            setAuthUser({
              email: userData.email,
              phone: userData.phone,
            });
          }
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
        return value !== null && value !== undefined ? String(value) : "Not set";
      };

      // Check each field for changes
      fieldsToCheck.forEach(({ key, label }) => {
        const oldValue = originalData[key];
        const newValue = formData[key];

        // Skip if the values are exactly the same
        if (oldValue === newValue) return;

        // For dates, null, undefined and other special cases
        if (
          (oldValue === null && newValue === "") ||
          (oldValue === undefined && newValue === "") ||
          (oldValue === "" && newValue === null)
        ) {
          return;
        }

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
    setFormData((prev: Record<string, any>) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toISOString().split("T")[0]; // YYYY-MM-DD format
    } catch (e) {
      return dateString;
    }
  };

  // Handle date field click
  const handleDateFieldClick = (field: string) => {
    if (isWeb) {
      // For web, open a custom date picker modal
      setCurrentDateField(field);
      const currentDate = formData[field] ? new Date(formData[field]) : new Date();
      setTempDate(currentDate);
      setWebDatePickerModalVisible(true);
    } else {
      // For mobile, use the native picker
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
    if (date) {
      handleChange(field, date.toISOString().split("T")[0]);

      // If changing company hire date, recalculate max PLDs
      if (field === "company_hire_date") {
        setTimeout(calculateMaxPLDs, 0);
      }
    }
    setShowDatePicker(null);
  };

  // Save changes to the database
  const handleSave = async () => {
    try {
      setIsSaving(true);

      const pinNumber = typeof formData.pin_number === "string" ? parseInt(formData.pin_number) : formData.pin_number;

      const { error } = await supabase.from("members").update(formData).eq("pin_number", pinNumber);

      if (error) throw error;

      await updateMember(); // Wait for the update to complete

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Member updated successfully",
      });

      setHasUnsavedChanges(false);
      onClose(); // Close the form after successful save
    } catch (error) {
      console.error("Error updating member:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to update member",
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
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  // Handle Web date input
  const handleWebDateInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = event.target.value;
    if (newDate && currentDateField) {
      setTempDate(new Date(newDate));
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
          {
            color: textColor,
            borderColor: borderColor,
            backgroundColor: backgroundColor,
          },
        ]}
        placeholder={placeholder}
        placeholderTextColor={Colors[colorScheme].text + "80"}
        value={formData[field]?.toString() || ""}
        onChangeText={(text) => handleChange(field, text)}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );

  // Render a date picker field
  const renderDateField = (label: string, field: string) => (
    <View style={styles.fieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {isWeb ? (
        // Web implementation for date
        <TouchableOpacityComponent
          style={[styles.dateInput, { borderColor, backgroundColor }]}
          onPress={() => handleDateFieldClick(field)}
        >
          <ThemedText>{formData[field] ? formatDate(formData[field]) : "Select Date"}</ThemedText>
        </TouchableOpacityComponent>
      ) : (
        // Mobile native implementation
        <>
          <TouchableOpacityComponent
            style={[styles.dateInput, { borderColor, backgroundColor }]}
            onPress={() => handleDateFieldClick(field)}
          >
            <ThemedText>{formData[field] ? formatDate(formData[field]) : "Select Date"}</ThemedText>
          </TouchableOpacityComponent>

          {showDatePicker === field && (
            <DateTimePicker
              value={formData[field] ? new Date(formData[field]) : new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => handleDateChange(field, date)}
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
      <View style={[styles.pickerContainer, { borderColor }]}>
        <Picker
          selectedValue={formData[field]}
          onValueChange={(value) => handleChange(field, value)}
          style={[
            styles.picker,
            {
              color: textColor,
              backgroundColor: backgroundColor,
            },
          ]}
          dropdownIconColor={textColor}
        >
          <Picker.Item label="Select..." value={null} color={textColor} style={{ backgroundColor: backgroundColor }} />
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
      </View>
    </View>
  );

  // Render a switch field
  const renderSwitchField = (label: string, field: string) => (
    <View style={styles.switchFieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <Switch
        trackColor={{ false: Colors[colorScheme].border, true: tintColor }}
        thumbColor={formData[field] ? Colors[colorScheme].background : Colors[colorScheme].icon}
        ios_backgroundColor={Colors[colorScheme].border}
        onValueChange={(value) => handleChange(field, value)}
        value={Boolean(formData[field])}
      />
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
          <ThemedText style={styles.authUserInfoValue}>{authUser.email || "Not provided"}</ThemedText>
        </View>
        <View style={styles.authUserInfoRow}>
          <ThemedText style={styles.authUserInfoField}>Phone:</ThemedText>
          <ThemedText style={styles.authUserInfoValue}>{authUser.phone || "Not provided"}</ThemedText>
        </View>
      </View>
    );
  };

  // Web date picker modal
  const renderWebDatePickerModal = () => {
    if (!isWeb) return null;

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
              <View style={[styles.modalContent, { backgroundColor, borderColor }]}>
                <ThemedText style={styles.modalTitle}>Select Date</ThemedText>

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
                    marginBottom: 10,
                    fontSize: 16,
                    width: "100%",
                  }}
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacityComponent
                    style={[styles.modalButton, { borderColor }]}
                    onPress={handleWebDateCancel}
                  >
                    <ThemedText>Cancel</ThemedText>
                  </TouchableOpacityComponent>

                  <TouchableOpacityComponent
                    style={[styles.modalButton, styles.applyButton, { backgroundColor: tintColor }]}
                    onPress={handleWebDateApply}
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

  // Render section header
  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText}>{title}</ThemedText>
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
            Edit Member: {formData.first_name} {formData.last_name}
          </ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacityComponent
            style={styles.closeButton}
            onPress={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
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
          <TouchableOpacityComponent style={styles.closeButton} onPress={handleCloseAttempt}>
            <Ionicons name="close" size={24} color={textColor} />
          </TouchableOpacityComponent>
        </View>
      </View>

      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
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
            {renderPickerField(
              "Calendar",
              "calendar_id",
              [{ label: "No Calendar Assigned", value: "" }].concat(
                availableCalendars.map((cal) => ({ label: cal.name, value: cal.id }))
              )
            )}
            {renderPickerField("Role", "role", roleOptions)}
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
            {renderSwitchField("Deleted", "deleted")}
          </View>
        </View>

        {/* Vacation Section */}
        {renderSectionHeader("Vacation Settings")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {/* Current Year Vacation */}
            {renderTextField("Current Vacation Weeks", "curr_vacation_weeks", "Total Current Year Weeks", "numeric")}
            {renderTextField("Current Vacation Split", "curr_vacation_split", "Current Split Weeks Count", "numeric")}
            {renderTextField("SDV Entitlement", "sdv_entitlement", "Current Year SDVs", "numeric")}
            {renderTextField("PLD Rolled Over", "pld_rolled_over", "PLDs Rolled Over", "numeric")}
            {renderTextField("Max PLDs", "max_plds", "Maximum PLDs", "numeric")}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {/* Next Year Vacation */}
            {renderTextField("Next Vacation Weeks", "next_vacation_weeks", "Total Next Year Weeks", "numeric")}
            {renderTextField("Next Vacation Split", "next_vacation_split", "Next Split Weeks Count", "numeric")}
            {renderTextField("SDV Election", "sdv_election", "Next Year SDVs", "numeric")}
            {renderTextField("Prior Vac Sys", "prior_vac_sys", "Prior Vacation System", "numeric")}
          </View>
        </View>

        {/* Seniority Section */}
        {renderSectionHeader("Seniority Rosters")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderTextField("WC Seniority Roster", "wc_sen_roster", "WC Seniority Roster", "numeric")}
            {renderTextField("DWP Seniority Roster", "dwp_sen_roster", "DWP Seniority Roster", "numeric")}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderTextField("DMIR Seniority Roster", "dmir_sen_roster", "DMIR Seniority Roster", "numeric")}
            {renderTextField("EJE Seniority Roster", "eje_sen_roster", "EJE Seniority Roster", "numeric")}
          </View>
        </View>

        {/* Additional Notes */}
        {renderSectionHeader("Additional Information")}
        {renderTextField("Misc Notes", "misc_notes", "Miscellaneous Notes", "default", true)}
        {renderAuthUserInfo()}

        <View style={styles.actionContainer}>
          <TouchableOpacityComponent
            style={[
              styles.actionButton,
              styles.saveButton,
              isSaving || !hasUnsavedChanges
                ? [styles.disabledButton, { backgroundColor: "#6c757d" }]
                : { backgroundColor: tintColor },
            ]}
            onPress={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
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
              onPress={() => {
                setIsConfirmModalVisible(false);
                onClose();
              }}
              style={styles.applyButton}
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
    marginHorizontal: -8,
  },
  formColumnMobile: {
    flexDirection: "column",
  },
  formColumn: {
    flex: 1,
    paddingHorizontal: 8,
    minWidth: 300,
  },
  fullWidth: {
    width: "100%",
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
    ...(Platform.OS === "web" && {
      outlineColor: Colors.light.tint,
      outlineWidth: 0,
    }),
  },
  multilineInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  picker: {
    height: 40,
    width: "100%",
  },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  switchFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
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
    opacity: 0.5,
  },
  actionButtonText: {
    fontWeight: "500",
  },
  cancelButtonText: {
    fontWeight: "500",
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
    width: 300,
    alignItems: "center",
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "500",
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
  },
  modalButton: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
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
  modalSubtitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 16,
  },
  changesScrollView: {
    maxHeight: 300,
    marginBottom: 16,
  },
  changeRow: {
    marginBottom: 12,
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    backgroundColor: "transparent",
  },
  changeField: {
    fontWeight: "600",
    marginBottom: 4,
  },
  changeValuesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  changeValue: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  oldValueLabel: {
    fontWeight: "500",
    marginRight: 4,
    color: "transparent",
  },
  oldValue: {
    color: "transparent",
  },
  newValueLabel: {
    fontWeight: "500",
    marginRight: 4,
    color: "transparent",
  },
  newValue: {
    color: "transparent",
  },
  confirmationWarning: {
    fontStyle: "italic",
    marginBottom: 16,
    marginTop: 16,
    textAlign: "center",
  },
});
