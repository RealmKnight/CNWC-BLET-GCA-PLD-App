import React, { useState, useCallback, useMemo, useRef } from "react";
import { StyleSheet, View, ScrollView, TextInput, Animated, Alert, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";

// @dnd-kit imports for modern drag and drop
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  StagedImportPreview,
  ImportStage,
  ImportPreviewItem,
  OverAllotmentDate,
  updateWaitlistPositionsDuringDrag,
  validateWaitlistPositions,
  resetWaitlistPositions,
} from "@/utils/importPreviewService";
import { supabase } from "@/utils/supabase";

interface OverAllotmentReviewProps {
  stagedPreview: StagedImportPreview;
  onStageUpdate: (stage: ImportStage, isComplete: boolean) => void;
  onDataUpdate: (preview: StagedImportPreview) => void;
}

interface DraggableRequestItem extends ImportPreviewItem {
  originalIndex: number;
  adminOrder: number;
  finalStatus: "approved" | "waitlisted" | "skipped";
  waitlistPosition?: number;
  hasStatusChange?: boolean; // Track if status changed from original
  isSkipped?: boolean; // Track if item is marked for skipping
}

interface ExistingRequest {
  id: string;
  member_id?: string;
  pin_number?: number;
  first_name?: string;
  last_name?: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  status: "approved" | "waitlisted";
  waitlist_position?: number;
  requested_at: string;
  isExisting: true; // Flag to distinguish from import requests
}

interface PositionValidationResult {
  isValid: boolean;
  conflicts: Array<{ position: number; existingId: string; proposedId: string }>;
  gaps: number[];
  suggestions: Array<{ itemId: string; suggestedPosition: number }>;
}

