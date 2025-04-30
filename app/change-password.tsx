import React, { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/hooks/useAuth";

type RedirectPath = "/(auth)/sign-in"; // Only need sign-in redirect now

/**
 * Root-level component that handles the redirect from Supabase password recovery email link.
 * It exchanges the code from the URL for a session and signals the recovery flow start.
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();
  const { signalPasswordRecoveryStart } = useAuth();
  const [redirectTo, setRedirectTo] = useState<RedirectPath | null>(null);
  const [isProcessing, setIsProcessing] = useState(true); // Use a single processing state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.code ? (Array.isArray(params.code) ? params.code[0] : params.code) : null;

    // Only process if we haven't already decided to redirect and have a code
    if (code && isProcessing && redirectTo === null) {
      setError(null);
      console.log("[ChangePasswordRoot] Detected code, attempting exchange:", code);

      const exchangeAuthCode = async () => {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }

          // Success! Session established by Supabase client internally.
          console.log("[ChangePasswordRoot] Code exchange successful.");

          // Signal that the recovery flow is starting
          signalPasswordRecoveryStart();
          console.log("[ChangePasswordRoot] Signaled recovery start. Allowing normal auth flow.");

          // Don't redirect here. Let useAuth and layouts handle navigation.
          // Set processing to false so we render null and don't re-run effect.
          setIsProcessing(false);
        } catch (err: any) {
          console.error("[ChangePasswordRoot] Code exchange error:", err.message || err);
          setError("Invalid or expired recovery link. Please try again.");
          setRedirectTo("/(auth)/sign-in"); // Redirect to sign-in on failure
          setIsProcessing(false); // Stop processing on error
        }
      };

      exchangeAuthCode();
    } else if (!code && isProcessing && redirectTo === null) {
      // No code present, this isn't the recovery flow
      console.log("[ChangePasswordRoot] No code found in URL. Redirecting to sign-in.");
      setRedirectTo("/(auth)/sign-in");
      setIsProcessing(false);
    } else if (!code) {
      // If no code and we already processed, make sure we stop
      setIsProcessing(false);
    }
    // Add isProcessing to dependencies to prevent re-running after completion/error
  }, [params.code, signalPasswordRecoveryStart, isProcessing, redirectTo]);

  if (redirectTo) {
    // If redirect path is set, perform the redirect
    return <Redirect href={redirectTo} />;
  }

  // While processing (including exchanging code), show minimal loading or null
  // Once processing is false and no redirect is set, returning null lets the rest of the app load.
  if (isProcessing) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Verifying link...</ThemedText>
      </ThemedView>
    );
  }

  // Render nothing once processing is complete and no redirect needed.
  // This allows the main app layout and navigation take over.
  return null;
}
