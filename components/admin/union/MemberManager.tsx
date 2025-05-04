import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";

// Placeholder components for member management tabs
const MembersTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Members Management Coming Soon</ThemedText>
  </ThemedView>
);

const RostersTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Rosters Management Coming Soon</ThemedText>
  </ThemedView>
);

const MemberTransfersTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Member Transfers Coming Soon</ThemedText>
  </ThemedView>
);

const BulkActionsTab = () => (
  <ThemedView style={styles.tabContent}>
    <ThemedText>Bulk Member Actions Coming Soon</ThemedText>
  </ThemedView>
);

export function MemberManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("members");

  const tabs: Tab[] = [
    { key: "members", title: "Members", icon: "people", outlineIcon: "people-outline" },
    { key: "rosters", title: "Rosters", icon: "list", outlineIcon: "list-outline" },
    { key: "transfers", title: "Transfers", icon: "swap-horizontal", outlineIcon: "swap-horizontal-outline" },
    { key: "bulk", title: "Bulk Actions", icon: "layers", outlineIcon: "layers-outline" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "members":
        return <MembersTab />;
      case "rosters":
        return <RostersTab />;
      case "transfers":
        return <MemberTransfersTab />;
      case "bulk":
        return <BulkActionsTab />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Member Management</ThemedText>
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
