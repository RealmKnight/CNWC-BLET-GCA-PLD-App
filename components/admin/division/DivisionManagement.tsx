import React, { useState, useCallback } from "react";
import { StyleSheet, Platform, Pressable, useWindowDimensions, View, TouchableOpacity, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DivisionOfficers } from "./DivisionOfficers";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from "react-native-reanimated";
import { DivisionMeetings } from "./DivisionMeetings";
import { useDivisionManagementStore, DivisionView } from "@/store/divisionManagementStore";
import { DivisionDocumentsAdmin } from "./DivisionDocumentsAdmin";
import { DivisionEmailManagement } from "./DivisionEmailManagement";

const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

interface DivisionManagementProps {
  division: string;
}

export function DivisionManagement({ division }: DivisionManagementProps) {
  // Use specific selectors instead of returning an object
  const currentView = useDivisionManagementStore((state) => state.currentView[division] || "announcements");
  const setCurrentView = useDivisionManagementStore((state) => state.setCurrentView);

  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== "web" || width < 768;

  // Action Button Rendering
  const renderActionButton = useCallback(
    (view: DivisionView, icon: string, label: string) => {
      const isActive = currentView === view;
      const iconColor = isActive ? Colors[colorScheme].background : tintColor;
      const buttonSize = isMobile ? 40 : "auto";
      const iconSize = isMobile ? 20 : 24;
      const ButtonComponent = Platform.OS === "web" ? Pressable : TouchableOpacity;

      return (
        <ButtonComponent
          key={view}
          style={[
            styles.actionButton,
            isActive && styles.activeButton,
            isMobile && styles.mobileActionButton,
            { minWidth: buttonSize, height: buttonSize },
          ]}
          onPress={() => setCurrentView(division, view)}
        >
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
          {!isMobile && <ThemedText style={[styles.buttonText, isActive && styles.activeText]}>{label}</ThemedText>}
        </ButtonComponent>
      );
    },
    [currentView, isMobile, tintColor, colorScheme, division, setCurrentView]
  );

  // Content Rendering based on selected view
  const renderContent = useCallback(() => {
    switch (currentView) {
      case "announcements":
        return (
          <ScrollView
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
          >
            <ThemedView style={styles.placeholderContainer}>
              <ThemedText style={styles.placeholderText}>Announcements Management Coming Soon</ThemedText>
            </ThemedView>
          </ScrollView>
        );
      case "documents":
        return (
          <ScrollView
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
          >
            <DivisionDocumentsAdmin division={division} />
          </ScrollView>
        );
      case "officers":
        return (
          <ScrollView
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
          >
            <DivisionOfficers division={division} />
          </ScrollView>
        );
      case "meetings":
        return (
          <ScrollView
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
          >
            <DivisionMeetings division={division} isAdmin={true} />
          </ScrollView>
        );
      case "emails":
        return (
          <ScrollView
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
          >
            <DivisionEmailManagement division={division} />
          </ScrollView>
        );
      default:
        return null;
    }
  }, [currentView, division]);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.actionButtons}>
            {renderActionButton("announcements", "megaphone-outline", "Announcements")}
            {renderActionButton("meetings", "people-circle-outline", "Meetings")}
            {renderActionButton("documents", "document-text-outline", "Documents")}
            {renderActionButton("officers", "ribbon-outline", "Officers")}
            {renderActionButton("emails", "mail-outline", "Emails")}
          </View>
        </View>
        <View style={styles.divisionContainer}>
          <View style={styles.divisionRow}>
            <ThemedText style={styles.divisionLabel}>Division: </ThemedText>
            <ThemedText style={styles.divisionText}>{division}</ThemedText>
          </View>
        </View>
      </ThemedView>

      <View style={styles.contentArea}>
        <AnimatedThemedView
          entering={isMobile ? SlideInRight : FadeIn}
          exiting={isMobile ? SlideOutLeft : FadeOut}
          style={styles.content}
        >
          {renderContent()}
        </AnimatedThemedView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    flexShrink: 0,
  },
  activeButton: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  mobileActionButton: {
    padding: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 4,
  },
  activeText: {
    color: Colors.light.background,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    padding: 16,
    ...(Platform.OS === "android" && {
      flexGrow: 1,
      paddingBottom: 50,
    }),
  },
  divisionContainer: {
    ...Platform.select({
      web: { flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 16 },
      default: { flexDirection: "column", width: "100%", gap: 8 },
    }),
  },
  divisionRow: {
    flexDirection: "row",
    alignItems: "center",
    ...Platform.select({
      web: { flexBasis: "auto", marginRight: 16 },
      default: { width: "100%", paddingRight: 0 },
    }),
  },
  divisionLabel: {
    fontSize: 16,
    marginRight: 8,
    fontWeight: "500",
    minWidth: 80,
  },
  divisionText: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  androidContentScroll: {
    flex: 1,
    height: "auto",
    maxHeight: "100%",
  },
  placeholderContainer: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 18,
    textAlign: "center",
    color: Colors.light.textDim,
  },
});
