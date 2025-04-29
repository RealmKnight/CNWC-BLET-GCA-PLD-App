import React, { useEffect } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

// Declare types for our global window properties
declare global {
  interface Window {
    __passwordResetProcessed?: boolean;
    __passwordResetHash?: string;
    __passwordResetSearch?: string;
  }
}

/**
 * Root-level redirect to the auth group change-password page
 * The actual implementation is in app/(auth)/change-password.tsx
 * Preserves URL parameters when redirecting
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();

  // Capture hash parameters if on web (for Supabase auth redirects)
  useEffect(() => {
    if (typeof window !== "undefined" && !window.__passwordResetProcessed) {
      // Set flag to prevent multiple processing
      window.__passwordResetProcessed = true;

      // Store hash parameters if present (Supabase often uses hash for auth tokens)
      if (window.location.hash) {
        console.log("[PasswordReset] Found hash parameters, storing for auth page");
        window.__passwordResetHash = window.location.hash;
      }

      // Store search parameters if present
      if (window.location.search) {
        console.log("[PasswordReset] Found search parameters, storing for auth page");
        window.__passwordResetSearch = window.location.search;
      }
    }
  }, []);

  // Create an object with the search params from expo-router
  const searchParamsObj: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      searchParamsObj[key] = value;
    }
  });

  // Redirect to the auth group version with parameters
  return (
    <Redirect
      href={{
        pathname: "/(auth)/change-password",
        params: searchParamsObj,
      }}
    />
  );
}
