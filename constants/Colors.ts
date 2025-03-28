/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = "#0a7ea4";
const tintColorDark = "#fff";

export const Colors = {
  light: {
    text: "#11181C",
    background: "#CACAACFF",
    tint: tintColorLight,
    icon: "#42627AFF",
    tabIconDefault: "#234057FF",
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: "#F1F148FF",
    background: "#151718",
    tint: tintColorDark,
    icon: "#6E98BAFF",
    tabIconDefault: "#8EB1CEFF",
    tabIconSelected: tintColorDark,
  },
};
