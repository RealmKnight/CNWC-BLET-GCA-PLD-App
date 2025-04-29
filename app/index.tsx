import { Redirect, useRootNavigation } from "expo-router";
import { useAuth } from "@/hooks/useAuth";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";

/**
 * Root index page - redirects users based on auth status
 * BUT only when navigation is fully ready
 */
export default function Index() {
  const { authStatus } = useAuth();
  // Add root navigation check
  const rootNavigation = useRootNavigation();

  // CRITICAL: Don't redirect if navigation isn't ready
  if (!rootNavigation?.isReady) {
    console.log("[Index] Navigation not ready, deferring redirect");
    return (
      <View style={styles.container}>
        <ThemedText>Preparing navigation...</ThemedText>
      </View>
    );
  }

  console.log(`[Index] Navigation ready, auth status: ${authStatus}`);

  // Based on authentication status, redirect to appropriate screen
  switch (authStatus) {
    case "loading":
      // Return an empty view instead of null to avoid problems
      return (
        <View style={styles.container}>
          <ThemedText>Loading auth state...</ThemedText>
        </View>
      );
    case "signedOut":
      console.log("[Index] Auth status is signedOut, redirecting to sign-in");
      return <Redirect href="/(auth)/sign-in" />;
    case "needsAssociation":
      return <Redirect href="/(auth)/member-association" />;
    case "signedInAdmin":
      return <Redirect href="/company-admin" />;
    case "signedInMember":
      return <Redirect href="/(tabs)" />;
    case "passwordReset":
      return <Redirect href="/(auth)/change-password" />;
    default:
      return <Redirect href="/(auth)/sign-in" />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
