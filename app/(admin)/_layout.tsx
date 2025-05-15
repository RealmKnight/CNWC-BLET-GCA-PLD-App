import React from "react";
import { Tabs } from "expo-router";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { HapticTab } from "@/components/HapticTab";
import { Platform, ViewStyle, View } from "react-native";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminMessageBadge } from "@/components/ui/AdminMessageBadge";

export default function AdminLayout() {
  const { userRole } = useAuth();
  const colorScheme = (useColorScheme() ?? "light") as keyof typeof Colors;
  const tintColor = Colors[colorScheme].tint;

  const commonScreenOptions: BottomTabNavigationOptions = {
    tabBarActiveTintColor: tintColor,
    headerShown: false,
    tabBarButton: HapticTab,
    tabBarBackground: TabBarBackground,
    tabBarStyle: Platform.select<ViewStyle>({
      ios: {
        position: "absolute",
      },
      default: {},
    }),
  };

  // Show only division_admin tab for division admins
  if (userRole === "division_admin") {
    return (
      <ProtectedRoute requiredAuth="member">
        <AppHeader />
        <Tabs screenOptions={commonScreenOptions}>
          <Tabs.Screen
            name="division_admin"
            options={{
              title: "Division Admin",
              tabBarIcon: ({ color, focused }) => (
                <View>
                  <Ionicons name={focused ? "people" : "people-outline"} size={28} color={color} />
                  <AdminMessageBadge />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="application_admin"
            options={{
              href: null, // Hide from tab bar
            }}
          />
          <Tabs.Screen
            name="union_admin"
            options={{
              href: null, // Hide from tab bar
            }}
          />
        </Tabs>
      </ProtectedRoute>
    );
  }

  // For application_admin and union_admin roles
  return (
    <ProtectedRoute requiredAuth="member">
      <AppHeader />
      <Tabs screenOptions={commonScreenOptions}>
        <Tabs.Screen
          name="application_admin"
          options={{
            title: "App Admin",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={28} color={color} />
            ),
            href: userRole === "application_admin" ? undefined : null, // Only show for application_admin
          }}
        />
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
              <View>
                <Ionicons name={focused ? "people" : "people-outline"} size={28} color={color} />
                <AdminMessageBadge />
              </View>
            ),
            href: userRole === "application_admin" || userRole === "union_admin" ? undefined : null,
          }}
        />
      </Tabs>
    </ProtectedRoute>
  );
}
