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
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Picker } from "@react-native-picker/picker";
import { Button } from "@/components/ui/Button";
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

// Types for our component
type DatePreset = "3days" | "7days" | "30days" | "6months" | "alltime" | "custom";

interface PldSdvRequest extends Tables<"pld_sdv_requests"> {
  // Additional fields not in the base Supabase type but present in the actual database
  pin_number?: number | null; // For imported calendar requests
  import_source?: string | null; // Source of the import
  imported_at?: string | null; // When it was imported
  member?: {
    id: string;
    pin_number: number;
    first_name: string | null;
    last_name: string | null;
  };
}

interface MemberSearchResult {
  id: string;
  pin_number: number;
  first_name: string;
  last_name: string;
  display: string;
}

interface ViewPldSdvComponentProps {
  selectedDivision: string;
  selectedCalendarId: string | null | undefined;
  onCalendarChange?: (calendarId: string | null) => void;
}

export function ViewPldSdvComponent({
  selectedDivision,
  selectedCalendarId: propSelectedCalendarId,
  onCalendarChange,
}: ViewPldSdvComponentProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;

  // Dynamic styles that depend on colorScheme
  const dynamicStyles = {
    webSelect: Platform.select({
      web: {
        width: "100%",
        padding: 8,
        borderRadius: 4,
        fontSize: 16,
        backgroundColor: Colors[colorScheme].background,
        color: Colors[colorScheme].tint,
        borderColor: Colors[colorScheme].border,
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
        backgroundColor: Colors[colorScheme].background,
        color: Colors[colorScheme].tint,
        borderColor: Colors[colorScheme].border,
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
        backgroundColor: Colors[colorScheme].background,
        color: Colors[colorScheme].tint,
        borderColor: Colors[colorScheme].border,
        borderWidth: 1,
      } as TextStyle,
      default: {} as TextStyle,
    }),
    iosPickerSpecificStyle: {
      height: undefined,
    },
    androidPickerSpecificStyle: {
      paddingHorizontal: 8,
      height: undefined,
    },
    picker: {
      width: "100%",
      backgroundColor: Colors[colorScheme].background,
      color: Colors[colorScheme].tint,
      ...(Platform.OS === "ios"
        ? {
            height: undefined,
          }
        : {}),
      ...(Platform.OS === "android"
        ? {
            paddingHorizontal: 8,
          }
        : {}),
    } as ViewStyle,
    input: {
      width: "100%",
      height: 40,
      paddingHorizontal: 8,
      borderRadius: 4,
      backgroundColor: Colors[colorScheme].background,
      color: Colors[colorScheme].tint,
      borderColor: Colors[colorScheme].border,
      borderWidth: 1,
    } as TextStyle,
    searchResults: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      backgroundColor: Colors[colorScheme].background,
      borderRadius: 4,
      borderColor: Colors[colorScheme].border,
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
      borderBottomColor: Colors[colorScheme].border,
      backgroundColor: Colors[colorScheme].background,
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

  // Refs to hold the latest state for fetchRequests to avoid closure issues
  const currentCalendarIdRef = useRef<string | null | undefined>(propSelectedCalendarId);
  const currentStartDateRef = useRef<string>(startDate);
  const currentEndDateRef = useRef<string>(endDate);
  const currentSelectedMemberRef = useRef<MemberSearchResult | null>(selectedMember);
  const currentSearchQueryRef = useRef<string>(searchQuery);

  // Add state to track selected calendar internally (initialized from prop)
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(propSelectedCalendarId || null);

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
    console.log("[ViewPldSdvComponent] Filtering and sorting requests:", {
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

    console.log("[ViewPldSdvComponent] Filtered and sorted results:", {
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
      console.log("[ViewPldSdvComponent] fetchRequests: Skip - no calendarId in ref");
      setRequests([]);
      return;
    }

    console.log("[ViewPldSdvComponent] fetchRequests: Preparing with ref values:", {
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
        console.log("[ViewPldSdvComponent] Skipping duplicate fetch request (refs)");
        setIsLoading(false);
        return;
      }
      lastFetchRef.current = { calendarId, startDate: start, endDate: end, timestamp: now };

      // Step 1: Fetch requests without member join
      let requestQuery = supabase
        .from("pld_sdv_requests")
        .select("*")
        .eq("calendar_id", calendarId)
        .gte("request_date", start)
        .lte("request_date", end);

      // Apply member filter using ref value
      if (member && search.length > 0) {
        requestQuery = requestQuery.eq("member_id", member.id);
      }

      console.log("[ViewPldSdvComponent] Executing requests query with ref params:", {
        calendarId,
        startDate: start,
        endDate: end,
        memberId: member?.id,
      });

      const { data: requestsData, error: requestsError } = await requestQuery;
      if (requestsError) throw requestsError;

      if (!requestsData || requestsData.length === 0) {
        console.log("[ViewPldSdvComponent] No requests found");
        setRequests([]);
        return;
      }

      // Step 2: Get unique member IDs and pin numbers for member lookup
      const memberIds = new Set<string>();
      const pinNumbers = new Set<number>();

      requestsData.forEach((request) => {
        if (request.member_id) {
          memberIds.add(request.member_id);
        } else if (request.pin_number) {
          pinNumbers.add(request.pin_number);
        }
      });

      // Step 3: Fetch member data for both member_id and pin_number cases
      const memberMap = new Map<string, any>(); // key: member_id or pin_number, value: member data

      // Fetch members by ID (for registered users)
      if (memberIds.size > 0) {
        const { data: membersById, error: membersByIdError } = await supabase
          .from("members")
          .select("id, pin_number, first_name, last_name")
          .in("id", Array.from(memberIds));

        if (membersByIdError) {
          console.warn("[ViewPldSdvComponent] Error fetching members by ID:", membersByIdError);
        } else if (membersById) {
          membersById.forEach((member) => {
            if (member.id) {
              memberMap.set(`id_${member.id}`, member);
            }
          });
        }
      }

      // Fetch members by PIN (for imported calendar requests)
      if (pinNumbers.size > 0) {
        const { data: membersByPin, error: membersByPinError } = await supabase
          .from("members")
          .select("id, pin_number, first_name, last_name")
          .in("pin_number", Array.from(pinNumbers));

        if (membersByPinError) {
          console.warn("[ViewPldSdvComponent] Error fetching members by PIN:", membersByPinError);
        } else if (membersByPin) {
          membersByPin.forEach((member) => {
            memberMap.set(`pin_${member.pin_number}`, member);
          });
        }
      }

      // Step 4: Enrich requests with member data
      const enrichedRequests = requestsData.map((request) => {
        let memberData = null;

        // First try to match by member_id
        if (request.member_id) {
          memberData = memberMap.get(`id_${request.member_id}`);
        }

        // Fallback to match by pin_number for imported requests
        if (!memberData && request.pin_number) {
          memberData = memberMap.get(`pin_${request.pin_number}`);
        }

        return {
          ...request,
          member: memberData || null,
        };
      });

      console.log(`[ViewPldSdvComponent] Fetched ${enrichedRequests.length} requests with member data enrichment.`);
      setRequests(enrichedRequests);
    } catch (error) {
      console.error("[ViewPldSdvComponent] Error in fetchRequests (refs):", error);
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
        console.error("[ViewPldSdvComponent] Error searching members:", error);
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

  // Handle sort change
  const handleSortChange = (field: keyof PldSdvRequest) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Add calendar selection handler
  const handleCalendarChange = useCallback(
    (calendarId: string | null) => {
      console.log("[ViewPldSdvComponent] Calendar changed to:", calendarId);
      setSelectedCalendarId(calendarId);
      // Notify parent component if callback provided
      if (onCalendarChange) {
        onCalendarChange(calendarId);
      }
      // Reset member selection when calendar changes
      setSelectedMember(null);
      setSearchQuery("");
      setSearchResults([]);
    },
    [onCalendarChange]
  );

  // --- EFFECTS ---

  // Effect for Division Change
  useEffect(() => {
    if (selectedDivision === processedDivisionRef.current) {
      return;
    }
    console.log(`[ViewPldSdvComponent] Division changed effect running for: ${selectedDivision}`);
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
    console.log("[ViewPldSdvComponent] State reset complete for division change.");

    // --- Fetch Settings ---
    const loadDivisionSettings = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log(`[ViewPldSdvComponent] Fetching division settings for ${selectedDivision}...`);
        await fetchDivisionSettings(selectedDivision);
        console.log(`[ViewPldSdvComponent] Division settings fetch complete for: ${selectedDivision}.`);
        // NOW mark as ready after settings are fetched (and store should have updated props)
        setIsDivisionReady(true);
        console.log(`[ViewPldSdvComponent] Division ${selectedDivision} marked as READY.`);
      } catch (err) {
        console.error("[ViewPldSdvComponent] Error loading division settings:", err);
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

    console.log("[ViewPldSdvComponent] Date Preset changed effect running for:", datePreset);

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
        console.warn("[ViewPldSdvComponent] Unexpected datePreset in effect:", datePreset);
        return;
    }

    const formattedStart = format(start, "yyyy-MM-dd");
    const formattedEnd = format(end, "yyyy-MM-dd");

    // Update state only if dates actually changed to prevent infinite loops
    if (formattedStart !== startDate || formattedEnd !== endDate) {
      console.log("[ViewPldSdvComponent] Setting date range from preset:", {
        start: formattedStart,
        end: formattedEnd,
      });
      setStartDate(formattedStart);
      setEndDate(formattedEnd);
      // The main fetch effect will catch this state change.
    }
  }, [datePreset, startDate, endDate]); // Depend on current dates to avoid loops

  // Effect to fetch members when calendar changes
  useEffect(() => {
    if (selectedCalendarId) {
      console.log("[ViewPldSdvComponent] Fetching members for calendar:", selectedCalendarId);
      fetchMembersByCalendarId(selectedCalendarId);
    }
  }, [selectedCalendarId, fetchMembersByCalendarId]);

  // Main Effect to Trigger Fetch Requests
  useEffect(() => {
    console.log("[ViewPldSdvComponent] Main Fetch trigger effect checking...", {
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
        console.log("[ViewPldSdvComponent] Triggering fetch from main effect timeout (Division Ready)");
        fetchRequests(); // This now reads from refs
      }, 300); // Adjusted delay

      return () => clearTimeout(timerId);
    } else {
      // Log why fetch is being skipped
      console.log("[ViewPldSdvComponent] Skipping fetch:", {
        isDivisionReady,
        hasCalendar: !!selectedCalendarId,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
      });
      // No calendar or dates selected, or division not ready, ensure requests are cleared
      // Check specific conditions for clarity
      if (!isDivisionReady) {
        console.log("[ViewPldSdvComponent] ... division not ready yet.");
        // Keep loading true if division change is in progress
      } else if (!selectedCalendarId) {
        console.log("[ViewPldSdvComponent] ... no calendar selected.");
        setRequests([]);
        setIsLoading(false); // Division is ready, but no calendar
      } else if (!startDate || !endDate) {
        console.log("[ViewPldSdvComponent] ... dates not set yet.");
        setRequests([]);
        setIsLoading(false); // Division/calendar ready, but dates missing
      }
    }
    // Watch the original state props/variables that indicate a fetch might be needed.
    // Add isDivisionReady to dependencies.
  }, [isDivisionReady, selectedCalendarId, startDate, endDate, selectedMember, searchQuery, fetchRequests]); // Keep original deps + isDivisionReady

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

  // Add an effect to update internal state when prop changes
  useEffect(() => {
    if (propSelectedCalendarId !== selectedCalendarId) {
      setSelectedCalendarId(propSelectedCalendarId || null);
    }
  }, [propSelectedCalendarId]);

  // Render date preset selector
  const renderDatePresetSelector = () => (
    <View style={styles.selectorContainer}>
      <ThemedText style={styles.label}>Date Range:</ThemedText>
      {Platform.OS === "web" ? (
        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          style={dynamicStyles.webSelect as React.CSSProperties}
        >
          <option value="3days">Past & Next 30 Days</option>
          <option value="7days">Past & Next 60 Days</option>
          <option value="30days">Past & Next 180 Days</option>
          <option value="6months">Past & Next Year</option>
          <option value="alltime">All Time (Maximum Range)</option>
          <option value="custom">Custom Range</option>
        </select>
      ) : (
        <Picker
          selectedValue={datePreset}
          onValueChange={(value) => setDatePreset(value as DatePreset)}
          style={dynamicStyles.picker as unknown as StyleProp<TextStyle>}
          dropdownIconColor={Colors[colorScheme].tint}
        >
          <Picker.Item label="Past & Next 30 Days" value="3days" />
          <Picker.Item label="Past & Next 60 Days" value="7days" />
          <Picker.Item label="Past & Next 180 Days" value="30days" />
          <Picker.Item label="Past & Next Year" value="6months" />
          <Picker.Item label="All Time (Maximum Range)" value="alltime" />
          <Picker.Item label="Custom Range" value="custom" />
        </Picker>
      )}
    </View>
  );

  // Render custom date range inputs
  const renderCustomDateRange = () =>
    datePreset === "custom" && (
      <View style={styles.dateRangeContainer}>
        <View style={styles.dateInputContainer}>
          <ThemedText style={styles.label}>Start Date:</ThemedText>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={dynamicStyles.webDateInput as React.CSSProperties}
          />
        </View>
        <View style={styles.dateInputContainer}>
          <ThemedText style={styles.label}>End Date:</ThemedText>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={dynamicStyles.webDateInput as React.CSSProperties}
          />
        </View>
      </View>
    );

  // Render filter controls
  const renderFilterControls = () => (
    <View style={styles.filterContainer}>
      <View style={styles.selectorContainer}>
        <ThemedText style={styles.label}>Status:</ThemedText>
        {Platform.OS === "web" ? (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequestStatus | "all")}
            style={dynamicStyles.webSelect as React.CSSProperties}
          >
            <option value="all">All Statuses</option>
            {REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
              </option>
            ))}
          </select>
        ) : (
          <Picker
            selectedValue={statusFilter}
            onValueChange={(value) => setStatusFilter(value as RequestStatus | "all")}
            style={dynamicStyles.picker as unknown as StyleProp<TextStyle>}
            dropdownIconColor={Colors[colorScheme].tint}
          >
            <Picker.Item label="All Statuses" value="all" />
            {REQUEST_STATUSES.map((status) => (
              <Picker.Item
                key={status}
                label={status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
                value={status}
              />
            ))}
          </Picker>
        )}
      </View>

      <View style={styles.selectorContainer}>
        <ThemedText style={styles.label}>Type:</ThemedText>
        {Platform.OS === "web" ? (
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RequestType | "all")}
            style={dynamicStyles.webSelect as React.CSSProperties}
          >
            <option value="all">All Types</option>
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        ) : (
          <Picker
            selectedValue={typeFilter}
            onValueChange={(value) => setTypeFilter(value as RequestType | "all")}
            style={dynamicStyles.picker as unknown as StyleProp<TextStyle>}
            dropdownIconColor={Colors[colorScheme].tint}
          >
            <Picker.Item label="All Types" value="all" />
            {REQUEST_TYPES.map((type) => (
              <Picker.Item key={type} label={type} value={type} />
            ))}
          </Picker>
        )}
      </View>
    </View>
  );

  // Render member search
  const renderMemberSearch = () => (
    <View style={styles.searchContainer}>
      <ThemedText style={styles.label}>Search Member:</ThemedText>
      <View style={styles.searchInputWrapper}>
        {Platform.OS === "web" ? (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Enter PIN or name (min. 3 characters)"
            style={dynamicStyles.webInput as React.CSSProperties}
          />
        ) : (
          <TextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Enter PIN or name (min. 3 characters)"
            style={dynamicStyles.input}
            placeholderTextColor={Colors[colorScheme].textDim}
          />
        )}
        {(searchQuery.length > 0 || selectedMember) && (
          <Pressable
            style={styles.clearIconButton}
            onPress={() => {
              setSearchQuery("");
              setSelectedMember(null);
              setSearchResults([]);
            }}
          >
            <ThemedText style={styles.clearIconText}>×</ThemedText>
          </Pressable>
        )}
      </View>
      {searchResults.length > 0 && (
        <View style={dynamicStyles.searchResults}>
          {searchResults.map((result) => (
            <Pressable
              key={result.id}
              style={dynamicStyles.searchResultItem}
              onPress={() => handleMemberSelect(result)}
            >
              <ThemedText>{result.display}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  // Render requests table/list
  const renderRequests = () => {
    // Show a message when no results are found
    if (filteredAndSortedRequests.length === 0) {
      return (
        <View style={styles.noResultsContainer}>
          <ThemedText style={styles.noResultsText}>No requests found for the selected date range.</ThemedText>
          <ThemedText style={styles.noResultsSubText}>
            Try extending the date range or switching to a different filter.
          </ThemedText>
          <Button
            onPress={() => {
              setDatePreset("6months");
            }}
            style={{ marginTop: 16 }}
          >
            View Last 6 Months
          </Button>
        </View>
      );
    }

    if (Platform.OS === "web") {
      return (
        <div style={styles.tableContainer as React.CSSProperties}>
          <table style={styles.table as React.CSSProperties}>
            <thead>
              <tr>
                <th style={styles.sortableHeader as React.CSSProperties}>
                  Date {sortField === "request_date" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th style={styles.sortableHeader as React.CSSProperties}>
                  Member {sortField === "member" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th style={styles.sortableHeader as React.CSSProperties}>
                  Type {sortField === "leave_type" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th style={styles.sortableHeader as React.CSSProperties}>
                  Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                </th>
                <th style={styles.sortableHeader as React.CSSProperties}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedRequests.map((request) => (
                <tr
                  key={request.id}
                  style={
                    {
                      ...styles.tableRow,
                      backgroundColor:
                        highlightedRequestId === request.id ? Colors[colorScheme].secondary : "transparent",
                    } as React.CSSProperties
                  }
                  onClick={() => handleRequestSelect(request)}
                >
                  <td style={styles.tableCell as React.CSSProperties}>
                    {format(parseISO(request.request_date), "MMM d, yyyy")}
                  </td>
                  <td style={styles.tableCell as React.CSSProperties}>
                    {request.member
                      ? `${request.member.last_name}, ${request.member.first_name}`
                      : request.pin_number
                      ? `PIN: ${request.pin_number}`
                      : "Unknown"}
                  </td>
                  <td style={styles.tableCell as React.CSSProperties}>{request.leave_type}</td>
                  <td style={styles.tableCell as React.CSSProperties}>{request.status}</td>
                  <td style={styles.tableCell as React.CSSProperties}>
                    <Button onPress={() => handleRequestSelect(request)}>View Details</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={filteredAndSortedRequests}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Pressable style={styles.listHeaderItem} onPress={() => handleSortChange("request_date")}>
                <ThemedText>Date {sortField === "request_date" && (sortDirection === "asc" ? "↑" : "↓")}</ThemedText>
              </Pressable>
              <Pressable style={styles.listHeaderItem} onPress={() => handleSortChange("member")}>
                <ThemedText>Member {sortField === "member" && (sortDirection === "asc" ? "↑" : "↓")}</ThemedText>
              </Pressable>
              <Pressable style={styles.listHeaderItem} onPress={() => handleSortChange("leave_type")}>
                <ThemedText>Type {sortField === "leave_type" && (sortDirection === "asc" ? "↑" : "↓")}</ThemedText>
              </Pressable>
              <Pressable style={styles.listHeaderItem} onPress={() => handleSortChange("status")}>
                <ThemedText>Status {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}</ThemedText>
              </Pressable>
            </View>
          }
          renderItem={({ item: request }) => (
            <Pressable
              style={[styles.listItem, highlightedRequestId === request.id && styles.highlightedListItem]}
              onPress={() => handleRequestSelect(request)}
            >
              <View style={styles.listItemContent}>
                <ThemedText style={styles.listItemDate as StyleProp<TextStyle>}>
                  {format(parseISO(request.request_date), "MMM d, yyyy")}
                </ThemedText>
                <ThemedText style={styles.listItemMember as StyleProp<TextStyle>}>
                  {request.member
                    ? `${request.member.last_name}, ${request.member.first_name}`
                    : request.pin_number
                    ? `PIN: ${request.pin_number}`
                    : "Unknown"}
                </ThemedText>
                <ThemedText style={styles.listItemType as StyleProp<TextStyle>}>{request.leave_type}</ThemedText>
                <ThemedText style={styles.listItemStatus as StyleProp<TextStyle>}>{request.status}</ThemedText>
              </View>
            </Pressable>
          )}
        />
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Add CalendarSelector */}
      <CalendarSelector
        calendars={currentDivisionCalendars}
        selectedCalendarId={selectedCalendarId}
        onSelectCalendar={handleCalendarChange}
        disabled={isLoading}
        style={{ marginBottom: 16 }}
      />

      <View style={styles.content}>
        {renderDatePresetSelector()}
        {renderCustomDateRange()}
        {renderFilterControls()}
        {renderMemberSearch()}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} style={styles.loading} />
      ) : error ? (
        <ThemedText style={styles.error}>{error}</ThemedText>
      ) : (
        renderRequests()
      )}

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
    padding: 16,
  },
  content: {
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
    } as ViewStyle,
    default: {} as ViewStyle,
  }),
  table: Platform.select({
    web: {
      width: "100%",
      borderCollapse: "collapse",
      backgroundColor: Colors.dark.background,
    } as ViewStyle,
    default: {} as ViewStyle,
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
    } as ViewStyle,
    default: {} as ViewStyle,
  }),
  listItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    cursor: "pointer",
  } as ViewStyle,
  highlightedListItem: {
    backgroundColor: Colors.dark.secondary,
  } as ViewStyle,
  listItemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  } as ViewStyle,
  listItemDate: {
    flex: 1,
  } as ViewStyle,
  listItemMember: {
    flex: 2,
  } as ViewStyle,
  listItemType: {
    flex: 1,
  } as ViewStyle,
  listItemStatus: {
    flex: 1,
  } as ViewStyle,
  loading: {
    marginTop: 20,
  } as ViewStyle,
  error: {
    color: Colors.dark.error,
    textAlign: "center",
    marginTop: 20,
  } as TextStyle,
  filterContainer: {
    marginBottom: 16,
  } as ViewStyle,
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
  } as ViewStyle,
  listHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  } as ViewStyle,
  listHeaderItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  } as ViewStyle,
  tableCell: Platform.select({
    web: {
      padding: 12,
      color: Colors.dark.text,
    } as ViewStyle,
    default: {} as ViewStyle,
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
  } as ViewStyle,
  clearIconText: {
    fontSize: 14,
    color: Colors.dark.textDim,
    fontWeight: "bold",
  } as TextStyle,
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  } as ViewStyle,
  noResultsText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  } as TextStyle,
  noResultsSubText: {
    fontSize: 16,
    color: Colors.dark.textDim,
  } as TextStyle,
});
