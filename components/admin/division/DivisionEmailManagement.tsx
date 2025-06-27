import React, { useState } from "react";
import { StyleSheet, Platform, View, ScrollView, useWindowDimensions } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacityComponent } from "@/components/TouchableOpacityComponent";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DivisionEmailSettings } from "./DivisionEmailSettings";
import { EmailHistory } from "./EmailHistory";
import { EmailNotificationAlerts } from "../EmailNotificationAlerts";
import { EmailHealthMonitor } from "../EmailHealthMonitor";
import { EmailReconciliationDashboard } from "../EmailReconciliationDashboard";
import Animated, { FadeIn, FadeOut, Layout, LinearTransition } from "react-native-reanimated";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface DivisionEmailManagementProps {
  division: string;
}

type EmailTab = "alerts" | "settings" | "history" | "health" | "reconciliation";

// Mobile breakpoint
const MOBILE_BREAKPOINT = 768;

export function DivisionEmailManagement({ division }: DivisionEmailManagementProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const [activeTab, setActiveTab] = useState<EmailTab>("alerts");
  const { width } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const isMobileWeb = isWeb && width < MOBILE_BREAKPOINT;
  const shouldUseMobileLayout = !isWeb || isMobileWeb;

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
    {
      id: "health" as EmailTab,
      label: "System Health",
      icon: "pulse" as keyof typeof Ionicons.glyphMap,
      description: "Monitor email system health and performance metrics",
    },
    {
      id: "reconciliation" as EmailTab,
      label: "Reconciliation",
      icon: "checkmark-done" as keyof typeof Ionicons.glyphMap,
      description: "Review email discrepancies and resolve failed operations",
    },
  ];

  const renderTabButton = (tab: (typeof tabs)[0]) => {
    const isActive = activeTab === tab.id;
    const iconColor = isActive ? Colors[colorScheme].background : Colors[colorScheme].text;
    const buttonSize = shouldUseMobileLayout ? 48 : "auto";
    const iconSize = shouldUseMobileLayout ? 24 : 20;

    return (
      <TouchableOpacityComponent
        key={tab.id}
        style={[
          styles.tabButton,
          isActive && styles.activeTabButton,
          shouldUseMobileLayout && styles.mobileTabButton,
          {
            backgroundColor: isActive ? Colors[colorScheme].tint : "transparent",
            borderColor: Colors[colorScheme].border,
            minWidth: buttonSize,
            height: buttonSize,
          },
        ]}
        onPress={() => setActiveTab(tab.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${tab.label} tab`}
        accessibilityHint={tab.description}
      >
        <View style={[styles.tabContent, shouldUseMobileLayout && styles.mobileTabContent]}>
          <Ionicons name={tab.icon} size={iconSize} color={iconColor} />
          {!shouldUseMobileLayout && (
            <ThemedText
              style={[
                styles.tabLabel,
                {
                  color: iconColor,
                  fontWeight: isActive ? "600" : "normal",
                },
              ]}
              numberOfLines={2}
            >
              {tab.label}
            </ThemedText>
          )}
        </View>
        {!shouldUseMobileLayout && !isActive && (
          <ThemedText style={styles.tabDescription} numberOfLines={3}>
            {tab.description}
          </ThemedText>
        )}
      </TouchableOpacityComponent>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "alerts":
        return (
          <EmailNotificationAlerts divisionFilter={division} initialShowOnlyUnacknowledged={true} maxAlerts={50} />
        );
      case "settings":
        return <DivisionEmailSettings division={division} />;
      case "history":
        return <EmailHistory division={division} />;
      case "health":
        return <EmailHealthMonitor />;
      case "reconciliation":
        return <EmailReconciliationDashboard />;
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
          layout={LinearTransition.springify()}
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
    padding: 8,
    minHeight: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  activeTabButton: {
    // Additional styling for active state (already handled by backgroundColor)
  },
  mobileTabButton: {
    padding: 8,
    justifyContent: "center",
    minHeight: 48,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 4,
    flexShrink: 1,
  },
  mobileTabContent: {
    marginBottom: 0,
    gap: 0,
  },
  tabLabel: {
    fontSize: 16,
    textAlign: "center",
    flexShrink: 1,
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
