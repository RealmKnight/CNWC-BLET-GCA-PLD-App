import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase";
import { sendPasswordResetEmail } from "@/utils/notificationService";
import TurnstileCaptcha, { TurnstileCaptchaRef } from "@/components/ui/TurnstileCaptcha";
import { useAuth } from "@/hooks/useAuth";
import { useWebInputEnhancements } from "@/hooks/useWebInputEnhancements";

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper function to detect iOS Safari
const isIOSSafari = () => {
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|FxiOS/.test(userAgent);

  return isIOS && isSafari;
};

// Enhanced error message mapping
const getEnhancedErrorMessage = (error: any, isIOSSafari: boolean): string => {
  const errorMessage = error?.message || error?.toString() || "";

  // Rate limiting error
  if (errorMessage.includes("For security purposes, you can only request this after")) {
    const remainingTime = errorMessage.match(/after (\d+) seconds?/);
    if (remainingTime && remainingTime[1]) {
      return `Rate limit reached. Please wait ${remainingTime[1]} seconds before requesting another reset link.`;
    }
    return "Rate limit reached. Please wait before requesting another reset link.";
  }

  // Email not found (but don't reveal this for security)
  if (errorMessage.includes("Unable to validate email address") || errorMessage.includes("Invalid email")) {
    return "If an account exists with this email, we'll send reset instructions.";
  }

  // Network/connection issues
  if (errorMessage.includes("Failed to fetch") || errorMessage.includes("Network request failed")) {
    if (isIOSSafari) {
      return "Connection issue detected. Please check your internet connection and try again. If you're using Safari, you may need to enable JavaScript and cookies.";
    }
    return "Connection issue detected. Please check your internet connection and try again.";
  }

  // Generic fallback
  if (isIOSSafari) {
    return "Unable to send password reset email. Please ensure JavaScript and cookies are enabled in Safari, then try again.";
  }

  return "Unable to send password reset email. Please try again in a few moments.";
};

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const { resetPassword, isCaptchaEnabled } = useAuth();
  const captchaRef = useRef<TurnstileCaptchaRef>(null);
  const countdownInterval = useRef<NodeJS.Timeout | null>(null);

  // Detect if user is on iOS Safari
  const isiOSSafari = isIOSSafari();

  // Enable web-specific input enhancements for iOS PWA
  useWebInputEnhancements();

  // Countdown timer effect
  useEffect(() => {
    if (rateLimitCountdown && rateLimitCountdown > 0) {
      countdownInterval.current = setInterval(() => {
        setRateLimitCountdown((prev) => {
          if (prev && prev <= 1) {
            setError(null); // Clear error when countdown ends
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    } else {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    };
  }, [rateLimitCountdown]);

  // Show iOS help automatically if multiple failures detected
  useEffect(() => {
    if (isiOSSafari && error && !showIOSHelp) {
      const timer = setTimeout(() => {
        setShowIOSHelp(true);
      }, 2000); // Show help after 2 seconds of error

      return () => clearTimeout(timer);
    }
  }, [isiOSSafari, error, showIOSHelp]);

  const validateEmail = (email: string): string | null => {
    if (!email.trim()) {
      return "Email is required";
    }
    if (!EMAIL_REGEX.test(email)) {
      return "Please enter a valid email address";
    }
    return null;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    // Clear email error when user starts typing
    if (emailError) {
      setEmailError(null);
    }
    // Clear general error when user changes email
    if (error) {
      setError(null);
    }
  };

  const handleCaptchaVerify = (token: string) => {
    console.log("[ForgotPassword] CAPTCHA verified successfully");
    setCaptchaToken(token);
    setCaptchaError(null);
  };

  const handleCaptchaError = (error: string) => {
    console.error("[ForgotPassword] CAPTCHA error:", error);
    setCaptchaToken(null);
    setCaptchaError(error);
  };

  const handleCaptchaExpire = () => {
    console.log("[ForgotPassword] CAPTCHA token expired");
    setCaptchaToken(null);
    setCaptchaError("CAPTCHA expired. Please verify again.");
  };

  const startRateLimitCountdown = (remainingSeconds: number) => {
    setRateLimitCountdown(remainingSeconds);
  };

  const parseRemainingTimeFromError = (errorMessage: string): number | null => {
    // Parse "For security purposes, you can only request this after X seconds"
    const match = errorMessage.match(/after (\d+) seconds?/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return null;
  };

  const handleForgotPassword = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setCaptchaError(null);
      setShowIOSHelp(false);

      // Don't check rate limiting client-side - let Supabase handle it and respond with the actual remaining time

      // Validate email using the consistent validation function
      const emailValidationError = validateEmail(email);
      setEmailError(emailValidationError);

      if (emailValidationError) {
        return;
      }

      // Validate CAPTCHA token only if CAPTCHA is enabled
      if (isCaptchaEnabled && !captchaToken) {
        setCaptchaError("Please complete the CAPTCHA verification");
        return;
      }

      console.log(
        "[ForgotPassword] Sending password reset email" + (isCaptchaEnabled ? " with CAPTCHA protection" : "")
      );

      // Use the updated resetPassword function with CAPTCHA token
      await resetPassword(email, captchaToken || undefined);

      console.log("[ForgotPassword] Password reset email sent successfully");
      setIsSubmitted(true);

      // Reset CAPTCHA after successful submission
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }
    } catch (error: any) {
      console.error("[ForgotPassword] Error in password reset:", error);

      // Enhanced error handling
      const enhancedError = getEnhancedErrorMessage(error, isiOSSafari);
      setError(enhancedError);

      // Handle rate limiting specifically
      if (error?.message?.includes("For security purposes, you can only request this after")) {
        const remainingSeconds = parseRemainingTimeFromError(error.message);
        if (remainingSeconds) {
          startRateLimitCountdown(remainingSeconds);
        }
      }

      // Reset CAPTCHA on error to allow retry
      if (isCaptchaEnabled) {
        captchaRef.current?.reset();
        setCaptchaToken(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Determine if form is ready to submit
  const isFormReady = (isCaptchaEnabled ? !!captchaToken : true) && !rateLimitCountdown;

  return (
    <ThemedScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Forgot Password</ThemedText>
        <ThemedText type="subtitle">
          {isSubmitted
            ? "Check your email for reset instructions"
            : "Enter your email to receive a password reset link"}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        {!isSubmitted ? (
          <>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              placeholder="Email"
              placeholderTextColor={Colors.dark.secondary}
              value={email}
              onChangeText={handleEmailChange}
              onBlur={() => setEmailError(validateEmail(email))}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
              accessibilityLabel="Email input field"
            />
            {emailError && <ThemedText style={styles.validationError}>{emailError}</ThemedText>}

            {/* iOS Safari Help Section */}
            {isiOSSafari && showIOSHelp && (
              <ThemedView style={styles.iosHelpContainer}>
                <ThemedView style={styles.iosHelpHeader}>
                  <Ionicons name="phone-portrait-outline" size={16} color={Colors.dark.icon} />
                  <ThemedText style={styles.iosHelpTitle}>iOS Safari Tips</ThemedText>
                </ThemedView>
                <ThemedText style={styles.iosHelpText}>
                  • Ensure JavaScript and cookies are enabled{"\n"}• Try refreshing the page if the button doesn't
                  respond{"\n"}• Check your internet connection{"\n"}• Consider using the app instead of the browser
                </ThemedText>
                <TouchableOpacity style={styles.iosHelpDismiss} onPress={() => setShowIOSHelp(false)}>
                  <ThemedText style={styles.iosHelpDismissText}>Got it</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}

            {/* CAPTCHA Component */}
            <TurnstileCaptcha
              ref={captchaRef}
              onVerify={handleCaptchaVerify}
              onError={handleCaptchaError}
              onExpire={handleCaptchaExpire}
              disabled={isLoading}
              enabled={isCaptchaEnabled}
              size="normal"
              theme="auto"
            />

            {/* Display CAPTCHA error */}
            {captchaError && <ThemedText style={styles.captchaError}>{captchaError}</ThemedText>}

            {/* Rate Limit Countdown */}
            {rateLimitCountdown && (
              <ThemedView style={styles.countdownContainer}>
                <Ionicons name="time-outline" size={16} color={Colors.dark.icon} />
                <ThemedText style={styles.countdownText}>
                  Please wait {rateLimitCountdown} seconds before trying again
                </ThemedText>
              </ThemedView>
            )}

            {/* Display general error */}
            {error && (
              <ThemedView style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={16} color={Colors.dark.error} />
                <ThemedView style={styles.errorContent}>
                  <ThemedText style={styles.error}>{error}</ThemedText>
                  {/* Show iOS-specific help link */}
                  {isiOSSafari && !showIOSHelp && (
                    <TouchableOpacity style={styles.helpAction} onPress={() => setShowIOSHelp(true)}>
                      <ThemedText style={styles.helpActionText}>Safari troubleshooting tips →</ThemedText>
                    </TouchableOpacity>
                  )}
                </ThemedView>
              </ThemedView>
            )}

            <TouchableOpacity
              style={[styles.button, (isLoading || !isFormReady) && styles.buttonDisabled]}
              onPress={handleForgotPassword}
              disabled={isLoading || !isFormReady}
              accessibilityLabel="Send reset link button"
              accessibilityHint="Sends a password reset link to your email"
            >
              <ThemedText style={styles.buttonText}>
                {isLoading ? "Sending..." : rateLimitCountdown ? `Wait ${rateLimitCountdown}s` : "Send Reset Link"}
              </ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <ThemedView style={styles.successContainer}>
            <Ionicons name="checkmark-circle-outline" size={24} color="#10B981" style={styles.successIcon} />
            <ThemedText style={styles.successText}>
              If an account exists with that email, we've sent instructions to reset your password.
            </ThemedText>
            <ThemedText style={styles.successSubtext}>
              Please check your inbox and spam folder. The email may take a few minutes to arrive.
            </ThemedText>
            {isiOSSafari && (
              <ThemedText style={styles.iosSuccessNote}>
                iOS Safari users: If you don't see the email, try checking your Mail app directly.
              </ThemedText>
            )}
          </ThemedView>
        )}

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity accessibilityLabel="Back to sign in button">
              <ThemedText style={styles.link}>Back to Sign In</ThemedText>
            </TouchableOpacity>
          </Link>
        </ThemedView>
      </ThemedView>
    </ThemedScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
    minHeight: "100%",
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
    color: Colors.dark.primary,
    fontSize: 16,
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
  links: {
    marginTop: 20,
    alignItems: "center",
  },
  link: {
    color: Colors.dark.icon,
    marginVertical: 5,
  },
  error: {
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: 20,
  },
  captchaError: {
    color: Colors.dark.error,
    textAlign: "center",
    marginBottom: 10,
    fontSize: 14,
  },
  logo: {
    width: 130,
    height: 163,
    alignSelf: "center",
    marginBottom: 20,
  },
  successContainer: {
    padding: 15,
    backgroundColor: "rgba(0, 128, 0, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0, 128, 0, 0.3)",
    marginBottom: 20,
  },
  successText: {
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  successSubtext: {
    textAlign: "center",
    fontSize: 14,
    opacity: 0.8,
  },
  inputError: {
    borderColor: Colors.dark.error,
    borderWidth: 1,
  },
  validationError: {
    color: Colors.dark.error,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  iosHelpContainer: {
    padding: 15,
    backgroundColor: Colors.dark.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 20,
  },
  iosHelpHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iosHelpTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 10,
  },
  iosHelpText: {
    fontSize: 14,
    opacity: 0.8,
  },
  iosHelpDismiss: {
    marginTop: 10,
    alignItems: "center",
  },
  iosHelpDismissText: {
    color: Colors.dark.icon,
  },
  iosSuccessNote: {
    textAlign: "center",
    fontSize: 14,
    opacity: 0.8,
  },
  successIcon: {
    alignSelf: "center",
    marginBottom: 10,
  },
  countdownContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  countdownText: {
    fontSize: 14,
    marginLeft: 5,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  errorContent: {
    flexDirection: "column",
  },
  helpAction: {
    marginTop: 5,
    alignItems: "center",
  },
  helpActionText: {
    color: Colors.dark.icon,
  },
});
