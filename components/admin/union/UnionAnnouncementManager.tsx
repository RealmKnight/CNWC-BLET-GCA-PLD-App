import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";

// Placeholder components for announcement tabs
const CreateAnnouncementTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Create Announcement Form Coming Soon</ThemedText>
  </ThemedView>
);

const ManageAnnouncementsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Manage Announcements Coming Soon</ThemedText>
  </ThemedView>
);

const ScheduledAnnouncementsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Scheduled Announcements Coming Soon</ThemedText>
  </ThemedView>
);

const AnalyticsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Announcement Analytics Coming Soon</ThemedText>
  </ThemedView>
);

export function UnionAnnouncementManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("create");

  const tabs: Tab[] = [
    { key: "create", title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: "manage", title: "Manage", icon: "list", outlineIcon: "list-outline" },
    { key: "scheduled", title: "Scheduled", icon: "calendar", outlineIcon: "calendar-outline" },
    { key: "analytics", title: "Analytics", icon: "analytics", outlineIcon: "analytics-outline" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "create":
        return <CreateAnnouncementTab />;
      case "manage":
        return <ManageAnnouncementsTab />;
      case "scheduled":
        return <ScheduledAnnouncementsTab />;
      case "analytics":
        return <AnalyticsTab />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Union Announcements</ThemedText>
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
