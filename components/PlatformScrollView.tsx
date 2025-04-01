import React from "react";
import { ScrollView as RNScrollView, ScrollViewProps, Platform } from "react-native";

let ScrollViewComponent: React.ComponentType<ScrollViewProps>;

if (Platform.OS === "web") {
  ScrollViewComponent = RNScrollView;
} else {
  // Use require for native platforms to avoid web-specific issues
  const { ScrollView } = require("react-native-gesture-handler");
  ScrollViewComponent = ScrollView;
}

export const PlatformScrollView: React.FC<ScrollViewProps> = ({ children, ...props }) => {
  return <ScrollViewComponent {...props}>{children}</ScrollViewComponent>;
};
