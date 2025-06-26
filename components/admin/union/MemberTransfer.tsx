import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, TextInput, View, Platform, ActivityIndicator } from "react-native";
import { ThemedToast } from "@/components/ThemedToast";
import Toast from "react-native-toast-message";
import { Picker } from "@react-native-picker/picker";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { PlatformScrollView } from "@/components/PlatformScrollView";
import { supabase } from "@/utils/supabase";
import { useAuth } from "@/hooks/useAuth";

// Types
interface Division {
  id: number;
  name: string;
  is_active?: boolean;
}

interface Zone {
  id: number;
  name: string;
  division_id: number;
}

interface Calendar {
  id: string;
  name: string;
  division_id: number;
  is_active: boolean;
}

// Member interface for search results (matches database structure)
interface MemberSearchResult {
  pin_number: number;
  first_name: string;
  last_name: string;
  status: string;
  division_id: number;
  current_zone_id: number | null;
  home_zone_id: number | null;
  calendar_id: string | null;
  id?: string; // UUID for auth relationship
}

interface MemberRequest {
  id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled" | "transferred";
  requested_at: string;
  waitlist_position?: number;
  paid_in_lieu?: boolean;
}

interface TransferData {
  division_id?: number;
  zone_id?: number;
  calendar_id?: string;
  home_zone_id?: number;
  notes?: string;
}

// New types for furlough/restore functionality
type TransferType = "location_transfer" | "furlough" | "restore";

interface FurloughData {
  reason: string;
  notes?: string;
}

interface RestoreData {
  division_id?: number;
  zone_id?: number;
  calendar_id?: string;
  notes?: string;
}

interface TransferSummary {
  member_pin: number;
  old_division_id?: number;
  old_zone_id?: number;
  old_calendar_id?: string;
  new_division_id?: number;
  new_zone_id?: number;
  new_calendar_id?: string;
  cancelled_requests: number;
  transferred_requests: number;
  transfer_date: string;
}

// Dropdown component for selections
interface DropdownProps {
  label: string;
  value?: number | string;
  placeholder: string;
  options: Array<{ id: number | string; name: string; disabled?: boolean }>;
  onSelect: (value: number | string) => void;
  disabled?: boolean;
  required?: boolean;
  hasError?: boolean;
}

const Dropdown: React.FC<DropdownProps> = ({
  label,
  value,
  placeholder,
  options,
  onSelect,
  disabled = false,
  required = false,
  hasError = false,
}) => {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  if (Platform.OS === "web") {
    return (
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>
          {label}
          {required && <ThemedText style={styles.required}> *</ThemedText>}
        </ThemedText>
        <select
          value={value || ""}
          onChange={(e) => {
            const selectedValue = e.target.value;
            if (selectedValue) {
              // Convert to number if it's a numeric string, otherwise keep as string
              const convertedValue = isNaN(Number(selectedValue)) ? selectedValue : Number(selectedValue);
              onSelect(convertedValue);
            }
          }}
          disabled={disabled}
          style={{
            height: 40,
            padding: 8,
            backgroundColor: Colors[colorScheme].background,
            color: Colors[colorScheme].text,
            borderColor: hasError ? Colors[colorScheme].error : Colors[colorScheme].border,
            borderWidth: hasError ? 2 : 1,
            borderRadius: 8,
            width: "100%",
            fontSize: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.name}
            </option>
          ))}
        </select>
      </View>
    );
  } else {
    // For mobile platforms, use the Picker component
    return (
      <View style={styles.formGroup}>
        <ThemedText style={styles.label}>
          {label}
          {required && <ThemedText style={styles.required}> *</ThemedText>}
        </ThemedText>
        <View
          style={[
            styles.pickerContainer,
            disabled && styles.pickerDisabled,
            hasError && styles.pickerContainerError,
            { borderColor: hasError ? Colors[colorScheme].error : Colors[colorScheme].border },
          ]}
        >
          <Picker
            selectedValue={value || ""}
            onValueChange={(itemValue) => {
              if (itemValue) {
                // Convert to number if it's a numeric string, otherwise keep as string
                const convertedValue = isNaN(Number(itemValue)) ? itemValue : Number(itemValue);
                onSelect(convertedValue);
              }
            }}
            style={styles.picker}
            enabled={!disabled}
            dropdownIconColor={Colors[colorScheme].text}
          >
            <Picker.Item label={placeholder} value="" />
            {options.map((option) => (
              <Picker.Item key={option.id} label={option.name} value={option.id} enabled={!option.disabled} />
            ))}
          </Picker>
        </View>
      </View>
    );
  }
};

