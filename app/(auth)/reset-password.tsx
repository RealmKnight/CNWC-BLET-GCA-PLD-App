import React, { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image } from "react-native";
import { Link } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/utils/supabase";

export default function ResetPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResetPassword = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!email) {
        setError("Please enter your email address");
        return;
      }

      console.log("[Auth] Sending password reset email to:", email);

      // Generate a password reset token through Supabase Auth Admin
      const { data, error: resetError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: email,
        options: {
          redirectTo: `${process.env.EXPO_PUBLIC_WEBSITE_URL}/(auth)/change-password`,
        },
      });

      if (resetError || !data?.properties?.action_link) {
        console.error("[Auth] Error generating reset token:", resetError);
        setError(resetError?.message || "Failed to generate reset link");
        return;
      }

      // Send our custom formatted email using the edge function
      const functionUrl = "https://ymkihdiegkqbeegfebse.supabase.co/functions/v1/send-email";

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: email,
          subject: "Reset Your Password - BLET CN/WC GCA PLD App",
          content: `
            <div style="text-align: center; padding: 20px;">
              <img src="https://ymkihdiegkqbeegfebse.supabase.co/storage/v1/object/public/public_assets/logo/BLETblackgold.png" 
                   alt="BLET Logo" 
                   style="max-width: 200px; height: auto;">
              <h1 style="color: #003366;">Reset Your Password</h1>
              <p style="font-size: 16px; line-height: 1.5;">
                We received a request to reset your password for the BLET CN/WC GCA PLD App.
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                Click the button below to set a new password:
              </p>
              <p style="font-size: 16px; line-height: 1.5;">
                <a href="${data.properties.action_link}" 
                   style="background-color: #003366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                  Reset Password
                </a>
              </p>
              <p style="font-style: italic; color: #666; margin-top: 20px;">
                If you did not request a password reset, you can ignore this email.
              </p>
              <p style="font-style: italic; color: #666;">
                This is an automated message from the BLET CN/WC GCA PLD App.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send password reset email");
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
        <ThemedText type="title">Reset Password</ThemedText>
        <ThemedText type="subtitle">
          {isSubmitted ? "Check your email for reset instructions" : "Enter your email to reset your password"}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.form}>
        {!isSubmitted && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />

            {error && <ThemedText style={styles.error}>{error}</ThemedText>}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              <ThemedText style={styles.buttonText}>{isLoading ? "Sending..." : "Reset Password"}</ThemedText>
            </TouchableOpacity>
          </>
        )}

        <ThemedView style={styles.links}>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
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
});
