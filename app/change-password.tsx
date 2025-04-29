import React from "react";
import { Redirect } from "expo-router";

/**
 * Root-level redirect to the auth group change-password page
 * The actual implementation is in app/(auth)/change-password.tsx
 */
export default function ChangePasswordRedirect() {
  // Simply redirect to the auth group version
  return <Redirect href="/(auth)/change-password" />;
}
