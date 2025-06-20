import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  Platform,
  ActivityIndicator,
  View,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { DatePicker } from "@/components/DatePicker";
import { CalendarSelector } from "./CalendarSelector";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useAdminCalendarManagementStore } from "@/store/adminCalendarManagementStore";
import { useUserStore } from "@/store/userStore";
import { supabase } from "@/utils/supabase";
import { format, isValid } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Types for waitlist management
interface PldSdvRequestWithPosition {
  id: string;
  member_id: string | null;
  pin_number: number | null;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled" | "transferred";
  requested_at: string | null;
  waitlist_position: number | null;
  metadata?: Record<string, any> | null;
  position: number; // Our calculated position (1-based)
  calculatedStatus: "approved" | "waitlisted";
  hasChanged: boolean;
  member?: {
    id: string;
    pin_number: number;
    first_name: string | null;
    last_name: string | null;
  };
}

interface ChangesSummary {
  statusChanges: Array<{
    memberName: string;
    oldStatus: string;
    newStatus: string;
    oldPosition: number;
    newPosition: number;
  }>;
  positionChanges: Array<{
    memberName: string;
    oldPosition: number;
    newPosition: number;
  }>;
}

interface WaitlistManagementState {
  selectedDate: Date | null;
  allocationLimit: number;
  allocationOverride: number | null;
  originalRequests: PldSdvRequestWithPosition[];
  currentRequests: PldSdvRequestWithPosition[];
  savedRequests: PldSdvRequestWithPosition[] | null;
  hasChanges: boolean;
  isLoading: boolean;
  isSaving: boolean;
  showConfirmDialog: boolean;
  changesSummary: ChangesSummary | null;
}

interface ManageWaitlistComponentProps {
  selectedDivision: string;
  selectedCalendarId: string | null;
  onCalendarChange?: (calendarId: string | null) => void;
}

