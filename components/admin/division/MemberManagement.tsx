import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  Platform,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  VirtualizedList,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MemberList } from "./MemberList";
import { useUserStore } from "@/store/userStore";
import { DivisionSelector } from "./DivisionSelector";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "@/utils/supabase";
import { Checkbox, CheckboxProps } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Database } from "@/types/supabase";
import { UserRole } from "@/types/auth";
import Toast from "react-native-toast-message";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useAuth, AuthContext } from "@/hooks/useAuth";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { useAdminMemberManagementStore, type MemberData } from "@/store/adminMemberManagementStore";
import { MemberEditForm } from "./MemberEditForm";
import { SmsLockoutManager } from "../SmsLockoutManager";

type MemberAction = "list" | "edit" | "bulk" | "transfer" | "sms_lockout";

type BulkActionTab = "calendar" | "seniority" | "sdv" | "zone";

type DbMember = Database["public"]["Tables"]["members"]["Row"];

interface UserState {
  member: DbMember | null;
  userRole: UserRole | null;
  division: string | null;
  calendar_id: string | null;
  setMember: (member: DbMember | null) => Promise<void>;
  setUserRole: (role: UserRole | null) => void;
  setDivision: (division: string | null) => void;
  setCalendarId: (calendarId: string | null) => void;
  reset: () => void;
}

interface BulkActionsProps {
  division: string;
  onDivisionChange: (division: string) => void;
}

interface Calendar {
  id: string;
  name: string;
}

interface Zone {
  id: string;
  name: string;
}

interface MemberWithZone {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  pin_number: number;
  current_zone_id: {
    id: number;
    name: string;
  }[];
  calendar_id: string | null;
}

interface DivisionMember {
  id: number | null;
  pin_number: string;
  first_name: string;
  last_name: string;
  zone: string;
  calendar_id: string | null;
}

interface SupabaseMember {
  id: string | null;
  pin_number: string;
  first_name: string | null;
  last_name: string | null;
  current_zone: {
    id: string;
    name: string;
  } | null;
  calendar_id: string | null;
  company_hire_date: string | null;
  created_at: string | null;
  current_zone_id: number | null;
  date_of_birth: string | null;
  deleted: boolean | null;
  division: string | null;
  email: string | null;
  employee_number: string | null;
  first_day_worked: string | null;
  gender: string | null;
  home_terminal: string | null;
  last_day_worked: string | null;
  middle_name: string | null;
  phone_number: string | null;
  position: string | null;
  seniority_date: string | null;
  shift: string | null;
  status: string | null;
  updated_at: string | null;
  user_id: string | null;
}

// Helper function to determine if user is admin
function useIsAdmin(userRole: UserRole | null): boolean {
  return userRole === "application_admin" || userRole === "union_admin" || userRole === "division_admin";
}

// Add new helper function to check for high-level admin roles
function isHighLevelAdmin(userRole: UserRole | null): boolean {
  return userRole === "application_admin" || userRole === "union_admin";
}

