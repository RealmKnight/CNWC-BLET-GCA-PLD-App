import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  Platform,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  ActivityIndicator,
  useWindowDimensions,
  GestureResponderEvent,
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

interface Division {
  id: number;
  name: string;
}

interface Zone {
  id: number;
  name: string;
  division_id: number;
}

interface AddMemberFormProps {
  onClose: (newMember?: MemberData | null) => void;
}

export function AddMemberForm({ onClose }: AddMemberFormProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = useThemeColor({}, "tint");
  const backgroundColor = useThemeColor({}, "background");
  const textColor = useThemeColor({}, "text");
  const borderColor = useThemeColor({}, "border");

  const { width } = useWindowDimensions();
  const isMobileView = width < 768;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [highestRank, setHighestRank] = useState<number | null>(null);
  const [isLoadingRank, setIsLoadingRank] = useState(false);
  const [highestPriorVacSys, setHighestPriorVacSys] = useState<number | null>(null);
  const [isLoadingPriorVacSys, setIsLoadingPriorVacSys] = useState(false);

  // Member data with default empty values - use 0 as the default division_id since null can cause type issues
  const [formData, setFormData] = useState<Partial<MemberData>>({
    pin_number: "",
    first_name: "",
    last_name: "",
    division_id: 0, // Use 0 instead of null to satisfy TypeScript
    current_zone_id: null,
    home_zone_id: null,
    calendar_id: null,
    status: "ACTIVE",
    role: "user",
    system_sen_type: "SYS2", // Default to "System 2 (SYS2)"
    rank: "",
    prior_vac_sys: null, // Added for System 2 rank field
    company_hire_date: "",
    engineer_date: "",
  });

  // Related data
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [allZones, setAllZones] = useState<Zone[]>([]);
  const [filteredZones, setFilteredZones] = useState<Zone[]>([]);
  const [isLoadingDivisions, setIsLoadingDivisions] = useState(false);
  const [isLoadingZones, setIsLoadingZones] = useState(false);

  const { availableCalendars, fetchAllMembers } = useAdminMemberManagementStore();

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
          }
        }
      } catch (error) {
        console.error("Error getting current user role:", error);
      }
    };

    getCurrentUserRole();
  }, []);

  // Fetch the highest prior_vac_sys from the database
  useEffect(() => {
    const fetchHighestPriorVacSys = async () => {
      try {
        setIsLoadingPriorVacSys(true);
        console.log("Fetching highest prior_vac_sys...");

        // Call the RPC function that exists in the database
        const { data, error } = await supabase.rpc("get_max_prior_vac_sys");

        if (error) {
          console.error("Error calling get_max_prior_vac_sys RPC:", error);
          // Use the alternative approach if the RPC call fails
          useAlternativeApproach();
          return;
        }

        console.log("RPC result:", data);

        if (data && data.max_value) {
          // Make sure we're parsing as a number
          const maxValue = parseInt(data.max_value, 10);
          console.log("Retrieved max prior_vac_sys:", maxValue);

          if (!isNaN(maxValue)) {
            const nextValue = maxValue + 1;
            console.log("Setting next prior_vac_sys to:", nextValue);

            setHighestPriorVacSys(nextValue);

            // Update form with string value for consistency
            setFormData((prev) => ({
              ...prev,
              prior_vac_sys: nextValue.toString(),
            }));
          } else {
            console.log("Retrieved value is not a number, using alternative approach");
            useAlternativeApproach();
          }
        } else {
          console.log("No max value returned, using alternative approach");
          useAlternativeApproach();
        }
      } catch (error) {
        console.error("Error fetching prior_vac_sys:", error);
        useAlternativeApproach();
      } finally {
        setIsLoadingPriorVacSys(false);
      }
    };

    // Alternative approach to find maximum prior_vac_sys
    const useAlternativeApproach = async () => {
      try {
        console.log("Using alternative approach for prior_vac_sys");

        // Fetch all prior_vac_sys values and find max directly
        const { data, error } = await supabase
          .from("members")
          .select("prior_vac_sys")
          .not("prior_vac_sys", "is", null)
          .not("prior_vac_sys", "eq", "");

        if (error) throw error;

        console.log("Alternative query results count:", data?.length);

        if (data && data.length > 0) {
          // Extract values and try to convert to numbers
          const values = data
            .map((item) => {
              // Make sure we're handling any type - could be string or number
              const val = item.prior_vac_sys;
              if (val === null || val === undefined) return null;

              // Parse to number if it's a string
              const num = typeof val === "string" ? parseInt(val, 10) : val;
              return isNaN(num) ? null : num;
            })
            .filter((val) => val !== null) as number[];

          console.log("Valid numeric values found:", values.length);

          if (values.length > 0) {
            // Find max and increment
            const maxValue = Math.max(...values);
            const nextValue = maxValue + 1;

            console.log("Max value found:", maxValue, "Next value:", nextValue);

            setHighestPriorVacSys(nextValue);
            setFormData((prev) => ({
              ...prev,
              prior_vac_sys: nextValue.toString(), // Use string for form data
            }));
          } else {
            console.log("No valid numeric values found, using default");
            setDefaultValue();
          }
        } else {
          console.log("No data returned from alternative query");
          setDefaultValue();
        }
      } catch (error) {
        console.error("Error in alternative approach:", error);
        setDefaultValue();
      }
    };

    // Default value function when all else fails
    const setDefaultValue = () => {
      const defaultValue = 1;
      console.log("Using default value:", defaultValue);
      setHighestPriorVacSys(defaultValue);
      setFormData((prev) => ({
        ...prev,
        prior_vac_sys: defaultValue.toString(), // Use string for form data
      }));
    };

    // Start the fetch process
    fetchHighestPriorVacSys();
  }, []);

  // Fetch the highest rank from the database
  useEffect(() => {
    const fetchHighestRank = async () => {
      try {
        setIsLoadingRank(true);
        console.log("Fetching highest rank...");

        // First approach: Get ranks that are purely numeric
        const { data, error } = await supabase
          .from("members")
          .select("rank")
          .filter("rank", "neq", null)
          .not("rank", "eq", "")
          .filter("rank", "~", "^[0-9]+$") // Correct regex for purely numeric values
          .order("rank", { ascending: false })
          .limit(1);

        if (error) throw error;

        console.log("Highest rank query result:", data);

        if (data && data.length > 0) {
          // Ensure we're dealing with a numeric rank
          const rankValue = data[0].rank;
          console.log("Retrieved rank value:", rankValue, "type:", typeof rankValue);

          if (rankValue && !isNaN(Number(rankValue))) {
            const nextRank = Number(rankValue) + 10;
            console.log("Setting next rank to:", nextRank);
            setHighestRank(nextRank);

            // Update the formData with the suggested rank
            setFormData((prev) => {
              console.log("Updating form data with rank:", nextRank.toString());
              return {
                ...prev,
                rank: nextRank.toString(),
              };
            });
          } else {
            console.log("Retrieved rank is not a valid number");

            // Fallback approach if the regex didn't work
            fallbackRankFetch();
          }
        } else {
          console.log("No numeric ranks found, trying fallback approach");
          fallbackRankFetch();
        }
      } catch (error) {
        console.error("Error fetching highest rank:", error);
        fallbackRankFetch();
      } finally {
        setIsLoadingRank(false);
      }
    };

    // Fallback approach that simply tries to order by rank numerically
    const fallbackRankFetch = async () => {
      try {
        console.log("Using fallback approach to find highest numeric rank");

        // Get all ranks and sort them client-side to find the highest numeric value
        const { data, error } = await supabase
          .from("members")
          .select("rank")
          .filter("rank", "neq", null)
          .not("rank", "eq", "");

        if (error) throw error;

        // Filter ranks that can be converted to numbers and find the highest
        if (data && data.length > 0) {
          const numericRanks = data
            .map((item) => item.rank)
            .filter((rank) => !isNaN(Number(rank)))
            .map(Number);

          console.log("Found numeric ranks:", numericRanks.length);

          if (numericRanks.length > 0) {
            const highestRank = Math.max(...numericRanks);
            const nextRank = highestRank + 10;
            console.log("Highest numeric rank:", highestRank, "Next rank:", nextRank);

            setHighestRank(nextRank);
            setFormData((prev) => ({
              ...prev,
              rank: nextRank.toString(),
            }));
          } else {
            console.log("No numeric ranks found, defaulting to 100");
            setHighestRank(100);
            setFormData((prev) => ({
              ...prev,
              rank: "100",
            }));
          }
        } else {
          console.log("No ranks found, defaulting to 100");
          setHighestRank(100);
          setFormData((prev) => ({
            ...prev,
            rank: "100",
          }));
        }
      } catch (error) {
        console.error("Error in fallback rank fetch:", error);
        // Default to 100 if all else fails
        setHighestRank(100);
        setFormData((prev) => ({
          ...prev,
          rank: "100",
        }));
      }
    };

    fetchHighestRank();
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

  // Fetch all zones with more debugging
  useEffect(() => {
    const fetchZones = async () => {
      try {
        setIsLoadingZones(true);
        console.log("Fetching zones from Supabase...");

        const { data, error } = await supabase.from("zones").select("id, name, division_id").order("name");

        if (error) throw error;

        console.log(`Fetched ${data?.length || 0} zones from database`);

        if (data && data.length > 0) {
          // Log some sample data to see structure
          console.log("Zone data example:", data[0]);
          console.log("Zone division_id type:", typeof data[0].division_id);

          // Check for unique division IDs
          const divisionIds = [...new Set(data.map((zone) => zone.division_id))];
          console.log(`Found zones for ${divisionIds.length} unique division IDs:`, divisionIds);

          // Count zones per division
          const countByDivision = divisionIds.reduce((acc, divId) => {
            acc[divId] = data.filter((zone) => zone.division_id === divId).length;
            return acc;
          }, {} as Record<number, number>);

          console.log("Zones count by division:", countByDivision);
        }

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

  // Filter zones based on selected division - with detailed debugging
  useEffect(() => {
    console.log("Division selection changed, current division_id:", formData.division_id);
    console.log("Total zones available:", allZones.length);
    console.log(
      "Zone division types:",
      allZones.slice(0, 2).map((z) => `ID: ${z.id}, Division ID: ${z.division_id} (type: ${typeof z.division_id})`)
    );
    console.log("Form data division_id type:", typeof formData.division_id);

    if (formData.division_id && formData.division_id !== 0 && allZones.length > 0) {
      // Ensure we're comparing the same types by converting to numbers
      const divisionIdNumber = Number(formData.division_id);
      const zonesForDivision = allZones.filter((zone) => {
        const zoneDivisionId = Number(zone.division_id);
        return zoneDivisionId === divisionIdNumber;
      });

      console.log(
        `After numeric conversion - Found ${zonesForDivision.length} zones for division ID ${divisionIdNumber}`
      );

      if (zonesForDivision.length === 0) {
        // If no zones found, try without type conversion as a fallback
        const zonesForDivisionFallback = allZones.filter((zone) => zone.division_id == formData.division_id); // Use == for loose comparison
        console.log(`Fallback with loose comparison - Found ${zonesForDivisionFallback.length} zones`);
        setFilteredZones(zonesForDivisionFallback);
      } else {
        setFilteredZones(zonesForDivision);
      }

      // Reset zone if it doesn't belong to the selected division
      if (formData.current_zone_id && !zonesForDivision.some((zone) => zone.id === formData.current_zone_id)) {
        setFormData((prev) => ({
          ...prev,
          current_zone_id: null,
        }));
      }
    } else {
      setFilteredZones([]);
    }
  }, [formData.division_id, allZones]);

  // Track unsaved changes
  useEffect(() => {
    // Check if we have essential fields filled out - this makes the form "dirty"
    const essentialFields = formData.pin_number && formData.first_name && formData.last_name;
    setHasUnsavedChanges(!!essentialFields);
  }, [formData]);

  // Handle field changes
  const handleChange = (field: string, value: any) => {
    console.log(`Field changed: ${field} = ${value}`);

    // For division changes, log extra info and ensure proper type handling
    if (field === "division_id") {
      console.log(`Changing division to: ${value} (type: ${typeof value})`);

      // Convert to number for consistent comparison
      const divisionIdNumber = Number(value);

      // First try exact type matching
      let zonesForThisDivision = allZones.filter((zone) => zone.division_id === divisionIdNumber);

      console.log(`Found ${zonesForThisDivision.length} zones for division ${divisionIdNumber} with exact match`);

      // If no results, try loose comparison
      if (zonesForThisDivision.length === 0) {
        zonesForThisDivision = allZones.filter((zone) => zone.division_id == value); // Use == for loose comparison
        console.log(`Found ${zonesForThisDivision.length} zones for division ${value} with loose comparison`);
      }

      if (zonesForThisDivision.length > 0) {
        console.log(
          "Zone examples:",
          zonesForThisDivision
            .slice(0, 3)
            .map((z) => z.name)
            .join(", ")
        );
      } else {
        console.log(
          "All available zones:",
          allZones.map((z) => `ID: ${z.id}, Division ID: ${z.division_id}, Name: ${z.name}`).join(" | ")
        );
      }
    }

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Validate the form data before submission
  const validateForm = (): string | null => {
    if (!formData.pin_number) return "PIN Number is required";
    if (!formData.first_name) return "First Name is required";
    if (!formData.last_name) return "Last Name is required";
    if (!formData.division_id) return "Division is required";
    if (!formData.status) return "Status is required";

    // Check if PIN is numeric and valid format
    const pinNumber = typeof formData.pin_number === "string" ? parseInt(formData.pin_number, 10) : formData.pin_number;

    if (isNaN(pinNumber) || pinNumber <= 0) {
      return "PIN Number must be a positive number";
    }

    return null; // No errors
  };

  // Create a new member
  const handleSave = async () => {
    try {
      // Validate form
      const validationError = validateForm();
      if (validationError) {
        Toast.show({
          type: "error",
          text1: "Validation Error",
          text2: validationError,
        });
        return;
      }

      setIsSaving(true);

      // Convert empty strings to null or undefined as appropriate for DB
      const dataToSave = { ...formData };
      Object.keys(dataToSave).forEach((key) => {
        if (dataToSave[key as keyof typeof dataToSave] === "") {
          // Use type assertion to allow either null or undefined
          (dataToSave as any)[key] = null;
        }
      });

      // Handle numeric fields specifically
      if (dataToSave.prior_vac_sys !== null && dataToSave.prior_vac_sys !== undefined) {
        // Convert to number if it's a string
        if (typeof dataToSave.prior_vac_sys === "string") {
          const parsedValue = parseInt(dataToSave.prior_vac_sys, 10);
          if (!isNaN(parsedValue)) {
            // Keep as string but make sure it's a clean integer string
            dataToSave.prior_vac_sys = parsedValue.toString();
          } else {
            dataToSave.prior_vac_sys = null;
          }
        }
      }

      // Make sure PIN is a number
      const pinNumber =
        typeof dataToSave.pin_number === "string" ? parseInt(dataToSave.pin_number, 10) : dataToSave.pin_number;

      dataToSave.pin_number = pinNumber;

      // Check if PIN already exists
      const { data: existingMember, error: checkError } = await supabase
        .from("members")
        .select("pin_number")
        .eq("pin_number", pinNumber)
        .single();

      if (!checkError && existingMember) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: `Member with PIN ${pinNumber} already exists`,
        });
        setIsSaving(false);
        return;
      }

      // Insert new member
      const { data: newMember, error } = await supabase.from("members").insert(dataToSave).select().single();

      if (error) throw error;

      // Get calendar name
      const calendarMap = new Map(availableCalendars?.map((cal) => [cal.id, cal.name]) || []);

      // Format the response
      const createdMember = {
        ...newMember,
        calendar_name: newMember.calendar_id ? calendarMap.get(newMember.calendar_id) || null : null,
      } as MemberData;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Member created successfully",
      });

      // Refresh the member list
      fetchAllMembers();

      // Close the form with the new member data
      onClose(createdMember);
    } catch (error) {
      console.error("Error creating member:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      Toast.show({
        type: "error",
        text1: "Error",
        text2: `Failed to create member: ${errorMessage}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle onClose with event parameter to make TypeScript happy
  const handleClose = (event?: GestureResponderEvent) => {
    onClose(null);
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
        value={formData[field as keyof typeof formData]?.toString() ?? ""}
        onChangeText={(text) => handleChange(field, text)}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );

  // Render a picker/dropdown field
  const renderPickerField = (
    label: string,
    field: string,
    options: { label: string; value: any }[],
    disabled: boolean = false,
    helpText?: string
  ) => (
    <View style={styles.fieldContainer}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {helpText && <ThemedText style={styles.fieldHelpText}>{helpText}</ThemedText>}
      <View style={[styles.pickerContainer, { borderColor }, disabled && styles.disabledPickerContainer]}>
        {Platform.OS === "web" ? (
          // Web implementation with better styling
          <View style={styles.webPickerWrapper}>
            <Picker
              selectedValue={formData[field as keyof typeof formData] ?? ""}
              onValueChange={(value) => !disabled && handleChange(field, value)}
              style={[
                styles.picker,
                styles.webPicker,
                {
                  color: disabled ? Colors[colorScheme].textDim : textColor,
                  backgroundColor: backgroundColor,
                },
              ]}
              dropdownIconColor={disabled ? Colors[colorScheme].textDim : textColor}
              accessibilityLabel={`Select ${label}`}
              enabled={!disabled}
            >
              <Picker.Item
                label={disabled ? (field === "current_zone_id" ? "Select Division first" : "Select...") : "Select..."}
                value=""
                color={disabled ? Colors[colorScheme].textDim : textColor}
                style={{ backgroundColor: backgroundColor }}
              />
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
            <Ionicons
              name="chevron-down"
              size={16}
              color={disabled ? Colors[colorScheme].textDim : textColor}
              style={styles.webPickerIcon}
            />
          </View>
        ) : Platform.OS === "ios" ? (
          // iOS-specific implementation
          <Picker
            selectedValue={formData[field as keyof typeof formData] ?? ""}
            onValueChange={(value) => !disabled && handleChange(field, value)}
            style={[
              styles.picker,
              styles.iosPicker,
              {
                color: disabled ? Colors[colorScheme].textDim : textColor,
                backgroundColor: backgroundColor,
              },
            ]}
            itemStyle={{
              fontSize: 16,
              height: 120,
              color: disabled ? Colors[colorScheme].textDim : textColor,
            }}
            enabled={!disabled}
          >
            <Picker.Item
              label={disabled ? (field === "current_zone_id" ? "Select Division first" : "Select...") : "Select..."}
              value=""
            />
            {options.map((option) => (
              <Picker.Item key={option.value} label={option.label} value={option.value} />
            ))}
          </Picker>
        ) : (
          // Android-specific implementation
          <Picker
            selectedValue={formData[field as keyof typeof formData] ?? ""}
            onValueChange={(value) => !disabled && handleChange(field, value)}
            style={[
              styles.androidPicker,
              {
                color: disabled ? Colors[colorScheme].textDim : textColor,
                backgroundColor: backgroundColor,
              },
            ]}
            dropdownIconColor={disabled ? Colors[colorScheme].textDim : textColor}
            mode="dropdown"
            enabled={!disabled}
          >
            <Picker.Item
              label={disabled ? (field === "current_zone_id" ? "Select Division first" : "Select...") : "Select..."}
              value=""
              style={{ backgroundColor: backgroundColor, color: disabled ? Colors[colorScheme].textDim : textColor }}
            />
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
            thumbColor={
              formData[field as keyof typeof formData] ? Colors[colorScheme].background : Colors[colorScheme].icon
            }
            ios_backgroundColor={Colors[colorScheme].border}
            onValueChange={(value) => handleChange(field, value)}
            value={Boolean(formData[field as keyof typeof formData])}
            accessibilityLabel={label}
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
              : formData[field as keyof typeof formData]
              ? tintColor
              : Colors[colorScheme].icon
          }
          ios_backgroundColor={Colors[colorScheme].border}
          onValueChange={(value) => handleChange(field, value)}
          value={Boolean(formData[field as keyof typeof formData])}
          accessibilityLabel={label}
        />
      )}
    </View>
  );

  // Render section header
  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionHeaderText} accessibilityRole="header">
        {title}
      </ThemedText>
      <View style={[styles.sectionDivider, { backgroundColor: borderColor }]} />
    </View>
  );

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

  // System Seniority Type options
  const systemSenOptions = [
    { label: "System 2 (SYS2)", value: "SYS2" },
    { label: "System 1 (SYS1)", value: "SYS1" },
    { label: "Duluth Winnipeg & Pacific (DWP)", value: "DWP" },
    { label: "Wisconsin Central (WC)", value: "WC" },
    { label: "Canadian National (CN)", value: "CN" },
    { label: "Duluth Missabe & Iron Range (DMIR)", value: "DMIR" },
    { label: "Elgin Joliet & Eastern (EJ&E)", value: "EJ&E" },
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

  // Calendar options
  const calendarOptions = [
    { label: "No Calendar Assigned", value: "" },
    ...availableCalendars.map((cal) => ({ label: cal.name, value: cal.id })),
  ];

  // If still loading initial data
  if (isLoadingDivisions || isLoadingZones) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleContainer}>
          <ThemedText type="subtitle" style={styles.title}>
            Add New Member
          </ThemedText>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacityComponent
            style={styles.closeButton}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Close form"
          >
            <Ionicons name="close" size={24} color={textColor} />
          </TouchableOpacityComponent>
        </View>
      </View>

      <ScrollView style={styles.formContainer} contentContainerStyle={styles.formContent}>
        {/* Basic Info Section */}
        {renderSectionHeader("Basic Information")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderTextField("PIN Number *", "pin_number", "PIN Number", "numeric")}
            {renderTextField("First Name *", "first_name", "First Name")}
            {renderTextField("Last Name *", "last_name", "Last Name")}
            {renderPickerField("Status *", "status", statusOptions)}
            {renderPickerField("Role", "role", getFilteredRoleOptions())}
          </View>

          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderPickerField("Division *", "division_id", divisionOptions)}
            {renderPickerField(
              "Zone",
              "current_zone_id",
              zoneOptions,
              !formData.division_id || formData.division_id === 0,
              !formData.division_id || formData.division_id === 0
                ? "Please select a Division first to see available Zones"
                : undefined
            )}
            {renderPickerField("Home Zone", "home_zone_id", allZoneOptions)}
            {renderPickerField("Calendar", "calendar_id", calendarOptions)}
            <ThemedText style={styles.fieldHelpText}>
              Calendar will be the same as the Zone member is assigned to (or Division if only a single zone)
            </ThemedText>
          </View>
        </View>

        {/* Employment History Section */}
        {renderSectionHeader("Employment History")}
        <View style={isMobileView ? styles.formColumnMobile : styles.formColumnsDesktop}>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderTextField("Company Hire Date", "company_hire_date", "YYYY-MM-DD")}
            {renderTextField("Engineer Date", "engineer_date", "YYYY-MM-DD")}
            {renderTextField(
              "Rank",
              "rank",
              isLoadingRank ? "Loading suggested rank..." : "Numeric rank",
              "numeric",
              false
            )}
            {isLoadingRank && (
              <View style={styles.rankLoadingContainer}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={styles.rankLoadingText}>Calculating suggested rank...</ThemedText>
              </View>
            )}
            {highestRank && (
              <ThemedText style={styles.fieldHelpText}>
                Suggested rank is {highestRank} (highest current rank + 10)
              </ThemedText>
            )}
          </View>
          <View style={isMobileView ? styles.fullWidth : styles.formColumn}>
            {renderPickerField("System Seniority Type", "system_sen_type", systemSenOptions)}
            <ThemedText style={styles.fieldHelpText}>Suggested System 2 For NEW Members</ThemedText>

            {/* System 2 rank field */}
            {renderTextField(
              "System 2 Rank",
              "prior_vac_sys",
              isLoadingPriorVacSys ? "Loading suggested rank..." : "Numeric rank",
              "numeric",
              false
            )}
            {isLoadingPriorVacSys && (
              <View style={styles.rankLoadingContainer}>
                <ActivityIndicator size="small" color={tintColor} />
                <ThemedText style={styles.rankLoadingText}>Calculating suggested System 2 rank...</ThemedText>
              </View>
            )}
            {highestPriorVacSys && (
              <ThemedText style={styles.fieldHelpText}>
                Suggested System 2 rank is {highestPriorVacSys} (highest current + 1)
              </ThemedText>
            )}
          </View>
        </View>

        <View style={styles.actionContainer}>
          <TouchableOpacityComponent
            onPress={handleSave}
            style={[
              styles.actionButton,
              {
                backgroundColor: Colors[colorScheme].tint,
                borderColor: Colors[colorScheme].tint,
              },
              (isSaving || !hasUnsavedChanges) && styles.disabledButton,
            ]}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors[colorScheme].background} />
            ) : (
              <ThemedText style={{ color: Colors[colorScheme].background }}>Create Member</ThemedText>
            )}
          </TouchableOpacityComponent>

          <TouchableOpacityComponent
            onPress={handleClose}
            style={[
              styles.actionButton,
              {
                backgroundColor: Colors[colorScheme].buttonBackgroundSecondary,
                borderColor: Colors[colorScheme].buttonBorderSecondary,
              },
            ]}
          >
            <ThemedText style={{ color: Colors[colorScheme].buttonTextSecondary }}>Cancel</ThemedText>
          </TouchableOpacityComponent>
        </View>
      </ScrollView>
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
    marginRight: 8,
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
    backgroundColor: Colors.dark.card,
    borderColor: Colors.dark.border,
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
    paddingHorizontal: 8,
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
    fontSize: 16, // Prevent iOS Safari auto-zoom
    ...(Platform.OS === "web" && {
      outlineColor: Colors.light.tint,
      outlineOffset: 0,
      outlineStyle: "solid",
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
    ...(Platform.OS !== "android" && { height: 40 }),
  },
  picker: {
    width: "100%",
    fontSize: 14,
    ...(Platform.OS !== "android" && { height: 40 }),
    ...(Platform.OS === "web" && {
      height: 40,
      borderWidth: 0,
      paddingLeft: 10,
      paddingRight: 30,
      appearance: "none",
      backgroundRepeat: "no-repeat",
      backgroundPositionX: "right",
      backgroundPositionY: "center",
    }),
  },
  webPickerWrapper: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    height: 40,
  },
  webPicker: {
    flex: 1,
    height: "100%",
  },
  webPickerIcon: {
    position: "absolute",
    right: 10,
    pointerEvents: "none",
  },
  iosPicker: {
    height: 120,
  },
  androidPicker: {
    width: "100%",
    fontSize: 14,
  },
  switchFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 4,
  },
  switchWrapper: {
    // Styling for web switch wrapper
  },
  webSwitch: {
    // Desktop web specific styling
  },
  mobileSwitch: {
    transform: [{ scale: 1.2 }],
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
  actionContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  disabledButton: {
    opacity: 0.6,
  },
  disabledPickerContainer: {
    opacity: 0.7,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  fieldHelpText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginBottom: 4,
    fontStyle: "italic",
  },
  rankLoadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  rankLoadingText: {
    fontSize: 12,
    marginLeft: 8,
    color: Colors.dark.textDim,
  },
});
