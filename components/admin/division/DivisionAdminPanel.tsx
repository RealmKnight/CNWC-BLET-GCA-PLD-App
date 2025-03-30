import React, { useState } from "react";
import { StyleSheet, Platform, Pressable, useWindowDimensions } from "react-native";
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
import { CalendarAllotments } from "./CalendarAllotments";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  withSpring,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  useSharedValue,
} from "react-native-reanimated";

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
  { key: "messages", title: "Message Center", icon: "mail", outlineIcon: "mail-outline" },
  { key: "adminMessages", title: "Admin Messages", icon: "chatbox", outlineIcon: "chatbox-outline" },
  { key: "calendar", title: "Calendar Allotments", icon: "calendar", outlineIcon: "calendar-outline" },
];

const isWeb = Platform.OS === "web";
const ButtonComponent = isWeb ? AnimatedPressable : AnimatedTouchableOpacity;

interface DivisionAdminPanelProps {
  division: string;
}

export function DivisionAdminPanel({ division }: DivisionAdminPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>("members");
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;
  const { width } = useWindowDimensions();

  const renderNavigationButton = (section: SectionButton) => {
    const isActive = activeSection === section.key;
    const buttonAnimation = useSharedValue(isActive ? 1 : 0);

    React.useEffect(() => {
      buttonAnimation.value = withTiming(isActive ? 1 : 0, { duration: 200 });
    }, [isActive]);

    const animatedButtonStyle = useAnimatedStyle(() => {
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
          isWeb ? styles.webSectionButton : styles.mobileSectionButton,
          isActive && (isWeb ? styles.webActiveSectionButton : styles.mobileActiveSectionButton),
          animatedButtonStyle,
        ]}
        onPress={() => setActiveSection(section.key)}
      >
        <Ionicons
          name={isActive ? section.icon : section.outlineIcon}
          size={isWeb ? 24 : 28}
          color={isActive ? (isWeb ? "#000000" : tintColor) : Colors[colorScheme].text}
        />
        {isWeb && (
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
          return () => <MemberManagement division={division} />;
        case "officers":
          return () => <DivisionOfficers division={division} />;
        case "messages":
          return () => <MessageCenter division={division} />;
        case "adminMessages":
          return () => <AdminMessages division={division} />;
        case "calendar":
          return () => <CalendarAllotments division={division} />;
        default:
          return null;
      }
    })();

    if (!Component) return null;

    return (
      <AnimatedThemedView
        entering={isWeb ? FadeIn : SlideInRight}
        exiting={isWeb ? FadeOut : SlideOutLeft}
        style={isWeb ? styles.webContent : styles.mobileContent}
      >
        <Component />
      </AnimatedThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <AnimatedThemedView style={isWeb ? styles.webNavigation : styles.mobileNavigation}>
        {sections.map(renderNavigationButton)}
      </AnimatedThemedView>

      {renderSection()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: isWeb ? "row" : "column",
    height: "100%",
    minHeight: 0,
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
    overflow: Platform.OS === "web" ? "hidden" : undefined,
  },
  mobileContent: {
    flex: 1,
    padding: 16,
    minHeight: 0,
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