function BulkActions({ division, onDivisionChange }: BulkActionsProps) {
  // Use useMemo for the Zustand selector to maintain referential equality
  const userRole = useUserStore(useCallback((state: UserState) => state.userRole, []));
  const isAdmin = useIsAdmin(userRole);
  const [activeTab, setActiveTab] = useState<BulkActionTab>("calendar");
  const [selectedCalendar, setSelectedCalendar] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [availableZones, setAvailableZones] = useState<Zone[]>([]);
  const [members, setMembers] = useState<DivisionMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedZoneForBulk, setSelectedZoneForBulk] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  // Use adminCalendarManagementStore for calendars
  const { calendars, ensureDivisionSettingsLoaded, isDivisionLoading } = useAdminCalendarManagementStore();

  // Get available calendars for current division
  const availableCalendars = useMemo(() => calendars[division] || [], [calendars, division]);

  // Load division settings when division changes
  useEffect(() => {
    if (division) {
      ensureDivisionSettingsLoaded(division);
    }
  }, [division, ensureDivisionSettingsLoaded]);

  // Add sorting function for members
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      // First sort Unknown zones to the top
      if (a.zone === "Unknown" && b.zone !== "Unknown") return -1;
      if (a.zone !== "Unknown" && b.zone === "Unknown") return 1;

      // Then sort by zone name
      if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);

      // Finally sort by last name within zones
      return a.last_name.localeCompare(b.last_name);
    });
  }, [members]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First get division ID
      const { data: divisionData, error: divisionError } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", division)
        .single();

      if (divisionError) {
        throw new Error(`Error fetching division: ${divisionError.message}`);
      }

      if (!divisionData) {
        throw new Error(`Division "${division}" not found`);
      }

      // Fetch zones using division_id
      const { data: zonesData, error: zonesError } = await supabase
        .from("zones")
        .select("*")
        .eq("division_id", divisionData.id)
        .order("name");

      if (zonesError) {
        throw new Error(`Error fetching zones: ${zonesError.message}`);
      }

      // Map zones to match Zone interface
      const mappedZones: Zone[] =
        zonesData?.map((zone) => ({
          id: String(zone.id),
          name: zone.name,
        })) || [];
      setAvailableZones(mappedZones);

      // Fetch members with calendar filter based on active tab
      let membersQuery = supabase
        .from("members")
        .select(
          `
          id,
          pin_number,
          first_name,
          last_name,
          calendar_id,
          current_zone_id
        `
        )
        .eq("division_id", divisionData.id);

      // Add status filter based on includeInactive state
      if (!includeInactive) {
        membersQuery = membersQuery.eq("status", "ACTIVE");
      } else {
        membersQuery = membersQuery.in("status", ["ACTIVE", "IN-ACTIVE"]);
      }

      // Add calendar filter for calendar assignment tab
      if (activeTab === "calendar") {
        membersQuery = membersQuery.is("calendar_id", null);
      }

      const { data: membersData, error: membersError } = await membersQuery.order("last_name");

      if (membersError) {
        throw new Error(`Error fetching members: ${membersError.message}`);
      }

      // Map members and look up zone names from our zones data
      const mappedMembers: DivisionMember[] = (membersData || []).map((member) => {
        const memberZone = zonesData?.find((z) => z.id === member.current_zone_id);
        return {
          id: member.id ? parseInt(member.id) : null,
          pin_number: String(member.pin_number),
          first_name: member.first_name || "",
          last_name: member.last_name || "",
          zone: memberZone?.name || "Unknown",
          calendar_id: member.calendar_id,
        };
      });

      setMembers(mappedMembers);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching data");
      setAvailableZones([]);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (division) {
      fetchData();
    }
  }, [division, activeTab]); // Add activeTab as dependency to refetch when tab changes

  const handleSaveCalendarAssignments = async () => {
    if (!selectedCalendar || selectedMembers.length === 0) return;

    try {
      const pinNumbers = selectedMembers.map((pin) => parseInt(pin, 10));
      const { error } = await supabase
        .from("members")
        .update({ calendar_id: selectedCalendar })
        .in("pin_number", pinNumbers);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Updated calendar assignments for ${selectedMembers.length} members`,
      });

      setSelectedMembers([]);
      setSelectedCalendar(null);
      fetchData();
    } catch (error) {
      console.error("Error updating calendar assignments:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to update calendar assignments",
      });
    }
  };

  const handleSaveZoneAssignment = async (memberPin: string, zoneId: string | null) => {
    if (!zoneId) return;

    try {
      const pinNumber = parseInt(memberPin, 10);
      const { error } = await supabase
        .from("members")
        .update({ current_zone_id: parseInt(zoneId, 10) })
        .eq("pin_number", pinNumber);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Zone assigned successfully",
      });

      fetchData();
    } catch (error) {
      console.error("Error assigning zone:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to assign zone",
      });
    }
  };

  const handleBulkZoneAssignment = async () => {
    if (!selectedZoneForBulk || selectedMembers.length === 0) return;

    try {
      const pinNumbers = selectedMembers.map((pin) => parseInt(pin, 10));
      const { error } = await supabase
        .from("members")
        .update({ current_zone_id: parseInt(selectedZoneForBulk, 10) })
        .in("pin_number", pinNumbers);

      if (error) throw error;

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Assigned ${selectedMembers.length} members to new zone`,
      });

      setSelectedMembers([]);
      setSelectedZoneForBulk(null);
      fetchData();
    } catch (error) {
      console.error("Error bulk assigning zones:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to assign zones",
      });
    }
  };

  const fetchInactiveMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First get division ID
      const { data: divisionData, error: divisionError } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", division)
        .single();

      if (divisionError) {
        throw new Error(`Error fetching division: ${divisionError.message}`);
      }

      if (!divisionData) {
        throw new Error(`Division "${division}" not found`);
      }

      // Fetch zones using division_id
      const { data: zonesData, error: zonesError } = await supabase
        .from("zones")
        .select("*")
        .eq("division_id", divisionData.id)
        .order("name");

      if (zonesError) {
        throw new Error(`Error fetching zones: ${zonesError.message}`);
      }

      // Map zones to match Zone interface
      const mappedZones: Zone[] =
        zonesData?.map((zone) => ({
          id: String(zone.id),
          name: zone.name,
        })) || [];
      setAvailableZones(mappedZones);

      // Fetch all members first
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select(
          `
          id,
          pin_number,
          first_name,
          last_name,
          calendar_id,
          current_zone_id,
          status
        `
        )
        .eq("division_id", divisionData.id)
        .eq("status", "IN-ACTIVE")
        .is("calendar_id", null)
        .order("last_name");

      if (membersError) {
        throw new Error(`Error fetching members: ${membersError.message}`);
      }

      // Map members and look up zone names from our zones data
      const mappedMembers: DivisionMember[] = (membersData || []).map((member) => {
        const memberZone = zonesData?.find((z) => z.id === member.current_zone_id);
        return {
          id: member.id ? parseInt(member.id) : null,
          pin_number: String(member.pin_number),
          first_name: member.first_name || "",
          last_name: member.last_name || "",
          zone: memberZone?.name || "Unknown",
          calendar_id: member.calendar_id,
        };
      });

      setMembers(mappedMembers);
      setIncludeInactive(true);
    } catch (err) {
      console.error("Error fetching inactive members:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching inactive members");
      setAvailableZones([]);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllMembers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // First get division ID
      const { data: divisionData, error: divisionError } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", division)
        .single();

      if (divisionError) {
        throw new Error(`Error fetching division: ${divisionError.message}`);
      }

      if (!divisionData) {
        throw new Error(`Division "${division}" not found`);
      }

      // Fetch zones using division_id
      const { data: zonesData, error: zonesError } = await supabase
        .from("zones")
        .select("*")
        .eq("division_id", divisionData.id)
        .order("name");

      if (zonesError) {
        throw new Error(`Error fetching zones: ${zonesError.message}`);
      }

      // Map zones to match Zone interface
      const mappedZones: Zone[] =
        zonesData?.map((zone) => ({
          id: String(zone.id),
          name: zone.name,
        })) || [];
      setAvailableZones(mappedZones);

      // Fetch all members without any status or calendar filters
      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select(
          `
          id,
          pin_number,
          first_name,
          last_name,
          calendar_id,
          current_zone_id,
          status
        `
        )
        .eq("division_id", divisionData.id)
        .order("last_name");

      if (membersError) {
        throw new Error(`Error fetching members: ${membersError.message}`);
      }

      // Map members and look up zone names from our zones data
      const mappedMembers: DivisionMember[] = (membersData || []).map((member) => {
        const memberZone = zonesData?.find((z) => z.id === member.current_zone_id);
        return {
          id: member.id ? parseInt(member.id) : null,
          pin_number: String(member.pin_number),
          first_name: member.first_name || "",
          last_name: member.last_name || "",
          zone: memberZone?.name || "Unknown",
          calendar_id: member.calendar_id,
        };
      });

      setMembers(mappedMembers);
      setIncludeInactive(true);
    } catch (err) {
      console.error("Error fetching all members:", err);
      setError(err instanceof Error ? err.message : "An error occurred while fetching all members");
      setAvailableZones([]);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMemberItem = useCallback(
    ({ item: member }: { item: DivisionMember }) => (
      <ThemedView key={`member-${member.pin_number}`} style={styles.memberRow}>
        <Checkbox
          checked={selectedMembers.includes(member.pin_number)}
          onCheckedChange={(checked) => {
            setSelectedMembers((prev) =>
              checked ? [...prev, member.pin_number] : prev.filter((pin) => pin !== member.pin_number)
            );
          }}
        />
        <ThemedView style={styles.memberInfo}>
          <ThemedText style={styles.memberText}>{member.pin_number}</ThemedText>
          <ThemedText style={styles.memberText}>{`${member.last_name}, ${member.first_name}`}</ThemedText>
          {member.zone === "Unknown" ? (
            <Picker
              selectedValue=""
              onValueChange={(value) => handleSaveZoneAssignment(member.pin_number, value)}
              style={[styles.picker, styles.memberText]}
            >
              <Picker.Item label="Unknown" value="" />
              {availableZones.map((zone) => (
                <Picker.Item key={zone.id} label={zone.name} value={zone.id} />
              ))}
            </Picker>
          ) : (
            <ThemedText style={styles.memberText}>{member.zone}</ThemedText>
          )}
        </ThemedView>
      </ThemedView>
    ),
    [selectedMembers, availableZones, handleSaveZoneAssignment]
  );

  const renderZoneContent = () => (
    <ThemedView style={styles.tabContent}>
      <ThemedView style={styles.selectionContainer}>
        <ThemedText>Bulk Assign to Zone:</ThemedText>
        <Picker
          selectedValue={selectedZoneForBulk}
          onValueChange={(value) => setSelectedZoneForBulk(value)}
          style={styles.picker}
        >
          <Picker.Item label="Select a zone..." value="" />
          {availableZones.map((zone) => (
            <Picker.Item key={zone.id} label={zone.name} value={zone.id} />
          ))}
        </Picker>
        <Button onPress={handleBulkZoneAssignment} disabled={!selectedZoneForBulk || selectedMembers.length === 0}>
          Assign Selected to Zone
        </Button>
      </ThemedView>
      {Platform.OS === "web" ? (
        <ScrollView style={styles.memberList}>
          {sortedMembers.map((member) => renderMemberItem({ item: member }))}
        </ScrollView>
      ) : (
        <FlatList
          data={sortedMembers}
          renderItem={renderMemberItem}
          keyExtractor={(member) => `member-${member.pin_number}`}
          style={styles.memberList}
          contentContainerStyle={styles.memberListContent}
        />
      )}
    </ThemedView>
  );

  const renderCalendarContent = () => (
    <ThemedView style={styles.tabContent}>
      {members.length === 0 && !isLoading && !error ? (
        <ThemedView style={styles.messageContainer}>
          <ThemedText style={styles.messageText}>
            All active members in this division have been assigned to calendars.
          </ThemedText>
          <ThemedView style={[styles.selectionContainer, { justifyContent: "center" }]}>
            <Button onPress={fetchInactiveMembers} variant="secondary">
              Search Inactive Members
            </Button>
            <Button onPress={fetchAllMembers} variant="secondary">
              Show ALL Members (Including Assigned)
            </Button>
          </ThemedView>
        </ThemedView>
      ) : (
        <>
          <ThemedView style={styles.selectionContainer}>
            <ThemedText>Select Calendar:</ThemedText>
            <Picker
              selectedValue={selectedCalendar}
              onValueChange={(value) => setSelectedCalendar(value)}
              style={styles.picker}
              enabled={!isDivisionLoading && !isLoading}
            >
              <Picker.Item label="Select a calendar..." value="" />
              {availableCalendars.map((calendar) => (
                <Picker.Item key={calendar.id} label={calendar.name} value={calendar.id} />
              ))}
            </Picker>
            <Button
              onPress={handleSaveCalendarAssignments}
              disabled={!selectedCalendar || selectedMembers.length === 0 || isDivisionLoading || isLoading}
            >
              Assign Calendar
            </Button>
            {includeInactive && (
              <Button
                onPress={() => {
                  setIncludeInactive(false);
                  setSelectedMembers([]);
                  fetchData();
                }}
                variant="secondary"
              >
                Show Only Active Members
              </Button>
            )}
          </ThemedView>
          <ThemedText style={styles.statusMessage}>
            {includeInactive
              ? "Showing all members (including those with calendars assigned)"
              : "Showing active members without assigned calendars"}
          </ThemedText>
          {Platform.OS === "web" ? (
            <ScrollView style={styles.memberList}>
              {sortedMembers.map((member) => renderMemberItem({ item: member }))}
            </ScrollView>
          ) : (
            <FlatList
              data={sortedMembers}
              renderItem={renderMemberItem}
              keyExtractor={(member) => `member-${member.pin_number}`}
              style={styles.memberList}
              contentContainerStyle={styles.memberListContent}
            />
          )}
        </>
      )}
    </ThemedView>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "calendar":
        return renderCalendarContent();
      case "seniority":
        return (
          <ThemedView style={styles.tabContent}>
            <ThemedText>Vacation Seniority management coming soon...</ThemedText>
          </ThemedView>
        );
      case "zone":
        return renderZoneContent();
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.bulkActionContainer}>
      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error.toString()}</ThemedText>
        </ThemedView>
      )}
      <ThemedView style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "calendar" && styles.activeTab]}
          onPress={() => setActiveTab("calendar")}
        >
          <ThemedText>Calendar Assignment</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "zone" && styles.activeTab]}
          onPress={() => setActiveTab("zone")}
        >
          <ThemedText>Zone Assignment</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "seniority" && styles.activeTab]}
          onPress={() => setActiveTab("seniority")}
        >
          <ThemedText>Vacation Seniority</ThemedText>
        </TouchableOpacity>
      </ThemedView>
      {isLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
          <ThemedText>Loading...</ThemedText>
        </ThemedView>
      ) : (
        renderContent()
      )}
    </ThemedView>
  );
}

