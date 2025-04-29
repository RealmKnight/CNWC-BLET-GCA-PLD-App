import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Root-level redirect to the auth group change-password page
 * The actual implementation is in app/(auth)/change-password.tsx
 * The presence of a code parameter indicates Supabase has already set up our session
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();

  // If code exists in URL, Supabase has already handled session setup
  // We can safely redirect to change password without any parameters
  if (params.code) {
    console.log("[ChangePassword] Session established by Supabase, redirecting to change password");
    return <Redirect href="/(auth)/change-password" />;
  }

  // No code means no valid session, but still redirect to let the auth page handle it
  return <Redirect href="/(auth)/change-password" />;
}
