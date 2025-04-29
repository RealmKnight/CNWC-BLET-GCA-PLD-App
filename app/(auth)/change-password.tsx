import React, { useState, useEffect } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform } from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "expo-router";

export default function ChangePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { session } = useAuth();
  const [redirectToSignIn, setRedirectToSignIn] = useState(false);

  // Check session and loading state
  const [sessionChecked, setSessionChecked] = useState(false);
  const params = useLocalSearchParams();

  // Check if we have a session (could be from password reset link)
  useEffect(() => {
    async function checkSession() {
      // Get current session
      const { data } = await supabase.auth.getSession();
      setSessionChecked(true);

      if (!data.session) {
        console.log("[ChangePassword] No active session found");
        // If we have a code parameter, this might be a recovery link
        // Supabase should automatically exchange the code for a session
        if (params.code) {
          console.log("[ChangePassword] Found code parameter, waiting for session");
          // Wait a moment for Supabase to process the code
          setTimeout(async () => {
            const { data: refreshedData } = await supabase.auth.getSession();
            if (!refreshedData.session) {
              console.log("[ChangePassword] Still no session after waiting");
              setError("Your password reset link is invalid or has expired. Please request a new one.");
            }
          }, 1000);
        } else {
          setError("Please use a valid password reset link or sign in to change your password.");
        }
      } else {
        console.log("[ChangePassword] Active session found, ready to change password");
      }
    }

    checkSession();
  }, [params.code]);

  const handleChangePassword = async () => {
    try {
      setError(null);
      setLoading(true);

      // Basic form validation
      if (!password) {
        setError("Please enter a new password");
        return;
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters long");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      // Check if we have a session
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setError("Your session has expired. Please request a new password reset link.");
        return;
      }

      // Update the user's password with Supabase
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        console.error("[ChangePassword] Password update error:", updateError.message);
      } else {
        console.log("[ChangePassword] Password updated successfully");
        setIsSuccess(true);
      }
    } catch (error) {
      console.error("[ChangePassword] Unexpected error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToSignIn = () => {
    setRedirectToSignIn(true);
  };

  // Add redirection when state is set
  if (redirectToSignIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <ThemedView style={styles.container}>
      <Image source={require("@/assets/images/BLETblackgold.png")} style={styles.logo} />
      <ThemedView style={styles.header}>
        <ThemedText type="title">Change Password</ThemedText>
        <ThemedText type="subtitle">
          {isSuccess ? "Your password has been updated successfully!" : "Enter your new password below"}
        </ThemedText>
      </ThemedView>

      {!sessionChecked ? (
        <ThemedView style={styles.form}>
          <ThemedText>Checking your session...</ThemedText>
        </ThemedView>
      ) : error ? (
        <ThemedView style={styles.form}>
          <ThemedText style={styles.error}>{error}</ThemedText>
          <ThemedText style={styles.instructions}>
            If you're having trouble resetting your password, please request a new password reset link or contact
            support.
          </ThemedText>
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.button}>
              <ThemedText style={styles.buttonText}>Request New Reset Link</ThemedText>
            </TouchableOpacity>
          </Link>

          <ThemedText style={[styles.instructions, { marginTop: 20 }]}>
            Already know your password? You can sign in directly.
          </ThemedText>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: "transparent", borderColor: Colors.dark.border }]}
            >
              <ThemedText style={styles.buttonText}>Back to Sign In</ThemedText>
            </TouchableOpacity>
          </Link>
        </ThemedView>
      ) : isSuccess ? (
        <ThemedView style={styles.form}>
          <Link href="/(auth)/sign-in" asChild onPress={handleReturnToSignIn}>
            <TouchableOpacity style={styles.button}>
              <ThemedText style={styles.buttonText}>Return to Sign In</ThemedText>
            </TouchableOpacity>
          </Link>
        </ThemedView>
      ) : (
        <ThemedView style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor={Colors.dark.secondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor={Colors.dark.secondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleChangePassword}
            disabled={loading}
          >
            <ThemedText style={styles.buttonText}>{loading ? "Updating..." : "Update Password"}</ThemedText>
          </TouchableOpacity>

          <ThemedView style={styles.links}>
            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity>
                <ThemedText style={styles.link}>Back to Sign In</ThemedText>
              </TouchableOpacity>
            </Link>
          </ThemedView>
        </ThemedView>
      )}
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
    fontSize: 16,
  },
  instructions: {
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
