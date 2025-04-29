import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  ColorSchemeName,
  ScrollView,
  useWindowDimensions,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message"; // Import Toast

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Button } from "@/components/ui/Button"; // Assuming Button exists
import { useUserStore } from "@/store/userStore";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { useAdminNotificationStore } from "@/store/adminNotificationStore"; // Import the store hook
import { supabase } from "@/utils/supabase"; // Import supabase client

// Define available admin roles users can contact
// This list determines who non-admin users can initiate contact with.
// For admins using this modal, they can potentially see more roles.
const ALL_CONTACTABLE_ADMIN_ROLES = [
  { label: "Division Admin", value: "division_admin" },
  { label: "Union Support", value: "union_admin" },
  { label: "Application Support", value: "application_admin" },
  { label: "Company Admin", value: "company_admin" },
];

// Roles allowed to require acknowledgment
const ACK_REQUIRING_ROLES = ["application_admin", "union_admin", "division_admin", "company_admin"];

interface DivisionInfo {
  id: number;
  name: string;
}

interface ContactAdminModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ContactAdminModal({ visible, onClose }: ContactAdminModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme as keyof typeof Colors];
  const currentUser = useUserStore((state) => state.member); // Get basic user info
  const effectiveRoles = useEffectiveRoles() ?? [];
  const { height: windowHeight } = useWindowDimensions(); // Get window height
  // const { addMessage } = useAdminNotificationStore(); // REMOVE: Rely on realtime refetch

  // --- Determine Contactable Roles Dynamically ---
  const contactableRoles = useMemo(() => {
    const isCurrentUserCompanyAdmin = effectiveRoles.includes("company_admin" as any);
    const isCurrentUserBasicUser = currentUser?.role === "user";
    const isUserUnassociated = !currentUser; // Check if user is not yet associated with a member

    if (isCurrentUserCompanyAdmin || isCurrentUserBasicUser || isUserUnassociated) {
      // Filter out 'Company Admin' if the current user is company admin, basic user, or not associated yet
      return ALL_CONTACTABLE_ADMIN_ROLES.filter((role) => role.value !== "company_admin");
    } else {
      // Other admins can see all roles
      return ALL_CONTACTABLE_ADMIN_ROLES;
    }
  }, [effectiveRoles, currentUser]);
  // --- End Dynamic Role Filtering ---

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false); // State for the flag
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for division selection
  const [availableDivisions, setAvailableDivisions] = useState<DivisionInfo[]>([]);
  const [targetDivisionIds, setTargetDivisionIds] = useState<number[]>([]);
  const [selectAllDivisions, setSelectAllDivisions] = useState<boolean>(true); // Default to all
  const [divisionsLoading, setDivisionsLoading] = useState<boolean>(false);
  const [divisionsError, setDivisionsError] = useState<string | null>(null);

  // Check if the current user is authorized to require acknowledgment
  const canRequireAcknowledgement = effectiveRoles.some((role) => ACK_REQUIRING_ROLES.includes(role));
  const showDivisionSelector = selectedRoles.includes("division_admin");

  // Effect to fetch divisions
  useEffect(() => {
    if (showDivisionSelector && availableDivisions.length === 0) {
      async function fetchDivisions() {
        setDivisionsLoading(true);
        setDivisionsError(null);
        try {
          const { data, error } = await supabase
            .from("divisions")
            .select("id, name")
            .order("name", { ascending: true });

          if (error) throw error;
          setAvailableDivisions(data || []);
        } catch (err: any) {
          console.error("Error fetching divisions:", err);
          setDivisionsError("Could not load divisions.");
        } finally {
          setDivisionsLoading(false);
        }
      }
      fetchDivisions();
    }
  }, [showDivisionSelector]); // Fetch when selector becomes visible and divisions aren't loaded

  // Reset division selection when "Division Admin" role is deselected
  useEffect(() => {
    if (!showDivisionSelector) {
      setTargetDivisionIds([]);
      setSelectAllDivisions(true);
    }
  }, [showDivisionSelector]);

  const handleSend = async () => {
    setError(null); // Clear previous errors
    if (!currentUser || !currentUser.id) {
      setError("User information not available.");
      Toast.show({ type: "error", text1: "Error", text2: "User information not available." });
      return;
    }
    if (selectedRoles.length === 0) {
      setError("Please select at least one recipient role.");
      Toast.show({ type: "error", text1: "Input Error", text2: "Please select recipient(s)." });
      return;
    }
    if (showDivisionSelector && !selectAllDivisions && targetDivisionIds.length === 0) {
      Toast.show({
        type: "error",
        text1: "Input Error",
        text2: "Please select specific division(s) or 'All Divisions'.",
      });
      return;
    }
    if (!subject.trim()) {
      setError("Please enter a subject.");
      Toast.show({ type: "error", text1: "Input Error", text2: "Please enter a subject." });
      return;
    }
    if (!message.trim()) {
      setError("Please enter a message.");
      Toast.show({ type: "error", text1: "Input Error", text2: "Please enter a message." });
      return;
    }

    setIsSending(true);

    // Use empty array for 'all divisions' when targeting division_admin
    const rpcDivisionIds = showDivisionSelector && selectAllDivisions ? [] : targetDivisionIds;

    try {
      // Call the RPC function
      const { data: result, error: rpcError } = await supabase.rpc("create_admin_message", {
        p_recipient_roles: selectedRoles,
        p_subject: subject.trim(),
        p_message: message.trim(),
        p_requires_acknowledgment: requiresAcknowledgement,
        // Pass the number[] directly as the RPC now expects integer[]
        p_recipient_division_ids: rpcDivisionIds,
      });

      if (rpcError) {
        console.error("RPC Error sending admin message:", rpcError);
        throw new Error(rpcError.message || "Failed to send message via RPC.");
      }

      // The RPC returns the inserted row(s) in data
      if (result && result.length > 0) {
        console.log("Admin message sent successfully via RPC:", result[0].id);
        Toast.show({ type: "success", text1: "Success", text2: "Message sent successfully!" });

        // Reset form and close modal on success
        setSelectedRoles([]);
        setSubject("");
        setMessage("");
        setRequiresAcknowledgement(false); // Reset flag on success
        setTargetDivisionIds([]); // Reset divisions
        setSelectAllDivisions(true); // Reset to all
        onClose();
      } else {
        // This case might indicate an issue even without an explicit error
        console.warn("RPC call succeeded but returned no data.");
        throw new Error("Failed to send message. RPC returned no confirmation.");
      }
    } catch (err: any) {
      console.error("Error sending admin message:", err);
      const errorMessage = err.message || "An unexpected error occurred.";
      setError(errorMessage); // Keep setting local error state if needed elsewhere
      Toast.show({ type: "error", text1: "Send Error", text2: errorMessage });
    } finally {
      setIsSending(false);
    }
  };

  // Toggle specific division selection
  const handleDivisionToggle = (divisionId: number) => {
    // Auto-uncheck "All Divisions" when selecting a specific division
    setSelectAllDivisions(false);

    // Toggle the specific division
    setTargetDivisionIds((prev) =>
      prev.includes(divisionId) ? prev.filter((id) => id !== divisionId) : [...prev, divisionId]
    );
  };

  // Toggle "All Divisions"
  const handleSelectAllToggle = () => {
    const nextValue = !selectAllDivisions;
    setSelectAllDivisions(nextValue);
    if (nextValue) {
      setTargetDivisionIds([]); // Clear specific selections if "All" is chosen
    }
  };

  // Renders checkboxes for selecting recipient admin roles
  const renderRoleSelector = () => {
    return (
      <View style={styles.roleSelectorContainer}>
        <ThemedText style={styles.label}>To:</ThemedText>
        {contactableRoles.map((role) => {
          const isDivisionAdmin = role.value === "division_admin";
          const isSelected = selectedRoles.includes(role.value);

          return (
            <React.Fragment key={role.value}>
              <Pressable
                style={styles.checkboxContainer}
                onPress={() => {
                  setSelectedRoles((prev) =>
                    prev.includes(role.value) ? prev.filter((r) => r !== role.value) : [...prev, role.value]
                  );
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={role.label}
              >
                <Ionicons name={isSelected ? "checkbox" : "square-outline"} size={24} color={colors.tint} />
                <ThemedText style={styles.checkboxLabel}>{role.label}</ThemedText>
              </Pressable>

              {/* Render division selector immediately after Division Admin role if selected */}
              {isDivisionAdmin && isSelected && renderDivisionSelector()}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  // Renders the division multi-selector
  const renderDivisionSelector = () => {
    if (!showDivisionSelector) return null;

    return (
      <View style={[styles.checkboxContainer, { marginLeft: 20, marginTop: 5 }]}>
        <View style={{ width: "100%" }}>
          <ThemedText style={styles.label}>Target Division(s):</ThemedText>
          {divisionsLoading ? (
            <ActivityIndicator color={colors.tint} style={{ marginVertical: 10 }} />
          ) : divisionsError ? (
            <ThemedText style={styles.errorText}>{divisionsError}</ThemedText>
          ) : (
            <>
              {/* "All Divisions" Checkbox */}
              <Pressable
                style={styles.checkboxContainer}
                onPress={handleSelectAllToggle}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectAllDivisions }}
                accessibilityLabel="All Divisions"
              >
                <Ionicons name={selectAllDivisions ? "checkbox" : "square-outline"} size={24} color={colors.tint} />
                <ThemedText style={[styles.checkboxLabel, selectAllDivisions && styles.boldLabel]}>
                  All Divisions
                </ThemedText>
              </Pressable>

              {/* Individual Division Checkboxes */}
              {availableDivisions.map((division) => (
                <Pressable
                  key={division.id}
                  style={styles.checkboxContainer}
                  onPress={() => handleDivisionToggle(division.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: targetDivisionIds.includes(division.id) }}
                  accessibilityLabel={division.name}
                >
                  <Ionicons
                    name={targetDivisionIds.includes(division.id) ? "checkbox" : "square-outline"}
                    size={24}
                    color={colors.tint}
                  />
                  <ThemedText style={styles.checkboxLabel}>{division.name}</ThemedText>
                </Pressable>
              ))}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={styles.centeredView}>
        <ThemedView style={[styles.modalView, { backgroundColor: colors.card, maxHeight: windowHeight * 0.85 }]}>
          <View style={styles.header}>
            <ThemedText style={styles.modalTitle}>Contact Admin</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-circle" size={28} color={colors.textDim} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollViewContent}
            contentContainerStyle={styles.scrollViewContainer}
            keyboardShouldPersistTaps="handled"
          >
            {renderRoleSelector()}

            {/* Conditionally render the Acknowledgment Toggle */}
            {canRequireAcknowledgement && (
              <View style={styles.toggleContainer}>
                <ThemedText style={styles.toggleLabel}>Require Acknowledgment?</ThemedText>
                <Switch
                  trackColor={{ false: colors.border, true: colors.tint + "80" }} // Dimmer tint when true
                  thumbColor={requiresAcknowledgement ? colors.tint : colors.icon}
                  ios_backgroundColor={colors.border}
                  onValueChange={setRequiresAcknowledgement}
                  value={requiresAcknowledgement}
                />
              </View>
            )}

            <ThemedView style={styles.inputGroup}>
              <ThemedText style={styles.label}>Subject:</ThemedText>
              <ThemedTextInput
                placeholder="Enter subject"
                value={subject}
                onChangeText={setSubject}
                style={styles.textInput}
              />
            </ThemedView>

            <ThemedView style={styles.inputGroup}>
              <ThemedText style={styles.label}>Message:</ThemedText>
              <ThemedTextInput
                placeholder="Enter your message"
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                style={{ ...styles.textInput, ...styles.textArea }}
              />
            </ThemedView>
          </ScrollView>

          <View style={styles.buttonContainer}>
            <Button
              variant="secondary" // Assuming secondary variant exists
              onPress={onClose}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              onPress={handleSend}
              disabled={isSending || selectedRoles.length === 0 || !subject.trim() || !message.trim()}
            >
              Send Message
            </Button>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

// Basic styling - Adapt based on your UI library/conventions
const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)", // Dim background
  },
  modalView: {
    margin: 20,
    borderRadius: 10,
    paddingVertical: 20, // Adjusted padding
    paddingHorizontal: 25,
    alignItems: "stretch", // Stretch items horizontally
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: "90%", // Adjust width as needed
    maxWidth: 500,
    overflow: "hidden", // Ensure content outside bounds (like shadows) isn't clipped unnecessarily, but internal content scrolls.
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15, // Reduced margin
    paddingBottom: 10, // Add padding below header before scroll starts
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border, // Use theme color
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 5, // Add padding for easier pressing
  },
  scrollViewContent: {
    flexShrink: 1,
    padding: 8, // Allow scroll view to shrink if content is short
  },
  scrollViewContainer: {
    paddingBottom: 10, // Add padding at the bottom of scrollable content
  },
  inputGroup: {
    marginBottom: 15,
    backgroundColor: "transparent", // Ensure group background is transparent if modalView has color
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: "600",
  },
  textInput: {
    borderWidth: 1,
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
    borderColor: Colors.light.border, // Use theme color
    // Text color/background likely handled by ThemedTextInput
  },
  textArea: {
    minHeight: 80, // Use minHeight instead of fixed height
    height: undefined, // Allow height to grow
    textAlignVertical: "top",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 15, // Add padding above buttons
    marginTop: 10, // Add margin separation
    borderTopWidth: 1,
    borderTopColor: Colors.light.border, // Use theme color
    gap: 10,
  },
  errorText: {
    color: Colors.light.error, // Use error color from theme
    textAlign: "center",
    paddingBottom: 10, // Add padding below error before buttons
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "transparent",
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 16,
  },
  roleSelectorContainer: {
    marginBottom: 15,
    backgroundColor: "transparent",
    paddingBottom: 10, // Add padding below roles before subject
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border, // Use theme color
  },
  // Styles for the toggle
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 15, // Add margin below toggle
    paddingVertical: 10,
    paddingHorizontal: 5, // Optional padding
    backgroundColor: "transparent",
    borderTopWidth: 1, // Separator line above
    borderBottomWidth: 1, // Separator line below
    borderColor: Colors.light.border, // Use theme border color
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginRight: 10, // Space between label and switch
  },
  nestedDivisionContainer: {
    marginTop: 15,
    paddingTop: 15,
    paddingBottom: 5, // Reduce padding below last item
    borderTopWidth: 1,
    borderTopColor: Colors.light.border, // Use theme color
    backgroundColor: "transparent",
  },
  nestedLabel: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: "600",
  },
  nestedCheckboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "transparent",
  },
  boldLabel: {
    fontWeight: "bold",
  },
});
