import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";

// Placeholder components for division management tabs
const DivisionsListTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Divisions List Management Coming Soon</ThemedText>
  </ThemedView>
);

const CreateDivisionTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Create Division Form Coming Soon</ThemedText>
  </ThemedView>
);

const DivisionOfficersTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Division Officers Management Coming Soon</ThemedText>
  </ThemedView>
);

const DivisionSettingsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Division Settings Coming Soon</ThemedText>
  </ThemedView>
);

export function DivisionManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("list");

  const tabs: Tab[] = [
    { key: "list", title: "Divisions", icon: "list", outlineIcon: "list-outline" },
    { key: "create", title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: "officers", title: "Officers", icon: "people", outlineIcon: "people-outline" },
    { key: "settings", title: "Settings", icon: "settings", outlineIcon: "settings-outline" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "list":
        return <DivisionsListTab />;
      case "create":
        return <CreateDivisionTab />;
      case "officers":
        return <DivisionOfficersTab />;
      case "settings":
        return <DivisionSettingsTab />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Division Management</ThemedText>
      </ThemedView>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {renderContent()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
});
