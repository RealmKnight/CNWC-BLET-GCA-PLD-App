import React from "react";
import { StyleSheet, TouchableOpacity, Modal, Dimensions } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

interface VerificationRevertWarningModalProps {
  visible: boolean;
  onClose: () => void;
  onRevert: () => void;
  onKeepTrying: () => void;
  previousPreference: string;
  phoneNumber: string;
}

export function VerificationRevertWarningModal({
  visible,
  onClose,
  onRevert,
  onKeepTrying,
  previousPreference,
  phoneNumber,
}: VerificationRevertWarningModalProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  // Responsive calculations
  const isSmallScreen = screenWidth < 400 || screenHeight < 700;
  const isTablet = screenWidth > 768;
  const modalWidth = isTablet ? 450 : screenWidth * 0.9;

  const formatPreference = (pref: string) => {
    switch (pref) {
      case "in_app":
        return "In-App Only";
      case "email":
        return "Email";
      case "push":
        return "Push Notifications";
      default:
        return "In-App Only";
    }
  };

  const formatPhoneForDisplay = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ThemedView style={styles.overlay}>
        <ThemedView style={[styles.modalContainer, { width: modalWidth }]}>
          {/* Header */}
          <ThemedView style={styles.header}>
            <Ionicons name="warning" size={isSmallScreen ? 36 : 48} color={colors.warning} />
            <ThemedText type="title" style={[styles.title, isSmallScreen && styles.titleSmall]}>
              Verification Not Complete
            </ThemedText>
            <ThemedText style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              Your phone number verification was not completed
            </ThemedText>
          </ThemedView>

          {/* Content */}
          <ThemedView style={styles.content}>
            <ThemedView style={styles.messageContainer}>
              <ThemedText style={[styles.messageText, isSmallScreen && styles.messageTextSmall]}>
                Since your phone number {formatPhoneForDisplay(phoneNumber)} is not verified, you won't receive text
                message notifications.
              </ThemedText>

              <ThemedText
                style={[styles.messageText, styles.messageTextBold, isSmallScreen && styles.messageTextSmall]}
              >
                What would you like to do?
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.optionsContainer}>
              <ThemedView style={styles.option}>
                <Ionicons name="chevron-forward" size={16} color={colors.text} />
                <ThemedText style={[styles.optionText, isSmallScreen && styles.optionTextSmall]}>
                  Keep "Text Message" preference and try verification later
                </ThemedText>
              </ThemedView>

              <ThemedView style={styles.option}>
                <Ionicons name="chevron-forward" size={16} color={colors.text} />
                <ThemedText style={[styles.optionText, isSmallScreen && styles.optionTextSmall]}>
                  Revert to "{formatPreference(previousPreference)}" notifications
                </ThemedText>
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.warningBox}>
              <Ionicons name="information-circle" size={16} color={colors.tint} />
              <ThemedText style={[styles.warningText, isSmallScreen && styles.warningTextSmall]}>
                Text message notifications will be blocked until your phone number is verified
              </ThemedText>
            </ThemedView>
          </ThemedView>

          {/* Action Buttons */}
          <ThemedView style={[styles.buttonContainer, isSmallScreen && styles.buttonContainerSmall]}>
            <ThemedTouchableOpacity
              onPress={onKeepTrying}
              style={[styles.button, styles.primaryButton, isSmallScreen && styles.buttonSmall]}
            >
              <ThemedText style={styles.primaryButtonText}>Keep Text Message</ThemedText>
            </ThemedTouchableOpacity>

            <ThemedTouchableOpacity
              onPress={onRevert}
              style={[styles.button, styles.secondaryButton, isSmallScreen && styles.buttonSmall]}
            >
              <ThemedText style={styles.secondaryButtonText}>
                Revert to {formatPreference(previousPreference)}
              </ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  modalContainer: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    elevation: 5,
    boxShadow: "0 0 15px 0 rgba(0, 0, 0, 0.3)",
    maxWidth: 500,
  },
  header: {
    alignItems: "center",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  titleSmall: {
    fontSize: 18,
    marginTop: 8,
    marginBottom: 6,
  },
  subtitle: {
    textAlign: "center",
    opacity: 0.8,
    lineHeight: 20,
  },
  subtitleSmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    padding: 20,
  },
  messageContainer: {
    marginBottom: 20,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    opacity: 0.9,
  },
  messageTextSmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  messageTextBold: {
    fontWeight: "600",
    opacity: 1,
  },
  optionsContainer: {
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    paddingLeft: 4,
  },
  optionText: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 8,
    flex: 1,
    opacity: 0.8,
  },
  optionTextSmall: {
    fontSize: 12,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dark.tint + "30",
  },
  warningText: {
    fontSize: 12,
    lineHeight: 16,
    marginLeft: 8,
    flex: 1,
    color: Colors.dark.tint,
    fontWeight: "500",
  },
  warningTextSmall: {
    fontSize: 11,
    lineHeight: 15,
  },
  buttonContainer: {
    gap: 8,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  buttonContainerSmall: {
    padding: 16,
    gap: 6,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: {
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: Colors.dark.buttonBackground,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  secondaryButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorderSecondary,
  },
  primaryButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: Colors.dark.buttonTextSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
});
