import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ThemedTouchableOpacity } from "@/components/ThemedTouchableOpacity";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";
import { formatPhoneForDisplay } from "@/utils/phoneValidation";

interface OtpVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  phoneNumber: string;
  isLoading?: boolean;
  error?: string | null;
}

export function OtpVerificationModal({
  visible,
  onClose,
  onVerify,
  onResend,
  phoneNumber,
  isLoading = false,
  error = null,
}: OtpVerificationModalProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  const [otpCode, setOtpCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes in seconds
  const [canResend, setCanResend] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const otpInputRef = useRef<TextInput>(null);

  // Responsive calculations
  const isSmallScreen = screenWidth < 400 || screenHeight < 700;
  const isTablet = screenWidth > 768;
  const modalWidth = isTablet ? 400 : screenWidth * 0.9;

  // Format time left as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer effect
  useEffect(() => {
    if (visible && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, timeLeft]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setOtpCode("");
      setTimeLeft(120);
      setCanResend(false);
      setIsVerifying(false);
      setIsResending(false);
      // Focus input after a short delay
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
    }
  }, [visible]);

  const handleOtpChange = (text: string) => {
    // Only allow numeric input, max 6 digits
    const cleaned = text.replace(/\D/g, "").slice(0, 6);
    setOtpCode(cleaned);
  };

  const handleVerify = async () => {
    if (otpCode.length !== 6 || isVerifying) return;

    setIsVerifying(true);
    try {
      await onVerify(otpCode);
    } catch (error) {
      console.error("OTP verification failed:", error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || isResending) return;

    setIsResending(true);
    try {
      await onResend();
      setTimeLeft(120);
      setCanResend(false);
      setOtpCode("");
      otpInputRef.current?.focus();
    } catch (error) {
      console.error("OTP resend failed:", error);
    } finally {
      setIsResending(false);
    }
  };

  const canVerify = otpCode.length === 6 && !isVerifying && !isLoading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.overlay}>
        <ThemedView style={[styles.modalContainer, { width: modalWidth }]}>
          {/* Header */}
          <ThemedView style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Ionicons name="shield-checkmark" size={isSmallScreen ? 36 : 48} color={colors.tint} />
            <ThemedText type="title" style={[styles.title, isSmallScreen && styles.titleSmall]}>
              Enter Verification Code
            </ThemedText>
            <ThemedText style={[styles.subtitle, isSmallScreen && styles.subtitleSmall]}>
              We sent a 6-digit code to{"\n"}
              {formatPhoneForDisplay(phoneNumber)}
            </ThemedText>
          </ThemedView>

          {/* OTP Input */}
          <ThemedView style={styles.content}>
            <ThemedView style={styles.otpContainer}>
              <TextInput
                ref={otpInputRef}
                value={otpCode}
                onChangeText={handleOtpChange}
                placeholder="000000"
                placeholderTextColor={colors.textDim}
                style={[
                  styles.otpInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.card,
                    borderColor: error ? colors.error : colors.border,
                  },
                  isSmallScreen && styles.otpInputSmall,
                ]}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                editable={!isVerifying && !isLoading}
                selectTextOnFocus
              />
            </ThemedView>

            {/* Error Message */}
            {error && (
              <ThemedView style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <ThemedText style={[styles.errorText, { color: colors.error }]}>{error}</ThemedText>
              </ThemedView>
            )}

            {/* Timer and Resend */}
            <ThemedView style={styles.timerContainer}>
              {!canResend ? (
                <ThemedText style={styles.timerText}>Code expires in {formatTime(timeLeft)}</ThemedText>
              ) : (
                <TouchableOpacity onPress={handleResend} disabled={isResending} style={styles.resendButton}>
                  {isResending ? (
                    <ActivityIndicator size="small" color={colors.tint} />
                  ) : (
                    <ThemedText style={[styles.resendText, { color: colors.tint }]}>Resend Code</ThemedText>
                  )}
                </TouchableOpacity>
              )}
            </ThemedView>

            {/* Helper Text */}
            <ThemedView style={styles.helperContainer}>
              <ThemedText style={[styles.helperText, isSmallScreen && styles.helperTextSmall]}>
                Enter the 6-digit code we just sent to your phone. If you don't see it, check your message inbox.
              </ThemedText>
            </ThemedView>
          </ThemedView>

          {/* Action Buttons */}
          <ThemedView style={[styles.buttonContainer, isSmallScreen && styles.buttonContainerSmall]}>
            <ThemedTouchableOpacity
              onPress={onClose}
              style={[styles.button, styles.cancelButton, isSmallScreen && styles.buttonSmall]}
              disabled={isVerifying || isLoading}
            >
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </ThemedTouchableOpacity>
            <ThemedTouchableOpacity
              onPress={handleVerify}
              style={[
                styles.button,
                styles.verifyButton,
                isSmallScreen && styles.buttonSmall,
                (!canVerify || isLoading) && styles.buttonDisabled,
              ]}
              disabled={!canVerify || isLoading}
            >
              {isVerifying || isLoading ? (
                <ActivityIndicator size="small" color={colors.buttonText} />
              ) : (
                <ThemedText style={styles.verifyButtonText}>Verify</ThemedText>
              )}
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
    maxWidth: 400,
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
  },
  subtitleSmall: {
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    padding: 20,
  },
  otpContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  otpInput: {
    width: 200,
    height: 60,
    borderWidth: 2,
    borderRadius: 12,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  otpInputSmall: {
    width: 180,
    height: 50,
    fontSize: 20,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 14,
    marginLeft: 8,
    textAlign: "center",
    flex: 1,
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  timerText: {
    fontSize: 14,
    opacity: 0.7,
  },
  resendButton: {
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  helperContainer: {
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: "center",
    lineHeight: 16,
  },
  helperTextSmall: {
    fontSize: 11,
    lineHeight: 15,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
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
  },
  verifyButton: {
    backgroundColor: Colors.dark.buttonBackground,
    borderWidth: 1,
    borderColor: Colors.dark.buttonBorder,
  },
  cancelButtonText: {
    color: Colors.dark.buttonTextSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  verifyButtonText: {
    color: Colors.dark.buttonText,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
