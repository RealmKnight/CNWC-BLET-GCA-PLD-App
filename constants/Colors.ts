/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * Currently defaulting to dark mode with a black and gold theme.
 */

const goldPrimary = "#D4AF37";
const goldSecondary = "#AA8C2C";
const goldAccent = "#B8860B";
const black = "#000000";

export interface ColorSchemeColors {
  text: string;
  background: string;
  tint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
  buttonBackground: string;
  buttonText: string;
  buttonBorder: string;
  buttonBackgroundSecondary: string;
  buttonTextSecondary: string;
  buttonBorderSecondary: string;
  error: string;
  success: string;
  primary: string;
  border: string;
  card: string;
  textDim: string;
  // Announcement-specific colors
  announcementBadgeDivision: string; // Blue for division announcements
  announcementBadgeGCA: string; // Green for GCA announcements
}

const tintColorLight = "#2f95dc";
const tintColorDark = "#fff";

export const Colors = {
  dark: {
    text: goldPrimary,
    background: black,
    tint: goldPrimary,
    icon: goldSecondary,
    tabIconDefault: goldSecondary,
    tabIconSelected: goldPrimary,
    // Button specific colors
    buttonBackground: goldPrimary,
    buttonText: black,
    buttonBorder: goldSecondary,
    // Secondary button variant
    buttonBackgroundSecondary: "#252424",
    buttonTextSecondary: goldPrimary,
    buttonBorderSecondary: goldSecondary,
    error: "#ff4d4d",
    // Additional colors
    success: "#28a745",
    primary: goldPrimary,
    border: goldSecondary,
    card: "#1a1a1a",
    textDim: "#666666",
    warning: "#F59E0B",
    disabled: "#6c757d80", // 50% opacity gray
    secondary: "#6c757d",
    // Announcement-specific colors
    announcementBadgeDivision: "#007AFF", // Blue for division announcements
    announcementBadgeGCA: "#34C759", // Green for GCA announcements
  },
  light: {
    // Light theme preserved for future use, currently defaulting to dark
    text: goldPrimary,
    background: black,
    tint: goldPrimary,
    icon: goldSecondary,
    tabIconDefault: goldSecondary,
    tabIconSelected: goldPrimary,
    // Button specific colors
    buttonBackground: goldPrimary,
    buttonText: black,
    buttonBorder: goldSecondary,
    // Secondary button variant
    buttonBackgroundSecondary: black,
    buttonTextSecondary: goldPrimary,
    buttonBorderSecondary: goldSecondary,
    error: "#dc3545",
    // Additional colors
    success: "#28a745",
    primary: goldPrimary,
    border: goldSecondary,
    card: "#f8f9fa",
    textDim: "#6c757d",
    warning: "#F59E0B",
    disabled: "#6c757d80", // 50% opacity gray
    secondary: "#6c757d",
    // Announcement-specific colors
    announcementBadgeDivision: "#007AFF", // Blue for division announcements
    announcementBadgeGCA: "#34C759", // Green for GCA announcements
  },
} as const;
