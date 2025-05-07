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
import Toast from "react-native-toast-message";
import { supabase } from "@/utils/supabase";

interface MemberMessageModalProps {
  visible: boolean;
  onClose: () => void;
  memberPin: string;
  memberEmail: string;
  division: string;
}

export function MemberMessageModal({ visible, onClose, memberPin, memberEmail, division }: MemberMessageModalProps) {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSendMessage = async () => {
    if (!message.trim() || !division) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: "Please enter a message",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Get division ID first
      const { data: divisionData, error: divisionError } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", division)
        .single();

      if (divisionError) throw divisionError;

      if (!divisionData || !divisionData.id) {
        throw new Error(`Division "${division}" not found`);
      }

      // Get current user ID (we need to be authenticated to send messages)
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("User not authenticated");

      // Format the message content
      const formattedMessage = `Message from Member\n\nMember PIN: ${memberPin}\nEmail: ${memberEmail}\nDivision: ${division}\n\nMessage: ${message}`;

      // Insert directly into admin_messages table
      const { error: insertError } = await supabase.from("admin_messages").insert({
        sender_user_id: user.id,
        message: formattedMessage,
        recipient_division_ids: [divisionData.id],
        subject: "Member Contact Request",
        sender_role: "member",
        recipient_roles: ["division_admin"],
      });

      if (insertError) throw insertError;

      setIsSuccess(true);
      setMessage("");
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

  const handleClose = () => {
    setMessage("");
    setIsSuccess(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContainer}>
        <ThemedView style={styles.modalContent}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {!isSuccess ? (
              <>
                <ThemedText type="title" style={styles.modalTitle}>
                  Contact Division Admin
                </ThemedText>

                <ThemedText style={styles.divisionInfo}>
                  Send message to administrators of division:{" "}
                  <ThemedText style={styles.divisionName}>{division}</ThemedText>
                </ThemedText>

                <ThemedText style={styles.label}>Message:</ThemedText>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Enter your message (max 500 characters)"
                  placeholderTextColor="#666666"
                  value={message}
                  onChangeText={(text) => setMessage(text.slice(0, 500))}
                  multiline
                  numberOfLines={6}
                  maxLength={500}
                  editable={!isLoading}
                />
                <ThemedText style={styles.charCount}>{message.length}/500 characters</ThemedText>

                <ThemedView style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={handleClose}
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
                  Your message has been sent to the division administrators. They will review it and respond
                  accordingly.
                </ThemedText>
                <TouchableOpacity style={[styles.modalButton, styles.okButton]} onPress={handleClose}>
                  <ThemedText style={styles.modalButtonText}>Close</ThemedText>
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
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  scrollContent: {
    flexGrow: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  divisionInfo: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
  },
  divisionName: {
    fontWeight: "700",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  messageInput: {
    width: "100%",
    minHeight: 120,
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
    backgroundColor: Colors.dark.card,
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
    color: Colors.dark.buttonText,
  },
  cancelButton: {
    backgroundColor: Colors.dark.error,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: Colors.dark.buttonBackground,
  },
  okButton: {
    backgroundColor: Colors.dark.success,
    minWidth: 150,
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
});
