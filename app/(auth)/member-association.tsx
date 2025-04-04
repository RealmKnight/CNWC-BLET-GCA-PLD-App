import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Modal } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useRouter } from "expo-router";
import { supabase } from "@/utils/supabase";
import { Colors } from "@/constants/Colors";

interface ValidationError {
  message: string;
  requiresAdminContact: boolean;
}

export default function MemberAssociationScreen() {
  const [pinNumber, setPinNumber] = useState("");
  const [error, setError] = useState<ValidationError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [message, setMessage] = useState("");
  const { associateMember, user } = useAuth();
  const router = useRouter();

  const handleAssociate = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await associateMember(pinNumber);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      // These specific error messages should match the ones from our validate_member_association function
      const requiresAdminContact = ["Member is not active", "Member is already associated with another user"].includes(
        errorMessage
      );

      setError({
        message: errorMessage,
        requiresAdminContact,
      });

      if (requiresAdminContact) {
        setShowMessageModal(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    try {
      setIsLoading(true);

      const { data: result, error } = await supabase.rpc("send_admin_message", {
        p_user_id: user?.id,
        p_pin_number: pinNumber,
        p_message: message,
      });

      if (error) throw error;
      if (!result?.[0]?.success) {
        throw new Error(result?.[0]?.message || "Failed to send message");
      }

      setShowMessageModal(false);
      setError({
        message: "Message sent to division admin. They will contact you soon.",
        requiresAdminContact: false,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setError({
        message: errorMessage,
        requiresAdminContact: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Associate Member</ThemedText>
        <ThemedText type="subtitle">
          Please enter your member PIN number to associate your account with your member profile
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="PIN Number"
          placeholderTextColor="#666666"
          value={pinNumber}
          onChangeText={setPinNumber}
          keyboardType="numeric"
          maxLength={6}
          editable={!isLoading}
        />

        {error && (
          <ThemedText style={[styles.error, !error.requiresAdminContact && styles.success]}>{error.message}</ThemedText>
        )}

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleAssociate}
          disabled={isLoading}
        >
          <ThemedText style={styles.buttonText}>{isLoading ? "Associating..." : "Associate Member"}</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <Modal
        visible={showMessageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMessageModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <ThemedView style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>
              Contact Division Admin
            </ThemedText>
            <ThemedText style={styles.modalText}>Please provide details about your situation:</ThemedText>
            <TextInput
              style={styles.messageInput}
              placeholder="Enter your message"
              placeholderTextColor="#666666"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              editable={!isLoading}
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowMessageModal(false)}
                disabled={isLoading}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.sendButton]}
                onPress={handleSendMessage}
                disabled={isLoading}
              >
                <ThemedText style={styles.modalButtonText}>{isLoading ? "Sending..." : "Send Message"}</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  header: {
    marginBottom: 40,
    alignItems: "center",
  },
  form: {
    width: "100%",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: Colors.dark.card,
    color: Colors.dark.text,
  },
  button: {
    backgroundColor: Colors.dark.buttonBackground,
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: 10,
  },
  success: {
    color: Colors.dark.success,
  },
  logo: {
    width: 130,
    height: 163,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "90%",
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
    marginBottom: 15,
    color: Colors.dark.text,
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center",
    color: Colors.dark.text,
  },
  messageInput: {
    width: "100%",
    height: 100,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    textAlignVertical: "top",
    backgroundColor: Colors.dark.background,
    color: Colors.dark.text,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: Colors.dark.error,
  },
  sendButton: {
    backgroundColor: Colors.dark.success,
  },
  modalButtonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: "600",
  },
});
