import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { Input } from "./Input";
import { Checkbox } from "./Checkbox";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

interface SmsOptInModalProps {
  visible: boolean;
  onClose: () => void;
  onOptIn: (phoneNumber: string) => Promise<void>;
  currentPhoneNumber?: string;
}

export function SmsOptInModal({ visible, onClose, onOptIn, currentPhoneNumber = "" }: SmsOptInModalProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  // Format initial phone number for US display
  const formatInitialPhone = (phone: string) => {
    if (!phone) return "";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const [phoneNumber, setPhoneNumber] = useState(formatInitialPhone(currentPhoneNumber));

  // Sync the local phoneNumber state whenever the prop changes or when the modal is reopened.
  useEffect(() => {
    if (visible) {
      setPhoneNumber(formatInitialPhone(currentPhoneNumber));
    }
  }, [currentPhoneNumber, visible]);

  const [agreeToSms, setAgreeToSms] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Responsive calculations
  const isSmallScreen = screenWidth < 400 || screenHeight < 700;
  const isTablet = screenWidth > 768;
  const modalWidth = isTablet ? 500 : screenWidth * 0.95;
  const maxModalHeight = screenHeight * 0.95;

  const formatPhoneForDisplay = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, "");

    // Limit to 10 digits for US numbers
    const limited = cleaned.slice(0, 10);

    // Format as (XXX) XXX-XXXX
    if (limited.length >= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    } else if (limited.length >= 3) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else if (limited.length > 0) {
      return `(${limited}`;
    }
    return "";
  };

  const formatPhoneForSubmission = (phone: string) => {
    // Remove all non-numeric characters and add US country code
    const cleaned = phone.replace(/\D/g, "");
    return `+1${cleaned}`;
  };

  const validatePhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length === 10;
  };

  const handlePhoneNumberChange = (text: string) => {
    const formatted = formatPhoneForDisplay(text);
    setPhoneNumber(formatted);
  };

  const handleSubmit = async () => {
    if (!validatePhoneNumber(phoneNumber)) {
      Alert.alert("Invalid Phone Number", "Please enter a valid 10-digit US phone number.");
      return;
    }

    if (!agreeToSms) {
      Alert.alert("SMS Agreement Required", "You must agree to receive SMS notifications to continue.");
      return;
    }

    if (!acceptTerms) {
      Alert.alert("Terms Required", "You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const formattedPhone = formatPhoneForSubmission(phoneNumber);
      await onOptIn(formattedPhone);
      // Don't call onClose() here - let the parent component handle modal transitions
    } catch (error) {
      console.error("Error opting in to SMS:", error);
      Alert.alert("Error", "Failed to enable SMS notifications. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPrivacyPolicy = () => {
    Linking.openURL("https://bletcnwcgca.org/privacy");
  };

  const openTermsOfService = () => {
    Linking.openURL("https://bletcnwcgca.org/terms");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <ThemedView style={[styles.modalContainer, { width: modalWidth, maxHeight: maxModalHeight }]}>
          {/* Header */}
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="phone-portrait" size={isSmallScreen ? 36 : 48} color={colors.tint} />
            <ThemedText type="title" style={[styles.title, isSmallScreen && styles.titleSmall]}>
              Enable SMS Notifications
            </ThemedText>
            <ThemedText style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              Stay updated with important union notifications via text message
            </ThemedText>
          </ThemedView>

          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            bounces={false}
          >
            {/* Phone Number Input */}
            <ThemedView style={styles.section}>
              <ThemedText style={[styles.label, isSmallScreen && styles.labelSmall]}>
                US Phone Number <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <ThemedView style={styles.phoneInputContainer}>
                <ThemedText style={styles.countryCode}>+1</ThemedText>
                <Input
                  value={phoneNumber}
                  onChangeText={handlePhoneNumberChange}
                  placeholder="(555) 123-4567"
                  keyboardType="phone-pad"
                  style={[styles.phoneInput, isSmallScreen && styles.phoneInputSmall]}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                />
              </ThemedView>
              <ThemedText style={[styles.inputHint, isSmallScreen && styles.inputHintSmall]}>
                Enter your 10-digit US mobile phone number
              </ThemedText>
            </ThemedView>

            {/* SMS Agreement Checkbox */}
            <ThemedView style={styles.section}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAgreeToSms(!agreeToSms)}
                activeOpacity={0.7}
              >
                <Checkbox checked={agreeToSms} onCheckedChange={setAgreeToSms} />
                <ThemedText style={[styles.checkboxText, isSmallScreen && styles.checkboxTextSmall]}>
                  <ThemedText style={styles.required}>* </ThemedText>I agree to receive transactional/informational SMS
                  messages at the phone number provided above from{" "}
                  <ThemedText style={styles.businessName}>
                    Brotherhood of Locomotive Engineers and Trainmen (BLET) CN/WC GCA
                  </ThemedText>
                  . Message and data rates may apply. Reply STOP to opt-out.
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>

            {/* Terms and Privacy Checkbox */}
            <ThemedView style={styles.section}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAcceptTerms(!acceptTerms)}
                activeOpacity={0.7}
              >
                <Checkbox checked={acceptTerms} onCheckedChange={setAcceptTerms} />
                <ThemedText style={[styles.checkboxText, isSmallScreen && styles.checkboxTextSmall]}>
                  <ThemedText style={styles.required}>* </ThemedText>I accept the{" "}
                  <TouchableOpacity onPress={openTermsOfService}>
                    <ThemedText style={styles.link}>Terms of Service</ThemedText>
                  </TouchableOpacity>
                  {" & "}
                  <TouchableOpacity onPress={openPrivacyPolicy}>
                    <ThemedText style={styles.link}>Privacy Policy</ThemedText>
                  </TouchableOpacity>
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>

            {/* SMS Information */}
            <ThemedView style={[styles.section, styles.infoSection]}>
              <ThemedView style={styles.infoHeader}>
                <Ionicons name="information-circle" size={20} color={colors.tint} />
                <ThemedText style={[styles.infoTitle, isSmallScreen && styles.infoTitleSmall]}>
                  SMS Information
                </ThemedText>
              </ThemedView>
              <ThemedText style={[styles.infoText, isSmallScreen && styles.infoTextSmall]}>
                By providing your phone number you agree to receive informational text messages from{" "}
                <ThemedText style={styles.businessName}>BLET CN/WC GCA</ThemedText>. Consent is not a condition of
                purchase.
              </ThemedText>
              <ThemedText style={[styles.infoText, isSmallScreen && styles.infoTextSmall]}>
                Message frequency will vary. Message & data rates may apply. Reply HELP for help or STOP to cancel.
              </ThemedText>
              <ThemedText style={[styles.infoText, isSmallScreen && styles.infoTextSmall]}>
                You will receive notifications about:
              </ThemedText>
              <ThemedView style={styles.bulletList}>
                <ThemedText style={[styles.bulletItem, isSmallScreen && styles.bulletItemSmall]}>
                  • PLD and SDV request status updates
                </ThemedText>
                <ThemedText style={[styles.bulletItem, isSmallScreen && styles.bulletItemSmall]}>
                  • Meeting reminders and schedule changes
                </ThemedText>
                <ThemedText style={[styles.bulletItem, isSmallScreen && styles.bulletItemSmall]}>
                  • Important union communications
                </ThemedText>
                <ThemedText style={[styles.bulletItem, isSmallScreen && styles.bulletItemSmall]}>
                  • Administrative messages and alerts
                </ThemedText>
              </ThemedView>
            </ThemedView>
          </ScrollView>

          {/* Action Buttons - Fixed at bottom */}
          <ThemedView style={[styles.buttonContainer, isSmallScreen && styles.buttonContainerSmall]}>
            <ThemedTouchableOpacity
              onPress={onClose}
              style={[styles.button, styles.cancelButton, isSmallScreen && styles.buttonSmall]}
              disabled={isSubmitting}
            >
              <ThemedText style={styles.cancelButtonText}>Skip</ThemedText>
            </ThemedTouchableOpacity>
            <ThemedTouchableOpacity
              onPress={handleSubmit}
              style={[
                styles.button,
                styles.continueButton,
                isSmallScreen && styles.buttonSmall,
                (!agreeToSms || !acceptTerms || !validatePhoneNumber(phoneNumber) || isSubmitting) &&
                  styles.buttonDisabled,
              ]}
              disabled={!agreeToSms || !acceptTerms || !validatePhoneNumber(phoneNumber) || isSubmitting}
            >
              <ThemedText style={styles.continueButtonText}>{isSubmitting ? "Enabling..." : "Continue"}</ThemedText>
            </ThemedTouchableOpacity>
          </ThemedView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: "hidden",
    elevation: 5,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.5)",
  },
  header: {
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 8,
    zIndex: 1,
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
    paddingHorizontal: 16,
  },
  subtitleSmall: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 0,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  labelSmall: {
    fontSize: 14,
  },
  required: {
    color: "#ff4d4d",
    fontWeight: "bold",
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    backgroundColor: Colors.dark.card,
  },
  countryCode: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.tint,
    borderRightWidth: 1,
    borderRightColor: Colors.dark.border,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  phoneInputSmall: {
    fontSize: 14,
  },
  inputHint: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
  inputHintSmall: {
    fontSize: 11,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  checkboxText: {
    flex: 1,
    marginLeft: 12,
    lineHeight: 20,
    fontSize: 14,
  },
  checkboxTextSmall: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 10,
  },
  businessName: {
    fontWeight: "600",
    color: Colors.dark.tint,
  },
  link: {
    color: Colors.dark.tint,
    textDecorationLine: "underline",
    fontWeight: "500",
  },
  infoSection: {
    backgroundColor: Colors.dark.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  infoTitleSmall: {
    fontSize: 14,
  },
  infoText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    opacity: 0.9,
  },
  infoTextSmall: {
    fontSize: 11,
    lineHeight: 16,
  },
  bulletList: {
    marginTop: 4,
    marginLeft: 8,
  },
  bulletItem: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
    opacity: 0.8,
  },
  bulletItemSmall: {
    fontSize: 11,
    lineHeight: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  buttonContainerSmall: {
    padding: 16,
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSmall: {
    paddingVertical: 12,
  },
  cancelButton: {
    backgroundColor: Colors.dark.buttonBackgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorderSecondary,
    opacity: 0.8,
  },
  continueButton: {
    backgroundColor: Colors.dark.buttonBackground,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  cancelButtonText: {
    color: Colors.dark.buttonTextSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  continueButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
