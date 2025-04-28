import React, { useState } from "react";
import {
  View,
  Modal,
  StyleSheet,
  Pressable,
  ColorSchemeName,
  ScrollView,
  useWindowDimensions,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message"; // Import Toast

import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedTextInput } from "@/components/ThemedTextInput";
import { Button } from "@/components/ui/Button"; // Assuming Button exists
import { useUserStore } from "@/store/userStore";
import { sendAdminMessage } from "@/utils/notificationService"; // Import the service function
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useEffectiveRoles } from "@/hooks/useEffectiveRoles";
import { useAdminNotificationStore } from "@/store/adminNotificationStore"; // Import the store hook

// Define available admin roles users can contact
// This list determines who non-admin users can initiate contact with.
// For admins using this modal, they can potentially see more roles.
// TODO: Potentially pass available roles as a prop if they differ contextually.
const CONTACTABLE_ADMIN_ROLES = [
  { label: "Division Admin", value: "division_admin" },
  { label: "Union Support", value: "union_admin" },
  { label: "Application Support", value: "application_admin" },
  { label: "Company Admin", value: "company_admin" },
];

// Roles allowed to require acknowledgment
const ACK_REQUIRING_ROLES = ["application_admin", "union_admin", "division_admin", "company_admin"];

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
  const { addMessage } = useAdminNotificationStore(); // Destructure addMessage action

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false); // State for the flag
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if the current user is authorized to require acknowledgment
  const canRequireAcknowledgement = effectiveRoles.some((role) => ACK_REQUIRING_ROLES.includes(role));

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

    try {
      // Call sendAdminMessage - sender role is determined internally by the service
      const result = await sendAdminMessage(
        currentUser.id,
        selectedRoles,
        subject,
        message,
        requiresAcknowledgement // Pass the flag state
      );

      if (result) {
        console.log("Admin message sent successfully:", result.id);
        Toast.show({ type: "success", text1: "Success", text2: "Message sent successfully!" });

        // Optimistic Update: Add the new message to the store
        addMessage(result);

        // Reset form and close modal on success
        setSelectedRoles([]);
        setSubject("");
        setMessage("");
        setRequiresAcknowledgement(false); // Reset flag on success
        onClose();
      } else {
        // Throw error if service returns null without throwing
        throw new Error("Failed to send message. Service returned null.");
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

  // Renders checkboxes for selecting recipient admin roles
  const renderRoleSelector = () => {
    return (
      <View style={styles.roleSelectorContainer}>
        <ThemedText style={styles.label}>To:</ThemedText>
        {CONTACTABLE_ADMIN_ROLES.map((role) => (
          <Pressable
            key={role.value}
            style={styles.checkboxContainer}
            onPress={() => {
              setSelectedRoles((prev) =>
                prev.includes(role.value) ? prev.filter((r) => r !== role.value) : [...prev, role.value]
              );
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedRoles.includes(role.value) }}
            accessibilityLabel={role.label}
          >
            <Ionicons
              name={selectedRoles.includes(role.value) ? "checkbox" : "square-outline"}
              size={24}
              color={colors.tint}
            />
            <ThemedText style={styles.checkboxLabel}>{role.label}</ThemedText>
          </Pressable>
        ))}
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
    flexShrink: 1, // Allow scroll view to shrink if content is short
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
});