export function ManageWaitlistComponent({
  selectedDivision,
  selectedCalendarId,
  onCalendarChange,
}: ManageWaitlistComponentProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;
  const { calendars } = useAdminCalendarManagementStore();
  const { member: adminUser } = useUserStore();

  // Initial state
  const [state, setState] = useState<WaitlistManagementState>({
    selectedDate: null,
    allocationLimit: 0,
    allocationOverride: null,
    originalRequests: [],
    currentRequests: [],
    savedRequests: null,
    hasChanges: false,
    isLoading: false,
    isSaving: false,
    showConfirmDialog: false,
    changesSummary: null,
  });

  // Get current division's calendars
  const currentDivisionCalendars = calendars[selectedDivision] || [];

  // Dynamic styles based on color scheme
  const dynamicStyles = useMemo(
    () => ({
      container: {
        flex: 1,
        backgroundColor: Colors[colorScheme].background,
      } as const,
      header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors[colorScheme].border,
      } as const,
      title: {
        fontSize: 24,
        fontWeight: "bold" as const,
        color: Colors[colorScheme].text,
        marginBottom: 8,
      } as const,
      subtitle: {
        fontSize: 16,
        color: Colors[colorScheme].textDim,
      } as const,
      section: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors[colorScheme].border,
      } as const,
      sectionTitle: {
        fontSize: 18,
        fontWeight: "600" as const,
        color: Colors[colorScheme].text,
        marginBottom: 12,
      } as const,
      row: {
        flexDirection: "row" as const,
        gap: 16,
        marginBottom: 16,
      } as const,
      inputContainer: {
        flex: 1,
      } as const,
      label: {
        fontSize: 14,
        fontWeight: "500" as const,
        color: Colors[colorScheme].text,
        marginBottom: 8,
      } as const,
      allocationContainer: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        padding: 12,
        backgroundColor: Colors[colorScheme].card,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors[colorScheme].border,
      } as const,
      allocationText: {
        fontSize: 16,
        fontWeight: "600" as const,
        color: Colors[colorScheme].text,
      } as const,
      overrideInput: {
        width: 60,
        height: 32,
        borderWidth: 1,
        borderColor: Colors[colorScheme].border,
        borderRadius: 4,
        paddingHorizontal: 8,
        textAlign: "center" as const,
        color: Colors[colorScheme].text,
        backgroundColor: Colors[colorScheme].background,
      } as const,
      contentContainer: {
        flex: 1,
        padding: 16,
      } as const,
      emptyState: {
        flex: 1,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        paddingVertical: 32,
      } as const,
      emptyStateText: {
        fontSize: 18,
        color: Colors[colorScheme].textDim,
        textAlign: "center" as const,
      } as const,
      mobileNotSupportedContainer: {
        flex: 1,
        justifyContent: "center" as const,
        alignItems: "center" as const,
        padding: 32,
        backgroundColor: Colors[colorScheme].card,
        borderRadius: 8,
        margin: 16,
      } as const,
      mobileNotSupportedTitle: {
        fontSize: 20,
        fontWeight: "600" as const,
        marginTop: 16,
        marginBottom: 8,
        textAlign: "center" as const,
        color: Colors[colorScheme].text,
      } as const,
      mobileNotSupportedText: {
        fontSize: 16,
        textAlign: "center" as const,
        color: Colors[colorScheme].textDim,
        lineHeight: 24,
      } as const,
      requestItem: {
        padding: 16,
        marginBottom: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors[colorScheme].border,
      } as const,
      requestHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
      } as const,
      positionBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors[colorScheme].tint,
        justifyContent: "center" as const,
        alignItems: "center" as const,
      } as const,
      positionText: {
        fontSize: 14,
        fontWeight: "bold" as const,
      } as const,
      memberInfo: {
        flex: 1,
      } as const,
      memberName: {
        fontSize: 16,
        fontWeight: "600" as const,
        color: Colors[colorScheme].text,
        marginBottom: 2,
      } as const,
      requestDetails: {
        fontSize: 14,
        color: Colors[colorScheme].textDim,
      } as const,
      statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
      } as const,
      statusText: {
        fontSize: 12,
        fontWeight: "600" as const,
      } as const,
      changeIndicator: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: Colors[colorScheme].border,
      } as const,
      changeText: {
        fontSize: 12,
        fontStyle: "italic" as const,
      } as const,
      actionButtons: {
        flexDirection: "row" as const,
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: Colors[colorScheme].border,
      } as const,
      button: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: "center" as const,
      } as const,
      primaryButton: {
        backgroundColor: Colors[colorScheme].tint,
      } as const,
      secondaryButton: {
        backgroundColor: Colors[colorScheme].card,
        borderWidth: 1,
        borderColor: Colors[colorScheme].border,
      } as const,
      buttonText: {
        fontSize: 16,
        fontWeight: "600" as const,
      } as const,
      primaryButtonText: {
        color: Colors[colorScheme].background,
      } as const,
      secondaryButtonText: {
        color: Colors[colorScheme].text,
      } as const,
    }),
    [colorScheme]
  );

  // Fetch allocation limit from database
  const fetchAllocationLimit = useCallback(async (calendarId: string, date: Date): Promise<number> => {
    try {
      const year = date.getFullYear();

      // First try to get yearly allocation
      const { data: yearlyAllotment, error: yearlyError } = await supabase
        .from("pld_sdv_allotments")
        .select("max_allotment")
        .eq("calendar_id", calendarId)
        .eq("year", year)
        .is("date", null)
        .maybeSingle();

      if (yearlyError) {
        console.warn("[ManageWaitlist] Error fetching yearly allotment:", yearlyError);
      }

      // Then check for date-specific override
      const dateStr = format(date, "yyyy-MM-dd");
      const { data: dateAllotment, error: dateError } = await supabase
        .from("pld_sdv_allotments")
        .select("max_allotment")
        .eq("calendar_id", calendarId)
        .eq("date", dateStr)
        .maybeSingle();

      if (dateError) {
        console.warn("[ManageWaitlist] Error fetching date allotment:", dateError);
      }

      // Use date-specific override if available, otherwise yearly default
      return dateAllotment?.max_allotment || yearlyAllotment?.max_allotment || 0;
    } catch (error) {
      console.error("[ManageWaitlist] Error fetching allocation limit:", error);
      return 0;
    }
  }, []);

  // Fetch requests for selected date and calendar
  const fetchRequestsForDate = useCallback(
    async (calendarId: string, date: Date) => {
      if (!calendarId || !date) return;

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const dateStr = format(date, "yyyy-MM-dd");

        // Fetch requests for the selected date
        const { data: requests, error } = await supabase
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
          .eq("request_date", dateStr)
          .in("status", ["pending", "approved", "waitlisted"])
          .order("status")
          .order("waitlist_position", { nullsFirst: false })
          .order("requested_at");

        if (error) throw error;

        // Fetch allocation limit for this calendar and date
        const allocationLimit = await fetchAllocationLimit(calendarId, date);

        // Process requests and assign positions
        const processedRequests: PldSdvRequestWithPosition[] = (requests || []).map((req, index) => {
          const position = index + 1;
          const calculatedStatus = position <= allocationLimit ? "approved" : "waitlisted";

          return {
            ...req,
            position,
            calculatedStatus,
            hasChanged: false,
          };
        });

        setState((prev) => ({
          ...prev,
          allocationLimit,
          originalRequests: processedRequests,
          currentRequests: [...processedRequests],
          hasChanges: false,
          isLoading: false,
        }));
      } catch (error) {
        console.error("[ManageWaitlist] Error fetching requests:", error);
        Toast.show({
          type: "error",
          text1: "Error",
          text2: error instanceof Error ? error.message : "Failed to fetch requests",
        });
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    },
    [fetchAllocationLimit]
  );

  // Handle date change
  const handleDateChange = useCallback(
    (date: Date | null) => {
      setState((prev) => ({
        ...prev,
        selectedDate: date,
        allocationOverride: null,
        originalRequests: [],
        currentRequests: [],
        hasChanges: false,
      }));

      if (date && selectedCalendarId) {
        fetchRequestsForDate(selectedCalendarId, date);
      }
    },
    [selectedCalendarId, fetchRequestsForDate]
  );

  // Handle calendar change
  const handleCalendarChange = useCallback(
    (calendarId: string | null) => {
      console.log("[ManageWaitlist] Calendar changed to:", calendarId);
      onCalendarChange?.(calendarId);

      setState((prev) => ({
        ...prev,
        allocationOverride: null,
        originalRequests: [],
        currentRequests: [],
        hasChanges: false,
      }));

      if (calendarId && state.selectedDate) {
        fetchRequestsForDate(calendarId, state.selectedDate);
      }
    },
    [onCalendarChange, state.selectedDate, fetchRequestsForDate]
  );

  // Handle allocation override change
  const handleAllocationOverrideChange = useCallback((value: string) => {
    const numValue = parseInt(value) || null;
    setState((prev) => {
      const newEffectiveLimit = numValue || prev.allocationLimit;

      // Recalculate all request statuses based on new allocation limit
      const updatedRequests = prev.currentRequests.map((req) => {
        const calculatedStatus: "approved" | "waitlisted" =
          req.position <= newEffectiveLimit ? "approved" : "waitlisted";
        const hasChanged = req.calculatedStatus !== calculatedStatus || req.hasChanged; // Preserve existing changes

        return {
          ...req,
          calculatedStatus,
          hasChanged,
        };
      });

      return {
        ...prev,
        allocationOverride: numValue,
        currentRequests: updatedRequests,
        hasChanges: updatedRequests.some((req) => req.hasChanged),
      };
    });
  }, []);

  // Calculate effective allocation limit
  const effectiveAllocationLimit = state.allocationOverride || state.allocationLimit;

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (active.id !== over?.id) {
        setState((prev) => {
          const oldIndex = prev.currentRequests.findIndex((req) => req.id === active.id);
          const newIndex = prev.currentRequests.findIndex((req) => req.id === over?.id);

          if (oldIndex === -1 || newIndex === -1) return prev;

          const newRequests = arrayMove(prev.currentRequests, oldIndex, newIndex);

          // Recalculate positions and statuses
          const updatedRequests = newRequests.map((req, index) => {
            const position = index + 1;
            const calculatedStatus: "approved" | "waitlisted" =
              position <= effectiveAllocationLimit ? "approved" : "waitlisted";
            const hasChanged = req.position !== position || req.calculatedStatus !== calculatedStatus || req.hasChanged; // Preserve existing changes

            return {
              ...req,
              position,
              calculatedStatus,
              hasChanged,
            };
          });

          return {
            ...prev,
            currentRequests: updatedRequests,
            hasChanges: true,
          };
        });
      }
    },
    [effectiveAllocationLimit]
  );

  // Generate changes summary
  const generateChangesSummary = useCallback((): ChangesSummary => {
    const statusChanges: ChangesSummary["statusChanges"] = [];
    const positionChanges: ChangesSummary["positionChanges"] = [];

    state.currentRequests.forEach((currentReq) => {
      const originalReq = state.originalRequests.find((orig) => orig.id === currentReq.id);
      if (!originalReq) return;

      const memberName = currentReq.member
        ? `${currentReq.member.first_name} ${currentReq.member.last_name}`
        : `PIN ${currentReq.pin_number || currentReq.member_id || "Unknown"}`;

      // Check for status changes
      if (originalReq.calculatedStatus !== currentReq.calculatedStatus) {
        statusChanges.push({
          memberName,
          oldStatus: originalReq.calculatedStatus,
          newStatus: currentReq.calculatedStatus,
          oldPosition: originalReq.position,
          newPosition: currentReq.position,
        });
      }
      // Check for position changes (without status change)
      else if (originalReq.position !== currentReq.position) {
        positionChanges.push({
          memberName,
          oldPosition: originalReq.position,
          newPosition: currentReq.position,
        });
      }
    });

    return { statusChanges, positionChanges };
  }, [state.currentRequests, state.originalRequests]);

  // Save changes to database
  const saveChanges = useCallback(async () => {
    if (!state.hasChanges || state.isSaving || !selectedCalendarId || !state.selectedDate) return;

    setState((prev) => ({ ...prev, isSaving: true }));

    try {
      // First, update allocation limit if there's an override
      if (state.allocationOverride !== null && state.allocationOverride !== state.allocationLimit) {
        const dateStr = format(state.selectedDate, "yyyy-MM-dd");

        const { error: allocationError } = await supabase.from("pld_sdv_allotments").upsert(
          {
            calendar_id: selectedCalendarId,
            date: dateStr,
            max_allotment: state.allocationOverride,
            is_override: true,
            override_by: adminUser?.id || null,
            override_at: new Date().toISOString(),
            override_reason: "Waitlist management allocation adjustment",
            updated_at: new Date().toISOString(),
            updated_by: adminUser?.id || null,
          },
          {
            onConflict: "calendar_id,date",
            ignoreDuplicates: false,
          }
        );

        if (allocationError) {
          console.error("[ManageWaitlist] Error updating allocation:", allocationError);
          throw new Error("Failed to update allocation limit");
        }
      }

      // Update each request sequentially to avoid conflicts
      for (const request of state.currentRequests) {
        const originalRequest = state.originalRequests.find((orig) => orig.id === request.id);
        if (!originalRequest || !request.hasChanged) continue;

        const updates: any = {
          status: request.calculatedStatus,
          waitlist_position:
            request.calculatedStatus === "waitlisted" ? request.position - effectiveAllocationLimit : null,
          updated_at: new Date().toISOString(),
        };

        // Add audit metadata
        const auditMetadata = {
          reorder_change: {
            old_position: originalRequest.position,
            new_position: request.position,
            old_status: originalRequest.calculatedStatus,
            new_status: request.calculatedStatus,
            changed_by: adminUser?.id || "unknown",
            changed_at: new Date().toISOString(),
            reason: "Waitlist reordering",
            allocation_override:
              state.allocationOverride !== null
                ? {
                    old_limit: state.allocationLimit,
                    new_limit: effectiveAllocationLimit,
                  }
                : null,
          },
        };

        if (request.metadata && typeof request.metadata === "object") {
          updates.metadata = { ...request.metadata, ...auditMetadata };
        } else {
          updates.metadata = auditMetadata;
        }

        const { error } = await supabase.from("pld_sdv_requests").update(updates).eq("id", request.id);

        if (error) throw error;
      }

      // Update state to reflect saved changes
      setState((prev) => ({
        ...prev,
        originalRequests: [...prev.currentRequests],
        savedRequests: [...prev.currentRequests],
        // Update the original allocation limit to the new effective limit
        allocationLimit: effectiveAllocationLimit,
        allocationOverride: null, // Clear the override since it's now the base limit
        hasChanges: false,
        isSaving: false,
        showConfirmDialog: false,
        changesSummary: null,
      }));

      Toast.show({
        type: "success",
        text1: "Success",
        text2: `Waitlist order updated successfully${
          state.allocationOverride !== null ? " with new allocation limit" : ""
        }`,
      });
    } catch (error) {
      console.error("[ManageWaitlist] Error saving changes:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: error instanceof Error ? error.message : "Failed to save changes",
      });
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [
    state.currentRequests,
    state.originalRequests,
    state.hasChanges,
    state.isSaving,
    state.allocationOverride,
    state.allocationLimit,
    state.selectedDate,
    selectedCalendarId,
    effectiveAllocationLimit,
    adminUser?.id,
  ]);

  // Undo changes
  const undoChanges = useCallback(() => {
    if (state.savedRequests) {
      setState((prev) => ({
        ...prev,
        currentRequests: [...prev.savedRequests!],
        hasChanges: false,
        showConfirmDialog: false,
        changesSummary: null,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        currentRequests: [...prev.originalRequests],
        hasChanges: false,
        showConfirmDialog: false,
        changesSummary: null,
      }));
    }
  }, [state.savedRequests]);

  // Show confirmation dialog
  const showConfirmation = useCallback(() => {
    const summary = generateChangesSummary();
    setState((prev) => ({
      ...prev,
      changesSummary: summary,
      showConfirmDialog: true,
    }));
  }, [generateChangesSummary]);

  // Sortable item component
  const SortableRequestItem = ({ request }: { request: PldSdvRequestWithPosition }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: request.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const memberName = request.member
      ? `${request.member.first_name} ${request.member.last_name}`
      : `PIN ${request.pin_number || request.member_id || "Unknown"}`;

    const isApproved = request.calculatedStatus === "approved";
    const statusColor = isApproved ? Colors[colorScheme].success : Colors[colorScheme].warning;
    const statusBgColor = isApproved ? Colors[colorScheme].card : Colors[colorScheme].card;

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="sortable-item">
        <View
          style={[
            dynamicStyles.requestItem,
            {
              backgroundColor: request.hasChanged ? Colors[colorScheme].secondary : Colors[colorScheme].card,
              borderLeftWidth: 4,
              borderLeftColor: statusColor,
            },
          ]}
        >
          <View style={dynamicStyles.requestHeader}>
            <View style={dynamicStyles.positionBadge}>
              <ThemedText style={[dynamicStyles.positionText, { color: Colors[colorScheme].background }]}>
                {request.position}
              </ThemedText>
            </View>
            <View style={dynamicStyles.memberInfo}>
              <ThemedText style={dynamicStyles.memberName}>{memberName}</ThemedText>
              <ThemedText style={dynamicStyles.requestDetails}>
                {request.leave_type} • {format(new Date(request.request_date + "T12:00:00"), "MMM d, yyyy")}
              </ThemedText>
            </View>
            <View style={[dynamicStyles.statusBadge, { backgroundColor: statusBgColor }]}>
              <ThemedText style={[dynamicStyles.statusText, { color: statusColor }]}>
                {request.calculatedStatus.toUpperCase()}
              </ThemedText>
            </View>
            <Ionicons name="reorder-three-outline" size={20} color={Colors[colorScheme].textDim} />
          </View>
          {request.hasChanged && (
            <View style={dynamicStyles.changeIndicator}>
              <Ionicons name="sync-outline" size={14} color={Colors[colorScheme].tint} />
              <ThemedText style={[dynamicStyles.changeText, { color: Colors[colorScheme].tint }]}>
                Position changed
              </ThemedText>
            </View>
          )}
        </View>
      </div>
    );
  };

  // Show mobile not supported message
  if (isMobile) {
    return (
      <ThemedView style={dynamicStyles.container}>
        <View style={dynamicStyles.mobileNotSupportedContainer}>
          <Ionicons name="desktop-outline" size={48} color={Colors[colorScheme].tint} />
          <ThemedText style={dynamicStyles.mobileNotSupportedTitle}>Desktop Required</ThemedText>
          <ThemedText style={dynamicStyles.mobileNotSupportedText}>
            Waitlist management requires a desktop browser due to the complex drag-and-drop interface. Please use a
            computer to access this feature.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={dynamicStyles.container}>
      {/* Header */}
      <View style={dynamicStyles.header}>
        <ThemedText style={dynamicStyles.title}>Manage Waitlist</ThemedText>
        <ThemedText style={dynamicStyles.subtitle}>
          Reorder requests to manage approval and waitlist priorities
        </ThemedText>
      </View>

      {/* Date and Calendar Selection */}
      <View style={dynamicStyles.section}>
        <ThemedText style={dynamicStyles.sectionTitle}>Selection</ThemedText>
        <View style={dynamicStyles.row}>
          <View style={dynamicStyles.inputContainer}>
            <ThemedText style={dynamicStyles.label}>Calendar</ThemedText>
            <CalendarSelector
              calendars={currentDivisionCalendars}
              selectedCalendarId={selectedCalendarId}
              onSelectCalendar={handleCalendarChange}
            />
          </View>
          <View style={dynamicStyles.inputContainer}>
            <ThemedText style={dynamicStyles.label}>Date</ThemedText>
            <DatePicker
              date={state.selectedDate}
              onDateChange={handleDateChange}
              placeholder="Select date to manage"
              style={{ height: 44 }}
            />
          </View>
        </View>

        {/* Allocation Display and Override */}
        {selectedCalendarId && state.selectedDate && (
          <View style={dynamicStyles.row}>
            <View style={dynamicStyles.inputContainer}>
              <ThemedText style={dynamicStyles.label}>Allocation Limit</ThemedText>
              <View style={dynamicStyles.allocationContainer}>
                <ThemedText style={dynamicStyles.allocationText}>{state.allocationLimit} spots</ThemedText>
                <ThemedText style={{ color: Colors[colorScheme].textDim }}>Override:</ThemedText>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={state.allocationOverride || ""}
                  onChange={(e) => handleAllocationOverrideChange(e.target.value)}
                  placeholder={state.allocationLimit.toString()}
                  style={dynamicStyles.overrideInput}
                />
                {state.allocationOverride && (
                  <>
                    <ThemedText style={{ color: Colors[colorScheme].tint, fontWeight: "600" }}>
                      = {effectiveAllocationLimit} spots
                    </ThemedText>
                    <TouchableOpacity onPress={() => handleAllocationOverrideChange("")} style={{ marginLeft: 4 }}>
                      <Ionicons name="close-circle" size={20} color={Colors[colorScheme].error} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Content Area */}
      <View style={dynamicStyles.contentContainer}>
        {state.isLoading ? (
          <View style={dynamicStyles.emptyState}>
            <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
            <ThemedText style={[dynamicStyles.emptyStateText, { marginTop: 16 }]}>Loading requests...</ThemedText>
          </View>
        ) : !selectedCalendarId || !state.selectedDate ? (
          <View style={dynamicStyles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors[colorScheme].textDim} />
            <ThemedText style={dynamicStyles.emptyStateText}>Select a calendar and date to manage waitlist</ThemedText>
          </View>
        ) : state.currentRequests.length === 0 ? (
          <View style={dynamicStyles.emptyState}>
            <Ionicons name="list-outline" size={48} color={Colors[colorScheme].textDim} />
            <ThemedText style={dynamicStyles.emptyStateText}>
              No requests found for {format(state.selectedDate, "MMM d, yyyy")}
            </ThemedText>
          </View>
        ) : (
          <>
            {/* Allocation Summary */}
            <View style={dynamicStyles.section}>
              <ThemedText style={dynamicStyles.sectionTitle}>
                Summary ({state.currentRequests.length} requests)
              </ThemedText>
              <View style={dynamicStyles.row}>
                <ThemedText style={dynamicStyles.label}>
                  Approved: {state.currentRequests.filter((r) => r.calculatedStatus === "approved").length} /{" "}
                  {effectiveAllocationLimit}
                </ThemedText>
                <ThemedText style={dynamicStyles.label}>
                  Waitlisted: {state.currentRequests.filter((r) => r.calculatedStatus === "waitlisted").length}
                </ThemedText>
              </View>
              {state.hasChanges && (
                <ThemedText style={[dynamicStyles.label, { color: Colors[colorScheme].tint, fontStyle: "italic" }]}>
                  You have unsaved changes
                </ThemedText>
              )}
            </View>

            {/* Drag and Drop List */}
            <View style={{ flex: 1, padding: 16 }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={state.currentRequests.map((req) => req.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ScrollView style={{ flex: 1 }}>
                    {state.currentRequests.map((request) => (
                      <SortableRequestItem key={request.id} request={request} />
                    ))}
                  </ScrollView>
                </SortableContext>
              </DndContext>
            </View>

            {/* Action Buttons */}
            {state.hasChanges && (
              <View style={dynamicStyles.actionButtons}>
                <TouchableOpacity
                  style={[dynamicStyles.button, dynamicStyles.secondaryButton]}
                  onPress={undoChanges}
                  disabled={state.isSaving}
                >
                  <ThemedText style={[dynamicStyles.buttonText, dynamicStyles.secondaryButtonText]}>
                    Undo Changes
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[dynamicStyles.button, dynamicStyles.primaryButton]}
                  onPress={showConfirmation}
                  disabled={state.isSaving}
                >
                  <ThemedText style={[dynamicStyles.buttonText, dynamicStyles.primaryButtonText]}>
                    {state.isSaving ? "Saving..." : "Save Changes"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Confirmation Dialog */}
      <Modal
        visible={state.showConfirmDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setState((prev) => ({ ...prev, showConfirmDialog: false }))}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: Colors[colorScheme].background,
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "100%",
              maxHeight: "80%",
            }}
          >
            <ThemedText
              style={{
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 16,
                textAlign: "center",
                color: Colors[colorScheme].text,
              }}
            >
              Confirm Changes
            </ThemedText>

            {state.changesSummary && (
              <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
                {state.changesSummary.statusChanges.length > 0 && (
                  <>
                    <ThemedText
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        marginBottom: 8,
                        color: Colors[colorScheme].text,
                      }}
                    >
                      Status Changes:
                    </ThemedText>
                    {state.changesSummary.statusChanges.map((change, index) => (
                      <ThemedText
                        key={index}
                        style={{
                          fontSize: 14,
                          marginBottom: 4,
                          color: Colors[colorScheme].textDim,
                        }}
                      >
                        • {change.memberName}: {change.oldStatus} → {change.newStatus} (position {change.oldPosition} →{" "}
                        {change.newPosition})
                      </ThemedText>
                    ))}
                  </>
                )}

                {state.changesSummary.positionChanges.length > 0 && (
                  <>
                    <ThemedText
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        marginTop: 12,
                        marginBottom: 8,
                        color: Colors[colorScheme].text,
                      }}
                    >
                      Position Changes:
                    </ThemedText>
                    {state.changesSummary.positionChanges.map((change, index) => (
                      <ThemedText
                        key={index}
                        style={{
                          fontSize: 14,
                          marginBottom: 4,
                          color: Colors[colorScheme].textDim,
                        }}
                      >
                        • {change.memberName}: position {change.oldPosition} → {change.newPosition}
                      </ThemedText>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                justifyContent: "space-between",
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: Colors[colorScheme].card,
                  borderWidth: 1,
                  borderColor: Colors[colorScheme].border,
                  alignItems: "center",
                }}
                onPress={() => setState((prev) => ({ ...prev, showConfirmDialog: false }))}
                disabled={state.isSaving}
              >
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: Colors[colorScheme].text,
                  }}
                >
                  Cancel
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: Colors[colorScheme].tint,
                  alignItems: "center",
                  opacity: state.isSaving ? 0.7 : 1,
                }}
                onPress={saveChanges}
                disabled={state.isSaving}
              >
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: Colors[colorScheme].background,
                  }}
                >
                  {state.isSaving ? "Saving..." : "Confirm"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
