import React, { useState, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView, TextInput, Switch } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Button } from "@/components/ui/Button";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ClientOnlyDatePicker } from "@/components/ClientOnlyDatePicker";
import { format, parseISO } from "date-fns";

// This will be properly typed in Phase 2
interface StructuredMinutesContent {
  call_to_order: {
    time: string;
    presiding_officer: string;
  };
  roll_call: {
    present: string[];
    absent: string[];
    excused: string[];
  };
  approval_of_previous_minutes: {
    approved: boolean;
    amendments: string;
  };
  reports: {
    title: string;
    presenter: string;
    summary: string;
  }[];
  motions: {
    title: string;
    moved_by: string;
    seconded_by: string;
    description: string;
    vote_result: {
      in_favor: number;
      opposed: number;
      abstained: number;
    };
    passed: boolean;
  }[];
  adjournment: {
    moved_by: string;
    seconded_by: string;
    vote_result: {
      in_favor: number;
      opposed: number;
      abstained: number;
    };
    passed: boolean;
    time: string;
  };
  additional_sections: {
    title: string;
    content: string;
  }[];
  attendance_summary: {
    present_count: number;
    absent_count: number;
    excused_count: number;
    notes: string;
  };
}

interface StructuredMinutesEditorProps {
  initialContent?: Partial<StructuredMinutesContent>;
  onSave: (content: StructuredMinutesContent) => void;
  onCancel?: () => void;
  meetingDate?: string;
}

