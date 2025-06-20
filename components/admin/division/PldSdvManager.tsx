import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  Platform,
  ActivityIndicator,
  View,
  Pressable,
  TextInput,
  FlatList,
  ViewStyle,
  TextStyle,
  ImageStyle,
  StyleProp,
  TextInputProps,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
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
import { supabase } from "@/utils/supabase";
import { add, format, isValid, parseISO, subDays, subMonths } from "date-fns";
import { TablesInsert, Tables } from "@/types/supabase";
import { PldSdvRequestDetails } from "./PldSdvRequestDetails";
import {
  REQUEST_TYPES,
  REQUEST_STATUSES,
  AUDIT_EVENT_TYPES,
  RequestType,
  RequestStatus,
  AuditEventType,
} from "./constants";
import { CalendarSelector } from "./CalendarSelector";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Ionicons } from "@expo/vector-icons";
import { ViewPldSdvComponent } from "./ViewPldSdvComponent";
import { ImportPldSdvComponent } from "./ImportPldSdvComponent";
import { ManualPldSdvRequestEntry } from "./ManualPldSdvRequestEntry";
import { ManageWaitlistComponent } from "./ManageWaitlistComponent";

// Types for our component
type DatePreset = "3days" | "7days" | "30days" | "6months" | "alltime" | "custom";

interface PldSdvRequest extends Tables<"pld_sdv_requests"> {
  member?: {
    id: string;
    pin_number: number;
    first_name: string | null;
    last_name: string | null;
  };
}

interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: string;
  user_id: string;
  details: Record<string, unknown>;
}

interface MemberSearchResult {
  id: string;
  pin_number: number;
  first_name: string;
  last_name: string;
  display: string;
}

interface PldSdvManagerProps {
  selectedDivision: string;
  selectedCalendarId: string | null;
}

interface DynamicStyles extends Record<string, StyleProp<ViewStyle | TextStyle | ImageStyle>> {
  container: StyleProp<ViewStyle>;
  header: StyleProp<ViewStyle>;
  title: StyleProp<TextStyle>;
  searchContainer: StyleProp<ViewStyle>;
  input: StyleProp<TextStyle>;
  resultsList: StyleProp<ViewStyle>;
  resultItem: StyleProp<ViewStyle>;
  resultText: StyleProp<TextStyle>;
  tableContainer: StyleProp<ViewStyle>;
  table: StyleProp<ViewStyle>;
  tableRow: StyleProp<ViewStyle>;
  tableCell: StyleProp<ViewStyle | TextStyle>;
  sortableHeader: StyleProp<ViewStyle | TextStyle>;
  iosPickerSpecificStyle: StyleProp<ViewStyle>;
  androidPickerSpecificStyle: StyleProp<ViewStyle>;
  picker: StyleProp<ViewStyle>;
  webSelect?: StyleProp<TextStyle>;
  webInput?: StyleProp<TextStyle>;
  webDateInput?: StyleProp<TextStyle>;
  searchResults?: StyleProp<ViewStyle>;
  searchResultItem?: StyleProp<ViewStyle>;
}

// Define the tab types
type PldSdvTab = "view" | "import" | "enter" | "waitlist";

