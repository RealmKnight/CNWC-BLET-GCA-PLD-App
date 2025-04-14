import React, { useState, useEffect } from "react";
import { StyleSheet, TextInput, TouchableOpacity, Image, Platform } from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import * as Linking from "expo-linking";
import { useAuth } from "@/hooks/useAuth";

export default function ChangePasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { exchangeCodeForSession } = useAuth();
  const params = useLocalSearchParams();

  // Handle password reset from Supabase auth link
  useEffect(() => {
    const processAuthParams = async () => {
      setIsProcessing(true);
      try {
        // Check for access token and refresh token in URL or params
        // This handles the hash-based tokens that Supabase sends
        const code = params.code as string | undefined;
        const type = params.type as string | undefined;
        const accessToken = params.access_token as string | undefined;
        const refreshToken = params.refresh_token as string | undefined;

        // If we have a code (PKCE flow), exchange it for a session
        if (code) {
          await exchangeCodeForSession(code);
          return;
        }

        // If we have tokens, set the session directly
        if (accessToken && refreshToken && type === "recovery") {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      } catch (error) {
        console.error("Error processing auth parameters:", error);
        setError("There was an error processing your password reset link. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    };

    // For web, check URL parameters
    if (Platform.OS === "web") {
      processAuthParams();
    } else {
      // For mobile, handle deep linking
      const handleDeepLink = async (url: string) => {
        setIsProcessing(true);
        try {
          // If the URL contains a hash, replace it with a query parameter
          let parsedUrl = url;
          if (url.includes("#")) {
            parsedUrl = url.replace("#", "?");
          }

          // Parse the URL to get the query parameters
          const urlObj = new URL(parsedUrl);
          const accessToken = urlObj.searchParams.get("access_token");
          const refreshToken = urlObj.searchParams.get("refresh_token");
          const type = urlObj.searchParams.get("type");
          const code = urlObj.searchParams.get("code");

          // If we have a code (PKCE flow), exchange it for a session
          if (code) {
            await exchangeCodeForSession(code);
            return;
          }

          // If we have tokens, set the session directly
          if (accessToken && refreshToken && type === "recovery") {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          }
        } catch (error) {
          console.error("Error processing deep link:", error);
          setError("There was an error processing your password reset link. Please try again.");
        } finally {
          setIsProcessing(false);
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
  }, [params, exchangeCodeForSession]);

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

      // Update the user's password with Supabase
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        console.error("Password update error:", error.message);
      } else {
        setIsSuccess(true);
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToSignIn = () => {
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
    marginBottom: 10,
  },
  logo: {
    width: 130,
    height: 163,
    alignSelf: "center",
    marginBottom: 20,
  },
});
