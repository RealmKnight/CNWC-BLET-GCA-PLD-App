import React from "react";
import { StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { format, parseISO } from "date-fns";
import { MeetingChangePreview, DuplicateCheckResult } from "@/store/divisionMeetingStore";

type ColorSchemeName = keyof typeof Colors;

interface MeetingPatternChangePreviewProps {
  preview: MeetingChangePreview;
  duplicateCheck: DuplicateCheckResult;
  warnings: string[];
  errors: string[];
  isValid: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function MeetingPatternChangePreview({
  preview,
  duplicateCheck,
  warnings,
  errors,
  isValid,
  onConfirm,
  onCancel,
  isLoading = false,
}: MeetingPatternChangePreviewProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  const formatDateTime = (dateTimeString: string) => {
    try {
      const date = parseISO(dateTimeString);
      return {
        date: format(date, "MMM d, yyyy"),
        time: format(date, "h:mm a"),
        dayOfWeek: format(date, "EEEE"),
      };
    } catch {
      return { date: "Invalid Date", time: "", dayOfWeek: "" };
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <Ionicons name="eye" size={24} color={Colors[colorScheme].tint} />
        <ThemedText style={styles.title}>Preview Meeting Pattern Changes</ThemedText>
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Section */}
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Impact Summary</ThemedText>
          <ThemedView style={styles.summaryGrid}>
            <ThemedView style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{preview.summary.totalChanges}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Total Changes</ThemedText>
            </ThemedView>
            <ThemedView style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{preview.summary.affectedDates}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Affected Dates</ThemedText>
            </ThemedView>
            <ThemedView style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{preview.addedOccurrences.length}</ThemedText>
              <ThemedText style={styles.summaryLabel}>New Meetings</ThemedText>
            </ThemedView>
            <ThemedView style={styles.summaryItem}>
              <ThemedText style={styles.summaryNumber}>{preview.removedOccurrences.length}</ThemedText>
              <ThemedText style={styles.summaryLabel}>Removed Meetings</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>

        {/* Errors Section */}
        {errors.length > 0 && (
          <ThemedView style={[styles.section, styles.errorSection]}>
            <ThemedView style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={20} color={Colors[colorScheme].error} />
              <ThemedText style={[styles.sectionTitle, styles.errorTitle]}>Errors</ThemedText>
            </ThemedView>
            {errors.map((error, index) => (
              <ThemedView key={index} style={styles.errorItem}>
                <Ionicons name="close-circle" size={16} color={Colors[colorScheme].error} />
                <ThemedText style={styles.errorText}>{error}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        )}

        {/* Warnings Section */}
        {warnings.length > 0 && (
          <ThemedView style={[styles.section, styles.warningSection]}>
            <ThemedView style={styles.sectionHeader}>
              <Ionicons name="warning" size={20} color="#FF9500" />
              <ThemedText style={[styles.sectionTitle, styles.warningTitle]}>Warnings</ThemedText>
            </ThemedView>
            {warnings.map((warning, index) => (
              <ThemedView key={index} style={styles.warningItem}>
                <Ionicons name="alert-circle-outline" size={16} color="#FF9500" />
                <ThemedText style={styles.warningText}>{warning}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        )}

        {/* Duplicate Conflicts Section */}
        {duplicateCheck.hasDuplicates && (
          <ThemedView style={[styles.section, styles.conflictSection]}>
            <ThemedView style={styles.sectionHeader}>
              <Ionicons name="copy" size={20} color="#FF9500" />
              <ThemedText style={[styles.sectionTitle, styles.conflictTitle]}>Schedule Conflicts</ThemedText>
            </ThemedView>
            {duplicateCheck.duplicates.map((duplicate, index) => {
              const { date, time } = formatDateTime(`${duplicate.date}T${duplicate.time}`);
              return (
                <ThemedView key={index} style={styles.conflictItem}>
                  <ThemedView style={styles.conflictHeader}>
                    <ThemedText style={styles.conflictDate}>
                      {date} at {time}
                    </ThemedText>
                    <ThemedView
                      style={[
                        styles.conflictBadge,
                        duplicate.conflictType === "exact_time"
                          ? styles.exactTimeBadge
                          : duplicate.conflictType === "overlapping_time"
                          ? styles.overlappingTimeBadge
                          : styles.sameDayBadge,
                      ]}
                    >
                      <ThemedText style={styles.conflictBadgeText}>
                        {duplicate.conflictType === "exact_time"
                          ? "Exact Time"
                          : duplicate.conflictType === "overlapping_time"
                          ? "Overlapping"
                          : "Same Day"}
                      </ThemedText>
                    </ThemedView>
                  </ThemedView>
                  <ThemedText style={styles.conflictDescription}>
                    Conflicts with: {duplicate.existingPatternName}
                  </ThemedText>
                </ThemedView>
              );
            })}
          </ThemedView>
        )}

        {/* Changed Meetings Section */}
        {preview.changedOccurrences.length > 0 && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Modified Meetings ({preview.changedOccurrences.length})</ThemedText>
            {preview.changedOccurrences.slice(0, 5).map((change, index) => {
              const existing = formatDateTime(change.existing.actual_scheduled_datetime_utc);
              const updated = formatDateTime(change.updated.actual_scheduled_datetime_utc);
              return (
                <ThemedView key={index} style={styles.changeItem}>
                  <ThemedView style={styles.changeHeader}>
                    <ThemedText style={styles.changeDate}>{existing.date}</ThemedText>
                    <ThemedView style={styles.changeBadge}>
                      <ThemedText style={styles.changeBadgeText}>Modified</ThemedText>
                    </ThemedView>
                  </ThemedView>
                  <ThemedView style={styles.changeDetails}>
                    <ThemedText style={styles.changeFrom}>From: {existing.time}</ThemedText>
                    <ThemedText style={styles.changeTo}>To: {updated.time}</ThemedText>
                  </ThemedView>
                  <ThemedText style={styles.changeReason}>Changes: {change.changes.join(", ")}</ThemedText>
                </ThemedView>
              );
            })}
            {preview.changedOccurrences.length > 5 && (
              <ThemedText style={styles.moreChanges}>
                ... and {preview.changedOccurrences.length - 5} more changes
              </ThemedText>
            )}
          </ThemedView>
        )}

        {/* New Meetings Section */}
        {preview.addedOccurrences.length > 0 && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>New Meetings ({preview.addedOccurrences.length})</ThemedText>
            {preview.addedOccurrences.slice(0, 5).map((occurrence, index) => {
              const { date, time, dayOfWeek } = formatDateTime(occurrence.actual_scheduled_datetime_utc);
              return (
                <ThemedView key={index} style={styles.newItem}>
                  <ThemedView style={styles.newHeader}>
                    <ThemedText style={styles.newDate}>{date}</ThemedText>
                    <ThemedView style={styles.newBadge}>
                      <ThemedText style={styles.newBadgeText}>New</ThemedText>
                    </ThemedView>
                  </ThemedView>
                  <ThemedText style={styles.newDetails}>
                    {dayOfWeek} at {time}
                  </ThemedText>
                  {occurrence.location_name && (
                    <ThemedText style={styles.newLocation}>📍 {occurrence.location_name}</ThemedText>
                  )}
                </ThemedView>
              );
            })}
            {preview.addedOccurrences.length > 5 && (
              <ThemedText style={styles.moreChanges}>
                ... and {preview.addedOccurrences.length - 5} more new meetings
              </ThemedText>
            )}
          </ThemedView>
        )}

        {/* Removed Meetings Section */}
        {preview.removedOccurrences.length > 0 && (
          <ThemedView style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Removed Meetings ({preview.removedOccurrences.length})</ThemedText>
            {preview.removedOccurrences.slice(0, 5).map((occurrence, index) => {
              const { date, time, dayOfWeek } = formatDateTime(occurrence.actual_scheduled_datetime_utc);
              return (
                <ThemedView key={index} style={styles.removedItem}>
                  <ThemedView style={styles.removedHeader}>
                    <ThemedText style={styles.removedDate}>{date}</ThemedText>
                    <ThemedView style={styles.removedBadge}>
                      <ThemedText style={styles.removedBadgeText}>Removed</ThemedText>
                    </ThemedView>
                  </ThemedView>
                  <ThemedText style={styles.removedDetails}>
                    {dayOfWeek} at {time}
                  </ThemedText>
                  {occurrence.location_name && (
                    <ThemedText style={styles.removedLocation}>📍 {occurrence.location_name}</ThemedText>
                  )}
                </ThemedView>
              );
            })}
            {preview.removedOccurrences.length > 5 && (
              <ThemedText style={styles.moreChanges}>
                ... and {preview.removedOccurrences.length - 5} more removed meetings
              </ThemedText>
            )}
          </ThemedView>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <ThemedView style={styles.actions}>
        <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel} disabled={isLoading}>
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.confirmButton, (!isValid || isLoading) && styles.disabledButton]}
          onPress={onConfirm}
          disabled={!isValid || isLoading}
        >
          {isLoading ? (
            <ThemedText style={styles.confirmButtonText}>Updating...</ThemedText>
          ) : (
            <ThemedText style={styles.confirmButtonText}>{isValid ? "Confirm Changes" : "Cannot Update"}</ThemedText>
          )}
        </TouchableOpacity>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  summaryItem: {
    width: "48%",
    alignItems: "center",
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.dark.tint,
  },
  summaryLabel: {
    fontSize: 12,
    opacity: 0.8,
    textAlign: "center",
  },
  errorSection: {
    borderColor: Colors.dark.error,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
  },
  errorTitle: {
    color: Colors.dark.error,
    marginLeft: 8,
  },
  errorItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  errorText: {
    color: Colors.dark.error,
    marginLeft: 8,
    flex: 1,
  },
  warningSection: {
    borderColor: "#FF9500",
    backgroundColor: "rgba(255, 149, 0, 0.1)",
  },
  warningTitle: {
    color: "#FF9500",
    marginLeft: 8,
  },
  warningItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  warningText: {
    color: "#FF9500",
    marginLeft: 8,
    flex: 1,
  },
  conflictSection: {
    borderColor: "#FF9500",
    backgroundColor: "rgba(255, 149, 0, 0.1)",
  },
  conflictTitle: {
    color: "#FF9500",
    marginLeft: 8,
  },
  conflictItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  conflictHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  conflictDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  conflictBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exactTimeBadge: {
    backgroundColor: Colors.dark.error,
  },
  overlappingTimeBadge: {
    backgroundColor: "#FF9500",
  },
  sameDayBadge: {
    backgroundColor: Colors.dark.tint,
  },
  conflictBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  conflictDescription: {
    fontSize: 12,
    opacity: 0.8,
  },
  changeItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  changeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  changeDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  changeBadge: {
    backgroundColor: "#FF9500",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  changeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  changeDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  changeFrom: {
    fontSize: 12,
    opacity: 0.8,
  },
  changeTo: {
    fontSize: 12,
    color: Colors.dark.tint,
    fontWeight: "600",
  },
  changeReason: {
    fontSize: 11,
    opacity: 0.6,
  },
  newItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  newHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  newDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  newBadge: {
    backgroundColor: "#34C759",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  newDetails: {
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 2,
  },
  newLocation: {
    fontSize: 11,
    opacity: 0.6,
  },
  removedItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: Colors.dark.background,
    borderRadius: 8,
  },
  removedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  removedDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  removedBadge: {
    backgroundColor: Colors.dark.error,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  removedBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  removedDetails: {
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 2,
  },
  removedLocation: {
    fontSize: 11,
    opacity: 0.6,
  },
  moreChanges: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: "center",
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: Colors.dark.tint,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  disabledButton: {
    backgroundColor: Colors.dark.border,
    opacity: 0.5,
  },
});