export function PldSdvManager({ selectedDivision, selectedCalendarId }: PldSdvManagerProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  // Use dynamic styles based on the current colorScheme
  const currentStyles = {
    container: {
      flex: 1,
    } as ViewStyle,
    tabsContainer: {
      flexDirection: "row" as "row",
      gap: 8,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors[colorScheme].border,
    } as ViewStyle,
    tabButton: {
      flexDirection: "row" as "row",
      alignItems: "center" as "center",
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: Colors[colorScheme].border,
      marginRight: 4,
    } as ViewStyle,
    activeTabButton: {
      backgroundColor: Colors[colorScheme].tint,
      borderColor: Colors[colorScheme].tint,
    } as ViewStyle,
    mobileTabButton: {
      padding: 8,
    } as ViewStyle,
    buttonText: {
      fontSize: 14,
      fontWeight: "500" as "500",
      marginLeft: 4,
    } as TextStyle,
    activeText: {
      color: Colors[colorScheme].background,
    } as TextStyle,
    contentContainer: {
      flex: 1,
    } as ViewStyle,
  };

  // Store state
  const { membersByCalendar, isLoadingMembersByCalendar, fetchMembersByCalendarId } = useAdminMemberManagementStore();
  const { calendars, fetchDivisionSettings } = useAdminCalendarManagementStore();
  const { member: adminUser } = useUserStore();

  // Use ref instead of state for tracking processed divisions to prevent infinite loop
  const processedDivisionRef = useRef<string | null>(null);

  // Initialize with a wider date range to capture more requests
  const currentDate = new Date();
  const defaultStartDate = format(subMonths(currentDate, 12), "yyyy-MM-dd"); // 1 year ago
  const defaultEndDate = format(add(currentDate, { years: 1 }), "yyyy-MM-dd"); // 1 year in future

  // Local state
  const [datePreset, setDatePreset] = useState<DatePreset>("alltime");
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSearchResult | null>(null);
  const [requests, setRequests] = useState<PldSdvRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof PldSdvRequest>("request_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [highlightedRequestId, setHighlightedRequestId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PldSdvRequest | null>(null);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<RequestType | "all">("all");
  const [isDivisionReady, setIsDivisionReady] = useState(false);
  // Add local calendar selection state
  const [localSelectedCalendarId, setLocalSelectedCalendarId] = useState<string | null>(selectedCalendarId);

  // Sync prop changes with local state
  useEffect(() => {
    setLocalSelectedCalendarId(selectedCalendarId);
  }, [selectedCalendarId]);

  // Update ref when local calendar state changes
  useEffect(() => {
    currentCalendarIdRef.current = localSelectedCalendarId;
  }, [localSelectedCalendarId]);

  // Refs to hold the latest state for fetchRequests to avoid closure issues
  const currentCalendarIdRef = useRef<string | null | undefined>(localSelectedCalendarId);
  const currentStartDateRef = useRef<string>(startDate);
  const currentEndDateRef = useRef<string>(endDate);
  const currentSelectedMemberRef = useRef<MemberSearchResult | null>(selectedMember);
  const currentSearchQueryRef = useRef<string>(searchQuery);

  // Get current division's calendars
  const currentDivisionCalendars = calendars[selectedDivision] || [];

  // Get unique request statuses
  const availableStatuses = useMemo(() => {
    const statuses = new Set<RequestStatus>();
    requests.forEach((request) => {
      if (request.status) {
        statuses.add(request.status as RequestStatus);
      }
    });
    return Array.from(statuses);
  }, [requests]);

  // Get unique request types from current requests
  const availableTypes = useMemo(() => {
    const types = new Set<RequestType>();
    requests.forEach((request) => {
      if (request.leave_type) {
        types.add(request.leave_type as RequestType);
      }
    });
    return Array.from(types);
  }, [requests]);

  // Sort and filter requests
  const filteredAndSortedRequests = useMemo(() => {
    console.log("[PldSdvManager] Filtering and sorting requests:", {
      totalRequests: requests.length,
      statusFilter,
      typeFilter,
      sortField,
      sortDirection,
    });

    let filtered = [...requests];

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((request) => request.status === statusFilter);
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter((request) => request.leave_type === typeFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number | null = null;
      let bValue: string | number | null = null;

      if (sortField === "member") {
        aValue = a.member ? `${a.member.last_name}, ${a.member.first_name}` : "";
        bValue = b.member ? `${b.member.last_name}, ${b.member.first_name}` : "";
      } else {
        aValue = a[sortField] as string | number | null;
        bValue = b[sortField] as string | number | null;
      }

      if (aValue === null) return 1;
      if (bValue === null) return -1;

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });

    console.log("[PldSdvManager] Filtered and sorted results:", {
      filteredCount: filtered.length,
      firstItem: filtered[0] || null,
    });

    return filtered;
  }, [requests, statusFilter, typeFilter, sortField, sortDirection]);

  // Ref to track last fetch request to prevent duplicate fetches
  const lastFetchRef = useRef<{
    calendarId: string | null;
    startDate: string;
    endDate: string;
    timestamp: number;
  }>({ calendarId: null, startDate: "", endDate: "", timestamp: 0 });

  // Fetch requests - Reads parameters from refs to ensure latest values
  const fetchRequests = useCallback(async () => {
    // Read latest values from refs
    const calendarId = currentCalendarIdRef.current;
    const start = currentStartDateRef.current;
    const end = currentEndDateRef.current;
    const member = currentSelectedMemberRef.current;
    const search = currentSearchQueryRef.current;

    if (!calendarId) {
      console.log("[PldSdvManager] fetchRequests: Skip - no calendarId in ref");
      setRequests([]);
      return;
    }

    console.log("[PldSdvManager] fetchRequests: Preparing with ref values:", {
      calendarId,
      startDate: start,
      endDate: end,
      selectedMember: member?.id,
      searchQuery: search,
      division: selectedDivision, // division prop doesn't need a ref usually
    });

    try {
      setIsLoading(true);
      setError(null);

      // Deduplication check using ref values
      const now = Date.now();
      if (
        lastFetchRef.current.calendarId === calendarId &&
        lastFetchRef.current.startDate === start &&
        lastFetchRef.current.endDate === end &&
        lastFetchRef.current.timestamp > 0 &&
        now - lastFetchRef.current.timestamp < 500
      ) {
        console.log("[PldSdvManager] Skipping duplicate fetch request (refs)");
        setIsLoading(false);
        return;
      }
      lastFetchRef.current = { calendarId, startDate: start, endDate: end, timestamp: now };

      // Main query using values from refs
      let query = supabase
        .from("pld_sdv_requests")
        .select(
          `
          *,
          member:members (
            id,
            pin_number,
            first_name,
            last_name
          )
        `
        )
        .eq("calendar_id", calendarId)
        .gte("request_date", start) // Use ref value
        .lte("request_date", end); // Use ref value

      // Apply member filter using ref value
      if (member && search.length > 0) {
        query = query.eq("member_id", member.id);
      }

      console.log("[PldSdvManager] Executing main query with ref params:", {
        calendarId,
        startDate: start,
        endDate: end,
        memberId: member?.id,
      });
      const { data, error } = await query;

      if (error) throw error;

      console.log(`[PldSdvManager] Fetched ${data?.length || 0} requests successfully (refs).`);
      setRequests(data || []);
    } catch (error) {
      console.error("[PldSdvManager] Error in fetchRequests (refs):", error);
      setError(error instanceof Error ? error.message : "Failed to fetch requests");
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
    // Dependencies: Include functions called inside and static values.
    // The refs themselves don't need to be dependencies.
    // selectedDivision is included for logging consistency.
  }, [selectedDivision, calendars]);

  // Search members
  const searchMembers = useCallback(
    async (query: string) => {
      if (!selectedCalendarId || query.length < 3) {
        setSearchResults([]);
        return;
      }
      try {
        setIsLoading(true);
        const searchTerm = query.toLowerCase();
        const calendarMembers = membersByCalendar[selectedCalendarId] || [];

        // Filter members locally since we already have them in the store
        const results = calendarMembers
          .filter(
            (member) =>
              member.pin_number.toString().includes(searchTerm) ||
              member.first_name.toLowerCase().includes(searchTerm) ||
              member.last_name.toLowerCase().includes(searchTerm)
          )
          .map((member) => ({
            id: member.id,
            pin_number: member.pin_number,
            first_name: member.first_name,
            last_name: member.last_name,
            display: `${member.last_name}, ${member.first_name} (${member.pin_number})`,
          }));

        setSearchResults(results);
      } catch (error) {
        console.error("[PldSdvManager] Error searching members:", error);
        setError(error instanceof Error ? error.message : "Failed to search members");
      } finally {
        setIsLoading(false);
      }
    },
    [selectedCalendarId, membersByCalendar]
  );

  // Handle search input changes
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (text.length >= 3) {
        searchMembers(text);
      } else {
        setSearchResults([]);
        // Trigger fetch if search is cleared and a member was selected
        if (selectedMember) {
          setSelectedMember(null); // Clear selected member too
          // Fetch will be triggered by the main effect watching selectedMember
        }
      }
    },
    [searchMembers, selectedMember] // Added selectedMember dependency
  );

  // Handle member selection
  const handleMemberSelect = useCallback((member: MemberSearchResult | null) => {
    setSelectedMember(member);
    setSearchQuery(member ? member.display : "");
    setSearchResults([]);
    // Fetch will be triggered by the main effect watching selectedMember
  }, []);

  // Handle request selection
  const handleRequestSelect = useCallback((request: PldSdvRequest) => {
    setSelectedRequest(request);
    setIsDetailsModalVisible(true);
  }, []);

  // Handle calendar change - Now properly implemented
  const handleCalendarChange = useCallback((calendarId: string | null) => {
    console.log("[PldSdvManager] Calendar changed to:", calendarId);
    // Reset member selection when calendar changes
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  // Handle sort change
  const handleSortChange = (field: keyof PldSdvRequest) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // --- EFFECTS ---

  // Effect for Division Change
  useEffect(() => {
    if (selectedDivision === processedDivisionRef.current) {
      return;
    }
    console.log(`[PldSdvManager] Division changed effect running for: ${selectedDivision}`);
    setIsDivisionReady(false); // Mark as not ready immediately
    processedDivisionRef.current = selectedDivision;

    // --- Reset State ---
    setDatePreset("alltime");
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
    setRequests([]);
    setStatusFilter("all");
    setTypeFilter("all");
    lastFetchRef.current = { calendarId: null, startDate: "", endDate: "", timestamp: 0 };
    console.log("[PldSdvManager] State reset complete for division change.");

    // --- Fetch Settings ---
    const loadDivisionSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log(`[PldSdvManager] Fetching division settings for ${selectedDivision}...`);
        await fetchDivisionSettings(selectedDivision);
        console.log(`[PldSdvManager] Division settings fetch complete for: ${selectedDivision}.`);
        // NOW mark as ready after settings are fetched (and store should have updated props)
        setIsDivisionReady(true);
        console.log(`[PldSdvManager] Division ${selectedDivision} marked as READY.`);
      } catch (err) {
        console.error("[PldSdvManager] Error loading division settings:", err);
        setError(err instanceof Error ? err.message : "Failed to load division settings");
        setIsLoading(false); // Allow UI to show error
        setIsDivisionReady(true); // Mark as ready even on error to unblock potential UI messages
      }
      // Do not set isLoading false here, let main fetch control it
    };

    loadDivisionSettings();
  }, [selectedDivision, fetchDivisionSettings]);

  // Effect for Date Preset Changes (Non-Custom)
  useEffect(() => {
    // This effect only handles NON-custom presets.
    // Changes to startDate/endDate (e.g., from custom inputs or this effect)
    // will trigger the main fetch effect.
    if (datePreset === "custom") return;

    console.log("[PldSdvManager] Date Preset changed effect running for:", datePreset);

    const now = new Date();
    let start: Date;
    let end: Date;

    switch (datePreset) {
      case "3days":
        start = subDays(now, 30);
        end = add(now, { days: 30 });
        break;
      case "7days":
        start = subDays(now, 60);
        end = add(now, { days: 60 });
        break;
      case "30days":
        start = subDays(now, 180);
        end = add(now, { days: 180 });
        break;
      case "6months":
        start = subMonths(now, 12);
        end = add(now, { years: 1 });
        break;
      case "alltime":
        start = new Date(2000, 0, 1);
        end = new Date(2050, 11, 31);
        break;
      default:
        // Should not happen if datePreset is not 'custom'
        console.warn("[PldSdvManager] Unexpected datePreset in effect:", datePreset);
        return;
    }

    const formattedStart = format(start, "yyyy-MM-dd");
    const formattedEnd = format(end, "yyyy-MM-dd");

    // Update state only if dates actually changed to prevent infinite loops
    if (formattedStart !== startDate || formattedEnd !== endDate) {
      console.log("[PldSdvManager] Setting date range from preset:", { start: formattedStart, end: formattedEnd });
      setStartDate(formattedStart);
      setEndDate(formattedEnd);
      // The main fetch effect will catch this state change.
    }
  }, [datePreset, startDate, endDate]); // Depend on current dates to avoid loops

  // Effect to fetch members when calendar changes
  useEffect(() => {
    if (selectedCalendarId) {
      console.log("[PldSdvManager] Fetching members for calendar:", selectedCalendarId);
      fetchMembersByCalendarId(selectedCalendarId);
    }
  }, [selectedCalendarId, fetchMembersByCalendarId]);

  // Main Effect to Trigger Fetch Requests
  useEffect(() => {
    console.log("[PldSdvManager] Main Fetch trigger effect checking...", {
      isDivisionReady,
      calendar: selectedCalendarId,
      start: startDate,
      end: endDate,
      member: currentSelectedMemberRef.current?.id, // Read from ref
      search: currentSearchQueryRef.current, // Read from ref
    });

    // Only fetch if the division is ready AND a calendar is selected AND dates are set
    if (isDivisionReady && selectedCalendarId && startDate && endDate) {
      // Use a small delay to allow state propagation and debounce rapid changes
      const timerId = setTimeout(() => {
        console.log("[PldSdvManager] Triggering fetch from main effect timeout (Division Ready)");
        fetchRequests(); // This now reads from refs
      }, 300); // Adjusted delay

      return () => clearTimeout(timerId);
    } else {
      // Log why fetch is being skipped
      console.log("[PldSdvManager] Skipping fetch:", {
        isDivisionReady,
        hasCalendar: !!selectedCalendarId,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
      });
      // No calendar or dates selected, or division not ready, ensure requests are cleared
      // Check specific conditions for clarity
      if (!isDivisionReady) {
        console.log("[PldSdvManager] ... division not ready yet.");
        // Keep loading true if division change is in progress
      } else if (!selectedCalendarId) {
        console.log("[PldSdvManager] ... no calendar selected.");
        setRequests([]);
        setIsLoading(false); // Division is ready, but no calendar
      } else if (!startDate || !endDate) {
        console.log("[PldSdvManager] ... dates not set yet.");
        setRequests([]);
        setIsLoading(false); // Division/calendar ready, but dates missing
      }
    }
    // Watch the original state props/variables that indicate a fetch might be needed.
    // Add isDivisionReady to dependencies.
  }, [isDivisionReady, selectedCalendarId, startDate, endDate, selectedMember, searchQuery, fetchRequests]); // Keep original deps + isDivisionReady

  // Effect for Real-time Updates (Commented out for debugging)
  // useEffect(() => {
  //   if (!selectedCalendarId) return;
  //   console.log("[PldSdvManager] Setting up realtime subscription for calendar:", selectedCalendarId);
  //   const channel = supabase
  //     .channel(`pld-sdv-requests-${selectedCalendarId}`)
  //     .on(...)
  //     .subscribe();
  //   return () => { /* unsubscribe */ };
  // }, [selectedCalendarId, fetchRequests]);

  // Effect for Component Unmount Cleanup
  useEffect(() => {
    return () => {
      console.log("[PldSdvManager] Component unmounting, cleaning up all subscriptions");
      supabase.removeAllChannels();
    };
  }, []);

  // Update refs whenever the corresponding state/prop changes
  useEffect(() => {
    currentCalendarIdRef.current = selectedCalendarId;
  }, [selectedCalendarId]);
  useEffect(() => {
    currentStartDateRef.current = startDate;
  }, [startDate]);
  useEffect(() => {
    currentEndDateRef.current = endDate;
  }, [endDate]);
  useEffect(() => {
    currentSelectedMemberRef.current = selectedMember;
  }, [selectedMember]);
  useEffect(() => {
    currentSearchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // State for the currently active tab
  const [activeTab, setActiveTab] = useState<PldSdvTab>("view");

  // Function to render each tab button
  const renderTabButton = useCallback(
    (tab: PldSdvTab, icon: string, label: string) => {
      const isActive = activeTab === tab;
      const iconColor = isActive ? Colors[colorScheme].background : tintColor;
      const buttonSize = isMobile ? 40 : "auto";
      const iconSize = isMobile ? 20 : 24;
      const ButtonComponent = ThemedTouchableOpacity;

      return (
        <ButtonComponent
          key={tab}
          style={[
            currentStyles.tabButton,
            isActive && currentStyles.activeTabButton,
            isMobile && currentStyles.mobileTabButton,
            { minWidth: buttonSize, height: buttonSize },
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
          {!isMobile && (
            <ThemedText style={[currentStyles.buttonText, isActive && currentStyles.activeText]}>{label}</ThemedText>
          )}
        </ButtonComponent>
      );
    },
    [activeTab, isMobile, tintColor, colorScheme]
  );

  // Function to render the active content based on the tab
  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case "view":
        return (
          <ViewPldSdvComponent
            selectedDivision={selectedDivision}
            selectedCalendarId={localSelectedCalendarId}
            onCalendarChange={(calendarId) => {
              console.log("[PldSdvManager] Calendar changed from ViewPldSdvComponent:", calendarId);
              setLocalSelectedCalendarId(calendarId);
            }}
          />
        );
      case "import":
        return (
          <ImportPldSdvComponent
            selectedDivision={selectedDivision}
            selectedCalendarId={localSelectedCalendarId}
            onCalendarChange={(calendarId) => {
              console.log("[PldSdvManager] Calendar changed from ImportPldSdvComponent:", calendarId);
              setLocalSelectedCalendarId(calendarId);
            }}
          />
        );
      case "enter":
        return (
          <ManualPldSdvRequestEntry
            selectedDivision={selectedDivision}
            selectedCalendarId={localSelectedCalendarId}
            onCalendarChange={(calendarId) => {
              console.log("[PldSdvManager] Calendar changed from ManualPldSdvRequestEntry:", calendarId);
              setLocalSelectedCalendarId(calendarId);
            }}
          />
        );
      case "waitlist":
        return (
          <ManageWaitlistComponent
            selectedDivision={selectedDivision}
            selectedCalendarId={localSelectedCalendarId}
            onCalendarChange={(calendarId) => {
              console.log("[PldSdvManager] Calendar changed from ManageWaitlistComponent:", calendarId);
              setLocalSelectedCalendarId(calendarId);
            }}
          />
        );
      default:
        return <ViewPldSdvComponent selectedDivision={selectedDivision} selectedCalendarId={localSelectedCalendarId} />;
    }
  }, [activeTab, selectedDivision, localSelectedCalendarId]);

  return (
    <ThemedView style={currentStyles.container}>
      <View style={currentStyles.tabsContainer}>
        {renderTabButton("view", "list-outline", "View PLD/SDV")}
        {renderTabButton("import", "cloud-upload-outline", "Import PLD/SDV")}
        {renderTabButton("enter", "create-outline", "Enter PLD/SDV")}
        {renderTabButton("waitlist", "reorder-four-outline", "Manage Waitlist(s)")}
      </View>

      <View style={currentStyles.contentContainer}>{renderTabContent()}</View>

      <PldSdvRequestDetails
        request={selectedRequest}
        isVisible={isDetailsModalVisible}
        onClose={() => setIsDetailsModalVisible(false)}
        onRequestUpdated={fetchRequests}
        adminUserId={adminUser?.id || ""}
      />
    </ThemedView>
  );
}

