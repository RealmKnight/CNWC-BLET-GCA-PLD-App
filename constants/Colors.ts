/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * Currently defaulting to dark mode with a black and gold theme.
 */

const goldPrimary = "#FFD700";
const goldSecondary = "#DAA520";
const goldAccent = "#B8860B";
const black = "#000000";

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
    buttonBackgroundSecondary: black,
    buttonTextSecondary: goldPrimary,
    buttonBorderSecondary: goldSecondary,
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
  },
};
