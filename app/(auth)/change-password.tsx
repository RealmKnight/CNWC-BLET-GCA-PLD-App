import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform, Alert } from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import * as Linking from "expo-linking";
import { useAuth } from "@/hooks/useAuth";
import { Redirect } from "expo-router";

// Extend Window interface to include our custom properties
declare global {
  interface Window {
    __passwordResetProcessed?: boolean;
    __passwordResetHash?: string;
    __passwordResetSearch?: string;
  }
}

// Helper function to properly verify OTP with backward compatibility
async function verifyRecoveryToken(token: string) {
  try {
    // The Supabase SDK type requires an email for recovery tokens
    // When verifying from a URL, we need to use a different approach
    // First try using blank email (internal implementation might not require it)
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token,
      email: "", // Provide empty email to satisfy type check
    });

    if (error) {
      console.error("[ChangePassword] Error verifying token:", error);
      return { error };
    }

    return { error: null };
  } catch (e) {
    console.error("[ChangePassword] Error in verifyRecoveryToken:", e);
    return { error: new Error("Failed to verify recovery token") };
  }
}

export default function ChangePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const { session } = useAuth();
  const params = useLocalSearchParams();
  const [redirectToSignIn, setRedirectToSignIn] = useState(false);

  // Handle password reset session authentication
  useEffect(() => {
    const handleAuth = async () => {
      // Prevent multiple processing attempts
      if (processingRef.current) return;
      processingRef.current = true;

      try {
        setIsProcessing(true);
        console.log("[ChangePassword] Starting auth process");

        // Check if we already have a session
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log("[ChangePassword] Already have a valid session");
          setIsProcessing(false);
          return;
        }

        if (Platform.OS === "web") {
          // Web platform: Check stored hash/search and URL parameters

          // 1. Try access/refresh tokens in hash (common for Supabase email links)
          let accessToken, refreshToken, type, code;

          // Check stored hash from initial redirect
          const hashStr = window.__passwordResetHash || window.location.hash;

          if (hashStr && hashStr.includes("access_token=")) {
            console.log("[ChangePassword] Found tokens in hash");

            // Parse tokens from hash
            const hashContent = hashStr.substring(1); // Remove leading #
            const hashParams = new URLSearchParams(hashContent);

            accessToken = hashParams.get("access_token");
            refreshToken = hashParams.get("refresh_token");
            type = hashParams.get("type");

            if (accessToken && refreshToken) {
              console.log("[ChangePassword] Setting session with tokens from hash");
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (setSessionError) {
                console.error("[ChangePassword] Error setting session:", setSessionError);
                setError("Your password reset link is invalid or has expired. Please request a new one.");
              }
              setIsProcessing(false);
              return;
            }
          }

          // 2. Try recovery code in query parameters
          const searchStr = window.__passwordResetSearch || window.location.search;

          if (searchStr && searchStr.includes("code=")) {
            console.log("[ChangePassword] Found recovery code in search parameters");
            const searchParams = new URLSearchParams(searchStr);
            code = searchParams.get("code");

            if (code) {
              console.log("[ChangePassword] Verifying recovery code");
              const { error: verifyError } = await verifyRecoveryToken(code);

              if (verifyError) {
                console.error("[ChangePassword] Error verifying recovery code:", verifyError);
                setError("Your password reset link is invalid or has expired. Please request a new one.");
              }
              setIsProcessing(false);
              return;
            }
          }

          // 3. Check URL parameters from expo-router
          if (params.code) {
            console.log("[ChangePassword] Found code in expo-router params");
            const { error: verifyError } = await verifyRecoveryToken(params.code as string);

            if (verifyError) {
              console.error("[ChangePassword] Error verifying recovery code from params:", verifyError);
              setError("Your password reset link is invalid or has expired. Please request a new one.");
            }
            setIsProcessing(false);
            return;
          }

          // No valid auth parameters found
          console.error("[ChangePassword] No valid authentication parameters found");
          setError("Please use a valid password reset link or sign in to change your password.");
        } else {
          // Mobile platform: Handle deep linking with Linking API

          // Check for an initial URL (app opened via a link)
          const initialURL = await Linking.getInitialURL();
          if (initialURL) {
            console.log("[ChangePassword] Processing initial deep link:", initialURL);

            // Parse the URL to extract parameters
            const url = new URL(initialURL);
            const code = url.searchParams.get("code");
            const accessToken = url.searchParams.get("access_token");
            const refreshToken = url.searchParams.get("refresh_token");

            if (code) {
              console.log("[ChangePassword] Found recovery code in deep link");
              const { error: verifyError } = await verifyRecoveryToken(code);

              if (verifyError) {
                console.error("[ChangePassword] Error verifying recovery code:", verifyError);
                setError("Your password reset link is invalid or has expired. Please request a new one.");
              }
            } else if (accessToken && refreshToken) {
              console.log("[ChangePassword] Found tokens in deep link");
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              if (setSessionError) {
                console.error("[ChangePassword] Error setting session:", setSessionError);
                setError("Your password reset link is invalid or has expired. Please request a new one.");
              }
            }
          } else if (params.code) {
            // Use code from expo-router params
            console.log("[ChangePassword] Using code from expo-router params");
            const { error: verifyError } = await verifyRecoveryToken(params.code as string);

            if (verifyError) {
              console.error("[ChangePassword] Error verifying recovery code:", verifyError);
              setError("Your password reset link is invalid or has expired. Please request a new one.");
            }
          } else {
            console.error("[ChangePassword] No valid auth parameters for mobile");
            setError("Please use a valid password reset link or sign in to change your password.");
          }
        }
      } catch (error) {
        console.error("[ChangePassword] Unexpected error in auth process:", error);
        setError("An unexpected error occurred. Please try again or request a new reset link.");
      } finally {
        setIsProcessing(false);
      }
    };

    handleAuth();

    // Set up deep link listener for mobile
    if (Platform.OS !== "web") {
      const subscription = Linking.addEventListener("url", ({ url }) => {
        console.log("[ChangePassword] Received deep link:", url);
        // Process the URL and extract parameters if needed
      });

      return () => {
        subscription.remove();
      };
    }
  }, [params]);

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
    // Set redirect state to trigger the Redirect component
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

      {isProcessing ? (
        <ThemedView style={styles.form}>
          <ThemedText>Processing your request...</ThemedText>
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