// Static styles that don't depend on colorScheme
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.card,
  },
  tabsContainer: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 4,
  },
  activeTabButton: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  mobileTabButton: {
    padding: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  activeText: {
    color: Colors.dark.background,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    marginBottom: 20,
  },
  selectorContainer: {
    marginBottom: 16,
  },
  dateRangeContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  dateInputContainer: {
    flex: 1,
  },
  searchContainer: {
    marginBottom: 16,
    position: "relative",
  },
  searchInputWrapper: {
    position: "relative",
    width: "100%",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  },
  tableContainer: Platform.select({
    web: {
      width: "100%",
      overflowX: "auto",
      borderWidth: 1,
      borderColor: Colors.dark.border,
      borderRadius: 8,
      marginTop: 16,
    },
    default: {},
  }),
  table: Platform.select({
    web: {
      width: "100%",
      borderCollapse: "collapse",
      backgroundColor: Colors.dark.background,
    },
    default: {},
  }),
  tableRow: Platform.select({
    web: {
      transition: "background-color 0.3s ease",
      cursor: "pointer",
      borderBottomWidth: 1,
      borderBottomColor: Colors.dark.border,
      "&:hover": {
        backgroundColor: Colors.dark.secondary,
      },
    },
    default: {},
  }),
  listItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    cursor: "pointer",
  },
  highlightedListItem: {
    backgroundColor: Colors.dark.secondary,
  },
  listItemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listItemDate: {
    flex: 1,
  },
  listItemMember: {
    flex: 2,
  },
  listItemType: {
    flex: 1,
  },
  listItemStatus: {
    flex: 1,
  },
  loading: {
    marginTop: 20,
  },
  error: {
    color: Colors.dark.error,
    textAlign: "center",
    marginTop: 20,
  },
  filterContainer: {
    marginBottom: 16,
  },
  sortableHeader: {
    cursor: "pointer",
    userSelect: "none",
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    color: Colors.dark.text,
    fontWeight: "bold",
    textAlign: "left",
  },
  listHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  listHeaderItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  tableCell: Platform.select({
    web: {
      padding: 12,
      color: Colors.dark.text,
    },
    default: {},
  }),
  clearIconButton: {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: Platform.select({
      web: [{ translateY: "-50%" }] as any,
      default: [{ translateY: -12 }],
    }),
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.textDim,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  clearIconText: {
    fontSize: 14,
    color: Colors.dark.textDim,
    fontWeight: "bold",
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  noResultsSubText: {
    fontSize: 16,
    color: Colors.dark.textDim,
  },
});

