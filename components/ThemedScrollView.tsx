import React from "react";
import { ScrollView, ScrollViewProps, Platform } from "react-native";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

export const ThemedScrollView = React.forwardRef<
  ScrollView,
  ScrollViewProps & {
    enableAndroidOptimizations?: boolean;
  }
>((props, ref) => {
  const { enableAndroidOptimizations = false, ...otherProps } = props;

  useIsomorphicLayoutEffect(() => {
    // This is where any layout effects would go if needed
  }, []);

  const androidProps =
    Platform.OS === "android" && enableAndroidOptimizations
      ? {
          nestedScrollEnabled: true,
          keyboardShouldPersistTaps: "handled" as const,
          showsVerticalScrollIndicator: true,
        }
      : {};

  return <ScrollView ref={ref} {...androidProps} {...otherProps} />;
});
