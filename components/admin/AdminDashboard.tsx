import React from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { UserRole } from "@/types/auth";
import { DivisionAdminPanel } from "./division/DivisionAdminPanel";
import { UnionAdminPanel } from "./union/UnionAdminPanel";
import { useUserStore } from "@/store/userStore";

interface AdminDashboardProps {
  role: Extract<UserRole, "application_admin" | "union_admin" | "division_admin">;
}

export function AdminDashboard({ role }: AdminDashboardProps) {
  const { division } = useUserStore();

  const formattedTitle = role
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (role === "division_admin") {
    if (!division) {
      return (
        <ThemedView style={styles.container}>
          <ThemedText>Loading division information...</ThemedText>
        </ThemedView>
      );
    }
    return <DivisionAdminPanel division={division} />;
  }

  if (role === "union_admin") {
    return <UnionAdminPanel />;
  }

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
