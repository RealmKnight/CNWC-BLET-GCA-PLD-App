import React from "react";
import { StyleSheet } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Stack } from "expo-router";

function ApplicationAdminScreen() {
  const { userRole, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  // Only application admin can access this page
  if (userRole !== "application_admin") {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>You do not have permission to view this page.</ThemedText>
      </ThemedView>
    );
  }

  return <AdminDashboard role="application_admin" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
});

export default function Page() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Application Admin",
        }}
      />
      <ApplicationAdminScreen />
    </>
  );
}
