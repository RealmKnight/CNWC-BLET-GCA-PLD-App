import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MeetingMinute } from "@/store/divisionMeetingStore";
import { format, parseISO } from "date-fns";

type ColorSchemeName = keyof typeof Colors;

interface MinutesReaderProps {
  minutes: MeetingMinute;
  onExportPdf?: () => void;
}

export function MinutesReader({ minutes, onExportPdf }: MinutesReaderProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    callToOrder: true,
    rollCall: true,
    approvalOfPreviousMinutes: false,
    reports: false,
    motions: false,
    adjournment: false,
    additionalSections: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
      return format(parseISO(dateString), "MMMM d, yyyy");
    } catch (error) {
      return dateString;
    }
  };

  // Extract structured content from minutes
  const structuredContent = minutes.structured_content || {};

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>Meeting Minutes</ThemedText>
        <ThemedText style={styles.date}>{formatDate(minutes.meeting_date)}</ThemedText>

        {onExportPdf && (
          <TouchableOpacity style={styles.exportButton} onPress={onExportPdf}>
            <Ionicons name="document-text-outline" size={20} color={Colors[colorScheme].buttonText} />
            <ThemedText style={styles.exportButtonText}>Export PDF</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>

      {/* Call to Order Section */}
      <SectionHeader
        title="Call to Order"
        isExpanded={expandedSections.callToOrder}
        onToggle={() => toggleSection("callToOrder")}
      />
      {expandedSections.callToOrder && structuredContent.call_to_order && (
        <ThemedView style={styles.sectionContent}>
          <ThemedText style={styles.sectionText}>
            The meeting was called to order at {structuredContent.call_to_order.time} by{" "}
            {structuredContent.call_to_order.presiding_officer}.
          </ThemedText>
        </ThemedView>
      )}

      {/* Roll Call Section */}
      <SectionHeader
        title="Roll Call"
        isExpanded={expandedSections.rollCall}
        onToggle={() => toggleSection("rollCall")}
      />
      {expandedSections.rollCall && structuredContent.roll_call && (
        <ThemedView style={styles.sectionContent}>
          {structuredContent.roll_call.present && structuredContent.roll_call.present.length > 0 && (
            <View style={styles.rollCallSection}>
              <ThemedText style={styles.subheading}>Present:</ThemedText>
              {structuredContent.roll_call.present.map((member: string, index: number) => (
                <ThemedText key={index} style={styles.listItem}>
                  • {member}
                </ThemedText>
              ))}
            </View>
          )}

          {structuredContent.roll_call.absent && structuredContent.roll_call.absent.length > 0 && (
            <View style={styles.rollCallSection}>
              <ThemedText style={styles.subheading}>Absent:</ThemedText>
              {structuredContent.roll_call.absent.map((member: string, index: number) => (
                <ThemedText key={index} style={styles.listItem}>
                  • {member}
                </ThemedText>
              ))}
            </View>
          )}

          {structuredContent.roll_call.excused && structuredContent.roll_call.excused.length > 0 && (
            <View style={styles.rollCallSection}>
              <ThemedText style={styles.subheading}>Excused:</ThemedText>
              {structuredContent.roll_call.excused.map((member: string, index: number) => (
                <ThemedText key={index} style={styles.listItem}>
                  • {member}
                </ThemedText>
              ))}
            </View>
          )}
        </ThemedView>
      )}

      {/* Approval of Previous Minutes */}
      <SectionHeader
        title="Approval of Previous Minutes"
        isExpanded={expandedSections.approvalOfPreviousMinutes}
        onToggle={() => toggleSection("approvalOfPreviousMinutes")}
      />
      {expandedSections.approvalOfPreviousMinutes && structuredContent.approval_of_previous_minutes && (
        <ThemedView style={styles.sectionContent}>
          <ThemedText style={styles.sectionText}>
            Previous minutes were{" "}
            {structuredContent.approval_of_previous_minutes.approved ? "approved" : "not approved"}.
            {structuredContent.approval_of_previous_minutes.amendments && (
              <ThemedText style={styles.amendments}>
                {"\n"}Amendments: {structuredContent.approval_of_previous_minutes.amendments}
              </ThemedText>
            )}
          </ThemedText>
        </ThemedView>
      )}

      {/* Reports Section */}
      <SectionHeader title="Reports" isExpanded={expandedSections.reports} onToggle={() => toggleSection("reports")} />
      {expandedSections.reports && structuredContent.reports && (
        <ThemedView style={styles.sectionContent}>
          {structuredContent.reports.map((report: any, index: number) => (
            <ThemedView key={index} style={styles.reportItem}>
              <ThemedText style={styles.reportTitle}>{report.title}</ThemedText>
              <ThemedText style={styles.reportPresenter}>Presented by: {report.presenter}</ThemedText>
              <ThemedText style={styles.reportSummary}>{report.summary}</ThemedText>
            </ThemedView>
          ))}
          {(!structuredContent.reports || structuredContent.reports.length === 0) && (
            <ThemedText style={styles.emptyMessage}>No reports presented.</ThemedText>
          )}
        </ThemedView>
      )}

      {/* Motions Section */}
      <SectionHeader title="Motions" isExpanded={expandedSections.motions} onToggle={() => toggleSection("motions")} />
      {expandedSections.motions && structuredContent.motions && (
        <ThemedView style={styles.sectionContent}>
          {structuredContent.motions.map((motion: any, index: number) => (
            <ThemedView key={index} style={styles.motionItem}>
              <ThemedText style={styles.motionTitle}>{motion.title}</ThemedText>
              <ThemedText style={styles.motionDescription}>{motion.description}</ThemedText>
              <ThemedText style={styles.motionMover}>
                Moved by: {motion.moved_by}, Seconded by: {motion.seconded_by}
              </ThemedText>
              {motion.vote_result && (
                <ThemedView style={styles.voteResults}>
                  <ThemedText style={styles.voteResultsTitle}>Vote Results:</ThemedText>
                  <ThemedText style={styles.voteResultsText}>
                    In Favor: {motion.vote_result.in_favor} | Opposed: {motion.vote_result.opposed} | Abstained:{" "}
                    {motion.vote_result.abstained}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.motionPassed,
                      { color: motion.passed ? Colors[colorScheme].success : Colors[colorScheme].error },
                    ]}
                  >
                    Motion {motion.passed ? "PASSED" : "FAILED"}
                  </ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          ))}
          {(!structuredContent.motions || structuredContent.motions.length === 0) && (
            <ThemedText style={styles.emptyMessage}>No motions presented.</ThemedText>
          )}
        </ThemedView>
      )}

      {/* Adjournment Section */}
      <SectionHeader
        title="Adjournment"
        isExpanded={expandedSections.adjournment}
        onToggle={() => toggleSection("adjournment")}
      />
      {expandedSections.adjournment && structuredContent.adjournment && (
        <ThemedView style={styles.sectionContent}>
          <ThemedText style={styles.sectionText}>Meeting adjourned at {structuredContent.adjournment.time}.</ThemedText>
          {structuredContent.adjournment.moved_by && (
            <ThemedText style={styles.sectionText}>
              Motion to adjourn by {structuredContent.adjournment.moved_by}, seconded by{" "}
              {structuredContent.adjournment.seconded_by}.
            </ThemedText>
          )}
          {structuredContent.adjournment.vote_result && (
            <ThemedText style={styles.sectionText}>
              Vote: {structuredContent.adjournment.vote_result.in_favor} in favor,
              {structuredContent.adjournment.vote_result.opposed} opposed,
              {structuredContent.adjournment.vote_result.abstained} abstained.
            </ThemedText>
          )}
        </ThemedView>
      )}

      {/* Additional Sections */}
      {structuredContent.additional_sections && structuredContent.additional_sections.length > 0 && (
        <>
          <SectionHeader
            title="Additional Sections"
            isExpanded={expandedSections.additionalSections}
            onToggle={() => toggleSection("additionalSections")}
          />
          {expandedSections.additionalSections && (
            <ThemedView style={styles.sectionContent}>
              {structuredContent.additional_sections.map((section: any, index: number) => (
                <ThemedView key={index} style={styles.additionalSection}>
                  <ThemedText style={styles.additionalSectionTitle}>{section.title}</ThemedText>
                  <ThemedText style={styles.additionalSectionContent}>{section.content}</ThemedText>
                </ThemedView>
              ))}
            </ThemedView>
          )}
        </>
      )}

      {/* Footer with approval status */}
      <ThemedView style={styles.footer}>
        {minutes.is_approved ? (
          <ThemedView style={styles.approvedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors[colorScheme].success} />
            <ThemedText style={[styles.approvedText, { color: Colors[colorScheme].success }]}>
              Approved on {formatDate(minutes.approval_date)}
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.unapprovedBadge}>
            <Ionicons name="time" size={16} color={Colors[colorScheme].warning} />
            <ThemedText style={[styles.unapprovedText, { color: Colors[colorScheme].warning }]}>
              Pending Approval
            </ThemedText>
          </ThemedView>
        )}
      </ThemedView>
    </ThemedView>
  );
}

