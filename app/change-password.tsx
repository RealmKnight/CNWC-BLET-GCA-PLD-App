import React, { useEffect, useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/hooks/useAuth";

type RedirectPath = "/(auth)/change-password" | "/(auth)/sign-in";

/**
 * Root-level redirect to the auth group change-password page
 * The actual implementation is in app/(auth)/change-password.tsx
 * The presence of a code parameter indicates Supabase has already set up our session
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();
  const { setSessionFromId, authStatus } = useAuth();
  const [redirectTo, setRedirectTo] = useState<RedirectPath | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  // Listen for changes in authStatus to determine redirection
  useEffect(() => {
    if (!isProcessing) return;

    // Wait for authStatus to stabilize after setting session
    if (authStatus === "loading") return;

    // Now that authStatus is stable, redirect based on state
    console.log("[ChangePassword] Auth status updated to:", authStatus);

    if (authStatus === "signedInMember" || authStatus === "signedInAdmin") {
      // User is properly authenticated and associated, proceed to change password
      console.log("[ChangePassword] User properly authenticated, redirecting to change password");
      setRedirectTo("/(auth)/change-password");
    } else {
      // User is not properly authenticated (signedOut or needsAssociation)
      console.log("[ChangePassword] User not properly associated or authenticated:", authStatus);
      setRedirectTo("/(auth)/sign-in");
    }

    setIsProcessing(false);
  }, [authStatus, isProcessing]);

  // Initial setup - set session from code
  useEffect(() => {
    async function handleSession() {
      // If code exists in URL, it IS the session ID
      if (params.code) {
        const sessionId = Array.isArray(params.code) ? params.code[0] : params.code;
        console.log("[ChangePassword] Setting session from URL code");
        try {
          // Set the session directly using the code from URL
          await setSessionFromId(sessionId);
          console.log("[ChangePassword] Session set successfully, waiting for auth state update");
          // Let the authStatus effect handle redirection
        } catch (error) {
          console.error("[ChangePassword] Error setting session:", error);
          // If there's an error, redirect to sign in
          setRedirectTo("/(auth)/sign-in");
          setIsProcessing(false);
        }
      } else {
        // No code means no valid session, redirect to sign in
        console.log("[ChangePassword] No code in URL, redirecting to sign in");
        setRedirectTo("/(auth)/sign-in");
        setIsProcessing(false);
      }
    }

    handleSession();
  }, [params.code, setSessionFromId]);

  if (redirectTo) {
    return <Redirect href={redirectTo} />;
  }

  // Show nothing while processing
  return null;
}
