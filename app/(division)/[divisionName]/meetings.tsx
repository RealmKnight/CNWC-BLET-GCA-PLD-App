import { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, Platform, useWindowDimensions, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  format,
  parseISO,
  addDays,
  isAfter,
  differenceInHours,
  differenceInMinutes,
  differenceInDays,
  addHours,
} from "date-fns";
import { DateData } from "react-native-calendars";

// Components
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { Colors } from "@/constants/Colors";
import { DivisionLoadingIndicator } from "@/components/ui/DivisionLoadingIndicator";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useDivisionMeetingStore } from "@/store/divisionMeetingStore";
import { useAuth } from "@/hooks/useAuth";
import { Calendar } from "react-native-calendars";
import { MeetingOccurrence, MeetingMinute } from "@/store/divisionMeetingStore";
import { MinutesBrowser } from "@/components/MinutesBrowser";
import { MinutesReader } from "@/components/MinutesReader";
import { handleCalendarExport } from "@/utils/calendarExport";

type ColorSchemeName = keyof typeof Colors;

export default function MeetingsPage() {
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;
  const router = useRouter();
  const { session, member } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  // State
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [markedDates, setMarkedDates] = useState<any>({});
  const [minutesSearchTerm, setMinutesSearchTerm] = useState("");
  const [minutesFilters, setMinutesFilters] = useState({ approved: false, archived: false });
  const [minutesPage, setMinutesPage] = useState(1);
  const [selectedMinutes, setSelectedMinutes] = useState<MeetingMinute | null>(null);
  const [minutesModalVisible, setMinutesModalVisible] = useState(false);

  // Use the division meetings store
  const {
    meetings,
    occurrences,
    meetingMinutes,
    filteredMinutes,
    searchMeetingMinutes,
    fetchDivisionMeetings,
    fetchMeetingOccurrences,
    fetchMeetingMinutes,
    exportCalendar,
    exportMinutesPdf,
    subscribeToRealtime,
    unsubscribeFromRealtime,
    setPage,
    setDivisionContext,
    isLoading,
    error,
    loadingOperation,
    totalItems,
    itemsPerPage,
  } = useDivisionMeetingStore();

  // Calculate total pages for minutes pagination
  const totalMinutesPages = Math.ceil(totalItems / itemsPerPage) || 1;

  // Fetch division meetings on component mount
  useEffect(() => {
    const loadData = async () => {
      if (divisionName) {
        await fetchDivisionMeetings(divisionName);
      }

      // Subscribe to realtime updates
      await subscribeToRealtime(divisionName);
    };

    loadData();

    // Clean up on unmount
    return () => {
      unsubscribeFromRealtime();
    };
  }, [divisionName, fetchDivisionMeetings, subscribeToRealtime, unsubscribeFromRealtime]);

  // Fetch occurrences when meeting patterns are available
  useEffect(() => {
    const divisionMeetings = meetings[divisionName] || [];

    // Fetch occurrences for all meeting patterns
    divisionMeetings.forEach((meeting) => {
      if (meeting.id) {
        fetchMeetingOccurrences(meeting.id, {
          start: new Date(),
          end: addDays(new Date(), 365), // Get occurrences for the next year
        });
      }
    });
  }, [divisionName, meetings, fetchMeetingOccurrences]);

  // Set division context and fetch meeting minutes
  useEffect(() => {
    if (divisionName) {
      setDivisionContext(divisionName);
      // This will get all minutes for the division
      searchMeetingMinutes(minutesSearchTerm, divisionName, undefined, minutesPage);
    }
  }, [searchMeetingMinutes, minutesSearchTerm, minutesPage, divisionName, setDivisionContext]);

  // Create marked dates for calendar
  useEffect(() => {
    const divisionMeetings = meetings[divisionName] || [];
    const newMarkedDates: any = {};

    // Collect all occurrences from all meeting patterns
    divisionMeetings.forEach((meeting) => {
      const meetingOccurrences = occurrences[meeting.id] || [];

      meetingOccurrences.forEach((occurrence) => {
        if (!occurrence.is_cancelled) {
          const date = parseISO(occurrence.actual_scheduled_datetime_utc);
          const dateString = format(date, "yyyy-MM-dd");

          newMarkedDates[dateString] = {
            marked: true,
            dotColor: Colors.dark.tint,
            selected: format(selectedDate, "yyyy-MM-dd") === dateString,
          };
        }
      });
    });

    setMarkedDates(newMarkedDates);
  }, [divisionName, meetings, occurrences, selectedDate, colorScheme]);

  // Find the next upcoming meeting
  const findNextMeeting = (): MeetingOccurrence | null => {
    const now = new Date();
    let nextMeeting: MeetingOccurrence | null = null;
    let earliestTime = new Date(now.getFullYear() + 1, 11, 31); // Far future date

    const divisionMeetings = meetings[divisionName] || [];

    divisionMeetings.forEach((meeting) => {
      const meetingOccurrences = occurrences[meeting.id] || [];

      meetingOccurrences.forEach((occurrence) => {
        if (!occurrence.is_cancelled) {
          const occurrenceDate = parseISO(occurrence.actual_scheduled_datetime_utc);

          if (isAfter(occurrenceDate, now) && occurrenceDate < earliestTime) {
            earliestTime = occurrenceDate;
            nextMeeting = occurrence;
          }
        }
      });
    });

    return nextMeeting;
  };

  // Format countdown text
  const formatCountdown = (date: Date): string => {
    const now = new Date();
    const days = differenceInDays(date, now);
    const hours = differenceInHours(date, now) % 24;
    const minutes = differenceInMinutes(date, now) % 60;

    if (days > 0) {
      return `${days} day${days !== 1 ? "s" : ""} ${hours} hour${hours !== 1 ? "s" : ""}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
    } else {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
  };

  // Get meeting pattern details for an occurrence
  const getMeetingPattern = (occurrence: MeetingOccurrence) => {
    const divisionMeetings = meetings[divisionName] || [];
    return divisionMeetings.find((meeting) => meeting.id === occurrence.meeting_pattern_id);
  };

  // Add to calendar function
  const handleAddToCalendar = async (occurrence: MeetingOccurrence) => {
    try {
      if (!occurrence.meeting_pattern_id) return;

      const calendarData = await exportCalendar(occurrence.meeting_pattern_id);

      // Get meeting pattern details for the occurrence
      const pattern = getMeetingPattern(occurrence);
      const meetingDate = parseISO(occurrence.actual_scheduled_datetime_utc);
      const meetingEndDate = addHours(meetingDate, 1); // Assume meetings last 1 hour

      // Format the meeting details
      const meetingDetails = {
        title: pattern?.meeting_type ? `${pattern.meeting_type} Meeting` : "Division Meeting",
        startDate: meetingDate,
        endDate: meetingEndDate,
        location: occurrence.location_name || pattern?.location_name || "",
        notes: occurrence.agenda || pattern?.default_agenda || "",
      };

      // Handle export based on platform
      const success = await handleCalendarExport(calendarData, meetingDetails);

      if (!success) {
        console.warn("Calendar export was not completed");
      }
    } catch (error) {
      console.error("Error exporting calendar", error);
    }
  };

  // Toggle view mode between list and calendar
  const toggleViewMode = () => {
    setViewMode(viewMode === "list" ? "calendar" : "list");
  };

  // Handle minutes search
  const handleMinutesSearch = (term: string) => {
    setMinutesSearchTerm(term);
    setMinutesPage(1); // Reset to first page when searching
  };

  // Handle minutes filter changes
  const handleMinutesFilterChange = (filters: { approved?: boolean; archived?: boolean }) => {
    setMinutesFilters({
      ...minutesFilters,
      approved: filters.approved !== undefined ? filters.approved : minutesFilters.approved,
      archived: filters.archived !== undefined ? filters.archived : minutesFilters.archived,
    });
    // Apply filters through the store (this would need to be implemented in the store)
    // For now, we'll just log that this would filter by these values
    console.log("Filter minutes:", filters);
  };

  // Handle minutes page changes
  const handleMinutesPageChange = (page: number) => {
    setMinutesPage(page);
    setPage(page);
  };

  // Handle minutes selection
  const handleSelectMinutes = (minutes: MeetingMinute) => {
    setSelectedMinutes(minutes);
    setMinutesModalVisible(true);
  };

  // Handle PDF export
  const handleExportPdf = (minuteId: string) => {
    exportMinutesPdf(minuteId);
  };

  // Close minutes modal
  const closeMinutesModal = () => {
    setMinutesModalVisible(false);
    setSelectedMinutes(null);
  };

  if (isLoading && !Object.keys(meetings).length) {
    return (
      <DivisionLoadingIndicator
        divisionName={divisionName}
        operation={loadingOperation || "Loading meetings"}
        isVisible={true}
      />
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  const nextMeeting = findNextMeeting();

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        {/* Division Meetings Header */}
        <ThemedView style={styles.header}>
          <ThemedText style={styles.title}>Division {divisionName} Meetings</ThemedText>
        </ThemedView>

        {/* Next Meeting Card */}
        {nextMeeting ? (
          <UpcomingMeeting
            meeting={nextMeeting}
            pattern={getMeetingPattern(nextMeeting)}
            onAddToCalendar={() => handleAddToCalendar(nextMeeting)}
            formatCountdown={formatCountdown}
          />
        ) : (
          <ThemedView style={styles.noMeetingCard}>
            <ThemedText style={styles.noMeetingText}>No upcoming meetings scheduled</ThemedText>
          </ThemedView>
        )}

        {/* View Toggle */}
        <ThemedView style={styles.viewToggleContainer}>
          <ThemedText style={styles.sectionTitle}>Meeting Schedule</ThemedText>
          <TouchableOpacity style={styles.viewToggleButton} onPress={toggleViewMode}>
            <Ionicons name={viewMode === "list" ? "calendar" : "list"} size={24} color={Colors.dark.tint} />
            <ThemedText style={styles.viewToggleText}>{viewMode === "list" ? "Calendar View" : "List View"}</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Meetings View (Calendar or List) */}
        {viewMode === "calendar" ? (
          <ThemedView style={styles.calendarContainer}>
            <Calendar
              markedDates={markedDates}
              theme={{
                calendarBackground: Colors.dark.background,
                textSectionTitleColor: Colors.dark.text,
                textSectionTitleDisabledColor: Colors.dark.textDim,
                selectedDayBackgroundColor: Colors.dark.tint,
                selectedDayTextColor: Colors.dark.buttonText,
                todayTextColor: Colors.dark.tint,
                dayTextColor: Colors.dark.text,
                textDisabledColor: Colors.dark.textDim,
                dotColor: Colors.dark.tint,
                selectedDotColor: Colors.dark.buttonText,
                arrowColor: Colors.dark.tint,
                disabledArrowColor: Colors.dark.textDim,
                monthTextColor: Colors.dark.text,
                indicatorColor: Colors.dark.tint,
              }}
              onDayPress={(day: DateData) => {
                setSelectedDate(new Date(day.timestamp));
              }}
            />

            {/* Meeting List for Selected Date */}
            <ThemedView style={styles.selectedDateMeetings}>
              <ThemedText style={styles.selectedDateTitle}>
                Meetings on {format(selectedDate, "MMMM d, yyyy")}
              </ThemedText>

              {Object.entries(occurrences).flatMap(([patternId, patternOccurrences]) =>
                patternOccurrences
                  .filter((occurrence) => {
                    const occurrenceDate = parseISO(occurrence.actual_scheduled_datetime_utc);
                    return format(occurrenceDate, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
                  })
                  .map((occurrence) => (
                    <MeetingListItem
                      key={occurrence.id}
                      occurrence={occurrence}
                      pattern={getMeetingPattern(occurrence)}
                      isExpanded={expandedMeetingId === occurrence.id}
                      onToggleExpand={() =>
                        setExpandedMeetingId(expandedMeetingId === occurrence.id ? null : occurrence.id)
                      }
                      onAddToCalendar={() => handleAddToCalendar(occurrence)}
                    />
                  ))
              )}

              {!Object.entries(occurrences).some(([patternId, patternOccurrences]) =>
                patternOccurrences.some((occurrence) => {
                  const occurrenceDate = parseISO(occurrence.actual_scheduled_datetime_utc);
                  return format(occurrenceDate, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
                })
              ) && <ThemedText style={styles.noMeetingsText}>No meetings scheduled for this date</ThemedText>}
            </ThemedView>
          </ThemedView>
        ) : (
          <ThemedView style={styles.listContainer}>
            {Object.entries(occurrences).flatMap(([patternId, patternOccurrences]) =>
              patternOccurrences
                .filter((occurrence) => {
                  const occurrenceDate = parseISO(occurrence.actual_scheduled_datetime_utc);
                  return isAfter(occurrenceDate, new Date());
                })
                .sort((a, b) => {
                  const dateA = parseISO(a.actual_scheduled_datetime_utc);
                  const dateB = parseISO(b.actual_scheduled_datetime_utc);
                  return dateA.getTime() - dateB.getTime();
                })
                .map((occurrence) => (
                  <MeetingListItem
                    key={occurrence.id}
                    occurrence={occurrence}
                    pattern={getMeetingPattern(occurrence)}
                    isExpanded={expandedMeetingId === occurrence.id}
                    onToggleExpand={() =>
                      setExpandedMeetingId(expandedMeetingId === occurrence.id ? null : occurrence.id)
                    }
                    onAddToCalendar={() => handleAddToCalendar(occurrence)}
                  />
                ))
            )}

            {Object.entries(occurrences).every(([patternId, patternOccurrences]) =>
              patternOccurrences.every((occurrence) => {
                const occurrenceDate = parseISO(occurrence.actual_scheduled_datetime_utc);
                return !isAfter(occurrenceDate, new Date());
              })
            ) && <ThemedText style={styles.noMeetingsText}>No upcoming meetings scheduled</ThemedText>}
          </ThemedView>
        )}

        {/* Past Meeting Minutes Section */}
        <ThemedView style={styles.minutesSection}>
          <ThemedText style={styles.sectionTitle}>Meeting Minutes</ThemedText>
          <ThemedText style={styles.sectionSubtitle}>View records of past division meetings</ThemedText>

          {/* Meeting Minutes Browser */}
          <ThemedView style={styles.minutesBrowserContainer}>
            <MinutesBrowser
              minutes={filteredMinutes || []}
              onSelectMinutes={handleSelectMinutes}
              onExportPdf={handleExportPdf}
              onSearch={handleMinutesSearch}
              onFilterChange={handleMinutesFilterChange}
              onPageChange={handleMinutesPageChange}
              currentPage={minutesPage}
              totalPages={totalMinutesPages}
              isLoading={isLoading}
            />
          </ThemedView>
        </ThemedView>

        {/* Minutes Detail Modal */}
        <Modal visible={minutesModalVisible} transparent animationType="slide" onRequestClose={closeMinutesModal}>
          <ThemedView style={styles.modalContainer}>
            <ThemedView style={styles.modalContent}>
              <ThemedView style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Meeting Minutes</ThemedText>
                <TouchableOpacity style={styles.closeButton} onPress={closeMinutesModal}>
                  <Ionicons name="close" size={24} color={Colors.dark.text} />
                </TouchableOpacity>
              </ThemedView>

              {selectedMinutes && (
                <ThemedScrollView style={styles.modalBody}>
                  <MinutesReader minutes={selectedMinutes} onExportPdf={() => exportMinutesPdf(selectedMinutes.id)} />
                </ThemedScrollView>
              )}
            </ThemedView>
          </ThemedView>
        </Modal>
      </ThemedView>
    </ThemedScrollView>
  );
}

// Upcoming Meeting Component
interface UpcomingMeetingProps {
  meeting: MeetingOccurrence;
  pattern: any;
  onAddToCalendar: () => void;
  formatCountdown: (date: Date) => string;
}

function UpcomingMeeting({ meeting, pattern, onAddToCalendar, formatCountdown }: UpcomingMeetingProps) {
  const meetingDate = parseISO(meeting.actual_scheduled_datetime_utc);

  // Prepare text values to avoid any template literal issues
  const dateText = format(meetingDate, "EEEE, MMMM d, yyyy");
  const timeText = format(meetingDate, "h:mm a");
  const countdownText = `In ${formatCountdown(meetingDate)}`;
  const meetingTypeText = pattern?.meeting_type ? `${pattern.meeting_type || ""} Meeting` : "";

  return (
    <ThemedView style={styles.upcomingMeetingCard}>
      <ThemedView style={styles.upcomingMeetingHeader}>
        <Ionicons name="time" size={24} color={Colors.dark.tint} />
        <ThemedText style={styles.upcomingMeetingTitle}>Next Meeting</ThemedText>
      </ThemedView>

      <ThemedView style={styles.upcomingMeetingDetails}>
        <ThemedView style={styles.upcomingMeetingRow}>
          <Ionicons name="calendar" size={20} color={Colors.dark.tint} />
          <ThemedText style={styles.upcomingMeetingText}>{dateText}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.upcomingMeetingRow}>
          <Ionicons name="time" size={20} color={Colors.dark.tint} />
          <ThemedText style={styles.upcomingMeetingText}>{timeText}</ThemedText>
        </ThemedView>

        {!!meeting.location_name && (
          <ThemedView style={styles.upcomingMeetingRow}>
            <Ionicons name="location" size={20} color={Colors.dark.tint} />
            <ThemedText style={styles.upcomingMeetingText}>{meeting.location_name}</ThemedText>
          </ThemedView>
        )}

        <ThemedView style={styles.upcomingMeetingRow}>
          <Ionicons name="hourglass" size={20} color={Colors.dark.tint} />
          <ThemedText style={styles.upcomingMeetingText}>{countdownText}</ThemedText>
        </ThemedView>

        {!!pattern?.meeting_type && (
          <ThemedView style={styles.upcomingMeetingRow}>
            <Ionicons name="information-circle" size={20} color={Colors.dark.tint} />
            <ThemedText style={styles.upcomingMeetingText}>{meetingTypeText}</ThemedText>
          </ThemedView>
        )}
      </ThemedView>

      {!!meeting.agenda && (
        <ThemedView style={styles.agendaPreview}>
          <ThemedText style={styles.agendaTitle}>Agenda Preview</ThemedText>
          <ThemedText style={styles.agendaText} numberOfLines={3}>
            {meeting.agenda}
          </ThemedText>
        </ThemedView>
      )}

      <TouchableOpacity style={styles.addToCalendarButton} onPress={onAddToCalendar}>
        <Ionicons name="calendar" size={20} color={Colors.dark.buttonText} />
        <ThemedText style={styles.addToCalendarText}>Add to Calendar</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

// Meeting List Item Component
interface MeetingListItemProps {
  occurrence: MeetingOccurrence;
  pattern: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAddToCalendar: () => void;
}

function MeetingListItem({ occurrence, pattern, isExpanded, onToggleExpand, onAddToCalendar }: MeetingListItemProps) {
  const meetingDate = parseISO(occurrence.actual_scheduled_datetime_utc);

  return (
    <ThemedView style={styles.meetingListItem}>
      <TouchableOpacity style={styles.meetingListItemHeader} onPress={onToggleExpand}>
        <ThemedView style={styles.meetingListItemMain}>
          <ThemedText style={styles.meetingListItemDate}>{format(meetingDate, "EEE, MMM d")}</ThemedText>
          <ThemedText style={styles.meetingListItemTime}>{format(meetingDate, "h:mm a")}</ThemedText>
          {pattern?.meeting_type && <ThemedText style={styles.meetingListItemType}>{pattern.meeting_type}</ThemedText>}
        </ThemedView>
        <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors.dark.tint} />
      </TouchableOpacity>

      {isExpanded && (
        <ThemedView style={styles.meetingListItemExpanded}>
          {occurrence.location_name && (
            <ThemedView style={styles.meetingListItemRow}>
              <Ionicons name="location" size={18} color={Colors.dark.tint} />
              <ThemedText style={styles.meetingListItemText}>{occurrence.location_name}</ThemedText>
            </ThemedView>
          )}

          {occurrence.agenda && (
            <ThemedView style={styles.meetingListItemRow}>
              <Ionicons name="document-text" size={18} color={Colors.dark.tint} />
              <ThemedText style={styles.meetingListItemText} numberOfLines={2}>
                {occurrence.agenda}
              </ThemedText>
            </ThemedView>
          )}

          <TouchableOpacity style={styles.meetingListItemCalendarButton} onPress={onAddToCalendar}>
            <Ionicons name="calendar" size={16} color={Colors.dark.buttonText} />
            <ThemedText style={styles.meetingListItemCalendarButtonText}>Add to Calendar</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 16,
  },
  upcomingMeetingCard: {
    backgroundColor: Colors.dark.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 16,
    marginBottom: 24,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 4,
  },
  upcomingMeetingHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: Colors.dark.card,
  },
  upcomingMeetingTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 8,
  },
  upcomingMeetingDetails: {
    marginBottom: 16,
    padding: 8,
    borderRadius: 8,
  },
  upcomingMeetingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 8,
  },
  upcomingMeetingText: {
    fontSize: 16,
    marginLeft: 8,
  },
  agendaPreview: {
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 12,
    marginBottom: 16,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  agendaText: {
    fontSize: 14,
    lineHeight: 20,
  },
  addToCalendarButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    width: "50%",
    alignSelf: "center",
  },
  addToCalendarText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  noMeetingCard: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  noMeetingText: {
    fontSize: 16,
    opacity: 0.8,
  },
  viewToggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  viewToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewToggleText: {
    fontSize: 14,
    marginLeft: 4,
  },
  calendarContainer: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 12,
    marginBottom: 24,
    overflow: "hidden",
  },
  selectedDateMeetings: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(180, 151, 90, 0.3)",
    paddingTop: 16,
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  listContainer: {
    marginBottom: 24,
  },
  meetingListItem: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B4975A",
    marginBottom: 12,
    overflow: "hidden",
  },
  meetingListItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  meetingListItemMain: {
    flex: 1,
    padding: 6,
    borderRadius: 8,
  },
  meetingListItemDate: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  meetingListItemTime: {
    fontSize: 14,
    marginBottom: 4,
  },
  meetingListItemType: {
    fontSize: 14,
    opacity: 0.7,
  },
  meetingListItemExpanded: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(180, 151, 90, 0.3)",
    backgroundColor: Colors.dark.card,
  },
  meetingListItemRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  meetingListItemText: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  meetingListItemCalendarButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginTop: 8,
    width: "50%",
    alignSelf: "center",
  },
  meetingListItemCalendarButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  noMeetingsText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.8,
    padding: 20,
  },
  minutesSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 16,
  },
  minutesBrowserContainer: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    padding: 16,
    overflow: "hidden",
    minHeight: 300,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 16,
  },
  modalContent: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    width: "100%",
    maxWidth: 800,
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.3)",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    padding: 16,
  },
});