// Define selectors outside component with precise dependencies
const selectUserRole = (state: UserState) => state.userRole;
const selectMember = (state: UserState) => state.member;
const selectDivision = (state: UserState) => state.division || "";
const selectSetDivision = (state: UserState) => state.setDivision;

// Create a persistent MemberList component using React.memo
const PersistentMemberList = React.memo(({ onEditMember }: { onEditMember: (member: MemberData) => void }) => {
  return <MemberList onEditMember={onEditMember} />;
});

export function MemberManagement() {
  const [currentAction, setCurrentAction] = useState<MemberAction>("list");
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  // Use the new store
  const {
    members,
    isLoading,
    isDivisionLoading,
    isSwitchingDivision,
    error,
    lastLoadedDivision,
    prepareDivisionSwitch,
    ensureDivisionMembersLoaded,
    updateSingleMemberInList,
  } = useAdminMemberManagementStore();

  // Get user info from userStore
  const userRole = useUserStore(useCallback((state) => state.userRole, []));
  const userDivision = useUserStore(useCallback((state) => state.division, []));
  const setUserDivision = useUserStore(useCallback((state) => state.setDivision, []));

  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const isAdmin = useIsAdmin(userRole);

  // Initialize with user's division
  useEffect(() => {
    if (userDivision) {
      if (isAdmin) {
        prepareDivisionSwitch("", userDivision);
      } else {
        ensureDivisionMembersLoaded(userDivision);
      }
    }
  }, []);

  const handleDivisionChange = async (newDivision: string) => {
    if (!newDivision || (isLoading && newDivision === lastLoadedDivision)) return;

    try {
      if (isAdmin) {
        await prepareDivisionSwitch(lastLoadedDivision || "", newDivision);
      } else {
        await ensureDivisionMembersLoaded(newDivision);
      }
      setUserDivision(newDivision);
    } catch (error) {
      console.error("[MemberManagement] Error changing division:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to change division",
      });
    }
  };

  const handleEditMember = useCallback((member: MemberData) => {
    setSelectedMember(member);
    setCurrentAction("edit");
  }, []);

  const handleCloseEditForm = useCallback(
    (updatedMember?: MemberData | null) => {
      if (updatedMember) {
        updateSingleMemberInList(updatedMember);
      }
      setCurrentAction("list");
      setSelectedMember(null);
    },
    [updateSingleMemberInList]
  );

  const ButtonComponent = Platform.OS === "web" ? Pressable : TouchableOpacity;

  // Always render the MemberList component
  const memberListUI = useMemo(() => <PersistentMemberList onEditMember={handleEditMember} />, [handleEditMember]);

  const renderContent = useCallback(() => {
    if (!lastLoadedDivision) {
      return (
        <ThemedView style={styles.contentContainer}>
          <ThemedText>Please select a division to manage members.</ThemedText>
        </ThemedView>
      );
    }

    // Use conditional UI instead of conditional rendering
    return (
      <ThemedView style={styles.contentContainer}>
        <View style={{ display: currentAction === "list" ? "flex" : "none", flex: 1 }}>{memberListUI}</View>

        {currentAction === "edit" && selectedMember && (
          <View style={{ display: currentAction === "edit" ? "flex" : "none", flex: 1 }}>
            <MemberEditForm member={selectedMember} onClose={handleCloseEditForm} />
          </View>
        )}

        {currentAction === "bulk" && (
          <View style={{ display: currentAction === "bulk" ? "flex" : "none", flex: 1 }}>
            {lastLoadedDivision && (
              <BulkActions division={lastLoadedDivision} onDivisionChange={handleDivisionChange} />
            )}
          </View>
        )}

        {currentAction === "sms_lockout" && (
          <View style={{ display: currentAction === "sms_lockout" ? "flex" : "none", flex: 1 }}>
            {lastLoadedDivision && <SmsLockoutManager divisionFilter={lastLoadedDivision} />}
          </View>
        )}
      </ThemedView>
    );
  }, [currentAction, lastLoadedDivision, memberListUI, selectedMember, handleCloseEditForm]);

  const renderActionButton = useCallback(
    (action: MemberAction, icon: string, label: string) => {
      const isActive = currentAction === action;
      const iconColor = isActive ? "#000000" : tintColor;
      const buttonSize = isMobile ? 40 : "auto";
      const iconSize = isMobile ? 20 : 24;

      return (
        <ButtonComponent
          key={action}
          style={[
            styles.actionButton,
            isActive && styles.activeButton,
            isMobile && styles.mobileActionButton,
            { minWidth: buttonSize, height: buttonSize },
          ]}
          onPress={() => setCurrentAction(action)}
        >
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
          {!isMobile && <ThemedText style={[styles.buttonText, isActive && styles.activeText]}>{label}</ThemedText>}
        </ButtonComponent>
      );
    },
    [currentAction, isMobile, tintColor]
  );

  const renderActionButtons = useCallback(
    () => (
      <ThemedView style={styles.actionButtons}>
        {renderActionButton("list", "list", "Member List")}
        {isAdmin && renderActionButton("bulk", "people", "Bulk Actions")}
        {isAdmin && renderActionButton("sms_lockout", "lock-closed", "SMS Lockouts")}
      </ThemedView>
    ),
    [renderActionButton, isAdmin]
  );

  if (!lastLoadedDivision) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Please select a division to manage members.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          Member Management
        </ThemedText>
        <ThemedView style={styles.divisionRow}>
          <ThemedText type="subtitle">Manage members of </ThemedText>
          {isHighLevelAdmin(userRole) ? (
            <DivisionSelector
              currentDivision={lastLoadedDivision}
              onDivisionChange={handleDivisionChange}
              isAdmin={isAdmin}
              disabled={isLoading || isSwitchingDivision}
            />
          ) : (
            <ThemedText type="subtitle">{lastLoadedDivision}</ThemedText>
          )}
        </ThemedView>
      </ThemedView>
      {error && (
        <ThemedView style={styles.errorContainer}>
          <ThemedText style={styles.errorText}>{error.toString()}</ThemedText>
        </ThemedView>
      )}
      {renderActionButtons()}
      {isLoading || isDivisionLoading ? (
        <ThemedView style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
          <ThemedText>Loading...</ThemedText>
        </ThemedView>
      ) : (
        renderContent()
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    ...(Platform.OS === "web"
      ? {
          cursor: "pointer",
        }
      : {}),
  },
  mobileActionButton: {
    padding: 8,
    justifyContent: "center",
  },
  activeButton: {
    backgroundColor: Colors.light.tint,
  },
  buttonText: {
    fontSize: 16,
  },
  activeText: {
    color: "#000000",
  },
  contentContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    minHeight: 0,
    overflow: "hidden",
  },
  bulkActionContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tab: {
    padding: 12,
    marginRight: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.light.tint,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  selectionContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  picker: {
    minWidth: 200,
  },
  memberList: {
    flex: 1,
    minHeight: 0,
  },
  memberListContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.dark.card,
  },
  errorContainer: {
    padding: 16,
    backgroundColor: Colors.light.error,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  memberInfo: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginLeft: 12,
    backgroundColor: Colors.dark.card,
  },
  memberText: {
    flex: 1,
    marginHorizontal: 8,
  },
  calendarContainer: {
    flex: 1,
    marginLeft: 8,
  },
  calendarPicker: {
    minWidth: 200,
    ...(Platform.OS === "web"
      ? {
          height: 32,
        }
      : {}),
  },
  messageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  messageText: {
    textAlign: "center",
    marginBottom: 16,
  },
  searchInactiveButton: {
    marginTop: 16,
  },
  statusMessage: {
    marginTop: 8,
    marginBottom: 8,
    fontStyle: "italic",
  },
  contentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
});
