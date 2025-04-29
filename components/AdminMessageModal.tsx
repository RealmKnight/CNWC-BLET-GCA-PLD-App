import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { Picker } from "@react-native-picker/picker";
import Toast from "react-native-toast-message";
import { sendMessageWithNotification } from "@/utils/notificationService";
import { supabase } from "@/utils/supabase";
import { Redirect } from "expo-router";

interface AdminMessageModalProps {
  visible: boolean;
  onClose: () => void;
  pinNumber: string;
  userEmail: string;
}

export function AdminMessageModal({ visible, onClose, pinNumber, userEmail }: AdminMessageModalProps) {
  const [message, setMessage] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [divisions, setDivisions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Fetch divisions on mount
  React.useEffect(() => {
    async function fetchDivisions() {
      const { data, error } = await supabase
        .from("members")
        .select("division")
        .not("division", "is", null)
        .order("division");

      if (!error && data) {
        // Get unique divisions
        const uniqueDivisions = [...new Set(data.map((m) => m.division))];
        setDivisions(uniqueDivisions);
        if (uniqueDivisions.length > 0) {
          setSelectedDivision(uniqueDivisions[0]);
        }
      }
    }

    fetchDivisions();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setShouldRedirect(true);
    } catch (error) {
      console.error("Error signing out:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to sign out. Please try again.",
      });
    }
  };

  // Check if we should redirect after logout
  if (shouldRedirect) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedDivision) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please fill in all fields",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Get all admin users for the selected division
      const { data: adminData, error: adminError } = await supabase
        .from("user_roles")
        .select("members!inner(pin_number)")
        .eq("role", "division_admin")
        .eq("members.division", selectedDivision);

      if (adminError) throw adminError;

      if (!adminData || adminData.length === 0) {
        throw new Error("No admins found for this division");
      }

      // Extract pin numbers
      const adminPinNumbers: number[] = [];
      for (const admin of adminData) {
        // Access nested data safely
        // @ts-ignore - Type is complex and not needed to be defined here
        const adminPin = admin.members?.pin_number;
        if (adminPin) {
          adminPinNumbers.push(parseInt(adminPin));
        }
      }

      // Prepare the message content with user details
      const fullMessage = `User Association Request\n\nEmail: ${userEmail}\nPIN Attempted: ${pinNumber}\nDivision: ${selectedDivision}\n\nMessage: ${message}`;

      // Send the message to all division admins
      await sendMessageWithNotification(
        parseInt(pinNumber),
        adminPinNumbers,
        "Member Association Request",
        fullMessage,
        true,
        "admin_message"
      );

      setIsSuccess(true);
      Toast.show({
        type: "success",
        text1: "Success",
        text2: "Message sent to division administrators",
      });
    } catch (error) {
      console.error("Error sending admin message:", error);
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Failed to send message. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderDivisionSelector = () => {
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedDivision}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDivision(e.target.value)}
          style={styles.webSelect}
        >
          {divisions.map((division) => (
            <option key={division} value={division}>
              {division}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Picker
        selectedValue={selectedDivision}
        onValueChange={(value: string) => setSelectedDivision(value)}
        style={styles.picker}
      >
        {divisions.map((division) => (
          <Picker.Item key={division} label={division} value={division} />
        ))}
      </Picker>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
        <ThemedView style={styles.modalContent}>
          <ScrollView>
            {!isSuccess ? (
              <>
                <ThemedText type="title" style={styles.modalTitle}>
                  Contact Division Admin
                </ThemedText>

                <ThemedText style={styles.label}>Select Division:</ThemedText>
                {renderDivisionSelector()}

                <ThemedText style={styles.label}>Message:</ThemedText>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Enter your message (max 120 characters)"
                  placeholderTextColor="#666666"
                  value={message}
                  onChangeText={(text) => setMessage(text.slice(0, 120))}
                  multiline
                  numberOfLines={4}
                  maxLength={120}
                  editable={!isLoading}
                />
                <ThemedText style={styles.charCount}>{message.length}/120 characters</ThemedText>

                <ThemedView style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={onClose}
                    disabled={isLoading}
                  >
                    <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.sendButton, isLoading && styles.buttonDisabled]}
                    onPress={handleSendMessage}
                    disabled={isLoading}
                  >
                    <ThemedText style={styles.modalButtonText}>{isLoading ? "Sending..." : "Send Message"}</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </>
            ) : (
              <ThemedView style={styles.successContainer}>
                <ThemedText type="title" style={styles.successTitle}>
                  Message Sent Successfully
                </ThemedText>
                <ThemedText style={styles.successText}>
                  Your message has been sent to the division administrators. Please log out and check back later after
                  they have contacted you outside the app.
                </ThemedText>
                <TouchableOpacity style={[styles.modalButton, styles.logoutButton]} onPress={handleLogout}>
                  <ThemedText style={styles.modalButtonText}>Log Out</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </ScrollView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: Platform.OS === "web" ? "50%" : "90%",
    maxWidth: 500,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  picker: {
    width: "100%",
    backgroundColor: Colors.dark.background,
    marginBottom: 15,
    color: Colors.dark.text,
  },
  webSelect: {
    width: "100%",
    height: 40,
    backgroundColor: Colors.dark.background,
    marginBottom: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 4,
    padding: 8,
  },
  messageInput: {
    width: "100%",
    height: 100,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
    textAlignVertical: "top",
  },
  charCount: {
    alignSelf: "flex-end",
    fontSize: 12,
    marginBottom: 15,
    color: Colors.dark.secondary,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: Colors.dark.error,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: Colors.dark.success,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  successContainer: {
    padding: 20,
    alignItems: "center",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  successText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  logoutButton: {
    backgroundColor: Colors.dark.buttonBackground,
    marginTop: 10,
  },
});
