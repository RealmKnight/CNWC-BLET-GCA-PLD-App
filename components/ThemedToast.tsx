import React from "react";
import Toast, { BaseToast, BaseToastProps } from "react-native-toast-message";
import { Colors } from "@/constants/Colors";
import { useIsomorphicLayoutEffect } from "@/hooks/useIsomorphicLayoutEffect";
import { Platform } from "react-native";

// Define toast config
const toastConfig = {
  info: (props: BaseToastProps) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: Colors.light.tint,
        backgroundColor: Colors.light.background,
      }}
      contentContainerStyle={{ paddingHorizontal: 15 }}
      text1Style={{
        fontSize: 16,
        fontWeight: "600",
        color: Colors.light.text,
      }}
      text2Style={{
        fontSize: 14,
        color: Colors.light.text,
      }}
    />
  ),
};

export function ThemedToast() {
  // Only render Toast on client-side
  if (Platform.OS === "web" && typeof window === "undefined") {
    return null;
  }

  return <Toast config={toastConfig} />;
}
