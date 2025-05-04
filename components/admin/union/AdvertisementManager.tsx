import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";

// Placeholder components for advertisement tabs
const CreateAdvertisementTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Create Advertisement Form Coming Soon</ThemedText>
  </ThemedView>
);

const ManageAdvertisementsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Manage Advertisements Coming Soon</ThemedText>
  </ThemedView>
);

const AnalyticsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Advertisement Analytics Coming Soon</ThemedText>
  </ThemedView>
);

const SettingsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Advertisement Settings Coming Soon</ThemedText>
  </ThemedView>
);

export function AdvertisementManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("create");

  const tabs: Tab[] = [
    { key: "create", title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: "manage", title: "Manage", icon: "list", outlineIcon: "list-outline" },
    { key: "analytics", title: "Analytics", icon: "analytics", outlineIcon: "analytics-outline" },
    { key: "settings", title: "Settings", icon: "settings", outlineIcon: "settings-outline" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "create":
        return <CreateAdvertisementTab />;
      case "manage":
        return <ManageAdvertisementsTab />;
      case "analytics":
        return <AnalyticsTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Advertisement Management</ThemedText>
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
