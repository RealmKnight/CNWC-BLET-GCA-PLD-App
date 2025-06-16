import React from "react";
import { Stack } from "expo-router";
import { Image } from "react-native";
import { Colors } from "@/constants/Colors";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function CompanyAdminLayout() {
  // Use ProtectedRoute component with admin auth requirement
  return (
    <ProtectedRoute requiredAuth="admin">
      <Stack
        screenOptions={{
          headerShown: true,
          title: "WC BLET PLD/SDV App - CN Admin",
          headerBackVisible: false,
          headerTitleStyle: {
            fontFamily: "Inter",
            fontSize: 16,
            color: Colors.light.text,
          },
          headerStyle: {
            backgroundColor: Colors.light.background,
          },
          headerShadowVisible: false,
          headerTitleAlign: "center",
          headerLeft: () => (
            <Image
              source={require("../../assets/images/BLETblackgold.png")}
              style={{ width: 50, height: 50, marginLeft: 16, resizeMode: "contain" }}
            />
          ),
        }}
      />
    </ProtectedRoute>
  );
}
