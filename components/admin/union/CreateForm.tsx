import React, { useState, useEffect } from "react";
import { StyleSheet, View, TouchableOpacity, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { CreateDivisionForm } from "./CreateDivisionForm";
import { CreateZoneForm } from "./CreateZoneForm";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useDivisionManagementStore } from "@/store/divisionManagementStore";

export const CreateForm = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const [activeTab, setActiveTab] = useState("division");
  const { fetchDivisions } = useDivisionManagementStore();

  useEffect(() => {
    // Fetch divisions when component mounts
    fetchDivisions();
  }, [fetchDivisions]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "division" && {
              borderBottomColor: themeColor.tint,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab("division")}
        >
          <ThemedText style={[styles.tabText, activeTab === "division" && { color: themeColor.tint }]}>
            Create Division
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === "zone" && {
              borderBottomColor: themeColor.tint,
              borderBottomWidth: 2,
            },
          ]}
          onPress={() => setActiveTab("zone")}
        >
          <ThemedText style={[styles.tabText, activeTab === "zone" && { color: themeColor.tint }]}>
            Create Zone
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={true}
        bounces={false}
      >
        {activeTab === "division" ? <CreateDivisionForm /> : <DivisionBasedZoneForm />}
      </ScrollView>
    </ThemedView>
  );
};

const DivisionBasedZoneForm = () => {
  const colorScheme = useColorScheme() ?? "light";
  const themeColor = Colors[colorScheme as keyof typeof Colors];

  const { divisions } = useDivisionManagementStore();

  if (divisions.length === 0) {
    return (
      <ThemedView style={styles.emptyStateContainer}>
        <ThemedText style={styles.emptyStateTitle}>No Divisions Available</ThemedText>
        <ThemedText style={styles.emptyStateText}>
          You need to create at least one division before you can add zones.
        </ThemedText>
        <ThemedText style={styles.emptyStateInstructions}>Please use the "Create Division" tab first.</ThemedText>
      </ThemedView>
    );
  }

  return <CreateZoneForm />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  tabContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 120,
    alignItems: "center",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyStateContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyStateInstructions: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
  },
});
