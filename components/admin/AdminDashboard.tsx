import React from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { UserRole } from "@/types/auth";

interface AdminDashboardProps {
  role: Extract<UserRole, "application_admin" | "union_admin" | "division_admin">;
}

export function AdminDashboard({ role }: AdminDashboardProps) {
  const formattedTitle = role
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">{formattedTitle} Dashboard</ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        {role === "application_admin" && (
          <>
            <ThemedText type="subtitle">Application Admin Features:</ThemedText>
            <ThemedText>• Global Settings</ThemedText>
            <ThemedText>• System Statistics</ThemedText>
            <ThemedText>• User Management</ThemedText>
            <ThemedText>• All Union and Division Features</ThemedText>
          </>
        )}

        {role === "union_admin" && (
          <>
            <ThemedText type="subtitle">Union Admin Features:</ThemedText>
            <ThemedText>• Union Announcements</ThemedText>
            <ThemedText>• Advertisements</ThemedText>
            <ThemedText>• GCA Officers</ThemedText>
            <ThemedText>• Division Management</ThemedText>
            <ThemedText>• All Division Features</ThemedText>
          </>
        )}

        {role === "division_admin" && (
          <>
            <ThemedText type="subtitle">Division Admin Features:</ThemedText>
            <ThemedText>• Member Management</ThemedText>
            <ThemedText>• Division Officers</ThemedText>
            <ThemedText>• Leave Requests</ThemedText>
            <ThemedText>• Division Calendar Allotments</ThemedText>
          </>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  content: {
    gap: 12,
  },
});
