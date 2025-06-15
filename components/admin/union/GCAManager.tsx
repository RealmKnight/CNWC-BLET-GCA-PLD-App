import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";
import { GCADocumentsAdmin } from "./GCADocumentsAdmin";
import { SMSCostDashboard } from "@/components/admin/union/settings/SMSCostDashboard";
import { EmergencySMS } from "@/components/admin/union/settings/EmergencySMS";

// Placeholder components for GCA management tabs
const OfficersTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>GCA Officers Management Coming Soon</ThemedText>
  </ThemedView>
);

const SettingsTab = () => {
  const [activeSettingsTab, setActiveSettingsTab] = useState("smsCosts");

  const settingsTabs: Tab[] = [
    { key: "smsCosts", title: "SMS Costs", icon: "stats-chart", outlineIcon: "stats-chart-outline" },
    { key: "emergencySms", title: "Emergency SMS", icon: "alert", outlineIcon: "alert-outline" },
  ];

  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case "smsCosts":
        return <SMSCostDashboard />;
      case "emergencySms":
        return <EmergencySMS />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <TabBar tabs={settingsTabs} activeTab={activeSettingsTab} onTabChange={setActiveSettingsTab} />
      <ThemedView style={{ flex: 1 }}>{renderSettingsContent()}</ThemedView>
    </ThemedView>
  );
};

const MeetingsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>GCA Meetings Management Coming Soon</ThemedText>
  </ThemedView>
);

export function GCAManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("officers");

  const tabs: Tab[] = [
    { key: "officers", title: "Officers", icon: "people", outlineIcon: "people-outline" },
    { key: "settings", title: "Settings", icon: "settings", outlineIcon: "settings-outline" },
    { key: "meetings", title: "Meetings", icon: "calendar", outlineIcon: "calendar-outline" },
    { key: "documents", title: "Documents", icon: "document-text", outlineIcon: "document-text-outline" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "officers":
        return <OfficersTab />;
      case "settings":
        return <SettingsTab />;
      case "meetings":
        return <MeetingsTab />;
      case "documents":
        return <GCADocumentsAdmin />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">GCA Management</ThemedText>
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
