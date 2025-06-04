import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { StyleSheet, Platform, Pressable, useWindowDimensions, View, TouchableOpacity, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DivisionOfficers } from "./DivisionOfficers";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft, runOnJS } from "react-native-reanimated";
import { DivisionMeetings } from "./DivisionMeetings";
import { useDivisionManagementStore, DivisionView } from "@/store/divisionManagementStore";
import { DivisionDocumentsAdmin } from "./DivisionDocumentsAdmin";
import { DivisionEmailManagement } from "./DivisionEmailManagement";
import { DivisionAnnouncementsAdmin } from "./DivisionAnnouncementsAdmin";

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

  // Add refs to track component state and prevent race conditions
  const isMountedRef = useRef(true);
  const previousDivisionRef = useRef(division);
  const [isAnimating, setIsAnimating] = useState(false);
  const [divisionKey, setDivisionKey] = useState(division);

  // Track when division changes to handle cleanup and prevent stale state
  useEffect(() => {
    if (previousDivisionRef.current !== division) {
      console.log(`[DivisionManagement] Division changed from ${previousDivisionRef.current} to ${division}`);

      // Update refs first
      previousDivisionRef.current = division;

      // Create new key to force component re-mount
      setDivisionKey(division);

      // Set animating state
      setIsAnimating(true);

      // Reset animation state after a delay to allow for proper cleanup
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          setIsAnimating(false);
        }
      }, 500); // Increased timeout for better stability

      return () => clearTimeout(timer);
    }
  }, [division]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Memoize the content key to ensure proper component unmounting/mounting
  const contentKey = useMemo(() => `${divisionKey}-${currentView}`, [divisionKey, currentView]);

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
          onPress={() => {
            if (!isAnimating) {
              setCurrentView(division, view);
            }
          }}
          disabled={isAnimating}
        >
          <Ionicons name={icon as any} size={iconSize} color={iconColor} />
          {!isMobile && <ThemedText style={[styles.buttonText, isActive && styles.activeText]}>{label}</ThemedText>}
        </ButtonComponent>
      );
    },
    [currentView, isMobile, tintColor, colorScheme, division, setCurrentView, isAnimating]
  );

  // Content Rendering based on selected view with proper key management
  const renderContent = useCallback(() => {
    const componentProps = { division, key: contentKey };

    switch (currentView) {
      case "announcements":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionAnnouncementsAdmin {...componentProps} />
          </ScrollView>
        );
      case "documents":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionDocumentsAdmin {...componentProps} />
          </ScrollView>
        );
      case "officers":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionOfficers {...componentProps} />
          </ScrollView>
        );
      case "meetings":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionMeetings {...componentProps} isAdmin={true} />
          </ScrollView>
        );
      case "emails":
        return (
          <ScrollView
            key={`${contentKey}-scroll`}
            style={[styles.contentScroll, Platform.OS === "android" && styles.androidContentScroll]}
            contentContainerStyle={styles.contentContainer}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            <DivisionEmailManagement {...componentProps} />
          </ScrollView>
        );
      default:
        return null;
    }
  }, [currentView, division, contentKey]);

  // Animation callbacks for better lifecycle management
  const handleAnimationStart = useCallback(() => {
    if (isMountedRef.current) {
      setIsAnimating(true);
    }
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isMountedRef.current) {
      setIsAnimating(false);
    }
  }, []);

  return (
    <ThemedView style={styles.container} key={divisionKey}>
      {/* Only render if division matches divisionKey to prevent stale data */}
      {division === divisionKey ? (
        <>
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
              key={contentKey}
              entering={
                isMobile
                  ? SlideInRight.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationEnd)();
                      }
                    })
                  : FadeIn.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationEnd)();
                      }
                    })
              }
              exiting={
                isMobile
                  ? SlideOutLeft.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationStart)();
                      }
                    })
                  : FadeOut.withCallback((finished) => {
                      "worklet";
                      if (finished) {
                        runOnJS(handleAnimationStart)();
                      }
                    })
              }
              style={styles.content}
            >
              {renderContent()}
            </AnimatedThemedView>
          </View>
        </>
      ) : (
        <ThemedView style={styles.loadingContainer}>
          <ThemedText>Switching to {division}...</ThemedText>
        </ThemedView>
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