export function StructuredMinutesEditor({
  initialContent,
  onSave,
  onCancel,
  meetingDate,
}: StructuredMinutesEditorProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const isDark = colorScheme === "dark";

  // Initialize content with defaults if not provided
  const [content, setContent] = useState<StructuredMinutesContent>({
    call_to_order: initialContent?.call_to_order || {
      time: "19:00:00",
      presiding_officer: "",
    },
    roll_call: initialContent?.roll_call || {
      present: [],
      absent: [],
      excused: [],
    },
    approval_of_previous_minutes: initialContent?.approval_of_previous_minutes || {
      approved: true,
      amendments: "",
    },
    reports: initialContent?.reports || [],
    motions: initialContent?.motions || [],
    adjournment: initialContent?.adjournment || {
      moved_by: "",
      seconded_by: "",
      vote_result: {
        in_favor: 0,
        opposed: 0,
        abstained: 0,
      },
      passed: true,
      time: "21:00:00",
    },
    additional_sections: initialContent?.additional_sections || [],
    attendance_summary: initialContent?.attendance_summary || {
      present_count: 0,
      absent_count: 0,
      excused_count: 0,
      notes: "",
    },
  });

  // Helper function to update deep nested state
  const updateContent = (section: keyof StructuredMinutesContent, field: string, value: any, index?: number) => {
    setContent((prev) => {
      const newContent = { ...prev };

      // Handle updates for array sections
      if (index !== undefined && Array.isArray(newContent[section])) {
        if (section === "reports") {
          const newArray = [...prev.reports];
          if (field.includes(".")) {
            const [parentField, childField] = field.split(".");
            newArray[index] = {
              ...newArray[index],
              [parentField]: {
                ...((newArray[index] as any)[parentField] || {}),
                [childField]: value,
              },
            };
          } else {
            newArray[index] = {
              ...newArray[index],
              [field]: value,
            } as any;
          }
          newContent.reports = newArray;
        } else if (section === "motions") {
          const newArray = [...prev.motions];
          if (field.includes(".")) {
            const [parentField, childField] = field.split(".");
            newArray[index] = {
              ...newArray[index],
              [parentField]: {
                ...((newArray[index] as any)[parentField] || {}),
                [childField]: value,
              },
            };
          } else {
            newArray[index] = {
              ...newArray[index],
              [field]: value,
            } as any;
          }
          newContent.motions = newArray;
        } else if (section === "additional_sections") {
          const newArray = [...prev.additional_sections];
          if (field.includes(".")) {
            const [parentField, childField] = field.split(".");
            newArray[index] = {
              ...newArray[index],
              [parentField]: {
                ...((newArray[index] as any)[parentField] || {}),
                [childField]: value,
              },
            };
          } else {
            newArray[index] = {
              ...newArray[index],
              [field]: value,
            } as any;
          }
          newContent.additional_sections = newArray;
        }
      }
      // Handle updates for nested objects
      else if (field.includes(".")) {
        const [parentField, childField] = field.split(".");
        newContent[section] = {
          ...(newContent[section] as any),
          [parentField]: {
            ...(newContent[section] as any)[parentField],
            [childField]: value,
          },
        };
      }
      // Handle direct updates to object properties
      else {
        newContent[section] = {
          ...(newContent[section] as any),
          [field]: value,
        };
      }

      return newContent;
    });
  };

  // Type guards for array sections
  const isReportsArray = (section: keyof StructuredMinutesContent): section is "reports" => {
    return section === "reports";
  };

  const isMotionsArray = (section: keyof StructuredMinutesContent): section is "motions" => {
    return section === "motions";
  };

  const isAdditionalSectionsArray = (section: keyof StructuredMinutesContent): section is "additional_sections" => {
    return section === "additional_sections";
  };

  // Add/remove array items
  const addArrayItem = (section: keyof StructuredMinutesContent, defaultItem: any) => {
    setContent((prev) => {
      if (isReportsArray(section)) {
        return {
          ...prev,
          reports: [...prev.reports, defaultItem as StructuredMinutesContent["reports"][0]],
        };
      } else if (isMotionsArray(section)) {
        return {
          ...prev,
          motions: [...prev.motions, defaultItem as StructuredMinutesContent["motions"][0]],
        };
      } else if (isAdditionalSectionsArray(section)) {
        return {
          ...prev,
          additional_sections: [
            ...prev.additional_sections,
            defaultItem as StructuredMinutesContent["additional_sections"][0],
          ],
        };
      }
      return prev;
    });
  };

  const removeArrayItem = (section: keyof StructuredMinutesContent, index: number) => {
    setContent((prev) => {
      if (isReportsArray(section)) {
        return {
          ...prev,
          reports: prev.reports.filter((_, i) => i !== index),
        };
      } else if (isMotionsArray(section)) {
        return {
          ...prev,
          motions: prev.motions.filter((_, i) => i !== index),
        };
      } else if (isAdditionalSectionsArray(section)) {
        return {
          ...prev,
          additional_sections: prev.additional_sections.filter((_, i) => i !== index),
        };
      }
      return prev;
    });
  };

  // Update list of people (present, absent, excused)
  const updatePeopleList = (field: "present" | "absent" | "excused", list: string) => {
    const names = list
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name);
    updateContent("roll_call", field, names);

    // Also update the count in attendance_summary
    updateContent("attendance_summary", `${field}_count`, names.length);
  };

  // Call to Order Section
  const renderCallToOrder = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Call to Order</ThemedText>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Time:</ThemedText>
        <ThemedTextInput
          style={styles.timeInput}
          value={content.call_to_order.time}
          onChangeText={(value) => updateContent("call_to_order", "time", value)}
          placeholder="HH:MM:SS"
        />
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Presiding Officer:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.call_to_order.presiding_officer}
          onChangeText={(value) => updateContent("call_to_order", "presiding_officer", value)}
          placeholder="Enter name"
        />
      </View>
    </View>
  );

  // Roll Call Section
  const renderRollCall = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Roll Call</ThemedText>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Present:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.roll_call.present.join(", ")}
          onChangeText={(value) => updatePeopleList("present", value)}
          placeholder="Enter names separated by commas"
          multiline
        />
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Absent:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.roll_call.absent.join(", ")}
          onChangeText={(value) => updatePeopleList("absent", value)}
          placeholder="Enter names separated by commas"
          multiline
        />
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Excused:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.roll_call.excused.join(", ")}
          onChangeText={(value) => updatePeopleList("excused", value)}
          placeholder="Enter names separated by commas"
          multiline
        />
      </View>
    </View>
  );

  // Previous Minutes Approval
  const renderPreviousMinutesApproval = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Approval of Previous Minutes</ThemedText>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Approved:</ThemedText>
        <Switch
          value={content.approval_of_previous_minutes.approved}
          onValueChange={(value) => updateContent("approval_of_previous_minutes", "approved", value)}
          trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
        />
      </View>
      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Amendments:</ThemedText>
        <ThemedTextInput
          style={styles.textArea}
          value={content.approval_of_previous_minutes.amendments}
          onChangeText={(value) => updateContent("approval_of_previous_minutes", "amendments", value)}
          placeholder="Enter any amendments made to previous minutes"
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  // Reports Section
  const renderReports = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Reports</ThemedText>

      {content.reports.map((report, index) => (
        <View key={`report-${index}`} style={styles.arrayItem}>
          <View style={styles.itemHeader}>
            <ThemedText style={styles.itemTitle}>Report {index + 1}</ThemedText>
            <TouchableOpacity onPress={() => removeArrayItem("reports", index)} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={20} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Title:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={report.title}
              onChangeText={(value) => updateContent("reports", "title", value, index)}
              placeholder="Enter report title"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Presenter:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={report.presenter}
              onChangeText={(value) => updateContent("reports", "presenter", value, index)}
              placeholder="Enter presenter name"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Summary:</ThemedText>
            <ThemedTextInput
              style={styles.textArea}
              value={report.summary}
              onChangeText={(value) => updateContent("reports", "summary", value, index)}
              placeholder="Enter report summary"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>
      ))}

      <Button
        onPress={() => addArrayItem("reports", { title: "", presenter: "", summary: "" })}
        style={{ marginTop: 10, alignSelf: "flex-start" }}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="add-circle-outline" size={16} color={Colors[colorScheme].buttonText} />
          <ThemedText style={styles.buttonText}>Add Report</ThemedText>
        </View>
      </Button>
    </View>
  );

  // Motions Section
  const renderMotions = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Motions</ThemedText>

      {content.motions.map((motion, index) => (
        <View key={`motion-${index}`} style={styles.arrayItem}>
          <View style={styles.itemHeader}>
            <ThemedText style={styles.itemTitle}>Motion {index + 1}</ThemedText>
            <TouchableOpacity onPress={() => removeArrayItem("motions", index)} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={20} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Title:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={motion.title}
              onChangeText={(value) => updateContent("motions", "title", value, index)}
              placeholder="Enter motion title"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Moved By:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={motion.moved_by}
              onChangeText={(value) => updateContent("motions", "moved_by", value, index)}
              placeholder="Enter name"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Seconded By:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={motion.seconded_by}
              onChangeText={(value) => updateContent("motions", "seconded_by", value, index)}
              placeholder="Enter name"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Description:</ThemedText>
            <ThemedTextInput
              style={styles.textArea}
              value={motion.description}
              onChangeText={(value) => updateContent("motions", "description", value, index)}
              placeholder="Enter motion description"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.voteContainer}>
            <ThemedText style={styles.voteTitle}>Vote Result</ThemedText>
            <View style={styles.voteRow}>
              <View style={styles.voteItem}>
                <ThemedText style={styles.voteLabel}>In Favor:</ThemedText>
                <ThemedTextInput
                  style={styles.voteInput}
                  value={motion.vote_result.in_favor.toString()}
                  onChangeText={(value) => {
                    const numValue = parseInt(value) || 0;
                    updateContent("motions", "vote_result.in_favor", numValue, index);
                  }}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.voteItem}>
                <ThemedText style={styles.voteLabel}>Opposed:</ThemedText>
                <ThemedTextInput
                  style={styles.voteInput}
                  value={motion.vote_result.opposed.toString()}
                  onChangeText={(value) => {
                    const numValue = parseInt(value) || 0;
                    updateContent("motions", "vote_result.opposed", numValue, index);
                  }}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.voteItem}>
                <ThemedText style={styles.voteLabel}>Abstained:</ThemedText>
                <ThemedTextInput
                  style={styles.voteInput}
                  value={motion.vote_result.abstained.toString()}
                  onChangeText={(value) => {
                    const numValue = parseInt(value) || 0;
                    updateContent("motions", "vote_result.abstained", numValue, index);
                  }}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Passed:</ThemedText>
            <Switch
              value={motion.passed}
              onValueChange={(value) => updateContent("motions", "passed", value, index)}
              trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
            />
          </View>
        </View>
      ))}

      <Button
        onPress={() =>
          addArrayItem("motions", {
            title: "",
            moved_by: "",
            seconded_by: "",
            description: "",
            vote_result: { in_favor: 0, opposed: 0, abstained: 0 },
            passed: true,
          })
        }
        style={{ marginTop: 10, alignSelf: "flex-start" }}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="add-circle-outline" size={16} color={Colors[colorScheme].buttonText} />
          <ThemedText style={styles.buttonText}>Add Motion</ThemedText>
        </View>
      </Button>
    </View>
  );

  // Adjournment Section
  const renderAdjournment = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Adjournment</ThemedText>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Moved By:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.adjournment.moved_by}
          onChangeText={(value) => updateContent("adjournment", "moved_by", value)}
          placeholder="Enter name"
        />
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Seconded By:</ThemedText>
        <ThemedTextInput
          style={styles.textInput}
          value={content.adjournment.seconded_by}
          onChangeText={(value) => updateContent("adjournment", "seconded_by", value)}
          placeholder="Enter name"
        />
      </View>

      <View style={styles.voteContainer}>
        <ThemedText style={styles.voteTitle}>Vote Result</ThemedText>
        <View style={styles.voteRow}>
          <View style={styles.voteItem}>
            <ThemedText style={styles.voteLabel}>In Favor:</ThemedText>
            <ThemedTextInput
              style={styles.voteInput}
              value={content.adjournment.vote_result.in_favor.toString()}
              onChangeText={(value) => {
                const numValue = parseInt(value) || 0;
                updateContent("adjournment", "vote_result.in_favor", numValue);
              }}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.voteItem}>
            <ThemedText style={styles.voteLabel}>Opposed:</ThemedText>
            <ThemedTextInput
              style={styles.voteInput}
              value={content.adjournment.vote_result.opposed.toString()}
              onChangeText={(value) => {
                const numValue = parseInt(value) || 0;
                updateContent("adjournment", "vote_result.opposed", numValue);
              }}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.voteItem}>
            <ThemedText style={styles.voteLabel}>Abstained:</ThemedText>
            <ThemedTextInput
              style={styles.voteInput}
              value={content.adjournment.vote_result.abstained.toString()}
              onChangeText={(value) => {
                const numValue = parseInt(value) || 0;
                updateContent("adjournment", "vote_result.abstained", numValue);
              }}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Passed:</ThemedText>
        <Switch
          value={content.adjournment.passed}
          onValueChange={(value) => updateContent("adjournment", "passed", value)}
          trackColor={{ false: "#767577", true: Colors[colorScheme].tint }}
        />
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Time:</ThemedText>
        <ThemedTextInput
          style={styles.timeInput}
          value={content.adjournment.time}
          onChangeText={(value) => updateContent("adjournment", "time", value)}
          placeholder="HH:MM:SS"
        />
      </View>
    </View>
  );

  // Additional Sections
  const renderAdditionalSections = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Additional Sections</ThemedText>

      {content.additional_sections.map((section, index) => (
        <View key={`additional-${index}`} style={styles.arrayItem}>
          <View style={styles.itemHeader}>
            <ThemedText style={styles.itemTitle}>Additional Section {index + 1}</ThemedText>
            <TouchableOpacity onPress={() => removeArrayItem("additional_sections", index)} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={20} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Title:</ThemedText>
            <ThemedTextInput
              style={styles.textInput}
              value={section.title}
              onChangeText={(value) => updateContent("additional_sections", "title", value, index)}
              placeholder="Enter section title"
            />
          </View>

          <View style={styles.inputRow}>
            <ThemedText style={styles.inputLabel}>Content:</ThemedText>
            <ThemedTextInput
              style={styles.textArea}
              value={section.content}
              onChangeText={(value) => updateContent("additional_sections", "content", value, index)}
              placeholder="Enter section content"
              multiline
              numberOfLines={4}
            />
          </View>
        </View>
      ))}

      <Button
        onPress={() => addArrayItem("additional_sections", { title: "", content: "" })}
        style={{ marginTop: 10, alignSelf: "flex-start" }}
      >
        <View style={styles.buttonContent}>
          <Ionicons name="add-circle-outline" size={16} color={Colors[colorScheme].buttonText} />
          <ThemedText style={styles.buttonText}>Add Section</ThemedText>
        </View>
      </Button>
    </View>
  );

  // Attendance Summary
  const renderAttendanceSummary = () => (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>Attendance Summary</ThemedText>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Present Count:</ThemedText>
        <ThemedTextInput
          style={styles.numericInput}
          value={content.attendance_summary.present_count.toString()}
          onChangeText={(value) => {
            const numValue = parseInt(value) || 0;
            updateContent("attendance_summary", "present_count", numValue);
          }}
          keyboardType="numeric"
          editable={false} // This will be calculated from roll call
        />
        <ThemedText style={styles.hint}>(Auto-calculated from roll call)</ThemedText>
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Absent Count:</ThemedText>
        <ThemedTextInput
          style={styles.numericInput}
          value={content.attendance_summary.absent_count.toString()}
          onChangeText={(value) => {
            const numValue = parseInt(value) || 0;
            updateContent("attendance_summary", "absent_count", numValue);
          }}
          keyboardType="numeric"
          editable={false} // This will be calculated from roll call
        />
        <ThemedText style={styles.hint}>(Auto-calculated from roll call)</ThemedText>
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Excused Count:</ThemedText>
        <ThemedTextInput
          style={styles.numericInput}
          value={content.attendance_summary.excused_count.toString()}
          onChangeText={(value) => {
            const numValue = parseInt(value) || 0;
            updateContent("attendance_summary", "excused_count", numValue);
          }}
          keyboardType="numeric"
          editable={false} // This will be calculated from roll call
        />
        <ThemedText style={styles.hint}>(Auto-calculated from roll call)</ThemedText>
      </View>

      <View style={styles.inputRow}>
        <ThemedText style={styles.inputLabel}>Notes:</ThemedText>
        <ThemedTextInput
          style={styles.textArea}
          value={content.attendance_summary.notes}
          onChangeText={(value) => updateContent("attendance_summary", "notes", value)}
          placeholder="Additional attendance notes"
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  const handleSave = () => {
    onSave(content);
  };

  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>Meeting Minutes Editor</ThemedText>

      {meetingDate && (
        <ThemedText style={styles.meetingDate}>
          For meeting on {format(parseISO(meetingDate), "MMMM d, yyyy")}
        </ThemedText>
      )}

      {renderCallToOrder()}
      {renderRollCall()}
      {renderPreviousMinutesApproval()}
      {renderReports()}
      {renderMotions()}
      {renderAdjournment()}
      {renderAdditionalSections()}
      {renderAttendanceSummary()}

      <View style={styles.buttonContainer}>
        <Button variant="secondary" onPress={onCancel} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button onPress={handleSave} style={{ minWidth: 120 }}>
          Save Minutes
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 12,
  },
  meetingDate: {
    fontSize: 16,
    fontStyle: "italic",
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "500",
    width: 150,
  },
  textInput: {
    flex: 1,
    minWidth: 150,
  },
  timeInput: {
    width: 120,
  },
  numericInput: {
    width: 80,
    textAlign: "center",
  },
  textArea: {
    flex: 1,
    minWidth: 250,
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 8,
  },
  arrayItem: {
    marginBottom: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  removeButton: {
    padding: 4,
  },
  addButton: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  voteContainer: {
    marginVertical: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  voteTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  voteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  voteItem: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 140,
  },
  voteLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  voteInput: {
    width: 60,
    textAlign: "center",
  },
  hint: {
    fontSize: 12,
    fontStyle: "italic",
    color: Colors.light.textDim,
    marginLeft: 8,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
    marginBottom: 40,
  },
  saveButton: {
    minWidth: 120,
  },
  cancelButton: {
    minWidth: 120,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
