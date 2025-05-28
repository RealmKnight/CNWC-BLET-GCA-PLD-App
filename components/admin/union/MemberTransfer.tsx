import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StyleSheet, TextInput, View, Platform, ActivityIndicator, Alert } from "react-native";
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
}

const Dropdown: React.FC<DropdownProps> = ({
  label,
  value,
  placeholder,
  options,
  onSelect,
  disabled = false,
  required = false,
}) => {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.id === value);

  return (
    <View style={styles.formGroup}>
      <ThemedText style={styles.label}>
        {label}
        {required && <ThemedText style={styles.required}> *</ThemedText>}
      </ThemedText>

      <TouchableOpacityComponent
        style={[styles.pickerContainer, disabled && styles.pickerDisabled, { borderColor: Colors[colorScheme].border }]}
        onPress={() => !disabled && setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <ThemedText style={[styles.pickerText, !selectedOption && styles.pickerPlaceholder]}>
          {selectedOption ? selectedOption.name : placeholder}
        </ThemedText>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={Colors[colorScheme].text} />
      </TouchableOpacityComponent>

      {isOpen && !disabled && (
        <View style={[styles.dropdownList, { borderColor: Colors[colorScheme].border }]}>
          <PlatformScrollView style={styles.dropdownScroll} nestedScrollEnabled>
            {options.length === 0 ? (
              <View style={styles.dropdownItem}>
                <ThemedText style={styles.dropdownItemTextDisabled}>No options available</ThemedText>
              </View>
            ) : (
              options.map((option) => (
                <TouchableOpacityComponent
                  key={option.id}
                  style={[
                    styles.dropdownItem,
                    option.disabled && styles.dropdownItemDisabled,
                    option.id === value && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    if (!option.disabled) {
                      onSelect(option.id);
                      setIsOpen(false);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={[
                      styles.dropdownItemText,
                      option.disabled && styles.dropdownItemTextDisabled,
                      option.id === value && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {option.name}
                  </ThemedText>
                </TouchableOpacityComponent>
              ))
            )}
          </PlatformScrollView>
        </View>
      )}
    </View>
  );
};

export function MemberTransfer() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const themeTintColor = useThemeColor({}, "tint");
  const { user } = useAuth();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [memberRequests, setMemberRequests] = useState<MemberRequest[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [transferData, setTransferData] = useState<TransferData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

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

  // Search members
  const searchMembers = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    try {
      setIsLoading(true);
      const searchTerm = query.trim();

      console.log("Searching for:", searchTerm);

      // Check if the search term is purely numeric (PIN search)
      const isNumericSearch = /^\d+$/.test(searchTerm);

      let supabaseQuery = supabase
        .from("members")
        .select(
          "pin_number, first_name, last_name, status, division_id, current_zone_id, home_zone_id, calendar_id, id"
        );

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
  }, []);

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

  // Clear selection
  const handleClearSelection = () => {
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
    setMemberRequests([]);
    setTransferData({});
    setShowConfirmation(false);
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

  // Handle transfer submission
  const handleTransfer = async () => {
    const validationError = validateTransfer();
    if (validationError) {
      Alert.alert("Validation Error", validationError);
      return;
    }

    if (!user?.id) {
      Alert.alert("Error", "User not authenticated");
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
        Alert.alert(
          "Transfer Successful",
          `Member transferred successfully.\n${data.cancelled_requests} requests cancelled, ${data.transferred_requests} requests transferred.`,
          [{ text: "OK", onPress: handleClearSelection }]
        );
      } else {
        Alert.alert("Transfer Failed", data?.error || "Unknown error occurred");
      }
    } catch (error) {
      console.error("Error transferring member:", error);
      Alert.alert("Transfer Failed", error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      setIsTransferring(false);
      setShowConfirmation(false);
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

  return (
    <ThemedView style={styles.container}>
      <PlatformScrollView contentContainerStyle={styles.scrollContent}>
        {/* Member Search Section */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>1. Select Member</ThemedText>
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

        {/* Transfer Form Section */}
        {selectedMember && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>3. Transfer Options</ThemedText>

            {/* Division Selector */}
            <Dropdown
              label="Division"
              value={transferData.division_id}
              placeholder="Select Division (optional)"
              options={divisions.map((d) => ({ id: d.id, name: d.name }))}
              onSelect={handleDivisionSelect}
            />

            {/* Zone Selector */}
            <Dropdown
              label="Zone"
              value={transferData.zone_id}
              placeholder="Select Zone (optional)"
              options={filteredZones.map((z) => ({ id: z.id, name: z.name }))}
              onSelect={handleZoneSelect}
              required={Boolean(isDivisionTransfer)}
            />

            {/* Calendar Selector */}
            <Dropdown
              label="Calendar"
              value={transferData.calendar_id}
              placeholder="Select Calendar (optional)"
              options={filteredCalendars.map((c) => ({ id: c.id, name: c.name }))}
              onSelect={handleCalendarSelect}
              required={Boolean(isDivisionTransfer)}
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

        {/* Confirmation Section */}
        {selectedMember && !showConfirmation && (
          <ThemedView style={styles.section}>
            <ThemedTouchableOpacity
              style={[styles.reviewButton, { backgroundColor: themeTintColor }]}
              onPress={() => setShowConfirmation(true)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.reviewButtonText}>Review Transfer</ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        )}

        {/* Transfer Confirmation */}
        {showConfirmation && selectedMember && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>4. Confirm Transfer</ThemedText>

            <View style={styles.confirmationContainer}>
              <ThemedText style={styles.confirmationTitle}>Transfer Summary:</ThemedText>
              <ThemedText style={styles.confirmationDetail}>
                Member: {selectedMember.last_name}, {selectedMember.first_name} ({selectedMember.pin_number})
              </ThemedText>

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
                  onPress={handleTransfer}
                  disabled={isTransferring}
                  activeOpacity={0.7}
                >
                  {isTransferring ? (
                    <ActivityIndicator size="small" color={Colors[colorScheme].background} />
                  ) : (
                    <ThemedText style={[styles.confirmButtonText, { color: Colors[colorScheme].background }]}>
                      Confirm Transfer
                    </ThemedText>
                  )}
                </ThemedTouchableOpacity>
              </View>
            </View>
          </ThemedView>
        )}
      </PlatformScrollView>
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
  pickerDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.dark.card,
  },
  pickerText: {
    fontSize: 14,
    flex: 1,
  },
  pickerPlaceholder: {
    opacity: 0.7,
  },
  dropdownList: {
    position: "absolute",
    top: 72, // label + picker height + margin
    left: 0,
    right: 0,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  dropdownItemDisabled: {
    opacity: 0.5,
  },
  dropdownItemSelected: {
    backgroundColor: Colors.dark.tint,
  },
  dropdownItemText: {
    fontSize: 14,
  },
  dropdownItemTextDisabled: {
    opacity: 0.5,
  },
  dropdownItemTextSelected: {
    color: Colors.dark.background,
    fontWeight: "600",
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
});
