import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Root-level redirect to the auth group change-password page
 * The actual implementation is in app/(auth)/change-password.tsx
 * Preserves URL parameters when redirecting
 */
export default function ChangePasswordRedirect() {
  const params = useLocalSearchParams();

  // Create an object with the search params
  const searchParamsObj: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      searchParamsObj[key] = value;
    }
  });

  // Redirect to the auth group version with parameters as an object
  return (
    <Redirect
      href={{
        pathname: "/(auth)/change-password",
        params: searchParamsObj,
      }}
    />
  );
}
