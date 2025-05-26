import React from "react";
import { StyleSheet, Platform, useWindowDimensions, View, AccessibilityProps } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { AdminMessageBadge } from "@/components/ui/AdminMessageBadge";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export interface Tab {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  outlineIcon: keyof typeof Ionicons.glyphMap;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabKey: string) => void;
}

// Mobile breakpoint
const MOBILE_BREAKPOINT = 768;

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const colors = Colors[colorScheme];
  const { width } = useWindowDimensions();

  const isWeb = Platform.OS === "web";
  const isMobileWeb = isWeb && width < MOBILE_BREAKPOINT;
  const shouldUseMobileLayout = !isWeb || isMobileWeb;

  const renderTab = (tab: Tab) => {
    const isActive = activeTab === tab.key;
    const isMessagesTab = tab.key === "message";

    const buttonAnimation = useAnimatedStyle(() => {
      const scale = withSpring(isActive ? 1.1 : 1, {
        damping: 15,
        stiffness: 150,
      });
      return {
        transform: [{ scale }],
      };
    });

    const getAccessibilityProps = (): AccessibilityProps => {
      if (Platform.OS === "web") {
        return {
          accessibilityRole: "tab",
          accessibilityState: { selected: isActive },
          accessibilityLabel: `${tab.title} tab`,
        } as AccessibilityProps;
      } else {
        return {
          accessible: true,
          accessibilityLabel: `${tab.title} tab`,
          accessibilityRole: "tab",
          accessibilityState: { selected: isActive },
        } as AccessibilityProps;
      }
    };

    return (
      <AnimatedTouchableOpacity
        key={tab.key}
        style={[
          shouldUseMobileLayout ? styles.mobileTab : styles.webTab,
          isActive && [
            shouldUseMobileLayout ? styles.mobileActiveTab : styles.webActiveTab,
            { backgroundColor: colors.tint + "20" },
          ],
          buttonAnimation,
        ]}
        onPress={() => onTabChange(tab.key)}
        {...getAccessibilityProps()}
      >
        <View style={styles.tabContentWrapper}>
          <Ionicons
            name={isActive ? tab.icon : tab.outlineIcon}
            size={shouldUseMobileLayout ? 28 : 24}
            color={isActive ? colors.tint : colors.icon}
          />
          {!shouldUseMobileLayout && (
            <ThemedText style={[styles.tabText, isActive && [styles.activeTabText, { color: colors.tint }]]}>
              {tab.title}
            </ThemedText>
          )}
          {isMessagesTab && (
            <View style={styles.badgeContainer}>
              <AdminMessageBadge />
            </View>
          )}
        </View>
      </AnimatedTouchableOpacity>
    );
  };

  return (
    <ThemedView
      style={[
        shouldUseMobileLayout ? styles.mobileContainer : styles.webContainer,
        {
          borderBottomColor: colors.border,
          backgroundColor: colors.background,
        },
      ]}
      accessibilityRole="tablist"
    >
      {tabs.map(renderTab)}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    zIndex: 1,
  },
  mobileContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    elevation: 4,
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    zIndex: 1,
  },
  webTab: {
    padding: 12,
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 48,
  },
  webActiveTab: {},
  mobileTab: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 8,
    minWidth: 48,
    minHeight: 48,
  },
  mobileActiveTab: {},
  tabContentWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  tabText: {
    fontSize: 16,
  },
  activeTabText: {
    fontWeight: "600",
  },
  badgeContainer: {
    position: "absolute",
    top: -5,
    right: -10,
    zIndex: 1,
  },
});
