import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";
import { DivisionsList } from "@/components/admin/union/DivisionsList";
import { CreateForm } from "@/components/admin/union/CreateForm";
import { OfficersManagement } from "@/components/admin/union/OfficersManagement";
import { DivisionSettings } from "@/components/admin/union/DivisionSettings";

// Define tab keys as constants to avoid string typos
export const TABS = {
  LIST: "list",
  CREATE: "create",
  OFFICERS: "officers",
  SETTINGS: "settings",
};

// Placeholder component for settings tab
const DivisionSettingsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Division Settings Coming Soon</ThemedText>
  </ThemedView>
);

export function DivisionManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState(TABS.LIST);

  const tabs: Tab[] = [
    { key: TABS.LIST, title: "Divisions", icon: "list", outlineIcon: "list-outline" },
    { key: TABS.CREATE, title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: TABS.OFFICERS, title: "Officers", icon: "people", outlineIcon: "people-outline" },
    { key: TABS.SETTINGS, title: "Settings", icon: "settings", outlineIcon: "settings-outline" },
  ];

  // Method to change tabs and perform any necessary setup
  const switchToTab = (tabKey: string) => {
    setActiveTab(tabKey);
  };

  const renderContent = () => {
    switch (activeTab) {
      case TABS.LIST:
        return <DivisionsList onSwitchTab={switchToTab} />;
      case TABS.CREATE:
        return <CreateForm />;
      case TABS.OFFICERS:
        return <OfficersManagement />;
      case TABS.SETTINGS:
        return <DivisionSettings />;
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
