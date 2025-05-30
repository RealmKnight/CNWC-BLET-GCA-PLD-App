import React, { useState, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedScrollView } from "@/components/ThemedScrollView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase";
import { sendPasswordResetEmail } from "@/utils/notificationService";
import TurnstileCaptcha, { TurnstileCaptchaRef } from "@/components/ui/TurnstileCaptcha";
import { useAuth } from "@/hooks/useAuth";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resetPassword, isCaptchaEnabled } = useAuth();
  const captchaRef = useRef<TurnstileCaptchaRef>(null);

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

  const handleForgotPassword = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setCaptchaError(null);

      // Basic validation
      if (!email) {
        setError("Please enter your email address");
        return;
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError("Please enter a valid email address");
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
      setError(error.message || "Failed to send reset password email");

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
  const isFormReady = isCaptchaEnabled ? !!captchaToken : true;

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
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.dark.secondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
              accessibilityLabel="Email input field"
            />

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

            {/* Display general error */}
            {error && <ThemedText style={styles.error}>{error}</ThemedText>}

            <TouchableOpacity
              style={[styles.button, (isLoading || !isFormReady) && styles.buttonDisabled]}
              onPress={handleForgotPassword}
              disabled={isLoading || !isFormReady}
              accessibilityLabel="Send reset link button"
              accessibilityHint="Sends a password reset link to your email"
            >
              <ThemedText style={styles.buttonText}>{isLoading ? "Sending..." : "Send Reset Link"}</ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <ThemedView style={styles.successContainer}>
            <ThemedText style={styles.successText}>
              If an account exists with that email, we've sent instructions to reset your password.
            </ThemedText>
            <ThemedText style={styles.successSubtext}>
              Please check your inbox and spam folder. The email may take a few minutes to arrive.
            </ThemedText>
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
});
