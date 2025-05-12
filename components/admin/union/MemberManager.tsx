import React, { useState } from "react";
import { StyleSheet } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { TabBar, Tab } from "@/components/admin/TabBar";
import { RosterList } from "@/components/admin/rosters/RosterList";
import { RosterDetails } from "@/components/admin/rosters/RosterDetails";
import { DynamicRosterView } from "@/components/admin/rosters/DynamicRosterView";
import { RosterPDFExporter } from "@/components/admin/rosters/RosterPDFExporter";
import { Roster } from "@/types/rosters";
import { PlatformScrollView } from "@/components/PlatformScrollView";

// Placeholder components for member management tabs
const MembersTab = () => (
  <PlatformScrollView contentContainerStyle={styles.tabContentContainer}>
    <ThemedView style={styles.tabContent}>
      <ThemedText>Members Management Coming Soon</ThemedText>
    </ThemedView>
  </PlatformScrollView>
);

const MemberTransfersTab = () => (
  <PlatformScrollView contentContainerStyle={styles.tabContentContainer}>
    <ThemedView style={styles.tabContent}>
      <ThemedText>Member Transfers Coming Soon</ThemedText>
    </ThemedView>
  </PlatformScrollView>
);

const BulkActionsTab = () => (
  <PlatformScrollView contentContainerStyle={styles.tabContentContainer}>
    <ThemedView style={styles.tabContent}>
      <ThemedText>Bulk Member Actions Coming Soon</ThemedText>
    </ThemedView>
  </PlatformScrollView>
);

// Rosters tab component
const RostersTab = () => {
  const [selectedRoster, setSelectedRoster] = useState<Roster | null>(null);
  const [showDynamicRoster, setShowDynamicRoster] = useState(false);

  // Handler to view roster details
  const handleSelectRoster = (roster: Roster) => {
    setSelectedRoster(roster);
    setShowDynamicRoster(false);
  };

  // Handler to go back to roster list
  const handleBackToList = () => {
    setSelectedRoster(null);
  };

  // Handler to toggle dynamic roster view
  const handleToggleDynamicRoster = () => {
    setShowDynamicRoster(!showDynamicRoster);
    setSelectedRoster(null);
  };

  return (
    <ThemedView style={styles.rosterContainer}>
      {!selectedRoster && !showDynamicRoster && (
        <PlatformScrollView>
          <ThemedView style={styles.rosterHeader}>
            <ThemedText style={styles.rosterHeaderTitle}>Rosters Management</ThemedText>
            <ThemedText style={styles.rosterHeaderSubtitle}>
              View and manage yearly rosters or generate dynamic member lists.
            </ThemedText>

            <ThemedView style={styles.rosterOptionsContainer}>
              <ThemedView style={styles.rosterOption} lightColor={Colors.light.card} darkColor={Colors.dark.card}>
                <ThemedText style={styles.rosterOptionTitle}>Yearly Saved Rosters</ThemedText>
                <ThemedText style={styles.rosterOptionDescription}>
                  View officially calculated rosters for the current and previous years.
                </ThemedText>
              </ThemedView>

              <ThemedView style={styles.rosterOption} lightColor={Colors.light.card} darkColor={Colors.dark.card}>
                <ThemedText style={styles.rosterOptionTitle}>Dynamic Roster Generator</ThemedText>
                <ThemedText style={styles.rosterOptionDescription}>
                  Generate on-the-fly member lists based on different roster calculation logic.
                </ThemedText>
                <ThemedView style={styles.rosterOptionButtonContainer}>
                  <ThemedView
                    style={styles.rosterOptionButton}
                    lightColor={Colors.light.tint}
                    darkColor={Colors.dark.tint}
                  >
                    <ThemedText style={styles.rosterOptionButtonText} onPress={handleToggleDynamicRoster}>
                      Open Generator
                    </ThemedText>
                  </ThemedView>
                </ThemedView>
              </ThemedView>
            </ThemedView>
          </ThemedView>

          <RosterPDFExporter>
            {(handleExportPdf) => <RosterList onSelectRoster={handleSelectRoster} />}
          </RosterPDFExporter>
        </PlatformScrollView>
      )}

      {selectedRoster && !showDynamicRoster && (
        <RosterPDFExporter>
          {(handleExportPdf) => (
            <PlatformScrollView>
              <RosterDetails roster={selectedRoster} onBack={handleBackToList} onExportPdf={handleExportPdf} />
            </PlatformScrollView>
          )}
        </RosterPDFExporter>
      )}

      {showDynamicRoster && (
        <RosterPDFExporter>
          {(handleExportPdf) => (
            <PlatformScrollView>
              <ThemedView style={styles.dynamicRosterContainer}>
                <ThemedView style={styles.dynamicRosterHeader}>
                  <ThemedText style={styles.backText} onPress={() => setShowDynamicRoster(false)}>
                    ← Back to Rosters
                  </ThemedText>
                </ThemedView>
                <DynamicRosterView onExportPdf={handleExportPdf} />
              </ThemedView>
            </PlatformScrollView>
          )}
        </RosterPDFExporter>
      )}
    </ThemedView>
  );
};

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
  tabContentContainer: {
    flexGrow: 1,
  },
  tabContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  rosterContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  rosterHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  rosterHeaderTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  rosterHeaderSubtitle: {
    fontSize: 16,
    marginBottom: 16,
    opacity: 0.8,
  },
  rosterOptionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 16,
  },
  rosterOption: {
    flex: 1,
    minWidth: 250,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  rosterOptionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  rosterOptionDescription: {
    fontSize: 14,
    marginBottom: 16,
    opacity: 0.8,
  },
  rosterOptionButtonContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    backgroundColor: Colors.dark.card,
  },
  rosterOptionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  rosterOptionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  dynamicRosterContainer: {
    flex: 1,
  },
  dynamicRosterHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  backText: {
    fontSize: 16,
    color: Colors.light.tint,
  },
});
