import React from "react";
import { TouchableOpacity, TouchableOpacityProps, View } from "react-native";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";

export const ThemedTouchableOpacity = React.forwardRef<View, TouchableOpacityProps>((props, ref) => {
  useIsomorphicLayoutEffect(() => {
    // This is where any layout effects would go if needed
  }, []);

  return <TouchableOpacity ref={ref} {...props} />;
});
