import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";
import { CreateEditAdvertisement } from "@/components/admin/advertisements/CreateEditAdvertisement";
import { AdvertisementCampaigns } from "@/components/admin/advertisements/AdvertisementCampaigns";
import { AdvertisementAnalytics } from "@/components/admin/advertisements/AdvertisementAnalytics";

export function AdvertisementManager() {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState("manage");
  const [editingAdId, setEditingAdId] = useState<string | undefined>(undefined);

  const tabs: Tab[] = [
    { key: "create", title: "Create", icon: "add-circle", outlineIcon: "add-circle-outline" },
    { key: "manage", title: "Manage", icon: "list", outlineIcon: "list-outline" },
    { key: "analytics", title: "Analytics", icon: "analytics", outlineIcon: "analytics-outline" },
  ];

  const handleAdCreated = () => {
    setActiveTab("manage");
    setEditingAdId(undefined);
  };

  const handleEditAd = (id: string) => {
    setEditingAdId(id);
    setActiveTab("create");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "create":
        return <CreateEditAdvertisement advertisementId={editingAdId} onSave={handleAdCreated} />;
      case "manage":
        return <AdvertisementCampaigns onEditAdvertisement={handleEditAd} />;
      case "analytics":
        return <AdvertisementAnalytics />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Advertisement Management</ThemedText>
        <ThemedText style={styles.subtitle}>
          {activeTab === "create"
            ? editingAdId
              ? "Edit Existing Advertisement"
              : "Create New Advertisement"
            : activeTab === "manage"
            ? "Manage Advertisement Campaigns"
            : "View Advertisement Analytics"}
        </ThemedText>
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
  subtitle: {
    opacity: 0.7,
    marginTop: 4,
  },
});
