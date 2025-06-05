import React, { useState, useRef, forwardRef, Ref, useEffect } from "react";
import { View, StyleSheet, Platform, Pressable, TouchableOpacity, useWindowDimensions } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { MemberManagement } from "./MemberManagement";
import { DivisionManagement } from "./DivisionManagement";
import { MessageCenter } from "./MessageCenter";
import { AdminMessages } from "./AdminMessages";
import { CalendarManager } from "./CalendarManager";
import { EmailAlertsBadge } from "@/components/ui/EmailAlertsBadge";
import { useUserStore } from "@/store/userStore";
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

type Section = "members" | "division" | "messages" | "adminMessages" | "calendar";

type IconName = keyof typeof Ionicons.glyphMap;

interface SectionButton {
  key: Section;
  title: string;
  icon: IconName;
  outlineIcon: IconName;
}

const sections: SectionButton[] = [
  { key: "members", title: "Member Management", icon: "people", outlineIcon: "people-outline" },
  { key: "division", title: "Division Management", icon: "business", outlineIcon: "business-outline" },
  { key: "messages", title: "Member Messages/News", icon: "mail", outlineIcon: "mail-outline" },
  { key: "adminMessages", title: "Admin Messages", icon: "chatbox", outlineIcon: "chatbox-outline" },
  { key: "calendar", title: "Calendar(s)", icon: "calendar", outlineIcon: "calendar-outline" },
];

// Mobile breakpoint for web
const MOBILE_BREAKPOINT = 768;

interface DivisionAdminPanelProps {
  division: string;
}

export const DivisionAdminPanel = forwardRef<View, DivisionAdminPanelProps>(
  ({ division: initialDivision }, ref: Ref<View>) => {
    const [activeSection, setActiveSection] = useState<Section>("members");
    const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
    const tintColor = Colors[colorScheme].tint;
    const { width } = useWindowDimensions();

    // Get current division from userStore for union admins, fallback to prop for division admins
    const userRole = useUserStore((state) => state.userRole);
    const userStoreDivision = useUserStore((state) => state.division);
    const isUnionAdmin = userRole === "application_admin" || userRole === "union_admin";

    // Use userStore division for union admins (they can change divisions), initial prop for division admins
    const currentDivision = isUnionAdmin ? userStoreDivision || initialDivision : initialDivision;

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
          {section.key === "division" && <EmailAlertsBadge divisionFilter={currentDivision} />}
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
          case "division":
            return () => <DivisionManagement division={currentDivision} key={`division-mgmt-${currentDivision}`} />;
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
          key={`section-${activeSection}-${currentDivision}`}
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
  }
);

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
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
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
