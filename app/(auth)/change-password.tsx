import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform } from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import * as Linking from "expo-linking";
import { useAuth } from "@/hooks/useAuth";

// Helper to extract auth params from both query and hash
function getAuthParamsFromUrl(): {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  code?: string;
  token?: string;
} {
  if (typeof window === "undefined") return {};
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  return {
    accessToken: searchParams.get("access_token") || hashParams.get("access_token") || undefined,
    refreshToken: searchParams.get("refresh_token") || hashParams.get("refresh_token") || undefined,
    type: searchParams.get("type") || hashParams.get("type") || undefined,
    code: searchParams.get("code") || hashParams.get("code") || undefined,
    token: searchParams.get("token") || hashParams.get("token") || undefined,
  };
}

export default function ChangePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authInProgress = useRef(false);
  const { exchangeCodeForSession, session } = useAuth();
  const params = useLocalSearchParams();

  // Handle password reset from Supabase auth link
  useEffect(() => {
    const processAuthParams = async () => {
      if (authInProgress.current) return;

      // Check if we have any auth params to process
      const hasAuthParams =
        params.code ||
        params.type ||
        params.access_token ||
        params.refresh_token ||
        (Platform.OS === "web" && Object.values(getAuthParamsFromUrl()).some(Boolean));

      // If no auth params and we already have a session, skip processing
      if (!hasAuthParams && session) {
        console.log("No auth params to process and session exists, skipping auth flow");
        return;
      }

      authInProgress.current = true;
      setIsProcessing(true);
      setIsAuthenticating(true);
      try {
        let code = params.code as string | undefined;
        let type = params.type as string | undefined;
        let accessToken = params.access_token as string | undefined;
        let refreshToken = params.refresh_token as string | undefined;
        let token = undefined;
        // On web, always extract from URL as well
        if (Platform.OS === "web") {
          const urlParams = getAuthParamsFromUrl();
          code = code || urlParams.code;
          type = type || urlParams.type;
          accessToken = accessToken || urlParams.accessToken;
          refreshToken = refreshToken || urlParams.refreshToken;
          token = urlParams.token;
        }
        // Log for debugging
        console.log("[ChangePassword] Extracted params:", { code, type, accessToken, refreshToken, token });

        // If we have tokens, set the session
        if (accessToken && refreshToken && type === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setError("There was an error processing your password reset link. Please try again.");
            return;
          }
        } else if (token) {
          // Some providers send a refresh token as 'token'
          const { error } = await supabase.auth.refreshSession({ refresh_token: token });
          if (error) {
            setError("There was an error processing your password reset link. Please request a new one.");
            return;
          }
        } else if (code) {
          // On web, code cannot be exchanged for a session (no PKCE verifier)
          if (Platform.OS === "web") {
            setError(
              "Your password reset link is invalid or expired. Please request a new one. " +
                "(Missing required tokens in the URL.)"
            );
            return;
          }
          // On mobile, deep link handler will process code
        } else if (type === "recovery") {
          setError("Incomplete recovery link. Please request a new password reset link.");
          return;
        } else {
          // No valid params but we have a session
          const { data } = await supabase.auth.getSession();
          if (!data.session) {
            setError("Please use a valid password reset link or sign in to change your password.");
            return;
          }
        }
      } catch (error) {
        setError("There was an error processing your password reset link. Please try again.");
      } finally {
        setIsProcessing(false);
        setTimeout(() => {
          setIsAuthenticating(false);
          authInProgress.current = false;
        }, 500);
      }
    };

    if (Platform.OS === "web") {
      processAuthParams();
    } else {
      // For mobile, handle deep linking
      const handleDeepLink = async (url: string) => {
        setIsProcessing(true);
        setIsAuthenticating(true);

        try {
          console.log("Processing deep link:", url);

          // If the URL contains a hash, replace it with a query parameter
          let parsedUrl = url;
          if (url.includes("#")) {
            parsedUrl = url.replace("#", "?");
            console.log("Converted hash URL to query URL:", parsedUrl);
          }

          // Parse the URL to get the query parameters
          const urlObj = new URL(parsedUrl);
          const accessToken = urlObj.searchParams.get("access_token");
          const refreshToken = urlObj.searchParams.get("refresh_token");
          const type = urlObj.searchParams.get("type");
          const code = urlObj.searchParams.get("code");

          console.log("Deep link params:", {
            hasCode: !!code,
            type,
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
          });

          // If we have a code (PKCE flow), exchange it for a session
          if (code) {
            console.log("Found code in deep link, checking for session");

            // Check if we already have a session
            const { data: sessionData } = await supabase.auth.getSession();

            if (sessionData?.session) {
              // We already have a session! Use that instead
              console.log("Found existing session in deep link handler");
              return;
            }

            // Skip code exchange - it won't work without code verifier
            console.log("No existing session found in deep link flow");

            // Check if there's a token in other URL params
            const tokenParam = urlObj.searchParams.get("token");
            if (tokenParam) {
              console.log("Found token in deep link URL");
              try {
                const { error: tokenError } = await supabase.auth.refreshSession({
                  refresh_token: tokenParam,
                });

                if (tokenError) {
                  console.error("Error refreshing with token from deep link:", tokenError);
                  setError("Invalid or expired password reset link. Please request a new one.");
                }
              } catch (tokenError) {
                console.error("Error processing token from deep link:", tokenError);
                setError("Invalid or expired password reset link. Please request a new one.");
              }
            } else {
              setError("Your password reset link is invalid or has expired. Please request a new one.");
            }
            return;
          }

          // If we have tokens, set the session directly
          if (accessToken && refreshToken && type === "recovery") {
            console.log("Setting session with tokens from deep link");
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("Error setting session from deep link:", error);
              setError("There was an error processing your password reset link. Please try again.");
            }
          } else if (type === "recovery") {
            console.log("Recovery type detected but missing tokens in deep link");
            setError("Incomplete recovery link. Please request a new password reset link.");
          } else {
            console.log("No valid auth parameters found in deep link");
            setError("Invalid password reset link. Please request a new one.");
          }
        } catch (error) {
          console.error("Error processing deep link:", error);
          setError("There was an error processing your password reset link. Please try again.");
        } finally {
          setIsProcessing(false);
          // Keep isAuthenticating true briefly to prevent unwanted redirects
          setTimeout(() => {
            setIsAuthenticating(false);
          }, 500);
        }
      };

      // Check for an initial URL when the app is opened via a link
      const getInitialURL = async () => {
        const initialURL = await Linking.getInitialURL();
        if (initialURL) {
          handleDeepLink(initialURL);
        }
      };

      // Set up a listener for deep links
      const subscription = Linking.addEventListener("url", ({ url }) => {
        handleDeepLink(url);
      });

      getInitialURL();

      // Clean up the listener when the component unmounts
      return () => {
        subscription.remove();
      };
    }
  }, [params, exchangeCodeForSession, session]);

  // Prevent unwanted redirections when handling password reset
  useEffect(() => {
    // Use a ref to track if we're currently processing auth
    // and update RootLayout to check this before redirecting
    const preventRedirectDuringReset = () => {
      if (isAuthenticating) {
        console.log("Password reset in progress, preventing redirects");
        return true;
      }
      return false;
    };

    // Set a flag in global state or use context if needed
    // This is a simpler approach for now
    (window as any).__isProcessingPasswordReset = preventRedirectDuringReset;

    return () => {
      // Clean up when unmounting
      (window as any).__isProcessingPasswordReset = null;
    };
  }, [isAuthenticating]);

  // Modify the session check useEffect
  useEffect(() => {
    // Only log success if we were actually processing auth
    if (!isProcessing && !isAuthenticating && session && error === null && authInProgress.current) {
      console.log("Authentication completed successfully, session established");
      authInProgress.current = false;
    }
  }, [isProcessing, isAuthenticating, session, error]);

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

      // Set flag to prevent redirects during password change
      setIsAuthenticating(true);
      if (typeof window !== "undefined") {
        window.__passwordResetInProgress = true;
      }

      // Update the user's password with Supabase
      const { error: updateError, data } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        console.error("Password update error:", updateError.message);
      } else {
        console.log("Password updated successfully");
        setIsSuccess(true);

        // Keep the flags to prevent redirect until user explicitly navigates away
        // This ensures they see the success message and can click "Return to Sign In"
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToSignIn = () => {
    // Clear auth flags before navigating
    setIsAuthenticating(false);
    authInProgress.current = false;
    if (typeof window !== "undefined") {
      window.__passwordResetInProgress = false;
    }

    // For web, navigate directly to sign-in
    if (Platform.OS === "web") {
      router.replace("/(auth)/sign-in");
    }
  };

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

          {/* Add a direct sign in option */}
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
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
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
