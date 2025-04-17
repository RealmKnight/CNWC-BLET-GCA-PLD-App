import React, { useState, useEffect, useCallback, useMemo } from "react";
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

// Types for our component
type DatePreset = "3days" | "7days" | "30days" | "6months" | "custom";

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
  selectedCalendarId?: string;
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
}

export function PldSdvManager({ selectedDivision, selectedCalendarId: propSelectedCalendarId }: PldSdvManagerProps) {
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
    picker: {
      width: "100%",
      height: 40,
      backgroundColor: Colors[colorScheme].background,
      color: Colors[colorScheme].tint,
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
  const { calendars } = useAdminCalendarManagementStore();
  const { member: adminUser } = useUserStore();

  // Local state
  const [localSelectedCalendarId, setLocalSelectedCalendarId] = useState<string | null>(propSelectedCalendarId || null);
  const [datePreset, setDatePreset] = useState<DatePreset>("30days");
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState<string>(format(add(new Date(), { days: 30 }), "yyyy-MM-dd"));
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

  // Effect to sync prop calendar with local state
  useEffect(() => {
    if (propSelectedCalendarId !== localSelectedCalendarId) {
      setLocalSelectedCalendarId(propSelectedCalendarId || null);
    }
  }, [propSelectedCalendarId]);

  // Effect to handle date preset changes
  useEffect(() => {
    const now = new Date();
    let start: Date;
    let end: Date = add(now, { days: 30 }); // Default end date is 30 days in the future

    switch (datePreset) {
      case "3days":
        start = subDays(now, 3);
        end = add(now, { days: 3 });
        break;
      case "7days":
        start = subDays(now, 7);
        end = add(now, { days: 7 });
        break;
      case "30days":
        start = subDays(now, 30);
        end = add(now, { days: 30 });
        break;
      case "6months":
        start = subMonths(now, 6);
        end = add(now, { months: 6 });
        break;
      default:
        return; // Don't update dates for custom preset
    }

    setStartDate(format(start, "yyyy-MM-dd"));
    setEndDate(format(end, "yyyy-MM-dd"));
  }, [datePreset]);

  // Search members
  const searchMembers = useCallback(
    async (query: string) => {
      if (!localSelectedCalendarId || query.length < 3) {
        setSearchResults([]);
        return;
      }

      try {
        setIsLoading(true);
        const searchTerm = query.toLowerCase();
        const calendarMembers = membersByCalendar[localSelectedCalendarId] || [];

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
    [localSelectedCalendarId, membersByCalendar]
  );

  // Effect to fetch members when calendar changes
  useEffect(() => {
    if (localSelectedCalendarId) {
      fetchMembersByCalendarId(localSelectedCalendarId);
    }
  }, [localSelectedCalendarId, fetchMembersByCalendarId]);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    if (!localSelectedCalendarId) return;

    try {
      setIsLoading(true);
      setError(null);

      console.log("[PldSdvManager] Fetching requests with params:", {
        calendarId: localSelectedCalendarId,
        startDate,
        endDate,
        selectedMember: selectedMember?.id,
      });

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
        .eq("calendar_id", localSelectedCalendarId)
        .gte("request_date", startDate)
        .lte("request_date", endDate);

      // Only add member filter if explicitly selected by user
      if (selectedMember && searchQuery.length > 0) {
        query = query.eq("member_id", selectedMember.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      console.log("[PldSdvManager] Fetched requests:", {
        count: data?.length || 0,
        data: data,
      });

      setRequests(data || []);
    } catch (error) {
      console.error("[PldSdvManager] Error fetching requests:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch requests");
    } finally {
      setIsLoading(false);
    }
  }, [localSelectedCalendarId, startDate, endDate, selectedMember, searchQuery]);

  // Effect to fetch requests when dependencies change
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  // Handle member selection
  const handleMemberSelect = useCallback((member: MemberSearchResult | null) => {
    setSelectedMember(member);
    setSearchQuery(member ? member.display : "");
    setSearchResults([]);
  }, []);

  // Handle calendar change
  const handleCalendarChange = useCallback((calendarId: string | null) => {
    setLocalSelectedCalendarId(calendarId);
    setSelectedMember(null);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  // Handle request selection
  const handleRequestSelect = useCallback((request: PldSdvRequest) => {
    setSelectedRequest(request);
    setIsDetailsModalVisible(true);
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!localSelectedCalendarId) return;

    const channel = supabase
      .channel(`pld-sdv-requests-${localSelectedCalendarId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pld_sdv_requests",
          filter: `calendar_id=eq.${localSelectedCalendarId}`,
        },
        async (payload) => {
          // Highlight the changed row
          if (payload.new && typeof payload.new === "object" && "id" in payload.new) {
            setHighlightedRequestId(payload.new.id as string);
            setTimeout(() => setHighlightedRequestId(null), 3000);
          }
          // Refresh the requests
          await fetchRequests();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [localSelectedCalendarId, fetchRequests]);

  // Handle sort change
  const handleSortChange = (field: keyof PldSdvRequest) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

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
          <option value="3days">Last 3 Days</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="6months">Last 6 Months</option>
          <option value="custom">Custom Range</option>
        </select>
      ) : (
        <Picker
          selectedValue={datePreset}
          onValueChange={(value) => setDatePreset(value as DatePreset)}
          style={dynamicStyles.picker as unknown as StyleProp<TextStyle>}
        >
          <Picker.Item label="Last 3 Days" value="3days" />
          <Picker.Item label="Last 7 Days" value="7days" />
          <Picker.Item label="Last 30 Days" value="30days" />
          <Picker.Item label="Last 6 Months" value="6months" />
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
                    {request.member ? `${request.member.last_name}, ${request.member.first_name}` : "Unknown"}
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
                {request.member ? `${request.member.last_name}, ${request.member.first_name}` : "Unknown"}
              </ThemedText>
              <ThemedText style={styles.listItemType as StyleProp<TextStyle>}>{request.leave_type}</ThemedText>
              <ThemedText style={styles.listItemStatus as StyleProp<TextStyle>}>{request.status}</ThemedText>
            </View>
          </Pressable>
        )}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.selectorContainer}>
          <ThemedText style={styles.label}>Calendar:</ThemedText>
          {Platform.OS === "web" ? (
            <select
              value={localSelectedCalendarId || ""}
              onChange={(e) => handleCalendarChange(e.target.value || null)}
              style={dynamicStyles.webSelect as React.CSSProperties}
              disabled={currentDivisionCalendars.length === 0}
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
              style={dynamicStyles.picker as unknown as StyleProp<TextStyle>}
              enabled={currentDivisionCalendars.length > 0}
            >
              <Picker.Item label="Select Calendar..." value={null} />
              {currentDivisionCalendars.map((calendar) => (
                <Picker.Item key={calendar.id} label={calendar.name} value={calendar.id} />
              ))}
            </Picker>
          )}
        </View>
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
  } as ViewStyle,
  header: {
    marginBottom: 20,
  } as ViewStyle,
  selectorContainer: {
    marginBottom: 16,
  } as ViewStyle,
  dateRangeContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  } as ViewStyle,
  dateInputContainer: {
    flex: 1,
  } as ViewStyle,
  searchContainer: {
    marginBottom: 16,
    position: "relative",
  } as ViewStyle,
  searchInputWrapper: {
    position: "relative",
    width: "100%",
  } as ViewStyle,
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: "500",
  } as TextStyle,
  tableContainer: Platform.select({
    web: {
      width: "100%",
      overflowX: "auto",
      borderWidth: 1,
      borderColor: Colors.light.border,
      borderRadius: 8,
      marginTop: 16,
    } as ViewStyle,
    default: {} as ViewStyle,
  }),
  table: Platform.select({
    web: {
      width: "100%",
      borderCollapse: "collapse",
      backgroundColor: Colors.light.background,
    } as ViewStyle,
    default: {} as ViewStyle,
  }),
  tableRow: Platform.select({
    web: {
      transition: "background-color 0.3s ease",
      cursor: "pointer",
      borderBottomWidth: 1,
      borderBottomColor: Colors.light.border,
      "&:hover": {
        backgroundColor: Colors.light.secondary,
      },
    } as ViewStyle,
    default: {} as ViewStyle,
  }),
  listItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    cursor: "pointer",
  } as ViewStyle,
  highlightedListItem: {
    backgroundColor: Colors.light.secondary,
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
    color: Colors.light.error,
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
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    color: Colors.light.text,
    fontWeight: "bold",
    textAlign: "left",
  } as ViewStyle,
  listHeader: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  } as ViewStyle,
  listHeaderItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  } as ViewStyle,
  tableCell: Platform.select({
    web: {
      padding: 12,
      color: Colors.light.text,
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
    borderColor: Colors.light.textDim,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  } as ViewStyle,
  clearIconText: {
    fontSize: 14,
    color: Colors.light.textDim,
    fontWeight: "bold",
  } as TextStyle,
});

const getStyles = (colorScheme: "light" | "dark"): DynamicStyles => ({
  container: {
    flex: 1,
    backgroundColor: colorScheme === "dark" ? "#1a1a1a" : "#ffffff",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colorScheme === "dark" ? "#ffffff" : "#000000",
  },
  searchContainer: {
    padding: 16,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
    borderRadius: 8,
    padding: 8,
    color: colorScheme === "dark" ? "#ffffff" : "#000000",
  },
  resultsList: {
    padding: 16,
  },
  resultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
  },
  resultText: {
    fontSize: 16,
    color: colorScheme === "dark" ? "#ffffff" : "#000000",
  },
  tableContainer: Platform.select({
    web: {
      flex: 1,
      overflowX: "auto",
      borderWidth: 1,
      borderColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
      borderRadius: 8,
      marginTop: 16,
    },
    default: {},
  }),
  table: Platform.select({
    web: {
      width: "100%",
      backgroundColor: colorScheme === "dark" ? "#1a1a1a" : "#ffffff",
    } as any, // Use any to bypass borderCollapse type issue
    default: {},
  }),
  tableRow: Platform.select({
    web: {
      borderBottomWidth: 1,
      borderBottomColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
      backgroundColor: "transparent",
    } as any, // Use any to bypass transition type issue
    default: {},
  }),
  tableCell: {
    padding: 12,
    color: colorScheme === "dark" ? "#ffffff" : "#000000",
  },
  sortableHeader: {
    cursor: "pointer",
    userSelect: "none",
    padding: 8,
    backgroundColor: colorScheme === "dark" ? "#333333" : "#e0e0e0",
    borderBottomWidth: 1,
    borderBottomColor: colorScheme === "dark" ? "#555555" : "#e0e0e0",
    color: colorScheme === "dark" ? "#ffffff" : "#000000",
    fontWeight: "bold",
    textAlign: "left",
  },
});
