import React, { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { supabase } from "@/utils/supabase";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";

type RedirectPath = "/(auth)/change-password" | "/(auth)/sign-in";

/**
 * Root-level component that handles the redirect from Supabase password recovery email link.
 * It exchanges the code from the URL for a session and then redirects to the actual password change form.
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();
  const [redirectTo, setRedirectTo] = useState<RedirectPath | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.code ? (Array.isArray(params.code) ? params.code[0] : params.code) : null;

    if (code && !isExchanging && redirectTo === null) {
      setIsExchanging(true);
      setError(null);
      console.log("[ChangePasswordRoot] Detected code, attempting exchange:", code);

      const exchangeAuthCode = async () => {
        try {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }

          // Success! Session established by Supabase client internally.
          // onAuthStateChange in useAuth will pick it up.
          // Now redirect to the actual password change form.
          console.log("[ChangePasswordRoot] Code exchange successful. Redirecting to password form.");
          setRedirectTo("/(auth)/change-password");
        } catch (err: any) {
          console.error("[ChangePasswordRoot] Code exchange error:", err.message || err);
          setError("Invalid or expired recovery link. Please try again.");
          // Redirect to sign-in on failure
          setRedirectTo("/(auth)/sign-in");
        } finally {
          setIsExchanging(false);
        }
      };

      exchangeAuthCode();
    } else if (!code && !isExchanging && redirectTo === null) {
      // No code present, this isn't the recovery flow
      console.log("[ChangePasswordRoot] No code found in URL. Redirecting to sign-in.");
      setRedirectTo("/(auth)/sign-in");
    }
    // Intentionally limited dependencies - only run once based on initial params
  }, [params.code]); // Rerun if params.code changes (though unlikely)

  if (redirectTo) {
    // If redirect path is set, perform the redirect
    return <Redirect href={redirectTo} />;
  }

  if (isExchanging) {
    // Show loading state while exchanging code
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText>Verifying link...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    // Optionally show an error message before redirecting, or just rely on the redirect
    return (
      <ThemedView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ThemedText style={{ color: "red", marginBottom: 10 }}>{error}</ThemedText>
        <ThemedText>Redirecting to sign-in...</ThemedText>
      </ThemedView>
    );
  }

  // Fallback: Should typically show loading or redirect immediately
  return null;
}
