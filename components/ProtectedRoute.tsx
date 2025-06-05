import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "@/constants/Colors";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredAuth?: "any" | "member" | "admin";
}

/**
 * ProtectedRoute component that redirects to sign-in when user isn't authenticated
 * or to appropriate route based on authentication status
 */
export function ProtectedRoute({ children, requiredAuth = "any" }: ProtectedRouteProps) {
  const { authStatus } = useAuth();

  // Still loading auth state - show a loading indicator
  if (authStatus === "loading") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  // Not signed in - redirect to sign-in
  if (authStatus === "signedOut") {
    console.log("[ProtectedRoute] User not authenticated, redirecting to sign-in");
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Needs association - redirect to member-association
  if (authStatus === "needsAssociation") {
    console.log("[ProtectedRoute] User needs association, redirecting");
    return <Redirect href="/(auth)/member-association" />;
  }

  // Check specific auth requirements
  if (requiredAuth === "admin" && authStatus !== "signedInAdmin") {
    console.log("[ProtectedRoute] Admin access required but user is not admin");
    if (authStatus === "signedInMember") {
      return <Redirect href="/(tabs)" />;
    }
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (requiredAuth === "member" && authStatus !== "signedInMember") {
    console.log("[ProtectedRoute] Member access required but user is not a member");
    if (authStatus === "signedInAdmin") {
      return <Redirect href="/company-admin" />;
    }
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Password reset special case
  if (authStatus === "passwordReset") {
    console.log("[ProtectedRoute] User needs to reset password");
    return <Redirect href="/(auth)/change-password" />;
  }

  // User is authenticated and meets requirements - render children
  return <>{children}</>;
}
