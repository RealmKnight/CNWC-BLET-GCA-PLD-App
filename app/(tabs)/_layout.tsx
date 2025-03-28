import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import Ionicons from "@expo/vector-icons/Ionicons";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { AppHeader } from "@/components/AppHeader";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <>
      <AppHeader />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarBackground: TabBarBackground,
          tabBarStyle: Platform.select({
            ios: {
              // Use a transparent background on iOS to show the blur effect
              position: "absolute",
            },
            default: {},
          }),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: "Notifications",
            tabBarIcon: ({ color }) => <Ionicons size={28} name="notifications" color={color} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: "Calendar",
            tabBarIcon: ({ color }) => <Ionicons size={28} name="calendar-number-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="mytime"
          options={{
            title: "My Time",
            tabBarIcon: ({ color }) => <Ionicons size={28} name="time-outline" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
