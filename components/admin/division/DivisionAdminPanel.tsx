import React, { useState, forwardRef, Ref } from "react";
import { StyleSheet, Platform, Pressable, useWindowDimensions, View } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MemberManagement } from "./MemberManagement";
import { DivisionOfficers } from "./DivisionOfficers";
import { MessageCenter } from "./MessageCenter";
import { AdminMessages } from "./AdminMessages";
import { CalendarManager } from "./CalendarManager";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  withSpring,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { AdminMessageBadge } from "@/components/ui/AdminMessageBadge";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedThemedView = Animated.createAnimatedComponent(ThemedView);

type Section = "members" | "officers" | "messages" | "adminMessages" | "calendar";

type IconName = keyof typeof Ionicons.glyphMap;

interface SectionButton {
  key: Section;
  title: string;
  icon: IconName;
  outlineIcon: IconName;
}

const sections: SectionButton[] = [
  { key: "members", title: "Member Management", icon: "people", outlineIcon: "people-outline" },
  { key: "officers", title: "Division Officers", icon: "ribbon", outlineIcon: "ribbon-outline" },
  { key: "messages", title: "Member Messages/News", icon: "mail", outlineIcon: "mail-outline" },
  { key: "adminMessages", title: "Admin Messages", icon: "chatbox", outlineIcon: "chatbox-outline" },
  { key: "calendar", title: "Calendar(s)", icon: "calendar", outlineIcon: "calendar-outline" },
];

// Mobile breakpoint for web
const MOBILE_BREAKPOINT = 768;

interface DivisionAdminPanelProps {
  division: string;
}

export const DivisionAdminPanel = forwardRef<View, DivisionAdminPanelProps>(({ division }, ref: Ref<View>) => {
  const [activeSection, setActiveSection] = useState<Section>("members");
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const isMobileWeb = isWeb && width < MOBILE_BREAKPOINT;
  const shouldUseMobileLayout = !isWeb || isMobileWeb;
  const ButtonComponent = isWeb ? AnimatedPressable : AnimatedTouchableOpacity;

  const renderNavigationButton = (section: SectionButton) => {
    const isActive = activeSection === section.key;
    const buttonAnimation = useAnimatedStyle(() => {
      const scale = withSpring(isActive ? 1.1 : 1, {
        damping: 15,
        stiffness: 150,
      });
      return {
        transform: [{ scale }],
      };
    });

    return (
      <ButtonComponent
        key={section.key}
        style={[
          shouldUseMobileLayout ? styles.mobileSectionButton : styles.webSectionButton,
          isActive && (shouldUseMobileLayout ? styles.mobileActiveSectionButton : styles.webActiveSectionButton),
          buttonAnimation,
        ]}
        onPress={() => setActiveSection(section.key)}
      >
        <Ionicons
          name={isActive ? section.icon : section.outlineIcon}
          size={shouldUseMobileLayout ? 28 : 24}
          color={isActive ? (shouldUseMobileLayout ? tintColor : "#000000") : Colors[colorScheme].text}
        />
        {section.key === "adminMessages" && <AdminMessageBadge />}
        {!shouldUseMobileLayout && (
          <ThemedText style={[styles.sectionButtonText, isActive && styles.activeSectionButtonText]}>
            {section.title}
          </ThemedText>
        )}
      </ButtonComponent>
    );
  };

  const renderSection = () => {
    const Component = (() => {
      switch (activeSection) {
        case "members":
          return MemberManagement;
        case "officers":
          return () => <DivisionOfficers division={division} />;
        case "messages":
          return MessageCenter;
        case "adminMessages":
          return AdminMessages;
        case "calendar":
          return CalendarManager;
        default:
          return null;
      }
    })();

    if (!Component) return null;

    return (
      <AnimatedThemedView
        entering={shouldUseMobileLayout ? SlideInRight : FadeIn}
        exiting={shouldUseMobileLayout ? SlideOutLeft : FadeOut}
        style={shouldUseMobileLayout ? styles.mobileContent : styles.webContent}
      >
        <Component />
      </AnimatedThemedView>
    );
  };

  return (
    <ThemedView style={[styles.container, { flexDirection: shouldUseMobileLayout ? "column" : "row" }]} ref={ref}>
      <AnimatedThemedView style={shouldUseMobileLayout ? styles.mobileNavigation : styles.webNavigation}>
        {sections.map(renderNavigationButton)}
      </AnimatedThemedView>
      {renderSection()}
    </ThemedView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  webNavigation: {
    width: 250,
    borderRightWidth: 1,
    borderRightColor: "#ccc",
    padding: 16,
    gap: 8,
  },
  mobileNavigation: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    backgroundColor: Colors.light.background,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  webContent: {
    flex: 1,
    padding: 20,
    minHeight: 0,
    overflow: "hidden",
  },
  mobileContent: {
    flex: 1,
    padding: 16,
    minHeight: 0,
    overflow: "hidden",
  },
  webSectionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    gap: 12,
    cursor: "pointer",
  },
  webActiveSectionButton: {
    backgroundColor: Colors.light.tint,
  },
  mobileSectionButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 8,
    minWidth: 48,
  },
  mobileActiveSectionButton: {
    backgroundColor: `${Colors.light.tint}20`,
  },
  sectionButtonText: {
    fontSize: 16,
  },
  activeSectionButtonText: {
    color: "#000000",
  },
});