const getStyles = (colorScheme: "light" | "dark"): DynamicStyles => {
  const baseColors = Colors[colorScheme];
  const iosPickerStyle = {
    height: undefined, // Let iOS determine height
  };
  const androidPickerStyle = {
    paddingHorizontal: 8,
    height: 50, // Example fixed height for Android, adjust as needed
  };

  return {
    container: {
      flex: 1,
      backgroundColor: baseColors.background,
    },
    header: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: baseColors.border,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: baseColors.text,
    },
    searchContainer: {
      padding: 16,
    },
    input: {
      height: 40,
      borderWidth: 1,
      borderColor: baseColors.border,
      borderRadius: 8,
      padding: 8,
      color: baseColors.text,
    },
    resultsList: {
      padding: 16,
    },
    resultItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: baseColors.border,
      backgroundColor: baseColors.background, // Added for consistency
    },
    resultText: {
      fontSize: 16,
      color: baseColors.text,
    },
    tableContainer: Platform.select({
      web: {
        flex: 1,
        overflowX: "auto",
        borderWidth: 1,
        borderColor: baseColors.border,
        borderRadius: 8,
        marginTop: 16,
      },
      default: {},
    }),
    table: Platform.select({
      web: {
        width: "100%",
        backgroundColor: baseColors.background,
        borderCollapse: "collapse",
      } as any,
      default: {},
    }),
    tableRow: Platform.select({
      web: {
        borderBottomWidth: 1,
        borderBottomColor: baseColors.border,
        backgroundColor: "transparent",
        transition: "background-color 0.3s ease",
        cursor: "pointer",
        "&:hover": {
          backgroundColor: baseColors.secondary, // Use colorScheme variable
        },
      } as any,
      default: {},
    }),
    tableCell: {
      padding: 12,
      color: baseColors.text,
    },
    sortableHeader: {
      cursor: "pointer",
      userSelect: "none",
      padding: 8,
      backgroundColor: baseColors.background,
      borderBottomWidth: 1,
      borderBottomColor: baseColors.border,
      color: baseColors.text,
      fontWeight: "bold",
      textAlign: "left",
    },
    iosPickerSpecificStyle: iosPickerStyle,
    androidPickerSpecificStyle: androidPickerStyle,
    picker: {
      width: "100%",
      backgroundColor: baseColors.background,
      ...(Platform.OS === "ios" ? iosPickerStyle : {}),
      ...(Platform.OS === "android" ? androidPickerStyle : {}),
    },
    webSelect: Platform.select({
      web: {
        width: "100%",
        padding: 8,
        borderRadius: 4,
        fontSize: 16,
        backgroundColor: baseColors.background,
        color: baseColors.tint,
        borderColor: baseColors.border,
        borderWidth: 1,
      } as TextStyle,
      default: {} as TextStyle,
    }),
    webInput: Platform.select({
      web: {
        width: "100%",
        padding: 8,
        borderRadius: 4,
        fontSize: 16,
        backgroundColor: baseColors.background,
        color: baseColors.tint,
        borderColor: baseColors.border,
        borderWidth: 1,
      } as TextStyle,
      default: {} as TextStyle,
    }),
    webDateInput: Platform.select({
      web: {
        width: "100%",
        padding: 8,
        borderRadius: 4,
        fontSize: 16,
        backgroundColor: baseColors.background,
        color: baseColors.tint,
        borderColor: baseColors.border,
        borderWidth: 1,
      } as TextStyle,
      default: {} as TextStyle,
    }),
    searchResults: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      backgroundColor: baseColors.background,
      borderRadius: 4,
      borderColor: baseColors.border,
      borderWidth: 1,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
      zIndex: 1000,
    } as ViewStyle,
    searchResultItem: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: baseColors.border,
      backgroundColor: baseColors.background,
    } as ViewStyle,
  };
};
