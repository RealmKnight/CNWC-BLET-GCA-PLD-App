import React, { useState } from "react";
import { StyleSheet, Platform, View, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DivisionEmailSettings } from "./DivisionEmailSettings";
import { EmailHistory } from "./EmailHistory";
import { EmailNotificationAlerts } from "../EmailNotificationAlerts";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface DivisionEmailManagementProps {
  division: string;
}

type EmailTab = "alerts" | "settings" | "history";

export function DivisionEmailManagement({ division }: DivisionEmailManagementProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState<EmailTab>("alerts");

  const tabs = [
    {
      id: "alerts" as EmailTab,
      label: "Email Alerts",
      icon: "alert-circle" as keyof typeof Ionicons.glyphMap,
      description: "View and manage email delivery alerts and issues",
    },
    {
      id: "settings" as EmailTab,
      label: "Email Settings",
      icon: "settings-outline" as keyof typeof Ionicons.glyphMap,
      description: "Configure division email addresses and notifications",
    },
    {
      id: "history" as EmailTab,
      label: "Email History",
      icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
      description: "Track email delivery status and manage notifications",
    },
  ];

  const renderTabButton = (tab: (typeof tabs)[0]) => {
    const isActive = activeTab === tab.id;

    return (
      <TouchableOpacityComponent
        key={tab.id}
        style={[
          styles.tabButton,
          {
            backgroundColor: isActive ? Colors[colorScheme].tint : "transparent",
            borderColor: Colors[colorScheme].border,
          },
        ]}
        onPress={() => setActiveTab(tab.id)}
      >
        <View style={styles.tabContent}>
          <Ionicons
            name={tab.icon}
            size={20}
            color={isActive ? Colors[colorScheme].background : Colors[colorScheme].text}
          />
          <ThemedText
            style={[
              styles.tabLabel,
              {
                color: isActive ? Colors[colorScheme].background : Colors[colorScheme].text,
                fontWeight: isActive ? "600" : "normal",
              },
            ]}
          >
            {tab.label}
          </ThemedText>
        </View>
        {!isActive && <ThemedText style={styles.tabDescription}>{tab.description}</ThemedText>}
      </TouchableOpacityComponent>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "alerts":
        return <EmailNotificationAlerts divisionFilter={division} showOnlyUnacknowledged={false} maxAlerts={50} />;
      case "settings":
        return <DivisionEmailSettings division={division} />;
      case "history":
        return <EmailHistory division={division} />;
      default:
        return null;
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.title}>Division Email Management</ThemedText>
        <ThemedText style={styles.subtitle}>
          Manage email settings and track delivery for {division} division
        </ThemedText>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsWrapper}>{tabs.map(renderTabButton)}</View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        <AnimatedThemedView
          key={activeTab}
          style={styles.tabContentContainer}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          layout={Layout.springify()}
        >
          {renderTabContent()}
        </AnimatedThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    backgroundColor: Colors.dark.background,
  },
  tabsWrapper: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    justifyContent: "center",
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 16,
    textAlign: "center",
  },
  tabDescription: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.select({
      android: 50,
      ios: 20,
      default: 20,
    }),
  },
  tabContentContainer: {
    flex: 1,
  },
});
