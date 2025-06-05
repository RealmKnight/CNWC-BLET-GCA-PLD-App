import { Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";

import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { Ionicons } from "@expo/vector-icons";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { AppHeader } from "@/components/AppHeader";
import { useNotificationStore } from "@/store/notificationStore";
import { ThemedText } from "@/components/ThemedText";
import { ProtectedRoute } from "@/components/ProtectedRoute";

type ColorScheme = "light" | "dark";

export default function TabLayout() {
  const colorScheme = (useColorScheme() ?? "light") as ColorScheme;
  const { unreadCount } = useNotificationStore();

  const tintColor = Colors[colorScheme].tint;

  return (
    <ProtectedRoute requiredAuth="member">
      <AppHeader />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tintColor,
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
            tabBarIcon: ({ color, size, focused }) => (
              <View>
                <Ionicons name={focused ? "notifications" : "notifications-outline"} size={size} color={color} />
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      right: -6,
                      top: -3,
                      backgroundColor: tintColor,
                      borderRadius: 12,
                      minWidth: 18,
                      height: 18,
                      justifyContent: "center",
                      alignItems: "center",
                      paddingHorizontal: 4,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: "#FFFFFF",
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </ThemedText>
                  </View>
                )}
              </View>
            ),
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
    </ProtectedRoute>
  );
}
