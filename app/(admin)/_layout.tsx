import React from "react";
import { Tabs } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { HapticTab } from "@/components/HapticTab";
import { Platform } from "react-native";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Ionicons } from "@expo/vector-icons";

export default function AdminLayout() {
  const { userRole } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  // Only show tabs for application_admin and union_admin
  const showTabs = userRole === "application_admin" || userRole === "union_admin";

  if (!showTabs) {
    return (
      <>
        <AppHeader />
        <Tabs
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tabs.Screen
            name="division_admin"
            options={{
              href: null, // Hide from tab bar
            }}
          />
        </Tabs>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tintColor,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              position: "absolute",
            },
            default: {},
          }),
        }}
      >
        {userRole === "application_admin" && (
          <Tabs.Screen
            name="application_admin"
            options={{
              title: "App Admin",
              tabBarIcon: ({ color, focused }) => (
                <Ionicons name={focused ? "settings" : "settings-outline"} size={28} color={color} />
              ),
            }}
          />
        )}
        <Tabs.Screen
          name="union_admin"
          options={{
            title: "Union Admin",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "business" : "business-outline"} size={28} color={color} />
            ),
            href: userRole === "application_admin" || userRole === "union_admin" ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="division_admin"
          options={{
            title: "Division Admin",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "people" : "people-outline"} size={28} color={color} />
            ),
            href: userRole === "application_admin" || userRole === "union_admin" ? undefined : null,
          }}
        />
      </Tabs>
    </>
  );
}