export function MemberTransfer() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const { user } = useAuth();

  // State
  const [transferType, setTransferType] = useState<TransferType>("location_transfer");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [memberRequests, setMemberRequests] = useState<MemberRequest[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [transferData, setTransferData] = useState<TransferData>({});
  const [furloughData, setFurloughData] = useState<FurloughData>({ reason: "" });
  const [restoreData, setRestoreData] = useState<RestoreData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadDivisions();
    loadZones();
    loadCalendars();
  }, []);

  // Load divisions
  const loadDivisions = async () => {
    try {
      const { data, error } = await supabase.from("divisions").select("id, name").order("name");

      if (error) throw error;
      setDivisions(data || []);
    } catch (error) {
      console.error("Error loading divisions:", error);
    }
  };

  // Load zones
  const loadZones = async () => {
    try {
      const { data, error } = await supabase.from("zones").select("id, name, division_id").order("name");

      if (error) throw error;
      setZones(data || []);
    } catch (error) {
      console.error("Error loading zones:", error);
    }
  };

  // Load calendars
  const loadCalendars = async () => {
    try {
      const { data, error } = await supabase
        .from("calendars")
        .select("id, name, division_id, is_active")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setCalendars(data || []);
    } catch (error) {
      console.error("Error loading calendars:", error);
    }
  };

  // Search members - Enhanced to handle different transfer types
  const searchMembers = useCallback(
    async (query: string) => {
      if (query.length < 3) {
        setSearchResults([]);
        return;
      }

      try {
        setIsLoading(true);
        const searchTerm = query.trim();

        console.log("Searching for:", searchTerm, "Transfer type:", transferType);

        // Check if the search term is purely numeric (PIN search)
        const isNumericSearch = /^\d+$/.test(searchTerm);

        let supabaseQuery = supabase
          .from("members")
          .select(
            "pin_number, first_name, last_name, status, division_id, current_zone_id, home_zone_id, calendar_id, id"
          );

        // Filter by status based on transfer type
        if (transferType === "restore") {
          // For restore, only show inactive members
          supabaseQuery = supabaseQuery.eq("status", "IN-ACTIVE");
        } else {
          // For location transfer and furlough, only show active members
          supabaseQuery = supabaseQuery.eq("status", "ACTIVE");
        }

        if (isNumericSearch) {
          // For numeric search, try both exact match and partial match
          const pinNumber = parseInt(searchTerm);
          supabaseQuery = supabaseQuery.or(`pin_number.eq.${pinNumber},pin_number::text.ilike.%${searchTerm}%`);
        } else {
          // Search by name (case insensitive)
          const nameTerm = searchTerm.toLowerCase();
          supabaseQuery = supabaseQuery.or(`first_name.ilike.%${nameTerm}%,last_name.ilike.%${nameTerm}%`);
        }

        const { data, error } = await supabaseQuery.order("last_name").limit(50);

        if (error) {
          console.error("Supabase error:", error);
          throw error;
        }

        console.log("Search results:", data?.length || 0, "members found");
        setSearchResults(data || []);
      } catch (error) {
        console.error("Error searching members:", error);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [transferType]
  );

  // Handle search input changes
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (text.length >= 3) {
        searchMembers(text);
      } else {
        setSearchResults([]);
      }
    },
    [searchMembers]
  );

  // Select member
  const handleSelectMember = useCallback(async (member: MemberSearchResult) => {
    setSelectedMember(member);
    setSearchQuery(`${member.last_name}, ${member.first_name} (${member.pin_number})`);
    setSearchResults([]);
    setTransferData({
      home_zone_id: member.home_zone_id || member.current_zone_id || undefined,
    });

    // Load member's current requests
    try {
      setIsLoading(true);

      // Search for requests using both member_id (if member has registered) and pin_number
      let requestQuery = supabase
        .from("pld_sdv_requests")
        .select("id, request_date, leave_type, status, requested_at, waitlist_position, paid_in_lieu")
        .in("status", ["pending", "waitlisted", "approved", "cancellation_pending"])
        .order("request_date");

      // Build the OR condition to search both member_id and pin_number
      if (member.id) {
        // If member has an ID (registered), search by both member_id and pin_number
        requestQuery = requestQuery.or(`member_id.eq.${member.id},pin_number.eq.${member.pin_number}`);
      } else {
        // If member doesn't have an ID (not registered), search only by pin_number
        requestQuery = requestQuery.eq("pin_number", member.pin_number);
      }

      const { data, error } = await requestQuery;

      if (error) {
        console.error("Error loading member requests:", error);
        throw error;
      }

      console.log(`Found ${data?.length || 0} requests for member ${member.pin_number}`);
      setMemberRequests(data || []);
    } catch (error) {
      console.error("Error loading member requests:", error);
      setMemberRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Clear selection - Enhanced to reset all transfer type data
  const handleClearSelection = () => {
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
    setMemberRequests([]);
    setTransferData({});
    setFurloughData({ reason: "" });
    setRestoreData({});
    setShowConfirmation(false);
    setOperationError(null);
  };

  // Get filtered zones based on selected division
  const filteredZones = useMemo(() => {
    if (!transferData.division_id) return zones;
    return zones.filter((zone) => zone.division_id === transferData.division_id);
  }, [zones, transferData.division_id]);

  // Get filtered calendars based on selected division
  const filteredCalendars = useMemo(() => {
    if (!transferData.division_id) return calendars;
    return calendars.filter((calendar) => calendar.division_id === transferData.division_id);
  }, [calendars, transferData.division_id]);

  // Get all zones for home zone selection (not filtered by division)
  const allZones = useMemo(() => zones, [zones]);

  // Handle division selection
  const handleDivisionSelect = (divisionId: number | string) => {
    const newDivisionId = Number(divisionId);
    setTransferData((prev) => ({
      ...prev,
      division_id: newDivisionId,
      // Clear zone and calendar if division changes
      zone_id: undefined,
      calendar_id: undefined,
    }));
  };

  // Handle zone selection
  const handleZoneSelect = (zoneId: number | string) => {
    setTransferData((prev) => ({
      ...prev,
      zone_id: Number(zoneId),
    }));
  };

  // Handle calendar selection
  const handleCalendarSelect = (calendarId: number | string) => {
    setTransferData((prev) => ({
      ...prev,
      calendar_id: String(calendarId),
    }));
  };

  // Handle home zone selection
  const handleHomeZoneSelect = (zoneId: number | string) => {
    setTransferData((prev) => ({
      ...prev,
      home_zone_id: Number(zoneId),
    }));
  };

  // Validate transfer data
  const validateTransfer = (): string | null => {
    if (!selectedMember) return "No member selected";
    if (!transferData.division_id && !transferData.zone_id && !transferData.calendar_id) {
      return "At least one transfer option must be selected";
    }

    // Division transfer validation
    if (transferData.division_id && transferData.division_id !== selectedMember.division_id) {
      if (!transferData.zone_id) return "Zone is required when transferring divisions";
      if (!transferData.calendar_id) return "Calendar is required when transferring divisions";
    }

    // Zone transfer validation
    if (transferData.zone_id && !transferData.division_id) {
      // Zone transfer within same division
      if (transferData.zone_id === selectedMember.current_zone_id) {
        return "Selected zone is the same as current zone";
      }
    }

    // Calendar validation
    if (transferData.calendar_id === selectedMember.calendar_id) {
      return "Selected calendar is the same as current calendar";
    }

    // Check if no actual changes
    if (
      transferData.division_id === selectedMember.division_id &&
      transferData.zone_id === selectedMember.current_zone_id &&
      transferData.calendar_id === selectedMember.calendar_id &&
      transferData.home_zone_id === selectedMember.home_zone_id
    ) {
      return "No changes specified";
    }

    return null;
  };

  // Validate furlough data
  const validateFurlough = (): string | null => {
    if (!selectedMember) return "No member selected";
    if (!furloughData.reason.trim()) return "Furlough reason is required";
    if (selectedMember.status !== "ACTIVE") return "Only active members can be furloughed";
    return null;
  };

  // Validate restore data
  const validateRestore = (): string | null => {
    if (!selectedMember) return "No member selected";
    if (selectedMember.status !== "IN-ACTIVE") return "Only inactive members can be restored";

    // If providing new location, validate required fields
    if (restoreData.division_id || restoreData.zone_id || restoreData.calendar_id) {
      if (restoreData.division_id && !restoreData.zone_id) {
        return "Zone is required when specifying a new division";
      }
      if (restoreData.division_id && !restoreData.calendar_id) {
        return "Calendar is required when specifying a new division";
      }
    }

    return null;
  };

  // Handle furlough submission
  const handleFurlough = async () => {
    setOperationError(null); // Clear any previous errors

    const validationError = validateFurlough();
    if (validationError) {
      setOperationError(validationError);
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: validationError,
      });
      return;
    }

    if (!user?.id) {
      setOperationError("User not authenticated");
      Toast.show({
        type: "error",
        text1: "Authentication Error",
        text2: "User not authenticated",
      });
      return;
    }

    try {
      setIsTransferring(true);

      const { data, error } = await supabase.rpc("furlough_member", {
        p_member_pin: selectedMember!.pin_number,
        p_furloughed_by: user.id,
        p_furlough_reason: furloughData.reason,
        p_furlough_notes: furloughData.notes || null,
      });

      if (error) throw error;

      if (data?.success) {
        // Success - show toast and reset form
        Toast.show({
          type: "success",
          text1: "Furlough Successful",
          text2: `Member furloughed successfully. ${data.cancelled_requests} requests cancelled, ${data.transferred_requests} requests transferred.`,
        });

        // Reset the entire form on success
        handleClearSelection();
      } else {
        // Operation failed - show error but keep form state
        const errorMessage = data?.error || "Unknown error occurred";
        setOperationError(errorMessage);
        Toast.show({
          type: "error",
          text1: "Furlough Failed",
          text2: errorMessage,
        });

        // Return to form (don't clear) so user can fix issues
        setShowConfirmation(false);
      }
    } catch (error) {
      console.error("Error furloughing member:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setOperationError(errorMessage);
      Toast.show({
        type: "error",
        text1: "Furlough Failed",
        text2: errorMessage,
      });

      // Return to form so user can try again
      setShowConfirmation(false);
    } finally {
      setIsTransferring(false);
    }
  };

  // Handle restore submission
  const handleRestore = async () => {
    setOperationError(null); // Clear any previous errors

    const validationError = validateRestore();
    if (validationError) {
      setOperationError(validationError);
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: validationError,
      });
      return;
    }

    if (!user?.id) {
      setOperationError("User not authenticated");
      Toast.show({
        type: "error",
        text1: "Authentication Error",
        text2: "User not authenticated",
      });
      return;
    }

    try {
      setIsTransferring(true);

      const { data, error } = await supabase.rpc("restore_member", {
        p_member_pin: selectedMember!.pin_number,
        p_restored_by: user.id,
        p_new_division_id: restoreData.division_id || null,
        p_new_zone_id: restoreData.zone_id || null,
        p_new_calendar_id: restoreData.calendar_id || null,
        p_restore_notes: restoreData.notes || null,
      });

      if (error) throw error;

      if (data?.success) {
        // Success - show toast and reset form
        const locationChanged = data.was_location_changed ? " (with location changes)" : " (to original location)";
        Toast.show({
          type: "success",
          text1: "Restore Successful",
          text2: `Member restored successfully${locationChanged}.`,
        });

        // Reset the entire form on success
        handleClearSelection();
      } else {
        // Operation failed - show error but keep form state
        const errorMessage = data?.error || "Unknown error occurred";
        setOperationError(errorMessage);
        Toast.show({
          type: "error",
          text1: "Restore Failed",
          text2: errorMessage,
        });

        // Return to form so user can fix issues
        setShowConfirmation(false);
      }
    } catch (error) {
      console.error("Error restoring member:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setOperationError(errorMessage);
      Toast.show({
        type: "error",
        text1: "Restore Failed",
        text2: errorMessage,
      });

      // Return to form so user can try again
      setShowConfirmation(false);
    } finally {
      setIsTransferring(false);
    }
  };

  // Handle transfer submission
  const handleTransfer = async () => {
    setOperationError(null); // Clear any previous errors

    const validationError = validateTransfer();
    if (validationError) {
      setOperationError(validationError);
      Toast.show({
        type: "error",
        text1: "Validation Error",
        text2: validationError,
      });
      return;
    }

    if (!user?.id) {
      setOperationError("User not authenticated");
      Toast.show({
        type: "error",
        text1: "Authentication Error",
        text2: "User not authenticated",
      });
      return;
    }

    try {
      setIsTransferring(true);

      const { data, error } = await supabase.rpc("transfer_member", {
        p_member_pin: selectedMember!.pin_number,
        p_new_division_id: transferData.division_id || null,
        p_new_zone_id: transferData.zone_id || null,
        p_new_calendar_id: transferData.calendar_id || null,
        p_new_home_zone_id: transferData.home_zone_id || null,
        p_transferred_by: user.id,
        p_transfer_notes: transferData.notes || null,
      });

      if (error) throw error;

      if (data?.success) {
        // Success - show toast and reset form
        Toast.show({
          type: "success",
          text1: "Transfer Successful",
          text2: `Member transferred successfully. ${data.cancelled_requests} requests cancelled, ${data.transferred_requests} requests transferred.`,
        });

        // Reset the entire form on success
        handleClearSelection();
      } else {
        // Operation failed - show error but keep form state
        const errorMessage = data?.error || "Unknown error occurred";
        setOperationError(errorMessage);
        Toast.show({
          type: "error",
          text1: "Transfer Failed",
          text2: errorMessage,
        });

        // Return to form so user can fix issues
        setShowConfirmation(false);
      }
    } catch (error) {
      console.error("Error transferring member:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setOperationError(errorMessage);
      Toast.show({
        type: "error",
        text1: "Transfer Failed",
        text2: errorMessage,
      });

      // Return to form so user can try again
      setShowConfirmation(false);
    } finally {
      setIsTransferring(false);
    }
  };

  // Group requests by status
  const groupedRequests = useMemo(() => {
    const groups = {
      pending: memberRequests.filter((r) => r.status === "pending"),
      waitlisted: memberRequests.filter((r) => r.status === "waitlisted"),
      approved: memberRequests.filter((r) => r.status === "approved"),
      cancellation_pending: memberRequests.filter((r) => r.status === "cancellation_pending"),
    };
    return groups;
  }, [memberRequests]);

  // Calculate transfer impact
  const transferImpact = useMemo(() => {
    const cancelled = groupedRequests.pending.length + groupedRequests.waitlisted.length;
    const transferred = groupedRequests.approved.length;
    const unchanged = groupedRequests.cancellation_pending.length;
    return { cancelled, transferred, unchanged };
  }, [groupedRequests]);

  // Check if division transfer is happening
  const isDivisionTransfer = transferData.division_id && transferData.division_id !== selectedMember?.division_id;

  // Helper function to determine if a field has an error for highlighting
  const hasFieldError = (fieldName: string): boolean => {
    if (!operationError) return false;

    // Map error messages to fields that should be highlighted
    const errorFieldMap: Record<string, string[]> = {
      reason: ["furlough reason is required", "reason"],
      division: [
        "division",
        "zone is required when transferring divisions",
        "calendar is required when transferring divisions",
      ],
      zone: ["zone", "zone is required"],
      calendar: ["calendar", "calendar is required"],
    };

    const lowerError = operationError.toLowerCase();
    return errorFieldMap[fieldName]?.some((keyword) => lowerError.includes(keyword)) || false;
  };

  return (
    <ThemedView style={styles.container}>
      <PlatformScrollView contentContainerStyle={styles.scrollContent}>
        {/* Transfer Type Selection */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Transfer Type</ThemedText>
          <View style={styles.transferTypeContainer}>
            <TouchableOpacityComponent
              style={[
                styles.transferTypeButton,
                transferType === "location_transfer" && styles.transferTypeButtonActive,
                { borderColor: Colors[colorScheme].border },
              ]}
              onPress={() => {
                setTransferType("location_transfer");
                handleClearSelection();
              }}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[styles.transferTypeText, transferType === "location_transfer" && styles.transferTypeTextActive]}
              >
                Location Transfer
              </ThemedText>
              <ThemedText style={styles.transferTypeDescription}>
                Change member's division, zone, or calendar assignment
              </ThemedText>
            </TouchableOpacityComponent>

            <TouchableOpacityComponent
              style={[
                styles.transferTypeButton,
                transferType === "furlough" && styles.transferTypeButtonActive,
                { borderColor: Colors[colorScheme].border },
              ]}
              onPress={() => {
                setTransferType("furlough");
                handleClearSelection();
              }}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[styles.transferTypeText, transferType === "furlough" && styles.transferTypeTextActive]}
              >
                Furlough Member
              </ThemedText>
              <ThemedText style={styles.transferTypeDescription}>
                Set member to inactive while preserving location data
              </ThemedText>
            </TouchableOpacityComponent>

            <TouchableOpacityComponent
              style={[
                styles.transferTypeButton,
                transferType === "restore" && styles.transferTypeButtonActive,
                { borderColor: Colors[colorScheme].border },
              ]}
              onPress={() => {
                setTransferType("restore");
                handleClearSelection();
              }}
              activeOpacity={0.7}
            >
              <ThemedText
                style={[styles.transferTypeText, transferType === "restore" && styles.transferTypeTextActive]}
              >
                Restore Member
              </ThemedText>
              <ThemedText style={styles.transferTypeDescription}>
                Restore previously furloughed member to active status
              </ThemedText>
            </TouchableOpacityComponent>
          </View>
        </ThemedView>

        {/* Member Search Section */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            {transferType === "restore" ? "1. Select Inactive Member" : "1. Select Member"}
          </ThemedText>
          <View style={styles.searchContainer}>
            <TextInput
              style={[styles.searchInput, { color: Colors[colorScheme].text }]}
              placeholder="Search by name or PIN number (min. 3 characters)"
              placeholderTextColor={Colors[colorScheme].textDim}
              value={searchQuery}
              onChangeText={handleSearchChange}
            />
            {searchQuery !== "" && (
              <TouchableOpacityComponent
                style={styles.clearButton}
                onPress={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  if (selectedMember) {
                    handleClearSelection();
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={20} color={Colors[colorScheme].text} />
              </TouchableOpacityComponent>
            )}
          </View>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((member) => (
                <TouchableOpacityComponent
                  key={member.pin_number}
                  style={styles.searchResultItem}
                  onPress={() => handleSelectMember(member)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={styles.memberName}>
                    {member.last_name}, {member.first_name} ({member.pin_number})
                  </ThemedText>
                  {member.status !== "ACTIVE" && <ThemedText style={styles.inactiveStatus}>Inactive</ThemedText>}
                </TouchableOpacityComponent>
              ))}
            </View>
          )}

          {/* Selected Member Info */}
          {selectedMember && (
            <View style={styles.selectedMemberInfo}>
              <ThemedText style={styles.selectedMemberTitle}>Selected Member:</ThemedText>
              <ThemedText style={styles.selectedMemberName}>
                {selectedMember.last_name}, {selectedMember.first_name} ({selectedMember.pin_number})
              </ThemedText>
              <ThemedText style={styles.memberDetail}>
                Division: {divisions.find((d) => d.id === selectedMember.division_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.memberDetail}>
                Zone: {zones.find((z) => z.id === selectedMember.current_zone_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.memberDetail}>
                Calendar: {calendars.find((c) => c.id === selectedMember.calendar_id)?.name || "Unknown"}
              </ThemedText>
              {selectedMember.status !== "ACTIVE" && (
                <ThemedText style={styles.inactiveWarning}>⚠️ This member is inactive</ThemedText>
              )}
            </View>
          )}
        </ThemedView>

        {/* Current Requests Section */}
        {selectedMember && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>2. Current Requests</ThemedText>
            {isLoading ? (
              <ActivityIndicator size="small" color={themeTintColor} />
            ) : memberRequests.length === 0 ? (
              <ThemedText style={styles.noRequestsText}>No active requests found</ThemedText>
            ) : (
              <View style={styles.requestsContainer}>
                {/* Pending Requests */}
                {groupedRequests.pending.length > 0 && (
                  <View style={styles.requestGroup}>
                    <ThemedText style={styles.requestGroupTitle}>
                      Pending ({groupedRequests.pending.length}) - Will be cancelled
                    </ThemedText>
                    {groupedRequests.pending.map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <ThemedText>
                          {request.request_date} - {request.leave_type}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}

                {/* Waitlisted Requests */}
                {groupedRequests.waitlisted.length > 0 && (
                  <View style={styles.requestGroup}>
                    <ThemedText style={styles.requestGroupTitle}>
                      Waitlisted ({groupedRequests.waitlisted.length}) - Will be cancelled
                    </ThemedText>
                    {groupedRequests.waitlisted.map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <ThemedText>
                          {request.request_date} - {request.leave_type}
                        </ThemedText>
                        {request.waitlist_position && (
                          <ThemedText style={styles.waitlistPosition}>#{request.waitlist_position}</ThemedText>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Approved Requests */}
                {groupedRequests.approved.length > 0 && (
                  <View style={styles.requestGroup}>
                    <ThemedText style={styles.requestGroupTitle}>
                      Approved ({groupedRequests.approved.length}) - Will be marked as transferred
                    </ThemedText>
                    {groupedRequests.approved.map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <ThemedText>
                          {request.request_date} - {request.leave_type}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}

                {/* Cancellation Pending Requests */}
                {groupedRequests.cancellation_pending.length > 0 && (
                  <View style={styles.requestGroup}>
                    <ThemedText style={styles.requestGroupTitle}>
                      Cancellation Pending ({groupedRequests.cancellation_pending.length}) - No change
                    </ThemedText>
                    {groupedRequests.cancellation_pending.map((request) => (
                      <View key={request.id} style={styles.requestItem}>
                        <ThemedText>
                          {request.request_date} - {request.leave_type}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ThemedView>
        )}

        {/* Conditional Form Section based on Transfer Type */}
        {selectedMember && transferType === "location_transfer" && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>3. Location Transfer Options</ThemedText>

            {/* Division Selector */}
            <Dropdown
              label="Division"
              value={transferData.division_id}
              placeholder="Select Division (optional)"
              options={divisions.map((d) => ({ id: d.id, name: d.name }))}
              onSelect={handleDivisionSelect}
              hasError={hasFieldError("division")}
            />

            {/* Zone Selector */}
            <Dropdown
              label="Zone"
              value={transferData.zone_id}
              placeholder="Select Zone (optional)"
              options={filteredZones.map((z) => ({ id: z.id, name: z.name }))}
              onSelect={handleZoneSelect}
              required={Boolean(isDivisionTransfer)}
              hasError={hasFieldError("zone")}
            />

            {/* Calendar Selector */}
            <Dropdown
              label="Calendar"
              value={transferData.calendar_id}
              placeholder="Select Calendar (optional)"
              options={filteredCalendars.map((c) => ({ id: c.id, name: c.name }))}
              onSelect={handleCalendarSelect}
              required={Boolean(isDivisionTransfer)}
              hasError={hasFieldError("calendar")}
            />

            {/* Home Zone Selector */}
            <Dropdown
              label="Home Zone"
              value={transferData.home_zone_id}
              placeholder="Select Home Zone (optional)"
              options={allZones.map((z) => ({ id: z.id, name: z.name }))}
              onSelect={handleHomeZoneSelect}
            />

            {/* Transfer Notes */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Transfer Notes (optional):</ThemedText>
              <TextInput
                style={[styles.notesInput, { color: Colors[colorScheme].text }]}
                placeholder="e.g., forced out of zone, bid out of zone, assigned to home zone"
                placeholderTextColor={Colors[colorScheme].textDim}
                value={transferData.notes || ""}
                onChangeText={(text) => setTransferData((prev) => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Transfer Requirements Info */}
            {isDivisionTransfer && (
              <View style={styles.requirementInfo}>
                <ThemedText style={styles.requirementText}>
                  ℹ️ Division transfers require both Zone and Calendar selection
                </ThemedText>
              </View>
            )}
          </ThemedView>
        )}

        {/* Furlough Form Section */}
        {selectedMember && transferType === "furlough" && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>3. Furlough Details</ThemedText>

            {/* Current Member Location (Read-only) */}
            <View style={styles.currentLocationContainer}>
              <ThemedText style={styles.currentLocationTitle}>Current Assignment (Preserved):</ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Division: {divisions.find((d) => d.id === selectedMember.division_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Zone: {zones.find((z) => z.id === selectedMember.current_zone_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Calendar: {calendars.find((c) => c.id === selectedMember.calendar_id)?.name || "Unknown"}
              </ThemedText>
            </View>

            {/* Furlough Reason */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>
                Furlough Reason <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={[
                  styles.searchInput,
                  { color: Colors[colorScheme].text },
                  hasFieldError("reason") && styles.searchInputError,
                ]}
                placeholder="e.g., voluntary, forced, position eliminated"
                placeholderTextColor={Colors[colorScheme].textDim}
                value={furloughData.reason}
                onChangeText={(text) => {
                  setFurloughData((prev) => ({ ...prev, reason: text }));
                  // Clear error when user starts typing
                  if (operationError && hasFieldError("reason")) {
                    setOperationError(null);
                  }
                }}
              />
            </View>

            {/* Furlough Notes */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Additional Notes (optional):</ThemedText>
              <TextInput
                style={[styles.notesInput, { color: Colors[colorScheme].text }]}
                placeholder="Additional details about the furlough..."
                placeholderTextColor={Colors[colorScheme].textDim}
                value={furloughData.notes || ""}
                onChangeText={(text) => setFurloughData((prev) => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Furlough Impact Info */}
            <View style={styles.requirementInfo}>
              <ThemedText style={styles.requirementText}>
                ℹ️ Member will be set to inactive status and calendar access will be removed. All location data will be
                preserved for future restoration.
              </ThemedText>
            </View>
          </ThemedView>
        )}

        {/* Restore Form Section */}
        {selectedMember && transferType === "restore" && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>3. Restore Member</ThemedText>

            {/* Show Original Location */}
            <View style={styles.currentLocationContainer}>
              <ThemedText style={styles.currentLocationTitle}>Original Assignment:</ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Division: {divisions.find((d) => d.id === selectedMember.division_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Zone: {zones.find((z) => z.id === selectedMember.current_zone_id)?.name || "Unknown"}
              </ThemedText>
              <ThemedText style={styles.currentLocationDetail}>
                Home Zone: {zones.find((z) => z.id === selectedMember.home_zone_id)?.name || "Unknown"}
              </ThemedText>
            </View>

            {/* Optional New Location Override */}
            <ThemedText style={styles.label}>Override Location (optional):</ThemedText>

            <Dropdown
              label="New Division"
              value={restoreData.division_id}
              placeholder="Use original division"
              options={divisions.map((d) => ({ id: d.id, name: d.name }))}
              onSelect={(divisionId) => setRestoreData((prev) => ({ ...prev, division_id: Number(divisionId) }))}
              hasError={hasFieldError("division")}
            />

            <Dropdown
              label="New Zone"
              value={restoreData.zone_id}
              placeholder="Use original zone"
              options={filteredZones.map((z) => ({ id: z.id, name: z.name }))}
              onSelect={(zoneId) => setRestoreData((prev) => ({ ...prev, zone_id: Number(zoneId) }))}
              required={Boolean(restoreData.division_id)}
              hasError={hasFieldError("zone")}
            />

            <Dropdown
              label="New Calendar"
              value={restoreData.calendar_id}
              placeholder="Use original calendar"
              options={filteredCalendars.map((c) => ({ id: c.id, name: c.name }))}
              onSelect={(calendarId) => setRestoreData((prev) => ({ ...prev, calendar_id: String(calendarId) }))}
              required={Boolean(restoreData.division_id)}
              hasError={hasFieldError("calendar")}
            />

            {/* Restore Notes */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Restoration Notes (optional):</ThemedText>
              <TextInput
                style={[styles.notesInput, { color: Colors[colorScheme].text }]}
                placeholder="Reason for restoration, any location changes, etc."
                placeholderTextColor={Colors[colorScheme].textDim}
                value={restoreData.notes || ""}
                onChangeText={(text) => setRestoreData((prev) => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Restore Requirements Info */}
            {restoreData.division_id && (
              <View style={styles.requirementInfo}>
                <ThemedText style={styles.requirementText}>
                  ℹ️ Location override selected. Zone and Calendar are required when changing divisions.
                </ThemedText>
              </View>
            )}
          </ThemedView>
        )}

        {/* Confirmation Section */}
        {selectedMember && !showConfirmation && (
          <ThemedView style={styles.section}>
            <ThemedTouchableOpacity
              style={[styles.reviewButton, { backgroundColor: themeTintColor }]}
              onPress={() => setShowConfirmation(true)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.reviewButtonText}>
                {transferType === "location_transfer" && "Review Transfer"}
                {transferType === "furlough" && "Review Furlough"}
                {transferType === "restore" && "Review Restoration"}
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        )}

        {/* Transfer Confirmation */}
        {showConfirmation && selectedMember && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              4. {transferType === "location_transfer" && "Confirm Transfer"}
              {transferType === "furlough" && "Confirm Furlough"}
              {transferType === "restore" && "Confirm Restoration"}
            </ThemedText>

            <View style={styles.confirmationContainer}>
              <ThemedText style={styles.confirmationTitle}>
                {transferType === "location_transfer" && "Transfer Summary:"}
                {transferType === "furlough" && "Furlough Summary:"}
                {transferType === "restore" && "Restoration Summary:"}
              </ThemedText>
              <ThemedText style={styles.confirmationDetail}>
                Member: {selectedMember.last_name}, {selectedMember.first_name} ({selectedMember.pin_number})
              </ThemedText>

              {/* Location Transfer Confirmation */}
              {transferType === "location_transfer" && (
                <>
                  {transferData.division_id && (
                    <ThemedText style={styles.confirmationDetail}>
                      Division: {divisions.find((d) => d.id === selectedMember.division_id)?.name} →{" "}
                      {divisions.find((d) => d.id === transferData.division_id)?.name}
                    </ThemedText>
                  )}

                  {transferData.zone_id && (
                    <ThemedText style={styles.confirmationDetail}>
                      Zone: {zones.find((z) => z.id === selectedMember.current_zone_id)?.name} →{" "}
                      {zones.find((z) => z.id === transferData.zone_id)?.name}
                    </ThemedText>
                  )}

                  {transferData.calendar_id && (
                    <ThemedText style={styles.confirmationDetail}>
                      Calendar: {calendars.find((c) => c.id === selectedMember.calendar_id)?.name} →{" "}
                      {calendars.find((c) => c.id === transferData.calendar_id)?.name}
                    </ThemedText>
                  )}

                  {transferData.home_zone_id && (
                    <ThemedText style={styles.confirmationDetail}>
                      Home Zone: {zones.find((z) => z.id === selectedMember.home_zone_id)?.name} →{" "}
                      {zones.find((z) => z.id === transferData.home_zone_id)?.name}
                    </ThemedText>
                  )}
                </>
              )}

              {/* Furlough Confirmation */}
              {transferType === "furlough" && (
                <>
                  <ThemedText style={styles.confirmationDetail}>Status: ACTIVE → IN-ACTIVE</ThemedText>
                  <ThemedText style={styles.confirmationDetail}>Reason: {furloughData.reason}</ThemedText>
                  {furloughData.notes && (
                    <ThemedText style={styles.confirmationDetail}>Notes: {furloughData.notes}</ThemedText>
                  )}
                  <ThemedText style={styles.confirmationDetail}>
                    Calendar Assignment: Will be removed (location data preserved)
                  </ThemedText>
                </>
              )}

              {/* Restore Confirmation */}
              {transferType === "restore" && (
                <>
                  <ThemedText style={styles.confirmationDetail}>Status: IN-ACTIVE → ACTIVE</ThemedText>
                  {restoreData.division_id ? (
                    <>
                      <ThemedText style={styles.confirmationDetail}>
                        Division: {divisions.find((d) => d.id === selectedMember.division_id)?.name} →{" "}
                        {divisions.find((d) => d.id === restoreData.division_id)?.name}
                      </ThemedText>
                      <ThemedText style={styles.confirmationDetail}>
                        Zone: {zones.find((z) => z.id === selectedMember.current_zone_id)?.name} →{" "}
                        {zones.find((z) => z.id === restoreData.zone_id)?.name}
                      </ThemedText>
                      <ThemedText style={styles.confirmationDetail}>
                        Calendar: Will be assigned to {calendars.find((c) => c.id === restoreData.calendar_id)?.name}
                      </ThemedText>
                    </>
                  ) : (
                    <ThemedText style={styles.confirmationDetail}>
                      Will be restored to original location and calendar assignment
                    </ThemedText>
                  )}
                  {restoreData.notes && (
                    <ThemedText style={styles.confirmationDetail}>Notes: {restoreData.notes}</ThemedText>
                  )}
                </>
              )}

              {/* Request Impact - Only for location transfer and furlough */}
              {(transferType === "location_transfer" || transferType === "furlough") && (
                <>
                  <ThemedText style={styles.impactTitle}>Impact on Requests:</ThemedText>
                  <ThemedText style={styles.impactDetail}>
                    • {transferImpact.cancelled} requests will be cancelled
                  </ThemedText>
                  <ThemedText style={styles.impactDetail}>
                    • {transferImpact.transferred} requests will be marked as transferred
                  </ThemedText>
                  <ThemedText style={styles.impactDetail}>
                    • {transferImpact.unchanged} requests will remain unchanged
                  </ThemedText>
                </>
              )}

              <View style={styles.confirmationButtons}>
                <ThemedTouchableOpacity
                  style={[styles.cancelButton, { borderColor: Colors[colorScheme].error }]}
                  onPress={() => setShowConfirmation(false)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: Colors[colorScheme].error }]}>
                    Cancel
                  </ThemedText>
                </ThemedTouchableOpacity>

                <ThemedTouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: Colors[colorScheme].error }]}
                  onPress={() => {
                    if (transferType === "location_transfer") handleTransfer();
                    else if (transferType === "furlough") handleFurlough();
                    else if (transferType === "restore") handleRestore();
                  }}
                  disabled={isTransferring}
                  activeOpacity={0.7}
                >
                  {isTransferring ? (
                    <ActivityIndicator size="small" color={Colors[colorScheme].background} />
                  ) : (
                    <ThemedText style={[styles.confirmButtonText, { color: Colors[colorScheme].background }]}>
                      {transferType === "location_transfer" && "Confirm Transfer"}
                      {transferType === "furlough" && "Confirm Furlough"}
                      {transferType === "restore" && "Confirm Restore"}
                    </ThemedText>
                  )}
                </ThemedTouchableOpacity>
              </View>
            </View>
          </ThemedView>
        )}
      </PlatformScrollView>
      <ThemedToast />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.card,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  searchContainer: {
    position: "relative",
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingRight: 40,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.border,
      outlineWidth: 0,
    }),
  },
  searchInputError: {
    borderColor: Colors.dark.error,
    borderWidth: 2,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.error,
    }),
  },
  clearButton: {
    position: "absolute",
    right: 8,
    top: 10,
    padding: 4,
    zIndex: 1,
  },
  searchResults: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
    maxHeight: 200,
  },
  searchResultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  memberName: {
    fontSize: 14,
    flex: 1,
  },
  inactiveStatus: {
    fontSize: 12,
    fontStyle: "italic",
    color: Colors.dark.error,
  },
  selectedMemberInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.tint,
  },
  selectedMemberTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  selectedMemberName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  memberDetail: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
  },
  inactiveWarning: {
    fontSize: 14,
    color: Colors.dark.warning,
    marginTop: 8,
  },
  noRequestsText: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
    textAlign: "center",
    padding: 16,
  },
  requestsContainer: {
    gap: 16,
  },
  requestGroup: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  requestGroupTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  requestItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  waitlistPosition: {
    fontSize: 12,
    color: Colors.dark.warning,
    fontWeight: "600",
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  required: {
    color: Colors.dark.error,
  },
  pickerContainer: {
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
  },
  pickerContainerError: {
    borderColor: Colors.dark.error,
    borderWidth: 2,
  },
  pickerDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.dark.card,
  },
  picker: {
    height: 40,
    width: "100%",
    color: Colors.dark.text,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 80,
    textAlignVertical: "top",
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.border,
      outlineWidth: 0,
    }),
  },
  notesInputError: {
    borderColor: Colors.dark.error,
    borderWidth: 2,
    ...(Platform.OS === "web" && {
      outlineColor: Colors.dark.error,
    }),
  },
  requirementInfo: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.warning,
    marginTop: 8,
  },
  requirementText: {
    fontSize: 14,
    color: Colors.dark.warning,
  },
  reviewButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  reviewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.background,
  },
  confirmationContainer: {
    gap: 12,
  },
  confirmationTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  confirmationDetail: {
    fontSize: 14,
    marginLeft: 8,
  },
  impactTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  impactDetail: {
    fontSize: 14,
    marginLeft: 8,
  },
  confirmationButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // New styles for transfer type selection
  transferTypeContainer: {
    gap: 12,
  },
  transferTypeButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: Colors.dark.background,
  },
  transferTypeButtonActive: {
    borderColor: Colors.dark.tint,
    backgroundColor: Colors.dark.card,
  },
  transferTypeText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  transferTypeTextActive: {
    color: Colors.dark.tint,
  },
  transferTypeDescription: {
    fontSize: 14,
    opacity: 0.7,
  },
  // Current location display styles
  currentLocationContainer: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 16,
  },
  currentLocationTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  currentLocationDetail: {
    fontSize: 14,
    marginBottom: 4,
    opacity: 0.8,
  },
});
