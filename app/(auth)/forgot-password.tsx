import React, { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase";
import { sendPasswordResetEmail } from "@/utils/notificationService";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    try {
      setIsLoading(true);
      setError(null);

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

      console.log("[Auth] Sending password reset email to:", email);

      // Use the simplified email service
      const success = await sendPasswordResetEmail(email);

      if (!success) {
        console.error("[Auth] Error sending reset email");
        setError(
          "We're having trouble sending emails right now. Please try again later or contact support if the issue persists."
        );
        return;
      }

      console.log("[Auth] Password reset email sent successfully");
      setIsSubmitted(true);
    } catch (error: any) {
      console.error("[Auth] Error in password reset:", error);
      setError(error.message || "Failed to send reset password email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
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

            {error && <ThemedText style={styles.error}>{error}</ThemedText>}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleForgotPassword}
              disabled={isLoading}
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
