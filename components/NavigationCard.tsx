import React from "react";
import { StyleSheet, TouchableOpacity, useWindowDimensions, ViewStyle, Platform, Pressable } from "react-native";
import { Link, LinkProps } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

interface NavigationCardProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: LinkProps["href"];
  params?: Record<string, string | number>;
  withAnchor?: boolean;
  badge?: React.ReactNode;
  badgeCount?: number;
  badgeColor?: string;
}

type ColorSchemeName = keyof typeof Colors;

export function NavigationCard({
  title,
  description,
  icon,
  href,
  params,
  withAnchor = true,
  badge,
  badgeCount,
  badgeColor = Colors.dark.error, // Default to error color for visibility
}: NavigationCardProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  // Calculate card width based on platform
  const cardWidth = isWeb ? 400 : width - 32; // 400px on web, full width - 32px margin on mobile

  const cardStyle = [styles.cardWrapper, { width: cardWidth }];

  // Render badge if provided
  const renderBadge = () => {
    if (badge) {
      return badge; // Custom badge component
    }

    if (badgeCount && badgeCount > 0) {
      const displayCount = badgeCount > 99 ? "99+" : badgeCount.toString();
      return (
        <ThemedView style={[styles.badge, { backgroundColor: badgeColor }]}>
          <ThemedText style={styles.badgeText}>{displayCount}</ThemedText>
        </ThemedView>
      );
    }

    return null;
  };

  const CardContent = () => (
    <ThemedView style={styles.card}>
      <ThemedView style={styles.innerContainer}>
        <ThemedView style={styles.iconContainer}>
          <Ionicons
            name={icon}
            size={32}
            color="#B4975A" // Using BLET gold for icons
          />
          {/* Badge positioned over icon */}
          {renderBadge()}
        </ThemedView>
        <ThemedView style={styles.content}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={styles.description} numberOfLines={2}>
            {description}
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.chevronContainer}>
          <Ionicons name="chevron-forward" size={24} color="#B4975A" />
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );

  if (Platform.OS === "web") {
    return (
      <Link href={href} asChild>
        <Pressable style={({ hovered }) => [cardStyle, hovered && styles.webHovered]}>
          <CardContent />
        </Pressable>
      </Link>
    );
  }

  return (
    <Link href={href} asChild>
      <TouchableOpacity
        style={cardStyle}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Navigate to ${title}`}
      >
        <CardContent />
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  card: {
    backgroundColor: "#1C1C1E",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#B4975A",
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
    elevation: 4,
    overflow: "hidden",
    width: "100%",
    padding: 1,
  },
  innerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    width: "100%",
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(180, 151, 90, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative", // Add relative positioning for badge positioning
  },
  content: {
    flex: 1,
    marginHorizontal: 16,
    width: 0, // This forces text wrapping
  },
  chevronContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    lineHeight: 20,
  },
  webHovered: {
    transform: [{ translateY: -2 }],
    boxShadow: "0 0 10px 0 rgba(0, 0, 0, 0.1)",
  },
  // Badge styles following existing patterns
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    zIndex: 1,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
