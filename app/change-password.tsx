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
  const { setSessionFromId } = useAuth();
  const [redirectTo, setRedirectTo] = useState<RedirectPath | null>(null);

  useEffect(() => {
    async function handleSession() {
      // If code exists in URL, it IS the session ID
      if (params.code) {
        const sessionId = Array.isArray(params.code) ? params.code[0] : params.code;
        console.log("[ChangePassword] Setting session from URL code");
        try {
          // Set the session directly using the code from URL
          await setSessionFromId(sessionId);
          console.log("[ChangePassword] Session set successfully, redirecting to change password");
          setRedirectTo("/(auth)/change-password");
        } catch (error) {
          console.error("[ChangePassword] Error setting session:", error);
          // If there's an error, redirect to sign in
          setRedirectTo("/(auth)/sign-in");
        }
      } else {
        // No code means no valid session, redirect to sign in
        setRedirectTo("/(auth)/sign-in");
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
