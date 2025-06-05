import React, { useState, useMemo } from "react";
import {
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { ThemedView } from "./ThemedView";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import Toast from "react-native-toast-message";
import { supabase } from "@/utils/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Calculate responsive dimensions
  const isSmallScreen = windowWidth < 380;
  const isMobileWeb = Platform.OS === "web" && windowWidth < 768;

  // Ensure modal is at least 90% width on mobile web, 92% on mobile OS, max 500px on larger screens
  const modalWidth = useMemo(() => {
    if (isMobileWeb) {
      // Mobile web - at least 90% of viewport
      return windowWidth * 0.9;
    } else if (windowWidth < 700) {
      // Mobile OS or smaller screens - 92% of viewport
      return windowWidth * 0.92;
    } else {
      // Larger screens - fixed width
      return 500;
    }
  }, [windowWidth, isMobileWeb]);

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
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
      statusBarTranslucent={Platform.OS !== "web"}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.modalContainer, isMobileWeb && { paddingHorizontal: 0 }]}
        keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
      >
        <ThemedView
          style={[
            styles.modalContent,
            {
              width: modalWidth,
              maxHeight: windowHeight * 0.9,
              marginTop: insets.top > 0 ? insets.top : 20,
              marginBottom: insets.bottom > 0 ? insets.bottom : 20,
            },
            isMobileWeb && {
              maxWidth: "90%",
              minWidth: Math.min(windowWidth * 0.9, 500),
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
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
                  numberOfLines={Platform.OS === "web" ? 6 : 8}
                  maxLength={500}
                  editable={!isLoading}
                  textAlignVertical="top"
                />
                <ThemedText style={styles.charCount}>{message.length}/500 characters</ThemedText>

                <View
                  style={[styles.modalButtons, isSmallScreen && Platform.OS === "web" && styles.modalButtonsColumn]}
                >
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.cancelButton,
                      isSmallScreen && Platform.OS === "web" && styles.fullWidthButton,
                    ]}
                    onPress={handleClose}
                    disabled={isLoading}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  >
                    <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.sendButton,
                      isLoading && styles.buttonDisabled,
                      isSmallScreen && Platform.OS === "web" && styles.fullWidthButton,
                    ]}
                    onPress={handleSendMessage}
                    disabled={isLoading}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  >
                    <ThemedText style={styles.modalButtonText}>{isLoading ? "Sending..." : "Send Message"}</ThemedText>
                  </TouchableOpacity>
                </View>
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
                <TouchableOpacity
                  style={[styles.modalButton, styles.okButton]}
                  onPress={handleClose}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
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
    maxWidth: 500,
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
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
  modalButtonsColumn: {
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "stretch",
    gap: 10,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    minHeight: 48,
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
  fullWidthButton: {
    width: "100%",
    marginRight: 0,
    marginBottom: 10,
  },
});
