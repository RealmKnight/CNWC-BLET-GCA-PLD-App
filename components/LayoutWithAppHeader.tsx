import React, { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { AppHeader } from "@/components/AppHeader";

interface LayoutWithAppHeaderProps {
  children: ReactNode;
}

export function LayoutWithAppHeader({ children }: LayoutWithAppHeaderProps) {
  return (
    <View style={styles.container}>
      <AppHeader />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
