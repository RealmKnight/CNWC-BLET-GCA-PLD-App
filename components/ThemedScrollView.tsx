import React from "react";
import { ScrollView, ScrollViewProps } from "react-native";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

export const ThemedScrollView = React.forwardRef<ScrollView, ScrollViewProps>((props, ref) => {
  useIsomorphicLayoutEffect(() => {
    // This is where any layout effects would go if needed
  }, []);

  return <ScrollView ref={ref} {...props} />;
});