export function OverAllotmentReview({ stagedPreview, onStageUpdate, onDataUpdate }: OverAllotmentReviewProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [customAllotments, setCustomAllotments] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverZone, setDragOverZone] = useState<"approved" | "waitlisted" | "skipped" | null>(null);
  const [positionValidation, setPositionValidation] = useState<PositionValidationResult | null>(null);
  const [isValidatingPositions, setIsValidatingPositions] = useState(false);
  const [isResettingPositions, setIsResettingPositions] = useState(false);
  const [skippedRequests, setSkippedRequests] = useState<Set<number>>(new Set());
  const [showAllRequests, setShowAllRequests] = useState(true);

  // State for existing requests from database
  const [existingRequests, setExistingRequests] = useState<Record<string, ExistingRequest[]>>({});
  const [isLoadingExistingRequests, setIsLoadingExistingRequests] = useState(false);
  const [showExistingRequests, setShowExistingRequests] = useState(true);

  // Enhanced drag state for better visual feedback
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragInsertPosition, setDragInsertPosition] = useState<"above" | "below" | null>(null);

  // State for drag and drop with @dnd-kit
  const [activeItem, setActiveItem] = useState<DraggableRequestItem | null>(null);

  // @dnd-kit sensors for touch, mouse, and keyboard support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper function to parse date strings as local dates to avoid timezone issues
  const parseLocalDate = (dateString: string) => {
    if (!dateString || typeof dateString !== "string") {
      return new Date(); // fallback to current date
    }
    const parts = dateString.split("-");
    if (parts.length !== 3) {
      return new Date(dateString); // fallback to default parsing
    }
    const [year, month, day] = parts.map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date(dateString); // fallback to default parsing
    }
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  // Enhanced animation values for visual feedback
  const dragHandleScale = useRef(new Animated.Value(1)).current;
  const dropZoneOpacity = useRef(new Animated.Value(0)).current;
  const stageTransitionOpacity = useRef(new Animated.Value(1)).current;

  const { over_allotment } = stagedPreview.progressState.stageData;

  // Check if stage is complete - SIMPLIFIED: Allow defaults without requiring admin input
  const isStageComplete = useMemo(() => {
    // If no over-allotted dates, stage is complete
    if (over_allotment.overAllottedDates.length === 0) {
      return true;
    }

    // For each over-allotted date, check if admin has made decisions OR we can use defaults
    return over_allotment.overAllottedDates.every((dateInfo) => {
      // Admin can either:
      // 1. Explicitly set ordering AND allotment decision, OR
      // 2. Accept defaults (no action required)

      const hasExplicitOrdering = over_allotment.requestOrdering[dateInfo.date];
      const hasExplicitAllotmentDecision = over_allotment.allotmentAdjustments[dateInfo.date] !== undefined;

      // If admin has taken explicit actions, they must complete both
      if (hasExplicitOrdering || hasExplicitAllotmentDecision) {
        const hasAllotmentDecision = hasExplicitAllotmentDecision || dateInfo.overAllotmentCount === 0;
        return hasExplicitOrdering && hasAllotmentDecision;
      }

      // If admin hasn't taken any explicit actions, accept defaults
      // Default behavior: keep current allotment, use natural order, waitlist excess requests
      return true;
    });
  }, [over_allotment]);

  // Update stage completion when it changes
  React.useEffect(() => {
    onStageUpdate("over_allotment", isStageComplete);
  }, [isStageComplete, onStageUpdate]);

  // Get current date info
  const currentDateInfo = over_allotment.overAllottedDates[selectedDateIndex];

  // Fetch existing requests for a given date
  const fetchExistingRequestsForDate = useCallback(
    async (dateStr: string) => {
      if (existingRequests[dateStr]) {
        return; // Already fetched for this date
      }

      setIsLoadingExistingRequests(true);
      try {
        console.log(`[OverAllotment] Fetching existing requests for ${dateStr}`);

        // First, get all requests for the date (excluding cancelled requests)
        const { data: requests, error: requestsError } = await supabase
          .from("pld_sdv_requests")
          .select(
            `
            id,
            member_id,
            pin_number,
            request_date,
            leave_type,
            status,
            waitlist_position,
            requested_at,
            import_source
          `
          )
          .eq("calendar_id", stagedPreview.calendarId)
          .eq("request_date", dateStr)
          .in("status", ["approved", "waitlisted", "pending"]) // Exclude cancelled requests
          .order("status", { ascending: false })
          .order("waitlist_position", { ascending: true });

        if (requestsError) {
          console.error("Error fetching requests:", requestsError);
          return;
        }

        // Now get member information for each request
        const formattedRequests: ExistingRequest[] = await Promise.all(
          (requests || []).map(async (req: any) => {
            let memberInfo = { first_name: "Unknown", last_name: "Unknown" };

            try {
              if (req.member_id) {
                // App request - lookup by member_id
                const { data: memberData } = await supabase
                  .from("members")
                  .select("first_name, last_name")
                  .eq("id", req.member_id)
                  .single();
                if (memberData) memberInfo = memberData;
              } else if (req.pin_number) {
                // iCal import - lookup by pin_number
                const { data: memberData } = await supabase
                  .from("members")
                  .select("first_name, last_name")
                  .eq("pin_number", req.pin_number)
                  .single();
                if (memberData) memberInfo = memberData;
              }
            } catch (memberError) {
              console.warn(`Could not fetch member info for request ${req.id} (${req.import_source}):`, memberError);

              // Log more details for debugging
              if (req.member_id) {
                console.warn(`  - Looking up by member_id: ${req.member_id}`);
              } else if (req.pin_number) {
                console.warn(`  - Looking up by pin_number: ${req.pin_number}`);
              }
            }

            return {
              id: req.id,
              member_id: req.member_id,
              pin_number: req.pin_number,
              first_name: memberInfo.first_name,
              last_name: memberInfo.last_name,
              request_date: req.request_date,
              leave_type: req.leave_type,
              status: req.status,
              waitlist_position: req.waitlist_position,
              requested_at: req.requested_at,
              isExisting: true,
            };
          })
        );

        setExistingRequests((prev) => ({
          ...prev,
          [dateStr]: formattedRequests,
        }));

        console.log(`[OverAllotment] Loaded ${formattedRequests.length} existing requests for ${dateStr}`);
        console.log(`[OverAllotment] Request breakdown:`, {
          total: formattedRequests.length,
          withMemberId: formattedRequests.filter((r) => r.member_id).length,
          withPinNumber: formattedRequests.filter((r) => r.pin_number).length,
          resolved: formattedRequests.filter((r) => r.first_name !== "Unknown").length,
        });
      } catch (error) {
        console.error("Error fetching existing requests:", error);
      } finally {
        setIsLoadingExistingRequests(false);
      }
    },
    [existingRequests, stagedPreview.calendarId]
  );

  // Handle skipping/unskipping requests
  const handleSkipRequest = useCallback(
    (originalIndex: number, shouldSkip: boolean) => {
      console.log(`[OverAllotment] ${shouldSkip ? "Skipping" : "Unskipping"} request at index ${originalIndex}`);

      const newSkippedRequests = new Set(skippedRequests);
      if (shouldSkip) {
        newSkippedRequests.add(originalIndex);
      } else {
        newSkippedRequests.delete(originalIndex);
      }
      setSkippedRequests(newSkippedRequests);

      // Update the staged preview to mark items as skipped in the unmatched stage
      const updatedPreview = { ...stagedPreview };
      if (shouldSkip) {
        updatedPreview.progressState.stageData.unmatched.skippedItems.add(originalIndex);
      } else {
        updatedPreview.progressState.stageData.unmatched.skippedItems.delete(originalIndex);
      }
      updatedPreview.lastUpdated = new Date();
      onDataUpdate(updatedPreview);
    },
    [skippedRequests, stagedPreview, onDataUpdate]
  );

  // Load skipped items from staged preview on mount and when date changes
  React.useEffect(() => {
    if (currentDateInfo) {
      const skippedFromPreview = new Set<number>();
      stagedPreview.progressState.stageData.unmatched.skippedItems.forEach((index) => {
        // Check if this skipped item belongs to the current date
        const item = stagedPreview.originalItems[index];
        if (item && item.requestDate.toISOString().split("T")[0] === currentDateInfo.date) {
          skippedFromPreview.add(index);
        }
      });
      setSkippedRequests(skippedFromPreview);
    }
  }, [currentDateInfo, stagedPreview]);

  // Fetch existing requests when date changes
  React.useEffect(() => {
    if (currentDateInfo) {
      fetchExistingRequestsForDate(currentDateInfo.date);
    }
  }, [currentDateInfo, fetchExistingRequestsForDate]);

  // Pre-calculate values to avoid IIFEs in JSX
  const availableSlots = currentDateInfo
    ? Math.max(
        0,
        (over_allotment.allotmentAdjustments[currentDateInfo.date] || currentDateInfo.currentAllotment || 0) -
          (currentDateInfo.existingRequests || 0)
      )
    : 0;
  const availableSlotsText = `${availableSlots} slots available`;

  // Prepare draggable items for current date (only import requests, existing will be shown separately)
  const draggableItems = useMemo(() => {
    if (!currentDateInfo) return [];

    const existingOrdering = over_allotment.requestOrdering[currentDateInfo.date] || [];
    const effectiveAllotment =
      over_allotment.allotmentAdjustments[currentDateInfo.date] || currentDateInfo.currentAllotment;
    const approvedSlots = effectiveAllotment - currentDateInfo.existingRequests;

    // Get ALL import requests for this date, not just the ones in currentDateInfo.importRequests
    // This ensures we see all requests that need admin review
    const allDateRequests = stagedPreview.originalItems.filter((item, index) => {
      const itemDate = item.requestDate.toISOString().split("T")[0];
      return (
        itemDate === currentDateInfo.date && !stagedPreview.progressState.stageData.duplicates.skipDuplicates.has(index)
      );
    });

    console.log(`[OverAllotment] Found ${allDateRequests.length} total requests for ${currentDateInfo.date}`);
    console.log(`[OverAllotment] Available slots: ${approvedSlots}, Skipped count: ${skippedRequests.size}`);

    // Create draggable items with current ordering or default order
    let items: DraggableRequestItem[];

    if (existingOrdering.length > 0) {
      // Use existing order, but include all requests for the date
      const orderedIndices = new Set(existingOrdering);
      const unorderedRequests = allDateRequests.filter((item, localIndex) => {
        const originalIndex = stagedPreview.originalItems.findIndex((orig) => orig === item);
        return !orderedIndices.has(originalIndex);
      });

      // Start with ordered items
      items = existingOrdering.map((originalIndex, adminOrder) => {
        const item = stagedPreview.originalItems[originalIndex];
        const isSkipped = skippedRequests.has(originalIndex);
        const finalStatus = isSkipped ? "skipped" : adminOrder < approvedSlots ? "approved" : "waitlisted";
        const waitlistPosition = finalStatus === "waitlisted" ? adminOrder - approvedSlots + 1 : undefined;
        const hasStatusChange = item.status !== finalStatus;

        return {
          ...item,
          originalIndex,
          adminOrder: adminOrder + 1, // 1-based
          finalStatus,
          waitlistPosition,
          hasStatusChange,
          isSkipped,
        };
      });

      // Add unordered items at the end
      unorderedRequests.forEach((item, index) => {
        const originalIndex = stagedPreview.originalItems.findIndex((orig) => orig === item);
        const adminOrder = items.length + index + 1;
        const isSkipped = skippedRequests.has(originalIndex);
        const finalStatus = isSkipped ? "skipped" : adminOrder <= approvedSlots ? "approved" : "waitlisted";
        const waitlistPosition = finalStatus === "waitlisted" ? adminOrder - approvedSlots : undefined;
        const hasStatusChange = item.status !== finalStatus;

        items.push({
          ...item,
          originalIndex,
          adminOrder,
          finalStatus,
          waitlistPosition,
          hasStatusChange,
          isSkipped,
        });
      });
    } else {
      // Use default order (by original request date/time), showing ALL requests
      items = allDateRequests.map((item, index) => {
        const originalIndex = stagedPreview.originalItems.findIndex((orig) => orig === item);
        const adminOrder = index + 1; // 1-based
        const isSkipped = skippedRequests.has(originalIndex);
        const finalStatus = isSkipped ? "skipped" : index < approvedSlots ? "approved" : "waitlisted";
        const waitlistPosition = finalStatus === "waitlisted" ? index - approvedSlots + 1 : undefined;
        const hasStatusChange = item.status !== finalStatus;

        return {
          ...item,
          originalIndex,
          adminOrder,
          finalStatus,
          waitlistPosition,
          hasStatusChange,
          isSkipped,
        };
      });
    }

    // Filter based on showAllRequests toggle
    const filteredItems = showAllRequests ? items : items.filter((item) => !item.isSkipped);

    console.log(`[OverAllotment] Prepared ${items.length} items (${filteredItems.length} visible)`);
    return filteredItems;
  }, [
    currentDateInfo,
    over_allotment,
    stagedPreview.originalItems,
    stagedPreview.progressState.stageData.duplicates.skipDuplicates,
    skippedRequests,
    showAllRequests,
  ]);

  // Real-time position validation
  const validateCurrentPositions = useCallback(async () => {
    if (!currentDateInfo || !draggableItems.length) return;

    setIsValidatingPositions(true);
    try {
      const waitlistedItems = draggableItems.filter((item) => item.finalStatus === "waitlisted");
      if (waitlistedItems.length === 0) {
        setPositionValidation({ isValid: true, conflicts: [], gaps: [], suggestions: [] });
        return;
      }

      const proposedPositions = waitlistedItems.map((item) => ({
        itemId: `import-${item.originalIndex}`,
        position: item.waitlistPosition!,
      }));

      const validation = await validateWaitlistPositions(
        currentDateInfo.date,
        stagedPreview.calendarId,
        proposedPositions
      );

      setPositionValidation(validation);
    } catch (error) {
      console.error("Error validating positions:", error);
      setPositionValidation({ isValid: false, conflicts: [], gaps: [], suggestions: [] });
    } finally {
      setIsValidatingPositions(false);
    }
  }, [currentDateInfo, draggableItems, stagedPreview.calendarId]);

  // Validate positions when items change
  React.useEffect(() => {
    validateCurrentPositions();
  }, [validateCurrentPositions]);

  // Reset waitlist positions for current date
  const handleResetPositions = useCallback(async () => {
    if (!currentDateInfo) return;

    Alert.alert(
      "Reset Waitlist Positions",
      "This will reset all waitlist positions for this date to eliminate gaps and ensure proper sequence. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setIsResettingPositions(true);
            try {
              const result = await resetWaitlistPositions(
                currentDateInfo.date,
                stagedPreview.calendarId,
                true // preserve relative order
              );

              if (result.success) {
                Alert.alert("Positions Reset", `Successfully reset ${result.updatedCount} waitlist positions.`, [
                  { text: "OK" },
                ]);
                // Trigger re-validation
                await validateCurrentPositions();
              } else {
                Alert.alert("Reset Failed", result.error || "Failed to reset positions", [{ text: "OK" }]);
              }
            } catch (error) {
              console.error("Error resetting positions:", error);
              Alert.alert("Reset Failed", "An error occurred while resetting positions", [{ text: "OK" }]);
            } finally {
              setIsResettingPositions(false);
            }
          },
        },
      ]
    );
  }, [currentDateInfo, stagedPreview.calendarId, validateCurrentPositions]);

  // Live position preview during drag
  const calculateLivePositionPreview = useCallback(
    (newOrder: DraggableRequestItem[]) => {
      if (!currentDateInfo) return newOrder;

      const effectiveAllotment =
        over_allotment.allotmentAdjustments[currentDateInfo.date] || currentDateInfo.currentAllotment;
      const approvedSlots = effectiveAllotment - currentDateInfo.existingRequests;

      // Filter out skipped items for position calculation, but keep them in the list
      const activeItems = newOrder.filter((item) => !item.isSkipped);
      const skippedItems = newOrder.filter((item) => item.isSkipped);

      // Calculate positions for active items only
      const updatedActiveItems = updateWaitlistPositionsDuringDrag(
        currentDateInfo.date,
        stagedPreview.calendarId,
        activeItems,
        approvedSlots
      );

      // Convert to our DraggableRequestItem type which supports "skipped"
      const convertedActiveItems: DraggableRequestItem[] = updatedActiveItems.map((item) => ({
        ...item,
        isSkipped: false,
        hasStatusChange: false, // Would need to be calculated properly
      }));

      // Recombine active and skipped items, maintaining skipped items' positions
      const recombinedItems: DraggableRequestItem[] = [...convertedActiveItems];
      skippedItems.forEach((skippedItem) => {
        // Insert skipped items back in their original positions if possible
        const insertIndex = newOrder.findIndex((item) => item.originalIndex === skippedItem.originalIndex);
        if (insertIndex !== -1) {
          recombinedItems.splice(insertIndex, 0, {
            ...skippedItem,
            finalStatus: "skipped",
            adminOrder: insertIndex + 1,
          });
        } else {
          recombinedItems.push({
            ...skippedItem,
            finalStatus: "skipped",
            adminOrder: recombinedItems.length + 1,
          });
        }
      });

      return recombinedItems;
    },
    [currentDateInfo, over_allotment, stagedPreview.calendarId]
  );

  // Enhanced drag start with animations
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const draggedItem = draggableItems.find((item) => item.originalIndex.toString() === active.id);
      setActiveItem(draggedItem || null);

      // Animate drag handle scale
      Animated.spring(dragHandleScale, {
        toValue: 1.1,
        useNativeDriver: true,
        tension: 150,
        friction: 8,
      }).start();

      // Show subtle overlay instead of drop zones
      Animated.timing(dropZoneOpacity, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: true,
      }).start();
    },
    [draggableItems, dragHandleScale, dropZoneOpacity]
  );

  // Enhanced drag over with insertion preview
  const handleDragOver = useCallback(
    (event: any) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        setDragOverIndex(null);
        setDragInsertPosition(null);
        return;
      }

      const overIndex = draggableItems.findIndex((item) => item.originalIndex.toString() === over.id);
      const activeIndex = draggableItems.findIndex((item) => item.originalIndex.toString() === active.id);

      if (overIndex === -1 || activeIndex === -1) return;

      setDragOverIndex(overIndex);
      // Determine if we're inserting above or below based on drag direction
      setDragInsertPosition(activeIndex < overIndex ? "below" : "above");
    },
    [draggableItems]
  );

  // Enhanced drag end with animations
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveItem(null);
      setDragOverIndex(null);
      setDragInsertPosition(null);

      // Animate drag handle back to normal
      Animated.spring(dragHandleScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 150,
        friction: 8,
      }).start();

      // Hide overlay
      Animated.timing(dropZoneOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();

      if (!over || !currentDateInfo) return;

      const activeIndex = draggableItems.findIndex((item) => item.originalIndex.toString() === active.id);
      const overIndex = draggableItems.findIndex((item) => item.originalIndex.toString() === over.id);

      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;

      // Reorder the items
      const newOrder = arrayMove(draggableItems, activeIndex, overIndex);

      // Use the enhanced position calculation
      const updatedData = calculateLivePositionPreview(newOrder);

      // Update staged preview - only include non-skipped items in the ordering
      const updatedPreview = { ...stagedPreview };
      const activeItemOrdering = updatedData.filter((item) => !item.isSkipped).map((item) => item.originalIndex);

      updatedPreview.progressState.stageData.over_allotment.requestOrdering[currentDateInfo.date] = activeItemOrdering;
      updatedPreview.lastUpdated = new Date();

      console.log(`[OverAllotment] Updated ordering for ${currentDateInfo.date}: [${activeItemOrdering.join(", ")}]`);

      onDataUpdate(updatedPreview);

      // Trigger position validation after a short delay
      setTimeout(() => {
        validateCurrentPositions();
      }, 100);
    },
    [
      currentDateInfo,
      draggableItems,
      calculateLivePositionPreview,
      stagedPreview,
      onDataUpdate,
      validateCurrentPositions,
      dragHandleScale,
      dropZoneOpacity,
    ]
  );

  // Enhanced stage transition animation
  const animateStageTransition = useCallback(() => {
    Animated.sequence([
      Animated.timing(stageTransitionOpacity, {
        toValue: 0.7,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(stageTransitionOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stageTransitionOpacity]);

  // Trigger stage transition animation when stage completion changes
  React.useEffect(() => {
    if (isStageComplete) {
      animateStageTransition();
    }
  }, [isStageComplete, animateStageTransition]);

  // Handle allotment adjustment
  const handleAllotmentAdjustment = useCallback(
    (dateStr: string, newAllotment: number) => {
      const updatedPreview = { ...stagedPreview };
      updatedPreview.progressState.stageData.over_allotment.allotmentAdjustments[dateStr] = newAllotment;
      updatedPreview.lastUpdated = new Date();

      onDataUpdate(updatedPreview);
    },
    [stagedPreview, onDataUpdate]
  );

  // Handle custom allotment input
  const handleCustomAllotmentChange = useCallback((dateStr: string, value: string) => {
    setCustomAllotments((prev) => ({ ...prev, [dateStr]: value }));
  }, []);

  const handleCustomAllotmentSubmit = useCallback(
    (dateStr: string) => {
      const value = customAllotments[dateStr];
      const numValue = parseInt(value, 10);

      if (!isNaN(numValue) && numValue > 0) {
        handleAllotmentAdjustment(dateStr, numValue);
        setCustomAllotments((prev) => ({ ...prev, [dateStr]: "" }));
      }
    },
    [customAllotments, handleAllotmentAdjustment]
  );

  // Calculate allotment impact
  const calculateAllotmentImpact = useCallback((dateInfo: OverAllotmentDate, newAllotment: number) => {
    const currentAllotment = dateInfo.currentAllotment;
    const difference = newAllotment - currentAllotment;
    const currentApproved = Math.min(dateInfo.importRequests.length, currentAllotment - dateInfo.existingRequests);
    const newApproved = Math.min(dateInfo.importRequests.length, newAllotment - dateInfo.existingRequests);
    const approvedChange = newApproved - currentApproved;

    return {
      allotmentChange: difference,
      approvedChange,
      newApproved,
      newWaitlisted: dateInfo.importRequests.length - newApproved,
    };
  }, []);

  // @dnd-kit Sortable Item Component - WEB ONLY
  function SortableItem({ item, index }: { item: DraggableRequestItem; index: number }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.originalIndex.toString(),
      disabled: item.isSkipped,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    // Create item-specific animation values
    const itemScale = useRef(new Animated.Value(1)).current;
    const itemOpacity = useRef(new Animated.Value(1)).current;
    const statusBadgeScale = useRef(new Animated.Value(1)).current;

    // Check if this item has insertion indicator
    const showInsertionIndicator = dragOverIndex === index && dragInsertPosition && !isDragging;
    const insertionPosition = dragInsertPosition;

    // Animate item when being dragged
    React.useEffect(() => {
      if (isDragging) {
        Animated.parallel([
          Animated.spring(itemScale, {
            toValue: 1.02,
            useNativeDriver: true,
            tension: 150,
            friction: 8,
          }),
          Animated.timing(itemOpacity, {
            toValue: 0.9,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(statusBadgeScale, {
            toValue: 1.05,
            useNativeDriver: true,
            tension: 200,
            friction: 10,
          }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.spring(itemScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 150,
            friction: 8,
          }),
          Animated.timing(itemOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(statusBadgeScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 200,
            friction: 10,
          }),
        ]).start();
      }
    }, [isDragging, itemScale, itemOpacity, statusBadgeScale]);

    // Mobile fallback - return null
    if (Platform.OS !== "web") {
      return null;
    }

    return (
      <View>
        {/* Insertion indicator above */}
        {showInsertionIndicator && insertionPosition === "above" && (
          <View style={styles.insertionIndicator}>
            <View style={styles.insertionLine} />
            <ThemedText style={styles.insertionText}>Drop here to move to position {index + 1}</ThemedText>
          </View>
        )}

        <Animated.View
          // @ts-ignore - We know this is web-only, so the ref will work
          ref={setNodeRef}
          style={[
            styles.draggableItem,
            item.finalStatus === "approved" && styles.approvedItem,
            item.finalStatus === "waitlisted" && styles.waitlistedItem,
            item.finalStatus === "skipped" && styles.skippedItem,
            item.hasStatusChange && styles.statusChangedItem,
            style, // Apply web transforms
            {
              transform: [{ scale: itemScale }],
              opacity: item.isSkipped ? 0.6 : itemOpacity,
            },
          ]}
          {...attributes}
        >
          {/* Enhanced Drag Handle */}
          <Animated.View style={{ transform: [{ scale: isDragging ? dragHandleScale : 1 }] }}>
            <ThemedTouchableOpacity
              style={[
                styles.enhancedDragHandle,
                isDragging && styles.activeDragHandle,
                item.finalStatus === "approved" && styles.approvedDragHandle,
                item.finalStatus === "waitlisted" && styles.waitlistedDragHandle,
                item.finalStatus === "skipped" && styles.skippedDragHandle,
              ]}
              disabled={item.isSkipped}
              {...listeners}
            >
              <View style={styles.dragHandleIconContainer}>
                <View style={styles.dragHandleIcon}>
                  <View style={[styles.dragLine, { backgroundColor: Colors[colorScheme].textDim }]} />
                  <View style={[styles.dragLine, { backgroundColor: Colors[colorScheme].textDim }]} />
                  <View style={[styles.dragLine, { backgroundColor: Colors[colorScheme].textDim }]} />
                </View>
                <ThemedText style={styles.dragHandleText}>{item.isSkipped ? "✕" : "≡"}</ThemedText>
              </View>

              {/* Drag handle glow effect when active */}
              {isDragging && !item.isSkipped && (
                <View
                  style={[
                    styles.dragHandleGlow,
                    {
                      backgroundColor:
                        item.finalStatus === "approved"
                          ? Colors[colorScheme].success + "20"
                          : Colors[colorScheme].warning + "20",
                    },
                  ]}
                />
              )}
            </ThemedTouchableOpacity>
          </Animated.View>

          <View style={styles.itemContent}>
            <View style={styles.itemHeader}>
              <View style={styles.itemTitleContainer}>
                <ThemedText
                  style={[
                    styles.itemTitle,
                    isDragging && styles.activeItemTitle,
                    item.isSkipped && styles.skippedItemTitle,
                  ]}
                >
                  {item?.firstName || ""} {item?.lastName || ""} - {item?.leaveType || ""}
                </ThemedText>
                {item.hasStatusChange && (
                  <Animated.View style={[styles.statusChangeIndicator, { transform: [{ scale: statusBadgeScale }] }]}>
                    <Ionicons name="warning" size={16} color={Colors[colorScheme].warning} />
                    <ThemedText style={styles.statusChangeText}>Status Changed</ThemedText>
                  </Animated.View>
                )}
                {item.isSkipped && (
                  <Animated.View style={[styles.skippedIndicator, { transform: [{ scale: statusBadgeScale }] }]}>
                    <Ionicons name="close-circle" size={16} color={Colors[colorScheme].error} />
                    <ThemedText style={styles.skippedText}>Skipped</ThemedText>
                  </Animated.View>
                )}
              </View>

              {/* Skip/Unskip Controls */}
              <View style={styles.itemControls}>
                <ThemedTouchableOpacity
                  style={[styles.skipButton, item.isSkipped && styles.unskipButton]}
                  onPress={() => handleSkipRequest(item.originalIndex, !item.isSkipped)}
                >
                  <Ionicons
                    name={item.isSkipped ? "checkmark-circle" : "close-circle"}
                    size={16}
                    color={item.isSkipped ? Colors[colorScheme].success : Colors[colorScheme].error}
                  />
                  <ThemedText style={[styles.skipButtonText, item.isSkipped && styles.unskipButtonText]}>
                    {item.isSkipped ? "Include" : "Skip"}
                  </ThemedText>
                </ThemedTouchableOpacity>

                <Animated.View style={[styles.statusBadgeContainer, { transform: [{ scale: statusBadgeScale }] }]}>
                  <View
                    style={[
                      styles.enhancedStatusBadge,
                      item.finalStatus === "approved" && styles.approvedBadge,
                      item.finalStatus === "waitlisted" && styles.waitlistedBadge,
                      item.finalStatus === "skipped" && styles.skippedBadge,
                      isDragging && styles.activeStatusBadge,
                    ]}
                  >
                    <Ionicons
                      name={
                        item.finalStatus === "approved"
                          ? "checkmark-circle"
                          : item.finalStatus === "waitlisted"
                          ? "time"
                          : "close-circle"
                      }
                      size={12}
                      color={
                        item.finalStatus === "approved"
                          ? Colors[colorScheme].success
                          : item.finalStatus === "waitlisted"
                          ? Colors[colorScheme].warning
                          : Colors[colorScheme].error
                      }
                    />
                    <ThemedText
                      style={[
                        styles.statusText,
                        item.finalStatus === "approved" && styles.approvedText,
                        item.finalStatus === "waitlisted" && styles.waitlistedText,
                        item.finalStatus === "skipped" && styles.skippedText,
                      ]}
                    >
                      {item.finalStatus === "approved"
                        ? "Approved"
                        : item.finalStatus === "waitlisted"
                        ? `Waitlist #${item.waitlistPosition || 0}`
                        : "Skipped"}
                    </ThemedText>
                  </View>
                </Animated.View>
              </View>
            </View>

            <View style={styles.itemDetails}>
              <View style={styles.positionInfo}>
                <ThemedText
                  style={[
                    styles.orderText,
                    isDragging && styles.activeOrderText,
                    item.isSkipped && styles.skippedOrderText,
                  ]}
                >
                  Position: {item?.adminOrder || 0}
                </ThemedText>
                <ThemedText style={styles.originalStatusText}>
                  Original: {item?.status === "waitlisted" ? "Waitlisted" : "Approved"}
                </ThemedText>
              </View>

              {item.hasStatusChange && !item.isSkipped && (
                <View style={styles.statusChangeWarning}>
                  <ThemedText style={styles.statusChangeWarningText}>
                    {item?.status === "approved" && item?.finalStatus === "waitlisted"
                      ? "Originally approved → Now waitlisted"
                      : "Originally waitlisted → Now approved"}
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Enhanced Request Origin Indicator */}
            <View
              style={[
                styles.requestOrigin,
                isDragging && styles.activeRequestOrigin,
                item.isSkipped && styles.skippedRequestOrigin,
              ]}
            >
              <Ionicons name="calendar-outline" size={12} color={Colors[colorScheme].textDim} />
              <ThemedText style={styles.requestOriginText}>
                From iCal: {item?.requestDate ? format(item.requestDate, "MMM d") : "Unknown"}
              </ThemedText>
              {isDragging && !item.isSkipped && (
                <View style={styles.dragIndicator}>
                  <Ionicons name="move" size={12} color={Colors[colorScheme].tint} />
                  <ThemedText style={styles.dragIndicatorText}>Dragging</ThemedText>
                </View>
              )}
              {item.isPotentialDuplicate && (
                <View style={styles.duplicateIndicator}>
                  <Ionicons name="copy" size={12} color={Colors[colorScheme].warning} />
                  <ThemedText style={styles.duplicateText}>Potential Duplicate</ThemedText>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Insertion indicator below */}
        {showInsertionIndicator && insertionPosition === "below" && (
          <View style={styles.insertionIndicator}>
            <View style={styles.insertionLine} />
            <ThemedText style={styles.insertionText}>Drop here to move to position {index + 2}</ThemedText>
          </View>
        )}
      </View>
    );
  }

  // Render allotment controls
  const renderAllotmentControls = (dateInfo: OverAllotmentDate) => {
    const currentAdjustment = over_allotment.allotmentAdjustments[dateInfo.date];
    const effectiveAllotment = currentAdjustment || dateInfo.currentAllotment;
    const customValue = customAllotments[dateInfo.date] || "";

    // Pre-calculate text values to avoid IIFEs in JSX
    const summaryText = `Current: ${effectiveAllotment || 0} | Existing: ${dateInfo.existingRequests || 0} | Import: ${
      dateInfo.importRequests?.length || 0
    } | Total: ${dateInfo.totalRequests || 0}`;

    let adjustmentText = "";
    if (currentAdjustment !== undefined) {
      const changePrefix = currentAdjustment > (dateInfo.currentAllotment || 0) ? "+" : "";
      const changeAmount = currentAdjustment - (dateInfo.currentAllotment || 0);
      adjustmentText = `Adjusted from ${dateInfo.currentAllotment || 0} to ${
        effectiveAllotment || 0
      } (${changePrefix}${changeAmount})`;
    }

    let customImpactText = "";
    if (customValue && !isNaN(parseInt(customValue, 10))) {
      const impact = calculateAllotmentImpact(dateInfo, parseInt(customValue, 10));
      const changePrefix = (impact?.allotmentChange || 0) > 0 ? "+" : "";
      customImpactText = `Impact: ${changePrefix}${impact?.allotmentChange || 0} allotment, ${
        impact?.newApproved || 0
      } approved, ${impact?.newWaitlisted || 0} waitlisted`;
    }

    return (
      <View style={styles.allotmentControls}>
        <ThemedText style={styles.controlsTitle}>Allotment Options</ThemedText>

        <View style={styles.allotmentOption}>
          <ThemedTouchableOpacity
            style={[styles.optionButton, currentAdjustment === undefined && styles.selectedOption]}
            onPress={() => {
              const updatedPreview = { ...stagedPreview };
              delete updatedPreview.progressState.stageData.over_allotment.allotmentAdjustments[dateInfo.date];
              updatedPreview.lastUpdated = new Date();
              onDataUpdate(updatedPreview);
            }}
          >
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionText}>
                Keep current allotment ({dateInfo?.currentAllotment || 0})
              </ThemedText>
              {currentAdjustment === undefined && (
                <View style={styles.impactIndicator}>
                  <ThemedText style={styles.impactText}>
                    {dateInfo?.overAllotmentCount || 0} requests will be waitlisted
                  </ThemedText>
                </View>
              )}
            </View>
          </ThemedTouchableOpacity>
        </View>

        <View style={styles.allotmentOption}>
          <ThemedTouchableOpacity
            style={[styles.optionButton, currentAdjustment === dateInfo.suggestedAllotment && styles.selectedOption]}
            onPress={() => handleAllotmentAdjustment(dateInfo.date, dateInfo.suggestedAllotment)}
          >
            <View style={styles.optionContent}>
              <ThemedText style={styles.optionText}>
                Increase to fit all ({dateInfo?.suggestedAllotment || 0})
              </ThemedText>
              <View style={styles.impactIndicator}>
                <ThemedText style={styles.impactText}>
                  +{(dateInfo?.suggestedAllotment || 0) - (dateInfo?.currentAllotment || 0)} allotment, all requests
                  approved
                </ThemedText>
              </View>
            </View>
          </ThemedTouchableOpacity>
        </View>

        <View style={styles.allotmentOption}>
          <View style={styles.customAllotmentContainer}>
            <TextInput
              style={styles.customAllotmentInput}
              value={customValue}
              onChangeText={(text) => handleCustomAllotmentChange(dateInfo.date, text)}
              placeholder="Custom allotment"
              placeholderTextColor={Colors[colorScheme].textDim}
              keyboardType="numeric"
            />
            <Button
              onPress={() => handleCustomAllotmentSubmit(dateInfo.date)}
              disabled={!customValue || isNaN(parseInt(customValue, 10))}
              variant="secondary"
              style={styles.customAllotmentButton}
            >
              Set
            </Button>
          </View>
          {customValue && !isNaN(parseInt(customValue, 10)) && customImpactText && (
            <View style={styles.customImpactPreview}>
              <ThemedText style={styles.impactText}>{customImpactText}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.allotmentSummary}>
          <ThemedText style={styles.summaryText}>{summaryText}</ThemedText>
          {currentAdjustment !== undefined && adjustmentText && (
            <ThemedText style={[styles.summaryText, styles.adjustmentText]}>{adjustmentText}</ThemedText>
          )}
        </View>
      </View>
    );
  };

  // Render date selector
  const renderDateSelector = () => {
    if (over_allotment.overAllottedDates.length <= 1) return null;

    return (
      <View style={styles.dateSelector}>
        <ThemedText style={styles.dateSelectorTitle}>Over-Allotted Dates</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={true}>
          {over_allotment.overAllottedDates.map((dateInfo, index) => (
            <ThemedTouchableOpacity
              key={dateInfo.date}
              style={[styles.dateTab, selectedDateIndex === index && styles.selectedDateTab]}
              onPress={() => setSelectedDateIndex(index)}
            >
              <ThemedText style={[styles.dateTabText, selectedDateIndex === index && styles.selectedDateTabText]}>
                {format(parseLocalDate(dateInfo.date), "MMM d")}
              </ThemedText>
              <ThemedText style={styles.dateTabCount}>+{dateInfo?.overAllotmentCount || 0}</ThemedText>
            </ThemedTouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Render summary
  const renderSummary = () => {
    if (over_allotment.overAllottedDates.length === 0) {
      return (
        <ThemedView style={styles.summaryContainer}>
          <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].success} />
          <ThemedText style={styles.summaryText}>
            No over-allotment issues found. All import requests can be accommodated within existing allotments.
          </ThemedText>
        </ThemedView>
      );
    }

    // Count explicit admin actions (not defaults)
    const datesWithExplicitActions = over_allotment.overAllottedDates.filter((dateInfo) => {
      const hasExplicitOrdering = over_allotment.requestOrdering[dateInfo.date];
      const hasExplicitAllotmentDecision = over_allotment.allotmentAdjustments[dateInfo.date] !== undefined;
      return hasExplicitOrdering || hasExplicitAllotmentDecision;
    });

    const totalDates = over_allotment.overAllottedDates.length;
    const actionCount = datesWithExplicitActions.length;
    const defaultCount = totalDates - actionCount;

    return (
      <ThemedView style={styles.summaryContainer}>
        <Ionicons name="checkmark-circle" size={24} color={Colors[colorScheme].success} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <ThemedText style={styles.summaryText}>
            ✅ Ready to proceed!
            {actionCount > 0 && ` ${actionCount} date${actionCount > 1 ? "s" : ""} customized,`}
            {defaultCount > 0 && ` ${defaultCount} date${defaultCount > 1 ? "s" : ""} using defaults`}
          </ThemedText>
          {defaultCount > 0 && (
            <ThemedText
              style={[styles.summaryText, { fontSize: 12, color: Colors[colorScheme].textDim, marginTop: 4 }]}
            >
              Default behavior: Keep current allotments, waitlist excess requests in request order
            </ThemedText>
          )}
        </View>
      </ThemedView>
    );
  };

  // Render position validation status
  const renderPositionValidation = () => {
    if (!currentDateInfo || !positionValidation) return null;

    const waitlistedCount = draggableItems.filter((item) => item.finalStatus === "waitlisted").length;
    if (waitlistedCount === 0) return null;

    return (
      <ThemedView style={styles.validationContainer}>
        <View style={styles.validationHeader}>
          <View style={styles.validationStatus}>
            {isValidatingPositions ? (
              <Ionicons name="sync" size={16} color={Colors[colorScheme].textDim} />
            ) : (
              <Ionicons
                name={positionValidation.isValid ? "checkmark-circle" : "warning"}
                size={16}
                color={positionValidation.isValid ? Colors[colorScheme].success : Colors[colorScheme].warning}
              />
            )}
            <ThemedText style={styles.validationText}>
              {isValidatingPositions
                ? "Validating positions..."
                : positionValidation.isValid
                ? "Waitlist positions valid"
                : "Position conflicts detected"}
            </ThemedText>
          </View>

          <ThemedTouchableOpacity
            onPress={handleResetPositions}
            disabled={isResettingPositions}
            style={styles.resetButton}
          >
            {isResettingPositions ? (
              <Ionicons name="sync" size={16} color={Colors[colorScheme].textDim} />
            ) : (
              <Ionicons name="refresh" size={16} color={Colors[colorScheme].tint} />
            )}
            <ThemedText style={styles.resetButtonText}>
              {isResettingPositions ? "Resetting..." : "Reset Positions"}
            </ThemedText>
          </ThemedTouchableOpacity>
        </View>

        {/* Show validation details */}
        {!positionValidation.isValid && (
          <View style={styles.validationDetails}>
            {positionValidation.conflicts.length > 0 && (
              <View style={styles.validationIssue}>
                <Ionicons name="warning" size={14} color={Colors[colorScheme].error} />
                <ThemedText style={styles.validationIssueText}>
                  {`${positionValidation?.conflicts?.length || 0} position conflicts found`}
                </ThemedText>
              </View>
            )}
            {positionValidation.gaps.length > 0 && (
              <View style={styles.validationIssue}>
                <Ionicons name="information-circle" size={14} color={Colors[colorScheme].warning} />
                <ThemedText style={styles.validationIssueText}>
                  {`${positionValidation?.gaps?.length || 0} gaps in position sequence`}
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Live position preview */}
        <View style={styles.positionPreview}>
          <ThemedText style={styles.positionPreviewTitle}>Current Waitlist Positions:</ThemedText>
          <View style={styles.positionList}>
            {draggableItems
              .filter((item) => item.finalStatus === "waitlisted")
              .map((item, index) => (
                <View key={item.originalIndex} style={styles.positionItem}>
                  <ThemedText style={styles.positionNumber}>#{item?.waitlistPosition || 0}</ThemedText>
                  <ThemedText style={styles.positionName}>
                    {item?.firstName || ""} {item?.lastName || ""}
                  </ThemedText>
                  {item.hasStatusChange && <Ionicons name="warning" size={12} color={Colors[colorScheme].warning} />}
                </View>
              ))}
          </View>
        </View>
      </ThemedView>
    );
  };

  // Render existing requests display section
  const renderExistingRequests = () => {
    if (!currentDateInfo) return null;

    const currentExistingRequests = existingRequests[currentDateInfo.date] || [];

    return (
      <View style={styles.existingRequestsSection}>
        {/* Toggle that's always visible */}
        <View style={styles.existingRequestsToggle}>
          <ThemedTouchableOpacity
            style={styles.toggleExistingButton}
            onPress={() => setShowExistingRequests(!showExistingRequests)}
          >
            <Ionicons name={showExistingRequests ? "eye-off" : "eye"} size={16} color={Colors[colorScheme].textDim} />
            <ThemedText style={styles.toggleExistingText}>
              {showExistingRequests ? "Hide Existing" : "Show Existing"}
              {currentExistingRequests.length > 0 && ` (${currentExistingRequests.length})`}
            </ThemedText>
          </ThemedTouchableOpacity>
        </View>

        {/* Existing requests content - only show if toggled on AND there are requests */}
        {showExistingRequests && currentExistingRequests.length > 0 && (
          <>
            <View style={styles.existingRequestsHeader}>
              <Ionicons name="server-outline" size={20} color={Colors[colorScheme].tint} />
              <ThemedText style={styles.existingRequestsTitle}>
                Existing Requests ({currentExistingRequests.length})
              </ThemedText>
              <ThemedText style={styles.existingRequestsSubtitle}>
                Already in database for {format(parseLocalDate(currentDateInfo.date), "MMM d")}
              </ThemedText>
            </View>

            <View style={styles.existingRequestsList}>
              {currentExistingRequests.map((req, index) => (
                <View
                  key={req.id}
                  style={[
                    styles.existingRequestItem,
                    req.status === "approved" && styles.existingApprovedItem,
                    req.status === "waitlisted" && styles.existingWaitlistedItem,
                  ]}
                >
                  <View style={styles.existingRequestContent}>
                    <View style={styles.existingRequestHeader}>
                      <ThemedText style={styles.existingRequestName}>
                        {req.first_name} {req.last_name} - {req.leave_type}
                      </ThemedText>
                      <View
                        style={[
                          styles.existingStatusBadge,
                          req.status === "approved" && styles.existingApprovedBadge,
                          req.status === "waitlisted" && styles.existingWaitlistedBadge,
                        ]}
                      >
                        <Ionicons
                          name={req.status === "approved" ? "checkmark-circle" : "time"}
                          size={12}
                          color={req.status === "approved" ? Colors[colorScheme].success : Colors[colorScheme].warning}
                        />
                        <ThemedText
                          style={[
                            styles.existingStatusText,
                            req.status === "approved" && styles.existingApprovedText,
                            req.status === "waitlisted" && styles.existingWaitlistedText,
                          ]}
                        >
                          {req.status === "approved" ? "Approved" : `Waitlist #${req.waitlist_position || "?"}`}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.existingRequestDetails}>
                      <ThemedText style={styles.existingRequestDate}>
                        Requested: {format(new Date(req.requested_at), "MMM d, h:mm a")}
                      </ThemedText>
                      <View style={styles.existingRequestOrigin}>
                        <Ionicons name="server" size={12} color={Colors[colorScheme].textDim} />
                        <ThemedText style={styles.existingRequestOriginText}>In Database</ThemedText>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Loading state */}
        {showExistingRequests && isLoadingExistingRequests && (
          <View style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>Loading existing requests...</ThemedText>
          </View>
        )}

        {/* No existing requests message */}
        {showExistingRequests && !isLoadingExistingRequests && currentExistingRequests.length === 0 && (
          <View style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>No existing requests found for this date</ThemedText>
          </View>
        )}
      </View>
    );
  };

  if (over_allotment.overAllottedDates.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <Ionicons name="checkmark-circle" size={48} color={Colors[colorScheme].success} />
        <ThemedText style={styles.emptyTitle}>No Over-Allotments</ThemedText>
        <ThemedText style={styles.emptyDescription}>
          All import requests fit within existing calendar allotments. Ready to proceed to the next stage.
        </ThemedText>
      </ThemedView>
    );
  }

  if (!currentDateInfo) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>No date information available</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {renderSummary()}
      {renderPositionValidation()}
      {renderDateSelector()}

      <View style={styles.dateHeader}>
        <ThemedText style={styles.dateTitle}>
          {format(parseLocalDate(currentDateInfo.date), "EEEE, MMMM d, yyyy")}
        </ThemedText>
        <ThemedText style={styles.dateSubtitle}>
          {`${currentDateInfo?.overAllotmentCount || 0} requests over allotment`}
        </ThemedText>

        {/* Admin Instructions Banner */}
        <View style={styles.instructionsBanner}>
          <Ionicons name="information-circle" size={20} color={Colors[colorScheme].tint} />
          <View style={styles.instructionsContent}>
            <ThemedText style={styles.instructionsTitle}>What to Review:</ThemedText>
            <ThemedText style={styles.instructionsText}>
              • **No action required** - you can proceed with defaults to waitlist excess requests
            </ThemedText>
            <ThemedText style={styles.instructionsText}>
              • **Optional:** Drag to reorder request priority (top = higher priority)
            </ThemedText>
            <ThemedText style={styles.instructionsText}>
              • **Optional:** Skip duplicate or unnecessary requests using "Skip" button
            </ThemedText>
            <ThemedText style={styles.instructionsText}>
              • **Optional:** Adjust calendar allotment if needed to accommodate more requests
            </ThemedText>
            <ThemedText style={styles.instructionsText}>
              • Review all {(currentDateInfo?.importRequests?.length || 0) + (currentDateInfo?.existingRequests || 0)}{" "}
              total requests for this date
            </ThemedText>
          </View>
        </View>
      </View>

      {renderAllotmentControls(currentDateInfo)}

      <View style={styles.dragSection}>
        <View style={styles.dragHeader}>
          <ThemedText style={styles.dragTitle}>Request Priority Order</ThemedText>
          <ThemedText style={styles.dragSubtitle}>
            Drag items to reorder by priority. Higher positions = approved first, lower positions = waitlisted.
          </ThemedText>
          <View style={styles.priorityExplanation}>
            <View style={styles.priorityItem}>
              <View style={[styles.priorityDot, { backgroundColor: Colors[colorScheme].success }]} />
              <ThemedText style={styles.priorityText}>Positions 1-{availableSlots}: Approved</ThemedText>
            </View>
            <View style={styles.priorityItem}>
              <View style={[styles.priorityDot, { backgroundColor: Colors[colorScheme].warning }]} />
              <ThemedText style={styles.priorityText}>Position {availableSlots + 1}+: Waitlisted</ThemedText>
            </View>
          </View>
        </View>

        {/* Platform indicator for debugging */}
        <ThemedText style={[styles.debugInfo]}>
          Platform: {Platform.OS} | Drag method:{" "}
          {Platform.OS === "web" ? "HTML5 Drag & Drop" : "React Native Draggable FlatList"}
        </ThemedText>

        {/* Subtle background overlay during drag */}
        {isDragging && <Animated.View style={[styles.dragOverlay, { opacity: dropZoneOpacity }]} />}

        {/* Section Status Summary */}
        <View style={styles.statusSummary}>
          <View style={styles.summaryItem}>
            <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
            <ThemedText style={styles.summaryItemText}>
              {draggableItems.filter((item) => item.finalStatus === "approved").length} Approved
            </ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="time" size={16} color={Colors[colorScheme].warning} />
            <ThemedText style={styles.summaryItemText}>
              {draggableItems.filter((item) => item.finalStatus === "waitlisted").length} Waitlisted
            </ThemedText>
          </View>
          <View style={styles.summaryItem}>
            <Ionicons name="close-circle" size={16} color={Colors[colorScheme].error} />
            <ThemedText style={styles.summaryItemText}>{skippedRequests.size} Skipped</ThemedText>
          </View>
        </View>

        {/* Toggle to show/hide skipped items */}
        <View style={styles.toggleContainer}>
          <ThemedTouchableOpacity
            style={[styles.toggleButton, showAllRequests && styles.activeToggleButton]}
            onPress={() => setShowAllRequests(!showAllRequests)}
          >
            <Ionicons
              name={showAllRequests ? "eye" : "eye-off"}
              size={16}
              color={showAllRequests ? Colors[colorScheme].tint : Colors[colorScheme].textDim}
            />
            <ThemedText style={[styles.toggleButtonText, showAllRequests && styles.activeToggleButtonText]}>
              {showAllRequests ? "Hide Skipped Items" : "Show All Items"}
            </ThemedText>
          </ThemedTouchableOpacity>

          <ThemedText style={styles.toggleHelpText}>
            {showAllRequests
              ? `Showing all ${draggableItems.length} requests including skipped items`
              : `Showing ${draggableItems.filter((item) => !item.isSkipped).length} active requests (${
                  skippedRequests.size
                } hidden)`}
          </ThemedText>
        </View>

        {/* @dnd-kit drag and drop implementation - WEB ONLY */}
        {Platform.OS === "web" ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draggableItems.map((item) => item.originalIndex.toString())}
              strategy={verticalListSortingStrategy}
            >
              <ScrollView style={styles.draggableList} contentContainerStyle={styles.draggableListContent}>
                {draggableItems.map((item, index) => (
                  <SortableItem key={item.originalIndex} item={item} index={index} />
                ))}
              </ScrollView>
            </SortableContext>

            <DragOverlay>
              {activeItem ? (
                <View
                  style={[
                    styles.draggableItem,
                    activeItem.finalStatus === "approved" && styles.approvedItem,
                    activeItem.finalStatus === "waitlisted" && styles.waitlistedItem,
                    activeItem.finalStatus === "skipped" && styles.skippedItem,
                    styles.dragOverlayItem,
                  ]}
                >
                  <View style={styles.dragHandleIconContainer}>
                    <ThemedText style={styles.dragHandleText}>≡</ThemedText>
                  </View>
                  <View style={styles.itemContent}>
                    <ThemedText style={styles.itemTitle}>
                      {activeItem.firstName} {activeItem.lastName} - {activeItem.leaveType}
                    </ThemedText>
                    <ThemedText style={styles.dragOverlayHint}>
                      Position {activeItem.adminOrder} → Moving to new priority position
                    </ThemedText>
                  </View>
                </View>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          // Mobile fallback message
          <ThemedView style={styles.mobileNotSupportedContainer}>
            <Ionicons name="laptop-outline" size={48} color={Colors[colorScheme].textDim} />
            <ThemedText style={styles.mobileNotSupportedTitle}>Drag & Drop Not Available on Mobile</ThemedText>
            <ThemedText style={styles.mobileNotSupportedText}>
              Request reordering and over-allotment management requires a desktop browser. Please use a computer to
              access this admin feature.
            </ThemedText>
            <ThemedText style={styles.mobileNotSupportedSubtext}>
              {draggableItems.length} requests need admin review for{" "}
              {format(parseLocalDate(currentDateInfo.date), "MMM d")}
            </ThemedText>
          </ThemedView>
        )}
      </View>

      {renderExistingRequests()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  completionBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.dark.success + "20",
    borderRadius: 8,
  },
  completionText: {
    marginLeft: 8,
    color: Colors.dark.success,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 16,
  },
  dateSelector: {
    marginBottom: 16,
  },
  dateSelectorTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  dateTab: {
    padding: 12,
    marginRight: 8,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
  },
  selectedDateTab: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  dateTabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedDateTabText: {
    color: Colors.dark.background,
  },
  dateTabCount: {
    fontSize: 12,
    color: Colors.dark.warning,
    marginTop: 2,
  },
  dateHeader: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  dateTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  dateSubtitle: {
    fontSize: 14,
    color: Colors.dark.warning,
  },
  allotmentControls: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  controlsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  allotmentOption: {
    marginBottom: 8,
  },
  optionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  selectedOption: {
    borderColor: Colors.dark.tint,
    backgroundColor: Colors.dark.tint + "20",
  },
  optionContent: {
    flex: 1,
  },
  optionText: {
    fontSize: 14,
  },
  customAllotmentContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  customAllotmentInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    paddingHorizontal: 12,
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
    marginRight: 8,
  },
  customAllotmentButton: {
    minWidth: 60,
  },
  allotmentSummary: {
    marginTop: 8,
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 4,
  },
  summaryText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: Colors.dark.text,
  },
  dragSection: {
    flex: 1,
  },
  dragHeader: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  dragTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  dragSubtitle: {
    fontSize: 14,
    color: Colors.dark.textDim,
    marginBottom: 16,
  },
  draggableList: {
    flex: 1,
  },
  draggableListContent: {
    padding: 16,
  },
  draggableItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.border,
  },
  approvedItem: {
    borderLeftColor: Colors.dark.success,
  },
  waitlistedItem: {
    borderLeftColor: Colors.dark.warning,
  },
  skippedItem: {
    borderLeftColor: Colors.dark.error,
  },
  draggingItem: {
    opacity: 0.8,
    transform: [{ scale: 1.02 }],
  },
  dropTargetItem: {
    backgroundColor: Colors.dark.tint + "10",
    borderWidth: 2,
    borderColor: Colors.dark.tint,
    borderStyle: "dashed",
  },
  statusChangedItem: {
    borderWidth: 2,
    borderColor: Colors.dark.warning + "40",
  },
  dragHandle: {
    marginRight: 12,
    padding: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  itemContent: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  skippedItemTitle: {
    color: Colors.dark.error,
  },
  statusBadgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
  },
  approvedBadge: {
    backgroundColor: Colors.dark.success + "20",
  },
  waitlistedBadge: {
    backgroundColor: Colors.dark.warning + "20",
  },
  skippedBadge: {
    backgroundColor: Colors.dark.error + "20",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  approvedText: {
    color: Colors.dark.success,
  },
  waitlistedText: {
    color: Colors.dark.warning,
  },
  skippedText: {
    color: Colors.dark.error,
  },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  positionInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderText: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
  activeOrderText: {
    fontSize: 14,
    color: Colors.dark.tint,
    fontWeight: "600",
  },
  skippedOrderText: {
    color: Colors.dark.error,
  },
  originalStatusText: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
  statusChangeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  statusChangeText: {
    fontSize: 12,
    color: Colors.dark.warning,
    marginLeft: 4,
  },
  statusChangeWarning: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusChangeWarningText: {
    fontSize: 12,
    color: Colors.dark.warning,
  },
  requestOrigin: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  requestOriginText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginLeft: 4,
  },
  successText: {
    color: Colors.dark.success,
  },
  warningText: {
    color: Colors.dark.warning,
  },
  dragHandleIconContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandleIcon: {
    width: 20,
    height: 12,
    justifyContent: "space-between",
    marginBottom: 4,
  },
  dragLine: {
    height: 2,
    borderRadius: 1,
    marginVertical: 1,
  },
  dragHandleText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.textDim,
  },
  dragHandleGlow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: "absolute",
    top: -4,
    left: -4,
  },
  activeItemTitle: {
    color: Colors.dark.tint,
  },
  skippedIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  itemControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.error,
    backgroundColor: Colors.dark.background,
  },
  unskipButton: {
    borderColor: Colors.dark.success,
    backgroundColor: Colors.dark.success + "20",
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.error,
    marginLeft: 4,
  },
  unskipButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.success,
    marginLeft: 4,
  },
  duplicateIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.dark.warning + "20",
    borderRadius: 4,
  },
  duplicateText: {
    fontSize: 10,
    color: Colors.dark.warning,
    marginLeft: 4,
  },
  dropZoneContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  dropZone: {
    flex: 1,
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  approvedDropZone: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.success,
  },
  waitlistedDropZone: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.warning,
  },
  activeDropZone: {
    backgroundColor: Colors.dark.tint + "20",
    borderColor: Colors.dark.tint,
  },
  dropZoneText: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 4,
  },
  dropZoneSubtext: {
    fontSize: 12,
    color: Colors.dark.textDim,
    textAlign: "center",
  },
  sectionHeaders: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  sectionHeader: {
    flex: 1,
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
  },
  sectionHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  sectionHeaderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
    minWidth: 24,
    alignItems: "center",
  },
  sectionHeaderBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  impactIndicator: {
    padding: 4,
    backgroundColor: Colors.dark.background,
    borderRadius: 4,
    marginLeft: 8,
  },
  impactText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  customImpactPreview: {
    padding: 8,
    backgroundColor: Colors.dark.background,
    borderRadius: 4,
    marginTop: 8,
  },
  adjustmentText: {
    color: Colors.dark.warning,
  },
  validationContainer: {
    padding: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 16,
  },
  validationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  validationStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  validationText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  resetButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  validationDetails: {
    marginTop: 8,
  },
  validationIssue: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  validationIssueText: {
    marginLeft: 8,
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  positionPreview: {
    marginTop: 16,
  },
  positionPreviewTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  positionList: {
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  positionItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  positionNumber: {
    fontSize: 14,
    fontWeight: "600",
    marginRight: 8,
    color: Colors.dark.tint,
  },
  positionName: {
    fontSize: 14,
    color: Colors.dark.textDim,
    flex: 1,
  },
  enhancedDragHandle: {
    marginRight: 12,
    padding: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  approvedDragHandle: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.success,
  },
  waitlistedDragHandle: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.warning,
  },
  skippedDragHandle: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.error,
  },
  activeDragHandle: {
    backgroundColor: Colors.dark.tint + "20",
    borderColor: Colors.dark.tint,
  },
  dragIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  dragIndicatorText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginLeft: 4,
  },
  activeRequestOrigin: {
    backgroundColor: Colors.dark.tint + "20",
  },
  skippedRequestOrigin: {
    backgroundColor: Colors.dark.error + "20",
  },
  approvedDropZoneText: {
    color: Colors.dark.success,
  },
  waitlistedDropZoneText: {
    color: Colors.dark.warning,
  },
  dropZoneHighlight: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  dropZoneHighlightText: {
    fontSize: 12,
    color: Colors.dark.success,
    marginLeft: 4,
  },
  enhancedStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
  },
  activeStatusBadge: {
    backgroundColor: Colors.dark.tint + "20",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  toggleButton: {
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  activeToggleButton: {
    borderColor: Colors.dark.tint,
    backgroundColor: Colors.dark.tint + "20",
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.textDim,
    marginLeft: 4,
  },
  activeToggleButtonText: {
    color: Colors.dark.background,
  },
  toggleHelpText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginLeft: 8,
  },
  instructionsBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    marginBottom: 16,
  },
  instructionsContent: {
    flex: 1,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
  // Existing requests section styles
  existingRequestsSection: {
    marginBottom: 16,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 16,
  },
  existingRequestsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  existingRequestsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  existingRequestsSubtitle: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  loadingContainer: {
    padding: 16,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: Colors.dark.textDim,
  },
  existingRequestsList: {
    gap: 8,
  },
  existingRequestItem: {
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.dark.border,
  },
  existingApprovedItem: {
    borderLeftColor: Colors.dark.success,
  },
  existingWaitlistedItem: {
    borderLeftColor: Colors.dark.warning,
  },
  existingRequestContent: {
    flex: 1,
  },
  existingRequestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  existingRequestName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  existingStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: Colors.dark.card,
  },
  existingApprovedBadge: {
    backgroundColor: Colors.dark.success + "20",
  },
  existingWaitlistedBadge: {
    backgroundColor: Colors.dark.warning + "20",
  },
  existingStatusText: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  existingApprovedText: {
    color: Colors.dark.success,
  },
  existingWaitlistedText: {
    color: Colors.dark.warning,
  },
  existingRequestDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  existingRequestDate: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  existingRequestOrigin: {
    flexDirection: "row",
    alignItems: "center",
  },
  existingRequestOriginText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginLeft: 4,
  },
  existingRequestsToggle: {
    marginTop: 12,
    alignItems: "center",
  },
  toggleExistingButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.background,
  },
  toggleExistingText: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginLeft: 4,
  },
  mobileNotSupportedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    margin: 16,
  },
  mobileNotSupportedTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  mobileNotSupportedText: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  mobileNotSupportedSubtext: {
    fontSize: 14,
    color: Colors.dark.textDim,
    marginTop: 12,
    textAlign: "center",
  },
  insertionIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  insertionLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.dark.border,
    marginRight: 4,
  },
  insertionText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
  dragOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  dragOverlayItem: {
    opacity: 0.9,
  },
  dragOverlayHint: {
    fontSize: 12,
    color: Colors.dark.background,
    marginTop: 4,
  },
  statusSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItemText: {
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },
  debugInfo: {
    fontSize: 12,
    color: Colors.dark.textDim,
    marginBottom: 8,
  },
  priorityExplanation: {
    marginTop: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  priorityItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  priorityText: {
    fontSize: 12,
    color: Colors.dark.textDim,
  },
});
