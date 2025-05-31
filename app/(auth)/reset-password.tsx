import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { router } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";

export default function ResetPasswordScreen() {
  useEffect(() => {
    // Redirect to the forgot-password screen after a short delay
    const redirectTimer = setTimeout(() => {
      router.replace("/(auth)/forgot-password");
    }, 2000);

    return () => clearTimeout(redirectTimer);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Redirecting...</ThemedText>
      <ThemedText type="subtitle">You are being redirected to the Forgot Password page.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.background,
  },
});