// Section Header Component
interface SectionHeaderProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function SectionHeader({ title, isExpanded, onToggle }: SectionHeaderProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;

  return (
    <TouchableOpacity style={styles.sectionHeader} onPress={onToggle}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={Colors[colorScheme].tint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    overflow: "hidden",
    marginBottom: 16,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.3)",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    opacity: 0.8,
    marginBottom: 12,
  },
  exportButton: {
    backgroundColor: "#B4975A",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: "flex-start",
  },
  exportButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 6,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.3)",
    backgroundColor: "rgba(180, 151, 90, 0.05)",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionContent: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.3)",
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  listItem: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 8,
    marginBottom: 2,
  },
  rollCallSection: {
    marginBottom: 12,
  },
  amendments: {
    fontStyle: "italic",
  },
  reportItem: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.2)",
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  reportPresenter: {
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 4,
    opacity: 0.8,
  },
  reportSummary: {
    fontSize: 14,
    lineHeight: 20,
  },
  motionItem: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(180, 151, 90, 0.2)",
  },
  motionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  motionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  motionMover: {
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 8,
    opacity: 0.8,
  },
  voteResults: {
    backgroundColor: "rgba(180, 151, 90, 0.1)",
    borderRadius: 8,
    padding: 8,
  },
  voteResultsTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  voteResultsText: {
    fontSize: 14,
    marginBottom: 4,
  },
  motionPassed: {
    fontSize: 14,
    fontWeight: "600",
  },
  additionalSection: {
    marginBottom: 12,
  },
  additionalSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  additionalSectionContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    alignItems: "flex-end",
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(40, 167, 69, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  approvedText: {
    fontSize: 14,
    marginLeft: 4,
  },
  unapprovedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  unapprovedText: {
    fontSize: 14,
    marginLeft: 4,
  },
  emptyMessage: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
  },
});
